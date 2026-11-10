"""Import CMS descriptions for the exact, hash-pinned ICD editions used by the app.

Downloads remain in memory. No build-time network request or external search
service is needed after this generated server-only catalog is committed.
"""
import hashlib
import io
import json
from pathlib import Path
import ssl
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
catalog = json.loads((root / 'backend/src/data/icd10cm-diagnosis-catalog.json').read_text())
releases = []
base = None
for release in catalog['releases']:
    raw = urllib.request.urlopen(release['source'], timeout=60,
        context=ssl.create_default_context(cafile='/etc/ssl/cert.pem')).read()
    assert hashlib.sha256(raw).hexdigest() == release['sourceSha256'], 'CMS source hash changed'
    archive = zipfile.ZipFile(io.BytesIO(raw))
    name = next(name for name in archive.namelist() if 'order' in name.lower()
        and 'addend' not in name.lower() and name.lower().endswith('.txt'))
    descriptions = {}
    for line in archive.read(name).decode('utf-8-sig').splitlines():
        if len(line) < 78 or line[14] != '1':
            continue
        code = line[6:13].strip()
        if len(code) > 3:
            code = code[:3] + '.' + code[3:]
        descriptions[code] = line[77:].strip()
    expected = (set(catalog['baseCodes']) - set(release['removedCodes'])) | set(release['addedCodes'])
    assert set(descriptions) == expected, 'Description coverage differs from the validated code catalog'
    if base is None:
        base = descriptions
    changes = {code: description for code, description in descriptions.items() if base.get(code) != description}
    releases.append({key: release[key] for key in ['effectiveFrom', 'effectiveThrough', 'source', 'sourceSha256']}
        | {'descriptions': changes})
    print(release['effectiveFrom'], len(descriptions), 'billable descriptions;', len(changes), 'edition changes')
output = {'source': 'CMS ICD-10-CM Code Descriptions in Tabular Order',
    'baseDescriptions': base, 'releases': releases}
(root / 'backend/src/data/icd10cm-descriptions.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n')
