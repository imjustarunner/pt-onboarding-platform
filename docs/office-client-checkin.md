# Client check-in and same-day office reservations

Client landing: https://plottwisthq.com/kiosk-welcome/1 (Windchime) and https://plottwisthq.com/kiosk-welcome/6 (Denver). Existing building aliases and Office home-screen identity are unchanged. Client check-in opens directly to provider selection. Room cards and date/time controls appear only after selecting Office directory.

## Client arrival

Choose the provider, scheduled appointment, and respondent: adult self-report, youth self-report, or parent/caregiver. Arrival and the provider’s in-app alert are saved together. Optional email follows existing notification preferences. Each browser attempt gets an opaque, memory-only receipt; retrying that attempt is idempotent. Public responses contain no client identity, previous answers, or clinical-session identifier.

Configured forms use an immutable definition snapshot. The selected provider sees arrivals and any submitted responses under **Clients → Check-in submissions**, with the appointment date/time, location and respondent. If the appointment already has a client/session, those links are retained. Otherwise the provider can attach to a client in the same agency on their caseload and optionally an existing clinical session. Reattachment retains prior links in an audit history and does not modify the original responses or overwrite a clinical note. “Create a client first” opens existing client onboarding; return to this inbox to attach.

Clear selection / Start over is visible throughout the client flow. Completion resets after 12 seconds; abandoned forms reset after 3 idle minutes. Answers and receipt tokens are never persisted in browser storage. Unsubmitted answers are discarded, while the saved arrival remains visible to the provider.

## Office directory and booking

Start/end time searches show a room red if any booked event or office hold overlaps the selected range. Green means no booking/hold overlaps the whole range; standing assignment ownership remains separate. End boundaries are exclusive. Quarter-hour buttons set minutes to 00, 15, 30 or 45; the native picker still accepts other minutes.

Expand a green room and choose **Staff · Book this office**. The staff page, https://plottwisthq.com/office-booking/1, retains the room/date/range and requires sign-in. Authorized active staff can reserve for themselves today in the building’s timezone, starting now or later. These reservations are confirmed immediately and do not enter an approval queue. Future dates remain browseable but this endpoint rejects future booking, past starts and midnight-spanning ranges. Existing broader scheduling workflows are unchanged.

Booking rechecks occupancy inside a room lock and database transaction. Different ranges share the same room lock. Assignments split at reservation boundaries so the unbooked remainder and original owners remain visible. Conflicting bookings, clinical-linked released events, building access failures, provider overlaps and blocking expired credentials are rejected. Room reservations currently occupy the schedule even without a client; requiring a linked session/client for every booked slot remains a later scheduling transition.

## Questionnaire content status

**No new clinical instrument is activated by this release.** Windchime and Denver had no active questionnaire rules at inspection. Providers can configure separate adult, youth and caregiver versions under Provider → Kiosk Questionnaires. The renderer supports text, textarea, number, date, email, phone, select, multi-select and yes/no fields. Unsupported forms are flagged for provider assistance, never reported as completed. This generic renderer is not a validated scoring engine and does not automatically recreate instrument layout, scoring, clinical thresholds or risk escalation.

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
