# Full transition rollout — NLU, ITSCO and Inner Strength

Week: November 16–20, 2026. All operating times are America/Denver.

## Working package

Run `node backend/src/scripts/buildTransitionWeekPacket.js --out <restricted-destination>`.
Open `index.html`. It links the Monday brief, provider-update draft, family guide,
90-minute training, 44 acceptance cases, ordered task register, source/archive
manifest, provider/family readiness sheets, ERA routes, scorecard and calendar drafts.
The generator never accesses live records, sends messages or changes accounts.
The packet includes TASKS.csv for all three practices, separate NLU/ITSCO/Inner Strength
checklists, and VIDEO-PLAN.html plus VIDEO-PRODUCTION.csv for the 19 recommended video topics.
Keep filled CSVs in the approved restricted workspace, outside source control.

Use Management → AuricWell → Open full rollout plan (the EHR Transition settings item)
for the durable practice boards. The header switches between Next Level Up, ITSCO and
Inner Strength. Every workstream is visible by default; filtering is optional.
NLU (6), Inner Strength (377) and ITSCO (2) have independent boards with appropriate
scope. ITSCO has named cohort/ranking stages and a retain-access task, not an account
cancellation gate. Inner Strength has its own records/billing/closure gate and is not
required to retire provider Google accounts in this project. Assign owners
and backups on Monday; no staff names, roster counts or completion evidence are seeded.
Unknown denominators stay unknown. Failed/deferred items require an owner and next action.
Passed items require an owner, evidence and passed prerequisites. Closure also requires
reconciled denominators. Save before navigating or freezing a ranking.

The board records readiness; actual sending, booking activation, account retirement,
vendor routing and cancellation remain deliberate operations in existing tools.
Do not mark `era_monitor` passed merely because an enrollment request was accepted.

## Release order

1. Retain a recoverable database backup and the paired previous frontend/backend release.
2. Apply only `1830_practice_transition_week.sql` with the existing specific-migration runner
   (`node database/run-migrations.js --migration 1830`). The earlier 1828 prefix was
   changed before release because main now has a different 1828 migration.
   It adds evidence tables; it does not activate users, campaigns, appointments or claims.
3. Deploy the paired frontend/backend change through normal workflows. Backend startup
   applies pending migrations and now blocks readiness unless all four rollout/consent
   tables, required columns and the successful migration-1830 log entry are present.
   A failed candidate remains unready. Preserve current
   Secret Manager references and encryption material. No new secret is introduced.
4. Run the synthetic acceptance checks, current-role access checks and production build-ID checks.
5. Have a currently active practice administrator open and assign each board. A broad legacy
   role alone is insufficient; the API verifies actual active practice membership.
6. Configure first-time START only after the carrier approval/disclosure review below.

The phone-capture path is off unless the number’s saved `startEnrollment.enabled` is true.
Existing messaging remains on its existing paths until that reviewed configuration is enabled.
Migration must precede enabling capture or using the board. Rollback paired application
traffic if needed, retaining the additive tables and all original evidence.

## NLU update execution

Use the existing Provider Update editor and recipient workflow; do not issue arbitrary
messages or manufacture signatures from the packet. Attach actual published handbook
changes, individually reviewed amendments and the scheduled training/support details.
Verify one recipient’s entire phone/desktop experience, then use the intended active roster.
Wednesday noon is the completion target. Signature, SMS activation, schedule approval,
clinical acceptance and migration readiness are separate states.

## Video production and completion

Each recommended video has a target workflow, suggested accountable role, creator, due date,
production status, independent reviewer, watch link, review evidence and next action.
Statuses are not started, recording, editing, in review, published and blocked. Publication
requires an owner, working permanent HTTPS/authenticated app link, independent reviewer and
evidence. The server records the actual saving actor and completion timestamp; clients
cannot supply a fake completion date or actor. Reopening production clears the current
completion marker while the append-only board history retains the prior publication.

One reviewed clip can be reused across practices. Each practice still confirms that its
workflow is accurately covered. Do not mark videos_ready passed until all applicable
clips are published. Actual learner completion remains in the existing assigned-learning
workflow. Videos have not been recorded or published by this task.

## ITSCO ranking and activation

Actual named groups are not yet populated. The available historical provider roster lacks
verified weekly session counts. The ITSCO board shows this explicitly and cannot pass
cohort_ranking before a real ranking is frozen. Do not substitute a fictional preview or
alphabetical groups for the requested lowest-session ordering.


Use the verified source roster/report for October 19–November 15, with upcoming sessions
for November 16–22. Exclude canceled/no-show sessions from completed counts; reconcile
group session occurrences consistently rather than counting participants as extra visits.
Confirm genuine zero-load providers; blank counts are not zero. Paste the exact CSV columns
from `ITSCO-SESSION-COUNTS.csv` and record the source reference.

The server requires the complete current eligible provider roster, sorts completed four-week
totals ascending (weekly average is total/4), then upcoming count and stable provider ID.
It freezes consecutive groups of five. Do not overwrite the snapshot when staffing changes;
record an exception and review newly added providers separately.

Each group records Google ready → Google retired → clinical ready → EHR workflow retired
→ observed workday. Later groups wait for the preceding observation. Observation requires
an explicit workday attestation and at least 24 elapsed hours after EHR retirement; weekends
alone do not establish a monitored workday. Record first-actual-session support for providers
without a session during observation. Evidence stages cannot be overwritten.

Freezing ITSCO also enables the existing booking-control check for the frozen groups.
Enabling new booking must select providers from one reviewed group, after its Google and
clinical prerequisites and the previous group’s observation. Pauses remain available.
The ranking action itself does not enable booking or retire any account. Keep ITSCO subscribed.

## Phone consent before account creation

In Texting Numbers → Campaign readiness, configure each intended Notifyre receiving number
with the exact carrier-approved text-to-join disclosure, version, approval reference and
family-service purposes. No marketing, polling, workforce or security purpose can be granted
through this flow. Keep first-time enrollment disabled until approval and real-device tests pass.
Use the same reviewed campaign wording on each intended number.

Authenticated START/STOP receipts retain an encrypted phone/disclosure snapshot and
append-only carrier events, keyed independently of any user. Duplicate events are idempotent;
newer STOP wins over an older START, and STOP wins tied timestamps. No portal account,
guardian relationship or recurring permission is created during capture.

Texting Numbers → START enrollment shows masked pending records and an audited original-evidence
view. After a recipient has an account, the administrator verifies identity, current guardian
or adult-client authority, chart and saved phone. Shared or changed numbers stay held until
resolved. The API rechecks the original disclosure against the current approved flow, the
current recipient relationship, account/campaign STOP and category declines. Linking writes
only the original purposes and reviewed relationship reference; it does not grant portal access.
Original evidence and prior review events are retained. A later START requires fresh review.

Missing or changed disclosure requires the existing signed-consent workflow, never invented
signature evidence. Until identity review succeeds, the phone remains pending. Do not tell
families they are receiving reminders merely because the carrier acknowledged START.

## Records, Google and vendor handoffs

Use the existing EHR workbench for actual chart identity, reviewed imports, PDF volumes and
agenda operations. Inventory all old charts, not only the active caseload. Preserve original
files, dates, authorship and signatures. Export other record categories separately when needed.
Never put separately restricted records into a broadly accessible combined chart/archive.

Back up original exports and manifests to organization-managed, restricted Drive storage after
BAA/access review. Verify checksums and restoration independently. Capture final delta exports.
Before large exports, check local free space, destination quotas and retention settings. Time
representative active/inactive exports and forecast completion against confirmed staff hours.
Use bounded batches on approved encrypted staging storage; keep PHI outside repository folders.
Remove task staging copies only after independent destination verification and retention review.
Retain the source account for incomplete records. Do not extract historical PDFs into new
claims or treat unsigned historical drafts as a clinician attestation.

Before ending Google access, prove independent app login/recovery, mailbox routing, file/calendar
ownership, correct future appointments and meeting links. Re-test after authorized suspension.
Preserve data; do not delete accounts as part of this release.

Grasshopper requires a history/opt-out handoff, named inbound monitoring for at least 14 days,
and independent voice/fax/number review. NLU/Inner Strength TherapyNotes closure requires actual
lead sign-offs, financial and record reconciliation, continued ERA monitoring access, and the
owner’s cancellation confirmation. Storage mode disables claims, ERA, reminders and portal access.

## Access and actual execution status

No scoped application automation identity is provisioned by this change. Do not mint a JWT,
copy a browser session, use a human audit actor for automation, or perform application work
as a superadministrator. An authorized human performs these operations through their own account;
future automation needs its own explicitly scoped identity and truthful audit attribution.

Google Drive is available as an integration but was not connected during implementation.
No TherapyNotes connector was found. Provider invitations, calendar invitations, real chart
exports/uploads, Drive backups, phone enrollment activation, account suspension, payer transfers
and subscription cancellation are therefore not claimed complete. Their concrete templates,
software controls and acceptance register are provided without fabricated live evidence.

## Validation

Run the backend and frontend transition-week Vitest configurations. Run the existing SMS carrier
suite. The opt-in native MySQL suite requires an explicitly supplied disposable loopback test port
and creates/drops only its own synthetic schema. Never point it at an application database.
Real carrier delivery, authorized-role device checks, storage restoration and payer receipts remain
live acceptance requirements. The implementation status file distinguishes these from local tests.
