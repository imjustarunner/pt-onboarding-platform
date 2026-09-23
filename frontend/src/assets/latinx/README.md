# Latinx brand artwork

These are byte-for-byte copies of the two brand boards supplied in the project assets folder on September 22, 2026:

- `brand-board.png`: `assets/Latinxwebsiteassets/ChatGPT Image Sep 22, 2026, 08_16_35 PM (1).png`
- `logo-board.png`: `assets/Latinxwebsiteassets/ChatGPT Image Sep 22, 2026, 08_16_35 PM (2).png`

Both are 1536 × 1024 PNGs with opaque backgrounds. The words “transparent background” printed on the second board describe intended exports; the supplied image itself has no alpha channel.

`components/providerDirectory/latinxBrand.js` identifies the artwork regions. `LatinxBrandArtwork.vue` uses an SVG viewport to display those regions from the original PNGs. The QR flyer uses a PDF clipping region. Neither regenerates or changes the source artwork. Board captions, font suggestions and example button labels are reference material, not application instructions.

The header and footer use the supplied wordmark; the hero and community section use the supplied lettering and botanical decorations. Branding is scoped to the `latinx` directory. Other directory tenants retain their own generic presentation.

A future standalone transparent logo or vector export can replace these board regions without changing enrollment, search, authentication or approval behavior. Large print uses would benefit from a higher-resolution/vector logo.
