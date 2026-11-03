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

## ITSCO school partnership guide

The **For Schools** page (`/p/itsco/schools` in the app, `/schools` on
`www.itsco.health`) offers the four-page **School Partnership Guide** at
`/assets/itsco/ITSCO-School-Partnership-Guide.pdf`. This is the partnership
introduction, not the separate At a Glance fact sheet.

Authorized ITSCO admins/support and platform admins can sign in on the app
host, open **For Schools → Analytics mode → Page stats**, and select the date
range. **Document views** counts uses of **View the guide**; **Download requests**
counts uses of **Download PDF**. These actions also contribute to button/link
click totals. Filter activity type or select the guide's area badge to isolate
this document; filtered reports can be exported as CSV.

These are button activations, not proof of reading or completed file saves.
Direct PDF URLs, browser context-menu actions, and the PDF viewer's own save
button bypass website tracking. Existing guest-only collection, access controls,
anonymous browser estimates, deduplication, and retention rules also apply.
No historical document counts are reconstructed. Migration 1491 adds the two
explicit event kinds (`document_view`, `document_download`) to the existing enum.

## AuricWell website and fictional demo

Migration **1734** registers `auricwell` as an inactive, reporting-only
`analytics_only` page without a tenant source, and adds bounded `duration_ms` values plus `page_time` and
`section_time` event kinds. Its reports are available only to platform
superadmins. Sign in on the main app domain and open
`/admin/website-analytics/auricwell`. The report starts with all website pages. Its
**Where visitors spend the longest** table ranks aggregate active viewing time;
the activity table can also sort by **Longest active time**. The table shows
total active time and average time per distinct anonymous browser. CSV exports include
visible active seconds. The protected API is `/api/website-analytics/auricwell`.
The generic public marketing endpoints do not render `analytics_only` records,
even if someone later changes their active flag. Ingestion allows this exact
reporting registration without publishing a generic website or tenant data.

The collector covers all five static marketing pages and the public working
demo, including same-origin demo embeds. Actual public URLs are normalized to
`/p/auricwell`, `/p/auricwell/product`, `/p/auricwell/security`,
`/p/auricwell/about`, `/p/auricwell/contact`, and
`/p/auricwell/demo/{overview,appointments,clients,documentation,billing,providers,reports}`.
Changing a client, note or query within a demo screen does not add a page view.
Demo clicks use a fixed action catalog; unknown controls receive a generic
label. Names, chart IDs, note text, arbitrary button text and search contents do
not enter demo event payloads. Editable field values are never observed.

Viewing time stops when the tab is hidden or unfocused, the embedded demo is
outside its parent's viewport, or there has been no pointer, keyboard, touch or
scroll interaction for 60 seconds. A heartbeat sends at most one page-time
segment and eight major area-time segments every 15 seconds, with final time
flushed on navigation/teardown. Individual durations are restricted to 1–60,000
milliseconds by the backend. Sections may be visible together, so section times
overlap; page totals count only page-time events. These are estimates of visible
activity, not proof of attention, reading or workflow completion.

DNT and Global Privacy Control suppress AuricWell collection and creation of a
browser identifier. The demo reads only the presence of sign-in storage before
isolating application storage, so it can exclude signed-in visitors without
copying account data into analytics. Its transport permits only POST requests to
the same-origin public analytics ingestion endpoint, omits credentials and
referrers, and refuses redirects. The public demo has no clinical API access.
The static website sends cookies only to its own ingestion URL so the backend
can independently exclude authenticated requests.

No earlier engagement history is reconstructed. Time data appears only after
the migration and collector are deployed and eligible visitors use the website.
The focused frontend analytics suites and backend website analytics suite cover
duration, visibility, idle behavior, fixed demo labels, opt-outs and aggregate
query boundaries. The disposable MySQL harness also exercises migration reruns
and stored duration reports; run it only against the documented test database.
