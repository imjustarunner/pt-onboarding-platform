"""Reconcile approved app-only wording in ITSCO source and local draft snapshots.

NLU inherits these changes through buildNluHandbook.py. Never writes live digests.
"""
import copy
import hashlib
import json
from pathlib import Path
from handbookAppWorkflow import app_section, app_workflow

root = Path(__file__).resolve().parents[1] / 'content' / 'handbooks'
def read(name): return json.loads((root / name).read_text())
def write(name, data): (root / name).write_text(json.dumps(data, indent=2, ensure_ascii=False)+'\n')
source = read('itsco.json')
updates = read('itsco-draft-updates.json')
for name, data in [('itsco-before-app-workflow.json', source), ('itsco-updates-before-app-workflow.json', updates)]:
    if not (root / name).exists(): write(name, data)
baseline = read('itsco-before-app-workflow.json')
prior = {s['slug']: s for s in baseline['sections']}
changed = []
audit = read('itsco-reconciliation.json')
for section in source['sections']:
    section['bodyHtml'] = app_section(section['slug'], section['bodyHtml'])
    if section['slug'] == 'digital-workplace-and-transition-procedures': section['title'] = 'App records, forms and timekeeping'
    if app_section(section['slug'], prior[section['slug']]['bodyHtml']) != prior[section['slug']]['bodyHtml']:
        changed.append(section['slug'])
        entry = next((e for e in audit['sections'] if e['slug'] == section['slug']), None)
        if not entry:
            entry = {'slug': section['slug'], 'kind': 'replaced', 'updateEntryIds': []}
            audit['sections'].append(entry)
        if 5 not in entry['updateEntryIds']: entry['updateEntryIds'].append(5)
        entry['bodySha256'] = hashlib.sha256(section['bodyHtml'].encode()).hexdigest()
        entry['latestAuthorization'] = '2026-10-10: user requires app-only forms, records and timekeeping'
for entry in updates['updates']:
    entry['changed_content'] = app_workflow(entry['changed_content'])
    if entry['id'] == 5:
        entry['changed_content'] = app_section('digital-workplace-and-transition-procedures', '')
        entry['policy_section_slugs'] = list(dict.fromkeys(['digital-workplace-and-transition-procedures']+entry.get('policy_section_slugs', [])+changed))
        entry['rationale'] = 'Forms, documentation, scheduling and timekeeping now use the app throughout both handbooks. Earlier external-system and future-cutover instructions are superseded.'
    # Preserve subjects so existing database entries still resolve to their links.
notes = [n for n in source['importNotes'] if n.get('key') != 'app-workflow-2026-10-10']
notes.append({'key':'app-workflow-2026-10-10', 'message':'The user confirmed app-only forms, records and timekeeping on October 10. Old cutover instructions are superseded. Emergency calls and required outside filings remain available. Local updater wording and exact destinations are reconciled; live entries have not been changed.'})
source['importNotes'] = notes
write('itsco.json', source); write('itsco-draft-updates.json', updates); write('itsco-reconciliation.json', audit)
write('app-workflow-reconciliation.json', {'date':'2026-10-10','authorization':notes[-1]['message'],'sections':[{'slug':s, 'beforeBodySha256':hashlib.sha256(prior[s]['bodyHtml'].encode()).hexdigest(), 'bodySha256':next(e['bodySha256'] for e in audit['sections'] if e['slug']==s)} for s in changed]})
print(f'App workflow: {len(changed)} ITSCO sections reconciled; no database writes.')
