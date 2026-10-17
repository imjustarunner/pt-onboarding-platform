# Event workflow audit and upgrade

Date: October 13, 2026. Scope: application code and regression tests in this checkout. This is not a production database, carrier-registration, or live-delivery audit.

## Coordinator workflow

1. Create or edit the school, outreach, company, or program event in its existing editor. Existing event/session records remain the source of truth.
2. If the organization owes a fee, enable **This event requires payment**, optionally enter the amount, and record the payment contact or next step in notes. Mark payment completed after paying. **Needs payment** includes events whose amount is still unknown. This fee is independent of prices charged to attendees. Paid state records the actor and timestamp. Receipt uploads are not part of this change; a reference can be recorded in payment notes.
3. Choose the staff audience and assign event coordinators. The outreach audience uses each employee's signed annual commitment and approved actual event work in the event's calendar year. An ordinary company event can be explicitly designated as counting toward that commitment.
4. Share the staff link for event details, interest, and authenticated check-in. A staff response or a text **Y** records interest; an organizer still assigns the worker. Check-in requires a finalized assignment for that event date.
5. Enable the public attendee page when hosting a public registration. The attendee page supports RSVP, guest count, notes, existing potluck rules, and optional event texting. Optional attendee self check-in uses the registration's private management token on an event date, with separate attendance for recurring dates. Program intake forms remain available for service enrollment; a guest RSVP or self check-in does not create a client or replace clinical attendance or required intake documents.
6. Preview a text's exact wording, recipient eligibility, and skipped-recipient reasons, then send. Review deliveries, failures, replies, and individual send batches from the event. Existing email and in-app notification dispatch remains in place.
7. Workers check out using the same attendance/payroll path as the existing kiosk. Actual time en route is entered separately as **Support Activity → Approved Travel**, submitted through the existing payroll approval workflow. Travel does not count as event attendance, and overlapping event or travel intervals are rejected.

## Two links, two identities

| Link | Reader | Actions |
| --- | --- | --- |
| `/company-events/:id/staff/:token` | Anyone with the opaque staff link can read event details | Active agency staff sign in to respond, check in/out, or submit travel. Coordinators can open management for their assigned event. |
| `/company-events/:id` | Public, when publication is enabled | Anonymous attendee RSVP; optional text enrollment and event-day check-in/out; existing service intake links. |

The previous anonymous RSVP handler searched all user accounts by entered name, email, or phone and could write a response as that user. It now creates only a guest registration. A random browser-held management token is required to change that registration; a coordinator handles recovery when it is unavailable. Guest identity is never treated as staff authentication.

Public responses omit payment notes, coordinator assignments, staff link tokens, and payroll settings. External school and family accounts cannot change the organization's fee, publication, texting, or commitment settings. Coordinator assignment is restricted to existing agency event managers and active internal staff. Delegated coordinators do not gain agency-wide exports or payroll-hour configuration rights.

## Texting behavior

| Message | Sending program |
| --- | --- |
| Employee recruitment, staff polls, company-event updates | Campaign 2, dedicated workforce/polling sender |
| Updates for enrolled service/program attendees, including Skill Builders | Campaign 1, service communications sender |

Campaign selection validates the registered sender's agency, approved purposes, carrier approval, and linked-number state; it does not relabel or provision a carrier campaign. Existing recipient permission, personal-phone preferences, global suppression, and transport checks still apply immediately before delivery.

Each event has a persistent numeric reply code, starting at 112 for a new topic table. Replying with that code mutes texts about only that event. **STOP** continues to stop that sending program. **HELP** and re-opt-in continue through the existing campaign keyword handling. Event mutes survive subsequent sends and reminder jobs. Neither **Y**, an RSVP, a preference edit, nor event signup clears STOP or creates campaign consent.

Recruitment wording includes the event date/time in its timezone, title, staff link, interest instructions, event-specific code, campaign STOP, HELP, and rate disclosure. When multiple recent events could match a bare **Y**, the reply asks for **Y followed by the event code** instead of choosing an event silently. Actual polls retain their existing options and response-review workflow.

Public texting consent is optional and starts unchecked. Existing reviewed campaign consent can activate the event enrollment; otherwise the registration returns a link to the existing signature form and waits for administrative review. Attending or receiving services does not require texting consent. Declining event texts revokes the event enrollment. Sending rechecks the registered phone, event preference, and campaign permission.

## Commitment accounting boundaries

The automatic audience reads provider-update amendment evidence: completed tasks, signed-document PDF/hash, final signature evidence, and the saved contract wording. It recognizes the explicit annual event-hours clause in the generated amendment. It does not infer a requirement from a current handbook, an unsigned amendment, a generic role, or a missing document. Preview reports unsupported wording for review instead of treating those staff as having completed their commitment.

The year is January–December in the event timezone, starting no earlier than the signed/effective date. Credit comes from approved event payroll claims, without counting RSVP, assignment, travel, calendar-only school dates, or duplicate claim rows. The two direct/indirect parts of a kiosk claim each contribute their actual allocated hours. Any school-specific hours in the signed clause must be satisfied with school-related event work. Same-year amendments do not erase work already credited under an earlier signed requirement. Uploaded agreements, individually modified clauses, and accommodations require review when the parser cannot establish the applicable terms.

## Conflicts repaired

- Event fees previously had no dedicated tracking; program attendee prices remain separate.
- Public RSVP no longer matches unverified people to staff accounts.
- Event-specific text preferences now apply at the shared outbound delivery check, including scheduled reminders.
- Staff interest and assignment remain separate; legacy polls continue to work.
- Per-send batch and carrier status records supplement existing event dispatch history.
- The compact staff editor preserves recurrence, audiences, polls, and reminder settings when editing fees or details.
- Staff-link and kiosk attendance share punches and payroll claims. Database operations now use the same transaction connection instead of escaping through the global pool.
- Coordinator grants are event-scoped, preserve who assigned them, and cannot be expanded through an unrelated query parameter.

## Deployment and verification

The owner confirmed migrations **1614_company_event_operations.sql** and **1615_company_event_sms_topics.sql** have run. They were not rerun while preparing the release. Deploy the backend and frontend together. Existing intentionally published registration pages are retained by the migration; other events require explicit publication. The migration initializes opaque staff links for existing events; new event saves generate them automatically.

Agency messaging flags and approved Campaign 2/Campaign 1 sending numbers must already be configured. The new service sender preference is `companyEventsServiceSenderNumberId`; the existing staff preference remains `companyEventsSenderNumberId`. If a service sender is not explicitly selected, only an approved compatible service sender in that agency is considered. Missing configuration blocks sending and is surfaced in preview.

The release was integrated in an isolated checkout of current `main`, preserving its newer Conversa delivery modes, staff SMS assistant, payroll rules, and shared district dates. Event coordinator grants apply only to the assigned operational event; generic team polls and message templates retain Conversa manager restrictions.

Verification on the release includes 40 native commitment/attendance/travel tests, 23 event/authorization/registration tests, 778 messaging tests (16 integration tests skipped), 5 event calendar tests, 2 district tests, and 47 frontend tests. The messaging suite uses `DB_USER_AGENCIES_CACHE=0` because an unrelated out-of-office fixture does not mock the cache's database-write hook. The earlier mailbox-routing failure in the old workspace does not reproduce on current `main`.

The frontend production build uses `NODE_OPTIONS=--max-old-space-size=8192 npm run build`. Dependencies were installed from the existing lockfiles in the isolated checkout. Live carrier delivery was not exercised and no live messages were sent.

Provider policy reference used for the texting audit: [Vonage 10DLC campaign requirements](https://api.support.vonage.com/hc/en-us/articles/12132309081500-10DLC-Campaign-requirements). The implementation preserves campaign-level STOP alongside the additional event preference.

## Assigned-provider check-in reminders (October 17)

Apply **1656_event_employee_checkin_reminders.sql** before deploying this addition. The five-minute worker sends assigned providers an email and an opted-in workforce text during the hour before each event occurrence, catching up until the occurrence ends. It sends only on the local event date and skips providers already checked in. `FRONTEND_URL` or `FRONTEND_BASE_URL` must be configured. Email uses the configured `company_event_checkin` sender or a Notifications/People Operations identity; SMS uses the existing Campaign 2 sender and consent checks.

The email's **Check in** link opens the authenticated staff page. Opening a link does not record time; the employee selects Check in. `CHECKIN` and `CHECKOUT` texts use the same attendance writer as that page. Multiple eligible events require `CHECKIN <event code>` or `CHECKOUT <event code>`. Shared phone numbers must use the signed-in page. Only recipients of a recent successful check-in reminder can use these text commands, and the provider message ID prevents a delayed retry from creating another payroll punch.

Email and SMS delivery attempts are claimed independently per employee/event/date in `company_event_checkin_reminders`. Sent, skipped, held, approval, and review outcomes are retained; uncertain failures are not automatically resent. Existing email and SMS logs retain transport details. Missing sender configuration or delivery failures require operational review.

School-event defaults and existing school-event rate maps now use **Indirect** without a direct-hours split. Existing recorded claims retain their captured rate slot; clinical Skill Builders splits remain in place. The event page records each travel direction separately as **Support Activity → Approved Travel**, using the employee's Support Activity rate and the existing payroll review/overlap checks.

The ITSCO handbook source amendment and matching update draft include approved event work under Indirect Service and travel to/from events under Support Activity. Stage the supplied content and publish the handbook through the existing handbook workflow to make the wording visible to employees. The versioned amendment preserves other source wording and is applied only to ITSCO; full private handbook source files remain outside Git. This code change does not publish the handbook or send live reminders.
