# Plot Twist Co. public website and company onboarding

## Public experience

The site lives at `/p/ptco`, with `/about`, `/services`, `/hq`, `/industries`, `/resources`, and `/start` beneath it. The supplied mockups guide the burgundy/cream palette, serif headings, illustrated hero bands, service and industry cards, and intake layout. Layouts use fluid gutters and responsive grids.

`assets/plottwistcowebsiteassets` contains the original supplied artwork. Optimized browser assets are in `frontend/public/assets/ptco`; `manifest.json` maps every output to its source. The flat logo is used for navigation and the default platform mark. The shaded version is used in the public footer. Existing tenant-specific logo configuration is preserved.

The HQ page has an interactive workflow walkthrough; the laptop illustration is explicitly identified as a preview. There are no invented customer testimonials, live metrics, newsletter submissions, or booked appointments. Calls to action open business intake. Partnership scope and pricing are discussed before commitment.

The public marketing editor supports PTCO preview, logo and home hero changes, and preserves the PTCO template on save. Home hero title/subtitle and matching subpage hero fields are honored. The designed section structure lives in Vue/CSS and the PTCO content catalog, rather than a general drag-and-drop page schema.

## Company intake → review → account activation

1. The company completes three steps at `/p/ptco/start`: business/contact information, support needs, and review/consent. Failed requests remain on the review step and retries reuse the submission reference.
2. A platform administrator opens **Settings → Platform → New company requests** (`/admin/settings?category=platform&item=business-onboarding`). The queue shows the latest 200 requests and supports text/status filtering.
3. The administrator verifies the business and owner, chooses an available company slug, then creates an invitation. The email checkbox is explicit and off by default. Approval does not itself provision a tenant.
4. The owner receives a seven-day invitation, creates a password, and confirms authority to administer the company. Activation creates the root company, owner account, and membership in one database transaction. The consumed token cannot be reused.
5. The owner signs in and lands in **Company workspace**, with links to identity, services, features, team access, company billing, and affiliated organizations. No subscriptions, charges, paid features, or client data are created by activation.

Existing email/username accounts are not promoted or reassigned by public onboarding. The queue explains that these owners must be connected through existing administrator-managed tenant/membership tools. If an invitation expires or its company slug becomes unavailable, a platform administrator can replace it; the previous invitation is invalidated.

Email delivery uses the configured platform email service and its existing sender, approval, opt-out, and test redirection policies. The review UI distinguishes sent, pending approval, blocked/not sent, redirected, failed, and not requested. Copying the owner invitation is available after approval. No live invitation was sent during development.

## Security and tenant scope

- Business contact details and goals use the existing intake AES-GCM key ring, with the request identifier checked inside the authenticated envelope. Keys are never returned to the browser. Preserve `INTAKE_RESPONSES_ENCRYPTION_*` configuration and prior keys.
- Public intake accepts only validated business fields, has rate limiting and a honeypot, and cannot choose a role, existing tenant id, organization type, or affiliation.
- Public submission responses contain a reference, not a way to retrieve private details. Administrative reads and approvals require an authenticated superadmin.
- Invitation tokens are random 256-bit values; only SHA-256 digests are stored. Links carry tokens in the URL fragment, which is removed from the browser address after capture. API inspection/activation sends tokens in POST bodies. Responses use `Cache-Control: no-store`.
- Owner passwords are hashed with bcrypt. Activation checks expiry/status under a row lock and atomically writes the company, owner, membership, consumed invitation, and audit event. Duplicate requests cannot create duplicate workspaces.
- Company pickers recognize agency, clubwebapp, life_coach, and consultant as root types. Schools, programs, offices, learning/clinical organizations, affiliations, and unconfirmed types are not selectable as company workspaces.
- The organization directory’s Tenants view now contains tenants only. Affiliated organizations remain in their corresponding views. This is a focused settings/directory correction, not a claim that every organization selector across the application has been audited.

## Deployment

Main database migration **1421_ptco_business_onboarding.sql** creates the request/event tables and seeds `/p/ptco` only if it does not already exist. It does not overwrite existing publication or branding choices. Bootstrap normally runs pending main migrations. If applying explicitly in the established migration environment:

```sh
npm --prefix backend run migrate -- --migration=1421
```

The backend needs the existing intake encryption key and the existing email sender configuration. No new family billing key is required. Verify the public application URL used by email (`PUBLIC_APP_URL` or the existing supported public URL configuration). Localhost values are not used for outbound invitations.

Before announcing signup availability, verify the deployed site and migration, submit a controlled business request, review it, and test an invitation to an authorized test mailbox through the configured email service. This development session did not create live companies, apply the new migration to production, send mail, or certify deployment completion.

## Verification

- Browser review: seven pages × nine viewport widths (320–3440px), images, mobile navigation, keyboard Escape, HQ workflow selection, and FAQ expansion.
- Browser intake checks use synthetic API responses; backend persistence and provisioning are independently exercised against disposable MySQL.
- Frontend tests cover submission/retry, preview protection, invitation activation UI, organization classification, tenant/school separation, stale responses, settings search, and editor template preservation.
- MySQL tests cover migration reruns, encrypted request round trips, idempotency conflicts, token rotation/expiry/revocation, concurrent activation, existing-owner/slug protection, and full rollback on membership failure.
- A read-only schema check confirmed all required activation columns exist in the configured application's agencies, users, and user_agencies tables. It did not inspect their records.

```sh
npm --prefix frontend test -- src/components/ptco/__tests__/PtcoBusinessIntake.test.js src/components/admin/__tests__/CompanyWorkspace.test.js src/navigation/__tests__/organizationKinds.test.js src/navigation/__tests__/settingsSearchCatalog.test.js src/views/admin/__tests__/PublicMarketingPagesAdminView.test.js
node --test backend/src/services/__tests__/businessOnboarding.test.js
# Optional integration test, ONLY against a disposable localhost MySQL test server:
PTCO_TEST_MYSQL_PORT=33318 PTCO_TEST_MYSQL_PASSWORD=synthetic-only node --test backend/src/services/__tests__/businessOnboarding.test.js
```
