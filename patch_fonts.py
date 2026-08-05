import os
from fontTools.ttLib import TTFont

font_dir = 'public/fonts'

for fname in os.listdir(font_dir):
    if not fname.lower().endswith(('.ttf', '.otf')) or fname.endswith('_patched.ttf'):
        continue
    
    path = os.path.join(font_dir, fname)
    font = TTFont(path)

    # 1. Remove VDMX table if present
    if 'VDMX' in font:
        del font['VDMX']
        print(f'[{fname}] Removed VDMX table')

    # 2. Check if font requires scaling/normalization (e.g. DiaTTCry / DiaTTHab)
    # DiaTT fonts have unitsPerEm = 1000 and cell yBounds from -280 to 680 (height = 960)
    head = font['head']
    if head.unitsPerEm == 1000 and 'plus' in font['glyf']:
        print(f'[{fname}] Normalizing metrics from 1000 to 2048 upem...')
        head.unitsPerEm = 2048
        scale = 2048.0 / 960.0

        glyf = font['glyf']
        for gname in font.getGlyphOrder():
            g = glyf[gname]
            if g.numberOfContours > 0:
                new_coords = []
                for (x, y) in g.coordinates:
                    nx = int(round(x * scale))
                    ny = int(round((y + 280) * scale))
                    new_coords.append((nx, ny))
                g.coordinates = type(g.coordinates)(new_coords)
                g.xMin = min(c[0] for c in g.coordinates)
                g.xMax = max(c[0] for c in g.coordinates)
                g.yMin = min(c[1] for c in g.coordinates)
                g.yMax = max(c[1] for c in g.coordinates)

        hmtx = font['hmtx']
        for gname in hmtx.metrics:
            hmtx.metrics[gname] = (2048, 0)

        font['hhea'].ascent = 2048
        font['hhea'].descent = 0
        if 'OS/2' in font:
            font['OS/2'].sTypoAscender = 2048
            font['OS/2'].sTypoDescender = 0
            font['OS/2'].usWinAscent = 2048
            font['OS/2'].usWinDescent = 0

    # 3. Ensure Windows Unicode CMAP (3, 1) has PUA mappings
    cmap = font['cmap']
    win_table = None
    for t in cmap.tables:
        if t.platformID == 3 and t.platEncID == 1:
            win_table = t
            break

    if win_table is None:
        base_cmap = {}
        for t in cmap.tables:
            base_cmap.update(t.cmap)
        unicode_cmap = {}
        for code, gname in base_cmap.items():
            unicode_cmap[code] = gname
            if code < 256:
                unicode_cmap[0xF000 + code] = gname

        from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
        subtable = CmapSubtable.newSubtable(4)
        subtable.platformID = 3
        subtable.platEncID = 1
        subtable.language = 0
        subtable.cmap = unicode_cmap
        cmap.tables.append(subtable)
        print(f'[{fname}] Created Windows Unicode CMAP (3,1) table with PUA')
    else:
        new_cmap = dict(win_table.cmap)
        added_pua = 0
        for code, gname in list(win_table.cmap.items()):
            if code < 256 and (0xF000 + code) not in new_cmap:
                new_cmap[0xF000 + code] = gname
                added_pua += 1
        win_table.cmap = new_cmap
        print(f'[{fname}] Updated Windows Unicode CMAP (3,1) with {added_pua} PUA entries')

    font.save(path)
    print(f'[{fname}] Successfully patched and saved!')
