# QA addendum — demo-only support, email visibility, Exchange and supervision

This is a new handoff supplement to the instructions already sent. Apply the changes below where they differ from that handoff. The original `GROK_DAILY_QA.md` has not been edited. **This document is not authorization to start unattended writes: first pass the readiness checks in `QA_SUPPORT_READINESS_2026-10-25.md`.**

## Copy-and-send instruction

> Test the normal ITSCO-style interface using only AuricWell QA Mental Health — DEMO (agency 450) and its Cedar Grove K-8 — DEMO school (451). Your personas are providers, operational support, guardians and clients. No bot receives administrator, setup-admin, superadmin, database or cloud credentials. Support must be able to coordinate clients, communicate and write contact notes, view appointment/note/claim status and basic account billing, manage bookings on behalf of clients/providers, send portal invitations and approved blank documents/questionnaires, and manage Client Exchange referrals. Support must not open progress notes, clinical documents or completed medical questionnaires, sign/cosign clinical notes, change agency settings, provision staff or grant permissions. Test these limits through direct URLs/API requests as well as the interface, using synthetic records only. Run at 5 a.m. America/Denver with one coordinator and a shared run manifest. Retain records for owner review, with a maximum of 30 clients total and 10 demo providers. At the client cap, reuse existing cases; do not delete or archive records to evade the cap. Provider creation is optional owner setup, never a reason to give a bot admin access. Verify every intended recipient's email in that person's in-app Messages email view AND independently verify actual delivery to testing@itsco.health. Verify the primary demo provider's texts only at +16189107000. Test support-led scheduling/cancellation, provider-published availability, positive and negative Exchange matches and applications, and a supervisor/supervisee note-and-cosign sequence. Leave two future appointments per week to test real reminder timing. Report PASS/FAIL/BLOCKED with screenshots, exact steps and record/message IDs; an empty inbox, missing configuration or skipped workflow is never a pass. Stop writes/sends immediately on an unexpected organization, real recipient, privilege escalation or exposed clinical content.

## Identity and scope

| Persona | Existing identity / provisioning | Scope |
|---|---|---|
| Primary provider | `qa.provider.auricwell@example.com`, user 1433 | Demo agency; assigned synthetic clients; own work and availability |
| Operational support | `qa.support.auricwell@example.com`, user 1434 | Demo agency and its demo school; operational client coordination |
| Setup administrator | User 1435, owner-controlled | **Never include its credential file in a bot bundle** |
| Supervisor / supervisee | Owner provisions two distinct synthetic provider identities and a scoped supervisor assignment | No agency-admin role; supervisor access only to the assigned supervisee's authorized documentation |
| Guardians / clients | Unique synthetic `@example.com` logins created by normal enrollment | Their own linked family/client relationships and consent boundaries |

Primary login: https://app.itsco.health/auricwell-qa-demo/login. Use the regular provider/support dashboard, schedules, Client Exchange, account, notifications, payroll display, training and quizzes. Standalone https://auricwell.com/app/auricwell-qa-demo is a secondary regression surface; unavailable controls there do not justify switching to an admin persona.

The live check on October 25 confirmed that the existing support login is role `support`, not admin/superadmin. Its organization list contained only 450 and 451; the school is an affiliated part of this demo, not a real school. This check does not prove every endpoint is tenant-safe. Verify both membership and record-level authorization before launch. Browser navigation restrictions alone are insufficient.

Keep a private owner-access inventory for every created login: role, email, secret-manager reference, login URL, agency, linked client/guardian/provider IDs, creation date, and scenario. Keep passwords and authenticated browser state out of reports, screenshots, source control and AI prompts. Preserve owner access; do not reset passwords, remove memberships or delete accounts during routine runs. Use separate browser contexts per persona.

## Support acceptance matrix

| Workflow | Expected support behavior |
|---|---|
| Client details | Read authorized demographics, contact details, guardian links and operational enrollment status |
| Communication | Contact a client/guardian; see the authorized conversation; write an operational contact note; distinguish it from a clinical progress note |
| Session tracking | See scheduled/occurred/cancelled status and dates; see whether a note exists, is draft, signed or has a recorded cosign; never open its body |
| Billing | See account-support balances/insurance and claim status; do not grant billing administration or access to clinical claim payloads |
| Scheduling | View all demo providers' permitted schedules; book, reschedule and cancel for an authorized client; verify reason, actor, timezone, notifications and released slot |
| Portal and forms | Send a portal invitation and approved blank document/questionnaire for the provider; track completion; do not open completed medical responses or medical attachments |
| Client Exchange | Post/withdraw an eligible demo referral, update matching inputs, inspect operational match results, coordinate/approve a provider request |
| Forbidden | Agency settings, staff roles/memberships, payroll administration, sender/notification configuration, clinical note/record reads, signing/cosigning, other tenants |

For every forbidden operation, require an actual 403/404 (or equivalent permission denial) and verify no data changed. Test hidden buttons, pasted URLs, API reads, exports and attachment links. Do not submit a deliberately dangerous request to a live real record: use isolated automated fixtures or an explicitly provisioned unassigned synthetic tenant/record. A denial due only to a missing feature flag is not proof of role enforcement. Do not assign support a billing, supervisor, records-release or administrator privilege to make a test pass.

## Email must be visible to the intended person

1. Keep each person's own unique `@example.com` address. Do not replace profile addresses with `testing@itsco.health`: that would merge identities and defeat the test.
2. Trigger the actual event: portal invitation, assigned client, Exchange match/application/approval, appointment confirmation, reschedule, cancellation, questionnaire invitation, note-review request or timed reminder.
3. Log in as the intended recipient and open Messages → **Email for [that account]**. This new view reads that recipient's logged email and content. For a guardian, use the family Messages panel; for a personal client portal, use its Messages panel. Refresh after the trigger and walk earlier pages when needed.
4. Capture the subject, original recipient, channel `email`, timestamp, communication ID and actual status. Inspect language, links, client/provider association, date, timezone and instructions. Held, failed, skipped and pending emails remain failures/blockers; the view must not relabel them as received.
5. Independently inspect delivery at **testing@itsco.health**, correlating the original-recipient subject marker and provider message ID where available. In-app presence and `sent` show a recorded transport attempt; they do not independently prove delivery. Record inbox receipt time separately.
6. Log in as a different synthetic person and attempt to open the first person's email by ID. It must be denied, even when both use the same delivery destination. Support does not get another person's private inbox merely because it is support. Authorized client communication history is a separate operational surface.
7. Capture an actionable missing-email defect if an event sends mail but fails to create an original-recipient receipt, including CC/BCC-only recipients. Do not manufacture a received message or use a notification-bell item as email evidence. The new view recognizes original To recipients and redirected Cc/Bcc recipients recorded in the sender receipt; verify each recipient separately.

The email view is a copy of the app's generated email, not a Gmail mailbox or proof of inbound reply ingestion. Test replies separately using a controlled address and authorized conversation routing. Do not send replies to `@example.com` and expect Internet mail delivery. Email content is rendered without scripts or remote tracking images; verify the actual delivered email separately for visual fidelity. Mask reset/invitation tokens in shareable screenshots.

## Population, retention and morning coordination

- Start once per local date at **05:00 America/Denver**. One coordinator holds the run lock and allocates creation slots. Retries use the same run/scenario identifiers and resume existing records.
- Hard runner limit: **30 distinct clients total** across demo agency/school, including retained/archived records. Count before creation and after each successful creation. If the count is uncertain, stop creating. At 28, for example, only two new clients may be made; run the other enrollment paths against retained fixtures and report new-account coverage as `CAP_REACHED`, not passed.
- Hard runner limit: **10 provider identities total**. One optional new provider per day may be prepared by the owner through normal setup until that limit. Bots must not create providers, self-promote, or use the setup administrator. Pre-provision the supervisor/supervisee pair before their test.
- Preserve clients and login access for review. No automatic nightly deletion. Do not recycle identities by erasing history. Ask the owner to approve a deliberate refresh if all enrollment cases need fresh accounts after the cap.
- The 30-client/10-provider counts are runner/provisioning requirements, not a claim that every application creation endpoint currently enforces a database-level quota. The coordinator must verify its lock and counts before unattended enrollment is enabled.
- Daily base cases: school English, school Spanish, office English, office Spanish. Rotate one-/two-guardian families, siblings, different child ages, adult self-managed clients, language preferences, availability conflicts, missing optional information and an incomplete intake resumed later. Use reproducible random seeds recorded in the manifest, not production data.
- Use the synthetic school, office, rooms, service types and eligible provider assignments. Publish real available calendar slots as the provider before the client selects one. Verify the booked slot disappears for competing clients and reappears when legitimately cancelled.

## Client Exchange scenarios

Run support → provider → support, with independent logins:

1. Support creates a valid office-client referral using the ordinary Exchange controls. Capture the persisted age range, language, insurance, modality, location, preferred provider characteristics and availability windows. Do not treat an unsupported school-only referral as a successful office Exchange test.
2. Positive case: give the test provider compatible preferences, capacity and bookable availability. Verify match evaluation, provider inbox/notification visibility, anonymized browsing, application, support review, assignment and subsequent client access.
3. Negative cases: independently introduce one mismatch at a time (age, language, modality, insurance, location, capacity, availability, unavailable provider). Record expected versus actual exclusion reasons. For missing/unknown preferences, record the system's actual handling; do not assume unknown means matched.
4. Inspect available matching explanations/audit output. If a supposed match is blocked, attach the client inputs, provider inputs, time/window conversion and the actual reason. Distinguish missing configuration from a matching defect. Suggest an enhancement with a concrete reproducer.
5. Repeat posting/application/reload to check duplicate protection. Withdraw or assign the referral and verify stale matches stop and unrelated providers do not receive alerts.

The code change supports an explicit `qaSandbox.exchangeProviders` roster of at most ten `{id,email}` pairs. Every recipient must be a demo provider and must match that exact pair; an empty, malformed, duplicate or oversized roster fails closed. Until the owner explicitly configures that roster, the existing sole-recipient policy remains provider 1433. Never widen notifications to all providers, all support staff, or everyone with `@example.com` addresses. The existing QA suppression of general support-audit email remains in place.

Only the primary demo provider uses **+16189107000**. Extra providers use controlled test email/in-app notification delivery; do not reuse that number across multiple accounts or enable SMS for synthetic clients. Confirm the real SMS sender and consent/preferences are configured before claiming SMS coverage.

## Supervision and twice-weekly reminders

- The owner establishes a real, demo-scoped supervisor assignment between two distinct provider accounts. A provider must not be given administrator access to serve as supervisor.
- The supervisee records a synthetic session and saves a draft. Verify persistence after reload, required fields, author, client and session linkage. Support sees the status only.
- The supervisee signs/submits for review. Confirm the correct supervisor gets the review task/email and can review only the assigned supervisee's authorized note. Verify an unrelated provider is denied.
- The supervisor cosigns through the actual workflow. Check actor/timestamps/version and reload. If an amendment changes content, check the app's re-review/cosign rules; a historical cosign timestamp alone is not proof the current amended note is approved.
- Support attempts the same read/sign/cosign URLs and must be denied while still seeing operational status. Never transmit a synthetic claim to a real payer/clearinghouse, charge a card, or release payroll to simulate billing completion.
- Keep two appointments per week, targeting **Monday and Thursday at 10 a.m. America/Denver**, with provider 1433 and controlled QA recipients. Book them early enough for the configured reminder lead time (at least 48 hours where a 24-hour reminder is expected). Roll to the following week when necessary.
- Keep those two appointments out of cancellation tests until reminders occur. A follow-up worker checks actual email/SMS arrival near the scheduled time and updates the report. Morning booking alone cannot prove later reminder delivery. Verify cancellation suppression using separate appointments.

## Evidence and readiness

Every case records run ID, seed, build, persona, role, agency, client/provider/session IDs, language, viewport, timestamps, expected/actual result, screenshot and reproduction steps. Include the first failure even if a retry passes. Use `PASS`, `FAIL`, `BLOCKED`, `NOT_SUPPORTED`, or `CAP_REACHED`; never turn an unrun case into a pass.

Deliver a morning brief with population counts, newly created records, support permission results, Exchange matches/exclusions, supervision status, email-copy checks, external email delivery and upcoming reminder checks. Keep an owner-access manifest alongside the report, with secret references instead of passwords. Publish an update after timed reminders, retaining screenshots and evidence of failures for investigation.

The launch owner must confirm the deployed permission fixes, two provider/supervisor fixtures, approved sender and SMS configuration, all four enrollment routes, document/questionnaire dispatch, actual email delivery, matching roster, quiz assignment, client limits, scheduling and mailbox-reading jobs. Any unmet prerequisite remains `BLOCKED`; continue only independent read-only checks until it is resolved.
