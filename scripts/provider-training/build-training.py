#!/usr/bin/env python3
"""Build the reference manual, editable PowerPoint, course packets and inventories.

Uses only Python's standard library. Render PDF/slide images separately with
render-training.cjs and installed Chrome. Never reads application credentials.
"""
import csv
import hashlib
import html
import json
import pathlib
import shutil
import struct
import subprocess
import zipfile
from xml.etree import ElementTree

ROOT = pathlib.Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'frontend/public/auricwell/provider-training'
OUT = pathlib.Path('/Users/mendez/PTOnboardingApp/deliverables/secure-session-comments-and-provider-training-2026-11-11')
GUIDE = json.loads((ROOT / 'frontend/src/content/provider-transition.json').read_text())
policy = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', f'import {{ FAMILY_COMMUNICATION_NOTICE as notice, FAMILY_COMMUNICATION_POLICY_VERSION as version }} from {json.dumps((ROOT / "frontend/src/navigation/familyCommunicationPolicy.js").as_uri())}; process.stdout.write(JSON.stringify({{ notice, version }}));'], text=True))
GUIDE['communicationPolicy'] = {'title':policy['notice']['title'], 'text':' '.join(policy['notice']['statements']), 'notice':policy['notice']['acknowledgment'], 'version':policy['version']}
PUBLIC.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'COMMUNICATION-POLICY.json').write_text(json.dumps(policy, indent=2, ensure_ascii=False))
esc = html.escape

def image_for(module):
    return f"screenshots/{module['image']}.png"

def caption(module):
    if module['image'].startswith('secure-'):
        return 'Actual release-candidate application component · Synthetic fixture-only capture · No live records, saves or sends. See SECURE-COMMENTS-CAPTURE-MANIFEST.json. Live acceptance is separate.'
    if module['image'] in ['account', 'learning', 'clinical']:
        return 'Actual application component · Local synthetic training preview · No live records, saves or sends · Source checkout 912a48c05 + training changes. Not live acceptance.'
    return 'Actual synthetic QA · Provider Avery (1433) · Agency 450 · Chrome 1440×1000 · November 11, 2026 · Build in CAPTURE-MANIFEST.json. Actions depend on role/configuration.'

STYLE = '''*{box-sizing:border-box}body{margin:0;color:#18304d;background:#f3f6fa;font:16px/1.8 system-ui,sans-serif}main{max-width:1050px;margin:auto;padding:48px 32px}header{padding:30px 34px;background:#073a78;color:white;border-radius:18px;border-bottom:6px solid #e9b32b}h1{font-size:39px;line-height:1.15;margin:10px 0 18px}h2{font-size:27px;line-height:1.25;color:#0b3264}h3{font-size:19px;color:#143e72}a{color:#075b9b;overflow-wrap:anywhere}.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase}.scope{font-size:13px;color:#53677e}.topic{background:white;border:1px solid #d8e2ed;border-radius:12px;padding:28px 34px;margin:28px 0;break-before:page}.status{background:#fff3d4;border-radius:8px;padding:10px 15px;font-size:12px}.topic img{width:100%;height:auto;border:1px solid #d6e0ec;border-radius:9px}figure{margin:22px 0}figcaption{font-size:11px;line-height:1.65;color:#576b81}.practice{background:#edf4fd;border-left:4px solid #135c9c;padding:16px 22px;border-radius:0 9px 9px 0}.pitfall{background:#fff8e8;padding:14px 19px;border-left:3px solid #e4ac28}li{margin:11px 0}.sources{font-size:11px;overflow-wrap:anywhere}.toc{columns:2;column-gap:35px}.toc li{break-inside:avoid}button{font:inherit;padding:10px 15px;border-radius:6px;border:1px solid #6c8bad;background:white;color:#123c6f}.filter{margin:25px 0}input{font:inherit;width:100%;padding:12px;border:1px solid #b7c9dd;border-radius:8px}footer{font-size:12px;color:#526b84;margin-top:25px}@media(max-width:650px){main{padding:20px 15px}header,.topic{padding:22px}h1{font-size:31px}.toc{columns:1}}@media print{@page{size:A4;margin:16mm}body{background:white;font-size:10pt;line-height:1.6}main{padding:0;max-width:none}header{padding:20px}.filter,.no-print{display:none}.topic{padding:0;border:0;border-radius:0;margin:0}.topic img{max-height:72mm;object-fit:contain}h1{font-size:28pt}h2{font-size:22pt}h3{font-size:13pt}.toc{columns:2}figure,.practice,.pitfall{break-inside:avoid}li{margin:7px 0}.status{font-size:9pt}.sources{font-size:8pt}}'''

topics = []
for module in GUIDE['modules']:
    steps = ''.join(f'<li>{esc(s)}</li>' for s in module['steps'])
    sources = '<br>'.join(esc(s) for s in module['sources'])
    figures = ''.join(f'<figure><a href="{image_for(figure)}" target="_blank" rel="noopener"><img src="{image_for(figure)}" alt="{esc(figure["alt"])}"></a><figcaption>{esc(caption(figure))}</figcaption></figure>' for figure in module.get('additionalImages', []))
    topics.append(f'''<section class="topic" id="{module['id']}"><p class="eyebrow">{esc(module['category'])} · {module['minutes']} minute practice</p><h2>{esc(module['title'])}</h2><p>{esc(module['summary'])}</p><p class="status">{esc(module['status'])}</p><figure><a href="{image_for(module)}" target="_blank" rel="noopener"><img src="{image_for(module)}" alt="{esc(module['imageAlt'])}"></a><figcaption>{esc(caption(module))}</figcaption></figure>{figures}<h3>Do the work</h3><ol>{steps}</ol><div class="practice"><h3>Supervised synthetic practice</h3><p>{esc(module['practice'])}</p><p><strong>Check the result:</strong> {esc(module['check'])}</p></div><p class="pitfall"><strong>Watch for:</strong> {esc(module['pitfall'])}</p><p class="sources"><strong>Source evidence:</strong><br>{sources}</p></section>''')
toc = ''.join(f'<li><a href="#{m["id"]}">{esc(m["title"])}</a></li>' for m in GUIDE['modules'])
manual = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AuricWell provider field guide</title><style>{STYLE}</style><main><header><p class="eyebrow">AuricWell · Provider transition · Edition {GUIDE['edition']}</p><h1>{esc(GUIDE['title'])}</h1><p>{esc(GUIDE['subtitle'])}</p></header><p class="scope">{esc(GUIDE['scope'])}</p><p class="scope">Reference and practice. This manual records no course completion, paid time, clinical signature or cutover approval. Keep real people out of training exercises. New-feature and trial status is labeled beside the relevant topic.</p><div class="filter"><label for="search">Search this manual</label><input id="search" type="search" placeholder="Try scheduling, email, note, school…"></div><aside class="practice"><h2>{esc(GUIDE['communicationPolicy']['title'])}</h2><p>{esc(GUIDE['communicationPolicy']['text'])}</p><p><strong>Acknowledgment · {esc(GUIDE['communicationPolicy']['version'])}:</strong> {esc(GUIDE['communicationPolicy']['notice'])}</p></aside><h2>Choose a topic</h2><ol class="toc">{toc}</ol>{''.join(topics)}<footer>Prepared from current source and synthetic UI. Capture provenance is supplied in screenshots/CAPTURE-MANIFEST.json. Provider training is not a substitute for clinical policy or agency authorization.</footer></main><script>document.getElementById('search').addEventListener('input',e=>{{const words=e.target.value.toLowerCase().trim().split(/\\s+/).filter(Boolean);document.querySelectorAll('.topic').forEach(section=>section.hidden=!words.every(word=>section.textContent.toLowerCase().includes(word)));}});</script></html>'''
(PUBLIC / 'PROVIDER-FIELD-GUIDE.html').write_text(manual)

with (OUT / 'FEATURE-INVENTORY.csv').open('w', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(['feature_id', 'audience', 'category', 'feature', 'status', 'what_to_demonstrate', 'result_check', 'source_evidence', 'live_claim_limit'])
    for m in GUIDE['modules']:
        writer.writerow([m['id'], 'Provider; supervisor where authorized', m['category'], m['title'], m['status'], m['practice'], m['check'], ' | '.join(m['sources']), 'Source verification and labeled screen capture only; full workflow acceptance remains separate.'])
with (OUT / 'PRACTICE-CHECKLIST.csv').open('w', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(['topic_id','category','exercise','observable_result','participant','status','evidence','follow_up'])
    for m in GUIDE['modules']:
        writer.writerow([m['id'],m['category'],m['practice'],m['check'],'','NOT_RUN','',''])

course_packets = []
for category in dict.fromkeys(m['category'] for m in GUIDE['modules']):
    modules = [m for m in GUIDE['modules'] if m['category'] == category]
    course_packets.append({'category':category,'title':f'AuricWell transition · {category}','edition':GUIDE['edition'],'estimated_minutes':sum(m['minutes'] for m in modules),'purpose':'Optional reference/practice; administrator may create an assigned version through the existing training editor after review.','lessons':[{'title':m['title'],'source_topic':m['id'],'content_blocks':[{'contentType':'text','contentData':{'html':f'<h2>{esc(m["title"])}</h2><p>{esc(m["summary"])}</p><ol>'+''.join('<li>'+esc(s)+'</li>' for s in m['steps'])+'</ol>'}},{'contentType':'image','contentData':{'url':'/auricwell/provider-training/'+image_for(m),'alt':m['imageAlt'],'caption':caption(m)}},{'contentType':'text','contentData':{'html':f'<h3>Practice</h3><p>{esc(m["practice"])}</p><h3>Check your result</h3><p>{esc(m["check"])}</p>'}}]} for m in modules]})
(OUT / 'ON-DEMAND-COURSE-CONTENT.json').write_text(json.dumps({'schema':'authoring-content-packet-v1','not_an_import_api_payload':True,'instructions':'Copy the reviewed text/image blocks into the existing training module editor under the listed category. Do not post this packet blindly to an API, overwrite assigned editions, or mark progress completed.','communication_policy':policy, 'communication_policy_source':'frontend/src/navigation/familyCommunicationPolicy.js', 'courses':course_packets},indent=2))
(OUT / 'ON-DEMAND-SETUP.txt').write_text('''AURICWELL PROVIDER TRANSITION — ON-DEMAND SETUP

The searchable field guide is integrated into existing My Learning > On-Demand.
Direct entry: /my-learning?learning=on-demand&guide=provider-transition
Use the ordinary organization prefix when present. Existing My Learning authentication
and route access remain in force. No assigned course, completion, certificate or time
record is created by reading this reference or checking its temporary practice boxes.

Six categories are supplied in ON-DEMAND-COURSE-CONTENT.json. This is a content packet
for the existing editor, not a claim of a supported bulk-import API. An authorized
training administrator can create modules using the ordinary text/image lesson blocks,
review their edition and scenarios, select the agency, then choose on-demand visibility.
Any later required assignment must use the existing training assignment and completion
workflow. Preserve already assigned course versions and all prior progress.

Suggested learning path: Start here -> Scheduling -> Clinical documentation ->
Communication -> Team workflows -> Transition. New Secure Session Comments and the
supervised EHR Transition trial keep their acceptance/rollout labels until verified.
The practice CSV records trainer evidence, not clinical sign-off or payroll credit.

Source: MyLearningView.vue, DocumentLearningCatalog.vue, TrainingBlockRenderer.vue,
trainingContentTypes.js, companyDocumentLearning.service.js and the training editor.
''')

meeting = '''AURICWELL PROVIDER TRANSITION — FACILITATOR MEETING OUTLINE
Edition November 11, 2026 · Plan 90 minutes plus a supervised practice block.
Use synthetic people and an authorized training agency. Do not sign real records,
send real-family demonstrations, change rollout/coverage gates or retire source access.

BEFORE THE MEETING
- Confirm the current frontend/API build and each provider's own account, agency,
  assignments, service eligibility and booking rollout. Verify actual browser/device access.
- Agree on the provider's cutover date and source-of-truth for calendars, unfinished
  TherapyNotes records, balances/claims and Gmail/Workspace routing. Name a support owner.
- Prepare one assigned synthetic client, a reviewed appointment, an unsigned note and
  a controlled communication recipient. Check that training images show only QA people.
- Open the manual from My Learning > On-Demand and the PowerPoint speaker notes.
- Read current feature/rollout status. Do not announce the new comments feature before
  the synthetic permission/encryption/delivery/day-behavior acceptance is complete.

0–8 MINUTES — THE DAILY MAP
Show own name/company, My Schedule, My Work/Note Workspace, Tasks, Messages, notifications,
My Learning and normal Unlock. Explain which item owns the appointment and which owns
the documentation. Ask each provider to find all entry points on their own account.

8–25 MINUTES — BOOK AND CHANGE THE RIGHT VISIT
Demonstrate client search/identity/assignment, service eligibility, start/end/timezone,
duration, office/telehealth location, recurrence, conflicts and notification review.
Reopen the saved occurrence. Change one synthetic visit and inspect an unaffected week.
Explain school planning vs booked sessions, office reservations and protected history.
Show browser-audio join; phone dial-in is separate. Do not fabricate attendance.

25–45 MINUTES — CLINICAL WORK FROM THE SAME APPOINTMENT
Show chart setup, enrollment vs clinical intake, current plan and release. Start the
linked note, confirm provider/code/time/duration/POS and service-specific fields. Fresh
unassessed answers stay blank; generated language still needs clinical judgment.
Save/reload/reopen the same draft from My Work/Tasks. Explain sign/cosign and billing
boundaries without signing a record. Review goals/objectives, original effective date,
review interval/reminder, imported unsigned source and blank-goal validation.

45–65 MINUTES — COMMUNICATION WITH THE RIGHT PEOPLE
Show secure vs ordinary mail, sender/To/CC/school, authenticated attachment access,
history states and why sent is not receipt. Demonstrate the new session comment only
on an accepted release: exact occurrence, full named eligible family audience, send/read,
one comment per person/appointment/client, 250-character counter, Edit my comment,
Edited date/time and current-version-only access for a newly eligible guardian. Also show the
generic email link, past-session history, today overlay, snooze and dismiss controls.
Explain prominently: secure means encrypted/protected, not private from other currently
eligible family users. Provider and family shared portal messages/comments use the same full eligible audience;
both parents see them when eligible. Read I Understand and every explicit recipient name before Send.
Individual nonshareable concerns belong in a private scheduled session or individual
ordinary email. Ordinary email is separate from the encrypted portal and should not be
assumed confidential for clinical details. Portal messages
and comments are not therapy, therapeutic intervention or a session substitute.
Show guardian independence and current ROI decisions. Family-authored session comments
go to all currently eligible family users for that child plus the provider; the composer
discloses that audience before posting. Provider and family shared portal communications use that same full eligible family audience.
New guardians do not automatically gain earlier comments. Morning reminders run at 7:00 AM
in the provider schedule's local timezone, without private comment text in email.
Family Welcome: providers write preferred wording using labeled automatic-field buttons,
preview each school, insert own profile, save/reopen and check isolation. Explain welcome
at assignment, second contact 48 hours later (consented text or email), final at 96 hours,
and stop-on-reply. This does not restart old sequences or expand pilot rollout.

65–75 MINUTES — TEAM RESPONSIBILITIES AND SUPPORT
Open linked tasks and the actual supervisor queue. Explain attendance/time/notes/payroll
as separate facts. Route insurance/COB/verification and assignment blocks to the right role.
Show a useful issue report with exact screen/time/error/reference and minimum private detail.

75–85 MINUTES — THE CUTOVER REHEARSAL
One provider/client/week: compare existing identity, contacts and insurance; preserve
original dates/authors; verify every client-specific PDF volume; review agenda timezone,
service/location/recurrence and duplicates. Keep source EHR access until reconciliation.
Explicitly assign old/future calendar and email ownership; a successful import is not
permission to switch every provider, turn on rollout, or close Workspace/TherapyNotes.

85–90 MINUTES — TEACH-BACK AND NEXT ACTIONS
Each provider explains how they book, open the same note, inspect all secure recipients,
edit an automatic-field template, find the manual and report an access/coverage block.
Record actual practice results in PRACTICE-CHECKLIST.csv. List unresolved access/device/
rollout questions and a responsible person/date. Do not mark training complete from
attendance alone; use the existing assigned learning controls where required.

AFTER THE MEETING
Run small supervised batches by provider, then check saved appointments and unsigned
drafts. Review send/delivery before any retry. Capture feedback and update this edition
only after checking source/release behavior. Protect historical records and prior training
progress. Do not count deferred payments or an untested device/permission branch as passed.
'''
(OUT / 'MEETING-OUTLINE.txt').write_text(meeting)

# PowerPoint uses native text and images, with full instructions in speaker notes.
NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
def xml(text): return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+text
def relationships(items): return xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/{kind}" Target="{target}"/>' for rid,kind,target in items)+'</Relationships>')
def text_box(identifier, x, y, width, height, paragraphs, size=2000, color='163454', bold=False):
    paras = ''.join(f'<a:p><a:r><a:rPr lang="en-US" sz="{size}" b="{1 if bold else 0}"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t xml:space="preserve">{esc(p)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>' for p in paragraphs)
    return f'<p:sp><p:nvSpPr><p:cNvPr id="{identifier}" name="Text {identifier}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{width}" cy="{height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>{paras}</p:txBody></p:sp>'
def picture(identifier, filename, x,y,w,h):
    return f'<p:pic><p:nvPicPr><p:cNvPr id="{identifier}" name="{esc(filename)}" descr="Actual synthetic training application screen; see capture provenance"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
def image_size(file):
    with file.open('rb') as f: return struct.unpack('>II', f.read(24)[16:24])
def short(text, limit=145):
    return text if len(text)<=limit else text[:limit].rsplit(' ',1)[0]+'…'

slides = [{'title':'Your AuricWell workday', 'category':'Provider transition · November 11, 2026','summary':'A practical move from Gmail / Workspace and TherapyNotes.','image':'screenshots/schedule.png','caption':'Actual synthetic QA My Schedule. Availability depends on your agency, role and release.','points':['Book the right session.','Document from the same appointment.','Communicate with the right people.','Reconcile before cutover.'],'notes':meeting}]
slides.append({'title':'What secure portal sharing means','category':'Read this before your first send','summary':'Provider and family portal messages/comments use the full currently eligible family audience.','image':'screenshots/secure-audience.png','caption':'Actual release-candidate audience component · Fictional fixtures · Live acceptance is separate.','points':['Read every recipient name before Send.','Both parents can read when eligible; later-added users cannot read earlier content.','For individual concerns: a private scheduled session or individual ordinary email (not the encrypted portal).','Portal comments/messages are not therapy or a substitute for sessions.'],'notes':'Policy version: '+GUIDE['communicationPolicy']['version']+'\n\n'+GUIDE['communicationPolicy']['text']+'\n\n'+GUIDE['communicationPolicy']['notice']})
for m in GUIDE['modules']:
    slides.append({'title':m['title'],'category':m['category'],'summary':m['summary'],'image':image_for(m),'caption':caption(m),'points':m['slideBullets'],'notes':m['status']+'\n\n'+ '\n\n'.join(f'{i+1}. {s}' for i,s in enumerate(m['steps']))+'\n\nPRACTICE: '+m['practice']+'\n\nRESULT CHECK: '+m['check']+'\n\nWATCH FOR: '+m['pitfall']+'\n\nSOURCES: '+'; '.join(m['sources'])})
    if m['id'] == 'session-comments':
        slides.append({'title':'One brief comment, kept current','category':'Secure Session Comments','summary':'Use a short update on the session. Use secure messages when you need more room.','image':'screenshots/secure-edit.png','caption':caption(m),'points':['Up to 250 Unicode characters.','One comment per person, appointment and client.','Edit your own comment; Edited and date/time identify the update.','An eligible new guardian sees the updated version, never earlier versions.'],'notes':'Each edit is a new version shared with the currently eligible audience. The earlier versions remain inaccessible to newly added users. Review the named recipients before every send/update. Secure messages do not have the session-comment 250-character limit. This is release-candidate component evidence, not live acceptance.'})
        slides.append({'title':'Review today’s secure updates','category':'My Schedule · Secure Session Comments','summary':'Use today’s view when you sign in; past comments remain linked to their appointments.','image':'screenshots/secure-today.png','caption':'Actual release-candidate day-list component · Fictional fixtures · Not live acceptance.','points':['Open the branded button over My Schedule.','View the specific comment to mark it opened.','Remind me in 30 minutes or Dismiss for today.','After the last session ends, use appointment icons and history.'],'notes':'The generic morning reminder runs at 7:00 AM in the provider schedule timezone when eligible unread comments apply. A newly arriving or edited unread update can trigger a new reminder. Email contains no private comment content or appointment details. Dismissal is different from opening the comment. Actual live timing, inbox receipt and independent role/privacy acceptance remain separate.'})
slides.append({'title':'Practice, then expand','category':'Teach-back and follow-through','summary':'Run the checklist in a supervised synthetic exercise and name the owner of each open issue.','image':'screenshots/learning.png','caption':'My Learning → On-Demand contains the field guide. Reading is separate from assigned completion.','points':['Find your correct company and appointment.','Save and reopen the same unsigned draft.','Check recipients and automatic fields.','Confirm cutover ownership and unresolved gates.'],'notes':'Use PRACTICE-CHECKLIST.csv. Record actual evidence. Do not count a source review or an old pass as a new live acceptance. Preserve training course editions and progress.'})

deck_html = '''<!doctype html><html lang="en"><meta charset="utf-8"><title>AuricWell provider training slides</title><style>body{margin:0;background:#dbe3ed;font-family:Arial,sans-serif;color:#14345c}.slide{width:1600px;height:900px;box-sizing:border-box;background:#f9fbfe;padding:55px 65px;position:relative;overflow:hidden;margin:30px auto;border-bottom:13px solid #e9b32b}.kicker{color:#3a6a9c;font-size:18px;letter-spacing:2px;text-transform:uppercase}h1{font-size:45px;line-height:1.15;margin:20px 0 12px;max-width:1400px}.summary{font-size:25px;line-height:1.4;margin:12px 0 25px;color:#506987}.body{display:grid;grid-template-columns:790px 1fr;gap:38px;align-items:start}.body img{width:790px;height:470px;object-fit:contain;background:white;border:1px solid #d4dfea;border-radius:12px}.caption{font-size:13px;line-height:1.6;color:#586f89}ul{padding-left:24px;margin:4px 0}li{font-size:23px;line-height:1.45;margin:0 0 24px}.foot{position:absolute;bottom:24px;left:65px;right:65px;font-size:16px;display:flex;justify-content:space-between;color:#5a738e}@media print{@page{size:1600px 900px;margin:0}.slide{margin:0;break-after:page}}</style>'''
for i,s in enumerate(slides,1):
    deck_html += f'<section class="slide" id="slide-{i}"><div class="kicker">AuricWell · {esc(s["category"])}</div><h1>{esc(s["title"])}</h1><p class="summary">{esc(s["summary"])}</p><div class="body"><div><img src="{s["image"]}" alt="{esc(s["caption"])}"><p class="caption">{esc(s["caption"])}</p></div><ul>'+''.join('<li>'+esc(p)+'</li>' for p in s['points'])+f'</ul></div><div class="foot"><span>Provider transition · Synthetic training only · Full steps in the field guide</span><span>{i:02d} / {len(slides):02d}</span></div></section>'
(PUBLIC / 'PROVIDER-TRAINING-SLIDES.html').write_text(deck_html+'</html>')

files = {}
media = {}
for s in slides:
    file = PUBLIC / s['image']
    if not file.exists(): raise SystemExit(f'Missing verified training image: {file}')
    if s['image'] not in media:
        media[s['image']] = f'image{len(media)+1}.png'
        files['ppt/media/'+media[s['image']]] = file.read_bytes()
files['_rels/.rels'] = relationships([('rId1','officeDocument','ppt/presentation.xml')])
files['ppt/presentation.xml'] = xml(f'<p:presentation {NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId1000"/></p:notesMasterIdLst><p:sldIdLst>'+''.join(f'<p:sldId id="{255+i}" r:id="rId{i+1}"/>' for i in range(1,len(slides)+1))+'</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>')
files['ppt/_rels/presentation.xml.rels'] = relationships([('rId1','slideMaster','slideMasters/slideMaster1.xml'),('rId1000','notesMaster','notesMasters/notesMaster1.xml')]+[(f'rId{i+1}','slide',f'slides/slide{i}.xml') for i in range(1,len(slides)+1)])
group='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
files['ppt/slideMasters/slideMaster1.xml'] = xml(f'<p:sldMaster {NS}><p:cSld><p:spTree>{group}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>')
files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = relationships([('rId1','slideLayout','../slideLayouts/slideLayout1.xml'),('rId2','theme','../theme/theme1.xml')])
files['ppt/slideLayouts/slideLayout1.xml'] = xml(f'<p:sldLayout {NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>{group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>')
files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = relationships([('rId1','slideMaster','../slideMasters/slideMaster1.xml')])
files['ppt/notesMasters/notesMaster1.xml'] = xml(f'<p:notesMaster {NS}><p:cSld><p:spTree>{group}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/></p:notesMaster>')
files['ppt/notesMasters/_rels/notesMaster1.xml.rels'] = relationships([('rId1','theme','../theme/theme1.xml')])
colors=''.join(f'<a:{key}><a:srgbClr val="{value}"/></a:{key}>' for key,value in [('dk1','163454'),('lt1','FFFFFF'),('dk2','123F75'),('lt2','F5F8FC'),('accent1','074987'),('accent2','E9B32B'),('accent3','4B6A8E'),('accent4','9BC4E4'),('accent5','428075'),('accent6','A55C4D'),('hlink','075B9B'),('folHlink','654A9B')])
files['ppt/theme/theme1.xml'] = xml(f'<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="AuricWell"><a:themeElements><a:clrScheme name="AuricWell">{colors}</a:clrScheme><a:fontScheme name="Aptos"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="AuricWell"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>')
for style in ['fillStyleLst','lnStyleLst','effectStyleLst','bgFillStyleLst']:
    theme=files['ppt/theme/theme1.xml'];start=f'<a:{style}>';end=f'</a:{style}>'
    inner=theme.split(start,1)[1].split(end,1)[0]
    files['ppt/theme/theme1.xml']=theme.replace(start+inner+end,start+inner*3+end)
files['ppt/slideMasters/slideMaster1.xml']=files['ppt/slideMasters/slideMaster1.xml'].replace('<p:sldLayoutId id="1"','<p:sldLayoutId id="2147483649"')
for i,s in enumerate(slides,1):
    img=PUBLIC/s['image']; iw,ih=image_size(img); boxw,boxh=6150000,3500000; ratio=min(boxw/iw,boxh/ih); w,h=int(iw*ratio),int(ih*ratio)
    body=text_box(2,450000,260000,11200000,350000,['AURICWELL · '+s['category'].upper()],1200,'466C96')+text_box(3,450000,700000,11200000,900000,[s['title']],2900,'11386B',True)+text_box(4,450000,1590000,11200000,700000,[s['summary']],1700,'4B6484')+picture(5,s['image'],450000,2400000,w,h)+text_box(6,6800000,2400000,4850000,3700000,['• '+p for p in s['points']],1850)+text_box(7,450000,6000000,6150000,500000,[s['caption']],900,'4B6484')+text_box(8,450000,6540000,11200000,200000,[f'Provider transition · Synthetic training only · {i:02d} / {len(slides):02d}'],1000,'4B6484')
    files[f'ppt/slides/slide{i}.xml']=xml(f'<p:sld {NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="F9FBFE"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>{group}{body}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>')
    files[f'ppt/slides/_rels/slide{i}.xml.rels']=relationships([('rId1','slideLayout','../slideLayouts/slideLayout1.xml'),('rId2','image','../media/'+media[s['image']]),('rId3','notesSlide',f'../notesSlides/notesSlide{i}.xml')])
    notes=text_box(2,700000,1800000,5400000,6500000,s['notes'].split('\n'),1100)
    notes=notes.replace('<p:nvPr/>','<p:nvPr><p:ph type="body" idx="1"/></p:nvPr>',1)
    files[f'ppt/notesSlides/notesSlide{i}.xml']=xml(f'<p:notes {NS}><p:cSld><p:spTree>{group}{notes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>')
    files[f'ppt/notesSlides/_rels/notesSlide{i}.xml.rels']=relationships([('rId1','slide',f'../slides/slide{i}.xml'),('rId2','notesMaster','../notesMasters/notesMaster1.xml')])
overrides=[('/ppt/presentation.xml','presentationml.presentation.main'),('/ppt/slideMasters/slideMaster1.xml','presentationml.slideMaster'),('/ppt/slideLayouts/slideLayout1.xml','presentationml.slideLayout'),('/ppt/notesMasters/notesMaster1.xml','presentationml.notesMaster'),('/ppt/theme/theme1.xml','theme')]
overrides += [(f'/ppt/slides/slide{i}.xml','presentationml.slide') for i in range(1,len(slides)+1)] + [(f'/ppt/notesSlides/notesSlide{i}.xml','presentationml.notesSlide') for i in range(1,len(slides)+1)]
files['[Content_Types].xml']=xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="xml" ContentType="application/xml"/>'+''.join(f'<Override PartName="{name}" ContentType="application/vnd.openxmlformats-officedocument.{kind}+xml"/>' for name,kind in overrides)+'</Types>')
for name,data in files.items():
    if name.endswith('.xml') or name.endswith('.rels'): ElementTree.fromstring(data)
with zipfile.ZipFile(PUBLIC/'PROVIDER-TRANSITION-TRAINING.pptx','w',zipfile.ZIP_DEFLATED) as archive:
    for name,data in files.items(): archive.writestr(name,data)

for file in PUBLIC.iterdir():
    if file.is_file(): shutil.copy2(file,OUT/file.name)
shutil.copytree(PUBLIC/'screenshots',OUT/'screenshots',dirs_exist_ok=True)
(OUT/'SLIDE-NOTES.txt').write_text('\n\n'.join(f'SLIDE {i}: {s["title"]}\n{s["notes"]}' for i,s in enumerate(slides,1)))
(OUT/'WEBSITE-UPDATER-ASSETS.zip').unlink(missing_ok=True)
with zipfile.ZipFile(OUT/'WEBSITE-UPDATER-ASSETS.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for name in ['WEBSITE-UPDATER-HANDOFF.txt','FEATURE-INVENTORY.csv','COMMUNICATION-POLICY.json']:
        archive.write(OUT/name,name)
    for file in (PUBLIC/'screenshots').glob('secure-*.png'):
        archive.write(file,'screenshots/'+file.name)
    manifest=PUBLIC/'screenshots/SECURE-COMMENTS-CAPTURE-MANIFEST.json'
    archive.write(manifest,'screenshots/'+manifest.name)
    for name in ['secure-session-button.png','secure-envelope-shield.png']:
        file=ROOT/'frontend/public/auricwell/session-comments'/name
        archive.write(file,'brand/'+name)
(OUT/'TRAINING-BUILD.json').write_text(json.dumps({'edition':GUIDE['edition'],'topics':len(GUIDE['modules']),'slides':len(slides),'powerpoint_native_text':True,'speaker_notes':True,'screenshots':'Actual synthetic QA and labeled actual release-candidate component captures; live acceptance remains separate.','communication_policy_version':policy['version'],'communication_policy_source':'frontend/src/navigation/familyCommunicationPolicy.js','communication_policy_sha256':hashlib.sha256((ROOT/'frontend/src/navigation/familyCommunicationPolicy.js').read_bytes()).hexdigest(),'generator':'scripts/provider-training/build-training.py','source_sha256':hashlib.sha256((ROOT/'frontend/src/content/provider-transition.json').read_bytes()).hexdigest()},indent=2))
print(json.dumps({'topics':len(GUIDE['modules']),'slides':len(slides),'public':str(PUBLIC),'deliverables':str(OUT)}))
