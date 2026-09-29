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

Browser verification uses synthetic API responses, not live school/student data. Production migrations, DNS, certificates, load-balancer changes, actual Google consent, and real billing connections require deployment validation. No production mutations or financial transactions were performed during implementation.

For the browser suite, start Vite with `VITE_API_URL=/api npm --prefix frontend run dev -- --host 127.0.0.1 --port 5178`, then run `node frontend/scripts/verify-schoolcarebridge.mjs`. Set `SCB_BROWSER_EXECUTABLE` if using an installed Chrome instead of Playwright's bundled browser. The script intercepts API calls and forwards its synthetic future-domain navigation to local Vite. It covers desktop/mobile pages, login discovery, recovery, multiple memberships, agency selection, the shared portal and roster, access denial, session expiry, and the Google return destination. Actual OAuth consent and message delivery are not simulated as successful transactions.

The broader public-website regression run has two existing Mental Range provider-filter/availability test failures, reproduced against the unchanged repository baseline. SchoolCareBridge, routing, editing, and password-recovery focused checks pass.
