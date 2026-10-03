# AuricWell administrator preview

The published preview at `/auricwell/app` is a separate Vue HTML entry/router that imports the existing clinical and billing components. `/auricwell/app/innerstrength` explicitly resolves to the existing `tisi` agency. Other practices use their existing slug. It uses the same backend, canonical charts, draft writer, clinical notes and billing services. Opening a preview never provisions a second practice, copies records or changes organization enrollment.

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

## Public website and app addresses

The website is hosted at `https://plottwisthq.com/auricwell`, with Home, Product, Security, About and Contact pages. The Vercel deployment at auricwell.com is unchanged. Static HTML is built by `scripts/build-auricwell-website.mjs`; public pages load no clinical JavaScript, stores or APIs. Copy distinguishes the administrator preview from planned customer workflows. Illustrations use sample content.

Sign-in starts at `/auricwell/app/login`, continues through the existing HQ authentication flow and returns to the chooser at `/auricwell/app`. This does not introduce customer credentials or implicit cross-product sign-in. The explicit, identified superadmin preview remains the only available access. Workspaces use `/auricwell/app/:organizationSlug/:section?`. Old `/auricwell/:organizationSlug` links redirect, preserving queries; practice switches still reload to clear state. Other HQ routes, including `/app`, are unchanged.

Contact opens an email to the user-designated `support@auricwell.com`; it is not a form submission or delivery confirmation. Configure that mailbox separately. No pricing, certifications, testimonials or launch dates are asserted. Moving to auricwell.com later requires deployment routing, canonical metadata and authenticated API configuration; changing DNS alone is not a validated deployment.

Run `node frontend/scripts/verify-auricwell-website.mjs` (Chrome / Playwright; optional `AURICWELL_PREVIEW_URL`). Covers five pages at 1440, 768, 390 and 320 pixels, keyboard navigation, mobile links, contact and login handoff, with zero public clinical API requests. The preview browser check verifies old-link redirects and scoped practice switching. Production compilation and 30 shared Note Aid/billing component tests pass.

## Website feature story (October 2, 2026)

Marketing now describes transitions from the current EHR, with export compatibility reviewed before cutover. The page frame fills the viewport; paragraph widths stay readable. Home and Product describe guided AI documentation, configurable treatment plans, objective history, check-in feedback, multiple guardian relationships, intake, kiosk arrivals and virtual care. Shared-platform capabilities are distinguished from AuricWell rollout readiness.

The plan comparison reads the approved `frontend/src/config/productPlanCatalog.js`, restricted to AuricWell features. It retains the catalog's Basic/Premium/Premium Plus names and separates agency entitlements from individual private offices. It does not publish prices or imply plan assignment activates an integration.

Clinical wording is grounded in `clinicalNoteContentReview.service.js`, `clinicalNoteAmendment.service.js`, claim readiness/content review, treatment-plan services and objective ratings. Review-only notes may skip cosign; required document/amendment approvals remain. Do not publish guarantees of error-free billing or universal exemption from supervisor signatures. Arrival connection/progress scores are custom feedback, not validated outcome measures.

The fictional provider-availability demonstration runs locally in the browser, with no API requests, storage, booking or patient information. Provider changes reset the selected time. Keyboard-operable controls and a live status region disclose that no appointment was booked. The separate static JavaScript asset uses revalidation rather than immutable caching. Games, whiteboards, waiting-room music and transcription are described as configured shared-platform/session capabilities, not universal private-office features.

Validation includes generated HTML, all five pages at 2560/1920/1440/768/390/320 pixels, full viewport width, no horizontal overflow, provider/time selection and reset, keyboard activation, plan display, contact and login links, and zero public clinical API requests. Local validation uses a sparse checkout without unrelated media to avoid exhausting disk space.
