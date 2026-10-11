"""Build the NLU source from archived user text and explicitly reconciled shared policies.

No database writes. Run from any directory. Originals are never modified.
"""
from pathlib import Path
import copy
import hashlib
import html
import json
import re
from handbookAppWorkflow import app_section
from nluHandbookOperations import apply_nlu_operations

ROOT = Path(__file__).resolve().parents[1] / 'content' / 'handbooks'
base = json.loads((ROOT / 'itsco.json').read_text())
supplied = json.loads((ROOT / 'nlu-foundations-import.json').read_text())
updates = json.loads((ROOT / 'itsco-draft-updates.json').read_text())
source = copy.deepcopy(base)
source.update(key='nlu', title='Workplace Handbook', organization='Next Level Up', edition='NLU · Working handbook', sourceDate='2026-10-10', coverUrl='/assets/handbooks/nlu-cover.png')
source['sourceOutline'] = supplied['contents']
source['sourceArchive'] = supplied['sourceArchive']
source['sourceSha256'] = supplied['sourceSha256']
source['importNotes'] = []
source['removedSectionSlugs'] = []
audit = []

def note(key, message):
    source['importNotes'].append(dict(key=key, message=message))

def p(text):
    return '<p>' + html.escape(text, quote=False) + '</p>'

def section(slug, title, body='', parent=None, page=None):
    return dict(slug=slug, title=title, bodyHtml=body, parentSlug=parent, sourcePage=page, status='ready' if body else 'pending')

renames = {
    'foundations-of-itsco': ('foundations-of-nlu', 'FOUNDATIONS OF NEXT LEVEL UP'),
    'history-and-background-of-itsco': ('history-and-background-of-next-level-up', 'HISTORY AND BACKGROUND OF NEXT LEVEL UP'),
    'workplace-school-based-safety-policy-and-procedures': ('workplace-safety-policy-and-procedures', 'WORKPLACE SAFETY POLICY & PROCEDURES'),
    'claim-submissions-via-app-itsco-health': ('claim-submissions-via-app', 'CLAIM SUBMISSIONS VIA THE APP'),
}
removed = {'skill-builders-program', 'program-overview', 'program-structure', 'expectations-of-facilitators', 'disclosure-and-liability', 'expectations-of-the-practice', 'school-support-activity-hours', 'typical-duties-skill-development-coordinator'}
pending = {
    'the-collective-and-partnerships', 'the-mental-range-collective-s-goals', 'the-mental-range-collective-s-partnerships',
    'workplace-school-based-safety-policy-and-procedures', 'typical-duties-mental-health-counselor', 'typical-duties-mental-health-facilitator',
    'mileage-reimbursement-policy', 'attendance-providers-and-facilitators', 'client-policies-and-attendance',
    'organizational-structure', 'administrative-responsibilities', 'billing-and-support-responsibilities', 'management-company', 'overview-of-the-collective',
    'company-fees-and-associated-policy', 'billable-diagnoses', 'vacation-out-of-office-prompt',
    'services-codes-included-in-the-sb23-174-coverage-policy', 'diagnosis-codes-allowed-for-sb23-174-services',
}

# Exact local edits preserve the shared compensation rules while removing duties
# that apply only to school assignments. No school benefit is repurposed as an
# NLU benefit, and no tutor rate is inferred from an insurance billing code.
replacements = {
    'Group services: moratorium, Skill Builders and exceptions': 'Group services and Therapy + Tutoring authorization',
    'existing written Skill Builders authorization or an express written exception': 'written NLU program authorization or an express written exception',
    'existing written Skill Builders authorization': 'written NLU program authorization',
    'H2014 is permitted only through Skill Builders with express written approval, and is not approved for individual services.': 'H2014 requires written code-specific approval for eligible small-group skills services. Individual skills services are not offered through insurance; separately agreed self-pay may be available.',
    'Not approved for individual services. Skill Builders only, with express written approval before use.': 'No insurance-funded individual skills services. Group skills require written NLU program and payer approval; see the Therapy + Tutoring group attendance policy.',
    'While school-assigned, the annual commitment is eight (8) hours total, including four (4) additional hours for school-related events. The eight-hour total applies across all school assignments, not separately to each school. ': '',
    ', or eight-hour annual total while school-assigned': '',
    ', or eight-hour total while school-assigned': '',
    'four or eight hours': 'four hours', 'four- or eight-hour calendar-year total': 'four-hour calendar-year total',
    'community and school events': 'community events', 'agency or school event work': 'agency event work',
    'practice or school partnership activities': 'practice partnership activities', 'school closures': 'center closures',
    'reports from schools, clients and staff': 'reports from clients, families and staff', 'disability, school context': 'disability, learning context',
    'School and client action items': 'Client and program action items', 'family contact, school coordination, roster': 'family contact, program coordination, roster',
    'Apply school-specific responsibilities only while school-assigned and within authorized information-sharing boundaries.': 'Apply role-specific responsibilities within authorized information-sharing boundaries.',
    'Training leave and school support activity hours are separate from Personal PTO and protected sick leave.': 'Training leave is separate from Personal PTO and protected sick leave.',
    'Training leave, protected sick leave and school support activity hours': 'Training leave and protected sick leave',
    'and school support activity hours': '',
    'in schools or clinical settings': 'in approved NLU service settings', 'in public spaces or in schools': 'in public or shared service spaces',
    'brief authorized school or provider communication': 'brief authorized care-team or provider communication',
    'qualifying Denver Public Schools or other Practice-designated Denver regions': 'Practice-designated Denver regions',
    'school-based and approved office settings': 'approved NLU office and telehealth settings',
    'school-based, office-based, or community settings as assigned': 'approved NLU office and telehealth settings as assigned',
    'school-based, office-based, or community-based settings as assigned': 'approved NLU office and telehealth settings as assigned',
    'school-based, office-based, telehealth, or community settings': 'approved NLU office and telehealth settings',
    'including school-based, community-based, and skill development settings': 'including office-based, telehealth, and approved skill development settings',
    'school-based or community-based services': 'office-based or telehealth services',
    'academic standards, and school-based requirements': 'academic training standards, and NLU site requirements',
    'clients, families, and school personnel': 'clients, families, and NLU team members',
    'schools, families, and interdisciplinary teams': 'families and interdisciplinary teams',
    'interdisciplinary teams, schools, and external providers': 'interdisciplinary teams and external providers',
    'schools, families, or partners': 'families or partners',
    'in schools or client-adjacent environments': 'in NLU service or client-adjacent environments',
    'school safety procedures': 'NLU site safety procedures',
    'School-based': 'Center-based', 'school-based': 'center-based',
    'School personnel': 'NLU personnel', 'school personnel': 'NLU personnel',
    'school staff': 'NLU staff', 'school partners': 'community partners',
    'school setting': 'NLU service setting', 'school environments': 'NLU service environments',
    'school administration': 'NLU Administration',
    'School-Based': 'Center-Based',
    'school or community-based programming': 'approved NLU programming',
    'school professionalism': 'NLU site professionalism',
    'School placement does not expand or alter clinical authority.': 'Program placement does not expand or alter clinical authority.',
    'Presence in a school or program setting': 'Presence in an NLU service or program setting',
    '<a href="https://app.itsco.health/itsco/kiosk?mode=office">Open the kiosk entry</a> · ': '',
}

def adapt(body):
    for before, after in replacements.items():
        body = body.replace(before, after)
    # Do not manufacture NLU departmental inboxes. Retain role-based reporting,
    # and use only the NLU support address already published by the organization.
    def contact(m):
        address = m.group(1).lower()
        if address.startswith('support@'):
            return '<a href="mailto:support@nextleveluplcc.com">support@nextleveluplcc.com</a>'
        role = {'po': 'People Operations', 'payroll': 'Payroll', 'legal': 'Legal', 'compliance': 'Compliance', 'leaves': 'People Operations'}.get(address.split('@')[0], 'the designated NLU contact')
        return role
    body = re.sub(r'<a href="mailto:([^"<>]*@itsco\.health)"[^>]*>.*?</a>', contact, body, flags=re.I|re.S)
    body = re.sub(r'\b(?:support)@itsco\.health\b', 'support@nextleveluplcc.com', body, flags=re.I)
    for email, role in [('PO','People Operations'),('payroll','Payroll'),('legal','Legal'),('compliance','Compliance'),('leaves','People Operations')]:
        body = re.sub(r'\b'+email+r'@itsco\.health\b', role, body, flags=re.I)
    body = re.sub(r'app\.itsco\.health', 'app.nextleveluplcc.com', body, flags=re.I)
    body = re.sub(r'\bITSCO(?:, LLC)?\b', 'Next Level Up', body)
    body = re.sub(r'\bat (People Operations|Payroll|Legal|Compliance)\b', r'through \1', body)
    for before, (after, _) in renames.items():
        body = body.replace('#handbook-'+before, '#handbook-'+after)
    body = body.replace('#handbook-skill-builders-program', '#handbook-therapy-plus-tutoring-program')
    body = body.replace('Skill Builders Program', 'Therapy + Tutoring program').replace('Skill Builders', 'Therapy + Tutoring')
    return body

toc_pages = {x['title'].lower(): x['page'] for x in supplied['contents']}
page_overrides = {
    'foundations-of-nlu':11, 'history-and-background-of-next-level-up':12,
    'workplace-safety-policy-and-procedures':34, 'office-kiosk-and-client-arrivals':34,
    'role-based-supplemental-compensation-rate-schedule':45, 'career-pathway-overview':47,
    'typical-duties-mental-health-facilitator':54, 'typical-duties-mental-health-counselor':58,
    'paid-time-off-pto-and-sick-personal-care-leave-policy':68, 'holiday-scheduling-policy':73,
    'overtime-and-work-life-balance':75, 'claim-submissions-via-app':83,
    'credit-to-time-equivalency-excess-time-policy':93, 'attendance-and-organizational-participation':99,
    'general-attendance-guidelines':99, 'attendance-providers-and-facilitators':102,
    'attendance-non-provider-employees':103, 'attendance-non-provider-contractors':104,
    'organizational-meetings-policy':105, 'general-guidelines-for-all-meetings':106,
    'employee-separation-and-transitions-resignation-and-termination':114,
    'student-training-program-program-overview':149,'student-training-program-program-structure':149,
    'supervision-and-professional-development':151,'student-training-program-disclosure-and-liability':151,
    'student-training-program-expectations-of-the-practice':152,
}

sections=[]
for original in base['sections']:
    old=original['slug']
    if old in removed:
        source['removedSectionSlugs'].append(old)
        continue
    s=copy.deepcopy(original)
    if old in renames: s['slug'],s['title']=renames[old]
    if s['parentSlug'] in renames: s['parentSlug']=renames[s['parentSlug']][0]
    if old in pending: s['bodyHtml']=''; s['status']='pending'
    else: s['bodyHtml']=adapt(s['bodyHtml']); s['title']=adapt(s['title'])
    s['sourcePage']=page_overrides.get(s['slug'],toc_pages.get(s['title'].lower()))
    # Repeated generic subsection titles must not inherit another program's page.
    if old in ['program-overview','program-structure']: s['sourcePage']=None
    sections.append(s)

def set_body(slug, body, title=None):
    s=next(s for s in sections if s['slug']==slug)
    s.update(bodyHtml=body,status='ready' if body else 'pending')
    if title: s['title']=title

for title, paragraphs in supplied['foundations'].items():
    slug={'HISTORY AND BACKGROUND OF NEXT LEVEL UP':'history-and-background-of-next-level-up'}.get(title,title.lower())
    if title=='VALUES': body=''.join('<h4>'+html.escape(paragraphs[i])+'</h4>'+p(paragraphs[i+1]) for i in range(0,len(paragraphs),2))
    elif title=='GOALS': body='<ul>'+''.join('<li>'+html.escape(t)+'</li>' for t in paragraphs)+'</ul>'
    else: body=''.join(p(t) for t in paragraphs)
    body=body.replace('work hand-in-hand with schools and families','work hand-in-hand with families')
    body=body.replace('Together, we will work to ensure that when the school bell rings, it also ushers in an opportunity for healing, learning, and empowerment.', 'Together, we create opportunities for healing, learning, and empowerment at Next Level Up.')
    body=body.replace('both within and beyond the classroom', 'through NLU’s learning and counseling centers and approved virtual services')
    set_body(slug,body)

set_body('service-focus-assignment', '<p>NLU service focus areas include counseling, academic tutoring, and the <a href="#handbook-therapy-plus-tutoring-program">Therapy + Tutoring (Cognitive &amp; Emotional Enrichment) Program</a>. Services take place at approved NLU centers or through approved virtual care. Service assignment does not expand a provider’s credentials or scope.</p><p>People Operations records each person’s role, applicable supervision, compensation category and approved services. Intern placements follow the <a href="#handbook-student-training-program">Student Training Program</a>; a placement does not automatically create employee status.</p><p>Clinical supervision uses the individually contracted supervision rate. Direct supervision is paid at 100%, hosting group supervision at 150%, and actual time reviewing and co-signing another provider’s notes at 50%. Record actual work under the shared compensation and timekeeping policies.</p>')
set_body('claim-submissions-via-app', '<p>Submit payroll time claims and supporting records through My Payroll in the NLU app. Record all time actually worked, including eligible indirect work, support activities and corrections. Use the approved claim type and avoid duplicate claims for the same work.</p><p>For a mixed counseling and tutoring visit, identify the actual time for each service separately. A payroll time claim, an insurance claim and a client self-pay charge serve different purposes; one does not establish the other. See <a href="#handbook-therapy-plus-tutoring-documentation-and-billing">Therapy + Tutoring documentation and billing</a>.</p>')
set_body('group-services-moratorium-and-exceptions', '<p>NLU’s authorized skills-group pathway is the <a href="#handbook-therapy-plus-tutoring-program">Therapy + Tutoring (Cognitive &amp; Emotional Enrichment) Program</a>. Schedule at least three clients for a small skills group. The group may proceed when at least two attend. Record attendance and the actual service for each participant.</p><p>If only one client attends, offer rescheduling or a separately agreed self-pay individual skills service. Do not automatically convert the visit to an insurance-funded individual skills service or bill an absent participant. NLU does not currently offer individual skills services through insurance. Self-pay remains subject to applicable member-billing rules and agreement before service.</p><p>This program authorization does not itself authorize a billing code, provider, diagnosis or payer arrangement. Verify each before billing. Other provider-initiated groups remain paused unless specifically approved in writing by NLU leadership. H2015, H2016, H2017 and H2018 require express written permission for any use. H0025 and H2032 remain unapproved.</p>', 'Group services and Therapy + Tutoring authorization')

# Keep the general group pause, but point its program exception to the NLU rules.
for s in sections:
    s['bodyHtml']=s['bodyHtml'].replace('H2014 is permitted only through Therapy + Tutoring with express written approval, and is not approved for individual services.', 'H2014 requires express written approval for eligible group skills services. Individual skills services are not offered through insurance.')
    if s['slug']=='service-focus-assignment':continue
    # Drop explicit school-only benefit cross references rather than inventing a substitute.
    s['bodyHtml']=re.sub(r'<a href="#handbook-school-support-activity-hours">.*?</a>', '', s['bodyHtml'], flags=re.S)

program=[
section('therapy-plus-tutoring-program','THERAPY + TUTORING · COGNITIVE & EMOTIONAL ENRICHMENT', '<p>Next Level Up coordinates academic instruction, emotional skill development and counseling for children and teens whose learning and emotional needs overlap. An individualized plan identifies the barriers, goals, appropriate services, qualified providers and measures of progress.</p><p>Programs operate at approved NLU locations or through approved virtual services. Select the service that meets the client’s needs; combining services never changes the scope or funding rules for either component.</p>',page=144),
section('therapy-plus-tutoring-program-overview','Program overview and core interventions','<p>The program connects personalized learning support with emotional regulation, coping, attention, organization, persistence and confidence. Academic work may focus on reading, writing, mathematics, study strategies and homework routines. Clinical counseling addresses assessed treatment needs through an individualized treatment plan.</p><p>Group skills, individual counseling and tutoring are distinct services within a coordinated plan. An activity is classified by what is actually delivered and by the provider’s role, rather than by the program name or the presence of a learning task.</p>', 'therapy-plus-tutoring-program',144),
section('therapy-plus-tutoring-groups','Small-group skills: scheduling and attendance','<p>Schedule at least three clients for a small-group skills session. At least two must attend for it to proceed as a group. Plan developmentally appropriate skill practice and document each participant’s attendance, response and progress toward their own goals.</p><p>If one client attends, reschedule or offer a separately agreed self-pay individual skills service. Do not substitute an insurance claim for individual skills or bill for people who did not attend. Individual skills services are not currently provided through insurance. See <a href="#handbook-group-services-moratorium-and-exceptions">Group services and Therapy + Tutoring authorization</a>.</p>', 'therapy-plus-tutoring-program',145),
section('therapy-plus-tutoring-blended-visit','The 50/50 visit: counseling and tutoring','<p>A planned 50/50 visit reserves one appointment for up to 30 minutes of counseling and up to 30 minutes of self-pay tutoring. These are sequential, separately identifiable service periods. The same qualified provider may deliver both only when authorized for each role; otherwise the plan identifies the responsible provider for each portion.</p><p>Record the actual start and end of each portion. The scheduled split is a planning target, not proof that either service occurred. Tutoring, breaks, transition time and counseling must not be counted as the same billable minutes. Do not extend or fabricate a clinical service merely to fill the booking.</p><p>H0004 is the requested counseling code, subject to current payer, setting, provider, supervision and treatment-plan eligibility. It must not be used to relabel academic tutoring or individual skills services. Counseling and tutoring each need their own approved funding and compensation treatment.</p>','therapy-plus-tutoring-program',145),
section('therapy-plus-tutoring-documentation-and-billing','Documentation, billing and provider time','<h4>One workflow, distinct service records</h4><p>Complete the visit through one coordinated workflow with a counseling section and a short tutoring section. Reuse verified client, appointment, provider and date information. The counseling record identifies the treatment goal, intervention, response, plan, actual clinical time and required signature or co-signature. The tutoring record identifies the learning goal, instructional work, progress and actual tutoring time.</p><p>Only the clinical portion supports an insurance claim. The self-pay tutoring portion is recorded separately for the family’s agreed charges. Academic notes do not substitute for a clinical note, and tutoring details are not copied into a payer-facing clinical export unless relevant and appropriate. Each component retains its own service identity, timing, provider and audit trail.</p><h4>Provider compensation</h4><p>Record actual counseling and tutoring time separately, linked to the same visit. Apply the employee’s approved service mappings and written rates. Do not count an entire blended booking as counseling, duplicate the same work in two payroll claims, or infer a tutoring rate from H0004. The shared compensation policy continues to apply, including applicable indirect allowances and payment for all compensable work; client payment or a denied insurance claim does not erase earned wages.</p><h4>Before charging or submitting</h4><p>Verify the actual service, eligibility, code, units, modifiers, provider enrollment, supervision and payer rules for the date of service. A reserved 30-minute slot is not automatically a two-unit claim. Billing must confirm the configured rule before releasing output.</p><p>Verify whether a service is genuinely noncovered before offering a Medicaid member self-pay. Use a specific written payment agreement before the noncovered service, identifying the service and charge. A denied or improperly authorized covered service must not be automatically transferred to the family.</p><p>Reference: <a href="https://hcpf.colorado.gov/sites/hcpf/files/Bulletin%200126_B2600533-2.pdf">HCPF January 2026 Provider Bulletin — Member Billing</a>. Current plan-specific rules and NLU’s approved fee schedule govern the actual billing setup.</p>', 'therapy-plus-tutoring-program',146),
section('therapy-plus-tutoring-facilitators','Provider roles and program training','<p>Staff work within their verified credentials, approved service scope and assigned supervision. Tutors deliver academic instruction; a tutoring assignment does not authorize counseling, diagnosis or insurance billing. Clinical providers deliver counseling only when their credentials, supervision and NLU authorization permit it.</p><p>Program orientation covers individualized learning and treatment goals, separation of services and time, skills-group attendance rules, family communication, site safety, documentation and escalation. Assigned employee training is paid work under the shared compensation policy. Intern participation follows the <a href="#handbook-student-training-program">Student Training Program</a>.</p>', 'therapy-plus-tutoring-program',145),
section('therapy-plus-tutoring-disclosure-and-liability','Program disclosure and liability',parent='therapy-plus-tutoring-program',page=147),
section('therapy-plus-tutoring-expectations-of-practice','Program support and practice responsibilities',parent='therapy-plus-tutoring-program',page=148),
]
at=next(i for i,s in enumerate(sections) if s['slug']=='student-training-program')
program[3]['bodyHtml'] += '<h4>Combined booking rollout</h4><p>The combined booking workflow is being prepared. Until NLU announces that it is available, use the designated scheduling, documentation and timekeeping processes and have Billing reconcile the two service portions. Do not assume a booking automatically creates correct insurance, tutoring-charge or payroll entries.</p>'
sections[at:at]=program
set_body('student-training-program-program-structure', next(s for s in sections if s['slug']=='student-training-program-program-structure')['bodyHtml'].replace("While primarily based at the Practice's main location, students may have opportunities to work in various settings, including off-site locations, as part of their training. This exposure is designed to provide a comprehensive view of our field's diverse work environments.", 'Student placements occur at approved NLU centers and through approved virtual services under the training plan and required supervision. Assignments distinguish academic tutoring, group skills and clinical counseling.'))
set_body('training-requirements', next(s for s in sections if s['slug']=='training-requirements')['bodyHtml'].replace('corresponding Therapy + Tutoring program section', '<a href="#handbook-therapy-plus-tutoring-facilitators">Therapy + Tutoring provider roles and training section</a>'))

# NLU-specific contents not represented by ITSCO's section structure.
extra=[
section('typical-duties-academic-tutor','Typical Duties – Academic Tutor',parent='role-descriptions-and-typical-duties',page=56),
section('academic-and-educational-support-services','Academic and Educational Support Services (Non-Clinical)', '<p>Academic tutoring, homework support and study strategies are non-clinical services. Record instructional goals, the work completed and progress. These services remain distinct from clinical counseling, even when coordinated within <a href="#handbook-therapy-plus-tutoring-program">Therapy + Tutoring</a>.</p><p>For a blended visit, reserve the coordinated appointment and record each portion separately under <a href="#handbook-therapy-plus-tutoring-blended-visit">The 50/50 visit</a>. Confirm the family’s tutoring charges and payment agreement in advance.</p>', 'definition-of-services',65),
section('scheduling-and-consistent-hours-policy','SCHEDULING AND CONSISTENT HOURS POLICY',parent='attendance-and-organizational-participation',page=100),
section('at-will-employment-agreement-and-handbook-acknowledgement','At-Will Employment Agreement and Acknowledgement of Receipt of Employee Handbook',page=170),
]
for s in extra:
    if s['parentSlug']:
        positions=[i for i,x in enumerate(sections) if x['slug']==s['parentSlug'] or x['parentSlug']==s['parentSlug']]
        sections.insert(max(positions)+1,s)
    else:sections.append(s)

operations, operation_changes = apply_nlu_operations(ROOT, sections, adapt)
for s in sections:
    s['bodyHtml'] = app_section(s['slug'], s['bodyHtml'])
    if s['slug'] == 'therapy-plus-tutoring-blended-visit':
        s['bodyHtml'] = s['bodyHtml'].replace('use the designated scheduling, documentation and timekeeping processes', 'use the app’s existing scheduling, documentation and timekeeping workflows')
source['operationsSources'] = [{'sourceArchive':b['sourceArchive'],'sourceSha256':b['sourceSha256']} for b in operations['batches']]
source['sections']=sections
source['presentation']['theme']='nlu-foundations'
source['presentation']['brandLabel']='Next Level Up'
source['presentation']['logoUrl']='/assets/nlu/logo.png'
source['presentation']['historySectionSlug']='history-and-background-of-next-level-up'
source['presentation']['storyLabel']='Our beginnings'
source['presentation']['founders']=[{'name':'Michael Mendez','photoUrl':'/assets/handbooks/michael-mendez.jpg'},{'name':'Melissa Mendez'}]
source['presentation']['chapterDividers']=[s['slug'] for s in sections if not s['parentSlug'] and not s['bodyHtml']]
source['presentation']['sectionArtwork']={renames.get(k,(k,''))[0]:v for k,v in source['presentation']['sectionArtwork'].items() if k not in removed}
source['presentation']['sectionArtwork']['therapy-plus-tutoring-program']='pikes-peak'
note('shared-policy-basis','NLU uses the current reconciled shared policies under the user’s October 10 instruction. School-service operations and Skill Builders content are excluded. NLU foundations are from the supplied text, with service-location language corrected at the user’s direction. Original text and all 378 contents entries remain archived.')
note('nlu-program-authorization','The user confirmed three scheduled clients and at least two attending for skills groups. With one attending, reschedule or offer separately agreed self-pay. Individual skills services are not offered through insurance. Counseling remains distinct from skills services.')
note('nlu-billing-implementation','The 50/50 program policy is a draft workflow specification. Automated appointment splitting, claims, tutoring charges and payroll outputs are not enabled by importing handbook text. Payer identity/rules, fees and tutor compensation mappings must be configured before release.')
note('nlu-source-needed','Received NLU roles (54–60), center safety (34–37), workforce classifications and client attendance/separation (112–116). Still needed: service definitions (61–67), closures and scheduling (96–104), T+T terms (144–148), Appendix A (153–156), and confirmations of contacts, partnerships, coverage appendices and acknowledgement wording. Shared student training is approved; do not request it again unless a specific placement issue needs clarification.')
note('nlu-operations-reconciliation','Supplied operations text is archived verbatim. Older fee-collection/pay-forfeiture and separation wording does not override the reconciled shared policies. Staff forms, timekeeping and records use the app. Emergency calls and required external reports remain available. NLU Administration must confirm current main-office and after-hours contacts before publication; no phone number has been invented.')
note('insurance-confirmed','The owner confirmed practice-provided liability and clinical malpractice insurance across the companies, including clinical student placements, on October 10. The shared insurance sections replace the former malpractice exclusion. Policy terms and authorized role scope govern; no carrier or coverage limit is invented.')
note('nlu-forms','Employee self-assessment appendices must use NLU’s saved role templates; ITSCO’s role forms are not silently reused. The shared student evaluation rubric is retained for NLU placements. Melissa’s portrait has not been supplied or identified; the reader uses her name and initials.')

for s in sections:
    old=next((b for b in base['sections'] if b['slug']==s['slug'] or renames.get(b['slug'],(None,None))[0]==s['slug']),None)
    if old and old['bodyHtml']!=s['bodyHtml']:
        audit.append({'slug':s['slug'],'status':s['status'],'baseSlug':old['slug'],'baseBodySha256':hashlib.sha256(old['bodyHtml'].encode()).hexdigest(),'nluBodySha256':hashlib.sha256(s['bodyHtml'].encode()).hexdigest()})

# Keep update destinations; never reuse ITSCO database IDs or its draft prose.
ready={s['slug']:s for s in sections if s['status']=='ready'}
review=[]
for e in updates['updates']:
    destinations=[renames.get(k,(k,None))[0] for k in e.get('policy_section_slugs',[])]
    destinations=[k for k in destinations if k in ready]
    if not destinations:continue
    subject=adapt(e['subject'])
    if 'School support' in subject:continue
    review.append({'id':'nlu-source-'+str(e['id']),'subject':subject,'status':'draft','handbook_section_slug':destinations[0],'policy_section_slugs':destinations,'related_section_slugs':[], 'changed_content': ''.join('<h3>'+html.escape(ready[k]['title'])+'</h3>'+ready[k]['bodyHtml'] for k in destinations),'link_origin':'source_review'})
    if e['id'] == 5:
        review[-1]['changed_content'] = ready['digital-workplace-and-transition-procedures']['bodyHtml']
review.append({'id':'nlu-source-therapy-tutoring','subject':'Therapy + Tutoring: groups, 50/50 visits and separate service records','status':'draft','handbook_section_slug':'therapy-plus-tutoring-program','policy_section_slugs':[s['slug'] for s in program if s['status']=='ready'],'related_section_slugs':[],'changed_content':''.join('<h3>'+html.escape(s['title'])+'</h3>'+s['bodyHtml'] for s in program if s['status']=='ready'),'link_origin':'source_review'})
destinations=[c['slug'] for c in operation_changes]
review.append({'id':'nlu-source-operations','subject':'NLU roles, center safety, attendance and student placement scope','status':'draft','handbook_section_slug':'workplace-safety-policy-and-procedures','policy_section_slugs':destinations,'related_section_slugs':[],'changed_content':'<p>Added the supplied Learning &amp; Wellness Facilitator, Academic Tutor and Counselor duties, qualified by current service authorization and group attendance rules.</p><p>Added separately linked center safety, building security, elopement, parent pickup, crisis response, emergency contact and training procedures. Safety records and acknowledgements use the app; urgent calls come first.</p><p>Imported NLU attendance and workforce details while retaining the current compensation and separation protections. No-show and late-cancellation fees remain $100 and $80 for eligible non-Medicaid clients; Medicaid clients are exempt. Uncollected fees do not cancel wages for work performed.</p><p>The shared Student Training Program applies to NLU centers and approved virtual placements. Clinical requirements and the clinical evaluation rubric remain distinct from non-clinical academic placements. The exact policies are available through the section links.</p>','link_origin':'source_review'})

for name,data in [('nlu.json',source),('nlu-reconciliation.json',{'sharedSource':'itsco.json','authorizationDate':'2026-10-10','removedSections':sorted(removed),'sections':audit,'operations':operation_changes,'operationsSources':source['operationsSources']}),('nlu-draft-updates.json',{'capturedAt':'2026-10-10','updates':review})]:
    (ROOT/name).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
print(f'NLU: {len(sections)} sections, {sum(s["status"]=="ready" for s in sections)} ready, {len(review)} review updates.')
