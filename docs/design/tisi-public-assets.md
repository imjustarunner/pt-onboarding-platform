# TISI public page artwork

Source artwork is preserved in `assets/innerstrengthpublicwebsiteassets/`. Browser copies are WebP files in `frontend/public/assets/tisi/`; the adjacent `manifest.json` maps every deployed image to its source filename. Twenty distinct web assets total approximately 3.1 MB. Two duplicate source PNGs were not exported twice. No synthetic testimonials, contact details, provider identities, or endorsements from the mockups were published.

| Route | Artwork/layout |
| --- | --- |
| `/p/tisi` | Adult/boy/football home hero and mountain CTA banner; existing editable landing layout |
| `/p/tisi/men` | Mountain hero, men's support image, service cards, process, FAQ |
| `/p/tisi/mens-services` | Men's services variation |
| `/p/tisi/boys` | Mountain hero, smiling boy portrait, support cards, process, FAQ, boy mountain banner |
| `/p/tisi/boys-services` | Facing-boy hero and detailed services variation |
| `/p/tisi/athletes` | Four-athlete hero, runner portrait, support cards, all seven sports tiles and mountain banner |
| `/p/tisi/athlete-services` | Front-facing athlete group hero and services variation |

The images are references for responsive page composition, not screenshots placed over the interface. Headings, buttons, service cards, navigation and FAQ disclosures are real HTML. The primary CTA remains `/join/tisi`, respecting an explicit safe configured destination. Existing custom uploaded home images are preserved; only the old bundled Colorado placeholder is replaced automatically.

In the public page editor, add/select a subpage with one of the six audience slugs to edit its hero heading, description, hero/portrait/banner URLs, and desktop/mobile image positions. Existing non-placeholder Markdown remains visible as additional agency content. Shared branding comes from the TISI page configuration. This is not a full drag-and-drop subpage builder: service-card structure is currently defined in `tisiAudiencePages.js`.

Verified with 11 public-page component tests and a production build. Browser checks covered home and all six audience/service pages at 320, 390, 768, 1024 and 1440 pixels, including image loading, overflow, mobile menus and FAQ disclosure. These checks used local default branding; tenant-specific published overrides should also be reviewed after deployment.
