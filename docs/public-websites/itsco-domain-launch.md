# ITSCO public-domain migration preparation

Prepared September 13, 2026. DNS and cloud configuration have NOT been changed.

## Domain layout

- `https://www.itsco.health/` is the canonical website, matching the existing site's canonical tag and sitemap. `https://itsco.health/` redirects here.
- Website routes: `/`, `/services`, `/providers`, `/schools`, `/about`, `/growth`, `/impact`, `/team`, `/insurance`, `/resources`, `/contact`.
- Careers: `/careers` and `/careers/jobs/:jobId` retain the existing careers components and tenant parameters.
- `/app` redirects to `https://app.itsco.health/itsco/login`. Portal header/footer links use that app host.
- `app.itsco.health` and **all `qv.app.itsco.health` paths remain unchanged**. Do not replace the ITSCO agency's existing app custom domain in the database.
- Only the two exact public hosts enable the address adapter. Existing `/p/itsco` URLs on the public domain permanently redirect to their clean equivalents. They remain available on the app host until launch is verified.

Production uses Nginx. The build generates an additional exact-host Nginx server configuration and page-specific HTML shells with metadata, copied by the Dockerfile. The existing default app/QV server remains in place. `frontend/server.js` also handles these public routes for Node-based previews.

The Vue Router history adapter translates browser URLs to the existing internal routes. This retains route parameters, careers tenancy, analytics page identity, translation behavior, and component links while exposing clean browser addresses and router-link hrefs. Browser back/forward and direct loading are tested. Analytics intentionally continues aggregating under the existing `/p/itsco/...` page keys to preserve report continuity.

## Existing URLs and SEO baseline

The current Wix sitemap advertises 64 URLs. `itsco-existing-urls-2026-09-13.json` is the discovery snapshot; `itsco-url-migration.csv` identifies preserved routes, prepared redirects, and unresolved destinations. This is a URL inventory, not evidence of rankings or traffic.

To obtain a traffic baseline: open Google Search Console, select/add a Domain property for `itsco.health`, verify its DNS TXT record, and open Performance → Search results. Select the longest available date range and export both Queries and Pages with clicks, impressions, CTR, and average position. If Search Console was never configured, historical data may not be available. Also check Indexing → Pages and Links. Do not infer ranking strength from a `site:` search alone.

Prepared redirects cover obvious equivalents only. Individual clinicians, three blog posts, crisis information, FAQs, skills programs, the old job description, and ambiguous Wix paths still need their content or a specific relevant destination. Do not blanket-redirect these to the homepage. The new server returns 404 for unavailable public paths; **do not cut over until this inventory is resolved**.

## One load balancer for multiple brands

A Google external Application Load Balancer can serve multiple exact hostnames with certificates covering each hostname. Each brand still needs its own application hostname mapping. This change prepares ITSCO only; it does not enable apex-domain routing for the other brands.

Merge the following into the existing load balancer configuration; do not replace its current URL map:

| Hosts | Path | Backend |
| --- | --- | --- |
| `itsco.health`, `www.itsco.health` | `/api`, `/api/*` | Existing application API backend |
| `itsco.health`, `www.itsco.health` | All remaining paths | Existing frontend backend (`onboarding-frontend` Cloud Run service) |
| Existing app and Quick View hosts | Existing paths | Preserve existing rules |

The frontend build uses `VITE_API_URL=/api`, so API routing is required. Use the existing serverless NEGs/backend services; do not rewrite `/` to `/p/itsco` at the load balancer. Preserve the original Host header. Certificate coverage must include apex AND www. Preserve email MX/TXT records and all app/QV DNS records. Review any existing AAAA records as well as A/CNAME records.

The local gcloud configuration points to `ptonboard-dev`. Read-only inspection could not list URL maps because the active account lacks `compute.urlMaps.list`. Consequently actual load balancer names, certificates, IP addresses, and existing host rules were not verified. Obtain the correct project/account or a URL-map export before preparing a concrete cloud update.

## Verification and remaining launch work

Implemented: clean routes, legacy redirects listed in code/CSV, public-host canonical metadata, static sitemap, robots endpoint, unknown-page 404s, and noindex for enrollment/filter URLs. Existing application and QV hosts are excluded.

Still required before DNS switch:

1. Resolve remaining inventoried URLs, particularly individual provider profiles and blog content.
2. Add prerendering/server rendering for the public page content. The current implementation still serves a Vue app shell; metadata alone is not full server rendering. Add individual profile/job metadata and sitemap entries when those clean detail pages are finalized.
3. Verify production data, forms, cookies/authenticated public-page editing, Spanish, analytics, and enrollment using the public hostname through the planned load balancer. An app-host login does not automatically guarantee the public-host session is established; retain the existing app entry for staff tools until verified.
4. Test the updated URL map without applying it, provision/verify HTTPS, and test with a host override before switching public DNS. Keep old hosting available for rollback.
5. Switch only apex/www website records, then inspect Search Console live URLs and submit `/sitemap.xml`. Keep permanent redirects operational and monitor crawl errors/traffic.

Do not submit a Search Console Change of Address solely for changing hosting while retaining the same canonical domain.

## Validation completed

- Production build passed with the existing CI heap setting (`NODE_OPTIONS=--max-old-space-size=8192`).
- 39 focused tests passed: public hostname routing/history/metadata, existing share previews, analytics, and ITSCO directory behavior.
- Generated production Nginx configuration passed `nginx -t` in the existing local frontend image.
- 12 HTTP scenarios passed against local Nginx: public page metadata, legacy redirects, sitemap, 404/noindex, app shortcut, and unchanged app/QV host responses.
- Browser checks against Nginx with synthetic API responses passed: clean links, page navigation and metadata, careers agency selection, back/reload, and direct job loading. These do not establish production API/data readiness.
