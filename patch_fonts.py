import os
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

font_dir = 'public/fonts'

for fname in os.listdir(font_dir):
    if not fname.lower().endswith(('.ttf', '.otf')) or fname.endswith('_patched.ttf'):
        continue
    
    path = os.path.join(font_dir, fname)
    font = TTFont(path)

    # 1. Remove VDMX table if present (known issue in jsPDF font parser)
    if 'VDMX' in font:
        del font['VDMX']
        print(f'[{fname}] Removed VDMX table')

    # 2. Add Unicode CMAP subtable (platformID 3, platEncID 1)
    cmap = font['cmap']
    has_unicode_cmap = any(t.platformID == 3 and t.platEncID == 1 for t in cmap.tables)

    if not has_unicode_cmap:
        # Build mapping dictionary from existing tables
        base_cmap = {}
        for t in cmap.tables:
            base_cmap.update(t.cmap)
        
        unicode_cmap = {}
        for code, gname in base_cmap.items():
            unicode_cmap[code] = gname
            # Map PUA range 0xF000 + code for custom chess characters
            if code < 256:
                unicode_cmap[0xF000 + code] = gname

        subtable = CmapSubtable.newSubtable(4)
        subtable.platformID = 3
        subtable.platEncID = 1
        subtable.language = 0
        subtable.cmap = unicode_cmap

        cmap.tables.append(subtable)
        print(f'[{fname}] Added Windows Unicode CMAP table (3, 1)')

    # Save font back
    font.save(path)
    print(f'[{fname}] Successfully patched and saved!')
