# Rise Revive public website

The public site is `/p/rise`, intended for `https://app.risereviveco.com/p/rise`. The website is a public marketing-page record, independent of tenant creation. It does not create an agency, assign access, collect health information, or provision the custom domain.

## Pages and assets

Home, About, Services, Our Approach, Resources, Join Us, and Contact use the supplied mockups as their design reference: forest greens, sunrise photography, full-width hero bands, service imagery, and a clear next-step path. The assets were supplied in `assets/riserreviveassets` (the folder has an extra “r”). Original files are preserved. Optimized WebP copies and a source manifest live in `frontend/public/assets/rise`.

The separately supplied transparent logo is used in the header and footer. Clean mountain artwork supplies the home and about heroes because the four-person hero images currently exist only inside the full-page mockups. The provided hiker image is used for Our Approach. Hero copy remains actual, editable text. No invented client testimonials, social profiles, booking confirmations, or live chat agents are published. The help button opens navigation assistance, not a simulated conversation.

## Publish before onboarding

Main migration `1426_rise_public_website.sql` creates a published `/p/rise` marketing record only if it does not exist. A rerun preserves edits and publication status. No tenant or affiliation is inserted. This migration was tested in disposable MySQL, not applied to a live database during implementation.

Deploy the frontend and run the main migration using the established deployment process. If running explicitly from the repository root:

```sh
npm --prefix backend run migrate -- --migration=1426
```

The backend deployment already includes `https://app.risereviveco.com` in its CORS origin list. This does not configure DNS, TLS, hosting, or tenant custom-domain mapping. Confirm that the domain serves the app and that refreshing a nested page such as `/p/rise/approach` returns the SPA. Production hosting and deployment were not verified here.

## Connect the tenant later

1. Create Rise Revive through company onboarding and finish the tenant/service setup.
2. Publish the tenant’s actual client enrollment page and verify its URL.
3. Open **Public marketing pages**, edit `/p/rise`, and use **Rise Revive — enrollment and contact** to paste that enrollment URL. The site does not assume the tenant slug will be `rise`.
4. Add only confirmed careers, partnership, contact-form, email, phone, and location details. Leave unavailable destinations blank.
5. Save and test the published links. Enrollment continues into the existing intake flow; it does not automatically confirm an appointment.

Until an enrollment URL is configured, Get started opens the Join Us page with an explicit opening message. There is no form that pretends to submit a request. Providers and partners also see an opening state until their destinations are configured.

## Editing and boundaries

The existing public editor supports home hero title/subtitle/image, logo uploads, a desktop/tablet/mobile comparison preview, and image cropping. Rise-specific fields add the bottom banner, an optional mobile home hero, opening message, and contact/enrollment destinations. Matching `contentPages` entries support each designed subpage’s hero title, subtitle, and image. Core section layouts and resource copy live in the Vue component and Rise content catalog; this is not an unrestricted drag-and-drop page builder.

Only relative application paths and HTTPS links are accepted for action destinations. Invalid configured URLs are rejected in the editor and filtered by the renderer. Contact email and phone links are validated. Preview messages must come from the same-origin parent iframe; outbound enrollment navigation is blocked in preview. Public API failures and unpublished pages display a retry/unavailable state rather than publishing fallback content.

## Verification

- 77 checks: seven pages at widths 320, 390, 580, 768, 800, 980, 1024, 1440, 2048, 2560, and 3440px; no horizontal overflow, missing images, or JavaScript page errors.
- Browser interactions: mobile navigation and Escape, help open/close, FAQs, resource filtering and expandable guides.
- Full-application router smoke test at `/p/rise` uses a synthetic public-page response; it does not prove live backend/deployment availability.
- 13 frontend tests cover safe pending enrollment, explicit destinations, unsafe links, API errors/retry, missing subpages, resource search, untrusted preview messages, editor field preservation, and existing PTCO/TISI editor behavior.
- Disposable MySQL verifies creation without a tenant and safe reruns preserving publication state and edits.
- Production build passed with the repository’s existing bundle-size warnings.

```sh
npm --prefix frontend test -- src/views/public/__tests__/RisePublicWebsite.test.js src/views/admin/__tests__/PublicMarketingPagesAdminView.test.js
NODE_OPTIONS=--max-old-space-size=8192 npm --prefix frontend run build
```
