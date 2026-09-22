# Shared public website snapshots

Public discovery reuses a database-backed snapshot across application instances.
The cache stores public directory DTOs and public opening times only. It does not
store busy-calendar events, client records, session credentials, or inquiry data.

Provider weeks are keyed by agency, provider, Monday date and intake/session mode.
Office, virtual and day/time filters reuse those weeks. ITSCO website data, public
website partners, and the Mental Range provider directory also share snapshots.
Publication/agency eligibility checks still run before serving directory data.

Snapshots expire after 60 seconds. A database lease permits one refresh per key;
other instances wait for that result, and each caller gets an independent copy.
Refresh errors are not cached as an empty directory or empty availability.
An expired lease can be reclaimed after 90 seconds; waiting requests stop after
55 seconds instead of launching duplicate calendar calculations.

Migration `1476_shared_public_snapshots.sql` creates one cache table and source
table invalidation triggers. Relevant source edits remove snapshots and leases in
the same transaction, so rollback preserves existing snapshots. Provider edits and
holds invalidate that provider across agencies; shared office/agency configuration
invalidates all affected public snapshots conservatively. The office event trigger
ignores no-op materialization, and the user trigger ignores login/session-only
changes. A refresh that loses its lease to an edit discards its result and retries.
Expired entries older than a day are cleaned up in bounded batches.

Booking requests retain their direct live schedule calculation. The hold flow,
which internally reuses the provider-detail reader, passes a server-only flag to
bypass snapshots before accepting a time. Public query parameters cannot set it.

The frontend hydrates recent public session data synchronously. Without a recent
snapshot it renders the requested page's real heading and navigation immediately,
using stationary profile-card placeholders only where provider data is pending.
It does not show the former standalone “Loading ITSCO…” screen or false empty
directory results. Refresh failures retain already displayed data; a publication
404 removes it.

## Verification

- Backend public provider/authorization/scheduling regression suite, including an
  actual hold-controller test proving the live-validation flag is passed.
- Node cache tests: separate instances, concurrent visitors, expiry, agency
  isolation, invalidation during refresh, errors and bounded waiting.
- Isolated MySQL 8 test: migration applies twice, all 87 triggers execute, 24
  concurrent readers calculate once, cross-agency holds invalidate both snapshots,
  rollback preserves snapshots, no-op office updates preserve snapshots, and an
  edit during refresh prevents stale publication.
- Frontend tests cover first-visit content before the request resolves, immediate
  session hydration, cache expiry, provider search and preview rendering.
- Production frontend build succeeds.

Run the isolated SQL test with a dedicated temporary local server (never the shared
application database):

```sh
PUBLIC_SNAPSHOT_TEST_SOCKET=/private/tmp/public-snapshot-verified-mysql8/mysql.sock \
  node --test backend/src/services/__tests__/publicSnapshot.mysql.test.js
```

## Rollout

Apply migration 1476 through the normal approved migration workflow before enabling
the new backend. A short missing-table fallback supports rolling deployment; it
does not create schema from a public request. `PUBLIC_READ_CACHE_ENABLED=0` disables
snapshot use if needed. Invalidation triggers only delete cache records; they do
not change source profiles, bookings, holds or clinical data.

Migration 1476 is recorded as successful in the shared database, and the cache
table and all 87 trigger names were verified against it. Desktop/mobile browser
checks passed with delayed first-visit data, provider filters, inquiry context,
Collective navigation and no page errors. A real public-data service check returned
39 providers from one shared snapshot: initial build 10,149 ms, repeat read 388 ms
(including Cloud SQL proxy/network latency).
