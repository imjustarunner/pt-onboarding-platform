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

## Actual app examples (October 2, 2026)

The marketing illustrations have been replaced. Public examples import `PublicProviderCard.vue` and `NoteAidObjectiveRatings.vue` directly through `ActualExamples.vue`, retaining their app markup, styling and interactions. Example events are handled locally; the wrapper does not import the API client or authenticated stores and never creates holds, bookings or chart writes. Provider names, dates and goal history are synthetic. The public bundle is built independently by the website build script so changes to the shared components are reflected on the website.

Practice Notes images in `frontend/public/auricwell/examples/` are screenshots of the actual `ClinicalNoteGeneratorView` in the AuricWell workspace, not a reconstructed interface. `node frontend/scripts/capture-auricwell-note-example.mjs` reproduces them against Vite on port 5181 with synthetic API responses in a fresh browser. It captures the real library/queue layout and the guided editor; no AI generation, signatures or saved notes are performed. Regenerate these captures when that interface changes.

The website check verifies actual provider-card events, rating changes, client versus clinician history, reset behavior, screenshot loading and zero clinical API requests, in addition to responsive, keyboard, contact and login checks. A component-level example does not open a live provider profile or grant clinical access.

## Provider and scheduling showcase (October 2, 2026)

The website now uses compact, website-scoped styling around the existing provider cards, fictional biographies and generated portraits. Choosing a profile opens its local availability preview. The time-grid presentation is shared through `PublicProviderOpeningCalendar.vue`; the real `PublicProviderSlotPicker.vue` retains API access, hold validation and storage, while the website imports only the presentation component. Example selections stay in memory, clear when the provider or week changes, and never create a hold. On phones, the week scrolls horizontally to keep the section compact.

Calendar and booking images are actual captures of `ScheduleAvailabilityGrid.vue`. Reproduce them with `node frontend/scripts/capture-auricwell-schedule-example.mjs` against local Vite on port 5181. The script uses a fresh browser, fictional agency/client fixtures, intercepts all API origins, rejects writes, blocks external network access and removes its temporary capture entry. Existing public media must be available locally for Vite to compile the shared schedule. These are shared-platform examples, not a claim that all scheduling mutations are enabled in the AuricWell preview.

Portrait assets: `frontend/public/auricwell/examples/avery-lane.jpg` and `jordan-reed.jpg`. Generated using the built-in imagegen tool, then resized/compressed to 512px JPEG for the site. Both depict invented people and are labeled as AI-generated portraits on the website. Final prompts:

1. Use case: photorealistic-natural. Asset type: fictional therapist profile photo in an EHR website demonstration. Create one square natural professional headshot of a fictional woman in her late thirties with shoulder-length dark wavy hair, warm medium complexion, a gentle confident smile, navy blouse. Chest-up, centered, eyes toward camera, head with comfortable margin, softly blurred light neutral therapy-office background, soft daylight, realistic skin texture. Warm and approachable editorial photography. No text, no logos, no border. This must depict an invented person, not a real clinician.
2. Use case: photorealistic-natural. Asset type: fictional therapist profile photo in an EHR website demonstration. Create one square natural professional headshot of a fictional man in his early forties with short curly dark hair, dark complexion, neatly trimmed beard, friendly confident smile, light blue open-collar shirt. Chest-up, centered, eyes toward camera, head with comfortable margin, softly blurred light neutral therapy-office background, soft daylight, realistic skin texture. Warm and approachable editorial photography. No text, no logos, no border. This must depict an invented person, not a real clinician.

Validation: shared provider-card/slot-picker regression checks include office filtering, week/format changes, hold creation/release/status and conflicts. Public-browser checks cover provider profiles, portrait loading, local selections/reset, real scheduling captures, keyboard navigation, all five pages at six viewport widths, and zero public clinical API requests.

## FAQs, vendor comparison and kiosk examples (October 3, 2026)

Home and Product link to a six-workflow comparison of AuricWell, TherapyNotes and SimplePractice. `frontend/src/auricwell/website/compare.mjs` holds the official support-page references, review date and reusable FAQ content. Competitor reminders, public appointment requests and AI tools are credited. SimplePractice also documents confirmation status and treating rooms as office locations. TherapyNotes documents staff-entered Appointment Alerts for check-in. A workflow not established by the reviewed documentation is labeled **not verified**, never treated as a confirmed missing feature. Update the review date and source descriptions together when revisiting the comparison. No prices or claims of exclusivity are asserted.

AuricWell claims refer to the shared-platform implementation on main, not uncommitted work or universal customer availability:

- `sessionNotification.service.js`: tenant templates, channels, cadence, platform constraints and recipient preferences; `appointmentReply.service.js`: confirmation replies update `client_confirmed`; `ScheduleAvailabilityGrid.vue`: confirmation badge mapping.
- `officeKioskCheckin.service.js`: transactional arrival/in-app alert, push dispatch and email delivery row due after 90 seconds. `officeArrivalNotifications.service.js` suppresses acknowledged/disabled deliveries and enforces sender/membership checks. `officeArrivalEmail.js` and `OfficeArrivalSplash.vue` supply arrival wording and feedback structure.
- The office-kiosk path currently **does not call SMS dispatch**, even though the generic dispatcher recognizes `kiosk_checkin`. Do not advertise provider arrival SMS as operational without wiring and validating that path. The website labels it a design preview beside the message and in the FAQ/comparison.

`KioskShowcase.vue` reuses `KioskProviderCard.vue` and presents an AuricWell styling preview of the existing provider selection, respondent selection and arrival flow. Meadowbrook Therapy, Jordan Reed and the appointment/feedback are fictional; the treating practice is distinct from AuricWell. In-app and email examples mirror the existing sequence, including local acknowledgment suppressing the example email; the email is a styled preview, not a capture of an executed delivery. The SMS is explicitly a proposed format. No demo imports the API client, creates a visit, records feedback, writes storage or sends any notification. Public headshot/logo URLs are absolute same-origin assets because the shared kiosk card normally resolves upload paths against the backend.

FAQs cover confirmations and consent, enrollment, multiple guardians, clinician AI review, required versus optional cosigning, amendments, configurable goals, new-practice setup, current-EHR transitions, rollout and contracting. They retain the limits on guarantees of error-free notes or claim payment. Website notification copy reflects configured shared-platform workflows; this change does not enable new channels in AuricWell or alter the production notification policy.

The browser verification checks all five pages at six widths, keyboard operation, respondent-required sample check-in, guardian context, arrival acknowledgment, email suppression/reset, labeled SMS, sourced table links, FAQ expansion, no page overflow and zero API requests. The independently compiled public bundle is also exercised with its production JavaScript/CSS.

## Shared PlotTwistCo showcase (October 3, 2026)

`https://plottwistco.com/hq` now presents the same provider finder, calendar/booking captures, Practice Notes, objective-rating controls, kiosk and notification examples. Home links into the examples and comparison; Home and Contact also surface the FAQs. The existing business, people-operations and service content remains available.

`PtcoPlatformShowcase.vue` reuses the AuricWell demonstration components and repository-owned FAQ/comparison renderers. Product parameters and CSS variables supply Plot Twist HQ names and burgundy styling while retaining the default AuricWell presentation. Clinical screenshots are explicitly labeled as the shared workspace in its AuricWell presentation. The plan display reads the platform entries in the approved plan catalog. The comparison covers clinical workflows, not every business service in the broader suite.

The examples use fictional records and local state. They neither call clinical APIs nor create bookings, check-ins, signatures or notifications. Provider arrival SMS remains an explicitly labeled design preview; this website change does not enable a delivery channel. Existing public marketing/chat configuration reads and the site’s anonymous session check remain unchanged.

Run `node frontend/scripts/verify-ptco-showcase.mjs` against the frontend dev server on port 5181, or set `PTCO_PREVIEW_URL=https://plottwistco.com` for read-only deployed checks. It covers Home, HQ, Contact and Start at five widths, interactive examples, shared-image loading, keyboard access, source links, branding, FAQs and hash navigation. It blocks workflow writes and checks for unexpected private API requests. Also run `verify-auricwell-website.mjs` after changes to the shared components.

## Public fictional workspace demo

`/auricwell/demo` is a separate HTML entry with a hash router. It mounts the same
AuricWell App, client chart/directory, Practice Notes, billing workspace and shared
scheduling component with repository-owned fictional Meadowbrook Therapy records.
The authenticated `/auricwell/app` entry still requires its existing server-verified
administrator context. Demo access does not grant application access.

The demo replaces local/session storage with isolated memory stores *before* shared
modules load. Its Axios adapter has no network fallback: only explicit fixture
reads are accepted; mutations, unknown reads and foreign IDs are rejected. CSP
blocks connections, external scripts, frames and form submissions. Microphone and
camera access are disabled by the demo route's Permissions-Policy; its bootstrap
also rejects recording requests. AI, claims transmission, payments and delivery
are not connected. Reset/reload discards browser-only edits.

AuricWell home/product pages offer an opt-in iframe and full-workspace link, and
Plot Twist Co.'s AuricWell product card links to the same demo. Website captures
are taken from these real components with synthetic data. This does not establish
production launch readiness for any workflow.

Validation (no Docker): `node frontend/scripts/verify-auricwell-demo.mjs` accepts
`AURICWELL_DEMO_BASE` for a locally served production build or the deployed origin.
It covers provider bios, client charts, draft opening with both rails collapsed,
blocked saving/booking, claim review, 320–1440px layouts, zero backend requests and
same-tab session/preferences isolation. Existing preview and public website
regression scripts remain separate.
