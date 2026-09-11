# Public page design and verification

The supplied mockup is the visual specification. Before changing a public page, identify its template, saved branding, real assets, and destinations. A reusable editor does not make every new mockup the same layout: materially different references need their own template implementation.

## Authoring

Open `/admin/public-marketing-pages?page=tisi`, then **Compare page**. The workspace renders unsaved data through the actual public Vue component in an iframe, so desktop, tablet, and mobile breakpoints are real. Fit-to-pane changes presentation scale, not the iframe's layout width. Expand the workspace for more room.

Choose a mockup or clean source artwork. Drag a crop rectangle, or enter the percentage coordinates using the keyboard. Apply it to the hero, consultation banner, or logo. The browser crops the original pixels into a PNG and sends that file through the existing marketing asset uploader. No generated artwork or screenshot-as-webpage substitution is involved. Uploads alone do not publish page changes.

A crop cannot remove words or logos baked into its source. Use text-free originals behind live HTML headings and buttons. Low-resolution crops should be replaced with original artwork before treating the page as visually complete. Save the full reference to the page if it should remain available for later comparisons. Desktop hero, mobile hero, and banner have independently editable focal positions.

**Published** controls the existing page's visibility. An unsaved preview is local to the editor; saving an unpublished record hides that public URL. There is no separate persisted draft/version alongside an existing published record in the current database schema.

## Content and interaction requirements

- Never generate testimonials, star ratings, phone numbers, addresses, or social accounts to fill a visual slot. Testimonials require an explicit authentic/approved flag. No ratings are inferred from a quote.
- Primary actions need real destinations. TISI's Get Started flow is `/join/tisi`; `/:organizationSlug/join` is a different membership application. Preserve administrator-configured alternatives.
- Do not advertise unfinished legal/about/resources pages as working navigation. Known services/contact/support pages can resolve to meaningful existing homepage sections; unresolved card destinations render as informational cards without action arrows. Clear a card's link intentionally to keep it informational.
- Deleted lists, optional text, and contact fields must stay deleted after saving and reloading. Preserve unrelated branding properties when saving structured edits.
- The readiness panel detects missing/unsafe destinations, known unfinished subpages, unconfirmed testimonials, and placeholder contact copy. Both landing editors check this before saving published changes. These are client-side authoring checks, not server-side enforcement or proof that an external URL is healthy.
- Verify uploads, save failures, links, keyboard focus, menu behavior, wrapping, image loading, and contrast in the browser. Never submit a real intake or other consequential form merely to test navigation.

## Verification for this implementation

Run:

```sh
npm test --prefix frontend -- src/utils/__tests__/marketingPageQuality.test.js src/views/public/__tests__/PublicMarketingLandingTisiView.test.js src/views/public/__tests__/PublicMarketingPageRouter.test.js src/views/admin/__tests__/PublicMarketingPagesAdminView.test.js
NODE_OPTIONS=--max-old-space-size=8192 npm run build --prefix frontend
```

The browser checks used the installed Chromium-based browser and intercepted local API fixtures. Public checks covered 320, 390, 768, 1024, and 1400 px widths, missing image elements, runtime errors, menu operation, heading contrast, and navigation into the actual intake component. Editor checks covered unsaved preview updates, mobile breakpoints, crop generation/upload requests, and saved payloads. Production storage, current agency intake configuration, and final form submission were not exercised.

The screenshot's original hero composition (man, boy, athlete) and mountain banner are still needed as usable source artwork. The existing Colorado photo remains until those are supplied/applied. Do not claim pixel-level fidelity while those assets or other approved content are missing.
