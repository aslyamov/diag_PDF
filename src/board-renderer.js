// ─── Board Renderer ────────────────────────────────────────────────────
// Converts FEN → array of font character strings for Chess Alpha DG

import { ALPHA_DG, BDR, RANK_CHARS, FILE_CHARS, SYMBOL_CHARS } from './config.js';

/**
 * Parse FEN string into board array and side to move.
 * @param {string} fenStr - Full FEN string
 * @returns {{ board: (string|null)[][], side: 'w'|'b' }}
 *   board[rank][file] — rank: 0=1..7=8, file: 0=a..7=h
 */
export function parseFen(fenStr) {
  if (!fenStr || typeof fenStr !== 'string') {
    return { board: Array.from({ length: 8 }, () => Array(8).fill(null)), side: 'w' };
  }
  const parts = fenStr.trim().split(/\s+/);
  const boardStr = parts[0];
  const side = (parts[1] || 'w').toLowerCase();

  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  let rank = 7, file = 0;

  for (const ch of boardStr) {
    if (ch === '/') {
      rank--;
      file = 0;
    } else if (ch >= '1' && ch <= '8') {
      file += parseInt(ch);
    } else {
      if (rank >= 0 && rank <= 7 && file >= 0 && file <= 7) {
        board[rank][file] = ch;
      }
      file++;
    }
  }

  return { board, side };
}

/**
 * Get font character for a piece on a given square.
 * @param {string|null} piece - FEN piece char or null for empty
 * @param {boolean} isDark - Whether the square is dark
 * @returns {string} Font character
 */
function pieceChar(piece, isDark) {
  const key = piece
    ? `${piece}_${isDark ? 'dark' : 'light'}`
    : `empty_${isDark ? 'dark' : 'light'}`;
  return ALPHA_DG[key] || ' ';
}

/**
 * Convert FEN to diagram lines for Chess Alpha DG font.
 * Returns 10 strings: top border + 8 ranks + bottom border.
 *
 * @param {string} fen - FEN string
 * @param {object} opts
 * @param {boolean} [opts.coords=true] - Show coordinates
 * @param {boolean} [opts.flip=false] - Flip board
 * @param {boolean} [opts.flipAuto=true] - Auto-flip when black to move
 * @param {string} [opts.symbol='square'] - Move indicator type
 * @returns {string[]} 10 diagram lines
 */
export function fenToDiagram(fen, opts = {}) {
  const { coords = true, flip = false, flipAuto = true, symbol = 'square' } = opts;
  const { board, side } = parseFen(fen);

  let actualFlip = flip;
  if (flipAuto && side === 'b') {
    actualFlip = !flip;
  }

  const symPair = SYMBOL_CHARS[symbol] || SYMBOL_CHARS.square;
  const hgChar = side === 'w' ? symPair.w : symPair.b;

  // Iteration order
  const rankOrder = actualFlip
    ? Array.from({ length: 8 }, (_, i) => i)       // 0..7 (rank1 at top)
    : Array.from({ length: 8 }, (_, i) => 7 - i);  // 7..0 (rank8 at top)
  const fileOrder = actualFlip
    ? Array.from({ length: 8 }, (_, i) => 7 - i)   // h..a
    : Array.from({ length: 8 }, (_, i) => i);       // a..h
  const fileLabels = actualFlip
    ? [...FILE_CHARS].reverse()
    : [...FILE_CHARS];

  const visualBottomRank = actualFlip ? 7 : 0; // rank at visual bottom row

  const lines = [];

  if (coords) {
    // Top border
    lines.push(BDR.NW + BDR.N.repeat(8) + BDR.NE);

    // 8 rank rows
    for (const ri of rankOrder) {
      let row = RANK_CHARS[ri]; // rank label on left
      for (const fi of fileOrder) {
        const piece = board[ri][fi];
        const isDark = (fi + ri) % 2 === 0;
        row += pieceChar(piece, isDark);
      }
      // Right side: move indicator on visual bottom rank, border elsewhere
      row += (ri === visualBottomRank) ? hgChar : BDR.E;
      lines.push(row);
    }

    // Bottom border with file labels
    lines.push(BDR.SW + fileLabels.join('') + BDR.SE);
  } else {
    // No-coords mode
    lines.push(BDR.NW_NC + BDR.N.repeat(8) + BDR.NE_NC);

    for (const ri of rankOrder) {
      let row = BDR.W_NC;
      for (const fi of fileOrder) {
        const piece = board[ri][fi];
        const isDark = (fi + ri) % 2 === 0;
        row += pieceChar(piece, isDark);
      }
      row += (ri === visualBottomRank) ? hgChar : BDR.E_NC;
      lines.push(row);
    }

    lines.push(BDR.SW_NC + BDR.S.repeat(8) + BDR.SE_NC);
  }

  return lines;
}

/**
 * Convert plain ASCII diagram string to Unicode PUA for chess font rendering.
 * Each char c → String.fromCharCode(0xF000 + c.charCodeAt(0))
 */
export function chessStr(s) {
  return [...s].map(c => String.fromCharCode(0xF000 + c.charCodeAt(0))).join('');
}

/**
 * Get active color from FEN.
 */
export function activeColor(fen) {
  const parts = fen.trim().split(/\s+/);
  return (parts[1] || 'w').toLowerCase();
}
