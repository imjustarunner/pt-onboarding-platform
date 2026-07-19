# Medical Billing + Claim.MD (Gated)

Living architecture for the opt-in medical billing stack. See also the Cursor plan “Gated Medical Billing”.

## Feature flags (`agencies.feature_flags`)

| Flag | Default | Role |
|------|---------|------|
| `medicalBillingEnabled` | false | Single switch for chart, signing/cosign, medical claims, fee schedules, and Claim.MD |

Tenant feature matrix and Company Profile expose only this one flag. Runtime helpers still report child capability names (`clinicalChartEnabled`, etc.) as derived from the master for older route guards. Platform must expose `medicalBillingEnabled` via Available Agency Features (`defaultAvailable: false`).

## Hard rules

- Payroll time claims remain payroll — never overload `payroll_time_claims`.
- PHI lives in the clinical DB; main DB keeps pointers / credentials metadata.
- Claim.MD AccountKey is encrypted — never stored in `feature_flags`.
- Do not auto-enable for existing agencies.

## Flow (when ON)

Appointment → `clinical_sessions` encounter → signed `clinical_notes` (+ cosign) → medical claim lines → Claim.MD upload → status / ERA.

## Key code

- Flags: `frontend/src/config/medicalBillingAccess.js`, `backend/src/services/medicalBillingFlags.service.js`
- Middleware: `backend/src/middleware/medicalBilling.middleware.js`
- Routes: `/api/medical-billing/*`
- Clinical schema: `database/clinical_migrations/002_medical_billing_foundations.sql`
- Main DB: `database/migrations/973_agency_claimmd_credentials.sql`
