# Guardian waivers & kiosk check-in

## Feature flag

Set on the **agency** JSON `feature_flags`:

```json
{ "guardianWaiversEnabled": true }
```

Admin UI: **Company profile → Features → Enable guardian waivers & kiosk check-in gate**.

When `false` or omitted, waiver APIs return `enabled: false` for guardians and kiosks do not gate check-in.

## Data model (migration `608_guardian_client_waiver_tables.sql`)

- `guardian_client_waiver_profiles` — one row per `(guardian_user_id, client_id)` with `sections_json`.
- `guardian_client_waiver_attestations` — signature + consent metadata per change.
- `guardian_client_waiver_history` — append-only history rows linked to attestations.
- `guardian_client_waiver_kiosk_confirmations` — optional audit row when check-in succeeds with waivers on file.
- `program_sites.guardian_waiver_required_sections_json` — JSON array of section keys to require at kiosk (optional; `NULL` = all standard sections).
- `company_events.guardian_waiver_required_sections_json` — optional override when `companyEventId` is passed to status/check-in.

## Section keys (standard order)

1. `esignature_consent` — must be **active** before other sections can be saved or updated.
2. `pickup_authorization`
3. `emergency_contacts`
4. `allergies_snacks`
5. `meal_preferences`

## API

### Guardian (authenticated, `client_guardian`)

- `GET /api/guardian-portal/waivers/clients/:clientId`
- `POST /api/guardian-portal/waivers/clients/:clientId/sections/:sectionKey` — create (first time / after revoke)
- `PUT /api/guardian-portal/waivers/clients/:clientId/sections/:sectionKey` — update while active
- `POST /api/guardian-portal/waivers/clients/:clientId/sections/:sectionKey/revoke` — revoke

Body (save): `{ payload, signatureData, consentAcknowledged: true, intentToSign: true }`  
Body (revoke): `{ signatureData, consentAcknowledged: true, intentToSign: true }`

### Kiosk (public)

- `GET /api/kiosk/:locationId/guardian-waiver-status?siteId=&guardianUserId=&clientId=&companyEventId=`
- Check-in `POST .../guardian-checkin` returns **409** with `code: GUARDIAN_WAIVERS_INCOMPLETE` when the gate applies and sections are missing.

### Admin audit

- `GET /api/clients/:id/guardian-waiver-audit` (backoffice admin) — profiles + history (signatures truncated in response).

## Frontend

- Guardian: **Waivers & safety** in the portal rail, or `/guardian/waivers` (and `/:slug/guardian/waivers`).
- Kiosk: guardian flow checks waiver status before the confirm step when checking **in**; server enforces the same rule.

## Public intake → waiver profile

- In **Digital Forms** (`IntakeLinksView`), add flow step **Guardian waivers** and choose which standard sections appear.
- On finalize/submit, responses under `intakeData.responses.submission.guardianWaiverIntake` are written to
  `guardian_client_waiver_*` **only when**:
  - the link includes a `guardian_waiver` step, and
  - the agency has `guardianWaiversEnabled`, and
  - a `client_guardians` row exists for the guardian + client (created during intake guardian linking).
- Waivers are **not** written for clients whose date of birth shows they are **18+** (same rule as portal lock).

## Guardian portal: intake-signed PDFs per child

- `GET /api/guardian-portal/clients/:clientId/intake-documents` — list signed `intake_submission_documents` where the
  submission’s `guardian_user_id` matches the logged-in guardian and `client_id` matches.
- `GET /api/guardian-portal/clients/:clientId/intake-documents/:documentId/download-url` — short-lived signed URL to view
  the PDF.

## Age 18+ hard lock (guardian)

- When `clients.date_of_birth` proves the client is **18 or older**, guardians receive `guardian_portal_locked: true` on
  overview/client list payloads.
- Waiver GET/PUT/POST and intake-document endpoints return **403** with `code: GUARDIAN_ADULT_CLIENT`.
- Kiosk: waiver gate is bypassed (treated complete); clients may be labeled **(18+)** and remain selectable for
  check-in/out without guardian waiver management.

## Kiosk: review + edit section

- `GET .../guardian-waiver-status` returns `sectionDisplay` (readable lines) and `sections` (payload snapshot) when
  waivers are enabled.
- After a successful review step, check-in continues to confirmation; **Edit section** uses
  `POST /api/kiosk/:locationId/guardian-waiver-section` with the same body shape as guardian portal saves (`action`:
  `create` or `update`).

## Platform branding

`available_agency_features_json.guardianWaiversEnabled` may be set to `false` to hide the agency toggle (same pattern as other features).
