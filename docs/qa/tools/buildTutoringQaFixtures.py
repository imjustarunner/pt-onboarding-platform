"""Offline NLU tutoring QA materials; never provisions records or sends mail."""
import csv, hashlib, importlib.util, io, json, sys
sys.dont_write_bytecode=True
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/qa/fixtures/tutoring-2026-11-01'
SPEC=importlib.util.spec_from_file_location('qa_pdf',Path(__file__).with_name('buildPlotlineQaFixtures.py'))
PDF=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(PDF)
WARNING='SYNTHETIC NLU TUTORING QA ONLY - no real student or clinical record.'
PDF.WARNING=WARNING

def write(name,value):
    data=value if isinstance(value,bytes) else (json.dumps(value,indent=2)+'\n' if isinstance(value,(dict,list)) else value).encode()
    (OUT/name).write_bytes(data)
def csv_data(headers,rows):
    text=io.StringIO();writer=csv.writer(text);writer.writerow(headers);writer.writerows(rows);return text.getvalue()

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    ledger=OUT/'cases.csv'
    if ledger.exists() and any(r['status']!='NOT RUN' or r.get('finding') for r in csv.DictReader(ledger.open())):
        raise RuntimeError('Preserve completed QA evidence before rebuilding this input packet.')
    source=json.loads((OUT/'nlu-catalog-baseline.json').read_text())
    packages=[{'id':'qa-nlu-1101-'+format+'-four','name':'SYNTHETIC QA - four '+format+' tutoring visits','program':'tutoring','published':True,'components':[{'service':'tutoring','format':format,'pricingMode':'provider-discount','discountPercent':10,'sessions':4,'minutes':60}]} for format in ['virtual','in-person']]
    write('catalog-and-tutor.json',{'source':source['sourceSlug'],'agencyId':453,'learningOrganizationId':454,'catalog':{**source['catalog'],'packages':packages},'proposedTutor':{'liveUserId':None,'firstName':'Finley','lastName':'QA NLU Tutor-1101','email':'qa.nlu.tutor@example.com','personalEmailAlias':'qa.nlu.tutor.personal@example.com','role':'provider','clinicalCredentials':None,'agencyMemberships':[453,454],'subjectAreas':['Math','Reading'],'gradeLevels':['3','5'],'acceptingNewStudents':True,'paymentPolicy':'POST_SESSION','learning':{'programs':['tutoring'],'educationLevel':'master','tierId':'L4','rateOverrides':[]},'note':'Tier and education label are synthetic pricing inputs, not verified qualifications. Keep medical/clinical grants off. Do not invent a Tutor user.role: the deployed enum uses provider for this role surface.'},'expectedQuotes':{'virtualHourlyCents':5000,'inPersonHourlyCents':5500,'fourVirtualDiscountedCents':18000,'fourInPersonDiscountedCents':19800,'note':'These are catalog quotes. Compare appointment and collection snapshots; never assume a legacy flat provider session fee correctly prices both formats.'}})
    write('fixtures.json',{'marker':'QA-NLU1101','agencyId':453,'agencySlug':'nlu-qa-demo','learningOrganizationId':454,'learningOrganizationSlug':'nlu-qa-learning','parentPortal':'https://app.nextleveluplcc.com/nlu-qa-demo/guardian','mailPhysicalTo':'testing@itsco.health','sourceAgencyReadOnly':6,'setupAdminId':1435,'supportUserId':1434,'liveTutorId':None,'guardian':{'firstName':'Morgan','lastName':'QA NLU-1101','email':'qa.nlu.parent@example.com','liveUserId':None},'coGuardian':{'firstName':'Rene','lastName':'QA NLU-1101','email':'qa.nlu.coparent@example.com','liveUserId':None},'students':[{'key':'A','firstName':'Parker','lastName':'QA NLU-1101','dob':'2016-04-12','grade':'5','subject':'Math','focus':'Add fractions with unlike denominators','liveClientId':None},{'key':'B','firstName':'Quinn','lastName':'QA NLU-1101','dob':'2018-09-16','grade':'3','subject':'Reading','focus':'Main idea and supporting details','liveClientId':None}],'caps':{'allQaClients':30,'allQaProviderRoles':10,'newStudentsMaximum':2,'newTutorAccountsMaximum':1,'reservePlotlineApplicantSlots':4},'createdConfiguration':{'catalogTiers':5,'syntheticPackages':2,'serviceIds':[318,319,320,321],'intakeFormIds':[349,350,351],'auditRowId':77611},'notCreated':['tutor','guardians','students','appointments','learning plans','signatures','payment methods','live email receipts']})
    write('enrollment-answers.json',{'primaryContact':'Morgan QA NLU-1101','preferredLanguage':'English','phone':'Leave blank unless required; no unapproved SMS or random number.','studentA':{'program':'tutoring','grade':'5','subject':'Math','format':'virtual','goals':'Explain why denominators must match, then add fractions independently.','strengths':'Enjoys drawing models and explaining a strategy aloud.','schoolSupports':'Synthetic classroom uses fraction strips; no real IEP or diagnosis asserted.','accessNeeds':'Use clear written instructions and one problem at a time.'},'studentB':{'program':'tutoring','grade':'3','subject':'Reading','format':'in-person','goals':'Find a main idea and cite two details.','strengths':'Enjoys short nature stories and oral explanation.','schoolSupports':'Synthetic classroom practice only.','accessNeeds':'Allow a quiet minute to reread.'},'consent':'Each persona makes their own selections in the actual form; no copied signatures, prechecked consent or automatic SMS enrollment.'})
    math=['1. Draw 1/2 and 1/4 using equal-size wholes. Which is larger? Explain.','2. 1/2 + 1/4 = ____','3. 1/3 + 1/6 = ____','4. 2/3 + 1/4 = ____','5. 3/4 + 1/8 = ____','Show your work. Write one question you would ask your tutor.']
    reading=['At the class garden, Lee noticed the soil near a small tree was dry. Lee and Jo put a ring of fallen leaves around the tree. They left space around its trunk. Each afternoon they checked the soil. After several days, the covered soil stayed damp longer than the uncovered soil. The class decided to keep observing both spots.','1. What is the main idea?','2. Give two details that support your idea.','3. Why did the class observe both spots?','4. Which statement is an observation rather than a guess?','5. What question would you investigate next?']
    for name,title,lines in [('math-worksheet','QA Grade 5 - fraction reasoning',math),('reading-worksheet','QA Grade 3 - the garden observation',reading)]:
        write(name+'.txt',WARNING+'\n\n'+title+'\n\n'+'\n\n'.join(lines)+'\n');write(name+'.pdf',PDF.make_pdf(title,[WARNING,*lines]))
    write('answer-key-and-scoring.txt',WARNING+'\nINTERNAL TUTOR ONLY; do not upload as the learner worksheet.\n\nMath: 1/2 > 1/4 for equal wholes; 3/4; 1/2; 11/12; 7/8. Credit a correct model/explanation as described by the tutor. Record accuracy, attempted count and help separately.\nReading: main idea concerns the class testing whether leaves help soil retain moisture. Details: covered soil stayed damp longer; students checked covered and uncovered spots. Comparing spots supports an inference but does not prove all trees or conditions behave identically. Score a pre-agreed five-item rubric consistently.\nThese are original practice items, not a standardized or validated assessment. Do not label them CDE-approved or a READ Act screen.\n')
    write('session-examples.txt',WARNING+'''\n\nBASELINE - record only when performed in the QA exercise:
Parker attempted five fraction tasks and answered two independently. On one item Parker added denominators; a fraction-strip model helped explain equal parts. Parker rated confidence 4/10. Prioritize common denominators and explaining the model before adding a new topic.

LEARNING PLAN - proposed for tutor review:
Goal: Add fractions with unlike denominators and explain the common unit.
Baseline: 2 of 5 tasks correct independently in this performed synthetic check.
Target: At least 4 of 5 correct independently on two separate checks.
Strategy: Model equal wholes, name equivalent fractions, guided practice, then exit ticket.
Link the actual standard and its stored version selected in the app. Do not invent a standard ID.
Family question: How confident does Parker seem explaining this week's fraction strategy, from 1 (not yet) to 10 (very confident)? The tutor reviews this wording before enabling a parent rating.

FOLLOW-UP NOTE - use only for work actually performed:
SYNTHETIC TUTORING QA. Reviewed equal wholes and equivalent fractions. Parker solved three of five new items independently and corrected one after a visual prompt. Strength: explained why the whole must stay the same size. Challenge: common denominator when neither denominator divides the other. Next visit: compare two strategies and use a five-item independent exit ticket. No diagnosis, clinical risk assessment or medical service is asserted.

READING NOTE:
SYNTHETIC TUTORING QA. Quinn read the original garden passage, stated its main idea and identified one supporting detail independently. After a reread, Quinn located a second detail and distinguished an observation from a guess. Next: practice citing the sentence supporting an answer. Record the actual rubric score rather than inferring a percentage from this narrative.

TREND EXERCISE:
Across three legitimately recorded distinct sessions/checks, use new equivalent tasks. Suggested synthetic results: 2/5, 3/5, 4/5; independence and prompts stay separate. A fourth independent 4/5 can satisfy the stated two-check threshold. Do not relabel three same-day attempts as historical sessions or set mastery merely from one high score. Keep parent observations separate from tutor evidence.

HOME PRACTICE:
Try two fraction models, explain one addition problem aloud, and bring a question to the next visit. Publish only reviewed student-facing material, not tutor keys, raw transcripts or another student's work.
''')
    cases=[('TU00','Baseline','Recount and preserve clinical/Plotline fixtures'),('TU01','Setup','Confirm NLU QA453 and learning program454; no AuricWell route'),('TU02','Setup','Configure one nonclinical tutor through normal setup'),('TU03','Catalog','Verify copied tiers and two synthetic package prices'),('TU04','Intake','Inspect copied forms and required QA acknowledgments'),('TU05','Public','Find tutor by subject/grade/format; no counseling-only providers'),('TU06','Enrollment','Parent enrolls Parker through real public tutoring flow'),('TU07','Enrollment','Save/resume, required fields, invalid email and unsupported upload'),('TU08','Enrollment','Add Quinn without duplicate parent or student'),('TU09','Enrollment','Co-guardian own access and selective sharing'),('TU10','Portal','Password setup, recovery and NLU parent sign-in'),('TU11','Portal','All NLU labels, help, menus and downloads; no clinical content'),('TU12','Scheduling','Availability, duration, code, price and Denver timezone'),('TU13','Scheduling','Book virtual tutoring with exact appointment/session/student link'),('TU14','Scheduling','Book in-person tutoring through same normal calendar'),('TU15','Scheduling','Reschedule, conflicts and duplicate-submit protection'),('TU16','Evaluation','Perform baseline, retain actual responses and rubric'),('TU17','Plan','Create/review/approve a nonclinical learning plan'),('TU18','Plan','Each parent sees/signs their own current plan revision'),('TU19','Plan','Separate family ratings and tutor mastery'),('TU20','Materials','Upload worksheet, order materials and save source plan'),('TU21','In-person','Open exact appointment and learning workspace'),('TU22','In-person','Annotate, capture responses, save/reload and download'),('TU23','Virtual','Early/valid/closed 30-minute windows using real time'),('TU24','Virtual','Tutor opens; parent checks in; deliberate admission'),('TU25','Virtual','Two real browser sessions verify audio/video and reconnect'),('TU26','Virtual','Whiteboard, documents, chat and learning binder are NLU'),('TU27','Virtual','Additional guardian admission vs unrelated next student'),('TU28','Completion','End once; durable attendance, note, summary and payroll draft'),('TU29','Progress','Distinct session evidence and honest multi-point trends'),('TU30','Homework','Review/publish assignment, learner completion and feedback'),('TU31','Reports','Publish a parent progress report with correct student/version'),('TU32','Privacy','Private notes, raw transcript and unshared materials withheld'),('TU33','Billing','Compare agreed quote, package and post-session charge'),('TU34','Billing','Token/package balance and retry idempotency'),('TU35','Billing','Sandbox payment success/decline/retry only if verified test merchant'),('TU36','Billing','Canceled/no-show event, policy and duplicate fee prevention'),('TU37','Billing','Homework Help distinct from TUTORING and clinical H2014'),('TU38','Payroll','Tutor compensation draft, no approved payroll export'),('TU39','Messaging','Parent/tutor secure notice, reply routing and no AuricWell footer'),('TU40','Email','Actual enrollment/booking/reminder/change/cancel receipts'),('TU41','Audit','Action ledger reconciled with scoped audit search/export/links'),('TU42','Access','Other family, tutor, agency and school staff denied'),('TU43','Retention','Complete final persona/ID table; retain pending evidence'),('TU44','Group','Optional learning-program group with exact roster/privacy'),('TU45','Handoff','Tutor transfer preserves learning history and permissions'),('TU46','Closeout','Program completion/reassessment and retained parent access')]
    columns=['case_id','area','action','status','actor','agency_id','client_ids','appointment_ids','session_ids','plan_ids','action_time_denver','utc_offset','expected','actual','audit_row_ids','screenshot','finding']
    write('cases.csv',csv_data(columns,[[i,a,t,'NOT RUN','','453','','','','','','','','','','',''] for i,a,t in cases]))
    emails=[('TE01','TU06','Enrollment receipt/password setup','Parent; existing-account variant'),('TE02','TU09','Co-guardian invitation','Each permitted guardian separately'),('TE03','TU10','Password recovery','Exact tutoring identity'),('TE04','TU13','Appointment confirmation','Parent and assigned tutor'),('TE05','TU40','Actually due appointment reminder','Each authorized reminder recipient'),('TE06','TU15','Reschedule/change','Original recipients; suppress old reminder'),('TE07','TU36','Cancel/no-show','Each meaningful status and recipient'),('TE08','TU18','Learning-plan review notice','Each eligible parent own revision'),('TE09','TU39','Secure message waiting','Parent; tutor; app-only personal-forward variant'),('TE10','TU30','Homework/report shared','Only if a real worker/type exists'),('TE11','TU33','Statement/balance/payment receipt','Authorized payer only; sandbox where needed'),('TE12','TU28','Completion/progress notice','Only if implemented; inspect catalog')]
    write('email-cases.csv',csv_data(['email_case_id','case_id','type_to_verify','recipient_variant','status','actual_type','logical_to','physical_to','actual_from','actual_reply_to','action_ids','due_at','received_at_denver','utc_offset','transport_id','inbox_id','screenshot','finding'],[[*r,'NOT RUN','','','testing@itsco.health','','','','','','','','','',''] for r in emails]))
    write('audit-ledger.csv',csv_data(['case_id','actor_user_id','agency_id','client_id','object_type','object_id','action','action_time_denver','expected_event','actual_audit_row_id','target_link','export_reference','status','finding'],[]))
    write('README.txt',WARNING+'''\n\nRUN PLAN: ../../QA-ADDENDUM-2026-11-01-NLU-TUTORING-END-TO-END.txt
This packet prepares APP-based testing. Configuration453/454 exists; students,
tutor, family accounts and sessions have NOT been created by this generator.
Use existing vault accounts and the controlled testing inbox. All IDs created
by the app go in the run ledger. No passwords or raw token links go here.

NLU QA agency453 / nlu-qa-demo; learning program454 / nlu-qa-learning.
Expected tutor/parent host: app.nextleveluplcc.com. No AuricWell enrollment,
clinical-note prerequisite or AuricWell-branded parent portal for tutoring.
NLU live agency6 supplied reusable configuration only and is read-only.

FILES
fixtures.json: people to create/reuse, budgets, exact seeded configuration IDs.
catalog-and-tutor.json: NLU copied tier inputs plus two added synthetic packages.
enrollment-answers.json: academic-only parent answers.
math/reading-worksheet.pdf and .txt: original synthetic student materials.
answer-key-and-scoring.txt: private tutor key; never publish to the learner.
session-examples.txt: baseline, plan, notes, practice and progress examples.
cases.csv / email-cases.csv / audit-ledger.csv: blank actual-evidence ledgers.
nlu-catalog-baseline.json: internal configuration source snapshot, not student data.

All live cases start NOT RUN. A passing engineering test, prepared file, seeded
catalog, preview or Sent label does not prove real browser or inbox behavior.
Payment tests require a confirmed sandbox merchant; no real card/charge,
QuickBooks posting, insurance claim or approved payroll export is authorized.
Normal guardian permissions, workflow prerequisites and due times remain.

Rebuild offline: python3 docs/qa/tools/buildTutoringQaFixtures.py
The generator refuses to replace a cases ledger containing entered results.
It uses existing repository code and Python standard library, no installs.
''')
    entries=sorted(p for p in OUT.iterdir() if p.is_file() and p.name!='checksums.csv')
    write('checksums.csv',csv_data(['filename','sha256','bytes'],[[p.name,hashlib.sha256(p.read_bytes()).hexdigest(),p.stat().st_size] for p in entries]))
    print(f'Prepared {len(list(OUT.iterdir()))} files; {len(cases)} browser cases remain NOT RUN.')

if __name__=='__main__':main()
