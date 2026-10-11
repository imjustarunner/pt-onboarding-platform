"""Apply supplied NLU operations without reviving superseded shared policies."""
import html
import json
import re

def render(lines, title=None):
    out=[]; listing=False
    for line in lines:
        line=line.strip()
        if not line or line == title: continue
        bullet=line.startswith('- ')
        if listing and not bullet: out.append('</ul>'); listing=False
        if bullet:
            if not listing: out.append('<ul>'); listing=True
            out.append('<li>'+html.escape(line[2:], quote=False)+'</li>')
        else:
            tag='h4' if len(line)<85 and not re.search(r'[.!?]$',line) else 'p'
            out.append('<'+tag+'>'+html.escape(line, quote=False)+'</'+tag+'>')
    if listing:out.append('</ul>')
    return '\n'.join(out)

def apply_nlu_operations(root, sections, adapt):
    imported=json.loads((root/'nlu-operations-import.json').read_text())
    originals={s['slug']:s for b in imported['batches'] for s in b['sections']}
    byslug={s['slug']:s for s in sections}
    changes=[]
    def put(slug, body, title=None, parent=None, page=None, original=None, reason='Supplied NLU wording reconciled with approved current policies.'):
        current=byslug.get(slug)
        if not current:
            current=dict(slug=slug,parentSlug=parent,title=title,sourcePage=page)
            # Preserve consecutive chapter navigation and existing section links.
            position=max(i for i,s in enumerate(sections) if s['slug']==parent or s['parentSlug']==parent)+1
            sections.insert(position,current); byslug[slug]=current
        current.update(bodyHtml=body,status='ready')
        if title:current['title']=title
        if page:current['sourcePage']=page
        changes.append(dict(slug=slug,sourceSlug=original or slug,reason=reason))
    for slug in ['role-descriptions-and-typical-duties','typical-duties-mental-health-facilitator','typical-duties-academic-tutor','typical-duties-mental-health-counselor']:
        supplied=originals[slug]; body=render(supplied['lines'],supplied['title'])
        body=body.replace('school assignments','approved NLU program assignments')
        body=body.replace('Collaborate with teachers, school counselors, and community partners when clinically appropriate to support holistic care.', 'Coordinate with authorized outside care and educational partners when clinically appropriate and within consent and confidentiality requirements. NLU services take place at approved NLU centers or through approved virtual care.')
        if slug != 'role-descriptions-and-typical-duties':
            body += '<h4>Service authorization and app records</h4><p>These duties do not expand credentials or authorize diagnosis, counseling or insurance billing outside the person’s approved role. Complete session records, progress notes, required forms and actual-time reporting in the app.</p><p>Skills-group work follows <a href="#handbook-therapy-plus-tutoring-groups">Therapy + Tutoring group attendance</a>: schedule three or more clients, proceed with at least two attending, and reschedule or offer separately agreed self-pay if only one attends. Individual skills services are not offered through insurance. Academic tutoring remains a distinct non-clinical service. Clinical groups outside the approved program require express written authorization under <a href="#handbook-group-services-moratorium-and-exceptions">Group services and Therapy + Tutoring authorization</a>.</p>'
        put(slug,body,supplied['title'],page=supplied['sourcePage'])
    for supplied in imported['batches'][1]['sections']:
        slug=supplied['slug']
        if slug=='nlu-supplied-workforce':continue
        body=render(supplied['lines'],supplied['title'])
        body=body.replace('via the scheduling system or calendar', 'in the app’s schedule')
        body=body.replace('Staff should greet and sign in visitors or clients in a reception area, if applicable.', 'Staff should greet visitors and clients in the reception area and record arrival through the app’s appropriate check-in workflow.')
        body=body.replace('Document details per organizational guidelines.', 'Document the incident and actions taken in the app.')
        body=body.replace('Document the incident thoroughly.', 'Document the incident thoroughly in the app.')
        body=body.replace('Record the time you began calling', 'Record in the app the time you began calling')
        body=body.replace('Document any instructions or next steps', 'Document in the app any instructions or next steps')
        body=body.replace('Thoroughly document the incident,', 'Thoroughly document the incident in the app,')
        body=body.replace('NLU Main Number: [Insert main office number], available during business hours.', 'NLU main number: use the current office contact information supplied by NLU Administration for business-hours support.')
        body=body.replace('On-Call or After-Hours Contacts: If applicable, provide after-hours or emergency support contact information.', 'For a scheduled after-hours service, confirm the designated supervisor or clinical lead and their current contact information with NLU Administration before the service.')
        body=body.replace('Direct Supervisor: Call, text, or email (per your chain of command).', 'For routine requests, contact your direct supervisor through the app. For an urgent safety concern, call the supervisor or main office; use only approved communication methods for confidential details.')
        body=body.replace('Existing staff must review and acknowledge the policy at least annually, or when significant updates are made.', 'Existing staff must review and acknowledge the policy in the app at least annually, or when significant updates are made.')
        if slug=='workplace-safety-policy-and-procedures':body+='<p>Complete safety and incident records in the app. Immediate danger requires an emergency response first; do not delay calling 911 or making required reports while completing documentation.</p>'
        put(slug,body,supplied['title'],parent='workplace-safety-policy-and-procedures',page=supplied['sourcePage'])
    # Preserve the newer shared pay, benefit and trainee classification rules.
    workforce=originals['nlu-supplied-workforce']['lines']
    intro=next(l for l in workforce if l.startswith('At Next Level Up,'))
    put('workforce-classifications-and-conditions','<p>'+html.escape(intro,quote=False)+'</p>',original='nlu-supplied-workforce')
    body=byslug['workforce-classifications']['bodyHtml']
    body+='<h4>Full-time, part-time and temporary status</h4><p>For non-clinical staff, full-time classification is at least 40 hours per week or an average of 150 hours per month; part-time is fewer than 40 hours per week. For clinical staff, full-time classification is at least 25 service credits per week; part-time is fewer than 25 credits per week. Service credits are not a substitute for actual work-time records.</p><p>Each person is advised of their classification and appointment duration at hire. A temporary assignment has a limited duration. A full-time or part-time label does not by itself establish benefit eligibility; the individual agreement and <a href="#handbook-benefits-tier-framework">current benefits framework</a> govern. Clinical authority, service eligibility and pay remain subject to the current role and compensation policies.</p>'
    put('workforce-classifications',body,original='nlu-supplied-workforce',reason='Preserved shared classification, current compensation and benefits rules; added supplied NLU full-/part-time thresholds without promising automatic benefits or employee status for trainees.')
    # The supplied attendance terms match ITSCO except organization. Use its
    # reconciled text to retain earned-work pay and current app fee controls.
    base=json.loads((root/'itsco.json').read_text())
    for slug in ['client-policies-and-attendance','employee-separation-and-transitions-resignation-and-termination']:
        body=adapt(next(s['bodyHtml'] for s in base['sections'] if s['slug']==slug))
        body=body.replace('coordinate possible before or after school opportunities, or additional times at our offices, based on client availability and regularly scheduled hours. .', 'coordinate alternative times at approved NLU centers or through approved virtual services, based on client availability and regularly scheduled hours.')
        put(slug,body,reason='Supplied definitions, attendance rules and fee amounts match the shared source; retained newer earned-wage, job-abandonment review and app-record instructions instead of restoring obsolete wording.')
    slug='student-training-program-program-overview'
    body=byslug[slug]['bodyHtml']+'<h4>NLU placement scope</h4><p>NLU uses the shared Student Training Program. Placements occur at approved NLU centers or through approved virtual services. The training plan identifies the student’s academic discipline, permitted duties and assigned supervision. Academic tutoring duties do not authorize clinical counseling, diagnosis or insurance billing.</p><p>Clinical interns use the clinical supervision requirements and <a href="#handbook-clinical-development-supervision-rubric">Clinical Development Supervision Rubric</a>. A non-clinical academic placement requires an appropriate learning plan and evaluation for that discipline; the clinical rubric does not establish clinical competency for a tutor. Complete placement records, supervision, timekeeping and assigned evaluations in the app.</p>'
    put(slug,body,original=None,reason='User confirmed the shared program; clarified NLU locations and clinical versus non-clinical placement scope without changing the 60/40 milestone or weekly student supervision.')
    return imported, changes
