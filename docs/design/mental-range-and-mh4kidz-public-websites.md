# Mental Range Collective and MH4Kidz public websites

Mental Range Collective is an independent public network at `https://plottwisthq.com/p/range`. No agency, tenant, client account, or staff account is created for it. MH4Kidz is independently published at `https://app.mh4kidz.com/p/mh4kidz`; its tenant can be onboarded later.

## Publication and configuration

Apply main-database migrations **1427_mh4kidz_public_website.sql** and **1428_mental_range_collective.sql** through the normal migration process, and deploy both backend and frontend. These were tested against disposable MySQL 8.4 with synthetic records; production migrations and domain deployment were not performed in this development session. The deployment CORS configuration already includes both requested hosts.

Public Marketing Pages has desktop/tablet/mobile design preview, image selection/cropping, editable home hero/logo, and connection fields for both websites. Blank enrollment, donation, partnership, and contact destinations render explicit Coming soon states. No pretend payment or inquiry forms are rendered. Publishing status is respected by both the website and the collective directory APIs. Preview messages require the same origin and parent frame.

Range pages: Home, About, Our Network, Find Support, Our Impact, Resources, Get Involved, Contact. MH4Kidz pages: Home, About, Our Programs, Unplugged, Impact, Resources, Get Involved, Enrollment, Donate, Contact. Program links lead to real content sections. Unknown sections render a not-found state.

## Collective membership

A superadmin can open **tenant settings → General → Mental Range Collective**, select **Included in Mental Range Collective**, edit the public description, audience, focus, category tags, website/contact destinations, and save membership separately. The endpoint also enforces superadmin authorization; ordinary agency edits cannot change membership.

The seed includes existing active tenant types recognized by the app (`agency`, `life_coach`, `consultant`, `clubwebapp`), excluding demos and Burning Sage. Schools, learning/program organizations, clinical affiliates, and affiliated clubs are not tenants for this purpose. Archived/inactive organizations are never published. Reruns preserve saved membership choices and descriptions. Newly onboarded tenants start without a membership and can be enabled by a superadmin.

Partner names and logos come from actual organizations. Partner categories and public details can be refined in the membership editor. Existing public website links are seeded only when an active marketing page has the exact same slug. Other destinations stay blank until configured; no login portal is passed off as a public website. A consulting/business-support organization may be a partner, but consulting providers are excluded from the care directory.

## Provider directory and availability

A listing requires all of:

- Included, active, non-archived eligible tenant with public booking enabled.
- Active provider public service enrollment in **counseling, tutoring, or coaching**.
- The agency's matching public service enabled.
- Active, non-archived provider/staff account and a matching `user_agencies` relationship.

The directory combines a provider's matching public affiliations into one card. Search includes name, organization, public bio, specialties, and tutoring subjects. Filters cover service, organization, organization location, published ages/grades, listed insurance, and acceptance of new clients. Location labels describe the organization, not an invented provider office or geocoded distance.

Profile panels show published details per organization. Opening checks revalidate inclusion and enrollment, then use the existing booking controller's held-slot and new-client rules. Only future opening times are returned. No internal schedule identifiers, client names, private notes, emails, or billing details are projected. A provider closed to new clients is not advertised with openings. The booking link preserves service and selected session format and continues into the organization's existing booking flow. Opening times are displayed in the viewer's local time zone and are not appointment confirmations.

No simulated map pins, fictional provider records, synthetic availability, verification badges, or mockup outcome/testimonial claims ship in production. The only network statistic is the actual count of published partners. Broader outcome reporting remains explicitly pending.

## Assets and validation

Original PNGs remain in `assets/mentalrangecollectivewebsiteassets` and `assets/mh4kidzwebsiteassets`. Optimized WebP files and source manifests are in `frontend/public/assets/range` and `frontend/public/assets/mh4kidz`. MH4Kidz uses its supplied color and white logos and self-hosted Kalam headings (OFL license alongside the font). Range has an editable logo override and a code-drawn mountain wordmark fallback; its supplied photo assets contain no standalone logo file.

Validation:

- `node --test backend/src/services/__tests__/mentalRange.service.test.js`
- `npm --prefix frontend test -- src/views/public/__tests__/CollectivePublicWebsites.test.js src/views/admin/__tests__/PublicMarketingPagesAdminView.test.js`
- `node database/tests/collective-public-websites.cjs` against a **disposable** local MySQL 8.4 container on port 33320, root password `synthetic-only`. It creates/drops only the synthetic `collective_check` database. Never run against application databases.
- Production frontend build, with the repository's existing large-bundle warnings.
- Full-app browser checks with mocked public API responses: 18 pages at 320, 390, 580, 768, 1024, 1440, 2048, 2560, and 3440 pixels; mobile navigation/Escape; search; actual image loading; provider opening interaction. Live tenant/provider records and production DNS were not used in those checks.
