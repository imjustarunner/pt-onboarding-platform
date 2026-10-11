"""Generate staff facilities editions and quizzes without publishing.

The supplied attachment contains credentials. Only a redacted archival copy may
be stored in this repository; credentials must never enter guide or AI sources.
"""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'content/facilities-guides'
OUT.mkdir(parents=True, exist_ok=True)
KEY = 'facilities-guide'
sections = []
def add(slug, title, body):
    sections.append(dict(slug=slug, title=title, body_html=body, parent_slug=None, sort_order=len(sections), content_status='ready', source_page=None))

add('facilities-overview', 'Welcome · Shared spaces, thoughtful care', '''
<p>A calm, secure and well-prepared office supports the people who work and receive services here. This guide explains how to use shared space, coordinate room access, protect information and leave the office ready for the next person.</p>
<p>It covers operations and facilities. It does not establish employment terms, clinical authority, billing rules or compensation rates. Use your company’s current Workplace Handbook and applicable program procedures for those matters.</p>
<p>The guide is available in the app’s Library, onboarding, My Learning/Plotline and on-demand learning. Required onboarding and supervisor- or administrator-assigned training follow the app’s paid-time workflow. Optional review and retakes are on your own time. Completion records orientation; it does not grant building access or certify an office procedure.</p>
<p><a href="/workplace-handbook">Open your company’s Workplace Handbook</a></p>''')
add('locations-and-scope', 'Our office locations', '<p>Company-specific locations are supplied with each edition.</p>')
add('access-and-security', 'Access, credentials and security', '''
<p>Office access is based on role, assignment and approved use. Enter only for authorized work and use only spaces assigned or confirmed for your visit. Sharing a building does not grant access to another agency’s client records, systems or restricted areas.</p>
<p>Door codes, computer passwords, network credentials and camera sign-ins are confidential access information. Obtain current instructions privately from authorized operations staff. Do not place credentials in guide edits, quizzes, ordinary task descriptions or the guide’s question box. Do not share your access with a visitor or colleague who lacks authorization.</p>
<p>This guide and its Q&amp;A do not contain access credentials or grant access. If access fails or you believe a credential was disclosed, contact authorized operations staff through the app. Do not try to bypass a lock or security control.</p>''')
add('entry-exit-and-alarms', 'Entry, exit and alarm instructions', '''
<p>Know the approved entry, exit and alarm procedure for the actual location before your first use. Secure an unattended space after use and confirm whether staff or sessions remain before beginning a final closing sequence.</p>
<p>The supplied Windchime instructions describe alarms as not engaged at the time of writing. Confirm the current status with operations; do not assume an alarm remains inactive. Only authorized staff may arm or disarm a system using the current site instructions. Notify operations promptly if an alarm is triggered accidentally.</p>
<p>If unsure how to secure the space, obtain help from an administrative or operations team member before leaving. Use the app for internal coordination. Immediate danger still requires the appropriate emergency response.</p>''')
add('shared-offices', 'Shared offices and professional use', '''
<p>Offices are shared unless specifically designated otherwise. Leave each room neutral, clean and ready for the next user. Remove personal items after use unless approved; reset furniture and materials, dispose of trash and protect client privacy.</p>
<p>An empty-looking room is not permission to enter or occupy it. Check its assignment and actual availability in the app, and confirm any change with operations or the assigned provider through the app. Do not interrupt a session to investigate availability.</p>
<p>Use office supplies responsibly and only for work. Respect the next appointment and leave enough time for an appropriate room reset.</p>''')
add('office-scheduling', 'Scheduling and temporary room use', '''
<p>Keep in-office availability accurate in the app. Room bookings depend on approved availability and assignment, and support staff schedule in-office clients using those records.</p>
<p>For temporary use, check availability and use the app’s office request or scheduling workflow. Obtain the required confirmation before occupying a room. If a room is assigned but appears unused, confirm with the assigned provider or operations through the app. A temporary booking does not establish recurring rights.</p>
<p>Printed calendars and Google Chat are not the room-booking workflow. Do not rely on a handwritten reservation or a separate conversation that leaves the app’s schedule inaccurate. If you cannot access the correct app workflow, ask operations to coordinate the request there.</p>''')
add('recurring-space-and-presence', 'Recurring changes and on-site presence', '''
<p>Request a recurring change to your room, day or time through the app’s office scheduling/operations workflow. The Clinical Practice Assistant or designated operations representative reviews the change and confirms the approved arrangement in the app.</p>
<p>Assigned availability does not by itself require physical presence when no client or work task is scheduled. Follow your actual assignments and the Workplace Handbook. Coordinate room use for administrative or other non-client work with operations rather than occupying a clinical room without confirmation.</p>
<p>Do not use an old company email address or outside calendar as a substitute for the app request and approval record.</p>''')
add('cleanliness-and-maintenance', 'Daily care, maintenance and supplies', '''
<p>Leave shared areas welcoming: remove trash, reset furniture, return approved materials and tidy after each session. Report spills, damage, equipment faults, low supplies and safety concerns promptly through the app’s support or operations workflow, identifying the location and room.</p>
<p>Windchime’s supplied operating arrangement includes a professional cleaning service every two weeks, with designated staff helping tidy and restock between visits. Daily room care remains each user’s responsibility; check current operations notices for changes to the cleaning schedule.</p>
<p>For a hazard, take appropriate immediate safety action and alert the responsible staff; do not rely on an unattended app request for an urgent response. Do not attempt electrical, lock or other repairs beyond an authorized basic cleanup. Do not remove supplies for personal use.</p>''')
add('computers-and-devices', 'Computers and shared devices', '''
<p>Shared devices are for authorized work. Use approved access, protect your session while away, and sign out of all work systems when finished. Do not save personal files or leave client documents exposed on a shared device.</p>
<p>Request current device-access instructions privately from operations. No shared computer password is published in this guide. Report a fault or suspected unauthorized access through the app’s support workflow and follow the appropriate security response.</p>''')
add('printers-and-equipment', 'Printers and office equipment', '''
<p>Use the posted instructions for the specific printer and confirm that it is the correct destination before sending a job. The supplied Windchime inventory lists a large white/tan printer that is not wireless, an HP 6000 printer and a Brother printer connected to Wi-Fi. Equipment and connections may change; confirm current setup with operations.</p>
<p>For a large print job, use the approved workstation and access method provided by operations. Collect printed material promptly, protect confidential documents and sign out when finished. Report faults and supply needs in the app. Do not install an unapproved driver or use a personal workaround to bypass access controls.</p>''')
add('network-access', 'Wi-Fi and network access', '''
<p>Staff-only networks are restricted to authorized use. Operations supplies the current network and access instructions privately. Use the designated guest network for non-staff users when available; do not share staff network credentials with a client or visitor.</p>
<p>Use approved devices and secure work practices when accessing organizational or client information. Report connection problems through the app’s support workflow; do not disable security controls to establish a connection.</p>''')
add('cameras-and-privacy', 'Lobby cameras · Purpose and privacy', '''
<p>The supplied Windchime procedure describes live-view cameras for operational awareness, such as noticing client arrival in the lobby. The approved mode is live view only, without audio or video recording. Operations must confirm the current configuration and authorized access; this guide cannot verify device settings.</p>
<p>Use an approved viewer only as directed by operations and only for authorized workflow or client coordination. Multi-view may display the authorized lobby views together. Do not use cameras to supervise or monitor colleagues, for personal interest or for other non-work purposes. Do not record, capture or share a feed.</p>
<p>Viewer access is issued privately to authorized staff; this guide contains no shared camera account or password. Report misuse or unexpected recording through the app’s appropriate support/privacy workflow and follow urgent safety procedures when needed.</p>''')
add('windchime-doors-and-locks', '437 Windchime · Doors and locks', '''
<p>These door instructions apply to <strong>437 Windchime</strong>. Do not assume they apply at another site.</p>
<p>Do not attempt to lock an exterior door with a key while its handle is in the “open” position. Improper locking can prevent re-entry. If you are unsure of the correct handle position or procedure, obtain assistance from operations before leaving rather than testing an unfamiliar sequence.</p>
<p>Interior keypad access uses credentials and instructions supplied privately to authorized staff. Keep the entry private and follow the current instructions for the installed lock. Access codes and keypad-entry tricks are not part of this searchable guide.</p>''')
add('windchime-opening-and-closing', '437 Windchime · During the day and closing', '''
<h3>During operating hours</h3><p>Check room assignments and use indicators before assuming the office is empty. Red “IN USE” indicators or a closed office door with lights on may indicate an active session. Do not interrupt or expose a client’s privacy. Resolve uncertainty with staff through the app or direct on-site coordination.</p>
<h3>Before the last staff member leaves</h3><ol><li>Confirm that no sessions, clients or staff remain in the space; a quiet lobby alone is not enough.</li><li>Reset shared spaces, secure work information and sign out of shared devices.</li><li>Turn off lights after confirming the spaces are no longer in use.</li><li>Follow the current, verified alarm instructions if applicable.</li><li>Secure the exterior door using the approved Windchime procedure and confirm it is secured. Obtain help if unsure.</li></ol>
<p>Follow the same closing expectations after hours. Do not lock others out or treat this checklist as a substitute for instruction on the actual door and any active alarm.</p>''')
add('safety-and-visitors', 'Safety, emergencies and visitors', '''
<p>Know the posted exits, site safety instructions and designated contacts. Keep clients and visitors in designated areas and maintain professional boundaries. Do not admit an unauthorized person to a restricted area or share credentials to solve an access problem.</p>
<p>For immediate danger or a medical emergency, use the appropriate emergency response, including 911 when appropriate, and alert responsible on-site staff. An app message or support ticket is not a substitute for emergency assistance.</p>
<p>Report unsafe conditions promptly and document the relevant facts through the app after immediate needs are addressed. Follow your company’s clinical and reporting procedures where applicable; this operational guide does not replace them.</p>''')
add('questions-and-updates', 'Questions, issues and future updates', '''
<p>For office access, room scheduling, supplies, maintenance, equipment and routine safety questions, contact the designated administrative or operations representative through the app. Include the site, room, issue and any relevant time or urgency without exposing credentials or unnecessary client information.</p>
<p>Use the latest published guide and review assigned changes. A facilities update does not automatically change clinical scope, compensation or permission to access a room or system. Authorized administrators update and publish the guide through the company document workflow.</p>
<p>Keep workplace forms, requests, internal records and timekeeping in the app. Current door, alarm and camera credentials remain in the approved restricted access process rather than in the general guide or its Q&amp;A.</p>''')

cleaned = subprocess.run(['node','--input-type=module','-e',"import fs from 'node:fs';import {cleanHandbookHtml} from './backend/src/services/workplaceHandbookContent.js';const a=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(a.map(s=>({...s,body_html:cleanHandbookHtml(s.body_html)}))));"],cwd=ROOT.parents[1],input=json.dumps(sections),text=True,capture_output=True,check=True)
sections=json.loads(cleaned.stdout)
source=dict(documentKey=KEY,title='Operations & Facilities Guide',organization='Company',sourceDate='2026-10-10',edition='Shared spaces · 437 Windchime',learningPurpose='facilities',sections=sections)
(OUT/'shared.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n')
qs=[
 ('location','Where do the door and closing procedures in this guide apply?', ['Every agency location uses identical locks.','437 Windchime; obtain the actual local procedure for any other site.','Any building with an available office.'],1,'Windchime instructions are location-specific; sharing a company does not make another building identical.','windchime-doors-and-locks'),
 ('access','Where should staff obtain current access credentials?', ['From a guide question or ordinary task description.','From another visitor.','Privately through authorized operations staff and the approved access process.'],2,'The searchable guide and its Q&A do not distribute credentials or grant building access.','access-and-security'),
 ('room','A room looks empty but has an assignment. What should you do?', ['Check the app and confirm availability with the assigned provider or operations before use.','Use it until somebody arrives.','Write a reservation on a printed calendar.'],0,'Temporary use requires the app workflow and confirmation, and does not grant recurring rights.','office-scheduling'),
 ('closing','The lobby is quiet at the end of the day. What happens before locking up?', ['Assume all sessions ended.','Confirm no sessions, clients or staff remain, then follow the location’s closing and security instructions.','Turn off every light immediately.'],1,'Use indicators and appropriate coordination; a quiet lobby is not proof the building is empty.','windchime-opening-and-closing'),
 ('cameras','What is the approved purpose of the live-view lobby cameras?', ['Operational awareness and client coordination, within authorized access and no recording.','Checking whether colleagues are working.','Saving clips for later review.'],0,'Do not record or use the system for supervision, colleague monitoring or personal interest.','cameras-and-privacy'),
 ('urgent','What should you do when there is immediate danger?', ['Submit a ticket and wait.','Finish routine room cleanup.','Use the appropriate emergency response and alert on-site staff; document in the app afterward.'],2,'App messages and tickets do not replace emergency assistance.','safety-and-visitors')]
reading=['facilities-overview','locations-and-scope','access-and-security','entry-exit-and-alarms','shared-offices','office-scheduling','cleanliness-and-maintenance','computers-and-devices','network-access','cameras-and-privacy','windchime-doors-and-locks','windchime-opening-and-closing','safety-and-visitors']
# Company location sections are included in the hashes by the source registry at
# build time, so a location change invalidates the matching quiz approval.
for tenant in ['itsco','nlu','isi']:
    # Same operation as the registry, retained here to make the generation standalone.
    location = '<p><strong>437 Windchime</strong> is the shared office used by ITSCO, Next Level Up and Inner Strength Institute. The building-specific door, camera and closing instructions in this guide refer to that location only.</p>'
    location += ('<p>ITSCO also uses a Denver office. Its office-specific procedures are <strong>coming soon</strong>; they have not been supplied or verified in this edition. Before working there, obtain the current Denver access, safety and closing instructions from operations. Do not apply Windchime’s instructions to Denver.</p><p><a href="#facilities-guide-denver-procedures">Denver · Procedures coming soon</a></p>' if tenant=='itsco' else '<p>This company’s facilities edition covers 437 Windchime. It does not authorize use of another location. Confirm any approved location change with operations before use.</p>')
    copy=[dict(s,body_html=location) if s['slug']=='locations-and-scope' else s for s in sections]
    (OUT/f'{tenant}-locations.json').write_text(json.dumps(dict(body_html=location),ensure_ascii=False,indent=2)+'\n')
    definition=dict(documentKey=KEY,tenants=[tenant],onboardingAudience='staff',title='Operations & Facilities Guide · Read & check',description='Shared office use, room scheduling, access, privacy and closing at 437 Windchime.',requiredSections=reading,questions=[dict(zip(['id','prompt','options','correctAnswer','explanation','sourceSlug'],q)) for q in qs],passingScore=100,sectionHashes={s['slug']:hashlib.sha256(s['body_html'].encode()).hexdigest() for s in copy if s['slug'] in reading})
    (ROOT/f'content/document-training/facilities-guide-{tenant}.json').write_text(json.dumps(definition,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'sharedSections':len(sections),'editions':['itsco','nlu','isi'],'questions':len(qs)}))
