import './styles.css';
import { T, LAYOUTS, FONT_NAMES, DEFAULT_LAYOUT, FIGURINE_FONTS } from './config.js';
import { parseFile } from './pgn-parser.js';

// ─── State ─────────────────────────────────────────────────────────────
function safeGetItem(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
}
const state = {
  lang: safeGetItem('diagpdf-lang', 'en'),
  theme: safeGetItem('diagpdf-theme', 'dark'),
  positions: [],
  filename: '',
  chapters: [],
  previewPage: 0,
  dirtyFields: new Set(),
};

/** Escape HTML special chars to prevent XSS when building innerHTML */
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── i18n ──────────────────────────────────────────────────────────────
function t(key) {
  const langDict = T[state.lang] || T['en'];
  return langDict[key] || T['en'][key] || key;
}

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = t(key);
    if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'radio') {
      el.placeholder = text;
    } else {
      el.textContent = text;
    }
  });

  // Default localized values for Cover inputs if unmodified by user
  const todayStr = new Date().toLocaleDateString(state.lang === 'ru' ? 'ru-RU' : 'en-US');
  const coverDateInput = document.getElementById('opt-cover-date');
  if (coverDateInput) {
    coverDateInput.value = todayStr;
  }

  const localizableFields = [
    ['opt-cover-title',    'cover_default_title'],
    ['opt-cover-subtitle', 'cover_default_subtitle'],
    ['opt-cover-author',   'cover_default_author'],
    ['opt-toc-title',      'contents'],
    ['opt-answers-title',  'solutions'],
  ];
  localizableFields.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el && !state.dirtyFields.has(id)) {
      el.value = t(key);
    }
  });

  // Update layout select labels
  const layoutSelect = document.getElementById('opt-layout');
  if (layoutSelect) {
    const savedIndex = layoutSelect.selectedIndex;
    const idx = state.lang === 'en' ? 0 : 1;
    layoutSelect.innerHTML = LAYOUTS.map((l, i) =>
      `<option value="${i}" ${i === DEFAULT_LAYOUT ? 'selected' : ''}>${l[idx]}</option>`
    ).join('');
    if (savedIndex >= 0) layoutSelect.selectedIndex = savedIndex;
  }

  // Update lang button text
  const langBtn = document.getElementById('btn-lang');
  if (langBtn) langBtn.textContent = t('lang_btn');
}

// ─── Theme ─────────────────────────────────────────────────────────────
function applyTheme() {
  document.documentElement.classList.toggle('dark', state.theme === 'dark');
}

// ─── File handling ─────────────────────────────────────────────────────
function handleFile(file) {
  if (!file) return;
  state.filename = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    state.positions = parseFile(e.target.result, file.name);
    // Reset chapters when loading new file with single full range chapter if needed
    state.chapters = [];
    renderChapters();
    state.previewPage = 0;
    const pageInput = document.getElementById('preview-page-input');
    if (pageInput) pageInput.value = 1;
    updateFileStatus();
    updateGenerateButton();
    refreshPreview();
  };
  reader.readAsText(file);
}

function updateFileStatus() {
  const el = document.getElementById('file-status');
  if (!el) return;
  if (state.positions.length > 0) {
    const tmpl = t('positions_loaded');
    el.textContent = `${state.filename} — ${tmpl.replace('{n}', state.positions.length)}`;
    el.classList.remove('text-gray-500', 'dark:text-gray-400');
    el.classList.add('text-green-600', 'dark:text-green-400');
  } else {
    el.textContent = t('no_file');
    el.classList.remove('text-green-600', 'dark:text-green-400');
    el.classList.add('text-gray-500', 'dark:text-gray-400');
  }
}

function updateGenerateButton() {
  const btn = document.getElementById('btn-generate');
  if (btn) btn.disabled = state.positions.length === 0;
}

// ─── Chapters ──────────────────────────────────────────────────────────
function addChapter(parentId = null) {
  const total = state.positions.length || 100;
  const id = Date.now();

  if (parentId !== null) {
    // Add subchapter inside parent chapter
    const parent = state.chapters.find(c => c.id === parentId);
    if (!parent) return;
    if (!parent.subchapters) parent.subchapters = [];

    let from = parent.from;
    if (parent.subchapters.length > 0) {
      const lastTo = parent.subchapters[parent.subchapters.length - 1].to;
      from = Math.min(lastTo + 1, parent.to);
    }
    const to = parent.to;
    const subNum = `${parent.subchapters.length + 1}`;
    const defaultName = `${t('subchapter_name')} ${subNum}`;
    parent.subchapters.push({ id, name: defaultName, from, to });
  } else {
    // Add top-level chapter
    let from = 1;
    if (state.chapters.length > 0) {
      const lastTo = state.chapters[state.chapters.length - 1].to;
      from = Math.min(lastTo + 1, total);
    }
    const to = total;
    const chapterNum = state.chapters.length + 1;
    const defaultName = `${t('chapter_prefix')} ${chapterNum}`;
    state.chapters.push({ id, name: defaultName, from, to, subchapters: [] });
  }

  renderChapters();
  refreshPreview();
}

function removeChapter(id, parentId = null) {
  if (parentId !== null) {
    const parent = state.chapters.find(c => c.id === parentId);
    if (parent && parent.subchapters) {
      parent.subchapters = parent.subchapters.filter(sc => sc.id !== id);
    }
  } else {
    state.chapters = state.chapters.filter(c => c.id !== id);
  }
  renderChapters();
  refreshPreview();
}

function renderChapters() {
  const list = document.getElementById('chapters-list');
  const addBtn = document.getElementById('btn-add-chapter');
  const total = state.positions.length || 100;

  if (addBtn) addBtn.disabled = false;
  if (!list) return;

  const activeEl = document.activeElement;
  let focusId = null;
  let focusClass = null;
  let focusSelStart = null;
  let focusSelEnd = null;

  if (activeEl && list.contains(activeEl)) {
    const item = activeEl.closest('[data-id]');
    if (item) {
      focusId = item.dataset.id;
      if (activeEl.classList.contains('chapter-name')) focusClass = 'chapter-name';
      else if (activeEl.classList.contains('chapter-from')) focusClass = 'chapter-from';
      else if (activeEl.classList.contains('chapter-to')) focusClass = 'chapter-to';

      try {
        focusSelStart = activeEl.selectionStart;
        focusSelEnd = activeEl.selectionEnd;
      } catch (e) {}
    }
  }

  let html = '';
  state.chapters.forEach((ch, chIdx) => {
    const eName = escHtml(ch.name);
    html += `
      <div class="chapter-card p-2 bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-2">
        <div class="chapter-item flex items-center gap-2" data-id="${ch.id}">
          <span class="text-xs font-bold text-gray-500 w-5 text-center select-none">${chIdx + 1}.</span>
          <input type="text" value="${eName}" placeholder="${t('chapter_name')}" class="chapter-name input flex-1 text-xs font-medium px-2.5 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg" title="${t('chapter_name')}">
          <div class="flex items-center gap-1 shrink-0 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg p-1">
            <input type="number" value="${ch.from}" min="1" max="${total}" class="chapter-from w-11 text-center text-xs font-semibold bg-transparent outline-none" title="${t('chapter_from')}">
            <span class="text-gray-400 font-bold text-xs select-none">–</span>
            <input type="number" value="${ch.to}" min="1" max="${total}" class="chapter-to w-11 text-center text-xs font-semibold bg-transparent outline-none" title="${t('chapter_to')}">
          </div>
          <button class="btn-add-sub shrink-0 px-2 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors cursor-pointer" data-add-sub="${ch.id}" title="${t('add_subchapter')}">
            ${t('add_subchapter')}
          </button>
          <button class="btn-remove shrink-0 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors cursor-pointer" data-remove="${ch.id}" title="Remove chapter">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>`;

    if (ch.subchapters && ch.subchapters.length > 0) {
      html += `<div class="subchapters-list pl-6 space-y-1.5 border-l-2 border-indigo-200 dark:border-indigo-800 ml-2">`;
      ch.subchapters.forEach((sc, scIdx) => {
        const eScName = escHtml(sc.name);
        html += `
          <div class="subchapter-item flex items-center gap-2" data-id="${sc.id}" data-parent-id="${ch.id}">
            <span class="text-xs font-medium text-gray-400 w-6 text-center select-none">${chIdx + 1}.${scIdx + 1}</span>
            <input type="text" value="${eScName}" placeholder="${t('subchapter_name')}" class="chapter-name input flex-1 text-xs px-2 py-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md">
            <div class="flex items-center gap-1 shrink-0 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md p-0.5">
              <input type="number" value="${sc.from}" min="${ch.from}" max="${ch.to}" class="chapter-from w-10 text-center text-xs font-medium bg-transparent outline-none">
              <span class="text-gray-400 text-xs select-none">–</span>
              <input type="number" value="${sc.to}" min="${ch.from}" max="${ch.to}" class="chapter-to w-10 text-center text-xs font-medium bg-transparent outline-none">
            </div>
            <button class="btn-remove shrink-0 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md cursor-pointer" data-remove-sub="${sc.id}" data-parent-id="${ch.id}">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  });

  list.innerHTML = html;

  // Bind main chapter events
  list.querySelectorAll('.chapter-item').forEach((item) => {
    const id = parseInt(item.dataset.id);
    const chIndex = state.chapters.findIndex(c => c.id === id);
    const ch = state.chapters[chIndex];
    if (!ch) return;

    item.querySelector('.chapter-name').addEventListener('input', e => {
      ch.name = e.target.value;
      refreshPreview();
    });

    item.querySelector('.chapter-from').addEventListener('input', e => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val)) return;
      ch.from = Math.max(1, Math.min(val, total));
      if (ch.to < ch.from) ch.to = ch.from;
      if (ch.subchapters && ch.subchapters.length > 0) {
        ch.subchapters.forEach(sc => {
          sc.from = Math.max(ch.from, Math.min(sc.from, ch.to));
          sc.to = Math.max(sc.from, Math.min(sc.to, ch.to));
        });
      }
      refreshPreview();
    });

    item.querySelector('.chapter-from').addEventListener('change', e => {
      let newFrom = parseInt(e.target.value, 10) || 1;
      const minAllowed = chIndex > 0 ? state.chapters[chIndex - 1].to + 1 : 1;
      if (newFrom < minAllowed) newFrom = minAllowed;
      if (newFrom > total) newFrom = total;
      ch.from = newFrom;
      if (ch.to < ch.from) ch.to = ch.from;

      if (ch.subchapters && ch.subchapters.length > 0) {
        ch.subchapters.forEach(sc => {
          sc.from = Math.max(ch.from, Math.min(sc.from, ch.to));
          sc.to = Math.max(sc.from, Math.min(sc.to, ch.to));
        });
      }

      renderChapters();
      refreshPreview();
    });

    item.querySelector('.chapter-to').addEventListener('change', e => {
      let newTo = parseInt(e.target.value, 10) || ch.from;
      if (newTo < ch.from) newTo = ch.from;
      if (newTo > total) newTo = total;
      ch.to = newTo;

      // Clamp ALL subchapters to fit within updated parent boundaries
      if (ch.subchapters && ch.subchapters.length > 0) {
        ch.subchapters.forEach(sc => {
          sc.from = Math.max(ch.from, Math.min(sc.from, ch.to));
          sc.to = Math.max(sc.from, Math.min(sc.to, ch.to));
        });
      }

      for (let i = chIndex + 1; i < state.chapters.length; i++) {
        const nextCh = state.chapters[i];
        const prevTo = state.chapters[i - 1].to;
        if (nextCh.from <= prevTo) {
          nextCh.from = prevTo + 1;
          if (nextCh.to < nextCh.from) nextCh.to = Math.min(nextCh.from, total);
          if (nextCh.to < nextCh.from) nextCh.to = nextCh.from;
        }
      }
      renderChapters();
      refreshPreview();
    });

    item.querySelector('[data-add-sub]').addEventListener('click', () => addChapter(id));
    item.querySelector('[data-remove]').addEventListener('click', () => removeChapter(id));
  });

  // Bind subchapter events
  list.querySelectorAll('.subchapter-item').forEach((item) => {
    const scId = parseInt(item.dataset.id);
    const parentId = parseInt(item.dataset.parentId);
    const parent = state.chapters.find(c => c.id === parentId);
    if (!parent || !parent.subchapters) return;
    const scIndex = parent.subchapters.findIndex(s => s.id === scId);
    const sc = parent.subchapters[scIndex];
    if (!sc) return;

    item.querySelector('.chapter-name').addEventListener('input', e => {
      sc.name = e.target.value;
      refreshPreview();
    });

    item.querySelector('.chapter-from').addEventListener('change', e => {
      let newFrom = parseInt(e.target.value, 10) || parent.from;
      const minAllowed = scIndex > 0 ? parent.subchapters[scIndex - 1].to + 1 : parent.from;
      if (newFrom < minAllowed) newFrom = minAllowed;
      if (newFrom > parent.to) newFrom = parent.to;
      sc.from = newFrom;
      if (sc.to < sc.from) sc.to = sc.from;
      renderChapters();
      refreshPreview();
    });

    item.querySelector('.chapter-to').addEventListener('change', e => {
      let newTo = parseInt(e.target.value, 10) || sc.from;
      if (newTo < sc.from) newTo = sc.from;
      if (newTo > parent.to) newTo = parent.to;
      sc.to = newTo;

      for (let i = scIndex + 1; i < parent.subchapters.length; i++) {
        const nextSc = parent.subchapters[i];
        const prevTo = parent.subchapters[i - 1].to;
        if (nextSc.from <= prevTo) {
          nextSc.from = prevTo + 1;
          if (nextSc.to < nextSc.from) nextSc.to = Math.min(nextSc.from, parent.to);
          if (nextSc.to < nextSc.from) nextSc.to = nextSc.from;
        }
      }
      renderChapters();
      refreshPreview();
    });

    item.querySelector('[data-remove-sub]').addEventListener('click', () => removeChapter(scId, parentId));
  });

  if (focusId && focusClass) {
    const item = list.querySelector(`.chapter-item[data-id="${focusId}"]`);
    if (item) {
      const el = item.querySelector(`.${focusClass}`);
      if (el) {
        el.focus();
        try {
          if (focusSelStart !== null) {
            el.setSelectionRange(focusSelStart, focusSelEnd);
          }
        } catch (e) {}
      }
    }
  }
}

// ─── Toggle sections ───────────────────────────────────────────────────
function setupToggles() {
  const toggles = [
    ['opt-cover-enable', 'cover-fields'],
    ['opt-toc-enable', 'toc-fields'],
    ['opt-answers-enable', 'answers-fields'],
  ];
  toggles.forEach(([checkboxId, fieldsId]) => {
    const cb = document.getElementById(checkboxId);
    const fields = document.getElementById(fieldsId);
    if (cb && fields) {
      cb.addEventListener('change', () => {
        fields.classList.toggle('hidden', !cb.checked);
        const card = cb.closest('.card');
        if (card && cb.checked) {
          card.classList.remove('collapsed');
        }
      });
    }
  });

  // Accordion card header toggle handlers
  document.querySelectorAll('.card-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.toggle')) return;
      const card = header.closest('.card');
      if (card) {
        card.classList.toggle('collapsed');
      }
    });
  });

  // Title custom input enable/disable based on select
  const titleModeSelect = document.getElementById('opt-title-mode');
  const customInput = document.getElementById('opt-title-custom');
  if (titleModeSelect && customInput) {
    titleModeSelect.addEventListener('change', () => {
      customInput.classList.toggle('hidden', titleModeSelect.value !== 'custom');
    });
  }
}

// ─── Preview ───────────────────────────────────────────────────────────
let pdfTotalPages = 1;
let refreshTimer = null;

function refreshPreview() {
  if (state.positions.length === 0) return;
  
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    const canvas = document.getElementById('preview-canvas');
    if (!canvas) return;

    try {
      const { generatePdfBlob } = await import('./pdf-generator.js');
      const { renderPdfPreview } = await import('./pdf-preview.js');
      const options = getPdfOptions();
      const blob = await generatePdfBlob(state.positions, options);

      const result = await renderPdfPreview(blob, state.previewPage, canvas);
      if (result && result.totalPages) {
        pdfTotalPages = result.totalPages;
        updatePreviewDots();
      }
    } catch (e) {
      console.error('Preview render error:', e);
    }
  }, 500);
}

function updatePreviewDots() {
  const pageInput = document.getElementById('preview-page-input');
  const pageTotal = document.getElementById('preview-page-total');
  
  if (pageInput) {
    pageInput.value = state.previewPage + 1;
    pageInput.max = pdfTotalPages;
  }
  if (pageTotal) {
    pageTotal.textContent = pdfTotalPages;
  }

  const prevBtn = document.getElementById('btn-prev-page');
  const nextBtn = document.getElementById('btn-next-page');
  if (prevBtn) prevBtn.disabled = state.previewPage <= 0;
  if (nextBtn) nextBtn.disabled = state.previewPage >= pdfTotalPages - 1;
}

function getPdfOptions() {
  return {
    layoutIdx: parseInt(document.getElementById('opt-layout')?.value || '2'),
    boardFont: document.getElementById('opt-font')?.value || 'AlphaDG',
    showCoords: document.getElementById('opt-coords')?.checked ?? true,
    symbol: document.getElementById('opt-symbol')?.value || 'square',
    orientation: document.getElementById('opt-orient')?.value || 'auto',
    titleMode: document.getElementById('opt-title-mode')?.value || 'number',
    customTitle: document.getElementById('opt-title-custom')?.value || '',
    cover: {
      enable: document.getElementById('opt-cover-enable')?.checked || false,
      title: document.getElementById('opt-cover-title')?.value ?? '',
      subtitle: document.getElementById('opt-cover-subtitle')?.value ?? '',
      author: document.getElementById('opt-cover-author')?.value ?? '',
      date: document.getElementById('opt-cover-date')?.value ?? ''
    },
    toc: {
      enable: document.getElementById('opt-toc-enable')?.checked || false,
      title: document.getElementById('opt-toc-title')?.value || t('contents')
    },
    chapters: state.chapters,
    diagramsTitle: t('diagrams_toc'),
    notationLinesCount: parseInt(document.getElementById('opt-lines-count')?.value || '0'),
    notationLinesMode: document.getElementById('opt-lines-mode')?.value || 'plain',
    lichessLinks: document.getElementById('opt-lichess')?.checked || false,
    answers: {
      enable: document.getElementById('opt-answers-enable')?.checked || false,
      title: document.getElementById('opt-answers-title')?.value || t('solutions'),
      cols: document.getElementById('opt-answers-cols')?.value || '1',
      figurineFont: document.getElementById('opt-figurine-font')?.value || 'AlphaDG'
    }
  };
}

const SETTINGS_KEY = 'diagpdf-settings';

function saveSettings() {
  try {
    const opts = getPdfOptions();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(opts));
  } catch (e) {
    console.error('Error saving settings to localStorage:', e);
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const opts = JSON.parse(raw);
    if (!opts || typeof opts !== 'object') return;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };
    const setCheck = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.checked = !!val;
    };

    setVal('opt-layout', opts.layoutIdx);
    setVal('opt-font', opts.boardFont);
    setCheck('opt-coords', opts.showCoords);
    setVal('opt-symbol', opts.symbol);
    setVal('opt-orient', opts.orientation);
    setVal('opt-title-mode', opts.titleMode);
    setVal('opt-title-custom', opts.customTitle);

    if (opts.cover) {
      setCheck('opt-cover-enable', opts.cover.enable);
      setVal('opt-cover-title', opts.cover.title);
      setVal('opt-cover-subtitle', opts.cover.subtitle);
      setVal('opt-cover-author', opts.cover.author);
      setVal('opt-cover-date', opts.cover.date);
      if (opts.cover.enable) {
        document.getElementById('cover-fields')?.classList.remove('hidden');
      }
    }

    if (opts.toc) {
      setCheck('opt-toc-enable', opts.toc.enable);
      const tocTitleVal = (opts.toc.title === 'Содержание') ? t('contents') : opts.toc.title;
      setVal('opt-toc-title', tocTitleVal);
      if (opts.toc.enable) {
        document.getElementById('toc-fields')?.classList.remove('hidden');
      }
    }

    setVal('opt-lines-count', opts.notationLinesCount);
    setVal('opt-lines-mode', opts.notationLinesMode);
    setCheck('opt-lichess', opts.lichessLinks);

    if (opts.answers) {
      setCheck('opt-answers-enable', opts.answers.enable);
      setVal('opt-answers-title', opts.answers.title);
      setVal('opt-answers-cols', opts.answers.cols);
      setVal('opt-figurine-font', opts.answers.figurineFont);
      if (opts.answers.enable) {
        document.getElementById('answers-fields')?.classList.remove('hidden');
      }
    }

    // Toggle custom title visibility
    const customInput = document.getElementById('opt-title-custom');
    if (customInput) {
      customInput.classList.toggle('hidden', opts.titleMode !== 'custom');
    }
  } catch (e) {
    console.error('Error loading settings from localStorage:', e);
  }
}

// ─── Init ──────────────────────────────────────────────────────────────
function init() {
  applyTheme();
  applyLang();
  loadSettings();
  setupToggles();
  updateGenerateButton();

  // Theme toggle
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('diagpdf-theme', state.theme);
    applyTheme();
  });

  // Language toggle
  document.getElementById('btn-lang')?.addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'ru' : 'en';
    localStorage.setItem('diagpdf-lang', state.lang);
    applyLang();
  });

  // File input
  const fileInput = document.getElementById('file-input');
  const dropZone = document.getElementById('drop-zone');

  dropZone?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (e) => handleFile(e.target.files[0]));

  // Drag and drop
  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  });

  // Add chapter button
  document.getElementById('btn-add-chapter')?.addEventListener('click', () => addChapter());

  // Generate button
  document.getElementById('btn-generate')?.addEventListener('click', async () => {
    if (state.positions.length === 0) return;
    const btn = document.getElementById('btn-generate');
    try {
      if (btn) btn.disabled = true;
      const { generatePdfBlob } = await import('./pdf-generator.js');
      const blob = await generatePdfBlob(state.positions, getPdfOptions());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = state.filename.replace(/\.[^/.]+$/, "") + "_diagrams.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Error generating PDF.');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById('btn-prev-page')?.addEventListener('click', () => {
    if (state.previewPage > 0) {
      state.previewPage--;
      updatePreviewDots();
      refreshPreview();
    }
  });

  document.getElementById('btn-next-page')?.addEventListener('click', () => {
    if (state.previewPage < pdfTotalPages - 1) {
      state.previewPage++;
      updatePreviewDots();
      refreshPreview();
    }
  });

  const pageInputEl = document.getElementById('preview-page-input');
  if (pageInputEl) {
    const handlePageJump = () => {
      let requested = parseInt(pageInputEl.value) || 1;
      if (requested < 1) requested = 1;
      if (requested > pdfTotalPages) requested = pdfTotalPages;
      state.previewPage = requested - 1;
      updatePreviewDots();
      refreshPreview();
    };
    pageInputEl.addEventListener('change', handlePageJump);
    pageInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handlePageJump();
    });
  }

  // Live update preview on option changes & save to localStorage
  const autoUpdateSelectors = [
    '#opt-layout', '#opt-font', '#opt-coords', '#opt-symbol', '#opt-orient',
    '#opt-lines-count', '#opt-lines-mode', '#opt-title-mode', '#opt-title-custom',
    '#opt-cover-enable', '#opt-cover-title', '#opt-cover-subtitle', '#opt-cover-author', '#opt-cover-date',
    '#opt-toc-enable', '#opt-toc-title', '#opt-answers-enable', '#opt-answers-title',
    '#opt-answers-cols', '#opt-figurine-font', '#opt-lichess'
  ];

  let saveTimer = null;
  const debouncedSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveSettings(), 400);
  };

  // Mark localizable fields dirty on user edit
  const localizableIds = ['opt-cover-title', 'opt-cover-subtitle', 'opt-cover-author', 'opt-toc-title', 'opt-answers-title'];
  localizableIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => state.dirtyFields.add(id));
  });

  autoUpdateSelectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) {
      const handler = () => {
        debouncedSave();
        refreshPreview();
      };
      el.addEventListener('change', handler);
      if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
        el.addEventListener('input', handler);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
