#!/usr/bin/env python3
"""Rebuild public HTML brand guides and archives from the curated portfolio.

Run from any directory; --check verifies the committed HTML and ZIP files.
Only assets explicitly listed in the portfolio are packaged. No tenant uploads,
documents, contact records, or font binaries are included.
"""
import argparse
import html
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
OUTPUT = PUBLIC / 'assets/ptco/brand-packages'
CATALOG = ROOT / 'src/content/ptcoBrandPortfolio.json'


def brand_guide(brand, names):
    escape = html.escape
    title = escape(brand['name'])
    colors = ''.join(f'<div class="color"><span style="background:{escape(color)}"></span><code>{escape(color)}</code></div>' for color in brand['colors'])
    assets = ''.join(f'<li><a href="{escape(name)}">{escape(Path(asset).name)}</a></li>' for asset, name in names.items())
    guide = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Brand package</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#faf8f5;color:#182131;font:16px/1.65 Arial,sans-serif}}main{{max-width:850px;margin:auto;padding:48px 24px}}header{{border-bottom:1px solid #ddd4cf;padding-bottom:24px}}.eyebrow{{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#761224}}h1{{font:42px/1.15 Georgia,serif;margin:16px 0}}h2{{font:28px Georgia,serif;margin-top:36px}}a{{color:#761224;text-underline-offset:4px}}.art{{background:white;border:1px solid #e4ddda;border-radius:10px;padding:28px;margin:28px 0;display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap}}.logo{{max-width:100%;width:360px;max-height:260px;object-fit:contain}}.icon{{width:64px;height:64px;object-fit:contain}}.colors{{display:flex;gap:16px;flex-wrap:wrap}}.color{{width:120px}}.color span{{height:70px;display:block;border:1px solid #ddd;border-radius:6px}}code{{font-size:13px}}li{{margin-bottom:8px}}footer{{margin-top:40px;border-top:1px solid #ddd4cf;padding-top:20px;font-size:12px}}@media print{{body{{background:white}}main{{padding:0}}}}
</style></head><body><main>
<header><p class="eyebrow">Created by Plot Twist Co. · Brand package</p><h1>{title}</h1><p>{escape(brand['description'])}</p><a href="{escape(brand['website'])}">{escape(brand['website'])}</a></header>
<div class="art"><img class="logo" src="{escape(names[brand['logo']])}" alt="{title} artwork"><img class="icon" src="{escape(names[brand['icon']])}" alt="{title} mark"></div>
<p>{escape(brand.get('note', 'Existing brand artwork, supplied in its original formats.'))}</p>
<h2>Website color reference</h2><div class="colors">{colors}</div>
<h2>Typography</h2><p>{escape(brand['typography'])}. Font files are not included in this package.</p>
<h2>Included artwork</h2><ul>{assets}</ul>
<h2>Using the artwork</h2><ul><li>Keep the original proportions. Do not stretch, recolor, or redraw the mark.</li><li>Leave clear space around the artwork and use a background with enough contrast.</li><li>Use the supplied vector files where available; keep raster artwork at or below its original size.</li><li>Use these assets to represent {title}. Brand names and artwork remain with their respective owners.</li></ul>
<footer>Prepared by <a href="https://plottwistco.com/services/website">Plot Twist Co.</a> from the existing website identity. This package is a practical asset reference; it does not grant ownership of the brand.</footer>
</main></body></html>'''
    return guide.encode('utf-8')


def package(brand):
    files = {}
    names = {}
    for index, asset in enumerate(brand['assets'], 1):
        source = (PUBLIC / asset.lstrip('/')).resolve()
        if not source.is_relative_to(PUBLIC.resolve()) or not source.is_file():
            raise ValueError(f"Missing or invalid public asset: {asset}")
        name = f'assets/{index:02d}-{source.name}'
        files[name] = source.read_bytes()
        names[asset] = name
    files['brand-guide.html'] = brand_guide(brand, names)
    files['brand.json'] = (json.dumps({**brand, 'packagedAssets': names}, indent=2, ensure_ascii=False) + '\n').encode('utf-8')
    files['README.txt'] = f"{brand['name']} — Brand package\n\nExtract this ZIP, then open brand-guide.html in your browser.\nThe assets folder contains the existing artwork in its original formats.\nWebsite: {brand['website']}\nPrepared by Plot Twist Co.\n".encode('utf-8')
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 15, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, content)
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    brands = json.loads(CATALOG.read_text())
    if len({brand['id'] for brand in brands}) != len(brands):
        raise ValueError('Brand IDs must be unique.')
    if not args.check:
        OUTPUT.mkdir(parents=True, exist_ok=True)
    for brand in brands:
        outputs = {
            'zip': package(brand),
            'html': brand_guide(brand, {asset: asset for asset in brand['assets']}),
        }
        for extension, content in outputs.items():
            path = OUTPUT / f"{brand['id']}.{extension}"
            if args.check:
                if not path.exists() or path.read_bytes() != content:
                    raise ValueError(f'Stale brand package: {path.name}; rerun this script.')
            else:
                path.write_bytes(content)
    print(f"{'Verified' if args.check else 'Built'} {len(brands)} HTML brand guides and archives.")


if __name__ == '__main__':
    main()
