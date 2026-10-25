# ITSCO-style demo agency: daily QA bot instructions

Run realistic, persistent synthetic enrollment, scheduling, portal, and clinical workflows in the dedicated QA agency. Start at **5 a.m. America/Denver** every day. Preserve the resulting clients for human support inspection and reminder testing. Do not delete them at night. Produce a morning brief with screenshots and a later delivery update.

## Primary experience and priorities

The primary test subject is the **full agency platform used by ITSCO providers**, with its normal dashboard, navigation, account tools and workflows. Use the existing isolated agency 450, `auricwell-qa-demo`. Its historical AuricWell name does not mean the test is confined to the standalone EHR. Do not rename its slug: the deployed notification guard depends on that identity.

Start staff sessions at **https://app.itsco.health/auricwell-qa-demo/login** and use **https://app.itsco.health/auricwell-qa-demo/dashboard** as the provider landing page. Use ordinary provider permissions. No superadmin session, impersonation, EHR preview header, or alternate simplified provider UI is part of the primary test. Staff should reach scheduling, clients, documentation, payroll, training, notifications and settings through the same full-platform navigation that ITSCO providers use.

The standalone AuricWell EHR remains a **secondary regression track**. Its screenshots and passing checks cannot substitute for full-platform coverage. Finish and report the primary daily agency journeys first; further standalone EHR design work is lower priority.

"Same features" means parity with the relevant ITSCO role and enabled modules, not administrator access for a provider. Before declaring the demo representative, inventory its visible navigation and feature configuration against the intended ITSCO provider workflow. Record missing modules, assignments, services, training, payroll configuration and permission differences as setup gaps. Copy only approved configuration or blank templates into the demo; never copy actual clients, employee payroll, school contacts, notification recipients, live integrations or credentials. The current demo was initially provisioned with minimal QA configuration; full configuration parity is **not yet verified**.

### Required full-platform coverage

| Area | Daily evidence and realistic interaction |
| --- | --- |
| Provider dashboard and navigation | Normal provider landing page; correct agency; desktop/mobile navigation; reload and direct-link behavior |
| My Account, settings and notifications | Own profile, credentials, documents, notification preferences and inbox; save/reload a permitted reversible preference and restore it |
| Scheduling and availability | Provider publishes school and office openings; fresh guardian selects one; saved booking is visible to both roles |
| Clients and documentation | Assigned caseload, correct child/guardian relationships, intake and document access, draft persistence, real signing gates |
| My Payroll, compensation, benefits and Submit | Open the actual personal pages; exercise configured synthetic time/claim validation and draft workflows; verify own history and role boundaries. No real payroll posting, payment, bank connection or tax filing |
| Tasks/checklist and training | Assigned items, due/completed states, saved progress, training content and quiz attempts where configured; see the training checklist below |
| Messages, notifications and Client Exchange | QA-only routing, recipient isolation, provider assignment, actual delivery evidence and delayed reminders |
| Support review | Normal full-platform support session; inspect retained synthetic families and workflow state within the support role's permissions |
| Additional enabled ITSCO modules | Inventory and test role-appropriate supervision, meetings, library, reporting and other enabled features; absent configuration is a gap, not a pass |

Maintain separate results for **navigation rendered**, **record persisted**, **workflow completed**, and **notification delivered**. A page opening does not establish end-to-end success.

## Current setup and release gates

Provisioned on October 24, 2026:

- Agency **450**, `auricwell-qa-demo`: **AuricWell QA Mental Health — DEMO**, mental health only.
- Fictional school **451**, `auricwell-qa-demo-school`: **Cedar Grove K-8 — DEMO**, affiliated only with agency 450.
- An isolated counseling office and room; their identifiers are in the private provisioning receipt.
- Provider **1433**, support **1434**, setup administrator **1435**. All are synthetic, with membership only in agency 450. None is a superadmin.
- A separate AuricWell practice linked to the same agency and the same three shared staff identities. Its ID is `910a6a29-e6cd-45bc-bfd2-e88becc876b8`.
- Four independent enrollment links, listed below. Blank forms were copied from the existing demo template masters; no real client records, staff contacts, or notification recipient lists were copied.
- Full-platform authentication accepted all three accounts. The current AuricWell browser workspace uses these same full-platform identities. An independent prototype API also has separate credentials, but those are not the browser credentials supplied to bots.

**Daily execution is not enabled yet.** Complete and record these gates before enabling write scenarios:

1. **Deployed and access-tested:** the QA Client Exchange recipient guard in `backend/src/utils/auricwellQaPolicy.js` and `backend/src/services/clientExchangeNotifications.service.js`. Tests cover match, claim and assignment filtering, including suppression of the QA support audit report. Only provider 1433 is eligible for exchange notifications. Actual send/receive verification remains pending; no synthetic exchange event has been sent yet.
2. **Deployed and browser-tested:** QA staff can open `https://auricwell.com/app/auricwell-qa-demo` with their ordinary practice credentials. The interface shows **QA workspace**, and users retain their provider, support or agency-admin role. Tests verify the sole visible agency, cross-agency denial, support clinical-write denial and restricted navigation. Normal support browser sign-in also passed. Screenshots are in `deliverables/auricwell-qa/`. The prior “superadmin preview” entry requirement has been removed for these scoped QA identities; no role was elevated.
3. Complete the appropriate QA provider/service configuration in the full platform. The independent prototype practice remains in `setup`; do not use that prototype to claim current browser coverage. Legal signatures, credential reviews and clinical activation have not been fabricated. Honor the real application gates for each clinical scenario.
4. Verify the QA agency's email sender, approval rules, and redirection using a single controlled canary. The shared sender recognizes `@example.com`, but every delivery path, Cc/Bcc, reply, and reminder still needs verification. A queued or held email is not delivered.
5. Enable and verify provider notification consent/preferences and a registered agency SMS sender for **+16189107000**. The phone is stored on provider 1433; SMS preferences remain disabled until sender and consent setup is completed. Do not change the configuration of an existing real agency. No client SMS is authorized by this brief.
6. Finish office service/room eligibility and provider scheduling configuration, then prove a fresh guardian can select a slot published by the provider. Publishing provider availability belongs in the daily test itself.
7. Configure the Grok scheduler and restricted mailbox reader; record the scheduler job ID and next run. This repository setup has not created a Grok job or granted inbox access.
8. Verify ordinary full-platform sign-in reaches the provider dashboard and its personal tools. On October 24, the initial check found a routing blocker: "This tenant has no configured app domain." A successful API login or standalone EHR check does not satisfy this gate. Track the scoped routing fix and subsequent browser evidence in `deliverables/itsco-style-qa/`.
9. Finish the provider feature-parity inventory above, including a synthetic training/quiz assignment and payroll configuration appropriate to the provider persona. Unconfigured modules remain BLOCKED until their actual workflows are tested.

**Full-platform candidate check, October 24:** revision `onboarding-frontend-itsco-qa-routing-20261024` fixes the demo's missing-domain routing failure while retaining its agency path on `app.itsco.health`. Fresh provider sign-in and all six checked pages rendered against live QA APIs, with membership restricted to agency 450 and no JavaScript exceptions. This was a preview check, not published production behavior. Automatic approval review blocked the subsequent shared frontend traffic switch pending explicit approval and review of the remaining findings. The live primary sign-in routing gate therefore remains BLOCKED.

The candidate still reports training-library access denied (`/api/provider-update/document-learning`, 403), optional Skill Builders/accountability permissions (403), clinical-note/learning-class requests (400), and a student-training endpoint (404). These are recorded in `deliverables/itsco-style-qa/candidate-verification.json`. Do not grant elevated roles to remove the errors. Determine whether each module belongs in the intended provider persona, then configure the appropriate synthetic assignments/eligibility or fix the UI's request handling. Payroll/account pages rendering does not establish payroll calculation or submission success; no quiz attempt, payroll submission, client enrollment or booking was performed in this smoke check.

Use **BLOCKED** for these known prerequisites, not PASS. A screenshot of a successful-looking screen does not establish a saved record or delivered message.

## Accounts and credential handling

**Primary full-platform sign-in:** `https://app.itsco.health/auricwell-qa-demo/login`

**Primary provider dashboard:** `https://app.itsco.health/auricwell-qa-demo/dashboard`

**Secondary AuricWell regression workspace:** `https://auricwell.com/app/auricwell-qa-demo`. Use the practice sign-in link on that page with the **same email and password** used on the full platform. Sign in separately on each domain. Do not make this the default bot landing page.

| Identity | Username on both browser interfaces | Private credential file | Intended use |
| --- | --- | --- | --- |
| Provider | `qa.provider.auricwell@example.com` | `secrets/auricwell-qa/provider.json` | Availability, assignments, appointments, clinical workflow |
| Support | `qa.support.auricwell@example.com` | `secrets/auricwell-qa/support.json` | Human review of clients, enrollment, scheduling and support access |
| Setup | `qa.setup.auricwell@example.com` | `secrets/auricwell-qa/setup.json` | QA-only setup and configuration; not routine guardian testing |

Each bot receives only its own role's file through the bot platform's secret store. All three files have local mode 0600 and are excluded from Git. Do not distribute the combined provisioning receipt (`secrets/auricwell-qa/credentials.json`). It also contains unused independent-prototype credentials and authenticator material, which are not needed for the current browser interfaces. The support account has no standalone clinical-note supervision privileges; verify its restricted view rather than broadening permissions to make a test pass.

Never put passwords, reset/invitation tokens, authenticator seeds, cookies, bearer tokens, or storage-state files in reports, screenshots, repositories, or issue bodies. Redact sign-in/setup screens. Never use a real staff login or cloud/database credentials in browser bots. No bot receives a superadmin account.

The current AuricWell interface supports QA-scoped chart, appointment and provider review, and provider draft-note workflows. Availability publication, guardian enrollment, booking and signing must use the full platform where supported. Record unavailable AuricWell actions as NOT_SUPPORTED; do not label both products fully covered when only one implements a workflow.

## Enrollment entry points

| Daily case | Public entry point |
| --- | --- |
| School English | https://app.itsco.health/intake/f243e3ac1cf550565687a32028d7ff535ad4965b7d47ce60 |
| School Spanish | https://app.itsco.health/intake/a816de239557a6bbc0e953e085f6fd235c494f4ab936fc7e |
| Office English | https://app.itsco.health/intake/office-intake-450-en-876e98bf5af05de5 |
| Office Spanish | https://app.itsco.health/intake/office-intake-450-es-1cadfe975924387d |

Verify the destination agency and school before submitting. An office client belongs to agency 450 and the QA office; do not attach them to a real school. Do not substitute Hogwarts, the generic Demo Playground, or a marketing demo. The marketing demo does not persist real workflow actions.

## Daily orchestration

Use one coordinator and isolated browser contexts for the provider, each guardian/client, and the support reviewer. Reuse each role’s authenticated session throughout its run. Honor HTTP 429 and Retry-After; do not repeatedly sign in, rotate identities to evade a throttle, or restart services to reset limits. The current production login limiter allows five requests per account/IP in 15 minutes. A repeated support verification reached this limit after successful checks on October 24; this is a rate-limit observation, not an invalid-password result. Do not share cookies or sessions among roles. Serialize provider availability changes before client slot selection. Reserve different slots for different journeys except in the explicit conflict test.

Use the Denver calendar date for `runId`, for example `awqa-20261025`. Persist a run manifest before creating anything. A scheduler retry resumes that manifest, checks existing submissions, and does not create another family with the same identity. Use a distributed daily-run lock or the scheduler's concurrency control. Do not use a fixed UTC offset: Denver observes daylight-saving changes.

Suggested order:

1. **05:00 preflight:** sign into the full platform; check scope, required provider navigation, gates, dependency health and remaining notification budget. Report a blank or unavailable dashboard as a primary blocker even if the standalone EHR works.
2. **05:05 provider:** publish school capacity and office availability through the normal UI; reload and record visible slots.
3. **After availability is verified:** run the four enrollment cases. Each must create a fresh guardian/client account through the real public enrollment and account-activation path.
4. **After enrollment:** booking, rescheduling, cancellation, portal checks, provider assignment and clinical checks on each successful case.
5. **Before the brief:** check the full-platform account, payroll, tasks/training, notifications and support workflows listed above. Reuse the authenticated staff sessions. Run secondary EHR checks only after primary coverage has been accounted for.
6. **By 06:30:** publish a brief even if blocked; include incomplete cases rather than silently waiting forever. Allow up to 15 minutes per scenario before reporting a timeout with evidence.
7. **Later delivery check:** inspect the controlled reminder cohort at its actual configured due times and update the same report. A 10 p.m. status update may close the day's report; it does not delete clients or cancel future reminders.

Keep a maximum of 20 provider notification sends per daily run initially. This is an operational budget, not permission to send arbitrary messages. Stop new sends on duplicate storms or unexpected recipients. Never repeatedly resubmit a form because an email is delayed.

## Synthetic identities and variation

Every address must end in `@example.com`. Suggested names:

- `awqa.20261025.school.en.guardian1@example.com`
- `awqa.20261025.school.es.guardian1@example.com`
- `awqa.20261025.office.en.client@example.com`
- `awqa.20261025.office.es.guardian1@example.com`

Generate separate strong passwords for each account where the application asks for one. Capture account IDs and activation outcomes privately. Use fictional names and birth dates consistent with each scenario; include the run identifier in the QA client label or a supported internal test field. Use Spanish accents and compound surnames in Spanish cases. Use invented nonclinical concerns, strengths and goals rather than copying real charts.

The four daily cases always cover both settings and both languages. Rotate additional cases across the week, alternating English/Spanish on the next cycle:

| Rotation | Additional family or client configuration | Required permission check |
| --- | --- | --- |
| Monday | One guardian with two children of different ages | Documents, answers, appointments and alerts attach to the correct child |
| Tuesday | Two guardians with separate logins | Access and communication preferences remain independent; revocation removes only the intended relationship |
| Wednesday | Non-parent legal guardian with synthetic authority documentation | Correct authority and signature workflow; unsupported relationships are reported |
| Thursday | Guardian allowed scheduling but restricted clinical or financial access | Hidden information is unavailable through direct links as well as navigation |
| Friday | Adult self-enrollment and an adult dependent with an authorized representative | No automatic assumption that a guardian of a minor retains authority over an adult |
| Saturday | Adolescent with a separate dependent portal, where supported | Dependent and guardian permissions match configured policy |
| Sunday | School-to-office transition and returning client | No duplicate chart; prior authorizations are not silently extended to a new setting |

Use synthetic records inside this QA agency for negative-access tests. Do not probe real client identifiers. Where a feature is unavailable, record NOT_SUPPORTED or BLOCKED with the observed screen; do not invent policy or bypass a gate. Bots can provide repeatable coverage, but usability findings and clinical/privacy rules still require review.

## Provider checklist

1. Sign in as provider 1433 on the **full platform**, open the normal provider dashboard, and confirm only agency 450 is available and the profile is the fictional bilingual provider. Test through normal navigation, including My Account, My Schedule, tasks/training, Submit, notifications and tools as enabled. Do not route this worker into the standalone EHR to bypass a full-platform failure.
2. In school scheduling, publish capacity for school 451 on the next valid school day. Respect the actual school calendar; on weekends choose a future permitted day.
3. In office scheduling, create a one-off availability window in the isolated office/room. Select actual services and appointment duration, including required buffers. Avoid recurring windows that accumulate forever.
4. Save, reload, and verify the window remains. Record local time, timezone, UTC time, room, service, provider ID and available capacity.
5. From a fresh guardian/client session, verify those slots are selectable. A provider calendar screenshot alone is insufficient.
6. Book an allowed slot; verify it disappears or its capacity decreases. Attempt an explicit conflicting booking in another synthetic session: expect a clear rejection without a second appointment.
7. Test a blocked time and a time outside availability. Check no phantom bookings remain after rejection.
8. Observe the new-client assignment and expected notifications. Confirm assignments point only to provider 1433. Exercise Client Exchange only after its deployed recipient guard has been verified.
9. Reschedule a test appointment and verify the old slot is released, the new slot is occupied, and reminders reference the new time. Cancel a separate appointment and check capacity and reminder suppression.

## Guardian and client checklist

For every core scenario:

1. Open the assigned link in a new browser context. Confirm setting, school/agency, and language. Verify Spanish labels, validations, disclosures and confirmations, not just the language selector.
2. Enter realistic fictional family demographics; test required fields, invalid email/date validation and correction. Do not submit a duplicate valid form during negative tests.
3. Complete the normal consent and signature steps as the synthetic guardian/client. Upload a clearly marked synthetic PDF or image. Test allowed type/size handling without uploading executable files.
4. Test save/resume where supported, including reload and a fresh session. Confirm data reappears for the intended family only.
5. Submit once. Record the submission/client/guardian IDs and confirmation. Verify no duplicate children or guardian links were created.
6. Activate the portal using the actual invitation received in the controlled mailbox. Scope mailbox access to QA run messages; do not read unrelated mail in the shared testing inbox. If mailbox access is unavailable, report the invitation step as blocked.
7. Select a slot the provider published. Confirm service, provider, school or room, local date/time and timezone before submission. Verify the saved booking after reload and from the provider session.
8. Complete available questionnaires and check-in. Test questionnaire answers and upload/download access on desktop and a mobile viewport. Mobile emulation is not a claim of testing a physical iPhone.
9. Verify family isolation with another synthetic account and a direct link to that account's QA record. Expect denial without leaking names or answers.
10. Verify reschedule/cancel confirmations and that old invitation or booking links behave appropriately. Report expired/reused links accurately.

Do not supply the owner's phone as a guardian or client phone: **+16189107000 is authorized here for the demo provider only**. If a guardian form requires a phone, use a reserved fictional 555-01xx value and explicitly decline SMS; never send to that number. If the flow cannot proceed without real phone verification, report BLOCKED.

## Provider clinical and support review

Use fictional clinical content. Open the newly created chart as the assigned provider, create a draft note, trigger missing-field validation, save, reload and reopen from a new session. Verify the actual saved text and the correct client/appointment link. Where signing is enabled, verify finalization and amendment behavior; never bypass clinical activation or signing rules to get a green result. A draft-save success is not a successful signing test.

Sign in separately as support 1434. Locate clients by run date, inspect enrollment status, guardian relationships, appointment location, preferred language and communications that the support role is permitted to see. Capture a summary screenshot. Verify that restricted clinical/financial information stays restricted. Leave the clients available for the owner's later inspection.

## Provider training and quiz checklist

Include the normal training/quiz experience in the full-platform example. The precise meaning of the requested "quiz" is pending clarification; this checklist covers the existing provider onboarding/training quiz functionality, not a newly invented clinical assessment.

1. Use a clearly labeled synthetic training module and assignment scoped only to the demo agency/provider. If none is configured, report BLOCKED with the missing setup; do not use another agency's training or claim completion.
2. Reach the assignment from the provider's ordinary checklist/training navigation. Verify instructions, required content and progress; leave and reopen to check persistence.
3. Check unanswered-question validation. On a test module that permits retries, submit a known failing attempt, verify the displayed score and remediation, then submit a passing attempt using that module's known answer key. Respect attempt limits and prerequisites.
4. Verify the saved attempt, score, completion state and provider checklist agree after reload and a fresh session. Confirm another synthetic role cannot view or change the attempt outside its permission scope.
5. Retain completion history. For recurring runs use a fresh QA assignment only where supported; otherwise mark the existing assignment already completed and schedule the next eligible attempt. Never reset production training history to manufacture a fresh test.
6. Capture assignment, validation, result and persisted completion screenshots. A module opening is not a successful quiz test. Synthetic training completion is not a real license, credential review or clinical activation.

## Email and SMS verification

All synthetic account emails use `@example.com`; actual email destination is **testing@itsco.health**. Preserve original-recipient metadata so English/Spanish family messages and provider messages can be distinguished. The QA agency's mail must not leak to real school contacts, real providers, real administrators, or fallback Cc/Bcc recipients.

For every expected event, record event time, original recipient, actual recipient, subject, language, message ID, queued/sent/received timestamps and evidence. Check links, appointment dates/timezones, location, provider name and cancellation state. Render an email screenshot if available, with reset/invitation tokens redacted. A message in an internal outbox is QUEUED; provider acceptance is ACCEPTED; actual mailbox receipt is RECEIVED.

For provider SMS, record the event, destination **+16189107000**, provider message ID, send result and available delivery receipt. Label carrier confirmation separately from the owner's observation on their phone. Do not claim a text was received merely because the notification row exists. Confirm the message is actionable and identifies the correct fictional client/event without excessive clinical detail.

Keep separate reminder cases: one appointment remains booked, one is rescheduled, and one is canceled. Choose appointment times around the real configured reminder cadence. If a reminder is due the following day, retain and check that cohort then. Do not shorten production-wide reminder settings. Existing retained QA clients must not trigger unlimited recurring reminders: use finite, one-off appointments and close their notification lifecycle through ordinary UI actions after evidence has been collected.

## Screenshots and actionable reports

Capture enrollment start, validation error, final confirmation, provider availability, guardian slot selection, saved appointment, reschedule/cancel state, uploaded document access, support review, and every failure. Use `runId/scenario/step-viewport.png`. Capture a sanitized browser trace for reproducible failures, including failed endpoint paths, response status, timing and console errors. Remove auth/session material before sharing traces.

Every case reports one of PASS, FAIL, BLOCKED, NOT_SUPPORTED or FLAKY. A retry that passes does not erase the first failure. Separate deterministic failures from AI usability observations. Every issue includes steps, expected/actual behavior, build/version if exposed, role, language, viewport, record IDs, timestamps, screenshot links and severity. Never ask an AI to simply judge whether the whole site "looks good."

Morning brief format:

```text
ITSCO-style agency QA — Denver date — run ID
Overall: PASS / FAIL / BLOCKED
Primary interface: full platform / agency 450 / provider role
Feature parity: verified modules [...]; configuration gaps [...]
Core cases: school EN [...], school ES [...], office EN [...], office ES [...]
Provider tools: dashboard [...], account/settings [...], payroll/Submit [...], tasks/training/quiz [...]
Rotating case: [...]
Created: client IDs, guardian IDs, appointment IDs, support review links
Verified: availability -> selected slot -> saved booking -> provider view
Notifications: email received [...]; SMS accepted/delivered [...]; still pending [...]
Top issues: severity, short title, expected/actual, evidence link, reproduction steps
Still pending: dependencies and reminder due times
Support inspection: full-platform login link and run label
Secondary AuricWell regression: [...]; does not replace primary platform results
Retention: records preserved; no nightly deletion
```

## Coordinator prompt

> Execute the ITSCO-style agency QA runbook for today's America/Denver date. The primary experience is https://app.itsco.health/auricwell-qa-demo/login followed by the normal full-platform provider dashboard and navigation. Use only agency 450, school 451 and the explicitly provisioned QA accounts. First verify release gates and required provider modules; report missing configuration or a broken full-platform screen as BLOCKED/FAIL with evidence and run independent permitted checks. Publish provider availability before four fresh school/office English/Spanish enrollment journeys. Add today's rotating family/client scenario. Cover the real My Account/settings, My Payroll/Submit, tasks/checklist, training/quiz, notifications, client/documentation and support workflows. No real payroll disbursements. Treat standalone AuricWell as secondary regression only; it cannot substitute for the full-platform provider experience. Use persistent records and receiving-inbox evidence. Do not use mocked responses, Dev Fill shortcuts, database writes, superadmin sessions, or marketing demos to claim success. Only provider 1433 may receive Client Exchange notifications; email may arrive only at testing@itsco.health and provider SMS only at +16189107000. Preserve clients for support review. Produce a morning brief, screenshots and precise reproduction steps, then update reminder delivery results when due. Stop new writes and sends on unexpected real recipients, real records, or scope changes.

## CAPTCHA handling

Use the normal sign-in and enrollment flow. If a challenge blocks automation, capture the step and report BLOCKED. Do not globally disable production CAPTCHA or place test keys on a production public enrollment page. Any future testing exception must be explicitly confined to the isolated test environment and verified independently of the daily browser checks.

## Engineering handoff

Provisioning utilities are `backend/src/scripts/provisionAuricwellQa.mjs`, `configureAuricwellQaForms.mjs`, and `verifyAuricwellQaAccess.mjs`. Do not rerun provisioning to reset credentials: it intentionally refuses existing identities. The form configurator is scoped to the receipt's exact agency/school and validates synthetic membership before writing.

The primary browser smoke check is `backend/src/scripts/verifyItscoStyleQa.mjs`; it uses the normal full-platform provider sign-in and checks dashboard, account, payroll, settings, training and schedule rendering. `--resume` reuses a private demo session for diagnosis; such a run does not establish fresh-sign-in success. `--frontend-dir=...` tests an isolated local production build against live QA APIs and must be labeled as candidate evidence. The nonsecret bot entry-point profile is `deliverables/itsco-style-qa/bot-profile.json`. Private role files now identify the full platform as their primary interface; passwords and account memberships are unchanged.

The manual browser verification scripts require Playwright and an installed Chromium browser (or Google Chrome on macOS) in the operator's local environment. They are not production startup jobs. Provision their role-specific secrets locally before running them; never copy the private credential directory into a deployment image or Git commit. Historical release receipts describe the checks and publication state at their recorded timestamps, rather than the current CI deployment state.

The daily browser workers, mailbox reader, scheduler, registered SMS setup and actual notification-delivery verification remain implementation work for the bot team. Report each separately; creating credentials does not mean daily QA is operational.

Release engineering: `deliverables/auricwell-qa/release.json` records the deployed revisions and readiness checks; `release.patch` is the exact application patch against deployed commit `196a7d7bb6fea328bcc449e110b3fe9846a60292`. The local checkout predates that deployed baseline and contains unrelated work. The release preserved the live Client Exchange audit/deduplication implementation and added the QA recipient/report guards to it. Future deployment must carry those guards forward on the current production source; do not replace the live notification service with the older local implementation. Backend image construction verified the original file hashes before applying the patch. The frontend image preserved the existing full-platform entry and public sites and added only the AuricWell entry and its uniquely named asset directory.
