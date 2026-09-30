# Client check-in and same-day office reservations

Client landing: https://plottwisthq.com/kiosk-welcome/1 (Windchime) and https://plottwisthq.com/kiosk-welcome/6 (Denver). Existing building aliases and Office home-screen identity are unchanged. Client check-in opens directly to provider selection. Room cards and date/time controls appear only after selecting Office directory.

## Client arrival

Choose the provider, scheduled appointment, and respondent: adult self-report, youth self-report, or parent/caregiver. Arrival and the provider’s in-app alert are saved together. Optional email follows existing notification preferences. Each browser attempt gets an opaque, memory-only receipt; retrying that attempt is idempotent. Public responses contain no client identity, previous answers, or clinical-session identifier.

Configured forms use an immutable definition snapshot. The selected provider sees arrivals and responses under **Clients → Recurring check-ins**, grouped by provider, agency, office, local weekday, and local time. DST changes do not split the same local weekly appointment. Each dated visit retains the exact questionnaire version and respondent. If the appointment already has a client/session, those links are retained. Otherwise the provider can attach to a client in the same agency on their caseload and optionally an existing clinical session. Reattachment retains prior links in an audit history and does not modify the original responses or overwrite a clinical note. Reviewed visits can be attached together; a visit already attached to another client is rejected by bulk attachment. The new-client action uses existing client creation and then attaches selected visits. If attachment fails after creation, the UI keeps that client selected for retry. Future anonymous visits join the time group but still require review before becoming client data.

Clear selection / Start over is visible before arrival. After arrival, two optional feedback questionnaires can be answered or skipped individually; completion returns to the welcome page. After 60 seconds of inactivity the kiosk asks “All done?” and resets after another 10 seconds. Answers and receipt tokens are never persisted in browser storage. Unsubmitted answers are discarded, while the saved arrival remains visible to the provider.

## Office directory and booking

Start/end time searches show a room red if any booked event or office hold overlaps the selected range. Green means no booking/hold overlaps the whole range; standing assignment ownership remains separate. End boundaries are exclusive. The native time picker accepts minutes. **Next hour** advances to the next whole hour, retaining a valid same-day duration; crossing midnight advances the date. Separate minute-shortcut buttons have been removed.

Expand a green room and choose **Staff · Book this office**. The staff page, https://plottwisthq.com/office-booking/1, retains the room/date/range and requires sign-in. Authorized active staff can reserve for themselves today in the building’s timezone, starting now or later. These reservations are confirmed immediately and do not enter an approval queue. Future dates remain browseable but this endpoint rejects future booking, past starts and midnight-spanning ranges. Existing broader scheduling workflows are unchanged.

Booking rechecks occupancy inside a room lock and database transaction. Different ranges share the same room lock. Assignments split at reservation boundaries so the unbooked remainder and original owners remain visible. Conflicting bookings, clinical-linked released events, building access failures, provider overlaps and blocking expired credentials are rejected. Room reservations currently occupy the schedule even without a client; requiring a linked session/client for every booked slot remains a later scheduling transition.

## Questionnaire content status

**Two original, optional feedback forms are now active when no matching configured form exists.** The user approved custom feedback now and validated measures later. Therapy/counseling and tutoring each have distinct self/dependent wording. These are not validated clinical instruments. Providers can configure separate adult, youth and caregiver versions under Provider → Kiosk Questionnaires. The renderer supports text, textarea, number, date, email, phone, select, multi-select and yes/no fields. Unsupported forms are flagged for provider assistance, never reported as completed. The configured-form renderer is not a validated scoring engine and does not automatically recreate instrument layout, scoring, clinical thresholds or risk escalation.

The requested model is two distinct concepts: therapeutic alliance and progress/outcomes. Preserve official item wording, recall period, age range, respondent type, response anchors and scoring. A caregiver’s own alliance with a therapist is different from a caregiver’s estimate of their child’s alliance. Do not mix caregiver and self-reported scores in one trend. Do not display previous treatment content on an anonymous shared kiosk merely because a visitor selected a time.

Research reviewed September 29, 2026:

- [SRS/ORS developer](https://www.scottdmiller.com/downloadmeasures): a brief alliance/outcome pair, but standard paper licensing expressly excludes electronic administration. Not selected because the user prioritizes no paid digital license.
- [CORE System Trust licensing](https://www.coresystemtrust.org.uk/home/copyright-licensing/): software reproduction is possible under its stated attribution, unchanged-content and noncommercial conditions. Applicability to this multi-agency platform must be confirmed. Adult CORE-10 cannot simply be reworded as a parent proxy measure.
- [Therapeutic Alliance Scale for Caregivers and Parents study](https://pmc.ncbi.nlm.nih.gov/articles/PMC3647370/): research specifically examines caregiver–therapist alliance. It is a candidate for caregiver feedback, not evidence that a parent reports the child’s internal experience accurately. Digital reproduction rights still need verification.
- [Working Alliance Inventory rights holder](https://wai.profhorvath.com/copyright) and [SPR permission form](https://www.psychotherapyresearch.org/page/wai-request): electronic clinical use has a permission process. No permission request was sent or license purchased.
- [HealthMeasures digital administration](https://www.healthmeasures.net/explore-measurement-systems/promis/obtain-administer-measures): PROMIS offers self and parent-proxy measures, but digital integration requires its permission/screenshot-review process. Free paper access alone does not establish permission for this kiosk.

Remaining clinical pilot work: choose exact no-paid-license instruments and verify permission, age eligibility, caregiver construct, administration timing (progress before a visit; session experience after a visit or clearly referring to the previous visit), and scoring. Obtain official versions before activating rules. This is deliberately separate from the functioning arrival and attachment workflow.

## Release validation

Migration 1514 adds a private receipt table and questionnaire-rule respondent type. It does not change existing client or billing records. Applied independently before deployment. Receipt insertion and retry were exercised against the actual database and rolled back; no test arrival notification/email was sent. The clinical-session link columns were verified in the clinical data plane.

Automated tests cover client-only landing, date/range overlap boundaries, quarter-hour shortcuts, start over, form receipt submission and idle reset, private API boundaries, same-day limits, booking lock behavior, caseload/agency/session checks, idempotent completion and attachment history. Local iPad/mobile browser checks use synthetic provider/answer fixtures and intercept all API calls. Production build passes.

## Custom feedback trends

Client record → Records → Feedback & surveys shows overall, connection, and challenges/progress trends. Scores are custom averages on a 0–10 scale, red through amber to green at 10. Each questionnaire contains three items. Distress is reversed (10 − response) so lower distress improves the display score. A category requires its three answers; a total requires all six. Skipped, blank, and not-applicable answers do not become zeros or partial totals. Service and respondent filters prevent mixing therapy with tutoring or self with caregiver reports. No clinical cutoffs or validated reliability claims apply.

The snapshot records `office_feedback_v1` scoring, service type, exact item text, anchors, and reverse-scoring direction. Completed answers and skip metadata are encrypted using the existing AES-256-GCM service. Public receipt responses never return prior answers. The client timeline checks the provider’s active agency/caseload and returns only their attached visits. The kiosk can confirm the type of visit until appointment integration provides an authoritative service type.

## Kiosk email and link previews

Arrival delivery prefers the agency’s active `kiosk` sender identity; dedicated senders use `kiosk@tenant` and `noreply@tenant` Reply-To. Gmail sender verification must succeed. Temporary verification throttles retain a pending arrival until Gmail’s retry deadline; uncertain send failures are not automatically replayed. Provider notification preferences remain respected.

Windchime and Denver have dedicated generated SMS preview images under `frontend/public/office/*-kiosk-share.jpg`. Both existing `/kiosk-welcome/1` and `/kiosk-welcome/6` paths and configured office hostnames receive server-rendered location metadata. Older message apps may retain previews already cached for a URL.


## Client-list feedback summaries

My Dashboard → Clients and the Clients tab on a provider’s admin profile show each client’s connection and progress scores. The supervision caseload table shows the same summaries. School roster summaries are passed only from the authorized provider client view; school staff do not receive feedback.

Each provider/service/respondent series stays separate. Current means latest completed score (dated in its tooltip); average uses all completed category scores. Six-week average uses the last 42 days, inclusive. Six-week change is the latest minus first completed category score within that window and requires two distinct appointment times. Missing answers, one-point histories, and stale-only histories do not become zero change. Caseload averages give each client equal weight and display scored-client and change-eligible counts.

The batch read endpoint accepts at most 200 client IDs, authorizes rows before decrypting, and returns scores rather than item responses. Agency staff are scoped to active agency membership. Supervisors require the active supervisor capability and an assignment to that provider in the same agency, with the client on that provider’s current caseload. Providers keep their own current caseload access. Super admins can review across agencies. These are read permissions only; bulk attachment permissions are unchanged. Client charts also support authorized administrators and supervisors, with a provider selector so histories are not combined.

Checked-in provider/time slots remain visible with a disabled **Checked in** button until their check-in window closes. Status comes from the saved arrival and survives refreshes or another kiosk. The event transaction prevents another arrival for the same provider/location/time, and a different receipt token cannot create a second feedback form. Only the original receipt token may resume its original form after a network retry.

On narrow screens, overflowing navigation tabs slowly scroll back and forth while the kiosk is open. Touch/keyboard interaction pauses motion, reduced-motion settings disable it, and automatic scrolling does not reset the kiosk inactivity timer.

## Arrival email score cards

Arrival emails now show Connection and Progress, each with current, previous and average circles out of 10. Inline HTML renders the numbers without remote score images. Agency email branding and the kiosk sender identity remain in use. Previous and average comparisons use only a confirmed attached client, the same provider/agency, the same service and respondent, and appointments strictly before this visit; average also includes the current completed category. Unattached visits do not borrow history from a recurring time group. Missing/skipped categories are shown as a dash.

In-app arrival remains immediate. Email retains the 90-second acknowledgment grace period and can wait up to five minutes from receipt creation while feedback is unfinished. After that it sends a clearly labeled pending-feedback email with a link to live responses; it does not send another email automatically when later answers arrive. Acknowledgment and in-app-only preferences still suppress the fallback. The direct `/office-checkin-responses/:submissionId` page requires sign-in and the owning provider’s active agency membership. Names and individual answers remain out of the email; numerical summary scores are included as requested.

### Arrival feedback and tablet flow — September 30 follow-up

The tablet uses a larger questionnaire panel with 0–10 buttons and a separate “Not sure” choice. Completing all three items advances to the next questionnaire; Back retains the responses and permits edits without automatically advancing again. A final review precedes saving. Completing or skipping feedback returns to the welcome screen with confirmation. Credentials flow beside provider names, offices share the agency row, and today's appointment details include an explicit provider-profile button.

Provider arrival splashes show Connection and Progress scores, averages, and signed change from the first recorded complete score of the same category/provider/agency/service/respondent history. This is not a claim to know the start of treatment. Anonymous receipts never infer a client from a recurring slot. Answers load on expansion through the owning-provider response endpoint; polling updates scores after submission and clears answers when the alert changes. Missing feedback never prevents the arrival alert from displaying.

Arrival email copy uses “Link this visit” for client association: the general outbound email checker interprets “Attach” as a promised file attachment. Regression tests exercise the actual outbound quality validator for linked, unlinked, pending, and missing questionnaire receipts. Sender verification throttles retain the existing bounded scheduled retry rather than claiming an email was delivered.
