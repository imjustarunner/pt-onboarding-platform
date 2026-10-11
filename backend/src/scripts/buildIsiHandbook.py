"""Build the counseling-only ISI edition from the owner's shared policies.

Run after the shared app/insurance reconciliations and buildNluHandbook.py.
Every inherited section retains its source hash in the audit; no database writes.
"""
from pathlib import Path
import copy
import hashlib
import html
import json
import re

ROOT = Path(__file__).resolve().parents[1] / 'content' / 'handbooks'
REPO = ROOT.parents[3]
def read(name): return json.loads((ROOT / name).read_text())
def write(name, data): (ROOT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False)+'\n')
def sha(text): return hashlib.sha256(text.encode()).hexdigest()
def p(text): return '<p>'+html.escape(text, quote=False)+'</p>'
def link(slug, label): return '<a href="#handbook-'+slug+'">'+html.escape(label)+'</a>'

base = read('nlu.json')
shared = {s['slug']: s for s in read('itsco.json')['sections']}
source = copy.deepcopy(base)
source.update(key='isi', organization='Inner Strength Institute', edition='ISI · Working handbook', coverUrl='/assets/handbooks/isi-cover.png', sourceDate='2026-10-10')
for key in ['sourceOutline', 'sourceArchive', 'sourceSha256', 'operationsSources']: source.pop(key, None)
source['importNotes'] = []
removed = {s['slug'] for s in base['sections'] if s['slug'].startswith('therapy-plus-tutoring-')}
removed |= {'academic-and-educational-support-services', 'typical-duties-academic-tutor', 'typical-duties-mental-health-facilitator', 'the-collective-and-partnerships', 'the-mental-range-collective-s-goals', 'the-mental-range-collective-s-partnerships'}
renames = {'foundations-of-nlu':'foundations-of-isi', 'history-and-background-of-next-level-up':'purpose-and-background-of-inner-strength-institute'}
renames.update({s['slug']:s['slug'].replace('nlu-','isi-',1) for s in base['sections'] if s['slug'].startswith('nlu-')})
restricted = '<h4>Counseling service authorization</h4><p>Inner Strength Institute provides counseling and the clinical assessment, treatment planning and coordination needed to support that care. Only services within the counseling practice’s approved scope may be scheduled or billed. A saved compensation mapping does not authorize another service line. Any client group remains subject to express written leadership approval before advertising, enrollment or scheduling, with verified provider, supervision and payer requirements.</p>'
# These codes describe a service line outside this counseling-only edition. This
# filters the handbook inventory, not an employee's saved rates or payer setup.
excluded_codes = {'H0002','H0023','H0025','H2014','H2015','H2016','H2017','H2018','H2021','H2022','H2032','H2033','T1017','S9454','97535'}

def adapt(body):
    body = re.sub(r'<a href="mailto:[^"<>]*@(?:nextleveluplcc\.com|itsco\.health)"[^>]*>.*?</a>', 'the Support Team through the app', body, flags=re.S|re.I)
    body = re.sub(r'\b(?:support|PO|payroll|legal|compliance|leaves)@(?:nextleveluplcc\.com|itsco\.health)\b', 'the designated team through the app', body, flags=re.I)
    body = body.replace('app.nextleveluplcc.com','app.theinnerstrengthinstitute.com').replace('app.itsco.health','app.theinnerstrengthinstitute.com')
    body = re.sub(r'Next Level Up(?:, LLC)?|\bITSCO(?:, LLC)?\b', 'Inner Strength Institute', body)
    body = re.sub(r'\bNLU\b','ISI',body)
    body = body.replace('Group services and Therapy + Tutoring authorization','Group counseling authorization')
    body = body.replace('Group services: moratorium, Skill Builders and exceptions','Group counseling authorization')
    body = body.replace('written ISI program authorization or an express written exception','express written approval for group counseling')
    body = body.replace('existing written Skill Builders authorization or an express written exception','express written approval for group counseling')
    body = body.replace('Providers and Facilitators','Providers').replace('Provider or Facilitator','Provider').replace('Providers/Facilitator','Providers').replace('Non-Provider/Facilitator','Non-Provider').replace('Clinicians &amp; Facilitators','Clinicians')
    body = body.replace('The Facilitator Coding Protocol','The approved counseling coding and documentation procedures')
    body = body.replace('approved ISI centers','approved ISI offices').replace('NLU centers','ISI offices')
    body = body.replace('including office-based, telehealth, and approved skill development settings','including approved office-based and telehealth counseling settings')
    body = re.sub(r'<h4>Restricted and currently unapproved services</h4>.*?(?=<h4>|$)',restricted,body,flags=re.S)
    def filter_row(m):
        row = m.group(0)
        first = re.search(r'<t[hd]>(.*?)</t[hd]>',row,re.S)
        return '' if first and first.group(1).strip() in excluded_codes else row
    body = re.sub(r'<tr>.*?</tr>',filter_row,body,flags=re.S)
    for old,new in renames.items(): body = body.replace('#handbook-'+old, '#handbook-'+new)
    return body

sections=[]
origins={}
for old in base['sections']:
    if old['slug'] in removed: continue
    s=copy.deepcopy(old)
    s['slug']=renames.get(s['slug'],s['slug'])
    s['parentSlug']=renames.get(s['parentSlug'],s['parentSlug'])
    s['sourcePage']=None  # ISI has no source-document pagination.
    s['bodyHtml']=adapt(s['bodyHtml']); s['title']=adapt(s['title'])
    origins[s['slug']]={'source':'nlu.json','sourceSlug':old['slug'],'sourceBodySha256':sha(old['bodyHtml'])}
    sections.append(s)
by_slug={s['slug']:s for s in sections}
overrides=set()
def set_body(slug,body,title=None):
    body=re.sub(r'&lt;a href="(#handbook-[a-z0-9-]+)"&gt;(.*?)&lt;/a&gt;',r'<a href="\1">\2</a>',body)
    s=by_slug[slug]; s.update(bodyHtml=adapt(body),status='ready'); overrides.add(slug)
    if title: s['title']=title
def inherit(slug):
    old=shared[slug]
    origins[slug]={'source':'itsco.json','sourceSlug':slug,'sourceBodySha256':sha(old['bodyHtml'])}
    return adapt(old['bodyHtml'])

# Proposed company foundations, based on the website we built. No invented
# founders, opening date, locations, credentials or claims of historical events.
set_body('foundations-of-isi',p('Heal. Grow. Perform. Belong. These foundations guide how Inner Strength Institute cares for clients and supports the people who make that care possible.'),'FOUNDATIONS OF INNER STRENGTH INSTITUTE')
set_body('welcome',p('Welcome to Inner Strength Institute. Our work begins with a simple commitment: help people build the inner strength to meet life with greater resilience, connection and hope. We provide compassionate counseling for men, boys, athletes and everyone seeking a healthier, more fulfilling life.')+p('Whether your role is clinical care, supervision, student training or practice support, you help create a respectful place where people can speak honestly and make meaningful progress. We value thoughtful judgment, clear communication, privacy and care grounded in evidence.')+p('This handbook explains how we work together. Use its contents, search and handbook assistant to find the current policy, and follow the linked sections in Workplace Handbook Updates when a policy changes. Forms, records, evaluations and timekeeping belong in the app. Welcome to the team.'))
set_body('purpose-and-background-of-inner-strength-institute',p('Inner Strength Institute brings together compassionate mental health care and a belief in each person’s capacity to grow. Its public-facing message—Stronger People. Brighter Tomorrows.—expresses the purpose behind our counseling practice.')+p('The practice focuses on the pressures people carry: identity, relationships, anxiety, mood, performance and life transitions. Our website highlights men, boys and athletes while welcoming everyone on the journey toward a healthier, more resilient life.')+p('Heal, Grow, Perform and Belong describe a connected approach to care. We help clients work through distress, develop insight, meet challenges with confidence and build meaningful connection. Counseling follows the client’s needs, goals and clinical treatment plan.')+p('Our workplace puts that purpose into practice through confidential care, evidence-informed treatment, supportive supervision and a structured clinical student training program.'),'PURPOSE AND BACKGROUND OF INNER STRENGTH INSTITUTE')
set_body('mission',p('To provide compassionate, evidence-informed counseling that helps people heal, grow, navigate pressure and build lasting inner strength—within a respectful, inclusive space where they can belong.'))
set_body('vision',p('Stronger people. Brighter tomorrows. We envision a community where seeking support is a sign of strength and people can access counseling that helps them live with greater resilience, purpose and connection.'))
set_body('goals','<ol>'+''.join('<li>'+html.escape(x)+'</li>' for x in ['Make the path into counseling clear, welcoming and responsive to each client’s needs.','Provide individualized care for anxiety, stress, mood, relationships, identity and life transitions.','Support men, boys and athletes with an understanding of pressure, performance and belonging, while welcoming all clients.','Strengthen clinical judgment through supervision, reflection, evidence-informed practice and student training.','Protect privacy, document care accurately and use the app consistently for workplace records.','Support a sustainable workplace through clear expectations, fair compensation and respectful communication.'])+'</ol>')
values=[('Heal','Meet distress with compassion, safety and care that respects each person’s story.'),('Grow','Stay curious, welcome feedback and help clients and colleagues build insight and resilience.'),('Perform','Support healthy confidence and meaningful progress in life and performance, grounded in the person’s own goals.'),('Belong','Create an inclusive environment where people feel respected, heard and connected.'),('Clinical Integrity','Use evidence-informed methods, sound judgment and honest documentation within our authorized scope.'),('Confidentiality','Protect privacy and use client information only for authorized care and operations.'),('Shared Responsibility','Communicate clearly, follow through on commitments and seek support when a situation needs another perspective.')]
set_body('values',''.join('<h4>'+title+'</h4>'+p(text) for title,text in values))
set_body('service-focus-assignment',p('Inner Strength Institute is a counseling-only practice. Services include authorized individual counseling, adolescent counseling, family-related clinical care, and counseling for anxiety, stress, depression, life transitions and performance-related concerns. Clinical assessment, treatment planning and necessary care coordination support those services.')+p('Care occurs in approved offices or through approved telehealth. A service assignment does not expand credentials, supervision or payer authorization. Sports and performance support is counseling within the provider’s clinical scope; it does not establish a separate instructional or non-clinical program.'))
set_body('group-services-moratorium-and-exceptions',restricted,'Group counseling authorization')
set_body('role-descriptions-and-typical-duties',p('The following roles support the counseling practice. Duties depend on verified credentials, assigned responsibilities, supervision and the individual agreement. Clinical authority is never inferred from a job title, employment classification or compensation category.'))

career=by_slug['career-pathway-overview']['bodyHtml']
career=re.sub(r'<h4>TIER 1:.*?(?=<h4>TIER 2:)', '<h4>TIER 1: Practice Support Track</h4>'+p('Practice support roles assist with access, scheduling, records and care coordination within the assigned role. This track does not authorize independent counseling or clinical billing. Individual titles and duties follow the written role assignment. The shared category and level compensation schedule remains applicable to the assigned work.'),career,flags=re.S)
career=career.replace('Tier 1: Clinical Support Track','Tier 1: Practice Support Track')
set_body('career-pathway-overview',career)
set_body('section-a-clinical-support-providers-tier-1',p('Practice support staff help clients access counseling through assigned scheduling, intake coordination, records, client communication and operational duties. Work remains within the individual’s approved role, training and access permissions.')+p('A support role alone does not authorize assessment, diagnosis, treatment planning or independent counseling. Refer clinical questions to the assigned clinician or supervisor. Any separately authorized clinical duties require verified credentials and supervision, with the same service and payer checks that apply to other providers.')+p('Complete assigned documentation, training and actual-time records in the app. Follow '+link('section-e-non-clinical-staff','Non-clinical staff expectations')+' and '+link('service-code-compensation-and-authorizations','Service-code compensation and authorizations')+'.'),'SECTION A: Practice Support Staff (Tier 1)')
body=by_slug['typical-duties-mental-health-counselor']['bodyHtml']
body=re.sub(r'<p>Skills-group work follows.*?</p>',p('Client group counseling requires express written approval under '+link('group-services-moratorium-and-exceptions','Group counseling authorization')+'. An assigned counseling role does not independently authorize a new group.'),body,flags=re.S)
# p() escapes links; preserve the intended internal link in this one paragraph.
body=body.replace('&lt;a href="#handbook-group-services-moratorium-and-exceptions"&gt;Group counseling authorization&lt;/a&gt;',link('group-services-moratorium-and-exceptions','Group counseling authorization'))
set_body('typical-duties-mental-health-counselor',body)
set_body('training-requirements',re.sub(r'<p>Similarly, individuals participating.*?</p>','',by_slug['training-requirements']['bodyHtml'],flags=re.S))
set_body('claim-submissions-via-app',re.sub(r'<p>For a mixed counseling and tutoring visit,.*?</p>','',by_slug['claim-submissions-via-app']['bodyHtml'],flags=re.S))
set_body('isi-parent-pickup',p('The pickup procedure applies to children and clients whose approved care arrangement requires release to an authorized caregiver. Confirm the applicable consent and release arrangements in the client’s app record.')+by_slug['isi-parent-pickup']['bodyHtml'])
set_body('isi-client-elopement',p('Respond according to the client’s age, consent, clinical risk and approved care plan. Parent or guardian notification applies where that person is authorized to receive it. An adult’s departure is not by itself permission to restrain the person or disclose confidential information. Seek clinical leadership guidance and emergency help when there is immediate danger.')+by_slug['isi-client-elopement']['bodyHtml'])
overview=by_slug['student-training-program-program-overview']['bodyHtml'].split('<h4>')[0]
set_body('student-training-program-program-overview',overview+'<h4>Clinical counseling placement</h4>'+p('ISI uses the shared Student Training Program for clinical counseling practicum and internship placements. Placements occur in approved offices or approved telehealth settings. The training plan identifies permitted clinical duties, learning objectives, required supervision and the assigned clinical supervisor.')+'<p>Placement records, the training agreement, supervision, actual-time records and evaluations are maintained in the app. The '+link('clinical-development-supervision-rubric','Clinical Development Supervision Rubric')+' is the actual quarterly evaluation form. Clinical authority depends on the approved training plan, credentials, supervision and applicable payer requirements.</p>')
set_body('student-training-program-program-structure',by_slug['student-training-program-program-structure']['bodyHtml'].replace('Assignments distinguish academic tutoring, group skills and clinical counseling.','Assignments are limited to counseling and the supervised clinical and administrative work that supports the placement.'))
training_agreement={'slug':'student-training-agreement','title':'Student Training Agreement and Placement Plan','parentSlug':'student-training-program','sourcePage':None,'status':'ready','bodyHtml':'<p>The student, assigned supervisor and authorized practice representative complete the placement agreement in the app before clinical placement begins. The agreement identifies the student’s academic program, practicum or internship phase, start and end dates, approved service setting, learning objectives, permitted duties, assigned supervisor, supervision schedule and required academic coordination.</p><p>Record the applicable student or employee classification, any compensation agreement, confidentiality obligations, required orientation, emergency procedures and acknowledgment of the Student Training Program. Record changes to the placement plan in the app so the current responsibilities and supervision are identifiable.</p><p>Use '+link('supervision-and-professional-development','Student supervision and professional development')+' for required supervision, '+link('student-training-program-disclosure-and-liability','Insurance and liability coverage')+' for practice-provided coverage, and '+link('clinical-development-supervision-rubric','Appendix G: student training evaluation')+' for quarterly assessment. Keep signed agreements and individual evaluations private; the handbook shows the policy and blank form.</p><p>The agreement does not waive wage protections or expand a student’s clinical scope. Clinical services must remain authorized and supervised throughout the placement.</p>'}
sections.insert(sections.index(by_slug['student-training-program-program-overview'])+1,training_agreement); by_slug[training_agreement['slug']]=training_agreement
overrides.add(training_agreement['slug'])

# Complete the counseling edition's operations using the approved shared
# employment policies, removing school-site assignments and foreign contacts.
attendance=inherit('attendance-providers-and-facilitators')
attendance=re.sub(r'<h4>In-School Appointments:</h4>.*?(?=<h4>)','',attendance,flags=re.S)
attendance=attendance.replace(', or in schools','').replace('For a school assignment, use the app’s authorized school communication workflow to notify the assigned school contact. ','').replace('school closures','office closures')
set_body('attendance-providers-and-facilitators',attendance,'Attendance Guidelines for Counseling Providers')
set_body('mileage-reimbursement-policy',p('Business travel must be assigned or approved in advance. Request travel approval and submit the date, purpose, route and actual eligible mileage in the app. The written approval and applicable reimbursement requirements govern the amount; this counseling edition does not establish an automatic mileage rate or commuting benefit.')+p('Record compensable travel time separately under the actual-work-time policy. Payroll reviews reimbursement and wage requirements separately; a reimbursement decision does not erase pay for compensable work.'))
set_body('missed-sessions-due-to-snow-day-or-unexpected-absences',p('Use the app’s current office and appointment notices for weather closures or other unexpected interruptions. Notify the supervisor and Support Team through the app as soon as practicable, coordinate client communication and document cancellations, rescheduling or authorized telehealth changes.')+p('Do not promise remote service without confirming clinical suitability, client agreement and the applicable authorization. Follow protected-leave notice rules and report all work actually performed. A closure or missed appointment does not by itself authorize billing for an unprovided service or determine an employee’s compensation; the current pay, leave and individual agreement provisions apply.'),'Weather Closures and Unexpected Absences')
set_body('scheduling-and-consistent-hours-policy',p('Maintain accurate appointment availability in the app and honor accepted appointments and assigned work. Coordinate changes with the supervisor and Support Team, allowing timely client notice and continuity of care. Use the app for schedule changes, leave requests, cancellations and coverage arrangements.')+p('Workload and availability expectations follow the employee’s classification and written agreement. Account for protected leave and circumstances outside the employee’s control under the current attendance and performance policies. Record actual work separately from scheduled appointment time.'))
set_body('organizational-structure',p('Inner Strength Institute operates as a counseling practice with clinical leadership, practice operations, People Operations, Billing and Payroll responsibilities. The current assignments and reporting relationships are maintained in the app. Staff follow the supervisor and support contacts assigned to their role.'))
set_body('administrative-responsibilities',p('Administration coordinates access, scheduling, intake, client communication, onboarding and offboarding. Staff maintain accurate app records, protect confidential information and route clinical matters to the assigned clinician or clinical leader. Access to records follows the person’s authorized role.'))
set_body('billing-and-support-responsibilities',p('Billing verifies service eligibility, provider enrollment, authorizations, codes, actual service documentation and applicable payer rules before releasing a claim. Support coordinates client and provider questions through the app. Payroll uses approved compensation mappings and actual-work records; a client collection issue does not erase earned wages.'))
set_body('management-company',p('The designated management team supports practice administration, credentialing, payroll and billing through assigned app workflows. Clinical decisions and supervision remain with authorized clinical leadership. Staff use the app’s current role assignments and support channels for routing requests.'),'Management and Administrative Support')
set_body('overview-of-the-collective',p('Shared administrative support does not merge client records, clinical permissions or workplace policy versions between companies. Inner Strength Institute staff use the handbook and app workspace assigned to this practice. Any cross-practice duties require an explicit assignment and appropriate access.'),'Practice Boundaries and Shared Support')

fees=inherit('company-fees-and-associated-policy')
fees=fees.replace('Employee school-travel reimbursement','Employee business-travel reimbursement')
set_body('company-fees-and-associated-policy',fees)
set_body('billable-diagnoses',p('A diagnosis must reflect the clinical assessment and treatment plan. Billing verifies whether the diagnosis and service are covered for the client’s actual plan and date of service before submitting a claim. A handbook diagnosis reference does not guarantee reimbursement or justify changing a diagnosis to obtain payment.')+p('Maintain the diagnosis, clinical rationale and supporting record in the app. Refer coverage uncertainty to Billing. Do not automatically move a client to self-pay because a claim is denied or a diagnosis is not covered; applicable member-billing requirements and advance agreements govern.'),'Diagnosis Documentation and Coverage Review')
set_body('vacation-out-of-office-prompt','<h4>Client-facing message template</h4>'+p('Thank you for contacting Inner Strength Institute. I am away until [return date] and will respond after I return. For scheduling or practice assistance, please contact the Support Team using your established practice communication channel. For urgent clinical concerns, use the coverage arrangements discussed with your clinician. This message inbox is not an emergency service. If you are experiencing an emergency, call 911 or go to the nearest emergency department.')+'<h4>Before activating the message</h4>'+p('Replace the return date, confirm the actual coverage contact, and arrange continuity of care with your supervisor. Record leave and coverage in the app. Do not include another company’s contact details or an unverified local resource list.'))
set_body('services-codes-included-in-the-sb23-174-coverage-policy','<p>Use '+link('direct-clinical-services-billable-when-authorized','Clinical counseling services')+', '+link('direct-behavioral-health-services-hcpcs','Counseling assessment and treatment-planning services')+' and '+link('service-code-compensation-and-authorizations','Service-code compensation and authorizations')+' to locate this practice’s current service definitions and restrictions.</p>'+p('Billing must verify the plan, service date, provider, setting, supervision, documentation, units and any required authorization. A statutory coverage reference or saved code does not automatically authorize reimbursement for a specific client or appointment.'),'Appendix E · Counseling Service and Coverage Verification')
set_body('diagnosis-codes-allowed-for-sb23-174-services','<p>Use '+link('billable-diagnoses','Diagnosis Documentation and Coverage Review')+' with the clinical assessment and the client’s current plan requirements. Billing maintains service-date coverage verification in the app. Record the source and date of verification when a coverage decision needs review.</p>'+p('Do not treat another practice’s diagnosis list or an older appendix as a current coverage guarantee. Questions about eligibility or a denied claim go to Billing before altering charges or care arrangements.'),'Appendix F · Diagnosis and Coverage Reference')
set_body('at-will-employment-agreement-and-handbook-acknowledgement',p('Complete the assigned handbook acknowledgment in the app. The acknowledgment records the handbook version, employee identity and date, and confirms receipt, access and responsibility to review applicable policies and updates.')+'<p>The handbook does not replace the individual agreement or change the employment relationship described in '+link('conditions-of-employment','Conditions of Employment')+'. Student placement agreements remain governed by the Student Training Program and the documented placement plan. Ask People Operations through the app about any provision that needs clarification.</p>')

# Every remaining empty node is a structural chapter, not missing policy text.
# Give it a readable introduction and let the reader list its children.
for s in sections:
    if not s['bodyHtml']:
        children=[c for c in sections if c['parentSlug']==s['slug']]
        if not children: raise ValueError('Unresolved ISI section: '+s['slug'])
        set_body(s['slug'],p('Use the sections in this chapter for the current '+s['title'].lower()+' guidance. Each policy has its own link and is searchable in the handbook.'))

source['sections']=sections
source['removedSectionSlugs']=sorted(set(base.get('removedSectionSlugs',[]))|removed)
presentation=source['presentation']
presentation.update(theme='isi-foundations',brandLabel='Inner Strength Institute',logoUrl='/assets/branding/innerstrength-mark.png',founders=[],historySectionSlug='purpose-and-background-of-inner-strength-institute',storyLabel='The purpose behind our practice')
presentation['chapterDividers']=[]
presentation['sectionArtwork']={renames.get(k,k):v for k,v in presentation['sectionArtwork'].items() if k not in removed}
website_path=REPO/'frontend/src/constants/tisiMarketingLanding.js'
source['importNotes']=[
 {'key':'isi-authorized-edition','message':'Owner requested a complete counseling-only edition on October 10, using the same shared policies, the shared clinical Student Training Program and website-based foundations. Company-specific wording is drafted for review; no founder, opening date or insurer limits have been invented.'},
 {'key':'isi-website-basis','message':'Mission, vision, values and purpose are proposed wording based on the app’s Inner Strength website content: frontend/src/constants/tisiMarketingLanding.js. The live website was unavailable to the research tool. Current website admin overrides were not read from a database.'},
 {'key':'isi-service-scope','message':'Removed academic services, the combined-service program, facilitator program roles, school assignments and non-counseling service inventories. Shared compensation, protected leave, supervision and workplace policies remain. This source does not configure payer rules or payroll mappings.'},
 {'key':'insurance-confirmed','message':'Owner confirmed practice-provided liability and clinical malpractice insurance across the companies, including clinical students/interns. Applicable policy terms govern; the prior malpractice exclusion is replaced.'},
 {'key':'isi-appendices','message':'Shared clinical fees and compensation are retained at the owner’s direction. Appendices C, E and F provide counseling coverage-verification procedures instead of copying dated eligibility lists. Appendix G uses the actual student evaluation. Appendix I uses only this agency’s saved employee templates; assignments and responses remain private.'}
]
ready={s['slug']:s for s in sections if s['status']=='ready'}
reviews=[]
for e in read('nlu-draft-updates.json')['updates']:
    if e['id']=='nlu-source-therapy-tutoring': continue
    destinations=[renames.get(k,k) for k in e.get('policy_section_slugs',[]) if k not in removed]
    destinations=[k for k in destinations if k in ready]
    if not destinations: continue
    reviews.append({'id':'isi-source-'+e['id'].removeprefix('nlu-source-'),'subject':adapt(e['subject']).replace('center safety','office safety'),'status':'draft','handbook_section_slug':destinations[0],'policy_section_slugs':destinations,'related_section_slugs':[],'changed_content':'<p>The current counseling-edition policies are available at the exact section links below.</p>'+ready[destinations[0]]['bodyHtml'],'link_origin':'source_review'})
reviews.append({'id':'isi-source-edition','subject':'Inner Strength Institute: counseling practice and clinical student training','status':'draft','handbook_section_slug':'service-focus-assignment','policy_section_slugs':sorted(overrides),'related_section_slugs':[],'changed_content':'<p>Created the Inner Strength Institute edition with website-based foundations, counseling-only service scope, practice operations, clinical student training and in-app forms and records. The section links identify the current wording.</p>','link_origin':'source_review'})
write('isi.json',source)
write('isi-draft-updates.json',{'organizationSlug':'tisi','capturedAt':'2026-10-10','updates':reviews})
write('isi-reconciliation.json',{'authorizationDate':'2026-10-10','sharedSources':['itsco.json','nlu.json'],'websiteSource':str(website_path.relative_to(REPO)),'websiteSha256':sha(website_path.read_text()),'removedSections':sorted(removed),'sections':[{'slug':s['slug'],**origins.get(s['slug'],{'source':'owner-authorized counseling edition'}),'editoriallyAdapted':s['slug'] in overrides,'bodySha256':sha(s['bodyHtml'])} for s in sections]})
print(f'ISI: {len(sections)} sections, {sum(s["status"]=="ready" for s in sections)} ready, {len(reviews)} review updates.')
