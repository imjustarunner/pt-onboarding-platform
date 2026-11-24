# ITSCO transition meetings — November 25–30, 2026

**Status: implementation and test package; no meetings, emails, claims or inbox have been created by this branch.** Production integration and activation belong to the separate release chat. This package supplies a tested planning/state library, dispatcher contract, invitation/report content, offline visual previews and the launch request. It does not install a live scheduler, a reply webhook, calendar endpoints or a database store.

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

Use **transitions@auricwell.com** as the dedicated sender/reply inbox, owned/administered by **admin@itsco.health**. Both are user-approved addresses. The new inbox is **not yet provisioned**. See `inbox-setup.json`. This is separate from `portal@auricwell.com`, whose normal route is used for family portal correspondence.

## Invitation rules

1. At activation, snapshot the existing payroll-ranked providers in groups 1–8, their current authorized contact details and the three hosts. Add Kimi once to campaign group 1, even if she is absent from payroll ranking or ranked elsewhere. This campaign addition does not rewrite payroll ranking. A changed/extra ninth group requires explicit review rather than silently dropping people.
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

Target access retirement is **Monday, November 30 between midnight and 5 a.m. MT**, after record, schedule, family, billing and login checks. The sequence library does **not** suspend Google users, cancel TherapyNotes, delete sessions, sign notes or automatically mark provider/client checklists complete. The transition lead needs a documented exception path if a critical readiness check fails.

## Attendance compensation

For nonhost participants, submit actual attended time at **Support Activity, $18/hour**. Exclude Megan, Rachel and Michael from this campaign's automatic participant claims. Round the final currency amount, not attendance to the scheduled duration. Do not mention the rate or payroll process in invitation emails.

The live claim adapter must upsert using the existing **agency + meeting + provider** claim identity, alongside existing automatic attendance processing. It must not create a second claim. Leave claims **submitted** for payroll review; preserve edited/approved/paid claims and send conflicts to reconciliation. This branch returns claim instructions only, not payment confirmations.

The current generic training path treats optional/student attendance and some host compensation differently and does not supply this exact campaign policy. Test campaign scoping so the requested explicit compensation does not change unrelated trainings. `PayrollTimeClaim.create` currently defaults a missing submitter to the provider; an automation adapter must **not** use that fallback. Record `submitted_by_user_id=NULL` plus explicit automation identity/audit evidence through an authorized scoped path, or stop the claim operation. Do not attribute agent work to a host or provider.

## Required release integration before activation

This branch intentionally contains no production side effects. The release chat must supply and test:

- A normal authenticated administrative setup path that resolves the roster, hosts, Rachel's account, Kimi and current staff cell numbers within agency 2. Fill `launch-request.json` and preserve the frozen campaign snapshot. Fields are unresolved deliberately, not fabricated.
- The dedicated inbox/group, approved owner and staff access, verified sender, outbound CC and Reply-To, inbound delivery, threading/authentication and a real round-trip test. Use a normal authorized administrator session or explicitly scoped nonhuman provisioning identity. The repository's existing Directory helper impersonates an administrator and is not an agent access path under AGENTS.md.
- Four actual independent events and actual personal invitation tokens. Attach the **same** Yes/No state to the email and My Schedule. The preview links are `example.invalid` and unusable. Email GET previews/scanners must not change RSVP; use the existing personal capability and deliberate response POST, with a visible result. Test the exact number of user clicks before calling it “one-click.”
- A durable encrypted sequence store with an atomic revision check/lock and atomic state/outbox save. No database migration is added here; choose an approved existing store or add/test the schema in the integration branch. In-memory state alone is unsuitable.
- An outbox worker with scoped automation attribution and durable idempotency keys for events, membership, emails and claims. `dispatchTransitionAction` supplies the contract. Claim against the latest state; hold uncertain outcomes in review and reconcile receipts before retrying. Do not blindly resend after a timeout.
- Concrete `inviteToMeeting`, `withdrawInvitation`, `sendSequenceEmail`, and `upsertAttendanceClaim` adapters. Recheck active memberships and agency scope on every operation. Do not send placeholder links, ignore an approval hold, or treat an email queue entry as delivery.
- Hooks for app/email RSVP, authenticated threaded replies, original and revised Rachel rosters, all-source final attendance and scheduler ticks. Final reports wait for opportunity 4's attendance review. A worker must stop sending outdated invitations when their start time passes.
- An updated recording/watch URL and the readiness owners' actual records/schedule work. Dry-run the live audience counts before activation; the visual preview contains fictional names and phones only.

No route, cron hook, identity, migration, inbox or live adapter is registered automatically by importing this branch's modules. The release chat must finish that integration; this is not a claim that the full live automation is already installed.

## Validation

Run `node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.transition-meeting-sequence.config.js` for the isolated policy/email/dispatch tests.

Run `node frontend/scripts/preview-transition-meeting-sequence.mjs --out <folder> --screenshots` for synthetic email previews. It makes no live app/Workspace/mail/payroll requests, writes no production state and uses a local copy of the official logo. The launch request's readiness values remain false.

The rehearsal checks desktop and 390px layout, visible personal-response links, no horizontal overflow, no page errors and no external requests. It is not Gmail/Outlook rendering certification, a real recipient RSVP test, or current production inbox verification.
