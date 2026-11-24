# ITSCO transition meetings — November 25–30, 2026

**Status: live integration implemented; activation is gated by verified inbox setup.** The latest user instruction authorizes commit, push and production deployment from this chat. The implementation now includes durable encrypted state/audit tables, a scoped Cloud Run job, calendar creation, the actual sender/inbound route, RSVP and reply processing, conditional reports and attendance claims. Do not describe meetings or email as sent until their receipts confirm it.

## Confirmed schedule

All times are Mountain Time. The user selected the start times and video-only format; **90-minute durations are an explicit planning assumption** from the earlier training plan. Windchime is Sunday-only.

| Opportunity | Date and time | Own initial audience | Conditional additional audience |
| --- | --- | --- | --- |
| 1 | Wednesday, November 25, 11 a.m.–12:30 p.m. | Payroll groups 1, 2 and 3; add Kimi to group 1 | None |
| 2 | Wednesday, November 25, 2–3:30 p.m. | Payroll groups 4, 5 and 6 | Earlier invitees who have not attended and have no other future choice |
| 3 | Friday, November 27, noon–1:30 p.m. | Payroll groups 7 and 8 | Earlier invitees who have not attended and have no other future choice |
| 4 | Friday, November 27, 4–5:30 p.m. | No blanket initial invitation | Everyone still without recorded attendance, following their prior meeting |
| Fallback | Sunday, November 29, 8–9:30 a.m. | In person at Windchime; verify its complete address | People without attendance who select Sunday; invited after opportunity 4 |

Megan, Rachel and Michael host the four video meetings and are CC'd on provider emails. Resolve each person to their actual active ITSCO account and approved delivery address; do not guess between duplicate names. Sunday is Michael's office help session; confirm other hosts' availability separately.

Use **transitions@auricwell.com** as the dedicated sender/reply inbox. The new Google Group is created, with **michael@plottwistco.com** as owner and the nonhuman **ai@plottwistco.com** application transport as manager. **admin@itsco.health has been removed**, as requested, and must not be added back by provisioning. Sender and routing verification remain separate from group creation. This inbox is separate from portal@auricwell.com.

Google rejected automated Groups Settings access with the mailbox's existing manager permissions. Keep that role. The actual owner must confirm invited-only membership, members-only visibility/conversations, owners/managers-only member visibility, history off, external membership off, posting from anyone for provider replies, and posting as the group enabled. Record `TRANSITION_GROUP_SETTINGS_OWNER_VERIFIED=true` on the scoped job only after that confirmation. An operator verifies the exact Michael-owner/AI-manager membership through Cloud Identity and records `TRANSITION_GROUP_MEMBERSHIP_OPERATOR_VERIFIED=true`. Setup verifies the actual SMTP acceptance, displayed From address and Group-to-app inbox delivery. It stores the real communication/relay receipts as encrypted, sender-identity-bound evidence. No Gmail send-as alias or Groups Settings administrator is required for this private SMTP route.

## Invitation rules

1. At activation, snapshot the existing payroll-ranked providers in groups 1–8, their current authorized contact details and the three hosts. Add Kimi’s verified NLU staff account once to campaign group 1, even though it is outside ITSCO payroll ranking. This campaign addition does not rewrite payroll ranking. A changed/extra ninth group requires explicit review rather than silently dropping people.
2. Create four **independent** video events, with host/cohost access. Never make a recurring series: the existing training RSVP updates an entire series, which would break the requested per-opportunity behavior.
3. Send each provider one initial invitation for their own assigned opportunity: groups 1–3 to 1, 4–6 to 2, 7–8 to 3. Include that invitation in their app schedule with Yes/No RSVP. Opportunity 4 initially has hosts only. Initial invitations for different groups may be sent together; **second and later invitations to the same person wait until their prior opportunity ends**.
4. Include the individual's assigned time, readiness expectations, personal response links, host CCs and dedicated Reply-To. Initial invitations mention later opportunities without publishing their times. Makeups use distinct wording. The HTML follows the supplied AuricWell reference's navy/gold palette, logo, large title, schedule block, RSVP band and topic cards. Its sample January date and ET label are not copied.
5. A No RSVP sends an acknowledgement and all **remaining** options immediately, including Sunday. Options that have already ended are omitted. Ask for `OPTION 2`, `OPTION 3`, `OPTION 4`, `SUNDAY`, or `NONE`, as applicable. Choosing an option records a preference; the next actual calendar invitation waits for the previous opportunity and final attendance review. Never infer that “can't make it” means “none of the times work.”
6. Bind inbound mail to the authenticated actual sender **and** the original RFC reply thread/campaign recipient. Ignore automated replies, unauthenticated mail and quoted commands. Unclear free text goes to Rachel for review. An email address match alone must not grant account or clinical access.
7. After a meeting ends, finalize video, telephone and in-person evidence. Record actual seconds or explicit zero for every active invitee. Until this review is complete, missing video data is **unknown**, not a no-show. Both a Yes RSVP/no-show and a missing RSVP/no-show receive the next eligible invitation; attendees receive no further makeup invitation.
8. Honor a selected later meeting instead of inviting to every intermediate event. If a later invitation already exists, cancel/withdraw it through the normal app workflow when the recipient deliberately chooses another slot. Reconcile old receipts and reminders; do not delete history.
9. Only after opportunity 4 ends and attendance is finalized, send the final follow-up to providers with no attendance anywhere. Offer Sunday at 8 a.m. at Windchime, and the example-video route. A person who explicitly says none of the options works gets the video-route email rather than more meeting invitations.
10. The video-route email preserves Sunday 10 p.m. notes and Monday-morning readiness expectations. If no updated video link exists, say it will be sent when ready; never claim a recording was delivered. Assign Rachel to follow up. A video watch does not fabricate meeting attendance or payable time.

## Rachel-only reports

The user explicitly authorized sending Rachel provider names and **cell** numbers for this coordination work. Resolve them from the current authorized staff directory; missing cell numbers are shown as “Not on file — please verify.” Do not substitute guardian/family numbers or infer phone numbers.

- Send a roster after the app confirms the actual invitation batch for each meeting. Include its time, current invitees' names, cell numbers and original group. New makeup invitees generate a revised roster after their invitation batch is confirmed. Opportunity 4's provider roster therefore waits until providers are actually invited. Deduplicate identical batches.
- After each assigned meeting's attendance is finalized, send Rachel the missed-meeting list **only for people who did not attend any opportunity and have no selected future alternative**. Include No RSVPs without an alternative, nonresponders and Yes/no-shows. State RSVP status so Rachel knows the follow-up needed.
- A late future selection or finalized positive attendance removes the person from an **unsent** report. Cancel an empty report. Retain already-sent reports as history; Rachel checks the app before calling.
- These roster/contact reports go **only to Rachel**, with no group CC. Provider invitations never include other providers' cell numbers. Store snapshots/reports in restricted encrypted application storage and avoid content in operational logs.

## Readiness and cutover

Before each person's meeting, the records/scheduling owners must bring **all their clients and all sessions from November 30 onward** into the existing app charts and reconcile counts. Use the existing per-provider and per-client transition checklists; invitations don't perform this work.

Providers confirm actual next-week dates/times, series exceptions, school closures, location, telehealth links and family readiness. They set/save their app password and six-digit code, verify the personal recovery email, and test non-Google sign-in/reset. They save needed Google material into approved organization storage before access ends.

All outstanding notes are due **Sunday, November 29 at 10 p.m. MT**. Include corrections and needed supervisor/signature follow-up. Optional administrative transition notes may say **“Transitioned to AuricWell”** in each applicable area. They are not a mandatory clinical discharge. After source records are preserved and the destination schedule is checked, cancel/remove duplicate **future** TherapyNotes sessions from November 30; preserve history, notes and charts.

Target access retirement is **Monday, November 30 between midnight and 5 a.m. MT**, after record, schedule, family, billing and login checks. The meeting workflow does **not** suspend Google users, cancel TherapyNotes, delete sessions, sign notes or automatically mark provider/client checklists complete. The transition lead needs a documented exception path if a critical readiness check fails.

## Attendance compensation

For nonhost participants, submit actual attended time at **Support Activity, $18/hour**. Exclude Megan, Rachel and Michael from this campaign's automatic participant claims. Round the final currency amount, not attendance to the scheduled duration. Do not mention the rate or payroll process in invitation emails.

The live claim adapter must upsert using the existing **agency + meeting + provider** claim identity, alongside existing automatic attendance processing. It must not create a second claim. Leave claims **submitted** for payroll review; preserve edited/approved/paid claims and send conflicts to reconciliation. The live adapter submits attendance claims for payroll review; it does not issue payments.

The current generic training path treats optional/student attendance and some host compensation differently and does not supply this exact campaign policy. Test campaign scoping so the requested explicit compensation does not change unrelated trainings. `PayrollTimeClaim.create` currently defaults a missing submitter to the provider; an automation adapter must **not** use that fallback. Record `submitted_by_user_id=NULL` plus explicit automation identity/audit evidence through an authorized scoped path, or stop the claim operation. Do not attribute agent work to a host or provider.

## Live setup and activation

Migration **1881_transition_meeting_sequence.sql** creates four additive tables: encrypted sequence state, append-only automation audit, event mapping and a claim/rate mapping. It does not activate or send anything. The backend's existing invitation worker polls only an explicitly active sequence.

The launch uses **itsco-auricwell-2026-11-30-v2**. No earlier namespace was activated. Retired images query the inactive earlier namespace; the new worker additionally verifies that it is the exact live revision before dispatch. A failed authority check holds dispatch. The dedicated job separately verifies its actual scoped service-account identity.

1. Deploy this branch with the migration. `configureTransitionRuntime.mjs --dry-run` identifies the required runtime configuration without printing values. The apply mode uploads only the necessary values through stdin to Secret Manager and creates the dedicated Cloud Run job. Its service account is **auricwell-transition-sequence@ptonboard-dev.iam.gserviceaccount.com**. The job checks its actual metadata identity and permits only the fixed setup/preview/activate/tick/status operations.
2. Run job mode **setup**. After the owner confirms the group settings above, it acts only as the existing nonhuman app mailbox. It tests the private SMTP relay, exact displayed From address and Group-to-app inbox delivery. The sender verifier requires the encrypted, identity-bound wire receipt plus confirmed owner settings and operator-verified membership. It never authorizes direct Gmail sending through this SMTP proof. It registers the exact agency-2 sender/inbound route and encrypted setup proof only after that test succeeds. Never mark a failed routing test passed.
3. Run mode **preview**. Resolve Megan/Rachel/Michael from canonical practice staff (excluding school/family accounts), and Kimi from her exact NLU work address, freeze the current authorized payroll groups and actual staff contact details. It outputs counts/host identities, not a phone-list dump. An ambiguous name or unexpected ninth group stops for review.
4. Run mode **activate** once. Four independent events are created transactionally with null human creation actors and actual hosts/cohosts. The worker creates each personal membership/capability and sends the branded invitation through the verified app sender, with deterministic RFC Message-IDs, actual recipient addresses, correct CC and Reply-To. Repeated activation returns the existing mapping.
5. App and personal email RSVP share the existing response tables. This campaign permits No without a mandatory reason; ordinary mandatory training retains its reason requirement. Email landing-page loads/scanners never write an RSVP; a deliberate response click submits the choice. Test the full recipient flow before calling the email interaction “one-click.”
6. Every minute, the worker imports RSVP choices, queues alternatives, and sends pending outbox items once. Exact RFC threading and authenticated sender checks bind email choices to the original recipient. Unclear/unverified replies remain unread for Rachel. An uncertain send is held for review and is never blindly resent.
7. For the four app-video-only opportunities, a host's explicit End meeting plus a successful attendance-segment rebuild establishes the single attendance source. Only then are absent invitees recorded as zero and follow-ups/reports released. Automatic expiry alone does not establish host-reviewed attendance. Sunday in-person records require an actual reviewed register; scheduled time is never substituted.
8. Participant claims are inserted with a null human submitter and explicit automation evidence, plus a protected database link to the actual $18 rate. Existing/edited/approved/paid claims are preserved for reconciliation. ITSCO participants remain in ITSCO payroll; the specifically invited NLU guest remains in NLU payroll and her own app inbox. Duplicate claim detection spans practices for the same meeting/person. The generic training compensation worker is disabled only for these campaign events to avoid duplicate claims. The rate resolver honors the protected mapping; client-submitted payload alone cannot establish the rate.

Operational status should show the actual inbox proof, event IDs, delivery receipts, review holds, attendance status and claims. Publishing code alone is not evidence that the invitations were delivered. The video still needs to be recorded/reviewed/uploaded and its real link supplied; current video-route wording does not claim that an unavailable video was sent.

All production actions must retain actual Cloud IAM attribution or the named nonhuman application identity, with no copied human sessions, forged app credentials or fabricated human audit actors.

The scoped deployment-queue workflow resolves superseded paired releases waiting on each other. It cancels only older main deployment runs whose source is already contained in the current release, preserves both currently live sources, and stops if main or production readiness changes. It never cancels other workflows or changes Cloud Run traffic. Its trigger is limited to changes to its own files, the dedicated transition release-request manifest, or an explicit manual dispatch.

## Validation

Run `node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.transition-meeting-sequence.config.js` for the isolated policy/email/dispatch tests.

Run `node frontend/scripts/preview-transition-meeting-sequence.mjs --out <folder> --screenshots` for synthetic email previews. It makes no live app/Workspace/mail/payroll requests, writes no production state and uses a local copy of the official logo. The launch request's readiness values remain false.

The rehearsal checks desktop and 390px layout, visible personal-response links, no horizontal overflow, no page errors and no external requests. It is not Gmail/Outlook rendering certification, a real recipient RSVP test, or current production inbox verification.

## Named NLU training participant

Kimi participates using her active NLU account. The frozen plan records NLU as her payroll practice. Her issued training appears in her NLU training calendar and attendance history, with the same Yes/No controls and personal invitation. Access requires the protected campaign/event mapping, a current explicit invitation, an unwithdrawn issued state and current NLU staff eligibility. It grants no ITSCO membership, clinical access or host/proctor authority. Her app inbox copy stays in NLU. The selected provider-only payroll ranking stays in ITSCO.

The launch uses the existing canonical practice staff roster, including onboarding staff, and validates delivery contacts only for its selected recipients and hosts. School-portal, family, kiosk and unrelated staff accounts cannot create first-name ambiguity or enter this audience.
