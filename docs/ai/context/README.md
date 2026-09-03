## AI Context Cards

This folder holds **small, focused knowledge snippets** (“context cards”) for product workflows.

### Runtime “where is X?” help

Ask Assistant product-location answers (“Where can staff see school events?”) are powered by
`frontend/src/navigation/productLocationCatalog.js` (labels, breadcrumbs, keywords → `navigateTo`).
When you add a major screen, add it there **and** to `NAVIGATION_ROUTE_WHITELIST` /
`quickNavCatalog.js` so staff can ask where it is.

These markdown cards are still useful for deeper “how does this workflow work?” docs; they are
not loaded automatically by Ask Assistant yet.

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

