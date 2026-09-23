# Latinx Therapist Project CO directory

This directory is independent of hiring, employment status, payroll, client records, and Mental Range agency membership.

## Entry points

- Public finder: `https://plottwisthq.com/latinx`
- New provider enrollment: `https://plottwisthq.com/latinx/join`
- Provider or directory-admin dashboard: `https://plottwisthq.com/latinx/dashboard`
- Owning company website: `https://latinxtherapistproject.org/`
- Platform administration: **Users → Provider onboarding → Latinx Therapist Project CO → Open review dashboard**.

Migration `1482_provider_directory_enrollment.sql` reuses an agency with the supplied company name or `latinx-therapist-project-co` slug, or creates that tenant if absent. It binds `/latinx` to that tenant. It does not move clinicians from other tenants, enroll employees, invent administrator accounts, or add synthetic listings.

An existing administrator of that tenant (or a platform superadmin) opens the review dashboard through Users to activate their directory admin identity. Set a directory password there to use the public page's username/password login afterward. Administrator authorization is rechecked against the owning tenant on every authenticated directory request. Assign real tenant administrators through the existing agency/user administration flow.

## Provider enrollment

1. Create a username, password and private account email; verify the email using the emailed link.
2. Save a profile through six steps: basic information, licenses/locations, clinical specialties, insurance/availability, biography/photo, and review/consent.
3. Submit for review. The directory administrator reviews credentials and contact details, then approves, requests changes, declines or suspends the listing.
4. Approved profiles appear in national search. Providers may update their own profile and submit another revision. The last approved snapshot stays public during editing/review; withdrawal, rejection and suspension remove publication immediately.

Heritage is a private self-identification used for Latinx eligibility. It is not inferred from names, photos, language or populations served. Existing platform providers can explicitly request inclusion from the demographics area of Profile Info. The stored membership `opt_in` is the boolean preference. It does not publish a profile until the provider completes enrollment and an administrator approves it.

Public contact fields are separate from the login email. Account email, license numbers/expiration, heritage and review notes are never returned in public finder results. A photo is a public asset when uploaded; the form explains this before upload.

## Security and configuration

- Directory identities and opaque, hashed, expiring sessions are stored in separate tables. They do not issue platform JWTs or grant clinical, HR, or cross-tenant access.
- Passwords use bcrypt; verification/reset tokens are hashed, single-use, one-hour tokens. Directory sessions expire after eight hours; password changes revoke prior sessions.
- Directory admin accounts stay linked to an active platform tenant admin. Registration cannot request an admin role.
- Email delivery uses the existing agency-aware EmailService. Configure a working sender and allowed notifications for the new tenant before external enrollment testing. No real emails are sent by the regression tests.
- Review updates use a transaction and revision checks. Stale reviews cannot publish a changed draft.
- The directory routes are excluded from request-body logging and return `Cache-Control: no-store`.
- Generic directories can also be created from Users for a selected agency, with URLs under `/provider-directory/:slug`. Latinx heritage gating is specific to the seeded Latinx portal.

The New provider button supports hover/focus QR sharing. QR sheets can target either the finder or enrollment. PDF generation runs in the browser without an external QR service.

## Validation

`frontend/node_modules/.bin/vitest run --config backend/vitest.directory.config.js`

`node database/tests/provider-directory.mjs` requires the explicitly isolated Unix-socket test server described in that script. It never connects to application credentials.

Browser acceptance: finder/search; responsive layout; QR target and PDF; account creation; draft save; review submission; provider/private-data separation; directory-admin review. Build the frontend with the normal Vite build. The shared clinical taxonomy supplies specialties, client ages, populations served and approaches.
