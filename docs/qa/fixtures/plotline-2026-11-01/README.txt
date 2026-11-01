PLOTLINE SYNTHETIC QA INPUT PACKET - NOVEMBER 1, 2026

Status: ready for APP ENTRY. Live user/page/jobs/applicants: NOT RUN.
No database, API, Google Directory, email transport or app write was executed
by generating these files. No credentials, live bearer links or real PHI exist
in the packet. Use the same ITSCOLLC demo 450, controlled inbox and QA vault.

Run instructions:
../../QA-ADDENDUM-2026-11-01-PLOTLINE-HIRING-AND-ONBOARDING.txt

Start with PL00 recount and PL01 new Marlow People Ops user. Save the careers
copy through the existing app. Then create the two new QA jobs/packages and
submit A/B/C through their actual public application forms. D uses the manual
entry path. Record the IDs the app creates; fixtures.json deliberately has
null live IDs. These JSON files are data-entry references, NOT API payloads.

Target: Jules and Noel become active NONCLINICAL staff only after normal
requirements and approval; Remy stays pending; Sasha stays not hired. This is
a target, not a report of real statuses. An app-only synthetic setup cannot
prove Google work-account provisioning or real timed email delivery.

FILES
- fixtures.json: scoped operator, four identities, planned roles and targets.
- careers-page.txt/.json: actual editor copy with visible demo labels.
- jobs.json, job-operations/provider.txt/.pdf: new QA job copy.
- applicant-*-resume.pdf/.txt and *-cover-letter.txt: four distinct sources.
- application-answers.json: questions, preferences and reapply change.
- references.txt: two controlled synthetic references, one left pending.
- review-notes.txt: factual QA staff review/task and candidate question.
- workflow-materials.txt: new per-job QA packages; existing defaults preserved.
- qa-prehire-acknowledgement.txt/.pdf: unsigned QA signature test document.
- qa-handbook.txt/.pdf: short fictional resource, not a company policy.
- qa-upload-practice.pdf: unsigned upload test, not credential evidence.
- qa-orientation-training.json: source content, quiz and reflection.
- upload-negative.txt: harmless text for a field that disallows TXT.
- cases.csv: all live cases NOT RUN; duplicate rows for meaningful variants.
- email-cases.csv: actual-action inventory; old review IDs are design evidence.
- checksums.csv: SHA-256 and byte size of the generated inputs.

All example.com addresses are separate logical identities whose app outbound
mail redirects to testing@itsco.health. They are not Google users, working
mailboxes or verified external reply senders. Never use a real person's From
identity to impersonate an applicant. Use token-scoped candidate/reference
forms, and keep those personal links in the vault. New work-email proposals
are reserved examples for app-only mode, never permission to provision ITSCO
Google users/groups or disable the current account-readiness gate.

Source review used released build 70c79816a65072f8e75fab8fae8fe6213689c7ec.
Engineering observed: public applications default to provider; nonclinical
role must be reviewed before activation. Added-items batch uses 2 minutes
while old comments say 15; compare UI and actual receipt. Account mode can
require real Google Group provisioning; preserve that prerequisite as a blocker
unless an exact approved QA work identity is available for the new person.

To rebuild OFFLINE using only Python's standard library:
python3 docs/qa/tools/buildPlotlineQaFixtures.py
Only this packet's named files are generated. Save completed result CSVs to
the run's evidence directory first; rebuilding restores blank NOT RUN ledgers.
No dependency installs, full frontend builds or extra checkouts are needed.
