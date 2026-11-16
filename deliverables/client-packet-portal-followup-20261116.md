Implemented locally on November 16, 2026. Existing unrelated workspace changes were preserved.

| Requests | Result |
| --- | --- |
| 1–2, 4 | Preferred-language choices support English, Spanish, Unknown and custom text. Packet language and Spanish dependent sex are extracted. |
| 3 | Medicaid primary or secondary coverage always uses Self and the client's subscriber identity when saving, verifying eligibility and preparing claims. Commercial relationships remain plan-specific. |
| 5–8 | Paper review defaults the signer, extracts signature dates/pages and records submission-date fallback explicitly. One ROI signature and one packet consent signature cover their respective groups. Original PDFs, evaluations and historical audit evidence remain intact. OCR suggestions require source review before changing consent or release access. |
| 9–10, 19–20 | Client management restores its workspace from memory, uses Needs / Up to date, filters active providers and agencies separately from affiliations, and opens selected clients as a sequential review queue. Paper processing can finish separately from invitations. |
| 11–18 | Patient comments precede demographics; additional contacts follow demographics. Guardian contact details stay off the client's own phone/email fields. The matching primary parent can have an account prepared; extra contacts require selection. Insurance uses one paste per coverage with independent primary/secondary drafts and payer matching. |
| 21–23, 26 | Transition invitations show recipients, language, actual portal forms and an email preview before explicit sending. Non-Medicaid clients, including self-pay clients, receive payment authorization/card setup; communication choices are included for all. Needed school releases and current disclosure updates are included in portal review. Spanish setup, sign-in, portal forms and reminders are supported; unavailable required Spanish documents block sending. |
| 24–25 | Self-pay requires an explicit client service rate. Account has a separate Billing & insurance tab for authorized support/billing/admin access. Providers receive a coverage summary; detailed billing fields and APIs remain restricted. |
| 27 | Portal relationships can be changed in place. Client-only access, no guardian access, payment-only and payer-plus access stay distinct. Existing privacy restrictions and clinical-consent requirements are preserved. |
| 28 | Guardians can share an expiring guest payment link; staff can send a reviewed invoice to the saved external billing contact. Guest pages expose the amount and practice branding, use Stripe card entry and record guest/staff attribution separately from the liable payer. |
| 29 | Enrollment, staff billing settings and the guardian portal identify the responsible billing party. Other contacts require contact/mailing information. Missing selection remains a task and holds balance notices; changed recipients are rechecked before delivery. |

Updated disclosure assignments use the current client/agency care-team content and bind its language and content hash. Rejected or partial submissions remain pending; completion requires the matching signed document and acknowledgment.

Validation passed: 290 backend tests, 137 frontend tests, and 5 additional parser tests. The static backend import/export check covered 2,976 local modules with no unresolved imports. Database migrations and live integrations were not executed.

Validation commands:

```sh
NODE_OPTIONS=--experimental-sqlite node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.client-packet-portal.config.js
node frontend/node_modules/vitest/vitest.mjs run --config frontend/vitest.client-packet-portal.config.js
```

The production Vite build passed using the repository's existing 8 GB Node heap setting. Its 832 MiB temporary output was removed after verification. No task worktree or dependency copy remains; the final disk check showed about 36 GiB available. The backend's local static import/export graph was checked without starting services or connecting to production.

Deployment prerequisites: apply `1832_client_billing_account_setup.sql` and `1833_guest_invoice_payments.sql` before deploying the dependent backend. Existing chart-import storage must already be present. `PORTAL_MIGRATION_INVITES_ENABLED` and `CLIENT_UPDATE_WORKFLOWS_ENABLED` are preserved; this task did not change production rollout settings. Required custom documents need approved language-specific versions; arbitrary document text is not translated automatically.

Reminders respect the saved recipient's notification choices and existing delivery controls. “Sent,” redirected, queued and uncertain delivery remain separate from actual portal sign-in/activity. Guest payment links require an existing accountable payer allocation; no synthetic account or human audit identity is created to fill missing billing responsibility.

No production records, database migrations, invitations, emails, live eligibility requests, claims or payments were performed during this task. Live inbox receipt and carrier/payment processing were not exercised.

## Release integration

Integrated against the newer main release while retaining its authorization, paper-insurance review, portal restrictions, client actions, contact correction and enrollment safeguards. The isolated release passed 339 backend tests in 34 files, 187 frontend tests in 28 files, seven Node demographic parser tests, and a production Vite build (7,168 modules, 8 GB heap).

The existing backend bootstrap applies pending migrations before application readiness. A new metadata-only readiness check requires all four tables and their fields from migrations 1832 and 1833 before candidate promotion. This uses the service's existing credential configuration. A separate schema job failed authentication before executing SQL; copying a live credential into that job was rejected and was abandoned. No credentials were copied.

Deployment verification will confirm the serving commit, both Cloud Run revisions, schema readiness and public endpoint behavior. Inbox receipt and authenticated client actions require normal authorized portal access and are not claimed by deployment probes.
