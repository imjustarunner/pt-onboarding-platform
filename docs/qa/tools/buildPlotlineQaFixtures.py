#!/usr/bin/env python3
"""Build small, offline Plotline QA input files; never calls the app or a database."""
import csv
import hashlib
import io
import json
from pathlib import Path
import textwrap

QA = Path(__file__).resolve().parents[1]
OUT = QA / "fixtures" / "plotline-2026-11-01"
SOURCE_BUILD = "70c79816a65072f8e75fab8fae8fe6213689c7ec"
WARNING = "SYNTHETIC QA ONLY - NOT A REAL PERSON, VACANCY OR EMPLOYMENT RECORD."


def jdump(value):
    return json.dumps(value, indent=2, ensure_ascii=True) + "\n"


def csv_bytes(headers, rows):
    out = io.StringIO(newline="")
    writer = csv.DictWriter(out, fieldnames=headers, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return out.getvalue().encode()


def make_pdf(title, paragraphs):
    """Minimal text PDF with selectable source text; uses only the standard library."""
    lines = []
    for paragraph in [title, WARNING, "", *paragraphs]:
        for line in paragraph.splitlines() or [""]:
            lines.extend(textwrap.wrap(line, width=90, break_long_words=False) or [""])
        lines.append("")
    pages = [lines[i:i + 46] for i in range(0, len(lines), 46)]
    escape = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for index, page_lines in enumerate(pages):
        page_id = 4 + index * 2
        content_id = page_id + 1
        kids.append(f"{page_id} 0 R")
        commands = ["BT", "/F1 10 Tf", "14 TL", "40 750 Td"]
        for line in page_lines:
            commands.extend([f"({escape(line)}) Tj", "T*"])
        commands.append("ET")
        stream = "\n".join(commands).encode("ascii")
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>".encode())
        objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
    objects[1] = f"<< /Type /Pages /Count {len(pages)} /Kids [{' '.join(kids)}] >>".encode()
    objects.append(f"<< /Title ({escape(title)}) /Creator (Plotline synthetic QA fixtures) >>".encode())
    data = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    start = len(data)
    data.extend(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R /Info {len(objects)} 0 R >>\nstartxref\n{start}\n%%EOF\n".encode())
    return bytes(data)


page = {
    "heroHeadline": "ITSCO careers - SYNTHETIC QA",
    "heroSubheadline": "Practice the journey from application to welcome.",
    "accentColor": "#16457c",
    "eyebrow": "DEMO CAREERS / NO REAL VACANCIES",
    "lead": "This ITSCOLLC demonstration page tests Plotline recruiting and onboarding. All roles and applicants are fictional. Do not submit real personal information or use this page to seek employment.",
    "navItems": [
        {"label": "About this demo", "action": "why", "style": "link", "icon": "none"},
        {"label": "QA openings", "action": "jobs", "style": "button", "icon": "none"},
    ],
    "heroImageUrl": "",
    "heroImageAlt": "Use the existing ITSCO careers hero preset in the app.",
    "heroImagePosition": "center",
    "heroFrameStyle": "rounded",
    "showLeafAccent": True,
    "secureTitle": "A practice application",
    "secureSubtitle": "Use only the supplied fictional QA identities and documents.",
    "startHeading": "Explore the QA roles",
    "startSubtitle": "Choose a fictional role to test its complete application.",
    "startButtonText": "Start QA application",
    "startTimeNote": "Allow about 10 minutes for the synthetic application.",
    "bannerText": "SYNTHETIC QA ONLY. These are not real vacancies or offers of employment.",
    "bannerBullets": ["No real applicant information", "No paid background checks", "Controlled QA inbox only"],
    "bannerLinkText": "See QA openings",
    "bannerLinkAction": "jobs",
    "featureCards": [
        {"icon": "none", "title": "Clear next steps", "body": "Apply, meet the team and complete a fictional hiring journey."},
        {"icon": "none", "title": "One candidate record", "body": "Keep application history and onboarding linked to the correct person."},
    ],
    "trustItems": [{"icon": "none", "title": "Training environment", "body": "No real hiring decisions are made on this demo page."}],
    "whyModal": {"enabled": True, "title": "About the ITSCO QA careers page", "subtitle": "Practice the real Plotline workflow with fictional people.", "cards": [{"icon": "none", "title": "What we are checking", "body": "Public applications, staff review, documents, training and the welcome into the app."}], "ctaText": "View QA openings", "ctaAction": "jobs"},
}

jobs = [
    {"marker": "QA-PL1101-OPS", "liveJobId": None, "title": "Operations Coordinator - SYNTHETIC QA", "city": "Colorado Springs", "state": "CO", "roleType": "Operations / nonclinical", "intendedEmployeeRole": "staff", "credentialMode": "none", "educationLevel": "High school diploma or equivalent (fictional example)", "scheduleText": "Monday-Thursday, 9:00 AM-1:00 PM America/Denver; sample only.", "sampleCompensation": "$22/hour - fictional description only; not a payroll rate change.", "descriptionFile": "job-operations.txt", "isFeatured": True, "tagsJson": ["SYNTHETIC QA", "QA-PL1101-OPS", "Nonclinical"], "suggestedApplicationDeadline": "2026-11-16", "prehirePackageId": None, "onboardingPackageId": None},
    {"marker": "QA-PL1101-CLIN", "liveJobId": None, "title": "School-Based Counseling Associate - SYNTHETIC QA", "city": "Colorado Springs", "state": "CO", "roleType": "Clinical / supervised", "intendedEmployeeRole": "provider", "credentialMode": "expected", "educationLevel": "Master's-level counseling training (fictional narrative; unverified)", "scheduleText": "Proposed Tuesday/Thursday school hours; no approved school assignment.", "sampleCompensation": "Discuss sample terms during QA; no rate or contract is established.", "descriptionFile": "job-provider.txt", "isFeatured": False, "tagsJson": ["SYNTHETIC QA", "QA-PL1101-CLIN", "Prerequisites pending"], "suggestedApplicationDeadline": "2026-11-16", "prehirePackageId": None, "onboardingPackageId": None},
]

people = [
    {"key": "A", "firstName": "Jules", "lastName": "QA-Plotline-1101", "email": "qa.plotline.jules@example.com", "jobMarker": jobs[0]["marker"], "prefix": "applicant-a-jules", "entry": "public application", "target": "active nonclinical staff after all normal requirements", "role": "staff", "workEmailProposal": "qa.plotline.jules.work@example.com", "languages": ["English"], "availability": "Monday-Thursday, 9 AM-1 PM America/Denver.", "experience": "Coordinated appointment requests and maintained task lists at fictional Cedar Desk Services, 2023-2026. Trained two colleagues on checklists and documented handoffs.", "education": "Associate-level office administration coursework at fictional Summit Practice College, 2022.", "skills": "Scheduling, clear written follow-up, spreadsheets and confidential administrative records.", "cover": "I am interested in the fictional Operations Coordinator role. In the synthetic work history attached, I organized scheduling requests, tracked follow-up and explained the next step clearly. I would bring those habits to a small team and ask for guidance when a request falls outside my authority."},
    {"key": "B", "firstName": "Remy", "lastName": "QA-Plotline-1101", "email": "qa.plotline.remy@example.com", "jobMarker": jobs[1]["marker"], "prefix": "applicant-b-remy", "entry": "public application", "target": "pre-hire pending one required item; no clinical clearance", "role": "provider", "workEmailProposal": None, "languages": ["English"], "availability": "Tuesday and Thursday, 9 AM-1 PM America/Denver; preference only.", "experience": "Completed fictional supervised practicum exercises in school transitions and caregiver communication at Practice Grove Training Center, 2025-2026. Presented case formulations to a training supervisor.", "education": "Fictional master's-level counseling coursework at Summit Practice College, 2026. No verified degree or professional license is asserted.", "skills": "Reflective listening, structured notes, supervision preparation and role boundaries.", "cover": "I am applying for the fictional supervised counseling role. My attached narrative describes simulated practicum learning and use of supervision. I understand that an application does not verify credentials or authorize clinical care. For this test I will intentionally leave one required pre-hire item unfinished so the app must keep my access pending."},
    {"key": "C", "firstName": "Noel", "lastName": "QA-Plotline-1101", "email": "qa.plotline.noel@example.com", "jobMarker": jobs[0]["marker"], "prefix": "applicant-c-noel", "entry": "public save/resume then one deliberate reapplication", "target": "second active nonclinical staff; application history retained", "role": "staff", "workEmailProposal": "qa.plotline.noel.work@example.com", "languages": ["English", "Spanish"], "availability": "Monday-Wednesday, 10 AM-2 PM America/Denver.", "experience": "Maintained a bilingual reception checklist and routed questions to the correct team at fictional North Window Desk, 2022-2026. Kept a weekly list of unresolved requests.", "education": "Fictional high school equivalency and office skills training, 2021.", "skills": "English/Spanish administrative communication, intake routing and careful follow-through.", "cover": "I am interested in this fictional coordination role because I enjoy helping people understand what happens next. The attached synthetic history describes front-desk organization and bilingual administrative work. I would confirm the intended recipient before sharing information and keep unresolved requests visible for the team."},
    {"key": "D", "firstName": "Sasha", "lastName": "QA-Plotline-1101", "email": "qa.plotline.sasha@example.com", "jobMarker": jobs[0]["marker"], "prefix": "applicant-d-sasha", "entry": "staff manual candidate, pasted/uploaded resume", "target": "not hired; no employee activation", "role": "staff", "workEmailProposal": None, "languages": ["English"], "availability": "Saturday only, 9 AM-noon America/Denver; intentionally differs from QA role.", "experience": "Organized event check-in and supply lists at fictional Weekend Practice Collective, 2024-2026. Communicated changes to a small volunteer team.", "education": "Fictional office skills course, 2024.", "skills": "Event checklists, polite communication and inventory tracking.", "cover": "This is a manual-entry applicant test for the fictional coordinator role. My synthetic availability is Saturdays only, which differs from the example weekday schedule. Staff should record that mismatch fairly without inventing a credential or moving me into onboarding."},
]
for person in people:
    person.update({"liveUserId": None, "liveApplicationIds": [], "liveJourneyId": None, "communicationChoice": "email", "phone": None, "isSynthetic": True})

references = [
    {"name": "Auden QA Reference-1101", "email": "qa.plotline.reference.auden@example.com", "relationship": "Fictional administrative training supervisor", "candidateKey": "A", "exercise": "complete via delivered public reference form"},
    {"name": "Tobin QA Reference-1101", "email": "qa.plotline.reference.tobin@example.com", "relationship": "Fictional project colleague", "candidateKey": "A", "exercise": "leave pending for real due reminders"},
]

fixtures = {
    "preparedOn": "2026-11-01", "status": "READY_FOR_APP_ENTRY", "liveSetup": "NOT RUN", "sourceReviewedBuild": SOURCE_BUILD,
    "agency": {"id": 450, "slug": "auricwell-qa-demo", "name": "ITSCOLLC"},
    "unchangedAffiliates": [451, 452], "timezone": "America/Denver", "physicalEmailDestination": "testing@itsco.health",
    "caps": {"clients": 30, "providerRoleAccounts": 10, "newClients": 0, "newPeopleOpsAccounts": 1, "newUniqueApplicantsMaximum": 4, "publicApplicantRoleSlotsToReserve": 4},
    "peopleOps": {"firstName": "Marlow", "lastName": "QA PeopleOps-1101", "email": "qa.peopleops.plotline@example.com", "liveUserId": None, "role": "staff", "hasHiringAccess": True, "agencyMemberships": [450], "providerAccess": False, "supervisorPrivileges": False, "adminRole": False, "payrollBillingCredentialingGrants": False, "credentialLocation": "Create a new QA vault entry; no credentials in this packet."},
    "careersPage": page, "jobs": jobs, "applicants": people, "references": references,
    "liveMutationsPerformed": [], "externalDirectoryProvisioningAuthorizedByThisPacket": False,
}

case_specs = [
    ("PL00", "Setup", "Setup admin", "Recount and preserve baseline", "Agency 450 only; caps allow at most four new applicant identities; no clinical client added"),
    ("PL01", "Setup", "Setup admin / Marlow", "Create and sign in as People Ops", "One Staff identity with hiring access; no admin, clinical or other-tenant access"),
    ("PL02", "Careers", "Marlow", "Save the synthetic careers page", "ITSCO branding, QA label, saved copy and exact demo public URL persist"),
    ("PL03", "Careers", "Marlow", "Create both job postings and application forms", "Each exact job maps to its own agency-450 application and snapshot"),
    ("PL04", "Careers", "Marlow / public", "Publish, close and restore a QA job", "Actual displayed dates/zone govern visibility; unrelated jobs unchanged"),
    ("PL05", "Careers", "Public", "Desktop, mobile and keyboard access", "Readable page and modal; error/focus behavior works; no applicant data public"),
    ("PL06", "Applications", "A", "Submit Jules public application", "Matching resume/answers, one candidate and actual receipt"),
    ("PL07", "Applications", "B", "Submit Remy public application", "Provider narrative stays unverified; no clinical clearance or client created"),
    ("PL08", "Applications", "C", "Save, resume and submit Noel application", "Correct saved answers/upload survive; actual submission receipt"),
    ("PL09", "Applications", "C", "Reapply deliberately once", "One user identity with preserved separate application history, not duplicate accounts"),
    ("PL10", "Applications", "Marlow / D", "Create manual Sasha candidate", "Manual source, exact job and resume; no fictional public receipt"),
    ("PL11", "Applications", "A/B/C", "Validation and harmless failed upload", "Clear error, valid answers retained, no false submitted record"),
    ("PL12", "Applications", "Marlow", "Resume access, extraction and AI summary", "Correct source, actionable failure, no invented credentials or external research"),
    ("PL13", "Hiring", "Marlow", "Search/filter pipeline and dashboard", "Unique-person counts, job and stage agree after sign-in"),
    ("PL14", "Hiring", "Marlow", "Note, task, owner and review", "Correct author/time, persistence and private staff-only bodies"),
    ("PL15", "Interviews", "Marlow / A", "Schedule interview and inspect deliveries", "Guest/staff event, receipt and calendar file show exact date/time/zone"),
    ("PL16", "Interviews", "A / guest", "Guest access and end-access negative", "Only exact interview; ended or invalid link blocked"),
    ("PL17", "Interviews", "Marlow / A", "Reschedule and due reminder", "One current event; old slot/reminders replaced; actual due receipt"),
    ("PL18", "Interviews", "Marlow", "Scorecard and collaboration", "Saved private review; sealed content stays sealed; no premature hire"),
    ("PL19", "References", "Marlow / Auden", "Send references and complete one", "Actual request and completion; correct confidential response"),
    ("PL20", "References", "Tobin", "Pending reminder, expiry and completion suppression", "Real 48h/T-24h evidence; completed request suppressed; expired link denied"),
    ("PL21", "Packages", "Marlow / setup admin", "Create QA packages, docs and training", "QA-only required items with exact IDs; no existing defaults modified"),
    ("PL22", "Packages", "Marlow", "Job/person overrides and draft preview", "Correct precedence and signer preview; no send on draft save"),
    ("PL23", "Pre-hire", "Marlow / A", "Start pre-hire and open received link", "Exact person/job, one invite, restricted portal; no employee activation"),
    ("PL24", "Pre-hire", "A / named staff signer", "QA signing and retained receipt", "Each own signature/version; signed original and receipt unchanged after reload"),
    ("PL25", "Pre-hire", "A", "Required file upload and access negatives", "Matching person/task/file; canceled failure clear; other persona denied"),
    ("PL26", "Pre-hire", "Marlow / A", "Add two items and wait for batched notice", "One correct batch; compare real due time with released 2min behavior"),
    ("PL27", "Pre-hire", "B", "Leave required item missing and try to advance", "Missing item enforced; pending password/account cannot bypass activation"),
    ("PL28", "Pre-hire", "C / Marlow", "Complete second pre-hire and portal messages", "Separate documents and correct staff/candidate replies; reviews private"),
    ("PL29", "Not hired", "Marlow / D", "Mark not hired and inspect message", "Truthful persistent state, actual supported notice, no employee access"),
    ("PL30", "Security", "Pending persona", "Token failure, expiry and controlled reissue", "Recovery clear; actual token policy recorded; no cross-person access"),
    ("PL31", "Security", "A/C", "Completed phase integrity and My Submissions", "Signed records retained; locked phase protected from stale writes"),
    ("PL32", "Prerequisites", "Marlow", "Inspect external/clinical requirements", "Real identity/background/license gates left pending; no paid external action"),
    ("PL33", "Onboarding", "Marlow / A/C", "Review and promote to onboarding", "Required completed pre-hire; same person/link; history retained"),
    ("PL34", "Onboarding", "A/C", "Training and document assignment", "Exact job package once; correct deadlines and notices"),
    ("PL35", "Onboarding", "A/C", "Read module, wrong quiz, retry and reflection", "Real permitted progress/attempts; no copied or skipped completion"),
    ("PL36", "Onboarding", "A/C", "Reading, mobile and return visits", "Correct person/material and usable controls; completion retained"),
    ("PL37", "Onboarding", "A/C / Marlow", "Inspect recorded onboarding time", "Truthful actual time; no approved payroll or payment"),
    ("PL38", "Accounts", "Setup admin / A/C", "Review nonclinical role and account mode", "Staff roles; distinct app identity; no unapproved Google provisioning"),
    ("PL39", "Accounts", "A/C", "Set QA password then try app before approval", "Password setup does not activate; old-session gate remains"),
    ("PL40A", "New employee", "Marlow / A", "Final review, activate and sign in Jules", "One active nonclinical staff member in exact roster with retained history"),
    ("PL40C", "New employee", "Marlow / C", "Final review, activate and sign in Noel", "Second active nonclinical staff; reapply history retained"),
    ("PL41", "Email", "Marlow", "Reconcile email catalog and fallback variants", "Every relevant current type accounted for; unreachable cases labeled"),
    ("PL42", "Email", "All permitted recipients", "Verify actual receipt and routing", "Logical vs physical recipient, real headers, message ID and inbox evidence"),
    ("PL43", "Email", "Marlow / A/B/C/D", "Refresh/retry/complete without duplicate sends", "One intended send per event; no resend merely due false failure label"),
    ("PL44", "Audit", "Marlow / Jordan", "Reconcile action-to-audit ledger", "Each expected actor/object/event recorded; gaps explicitly reported"),
    ("PL45", "Privacy", "Candidate / school / guardian / staff", "Denied hiring/reference/document links", "No unauthorized body, download, shared-session or cross-tenant access"),
    ("PL46", "Timed workers", "Marlow", "Observe real due workers and follow-up", "No clock edits/demo bypass; actual receipt or explicit blocked/not run"),
    ("PL47", "Handoff", "Marlow", "Retain final roster and four applicant states", "A/C active only if ready; B pending; D not hired; exact IDs/counts and blockers"),
]

email_specs = [
    ("PE01", "PL06", "Application receipt", "A; provider variant B; new application variant C", "Submit actual public application", "Immediate after successful submission", "job_applications", "ER056"),
    ("PE02", "PL06", "New application staff alert", "Marlow / authorized People Ops", "Same actual submission", "Actual configured event channel", "new_job_application_submitted", ""),
    ("PE03", "PL15", "Interview invitation - candidate", "A", "Save and send interview invitation", "At explicit send", "hiring_interview_invite", "ER044"),
    ("PE04", "PL15", "Interview invitation - staff", "Assigned internal interviewer", "Same interview", "Actual configured event channel", "meeting_invited", ""),
    ("PE05", "PL17", "Interview rescheduled", "A and internal interviewer separately", "One normal reschedule", "At change", "workflow-specific; capture actual", ""),
    ("PE06", "PL17", "Interview due reminder", "A and eligible staff separately", "Leave interview active until configured due point", "Read actual reminder policy; real elapsed time", "meeting_join_reminder", ""),
    ("PE07", "PL19", "Reference request", "Auden and Tobin separately", "Send actual reference requests", "At request", "hiring_references", "ER046"),
    ("PE08", "PL19", "Reference completed notice", "Candidate/staff if workflow offers it", "Auden submits token-bound reference", "After real form submit", "workflow-specific; capture actual", ""),
    ("PE09", "PL20", "Reference 48-hour reminder", "Tobin pending", "Keep its request unanswered", "48h after sent; hourly worker; record actual due", "reference reminder renderer", ""),
    ("PE10", "PL20", "Reference expiry reminder", "Tobin pending", "Wait until token has <=24h left", "Within 24h of expiry; hourly worker", "reference reminder renderer", ""),
    ("PE11", "PL23", "Pre-hire portal invitation", "A; provider B; second hire C", "Review and send actual QA pre-hire package", "At explicit send", "pre_hire_admin_review_access", "ER077"),
    ("PE12", "PL23", "Internal pre-hire access issued", "Authorized internal reviewer if configured", "Same package invite", "Current event policy", "internal_pre_hire_access_issued", "ER138"),
    ("PE13", "PL24", "Signed QA document receipt", "Actual candidate and staff signer variants", "Each signs only their QA document", "Actual configured receipt policy", "workflow-specific signed receipt", ""),
    ("PE14", "PL26", "New hire-portal items batch", "A", "Add two QA items within same window", "Released code is 2min; old comments 15min; compare actual UI", "prehire_new_tasks", "ER078"),
    ("PE15", "PL28", "Candidate portal message waiting", "Marlow / assigned staff", "C sends actual candidate portal question", "Current message notification preference", "workflow-specific; capture actual", ""),
    ("PE16", "PL28", "Staff portal reply waiting", "C", "Marlow replies to exact C conversation", "Current candidate event/channel preference", "hiring_portal_update", "ER045"),
    ("PE17", "PL28", "Pre-hire submitted / awaiting review", "A/C candidate and internal staff separately", "Complete and submit pre-hire", "After normal submission", "pre_hire_review_waiting; internal_pre_hire_materials_submitted", "ER149;ER139"),
    ("PE18", "PL33", "Pre-hire review complete", "Candidate/internal if supported", "Actual authorized review", "After review", "internal_pre_hire_review_complete", "ER140"),
    ("PE19", "PL33", "Onboarding transition/invitation", "A/C", "Promote to onboarding / send invite as required", "At actual transition or explicit send", "onboarding portal renderer", "ER144"),
    ("PE20", "PL34", "Onboarding new item notification", "A/C", "Actual new assigned onboarding item", "Actual event policy; distinguish from pre-hire batch", "hiring_portal_update", "ER045"),
    ("PE21", "PL27", "Incomplete / due nudge", "B or a genuinely incomplete onboarding persona", "Leave required item incomplete until due", "Read configured policy; no backdating", "onboarding_incomplete_nudge; portal_onboarding_reminder", "ER142;ER075"),
    ("PE22", "PL40A", "Onboarding completed notification", "A/C and staff separately", "Candidate submits completed onboarding", "After supported submit", "onboarding_complete_confirmation / workflow renderer", "ER141"),
    ("PE23", "PL40A", "Active employee welcome", "A; distinct C identity", "Final People Ops activation after requirements", "At actual activation", "welcome_active", "ER132"),
    ("PE24", "PL01", "New operator account access", "Marlow", "Ordinary QA operator creation/setup", "Actual supported setup workflow", "pending_welcome or actual account renderer", "ER071"),
    ("PE25", "PL39", "Employee password setup / recovery", "Pending A/C or ready Marlow; separate variant", "Use own QA account's supported setup/recovery", "Transactional; record actual expiry", "password_reset / admin_initiated_password_reset", "ER070;ER005"),
    ("PE26", "PL30", "Expired pre-activation access", "Pending B only when truly expired", "Wait for normal expiry / supported reissue", "Actual expiry; no token/date edits", "password_expired_pre_activation if selected", "ER145"),
    ("PE27", "PL29", "Not-hired notice", "D", "Review and send actual supported not-hired action", "At explicit supported send", "pre_hire_not_moving_forward", "ER148"),
    ("PE28", "PL27", "Hold status notice", "B if normal hold action exists", "Explicit supported hold; missing task alone is not an email trigger", "At actual supported action", "pre_hire_hold_status", "ER147"),
    ("PE29", "PL21", "Role acknowledgement request", "A/B if selected by actual workflow", "Assign real QA job acknowledgement", "Current event policy", "pre_hire_role_ack_request", "ER150"),
    ("PE30", "PL21", "Conditional-offer wording variants", "Only selected QA packet variant", "Inspect actual supported QA-only offer flow", "No real offer or forced fallback send", "conditional_offer_formal; conditional_offer_warm", "ER133;ER134"),
    ("PE31", "PL32", "Background authorization / initiated notices", "Candidate/internal if actual supported sandbox exists", "Do not initiate a paid or real external background check", "BLOCKED if only live external initiation exists", "pre_hire_authorization_request; internal_background_check_initiated", "ER146;ER137"),
    ("PE32", "PL41", "Remaining configured Plotline types", "Inventory exact meaningful recipients", "Reconcile current in-app catalog and existing full email sweep", "Record each actual trigger and due time", "including expiring_background/opening-soon/training if configured", "ER035;ER143"),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = {}

    def add(name, value):
        if isinstance(value, str):
            value = "\n".join(line.rstrip() for line in value.splitlines()) + "\n"
        files[name] = value.encode() if isinstance(value, str) else value

    add("fixtures.json", jdump(fixtures))
    add("careers-page.json", jdump(page))
    add("careers-page.txt", "PLOTLINE DEMO CAREERS PAGE - COPY INTO THE EXISTING APP\n\n" + WARNING + "\n\n" + "\n\n".join(f"{key}: {value}" for key, value in page.items() if isinstance(value, str)) + "\n\nUse the existing ITSCO logo/hero preset and Plotline credit. The JSON gives\nmodal, navigation and card fields; enter those through the normal editor.\nThis is source copy, not a published page.\n")
    add("jobs.json", jdump(jobs))
    for job in jobs:
        paragraphs = [WARNING, f"Fixture marker: {job['marker']}", "Purpose: exercise careers, application, review and onboarding in demo agency 450 only.", f"Location: {job['city']}, {job['state']}", f"Schedule: {job['scheduleText']}", f"Sample terms: {job['sampleCompensation']}"]
        if job["credentialMode"] == "none":
            paragraphs += ["Responsibilities: organize requests, maintain a follow-up list, communicate next steps and protect confidential administrative information. Route clinical questions to an authorized clinician.", "Qualifications in this fictional role: clear writing, organized task tracking and comfort asking for help. This job does not authorize patient care, medical billing or supervisor actions."]
        else:
            paragraphs += ["Responsibilities in the fictional role: prepare for supervision, communicate professionally with a school team, and follow intake, consent, record and scope requirements before care.", "Master's-level training is an expectation in this example, not verified evidence. No fictional resume, file or hiring decision verifies a professional license. No clinical work, NPI, school hours or supervisory authority is granted by applying."]
        paragraphs += ["Application materials: matching synthetic resume, cover letter, availability, short role question and controlled reference contacts. Email notifications only.", "Required acknowledgement: I understand this is a synthetic QA job and that applying does not create employment or authorize access to clients.", "Pre-hire and onboarding use separately configured QA packages. All prerequisites still apply; no paid background, banking, tax or external credential check is included."]
        text = job["title"] + "\n\n" + "\n\n".join(paragraphs) + "\n"
        add(job["descriptionFile"], text)
        add(job["descriptionFile"].replace(".txt", ".pdf"), make_pdf(job["title"], paragraphs))
    answers = {}
    for person in people:
        full = person["firstName"] + " " + person["lastName"]
        resume = [f"Name: {full}", f"Logical QA email: {person['email']}", "Contact: email only; no working phone or real address supplied.", "PROFILE", person["skills"], "EXPERIENCE - ALL FICTIONAL", person["experience"], "EDUCATION - ALL FICTIONAL / UNVERIFIED", person["education"], f"LANGUAGES: {', '.join(person['languages'])}", f"AVAILABILITY: {person['availability']}", "No verified license, credential, employment history or background check is asserted by this file."]
        add(person["prefix"] + "-resume.txt", full + " - Synthetic resume\n\n" + WARNING + "\n\n" + "\n\n".join(resume) + "\n")
        add(person["prefix"] + "-resume.pdf", make_pdf(full + " - Synthetic resume", resume))
        add(person["prefix"] + "-cover-letter.txt", WARNING + "\n\nDear QA hiring team,\n\n" + person["cover"] + "\n\nThank you,\n" + full + "\n")
        answers[person["key"]] = {"name": full, "logicalEmail": person["email"], "jobMarker": person["jobMarker"], "phone": None, "communicationChoice": "email", "availability": person["availability"], "languages": person["languages"], "whyThisRole": person["cover"], "organizationExample": "I would write the next action, its owner and due date in the shared task list. I would confirm the handoff before marking it complete.", "privacyExample": "I would verify the recipient and my authority before sharing information. I would ask the responsible staff member when unsure.", "credentials": "No verified credential supplied - synthetic QA narrative only.", "references": references if person["key"] == "A" else [], "acknowledgementText": "I understand this is a synthetic QA job and does not create employment or authorize client access.", "signatureInstruction": "Only a tester acting as this fictional persona signs QA-labeled test forms; never a real person's signature or clinical attestation.", "reapplyChangeForC": "For C's one deliberate new application, add Friday 10 AM-noon as a new availability preference; retain the original application snapshot." if person["key"] == "C" else None}
    add("application-answers.json", jdump(answers))
    add("references.txt", "SYNTHETIC REFERENCE INPUTS\n\n" + WARNING + "\n\n" + "\n\n".join(f"{r['name']}\n{r['email']}\n{r['relationship']}\n{r['exercise']}" for r in references) + "\n\nAuden form example:\nI worked with Jules in the fictional administrative training scenario. Jules\nkept an orderly task list and checked ownership before closing a request.\nA useful development area was asking for help earlier when priorities changed.\nI would practice working with Jules again in this simulated setting.\nThese are QA answers, not a real reference or a verified employment claim.\n\nComplete only Auden initially. Leave Tobin unanswered for real due reminders.\nBoth requests physically go to testing@; use their separate delivered tokens.\nDo not send real email replies as an example.com identity.\n")
    add("review-notes.txt", "PRIVATE PEOPLE OPS QA EXAMPLES\n\n" + WARNING + "\n\nJules review: The supplied synthetic resume includes scheduling and follow-up\nexamples. Ask for a short task-prioritization example in the interview. No\nexternal employer, education or credential verification has been completed.\n\nTask: Confirm Jules can describe an appropriate handoff for a clinical\nquestion without attempting to answer outside a nonclinical role.\n\nRemy review: Supervision and credential prerequisites remain unverified. Keep\nthe required QA upload incomplete for the blocked-advancement case.\n\nSasha not-hired reason: For this fictional role, the supplied Saturday-only\navailability does not match the sample weekday hours. No judgment about a\nreal person or protected characteristic is being made.\n\nNoel portal question: Where can I return to see my completed QA documents\nafter I finish onboarding?\nStaff reply: Your completed QA package should remain in My Submissions.\nPlease use your own portal link and tell us if the document is missing.\n")
    acknowledgement = ["This document exercises the demo application's signing and retention workflow only. It is not an employment contract, consent to a background check, clinical agreement or verified qualification.", "I understand I am using a fictional QA identity and will keep real personal, financial and clinical information out of this exercise.", "I will review the displayed task and ask a QA operator if I cannot complete it through the normal permitted workflow.", "Candidate signature and date are collected by the app as this fictional persona. A separate staff countersigner, if configured, signs only their own QA acknowledgement. No signature is prefilled in this file."]
    add("qa-prehire-acknowledgement.pdf", make_pdf("QA pre-hire acknowledgement", acknowledgement))
    add("qa-prehire-acknowledgement.txt", WARNING + "\n\n" + "\n\n".join(acknowledgement) + "\n")
    handbook = ["WELCOME TO THE QA WORKPLACE", "In this fictional workplace, the staff member keeps a task list with a clear next action and owner. A task is complete only after the expected handoff is confirmed.", "PRIVACY AND ROLE BOUNDARIES", "Use only your own app identity. Review the recipient and your authority before sharing a document or message. Nonclinical staff route clinical questions to an authorized clinician.", "ASKING FOR HELP", "When a record is missing or a deadline conflicts, ask People Operations through the intended message path. Do not change another person's work or mark prerequisites complete to clear a checklist.", "ACCOUNT READINESS", "Setting a password is a setup step. Employee access starts after the required onboarding and staff approval. Keep passwords and personal portal links in the QA vault.", "This is a short QA resource, not ITSCO's actual employee handbook or a legal policy. Reading this file alone does not pass required company training."]
    add("qa-handbook.pdf", make_pdf("QA orientation handbook", handbook))
    add("qa-handbook.txt", WARNING + "\n\n" + "\n\n".join(handbook) + "\n")
    upload = ["Document title: QA upload practice sheet", "Fictional participant: choose the candidate whose task is open.", "Purpose: verify the selected file is retained on the correct candidate and task.", "This file is deliberately unsigned. It is not a transcript, license, identity document, background result, certificate of completion or proof of a prerequisite."]
    add("qa-upload-practice.pdf", make_pdf("QA upload practice sheet", upload))
    training = {"title": "QA orientation: task handoffs and privacy", "warning": WARNING, "body": handbook, "questions": [{"question": "A clinical question reaches a nonclinical coordinator. What should they do?", "options": ["Guess an answer", "Route it to an authorized clinician", "Mark the request complete without a handoff"], "correctIndex": 1}, {"question": "A new candidate has set a password but is waiting for approval. Are they active?", "options": ["Yes, password save activates them", "No, normal onboarding and staff approval still apply"], "correctIndex": 1}, {"question": "Where should a private candidate token be stored?", "options": ["A public screenshot", "An ordinary shared result CSV", "The controlled QA vault"], "correctIndex": 2}], "reflectionPrompt": "Write one sentence about confirming the owner of the next action.", "syntheticReflectionExample": "I would confirm who owns the next step before closing the handoff.", "completionInstruction": "Use the app's real reading, quiz and retry rules. Do not invent completed time, another person's answer or a real training credential."}
    add("qa-orientation-training.json", jdump(training))
    add("workflow-materials.txt", "QA PACKAGE SETUP\n\n" + WARNING + "\n\nCreate agency-450 QA packages only; do not overwrite all-jobs defaults.\n\nPRE-HIRE: QA-PL1101-PREHIRE\n- Exact saved QA job description acknowledgement.\n- qa-prehire-acknowledgement.pdf: required candidate QA signature, separate\n  assigned staff QA countersignature where supported. Use .txt for builder copy.\n- Required upload: qa-upload-practice.pdf, with an accurate QA-only title.\n- Staff review through the normal phase control.\n\nONBOARDING: QA-PL1101-ONBOARDING\n- qa-handbook.pdf: required QA resource/acknowledgement; .txt gives builder copy.\n- qa-orientation-training.json: create a small module with the source paragraphs,\n  three quiz items and reflection. Correct answer indexes are ZERO-BASED.\n- Use normal user setup and account/password readiness steps for the chosen\n  nonclinical role. No fake tax, SSN, bank, license or background fields.\n- Candidate submits; authorized People Ops reviewer approves activation.\n\nAttach these through each new QA job's package editor. Review effective defaults\nand per-person preview. Record IDs without storing a token/password. Required\nreal company/security steps remain required; if they cannot be completed safely\nin a synthetic run, report BLOCKED. Do not use this packet to certify readiness.\n")
    add("upload-negative.txt", "Harmless QA text file. Use only to test a field that disallows TXT.\nIf TXT is allowed, this file is not an invalid-type test. No executable payload.\n")
    case_headers = ["case_id", "area", "actor", "action", "expected", "status", "build", "user_ids", "job_id", "application_ids", "object_ids", "action_time_denver", "utc_offset", "expected_audit_action", "actual_audit_ids", "evidence", "finding", "next_action"]
    rows = []
    for case_id, area, actor, action, expected in case_specs:
        row = {key: "" for key in case_headers}
        row.update(case_id=case_id, area=area, actor=actor, action=action, expected=expected, status="NOT RUN")
        rows.append(row)
    add("cases.csv", csv_bytes(case_headers, rows))
    email_headers = ["email_case_id", "case_id", "email_variant", "logical_recipient", "real_trigger", "timing_to_verify", "expected_type_or_source", "design_review_reference_only", "status", "actual_type", "logical_to", "physical_to", "actual_from", "actual_reply_to", "action_object_ids", "action_time_denver", "due_time_denver", "send_time_denver", "receipt_time_denver", "utc_offset", "provider_message_id", "inbox_message_id", "communication_id", "screenshot", "finding"]
    email_rows = []
    for spec in email_specs:
        row = {key: "" for key in email_headers}
        row.update(dict(zip(email_headers[:8], spec)))
        row["status"] = "NOT RUN"
        email_rows.append(row)
    add("email-cases.csv", csv_bytes(email_headers, email_rows))
    add("README.txt", "PLOTLINE SYNTHETIC QA INPUT PACKET - NOVEMBER 1, 2026\n\nStatus: ready for APP ENTRY. Live user/page/jobs/applicants: NOT RUN.\nNo database, API, Google Directory, email transport or app write was executed\nby generating these files. No credentials, live bearer links or real PHI exist\nin the packet. Use the same ITSCOLLC demo 450, controlled inbox and QA vault.\n\nRun instructions:\n../../QA-ADDENDUM-2026-11-01-PLOTLINE-HIRING-AND-ONBOARDING.txt\n\nStart with PL00 recount and PL01 new Marlow People Ops user. Save the careers\ncopy through the existing app. Then create the two new QA jobs/packages and\nsubmit A/B/C through their actual public application forms. D uses the manual\nentry path. Record the IDs the app creates; fixtures.json deliberately has\nnull live IDs. These JSON files are data-entry references, NOT API payloads.\n\nTarget: Jules and Noel become active NONCLINICAL staff only after normal\nrequirements and approval; Remy stays pending; Sasha stays not hired. This is\na target, not a report of real statuses. An app-only synthetic setup cannot\nprove Google work-account provisioning or real timed email delivery.\n\nFILES\n- fixtures.json: scoped operator, four identities, planned roles and targets.\n- careers-page.txt/.json: actual editor copy with visible demo labels.\n- jobs.json, job-operations/provider.txt/.pdf: new QA job copy.\n- applicant-*-resume.pdf/.txt and *-cover-letter.txt: four distinct sources.\n- application-answers.json: questions, preferences and reapply change.\n- references.txt: two controlled synthetic references, one left pending.\n- review-notes.txt: factual QA staff review/task and candidate question.\n- workflow-materials.txt: new per-job QA packages; existing defaults preserved.\n- qa-prehire-acknowledgement.txt/.pdf: unsigned QA signature test document.\n- qa-handbook.txt/.pdf: short fictional resource, not a company policy.\n- qa-upload-practice.pdf: unsigned upload test, not credential evidence.\n- qa-orientation-training.json: source content, quiz and reflection.\n- upload-negative.txt: harmless text for a field that disallows TXT.\n- cases.csv: all live cases NOT RUN; duplicate rows for meaningful variants.\n- email-cases.csv: actual-action inventory; old review IDs are design evidence.\n- checksums.csv: SHA-256 and byte size of the generated inputs.\n\nAll example.com addresses are separate logical identities whose app outbound\nmail redirects to testing@itsco.health. They are not Google users, working\nmailboxes or verified external reply senders. Never use a real person's From\nidentity to impersonate an applicant. Use token-scoped candidate/reference\nforms, and keep those personal links in the vault. New work-email proposals\nare reserved examples for app-only mode, never permission to provision ITSCO\nGoogle users/groups or disable the current account-readiness gate.\n\nSource review used released build " + SOURCE_BUILD + ".\nEngineering observed: public applications default to provider; nonclinical\nrole must be reviewed before activation. Added-items batch uses 2 minutes\nwhile old comments say 15; compare UI and actual receipt. Account mode can\nrequire real Google Group provisioning; preserve that prerequisite as a blocker\nunless an exact approved QA work identity is available for the new person.\n\nTo rebuild OFFLINE using only Python's standard library:\npython3 docs/qa/tools/buildPlotlineQaFixtures.py\nOnly this packet's named files are generated. Save completed result CSVs to\nthe run's evidence directory first; rebuilding restores blank NOT RUN ledgers.\nNo dependency installs, full frontend builds or extra checkouts are needed.\n")
    checksum_rows = [{"file": name, "bytes": len(value), "sha256": hashlib.sha256(value).hexdigest()} for name, value in sorted(files.items())]
    add("checksums.csv", csv_bytes(["file", "bytes", "sha256"], checksum_rows))
    # Protect any completed results or manually amended source on a repeat run.
    for name, value in files.items():
        target = OUT / name
        if target.exists() and target.read_bytes() != value:
            raise SystemExit(f"Preserving changed file: {target}. Move run results to evidence before rebuilding.")
    for name, value in files.items():
        (OUT / name).write_bytes(value)
    print(jdump({"directory": str(OUT), "files": len(files), "totalBytes": sum(map(len, files.values())), "liveSetup": "NOT RUN", "cases": len(rows), "emailCases": len(email_rows)}).strip())


if __name__ == "__main__":
    main()
