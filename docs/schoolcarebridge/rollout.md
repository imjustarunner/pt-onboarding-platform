# SchoolCareBridge rollout

SchoolCareBridge is a program of MH4Kidz. Plot Twist Co manages the technology. The new routes reuse existing school records, accounts, memberships, and school workflow APIs. Existing ITSCO routes retain their current behavior unless the separate legacy routing flag is explicitly activated.

## Initial release

1. Apply `1504_schoolcarebridge_foundation.sql` through the normal migration process. It adds the marketing page, a program ownership configuration row, and expiring login-routing hints. It does not create a school, agency, charge, invoice, or payment method. Its inserts preserve existing records.
2. Deploy frontend and backend together. The frontend production build needs an adequate Node heap for this repository: `NODE_OPTIONS=--max-old-space-size=8192 npm --prefix frontend run build`.
3. Ensure the MH4Kidz load balancer serves `/schoolcarebridge` and its descendants from the frontend and routes `/api/*` to the existing backend. Branded web login uses same-origin `/api` so its session cookies and Google OAuth callback belong to that origin. The generated Nginx configuration includes the subpath.
4. Leave `SCHOOLCAREBRIDGE_PUBLIC_ORIGIN=https://mh4kidz.org` (the default) and `SCHOOLCAREBRIDGE_LEGACY_REDIRECT_ENABLED=false` (the default).
5. Email/password sign-in does not require OAuth setup. Confirm that launch users' existing account policies permit passwords and verify password setup/recovery email delivery. If an agency account requires Google sign-in, retain that policy and either configure `https://mh4kidz.org/api/auth/google/callback` on the existing OAuth client or resolve that account's access policy before onboarding it. Google is optional for the launch; do not bypass an existing SSO requirement. Backend origin support is included in the deployment workflow.
6. In Public Marketing Pages, open `schoolcarebridge`. Set the logo, hero, public contact/demo destinations, and subpages. Subpage slugs: `for-schools`, `for-agencies`, `how-it-works`, `about`, `resources`, `security`; their title, subtitle, hero and Markdown body can override the defaults. Preview uses the existing desktop/tablet/mobile design workspace. No destination means an explicit opening-soon state; the public MH4Kidz contact destination is used as fallback when configured.
7. Check active schools' existing `portal_url`/slug, logos and colors. Optional school `theme_settings.schoolCareBridge` supports `loginBackground` and `tagline`; the existing `loginBackground` is a fallback. Missing imagery uses the SchoolCareBridge default. Agency logos come from active `organization_affiliations`, without changing data permissions.
8. In Platform Billing, use the SchoolCareBridge panel to link the existing active `mh4kidz` agency record. If absent, configuration stays incomplete. Configure its existing billing account through the normal tenant settings workflow. This release never activates SchoolCareBridge pricing, usage reallocation, invoice issuance, or collections.

Initial URLs:

- `https://mh4kidz.org/schoolcarebridge`
- `https://mh4kidz.org/schoolcarebridge/app`
- `https://mh4kidz.org/schoolcarebridge/app/{existing-school-slug}`

Parents continue using existing guardian/intake experiences. Grants, liaison awards, marketplace transactions and sponsorship workflows are outside this release.

## Dedicated domain activation

1. Obtain `schoolcarebridge.org`, provision its certificate and load-balancer host rules, and point DNS to that frontend/backend deployment. The generated Nginx host block is already prepared. Choose the apex domain as canonical and redirect `www` at the load balancer.
2. Route `/api/*` to the existing backend; all other application routes and assets go to the frontend. `/app` is a marketing/login page, not a redirect to `app.schoolcarebridge.org`.
3. Confirm that the backend accepts the new origin and password setup/recovery works there. Only if Google sign-in is enabled for participating accounts, register `https://schoolcarebridge.org/api/auth/google/callback` and keep the MH4Kidz callback during transition. Password-only users require no OAuth registration.
4. Set `SCHOOLCAREBRIDGE_PUBLIC_ORIGIN=https://schoolcarebridge.org`. This changes generated recovery and future routing-hint destinations. It does not enable ITSCO redirection. Do not migrate cookies or authentication tokens between domains: users authenticate on the destination.
5. Smoke-test direct `/app`, school routes, page refresh, email discovery, multiple-school selection, agency school selection, password recovery/change, logout, and session expiry. Test Google success/failure only when configured. Confirm provider profile and document links remain in the SchoolCareBridge namespace.
6. Only after these checks set `SCHOOLCAREBRIDGE_LEGACY_REDIRECT_ENABLED=true` to enable recognized school-staff email routing from `https://app.itsco.health`. Other entry points and agency identities retain their existing behavior.

Legacy transfer uses a random, hashed-at-rest, two-minute, single-use routing hint. It only restores the email field; it does not issue a session. Consumption requires the configured destination origin and exact URL. Invalid or expired hints require the user to restart sign-in. School membership and ROI permissions remain server-enforced.

## Rollback and monitoring

Disable the legacy redirect flag first if routing fails. Keep the MH4Kidz subpath available and restore `SCHOOLCAREBRIDGE_PUBLIC_ORIGIN=https://mh4kidz.org` if necessary. Existing ITSCO logins and bookmarks do not depend on SchoolCareBridge. Leave additive database tables and records in place; disabling the marketing page can unpublish public copy without deleting school data.

Use existing request/authentication logs to watch identify, routing-hint consume, school access, recovery and Google callback failures. Do not log hint tokens or put email addresses into redirect URLs. Compare 403s, callback errors, repeat redirects and support requests during rollout. A 410 on hint consumption is an expired/reused link, not an authenticated session failure.

## Validation

Commands:

```
node --test backend/src/services/__tests__/schoolCareBridgeRouting.test.js
node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.schoolcarebridge.config.js
node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.password-recovery.config.js
npm --prefix frontend test -- src/utils/__tests__/schoolCareBridge.test.js src/utils/__tests__/publicDomainRouting.test.js src/utils/__tests__/publicWebsiteEditing.test.js
NODE_OPTIONS=--max-old-space-size=8192 npm --prefix frontend run build
```

Browser verification uses synthetic API responses, not live school/student data. DNS, certificates, load-balancer changes, actual Google consent, and real billing connections require deployment validation. The partner release applies its targeted additive migration; it does not activate financial transactions.

For the browser suite, start Vite with `VITE_API_URL=/api npm --prefix frontend run dev -- --host 127.0.0.1 --port 5178`, then run `node frontend/scripts/verify-schoolcarebridge.mjs`. Set `SCB_BROWSER_EXECUTABLE` if using an installed Chrome instead of Playwright's bundled browser. The script intercepts API calls and forwards its synthetic future-domain navigation to local Vite. It covers desktop/mobile pages, login discovery, recovery, multiple memberships, agency selection, the shared portal and roster, access denial, session expiry, and the Google return destination. Actual OAuth consent and message delivery are not simulated as successful transactions.

The broader public-website regression run has two existing Mental Range provider-filter/availability test failures, reproduced against the unchanged repository baseline. SchoolCareBridge, routing, editing, and password-recovery focused checks pass.

## Partners, scoped tenants and agreement drafts

Apply `1505_schoolcarebridge_partners.sql` after the foundation migration. It is additive and repeatable. It registers only the existing active ITSCO agency as a connected public partner and creates its unsigned agreement draft. Existing customization, school affiliations, permissions, agency charges and invoices remain untouched.

Program administration: `/admin/schoolcarebridge` (super administrator), also linked from Platform Billing → SchoolCareBridge. Agency workspace: `/schoolcarebridge/app/partners/itsco`; future dedicated-domain path: `/app/partners/itsco`. Public directory: `/schoolcarebridge/partners`, or `/partners` on the future domain. Partners is also an editable marketing content-page slug.

A connected agency retains its full workspace. Creating a standalone tenant adds an agency with `feature_flags.schoolCareBridgeOnly=true`, its existing administrator membership and a program partner record. Its dashboard and APIs are restricted to school/client/provider/document/communication/account workflows. The product scope narrows authorization; school access and client ROI checks still run in the existing controllers. Adding a school creates one school record and affiliation, with no automatic staff or student access. Existing schools must be linked through established organization administration to avoid duplicates. Public partner listing never creates a clinical affiliation or membership.

The standard draft uses monthly billing per active school portal and 30 days’ written cancellation notice. ITSCO’s introductory SchoolCareBridge program fee is $0 for **October 1, 2026–March 31, 2027 inclusive**. Post-trial pricing is unset; signing does not authorize automatic paid conversion, invoices or collection. MH4Kidz remains the program operator and revenue recipient; Plot Twist Co’s platform invoice relationship remains separate. Existing agency charges are not reassigned.

The agreement starts unsigned. Save changes with revision checks, review the rendered text, then select two different active administrator representatives of ITSCO and MH4Kidz. MH4Kidz must first have its authorized administrator assigned through existing account administration. Issuance checks organization memberships, revision and the hash of the reviewed text; creates two signature documents/tasks atomically; and preserves the issued text and hash. Only existing signed-PDF records for both assigned representatives produce “Signed by both parties.” Each representative signs from their own account through the existing document workflow. There is no automatic email, signature, payment request or invoice. Issued agreements cannot be edited here; amendments require separate documents.

Operational checks: open the ITSCO logo on Partners; enter the partner workspace; check school roster/provider links, concise settings, and agreement visibility. A provider must not see administration/signature-assignment controls. A standalone administrator must not be able to use payroll or expand its own product flags. An ITSCO administrator retains existing workspace access. Validate all active affiliated-agency branding independently of public directory listing.

Additional verification:

```
npm --prefix frontend test -- src/utils/__tests__/schoolCareBridgeTenant.test.js
node frontend/scripts/verify-schoolcarebridge-partners.mjs
```

The partner browser checks use synthetic API data. SQL validation was also performed against a disposable local MySQL schema copied as table definitions only: migration replay, ITSCO draft seeding, identical signature counterparts, repeated-issuance rejection and school creation. No student records were copied. The agreement workflow is an implementation of the parties’ requested draft terms, not a determination of legal enforceability.

Release validation (2026-09-28): 44 focused backend tests and 52 frontend routing/editing tests passed, along with both browser scripts and the production frontend build. Migration 1505 was applied successfully to the configured app database. The existing MH4Kidz operator is linked; its authorized administrator membership still needs assignment before signatures can be issued. ITSCO is seeded as the sole public partner and its agreement remains a draft.

Standalone SchoolCareBridge tenants are explicitly skipped by the existing monthly billing job and rejected by the central invoice generator before usage/ledger/PDF/payment work. Connected agencies retain their existing invoices. Partner signature and first-password-change routes reuse existing workflow components under `/app/partners/{agency}/…`, including expired-session return destinations.

## Product family and existing school workspace branding (October 2026)

Plot Twist HQ, AuricWell and SchoolCareBridge are presented as Plot Twist Co. products at `https://plottwistco.com/products`. Product ownership is distinct from the MH4Kidz program-operator relationship and the affiliated treating agencies. This release does not revise agreements, billing recipients, agency memberships or student access.

The existing school portal, school sign-in, portal hub, school overview/all portals and digital-intake workspace use SchoolCareBridge presentation. School and agency names remain visible. Existing ITSCO school URLs and authentication continue to work; there is no account or record migration. Program and learning organization views retain their existing presentation.

The website uses captures of the actual Vue school portal and agency overview, with an embedded working demo at `/schoolcarebridge/demo` (native `/demo` on the prepared SchoolCareBridge domain). The demo reuses `SchoolPortalView` and `SchoolOverviewDashboard`, including provider profiles, school schedules and student details. Its providers, students and organizations are fictional fixtures owned by this repository. It never reads the existing database-backed onboarding demo or production student records.

The demo is a separate HTML document with its own Pinia stores, router and in-memory storage installed before shared modules load. Its Axios adapter resolves only fictional reads and rejects writes/unknown reads locally. A document CSP additionally disables API/fetch connections, child frames and form submission. Stylesheets and fonts allow the Google Fonts hosts already used by the shared portal CSS; other external scripts (including the unused payment library) remain blocked. Existing app credentials/preferences remain unchanged. The banner and inline feedback explain that messages, scheduling changes and other writes are not saved. Captures in `frontend/public/assets/schoolcarebridge/examples/` were produced from this working interface; they are not invented screen layouts.

Verification without Docker (local Vite with `VITE_API_URL=/api`, port 5181):

```
node frontend/scripts/verify-schoolcarebridge-products.mjs
node frontend/scripts/verify-product-family.mjs
SCB_VERIFY_BASE=http://127.0.0.1:5181 SCB_BROWSER_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node frontend/scripts/verify-schoolcarebridge.mjs
node frontend/scripts/verify-ptco-showcase.mjs
npm --prefix frontend test -- src/schoolcarebridge/demo/__tests__/fixtures.test.js src/composables/__tests__/useSchoolCareBridgeBranding.test.js src/utils/__tests__/schoolCareBridge.test.js src/utils/__tests__/schoolCareBridgeTenant.test.js src/utils/__tests__/publicBrowserBranding.test.js src/utils/__tests__/publicDomainRouting.test.js
```

The product-demo browser check accepts `SCB_PRODUCT_BASE` for read-only live verification. It blocks every API request and checks that none occur; it also verifies same-tab sign-in storage isolation, blocked writes, provider/student navigation, the overview → all portals → school flow, and layouts at 320–1440px. The family-page check supplies synthetic website API responses and verifies the three products and the embedded portal. Production build outputs include a dedicated `schoolcarebridge-demo.html` entry, served with no-store/noindex on Nginx and the Node preview server.

Release verification: 68 focused frontend tests passed; existing school login/access and Plot Twist Co. showcase browser checks passed. The product-family/embedded-demo check and full fictional-demo interaction, mobile and storage-isolation checks passed. The production frontend build completed without Docker.

## October 5 domain launch

The public domain is `https://schoolcarebridge.org`; the owner forwards `.com` to `.org` and manages load-balancer and certificate provisioning. Route the domain to the existing frontend and `/api/*` and `/uploads/*` to the backend. Keep the MH4Kidz `/schoolcarebridge` paths available until HTTPS validates. Public pages identify `.org` as canonical. Existing ITSCO school login links are unchanged.

School completion welcomes include the SchoolCareBridge logo, network byline, MH4Kidz attribution, and secondary public-site link. The primary portal link and Technology reply address remain unchanged. Keller’s welcome requires user approval and working domain HTTPS before sending; the prior issue-resolution email has already been sent.
