# Public website analytics

Analytics is shared by every `/p/` marketing website: ITSCO, Inner Strength, Rise Revive, Plot Twist Co., MH4Kidz, Mental Range, and the generic marketing hub/subpage templates. It does not instrument private app pages or enrollment forms.

## Using the reports

Sign in on the website's app domain. Authorized staff see **Analytics mode** at the bottom left. Turn it on to see stats badges on visible sections, cards, navigation links, buttons, and filters. Badges avoid covering interactive controls; crowded areas are also accessible through **Page stats** and the report table. Click a badge to inspect that area and its contents.

The report supports today's activity, the last 7/30 days, custom UTC dates (up to 90 days), one page or all pages on the website, area drill-downs, search, event-type filtering, sorting, pagination, and CSV export of all matching rows. It includes daily activity and page-view breakdowns by device, language, and arrival channel. Search/sort/export operate on aggregate rows, never individual visitor histories.

- Superadmins can inspect all published website records, including standalone sites such as Mental Range.
- Tenant admins/support require active membership in the single root agency attached to the marketing page. Tenant-scoped membership roles override the global role.
- Clients, school/affiliated-organization staff, other tenants, demo sessions, and marketing preview iframes do not receive the analytics interface. Mixed-source and unassigned pages are superadmin-only.
- The server independently authorizes every access check and report. Hiding the interface is not the authorization boundary.

## Counts and privacy

The first-party collector records page views, section/card impressions, clicks, profile opens, filter uses, searches, and scroll-depth milestones. A section impression requires at least one second with half of the section, or half the viewport height, visible. Each section is counted at most once per page navigation. Profile detail toggles count opening separately from closing.

A page view counts a pathname navigation after public content appears; changing a provider/filter query does not add another page view. Public provider/team cards and school/partner links have stable identifiers so changing display order does not attribute one person's engagement to someone else. A profile link records an open action, not confirmation that a subsequent enrollment or appointment occurred.

“Anonymous browsers” is an estimate from a first-party browser identifier with a 30-day lifetime. Clearing/blocking browser storage, using another device, and identifier expiry change the estimate; this is not a count of identified people. The database stores a site-specific HMAC, not the raw browser identifier. It does not store account IDs, IP addresses, form values, search terms, raw referrer URLs, destination URLs, or query strings. Only the search/filter control's usage is recorded. Public labels and public provider identifiers identify the page area.

Logged-in traffic, embedded previews, and known bot user agents are excluded. Anonymous requests are rate-limited. Server timestamps and unique event IDs prevent a retried batch from doubling the counts. Collection failures do not interrupt the public website. Reports show errors rather than fabricated zero totals if the API fails. CSV exports neutralize spreadsheet formulas in public labels.

The collector prunes events older than 120 days in indexed batches whenever new traffic arrives. Quiet installations may retain older rows until collection resumes. Reports have a maximum 90-day window. No historical traffic is invented or backfilled; data begins after deployment.

## Deployment

Migration **1433** creates `public_website_analytics_events` in the main application database. The existing Cloud Run bootstrap applies pending migrations. For a local database, use:

```sh
npm --prefix backend run migrate-one -- --migration=1433
```

No analytics vendor account or additional secret is required. The existing server JWT secret supplies HMAC key material; rotating it also changes anonymous browser hashes. This implementation was verified against synthetic fixtures in a disposable database, not by mutating production data.

Public event ingestion:
`POST /api/public/marketing-pages/:slug/analytics/events`

Protected access and aggregate reports:
`GET /api/website-analytics/:slug/access`
`GET /api/website-analytics/:slug?start=YYYY-MM-DD&end=YYYY-MM-DD&page=/p/slug&target=page/area`

Protected reports deliberately live outside `/api/public`, whose authentication middleware skips ordinary public routes. Reports send `Cache-Control: no-store`.

## Verification

```sh
npm --prefix frontend test -- src/utils/__tests__/publicWebsiteAnalytics.test.js src/components/public/__tests__/PublicWebsiteAnalytics.test.js src/components/itsco/__tests__/ItscoWebsite.test.js
```

Disposable integration database only (never use an application database):

```sh
docker run --rm -d --name pt-analytics-test -e MYSQL_ROOT_PASSWORD=synthetic-analytics-test -p 127.0.0.1:33323:3306 mysql:8.4
# Once MySQL is ready:
node database/tests/public-website-analytics.mjs
docker stop pt-analytics-test
```

The integration suite checks migration idempotency, tenant and role isolation, mixed-source authorization, published-page gating, deduplication, aggregate totals, date validation, literal area-prefix matching, payload validation, and retention. Browser verification covers all six branded websites, guest collection, unauthorized-client exclusion, staff reports, area drill-downs, search/sort/filter/export, and layouts from 320 to 2048 pixels with synthetic API responses.
