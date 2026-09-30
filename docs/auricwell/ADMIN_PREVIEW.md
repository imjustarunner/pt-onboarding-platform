# AuricWell administrator preview

The published preview at `/auricwell` is a separate Vue HTML entry/router that imports the existing clinical and billing components. `/auricwell/innerstrength` explicitly resolves to the existing `tisi` agency. Other practices use their existing slug. It uses the same backend, canonical charts, draft writer, clinical notes and billing services. Opening a preview never provisions a second practice, copies records or changes organization enrollment.

Only the real, active superadmin can enter. Demo and switched-account sessions are rejected. Normal AuricWell customer credentials are not implemented by this exception. The user's real name and preview status remain visible. Draft saves retain the real actor; no provider is impersonated. The shared full-suite session's lock/expiry still applies. Switching practices reloads the document to discard sensitive in-memory state.

Every shared API request from this entry carries `X-AuricWell-Practice`. The backend independently authenticates the account, checks its current superadmin status, validates the practice, pins list scope, checks record ownership and rejects conflicting agency identifiers. Shared billing summaries, signed-note history, supervision queues and work queues are scoped before returning records. Chart aggregation by names/other agency memberships is bypassed for the preview. Unrelated routes, raw uploads, signatures, financial writes and bulk/destructive operations are held by an explicit route policy. The existing staff frontend does not send this header and retains its behavior.

## Available

- Practice chooser and visible real administrator identity.
- Existing client directory, diagnoses, treatment-plan summary and notes.
- Existing Note Aid interface, writer and draft save/update services; sidebars open on entry and collapse on opening a draft or clinical note.
- Existing appointments for the next 30 days and provider credential/status directory.
- Existing shared claim, payer, remittance and report views, with preview financial writes blocked.
- White AuricWell presentation; practice names without tenant interface branding.

## Not a full customer launch

This release does **not** complete new-practice onboarding, product-specific customer credentials/MFA, reviewed TherapyNotes migration/cutover, patient/guardian portal, practice agreements, audio/uploads, signing, schedule changes or live financial actions in AuricWell. The earlier independent `auricwell/` prototype and its separate clinical/financial record services are not activated or copied into production by this release. Continue consolidating those workflows onto the shared backend instead of connecting a second record system to an existing agency.

Provider credentials displayed in the preview do not establish enrollment or billing eligibility. Existing feature flags, clinical permissions and integration gates remain in effect. The user can review the EHR frontend before any practice cutover. Do not represent the preview as full-replacement acceptance.

## Delivery and validation

Both HTML entries are built by the existing frontend deployment. Nginx and the optional Express static server serve `auricwell.html` for the preview routes with `no-store` and `noindex`; `/assets` remains the shared build asset directory. The frontend router performs a document navigation when an authenticated login redirects into AuricWell. Backend deployment requires no new migrations or runtime flags.

Run `../frontend/node_modules/.bin/vitest run --config vitest.auricwell-preview.config.js` in backend, the Claim.MD regression suite, and the existing BillingWorkspace/ClinicalNoteGenerator view tests. Browser validation intercepts all APIs with synthetic data. No live patient modifications, claims, payments, invitations or signatures are part of automated validation. Docker is not needed locally; GitHub Actions continues its existing remote image build/deploy process.

Validated locally: nine preview policy/boundary tests; 154 shared billing tests (one opt-in database test skipped); 30 shared Note Aid/billing view tests; synthetic Chrome desktop/mobile checks. Both frontend entries compile in a production Vite build. Local build validation omits copying public media because of disk constraints; remote deployment uses the normal complete build. Browser check: `node frontend/scripts/verify-auricwell-preview.mjs` against the frontend dev server on port 5181 (or set `AURICWELL_PREVIEW_URL`).
