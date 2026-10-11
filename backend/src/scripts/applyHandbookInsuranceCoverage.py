"""Apply the owner's insurance clarification to shared source; no database writes."""
import copy
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'content' / 'handbooks'
def read(name): return json.loads((ROOT / name).read_text())
def write(name, data): (ROOT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False)+'\n')

source = read('itsco.json')
if not (ROOT / 'itsco-before-insurance-clarification.json').exists():
    write('itsco-before-insurance-clarification.json', source)
prior = {s['slug']: s for s in read('itsco-before-insurance-clarification.json')['sections']}
coverage = '<p>The Practice provides liability insurance and clinical malpractice insurance for its authorized operations, including authorized clinical work performed by employees and clinical students/interns. Coverage is subject to the applicable insurance policy terms and the individual’s authorized role and supervision. This handbook does not extend coverage to unrelated outside activities or promise coverage for work performed before joining the Practice. Request a certificate of insurance or clarification of coverage from People Operations through the app.</p>'
slugs = ['benefits-overview', 'disclosure-and-liability', 'student-training-program-disclosure-and-liability']
for s in source['sections']:
    if s['slug'] not in slugs: continue
    if s['slug'] == 'benefits-overview':
        s['bodyHtml'] = re.sub(r'<h4>Liability Insurance:</h4>\s*<p>.*?</p>', '<h4>Liability and Clinical Malpractice Insurance:</h4>'+coverage, s['bodyHtml'], flags=re.S)
    else:
        s['bodyHtml'] = s['bodyHtml'].split('<h4>Insurance and Liability Coverage:</h4>')[0]+'<h4>Insurance and Liability Coverage:</h4>'+coverage
source['importNotes'] = [n for n in source['importNotes'] if n['key'] != 'insurance-confirmed']
source['importNotes'].append({'key':'insurance-confirmed','message':'October 10 owner confirmation: the companies provide liability and clinical malpractice insurance, including clinical student placements. Replaces the prior malpractice exclusion. Carrier, limits and individual claim determinations are not asserted.'})
updates = read('itsco-draft-updates.json')
updates['updates'] = [u for u in updates['updates'] if u['id'] != 'itsco-source-insurance']
updates['updates'].append({'id':'itsco-source-insurance','status':'draft','subject':'Practice-provided liability and clinical malpractice insurance','changed_content':coverage,'rationale':source['importNotes'][-1]['message'],'handbook_section_slug':'benefits-overview','policy_section_slugs':slugs,'related_section_slugs':[],'link_origin':'source_review'})
audit = read('itsco-reconciliation.json')
insurance_audit = []
for slug in slugs:
    body = next(s['bodyHtml'] for s in source['sections'] if s['slug'] == slug)
    digest = hashlib.sha256(body.encode()).hexdigest()
    entry = next((s for s in audit['sections'] if s['slug'] == slug), None)
    if entry is None:
        entry = {'slug':slug,'kind':'replaced','updateEntryIds':[]}
        audit['sections'].append(entry)
    if 'itsco-source-insurance' not in entry['updateEntryIds']: entry['updateEntryIds'].append('itsco-source-insurance')
    entry.update(bodySha256=digest,latestAuthorization='2026-10-10: owner confirmed practice-provided clinical malpractice and liability insurance')
    insurance_audit.append({'slug':slug,'beforeBodySha256':hashlib.sha256(prior[slug]['bodyHtml'].encode()).hexdigest(),'bodySha256':digest})
write('itsco.json',source)
write('itsco-draft-updates.json',updates)
write('itsco-reconciliation.json',audit)
write('insurance-coverage-reconciliation.json',{'authorization':source['importNotes'][-1]['message'],'sections':insurance_audit})
print('Insurance coverage reconciled in 3 shared sections; no database writes.')
