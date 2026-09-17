# Public website, provider and referral updates — September 17, 2026

## Behavior

- Public `/p/{slug}` pages restore the existing authenticated session for authorized editing. The public-site footer links to the matching app-host editing page. No tokens or cookies are copied between domains. Provider profile changes use protected APIs.
- NLU renders published provider profiles before requesting calendars, and keeps profiles visible if availability fails. Kimi's existing NLU tutor profile is published with migration 1460; the migration preserves her intake preference.
- Provider cards use left-hand portraits with at most three columns. ITSCO mobile hero text no longer overlays the photo; floating controls respect the safe area. TISI audience headings have readable contrast, and Contact renders its contact form. Generic Super Admin is excluded from ITSCO's public team.
- Each Resources menu links to the shared Referral Network in a new tab and excludes its own organization from Partners. PlotTwistCo is included. Shared directory data combines approved, active ITSCO referrals with managed public organizations and excludes internal notes and personal contact information. Mental Range partner links use current canonical website URLs.
- Provider or authorized staff can manage global intake and in-person/virtual choices under Public Provider Profile. Missing openings in the next four schedule weeks create one assigned task and notification per agency/format. Notification snooze also suppresses the account banner for seven days, while settings retain the warning. Published openings resolve the reminder. Existing reserved/held times do not count as openings.
- Booked office reservations without a linked clinical or learning session display “No session.” Manual reservations remain valid.

## Validation

Production frontend build passed with `VITE_API_URL=/api`. Focused frontend/backend suites passed, including delayed/failed calendars, session restoration, reminder deduplication/resolution, snooze preservation, and referral filtering. Browser checks covered ITSCO mobile and directory, NLU resources and directory, TISI contact and boys page, the shared referral page, and authenticated `/p/itsco` editing. Browser fixtures do not prove a user's live login session.

The older `ItscoWebsite.test.js` suite has the same three failures on the unchanged baseline and this patch: a stale directory sort expectation and two support-form expectations. These failures are not introduced by this release.

Migrations 1460 and 1461 were applied to the configured `onboarding_stage` database and read back successfully. The live shared-directory query returned 20 organizations. The scheduler query was validated without generating synthetic tasks or notifications.

## Deployment

Use the manually dispatched **Deploy tested public-site fixes** workflow (`deploy-public-site-fixes.yml`). It uses the existing GitHub Google Cloud credential, builds both images, preserves runtime settings and Secret Manager bindings, deploys without traffic, verifies both candidates, then promotes their exact revisions. It does not edit DNS, load balancer routing, app/QV host rules, or IAM.

The commit uses `[skip ci]` because the older automatic backend workflow still contains a separate `--remove-secrets` update. The pending local security work includes a replacement for that workflow and remains outside this release. The manual workflow avoids that intermediate removal of runtime credentials.
