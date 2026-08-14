# Provider action packet template

Reusable pattern for sending providers a **branded mobile PDF** plus a **24-hour secure link** so they complete quick school-client updates without signing in.

Current use: **school client action packet** — fall confirmation, new-client intake, and other lifecycle steps from the Client Action Needed workspace.

## What the provider receives

1. **PDF** (text/iMessage attachment) — portrait phone card with agency logo, careers hero, client count, time estimate, and a tappable **Open my clients** button.
2. **Secure link** (`/ca/:token`) — same branding; opens a mobile client list with **Complete** buttons that launch the correct modal (fall confirmation, intake checklist, etc.).

No Google sign-in. Link expires in 24 hours. Session heartbeat tracks open time and completions.

## Admin workflow

1. Open **Client Action Needed** (`ClientOnboardingWorkspaceView`).
2. Expand **Send school client action packet**.
3. Per provider: **PDF** (download) or **Link** (copy URL).
4. Text or email the PDF/link to the provider.

## Architecture map

| Layer | Location |
|-------|----------|
| Shared labels & filename | `backend/src/utils/providerActionOutreach.js` → `PROVIDER_ACTION_PACKET` |
| Queue / who needs action | `backend/src/services/clientOnboardingChecklist.service.js` → `listOnboardingQueue`, `deriveLifecycleAction` |
| Link + snapshot + tracking | `backend/src/services/providerActionOutreach.service.js` |
| PDF render | `backend/src/services/providerActionPdf.service.js` |
| Admin API | `backend/src/routes/providerAction.routes.js` |
| Public API | `backend/src/routes/publicProviderAction.routes.js` |
| Admin UI | `frontend/src/components/admin/ProviderActionOutreachPanel.vue` |
| Public page | `frontend/src/views/public/ProviderActionPublicView.vue` |
| Routes | `/ca/:token`, `/client-action/:token` |

### Database

- `provider_action_links` — token, agency, provider, expiry, open/heartbeat/completion aggregates
- `provider_action_link_clients` — snapshot of clients + action keys at send time; completion timestamps

## PDF generation (production-safe)

1. **Bundled assets** in `backend/src/assets/providerActionPdf/` (logo, careers hero, metric icons). Docker only ships `backend/src` + `frontend/dist`; do not rely on `frontend/public` paths at runtime.
2. **Portrait page** — `5.5in × 7in` (`PAGE` constant). Hero image uses `object-fit: contain` (never stretch the framed careers photo).
3. **Puppeteer** writes HTML to a temp file and navigates `file://` with image paths on disk (tiny HTML, no multi-MB base64).
4. **Link stamping** — after render, `stampActionLinks()` adds a PDF **URI annotation** over the bottom half (`useObjectStreams: false` so iPhone Preview / Files can tap it).
5. **Fallback** — `pdf-lib` draws the same layout if Chromium fails; same link stamping runs on the final buffer.

## Public link page

- Loads `GET /api/public/provider-action/:token` (or `POST …/open` on first visit).
- Returns `branding` (logo, colors, hero URL, `packet` labels) and live `clients` with `provider_lifecycle_action`.
- Modals reuse school components with `api-base` pointed at the public token routes.

## Shared copy (`PROVIDER_ACTION_PACKET`)

Update titles in one place:

```js
// backend/src/utils/providerActionOutreach.js
export const PROVIDER_ACTION_PACKET = {
  title: 'School client action packet',
  kicker: 'Confirm fall status & complete client steps',
  panelTitle: 'Send school client action packet',
  ...
  filenameSuffix: 'school-client-actions'
};
```

PDF HTML, fallback PDF, public page kicker, and admin panel read from `branding.packet` or this constant.

## How to clone for a future provider update

Use this checklist when you need another “quick provider packet” (e.g. spring roster check, credential renewal, schedule confirm):

### 1. Define the campaign

- **Audience** — which providers / client filter?
- **Actions** — which `actionKey` values and modals?
- **Copy** — new `PACK` constant (title, kicker, CTA, filename suffix).
- **TTL** — keep 24h or adjust `LINK_TTL_HOURS`.

### 2. Backend

- Option A: extend `listProviderActionClients` filter + lifecycle keys for the new campaign.
- Option B: new service module mirroring `providerActionOutreach.service.js` with its own link table (if workflows must not mix).

Reuse:

- PDF service — pass different `firstName`, counts, `actionUrl`, `agency`; adjust HTML template sections if layout differs.
- Public auth pattern — token on link, `preparePublic` impersonates provider role, `assertClientOnLink` guards client IDs.

### 3. Assets

- Add images under `backend/src/assets/providerActionPdf/` (or a new subfolder).
- Mirror any web-only assets to `frontend/public/assets/provider-action/` if the public page needs them.

### 4. Frontend

- Admin panel: copy `ProviderActionOutreachPanel` pattern or add a second panel.
- Public view: copy `ProviderActionPublicView` or branch on campaign type from API.
- Router: short public path (e.g. `/ca/:token`).

### 5. QA

- Download PDF on desktop — button and URL open `/ca/…`.
- Text PDF to iPhone — tap green area opens Safari.
- Complete one client — count drops; link heartbeat still works.
- Expired link returns 410.

### 6. Tests

- `backend/src/utils/__tests__/providerActionOutreach.test.js` — token normalization, filename, PDF validity + `/URI` annotation.

## Related docs

- `docs/ai/context/provider-action-packet.md` — short agent context card
- Client lifecycle actions — `backend/src/utils/clientLifecycleAction.js` (or equivalent derive logic)
