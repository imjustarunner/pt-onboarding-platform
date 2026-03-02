# Provider-Only iPhone MVP (PWA)

## Product Goal
Launch a provider-first iPhone experience as a PWA that delivers the highest-value daily workflows without rebuilding the full desktop app.

## MVP Scope
- Provider-only mobile experience.
- Read-only schedule view.
- Read-only payroll snapshot and recent payroll periods.
- Light Note Aid flow:
  - launch existing Note Aid page with context
  - save text drafts to clinical notes
- Twilio communication:
  - view recent client threads
  - view thread messages
  - send SMS
  - trigger call action

## Non-Goals (V1)
- Full parity with desktop navigation.
- In-app audio recording/transcription/generation for Note Aid.
- Full payroll claim editing workflows.
- Offline-first data sync.
- Native iOS shell/App Store packaging (PWA first).

## Access Rules (Provider-Only)
- Allow roles: `provider`, `provider_plus`, `intern`, `intern_plus`, `clinical_practice_assistant`.
- Also allow users with provider access flags:
  - `has_provider_access` = true / 1 / "1"
  - admin-like users (`admin`, `super_admin`, `support`) for operational support.
- Block all other authenticated roles from provider-mobile routes with redirect to standard dashboard.

## Navigation Model
- Route shell: `/:organizationSlug/provider-mobile`
- Child routes:
  - `schedule`
  - `payroll`
  - `note-aid`
  - `communications`
- Tabs in a bottom bar for one-hand iPhone use.

## Screen List
1. Provider Mobile Home/Shell
   - Mobile header (org + user context)
   - Bottom tab navigation
2. Schedule
   - Current week day list
   - Combined office + schedule events
3. Payroll
   - Dashboard summary card
   - Recent payroll periods list
4. Note Aid (Light)
   - Quick launch to existing Note Aid route
   - Text draft composer + save to clinical drafts
   - Recent drafts list
5. Communications
   - Recent threads list
   - Thread detail
   - Send SMS
   - Call selected client

## Endpoint Mapping

### Schedule
- `GET /users/me`
- `GET /users/:id/schedule-summary?weekStart&agencyId`

### Payroll
- `GET /payroll/me/dashboard-summary?agencyId`
- `GET /payroll/me/periods?agencyId`

### Note Aid (Light)
- `GET /clinical-notes/context?agencyId`
- `GET /clinical-notes/recent?agencyId&days=7`
- `POST /clinical-notes/drafts`

### Twilio Comms
- `GET /messages/recent?limit=200`
- `GET /messages/thread/:userId/:clientId?limit=200`
- `POST /messages/send`
- `POST /communications/calls/start`
- `GET /sms-numbers/available`

## UX Constraints
- iPhone-first layout with safe-area support.
- Touch targets >= 44px where practical.
- Keep each screen to 1 primary action.
- Defer advanced filters/settings to desktop.

## Acceptance Criteria
- Provider user can authenticate and reach provider-mobile shell.
- Non-provider user cannot access provider-mobile routes.
- Provider can view week schedule entries on iPhone width.
- Provider can view payroll summary and recent periods.
- Provider can open Note Aid route and save a text draft.
- Provider can load a thread, send SMS, and trigger call action.
- App can be installed to iPhone home screen (manifest + standalone compatible metadata).

## Rollout Plan
1. Internal QA with provider test accounts on iPhone Safari and installed PWA.
2. Pilot with a small provider cohort in one organization.
3. Monitor errors/usability and iterate weekly.
4. Expand to broader provider audience after pilot criteria are met.

## Future Phases
- Add in-app audio recording and transcript flow.
- Add richer payroll drill-down and filters.
- Add notifications and deeper session-context launch paths.
- Evaluate Capacitor packaging for App Store distribution.
