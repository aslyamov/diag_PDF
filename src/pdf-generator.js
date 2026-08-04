import { jsPDF } from 'jspdf';
import { LAYOUTS } from './config.js';
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
        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        b64 = btoa(binary);
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

  // Dynamically load selected board font
  const boardFilenameMap = {
    'AlphaDG': 'AlphaDG.ttf',
    'LeipzigDG': 'LeipzigDG.ttf',
    'CondalDG': 'CondalDG.ttf',
    'KingdomDG': 'KingdomDG.ttf'
  };
  const boardFile = boardFilenameMap[boardFont] || 'AlphaDG.ttf';
  const hasCustomFont = await loadFontIntoDoc(doc, boardFile, boardFont);
  const activeFontName = hasCustomFont ? boardFont : 'Courier';

  // Load text font (Roboto)
  await loadFontIntoDoc(doc, 'Roboto-Regular.ttf', 'Roboto');

  // Load figurine font if enabled
  let ansFontName = 'Roboto';
  const figMap = { Zurich: 'ZurichFigurine.TTF', Hastings: 'HastingsFigurine.TTF', Linares: 'LinaresFigurine.TTF' };
  if (options.answers?.enable && options.answers?.figurineFont) {
    const figFont = options.answers.figurineFont;
    const figFile = figMap[figFont];
    if (figFile) {
      const hasFig = await loadFontIntoDoc(doc, figFile, figFont);
      if (hasFig) ansFontName = figFont;
    }
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
    setTextFont(doc, 'bold');
    doc.setFontSize(28);
    doc.text(cover.title || 'Chess Diagrams', pageWidth / 2, pageHeight / 3, { align: 'center' });

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

  let chaptersToRender = [];
  if (chapters && chapters.length > 0) {
    chaptersToRender = chapters;
  } else {
    chaptersToRender = [{ name: '', from: 1, to: positions.length }];
  }

  const drawFooter = () => {
    setTextFont(doc, 'normal');
    doc.setFontSize(9);
    doc.text(`${currentPage}`, pageWidth / 2, pageHeight - 18, { align: 'center' });
  };

  const drawHeader = (chName) => {
    if (chName) {
      setTextFont(doc, 'normal');
      doc.setFontSize(10);
      doc.text(chName, pageWidth / 2, marginY - 20, { align: 'center' });
    }
  };

  let globalPosIdx = 0;

  for (let chIdx = 0; chIdx < chaptersToRender.length; chIdx++) {
    const ch = chaptersToRender[chIdx];
    const chPositions = positions.slice(ch.from - 1, ch.to);
    
    if (chIdx > 0) {
      drawFooter();
      doc.addPage();
      currentPage++;
    }

    const chapterStartPage = currentPage;
    tocEntries.push({ page: chapterStartPage });

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
      const y = marginY + row * gridH + 30;

      let flip = false;
      let flipAuto = true;
      if (orientation === 'white') { flipAuto = false; flip = false; }
      else if (orientation === 'black') { flipAuto = false; flip = true; }

      const lines = fenToDiagram(pos.fen, { coords: showCoords, symbol, flip, flipAuto });

      doc.setFont(activeFontName, 'normal');
      doc.setFontSize(fontPt);

      let boxWidth = 0;
      let boxHeight = lines.length * (fontPt * 0.95);

      lines.forEach((line, lineIdx) => {
        const textToRender = hasCustomFont ? chessStr(line) : line;
        const lineWidth = doc.getTextWidth(textToRender);
        if (lineWidth > boxWidth) boxWidth = lineWidth;

        doc.text(textToRender, x, y + lineIdx * (fontPt * 0.95), { align: 'center' });
      });

      if (options.lichessLinks && pos.fen) {
        const fenForUrl = pos.fen.replace(/ /g, '_');
        const color = pos.fen.split(/\s+/)[1] === 'b' ? 'black' : 'white';
        const fenUrl = `https://lichess.org/analysis/${fenForUrl}?color=${color}`;
        // Link on turn indicator (last rank row, right side)
        const indicatorLineIdx = showCoords ? 9 : 9; // bottom rows of diagram
        const indicatorY = y + (lines.length - 2) * (fontPt * 0.95) - fontPt * 0.5;
        const indicatorX = x + boxWidth / 2 - fontPt;
        doc.link(indicatorX, indicatorY, fontPt, fontPt, { url: fenUrl });
      }

      // Diagram title / number
      let titleStr = `${globalPosIdx + 1}`;
      if (titleMode === 'comment') {
        titleStr = pos.comment || `${globalPosIdx + 1}`;
      } else if (titleMode === 'custom') {
        titleStr = options.customTitle || `${globalPosIdx + 1}`;
      }

      setTextFont(doc, 'normal');
      doc.setFontSize(titlePt || 10);
      doc.text(titleStr, x, y - 8 + (titleOffset || 0), { align: 'center' });

      // Notation lines / blank lines below diagram
      const linesCount = options.notationLinesCount || 0;
      const isNumbered = options.notationLinesMode === 'numbered';
      if (linesCount > 0) {
        setTextFont(doc, 'normal');
        doc.setFontSize(8);
        
        const startY = y + lines.length * (fontPt * 0.95) + 6;
        const lineSpacing = Math.max(14, fontPt * 0.6);
        
        // Exact inner board width (8 board cells out of 10 total diagram width)
        const cellPt = fontPt;
        const innerBoardWidth = 8 * cellPt;
        
        // Center lines exactly under the 8 cells
        const leftX = x - innerBoardWidth / 2;
        const gap = 8;
        const colW = (innerBoardWidth - gap) / 2;
        
        for (let l = 1; l <= linesCount; l++) {
          const lineY = startY + (l - 1) * lineSpacing;
          const numPrefix = isNumbered ? `${l}. ` : '';
          const prefixW = isNumbered ? doc.getTextWidth(numPrefix) : 0;
          
          // White move column (Left)
          if (isNumbered) {
            doc.text(numPrefix, leftX, lineY);
          }
          doc.setDrawColor(180);
          doc.setLineWidth(0.5);
          doc.line(leftX + prefixW, lineY + 1, leftX + colW, lineY + 1);

          // Black move column (Right)
          const rightX = leftX + colW + gap;
          doc.line(rightX, lineY + 1, leftX + innerBoardWidth, lineY + 1);
        }
      }
      
      globalPosIdx++;
    }
    
    // After the chapter ends, if it's the last chapter, draw footer
    if (chIdx === chaptersToRender.length - 1) {
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

    const ansCols = parseInt(answersOpt.cols) || 1;
    const marginX = 40;
    const startY = 90;
    const maxY = pageHeight - 60;
    const colWidth = (pageWidth - marginX * 2 - (ansCols - 1) * 20) / ansCols;
    const lineHeight = 16;
    const itemsPerCol = Math.floor((maxY - startY) / lineHeight);
    const itemsPerPage = itemsPerCol * ansCols;

    // Filter positions to render in answers up to max chapter position if chapters exist
    let answersPositions = positions;
    if (chapters && chapters.length > 0) {
      const maxTo = Math.max(...chapters.map(c => parseInt(c.to) || 0));
      if (maxTo > 0) {
        answersPositions = positions.slice(0, maxTo);
      }
    }

    answersPositions.forEach((pos, idx) => {
      const solutionText = pos.moves || pos.comment || pos.fen || '—';
      const pageItemIdx = idx % itemsPerPage;

      if (idx > 0 && pageItemIdx === 0) {
        doc.addPage();
        currentPage++;
        setTextFont(doc, 'bold');
        doc.setFontSize(18);
        doc.text(answersOpt.title || 'Solutions', pageWidth / 2, 60, { align: 'center' });
      }

      const colIdx = Math.floor(pageItemIdx / itemsPerCol);
      const rowIdx = pageItemIdx % itemsPerCol;

      const ansX = marginX + colIdx * (colWidth + 20);
      const ansY = startY + rowIdx * lineHeight;

      setTextFont(doc, 'normal');
      doc.setFontSize(10);
      const prefix = `${idx + 1}. `;
      doc.text(prefix, ansX, ansY);

      const prefixW = doc.getTextWidth(prefix);
      doc.setFont(ansFontName, 'normal');
      doc.text(solutionText, ansX + prefixW, ansY, { maxWidth: colWidth - prefixW });
    });
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
    if (chapters && chapters.length > 0) {
      chapters.forEach((ch, idx) => {
        tocList.push({
          name: ch.name || `Chapter ${idx + 1}`,
          range: `(${ch.from}–${ch.to})`,
          page: tocEntries[idx] ? tocEntries[idx].page : 1
        });
      });
    } else {
      tocList.push({
        name: options.diagramsTitle || 'Diagrams',
        range: `(1–${positions.length})`,
        page: tocEntries[0] ? tocEntries[0].page : 1
      });
    }

    if (answersOpt.enable && answersStartPage > 0) {
      tocList.push({
        name: answersOpt.title || 'Solutions',
        range: '',
        page: answersStartPage
      });
    }

    tocList.forEach((item, idx) => {
      const label = item.range ? `${idx + 1}. ${item.name} ${item.range}` : `${idx + 1}. ${item.name}`;
      doc.text(label, 50, y);
      
      doc.text(`${item.page}`, pageWidth - 50, y, { align: 'right' });
      doc.link(50, y - 12, pageWidth - 100, 16, { pageNumber: item.page });
      
      y += 24;
    });
  }

  return doc.output('blob');
}
