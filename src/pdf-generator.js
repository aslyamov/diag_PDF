import { jsPDF } from 'jspdf';
import { LAYOUTS, FONT_FILES, FIGURINE_FILES } from './config.js';
import { fenToDiagram, chessStr } from './board-renderer.js';

const fontCache = {};

async function loadFontIntoDoc(doc, file, fontName) {
  let b64 = fontCache[file];
  if (b64 === undefined) {
    try {
      const url = `${import.meta.env.BASE_URL}fonts/${file}`;
      const res = await fetch(url);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && !contentType.includes('text/html')) {
        const blob = await res.blob();
        b64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        fontCache[file] = b64;
      } else {
        fontCache[file] = false;
        b64 = false;
      }
    } catch (e) {
      console.warn(`Could not load font ${file}:`, e);
      fontCache[file] = false;
      b64 = false;
    }
  }
  
  if (b64) {
    doc.addFileToVFS(file, b64);
    doc.addFont(file, fontName, 'normal');
    doc.addFont(file, fontName, 'bold'); 
    return true;
  }
  return false;
}

function setTextFont(doc, style = 'normal') {
  if (fontCache['Roboto-Regular.ttf']) {
    doc.setFont('Roboto', style);
  } else {
    doc.setFont('Helvetica', style);
  }
}

export async function generatePdfBlob(positions, options = {}) {
  const {
    layoutIdx = 2,
    boardFont = 'AlphaDG',
    showCoords = true,
    symbol = 'square',
    cover = { enable: false, title: '', subtitle: '', author: '', date: '' },
    toc = { enable: false, title: 'Contents' },
    chapters = [],
    headerText = '',
    footerText = '',
    showFooter = true,
    orientation = 'auto',
    titleMode = 'number'
  } = options;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const boardFile = FONT_FILES[boardFont] || 'AlphaDG.ttf';
  const hasCustomFont = await loadFontIntoDoc(doc, boardFile, boardFont);
  const activeFontName = hasCustomFont ? boardFont : 'Courier';

  // Load text font (Roboto)
  await loadFontIntoDoc(doc, 'Roboto-Regular.ttf', 'Roboto');

  // Load figurine font if enabled
  let ansFontName = 'Roboto';
  const figFile = FIGURINE_FILES[options.answers?.figurineFont];
  if (options.answers?.enable && figFile) {
    const figFont = options.answers.figurineFont;
    const hasFig = await loadFontIntoDoc(doc, figFile, figFont);
    if (hasFig) ansFontName = figFont;
  }
  if (!fontCache['Roboto-Regular.ttf'] && ansFontName === 'Roboto') {
    ansFontName = 'Helvetica'; // fallback
  }

  const layout = LAYOUTS[layoutIdx] || LAYOUTS[2];
  const [,, cols, rowsPlain, rowsLined, fontPt, titlePt, titleOffset] = layout;
  const rows = (options.notationLinesCount > 0) ? rowsLined : rowsPlain;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  let currentPage = 1;

  // 1. Cover Page
  if (cover.enable) {
    if (cover.title) {
      setTextFont(doc, 'bold');
      doc.setFontSize(28);
      doc.text(cover.title, pageWidth / 2, pageHeight / 3, { align: 'center' });
    }

    if (cover.subtitle) {
      setTextFont(doc, 'normal');
      doc.setFontSize(16);
      doc.text(cover.subtitle, pageWidth / 2, pageHeight / 3 + 40, { align: 'center' });
    }

    if (cover.author || cover.date) {
      setTextFont(doc, 'normal');
      doc.setFontSize(12);
      let bottomY = pageHeight - 110;
      if (cover.author) {
        doc.text(cover.author, pageWidth / 2, bottomY, { align: 'center' });
        bottomY += 20;
      }
      if (cover.date) {
        doc.text(cover.date, pageWidth / 2, bottomY, { align: 'center' });
      }
    }

    doc.addPage();
    currentPage++;
  }

  // 2. Table of Contents Placeholder
  let tocPageNum = 0;
  const itemsToRender = chapters.length > 0 
    ? chapters.map((ch, idx) => ({ name: ch.name || `Chapter ${idx + 1}`, range: `pos. ${ch.from}-${ch.to}` }))
    : [{ name: 'All Diagrams', range: `pos. 1-${positions.length}` }];
  const tocEntries = [];

  if (toc.enable) {
    tocPageNum = currentPage;
    // We will draw TOC contents at the very end
    doc.addPage();
    currentPage++;
  }

  // 3. Render Diagrams
  const itemsPerPage = cols * rows;
  const marginX = 40;
  const marginY = 50;
  const gridW = (pageWidth - marginX * 2) / cols;
  const gridH = (pageHeight - marginY * 2) / rows;

  // Flatten chapters and subchapters into a linear rendering list with hierarchy metadata
  let chaptersToRender = [];
  if (chapters && chapters.length > 0) {
    chapters.forEach((ch, chIdx) => {
      if (ch.subchapters && ch.subchapters.length > 0) {
        // Enforce subchapters stay within parent chapter boundaries
        ch.subchapters.forEach((sc, scIdx) => {
          const from = Math.max(ch.from, Math.min(sc.from, ch.to));
          const to = Math.min(ch.to, Math.max(sc.to, from));
          chaptersToRender.push({
            name: `${ch.name} — ${sc.name}`,
            parentName: ch.name,
            subName: sc.name,
            chapterNum: `${chIdx + 1}.${scIdx + 1}`,
            chIdx,
            scIdx,
            from,
            to,
            isSubchapter: true
          });
        });
      } else {
        chaptersToRender.push({
          name: ch.name,
          parentName: ch.name,
          chapterNum: `${chIdx + 1}`,
          chIdx,
          scIdx: -1,
          from: ch.from,
          to: ch.to,
          isSubchapter: false
        });
      }
    });
  } else {
    chaptersToRender = [{ name: '', parentName: '', chapterNum: '1', chIdx: 0, scIdx: -1, from: 1, to: positions.length, isSubchapter: false }];
  }

  const drawFooter = () => {
    const prevFont = doc.getFont();
    const prevSize = doc.getFontSize();
    setTextFont(doc, 'normal');
    doc.setFontSize(9);
    doc.text(`${currentPage}`, pageWidth / 2, pageHeight - 18, { align: 'center' });
    if (prevFont) doc.setFont(prevFont.fontName, prevFont.fontStyle);
    if (prevSize) doc.setFontSize(prevSize);
  };

  const drawHeader = (chName) => {
    if (chName) {
      const prevFont = doc.getFont();
      const prevSize = doc.getFontSize();
      setTextFont(doc, 'normal');
      doc.setFontSize(10);
      doc.text(chName, pageWidth / 2, marginY - 20, { align: 'center' });
      if (prevFont) doc.setFont(prevFont.fontName, prevFont.fontStyle);
      if (prevSize) doc.setFontSize(prevSize);
    }
  };

  let globalPosIdx = 0;
  const renderedPositions = [];

  for (let cItemIdx = 0; cItemIdx < chaptersToRender.length; cItemIdx++) {
    const ch = chaptersToRender[cItemIdx];
    const chPositions = positions.slice(ch.from - 1, ch.to);
    
    if (chPositions.length === 0) {
      tocEntries.push(null);
      continue;
    }

    if (cItemIdx > 0) {
      drawFooter();
      doc.addPage();
      currentPage++;
    }

    const chapterStartPage = currentPage;
    tocEntries.push({ page: chapterStartPage, item: ch });

    drawHeader(ch.name);

    for (let i = 0; i < chPositions.length; i++) {
      const pos = chPositions[i];
      const pageItemIdx = i % itemsPerPage;
      
      if (i > 0 && pageItemIdx === 0) {
        drawFooter();
        doc.addPage();
        currentPage++;
        drawHeader(ch.name);
      }

      const col = pageItemIdx % cols;
      const row = Math.floor(pageItemIdx / cols);

      const x = marginX + col * gridW + gridW / 2;

      let flip = false;
      let flipAuto = true;
      if (orientation === 'white') { flipAuto = false; flip = false; }
      else if (orientation === 'black') { flipAuto = false; flip = true; }

      const lines = fenToDiagram(pos.fen, { coords: showCoords, symbol, flip, flipAuto });

      // Calculate exact total vertical height needed and scale diagram size appropriately
      const linesCount = options.notationLinesCount || 0;
      const titleMargin = 20;
      const bottomPadding = 15;
      const availableH = gridH - titleMargin - bottomPadding;
      
      // Height = 10 lines of diagram * (fontPt * 0.95) + linesCount * lineSpacing
      // Desired lineSpacing is ~14pt (or at least 12pt)
      const lineSpacing = 14;
      const maxDiagH = availableH - (linesCount * lineSpacing);

      let effectiveFontPt = fontPt;
      if (10 * (fontPt * 0.95) > maxDiagH) {
        effectiveFontPt = Math.max(10, Math.floor(maxDiagH / (10 * 0.95)));
      }

      // Vertically position top of diagram in the grid
      const actualDiagH = 10 * (effectiveFontPt * 0.95);
      const totalBlockH = actualDiagH + (linesCount > 0 ? (linesCount * lineSpacing + 6) : 0);
      const cellStartY = marginY + row * gridH;
      const topOffset = Math.max(25, (gridH - totalBlockH) / 2);
      const y = cellStartY + topOffset;

      doc.setFont(activeFontName, 'normal');
      doc.setFontSize(effectiveFontPt);

      let boxWidth = 0;
      lines.forEach((line, lineIdx) => {
        const textToRender = hasCustomFont ? chessStr(line) : line;
        const lineWidth = doc.getTextWidth(textToRender);
        if (lineWidth > boxWidth) boxWidth = lineWidth;

        doc.text(textToRender, x, y + lineIdx * (effectiveFontPt * 0.95), { align: 'center' });
      });

      if (options.lichessLinks && pos.fen) {
        const fenForUrl = pos.fen.replace(/ /g, '_');
        const fenParts = pos.fen.split(/\s+/);
        const color = (fenParts.length > 1 && fenParts[1] === 'b') ? 'black' : 'white';
        const fenUrl = `https://lichess.org/analysis/${fenForUrl}?color=${color}`;
        const indicatorY = y + (lines.length - 2) * (effectiveFontPt * 0.95) - effectiveFontPt * 0.5;
        const indicatorX = x + boxWidth / 2 - effectiveFontPt;
        doc.link(indicatorX, indicatorY, effectiveFontPt, effectiveFontPt, { url: fenUrl });
      }

      // Diagram title / number
      let titleStr = `${globalPosIdx + 1}`;
      if (titleMode === 'chapter_number') {
        titleStr = `${ch.chapterNum}.${i + 1}`;
      } else if (titleMode === 'comment') {
        titleStr = pos.comment || `${globalPosIdx + 1}`;
      } else if (titleMode === 'custom') {
        titleStr = options.customTitle || `${globalPosIdx + 1}`;
      }

      setTextFont(doc, 'normal');
      doc.setFontSize(titlePt || 10);
      doc.text(titleStr, x, y - 8 + (titleOffset || 0), { align: 'center' });

      // Notation lines / blank lines below diagram
      const isNumbered = options.notationLinesMode === 'numbered';
      if (linesCount > 0) {
        const fenPartsM = pos.fen ? pos.fen.split(/\s+/) : [];
        const isBlackToMove = fenPartsM.length > 1 && fenPartsM[1] === 'b';
        setTextFont(doc, 'normal');
        doc.setFontSize(8);
        
        const startY = y + lines.length * (effectiveFontPt * 0.95) + 8;
        const lineSpacing = 14;
        
        // Exact inner board width (8 board cells out of 10 total diagram width)
        const cellPt = effectiveFontPt;
        const innerBoardWidth = 8 * cellPt;
        
        // Center lines exactly under the 8 cells
        const leftX = x - innerBoardWidth / 2;
        const gap = 8;
        const colW = (innerBoardWidth - gap) / 2;
        
        for (let l = 1; l <= linesCount; l++) {
          const lineY = startY + (l - 1) * lineSpacing;
          const numPrefix = isNumbered ? `${l}. ` : '';
          const prefixW = isNumbered ? doc.getTextWidth(numPrefix) : 0;
          
          // White move column (Left) - skip line for 1st move if black to move
          if (l > 1 || !isBlackToMove) {
            if (isNumbered) {
              doc.text(numPrefix, leftX, lineY);
            }
            doc.setDrawColor(0);
            doc.setLineWidth(1.0);
            doc.line(leftX + prefixW, lineY + 1, leftX + colW, lineY + 1);
          } else if (isNumbered) {
            // Still render "1. " label even if white move line is omitted when black to move
            doc.text(numPrefix, leftX, lineY);
          }

          // Black move column (Right)
          const rightX = leftX + colW + gap;
          doc.setDrawColor(0);
          doc.setLineWidth(1.0);
          doc.line(rightX, lineY + 1, leftX + innerBoardWidth, lineY + 1);
        }
      }
      
      renderedPositions.push({ globalIdx: globalPosIdx, pos });
      globalPosIdx++;
    }
    
    // After the chapter ends, if it's the last chapter, draw footer
    if (cItemIdx === chaptersToRender.length - 1) {
      drawFooter();
    }
  }

  // 4. Solutions / Answers Section
  const answersOpt = options.answers || {};
  let answersStartPage = 0;

  if (answersOpt.enable) {
    doc.addPage();
    currentPage++; 
    answersStartPage = currentPage;

    setTextFont(doc, 'bold');
    doc.setFontSize(18);
    doc.text(answersOpt.title || 'Solutions', pageWidth / 2, 60, { align: 'center' });

    const ansCols = parseInt(answersOpt.cols, 10) || 1;
    const marginX = 40;
    const startY = 90;
    const maxY = pageHeight - 60;
    const colWidth = (pageWidth - marginX * 2 - (ansCols - 1) * 20) / ansCols;
    const baseFontSize = 10;
    const baseLineHeight = 14;

    let answersPositions = renderedPositions;

    // We process entries flowingly per column / page
    let currentCol = 0;
    let currentY = startY;

    answersPositions.forEach((item) => {
      const { globalIdx, pos } = item;
      const solutionText = pos.moves || pos.comment || pos.fen || '—';
      
      // Calculate how many lines of text this entry will take
      setTextFont(doc, 'normal');
      doc.setFontSize(baseFontSize);
      const prefix = `${globalIdx + 1}. `;
      const prefixW = doc.getTextWidth(prefix);

      doc.setFont(ansFontName, 'normal');
      doc.setFontSize(baseFontSize);
      const textLines = doc.splitTextToSize(solutionText, colWidth - prefixW);
      const entryHeight = textLines.length * baseLineHeight + 4; // 4pt gap between questions

      // Check if entry fits in current column
      if (currentY + entryHeight > maxY && currentY > startY) {
        currentCol++;
        if (currentCol >= ansCols) {
          drawFooter();
          doc.addPage();
          currentPage++;
          setTextFont(doc, 'bold');
          doc.setFontSize(18);
          doc.text(answersOpt.title || 'Solutions', pageWidth / 2, 60, { align: 'center' });
          currentCol = 0;
        }
        currentY = startY;
      }

      const ansX = marginX + currentCol * (colWidth + 20);

      // Draw number prefix
      setTextFont(doc, 'normal');
      doc.setFontSize(baseFontSize);
      doc.text(prefix, ansX, currentY);

      // Draw solution text lines
      doc.setFont(ansFontName, 'normal');
      doc.setFontSize(baseFontSize);
      textLines.forEach((line, lIdx) => {
        doc.text(line, ansX + prefixW, currentY + lIdx * baseLineHeight);
      });

      currentY += entryHeight;
      if (currentY > maxY) {
        currentCol++;
        if (currentCol >= ansCols) {
          drawFooter();
          doc.addPage();
          currentPage++;
          setTextFont(doc, 'bold');
          doc.setFontSize(18);
          doc.text(answersOpt.title || 'Solutions', pageWidth / 2, 60, { align: 'center' });
          currentCol = 0;
        }
        currentY = startY;
      }
    });

    drawFooter();
  }

  // Draw TOC now that we know the pages
  if (toc.enable && tocPageNum > 0) {
    doc.setPage(tocPageNum);
    setTextFont(doc, 'bold');
    doc.setFontSize(20);
    doc.text(toc.title || 'Contents', pageWidth / 2, 60, { align: 'center' });

    setTextFont(doc, 'normal');
    doc.setFontSize(12);
    let y = 100;

    const tocList = [];
    if (tocEntries && tocEntries.length > 0) {
      let lastParentName = null;
      tocEntries.forEach((entry) => {
        if (!entry) return;
        const item = entry.item;
        if (!item) return;

        // If subchapter, check if we need to output parent chapter heading first if not added
        if (item.isSubchapter && item.parentName !== lastParentName) {
          tocList.push({
            name: item.parentName,
            range: '',
            page: entry.page,
            isIndent: false,
            isBold: true
          });
          lastParentName = item.parentName;
        }

        tocList.push({
          name: item.isSubchapter ? item.subName : (item.name || options.diagramsTitle || 'Диаграммы'),
          range: `(${item.from}–${item.to})`,
          page: entry.page,
          isIndent: item.isSubchapter,
          isBold: !item.isSubchapter
        });
      });
    } else {
      tocList.push({
        name: options.diagramsTitle || 'Diagrams',
        range: `(1–${positions.length})`,
        page: tocEntries[0] ? tocEntries[0].page : 1,
        isIndent: false,
        isBold: false
      });
    }

    if (answersOpt.enable && answersStartPage > 0) {
      tocList.push({
        name: answersOpt.title || 'Solutions',
        range: '',
        page: answersStartPage,
        isIndent: false,
        isBold: true
      });
    }

    tocList.forEach((item, idx) => {
      if (y + 24 > pageHeight - 60) {
        doc.addPage();
        currentPage++;
        y = 60;
      }

      const indentX = item.isIndent ? 70 : 50;
      setTextFont(doc, item.isBold ? 'bold' : 'normal');

      const label = item.range ? `${item.name} ${item.range}` : `${item.name}`;
      doc.text(label, indentX, y);
      
      if (item.page) {
        doc.text(`${item.page}`, pageWidth - 50, y, { align: 'right' });
        doc.link(indentX, y - 12, pageWidth - 100, 16, { pageNumber: item.page });
      }
      
      y += 24;
    });
  }

  return doc.output('blob');
}
