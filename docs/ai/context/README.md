## AI Context Cards

This folder holds **small, focused knowledge snippets** (“context cards”) for product workflows.

### Runtime product map (Quick Nav + Ask)

- **Quick Nav** = jump straight to a page (typeahead). Prefer this when you already know the destination name.
- **Ask Assistant** = conversational “where can I find…?” — explains the breadcrumb and can open the page.

Both share `frontend/src/navigation/appPagesData.js` (~100 app pages). Curated Quick Nav / `productLocationCatalog` entries stay first-class; the full index fills the rest so you do not have to teach every screen one by one.

When you add a major screen, add it to `appPagesData.js` (and curated catalogs if it needs a `routeName` / role gate).

### How to use (markdown cards)

- Keep each file short and specific (one workflow per file).
- Prefer concrete, app-specific wording (what the user sees/clicks).
- Avoid PHI: describe concepts, not client-identifying details.

### Suggested naming

- `my-dashboard.md`
- `school-portal.md`
- `provider-availability.md`
- `provider-action-packet.md`
- `glossary.md`

