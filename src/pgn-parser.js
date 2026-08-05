// ─── PGN / FEN / EPD Parser ───────────────────────────────────────────

const TAG_RE = /\[(\w+)\s+"([^"]*)"\]/g;

/**
 * Extract first text comment from PGN move text.
 * Strips [%...] annotations, returns first {...} content.
 */
function firstTextComment(movesRaw) {
  if (!movesRaw || typeof movesRaw !== 'string') return '';
  const matches = movesRaw.matchAll(/\{([^}]*)\}/g);
  for (const m of matches) {
    const text = m[1].replace(/\[%[^\]]+\]/g, '').trim();
    if (text) return text;
  }
  return '';
}

/**
 * Parse PGN file content.
 * Returns array of position objects:
 * { fen, white, black, event, chapter, comment, moves }
 */
export function parsePgn(content) {
  const positions = [];
  // Split on [Event boundaries
  const blocks = content.split(/(?=^\[Event\b)/im);

  for (const block of blocks) {
    if (!block.trim()) continue;

    // Extract tags
    const tags = {};
    let tagEnd = 0;
    for (const m of block.matchAll(TAG_RE)) {
      tags[m[1]] = m[2];
      tagEnd = Math.max(tagEnd, m.index + m[0].length);
    }

    const fen = tags.FEN || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    // Everything after tags = move text
    let movesRaw = block.slice(tagEnd).trim();
    // Strip result token
    movesRaw = movesRaw.replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, '').trim();

    positions.push({
      fen,
      white:   tags.White || '',
      black:   tags.Black || '',
      event:   tags.Event || '',
      chapter: tags.ChapterName || '',
      comment: firstTextComment(movesRaw),
      moves:   movesRaw,
    });
  }

  return positions;
}

/**
 * Parse .fen file — looks for [FEN "..."] tags or bare FEN strings.
 */
export function parseFenFile(content) {
  const positions = [];
  
  // 1. Try [FEN "..."] tags
  for (const m of content.matchAll(/\[FEN\s+"([^"]*)"\]/g)) {
    positions.push({
      fen: m[1], white: '', black: '', event: '',
      chapter: '', comment: '', moves: '',
    });
  }

  // 2. If 0 results, parse as bare FEN lines
  if (positions.length === 0) {
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      // Skip empty lines and lines starting with # or ;
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
      
      // Validate FEN: piece placement string contains '/'
      const firstPart = trimmed.split(/\s+/)[0];
      if (firstPart && firstPart.includes('/')) {
        positions.push({
          fen: trimmed, white: '', black: '', event: '',
          chapter: '', comment: '', moves: '',
        });
      }
    }
  }

  return positions;
}

/**
 * Parse EPD file — one position per line.
 * Extracts 'id' operand as white, 'bm' operand as black.
 */
export function parseEpd(content) {
  const positions = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) continue;

    const fen = parts.slice(0, 4).join(' ') + ' 0 1';
    const rest = parts.slice(4).join(' ');

    const idMatch = rest.match(/id\s+"([^"]*)"/);
    const bmMatch = rest.match(/bm\s+([^;]+)/);

    positions.push({
      fen,
      white: idMatch ? idMatch[1].trim() : '',
      black: bmMatch ? bmMatch[1].trim().replace(/;$/, '') : '',
      event: '', chapter: '', comment: '', moves: '',
    });
  }
  return positions;
}

/**
 * Auto-detect file type and parse.
 * @param {string} content - File text content
 * @param {string} filename - Original filename (for extension detection)
 * @returns {Array} positions
 */
export function parseFile(content, filename) {
  const ext = (filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  if (ext === '.pgn') return parsePgn(content);
  if (ext === '.fen') return parseFenFile(content);
  if (ext === '.epd') return parseEpd(content);
  // Try PGN first, fallback to EPD
  const pgn = parsePgn(content);
  return pgn.length > 0 ? pgn : parseEpd(content);
}
