// ─── Chess Alpha DG font mapping ───────────────────────────────────────
// Key: (piece, isDark) → font character
// Dark square: (file + rank) % 2 === 0  (file: 0=a..7=h, rank: 0=1..7=8)

export const ALPHA_DG = {
  'K_light': 'k', 'K_dark': 'K',
  'Q_light': 'q', 'Q_dark': 'Q',
  'R_light': 'r', 'R_dark': 'R',
  'B_light': 'b', 'B_dark': 'B',
  'N_light': 'h', 'N_dark': 'H',
  'P_light': 'p', 'P_dark': 'P',
  'k_light': 'l', 'k_dark': 'L',
  'q_light': 'w', 'q_dark': 'W',
  'r_light': 't', 'r_dark': 'T',
  'b_light': 'n', 'b_dark': 'N',
  'n_light': 'j', 'n_dark': 'J',
  'p_light': 'o', 'p_dark': 'O',
  'empty_light': ' ', 'empty_dark': '+',
};

// Board frame characters
export const BDR = {
  NW: '!', N: 'z', NE: '#',
  SW: '&', S: "'", SE: '(',
  E: '%',
  // No-coords frame
  NW_NC: '!', NE_NC: '#',
  SW_NC: '&', SE_NC: '(',
  W_NC: '$', E_NC: '%',
};

// Coordinate characters (Unicode PUA in the chess font)
export const RANK_CHARS = Array.from({length: 8}, (_, i) => String.fromCharCode(0xE0 + i));
export const FILE_CHARS = Array.from({length: 8}, (_, i) => String.fromCharCode(0xE8 + i));

// To-move indicator symbols (font characters)
export const SYMBOL_CHARS = {
  square:   { w: 'I', b: 'M' },
  circle:   { w: 'F', b: 'G' },
  triangle: { w: 'f', b: 'i' },
};

// Layout presets: [label_en, label_ru, cols, rows_plain, rows_lined, fpt, title_pt, title_offset]
export const LAYOUTS = [
  ['1 - 1/1 dg/pg',   '1 - 1/1 на стр.',   1, 1, 1, 52, 20,  0.0],
  ['1 - 1/2 dg/pg',   '1 - 1/2 на стр.',   1, 1, 2, 52, 20,  0.0],
  ['2 - 6/4 dg/pg',   '2 - 6/4 на стр.',   2, 3, 2, 23, 10, -1.0],
  ['3 - 12/9 dg/pg',  '3 - 12/9 на стр.',  3, 4, 3, 16,  8, -1.0],
  ['4 - 20/16 dg/pg', '4 - 20/16 на стр.', 4, 5, 4, 13,  6, -1.0],
  ['3 - 15/12 dg/pg', '3 - 15/12 на стр.', 3, 5, 4, 13,  6, -1.0],
  ['3 - 12 max',      '3 - 12 макс.',      3, 4, 4, 16,  8, -1.0],
];
export const DEFAULT_LAYOUT = 2;

// Supported chess fonts
export const FONT_FILES = {
  AlphaDG:   'AlphaDG.ttf',
  LeipzigDG: 'LeipzigDG.ttf',
  CondalDG:  'CondalDG.ttf',
  KingdomDG: 'KingdomDG.ttf',
};
export const FONT_NAMES = Object.keys(FONT_FILES);

// Figurine notation fonts
export const FIGURINE_FONTS = ['Zurich', 'Hastings', 'Linares', 'Aries', 'Letter', 'Time'];
export const FIGURINE_FILES = {
  Zurich:   'ZurichFigurine.TTF',
  Hastings: 'HastingsFigurine.TTF',
  Linares:  'LinaresFigurine.TTF',
  Aries:    'SpArFgRg.ttf',
  Letter:   'SpLtFgRg.ttf',
  Time:     'SpTmFgRg.ttf',
};

// Page geometry (A4, mm)
export const PAGE = {
  W: 210, H: 297,
  ML: 10, MR: 10, MT: 15,
  HY: 10, FY: 10,
  USABLE_W: 190,
  LINE_H: 6,
  PT: 25.4 / 72,  // 1pt in mm
};

// ─── Localization ──────────────────────────────────────────────────────
// ─── Localization ──────────────────────────────────────────────────────
export const LANGS = {
  en: { label: 'EN', name: 'English' },
  ru: { label: 'RU', name: 'Русский' },
};

export const T = {
  en: {
    section_files:    'Files',
    section_page:     'Page',
    section_diagram:  'Diagram',
    section_cover:    'Cover Page',
    section_toc:      'Table of Contents',
    section_chapters: 'Chapters',
    section_answers:  'Answers',
    input_file:       'Input file:',
    layout:           'Layout:',
    font:             'Font:',
    symbol:           'Move indicator:',
    lines_count:      'Lines per diagram:',
    lines_mode:       'Line mode:',
    lines_plain:      'Plain',
    lines_numbered:   'Numbered',
    orient:           'Orientation:',
    orient_auto:      'Auto',
    orient_white:     'White ↓',
    orient_black:     'Black ↓',
    coords:           'Show coordinates',
    title_source:     'Title:',
    title_number:     'Number',
    title_comment:    'PGN comment',
    title_custom_lbl: 'Custom:',
    sym_square:       'Square',
    sym_circle:       'Circle',
    sym_triangle:     'Triangle',
    lichess_link:     'Lichess links',
    header_text:      'Header:',
    footer_text:      'Footer:',
    show:             'Show',
    generate:         'Generate PDF',
    download:         'Download PDF',
    preview:          'Preview',
    cover_title:      'Title:',
    cover_subtitle:   'Subtitle:',
    cover_author:     'Author:',
    cover_date:       'Date:',
    enable_cover:     'Enable cover page',
    enable_toc:       'Enable TOC',
    toc_title:        'TOC title:',
    add_chapter:      '+ Add chapter',
    add_subchapter:   '+ Subchapter',
    chapter_name:     'Chapter name',
    subchapter_name:  'Subchapter name',
    chapter_from:     'From',
    chapter_to:       'To',
    title_chapter_num:'Chapter numbering',
    enable_answers:   'Enable answers',
    answers_title:    'Answers title:',
    answers_cols:     'Columns:',
    figurine_font:    'Figurine font:',
    dark_theme:       'Dark',
    light_theme:      'Light',
    drop_hint:        'Drop .pgn / .fen / .epd file here or click to browse',
    no_file:          'No file loaded',
    positions_loaded: '{n} positions loaded',
    page_of:          'Page {p} of {t}',
    solutions:        'Solutions',
    contents:         'Contents',
    cover_default_title:    'Chess Puzzles',
    cover_default_subtitle: 'Mate in 1',
    cover_default_author:   'Ivan Ivanov',
    chapter_prefix:         'Chapter',
    diagrams_toc:           'Diagrams',
    lang_btn:         'RU',
  },
  ru: {
    section_files:    'Файлы',
    section_page:     'Страница',
    section_diagram:  'Диаграмма',
    section_cover:    'Обложка',
    section_toc:      'Оглавление',
    section_chapters: 'Главы',
    section_answers:  'Ответы',
    input_file:       'Исходный файл:',
    layout:           'Макет:',
    font:             'Шрифт:',
    symbol:           'Символ хода:',
    lines_count:      'Строк под диаграммой:',
    lines_mode:       'Линии:',
    lines_plain:      'Пустые',
    lines_numbered:   'С нумерацией',
    orient:           'Ориентация:',
    orient_auto:      'Авто',
    orient_white:     'Белые ↓',
    orient_black:     'Чёрные ↓',
    coords:           'Показать координаты',
    title_source:     'Заголовок:',
    title_number:     'Номер',
    title_comment:    'Коммент. PGN',
    title_custom_lbl: 'Свой текст:',
    sym_square:       'Квадрат',
    sym_circle:       'Круг',
    sym_triangle:     'Треугольник',
    lichess_link:     'Ссылки Lichess',
    header_text:      'Верхний:',
    footer_text:      'Нижний:',
    show:             'Показать',
    generate:         'Сгенерировать PDF',
    download:         'Скачать PDF',
    preview:          'Предпросмотр',
    cover_title:      'Заголовок:',
    cover_subtitle:   'Подзаголовок:',
    cover_author:     'Автор:',
    cover_date:       'Дата:',
    enable_cover:     'Включить обложку',
    enable_toc:       'Включить оглавление',
    toc_title:        'Заголовок оглавления:',
    add_chapter:      '+ Добавить главу',
    add_subchapter:   '+ Подглава',
    chapter_name:     'Название главы',
    subchapter_name:  'Название подглавы',
    chapter_from:     'От',
    chapter_to:       'До',
    title_chapter_num:'Нумерация по главам',
    enable_answers:   'Включить ответы',
    answers_title:    'Заголовок ответов:',
    answers_cols:     'Колонки:',
    figurine_font:    'Фигуринный шрифт:',
    dark_theme:       'Тёмная',
    light_theme:      'Светлая',
    drop_hint:        'Перетащите .pgn / .fen / .epd файл сюда или нажмите для выбора',
    no_file:          'Файл не загружен',
    positions_loaded: '{n} позиций загружено',
    page_of:          'Стр. {p} из {t}',
    solutions:        'Решения',
    contents:         'Оглавление',
    cover_default_title:    'Шахматные задачи',
    cover_default_subtitle: 'Мат в 1 ход',
    cover_default_author:   'Иванов Иванов',
    chapter_prefix:         'Глава',
    diagrams_toc:           'Диаграммы',
    lang_btn:         'EN',
  },
};
