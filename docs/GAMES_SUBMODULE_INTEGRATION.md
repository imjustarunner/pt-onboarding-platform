# Games submodule — integration guide

This document describes how the PlotTwist main app uses the **`games`** git submodule (`https://github.com/imjustarunner/games.git`), where the frontend should load game assets from, and how multi-tenant / multi-brand support should evolve.

**Product context:** see `docs/MENTAL_HEALTH_GAMES_PLATFORM_PLAN.md` in this repo and the same file under `games/docs/` in the submodule (kept in sync for collaborators working primarily in the games repository).

---

## 1. Submodule setup

The submodule is registered at repository root:

- **Path:** `games/`
- **Remote:** `https://github.com/imjustarunner/games.git`

### Clone the main app with submodules

```bash
git clone --recurse-submodules <main-app-url>
```

### If you already cloned without submodules

```bash
cd PTOnboardingApp
git submodule update --init --recursive
```

### Update the games pointer after someone pushes new commits to `games`

```bash
cd games
git pull origin main
cd ..
git add games
git commit -m "chore: bump games submodule"
```

---

## 2. Where the app should load game files from (recommended layout)

Today the games repo only contains documentation. As implementation lands, standardize on **one primary contract** from the games repo:

| Output type | Location in `games/` | How the main app consumes it |
|-------------|----------------------|-------------------------------|
| **Vue / TS source** (shared components, composables) | e.g. `games/src/` | Import via Vite alias `@games` → `../games` (see `frontend/vite.config.js`). Use for thin adapters and shared logic. |
| **Built static bundle** (iframe, micro-frontend, or vanilla JS) | e.g. `games/dist/` | **Production:** copy `games/dist` into `frontend/public/games/` during CI (`npm run build`), **or** serve via Express static from `games/dist`, **or** publish to CDN and reference by URL. Pick one and document it in the games repo `README.md`. |
| **Game manifest** (ids, versions, entry URLs) | e.g. `games/manifest.json` or API-only | Main app reads manifest at build time or from backend after auth. |

**Best default for this codebase:** keep **runnable game UI** as a **small built artifact** under `games/dist/` with a **stable `index.html` or JS entry** per game, and mount it from Vue routes (full page or iframe). That avoids coupling the main app’s Vue version to every game’s build toolchain while still versioning games with the submodule SHA.

**Avoid** manually copying opaque binaries into random `public/` paths without a scripted step tied to the submodule revision.

---

## 3. Frontend configuration (already prepared)

`frontend/vite.config.js` defines:

- **`@games`** → repository root `games/` (resolved from `frontend/` as `../games`).
- **`server.fs.allow`** includes the `games/` directory so Vite can serve and transform files outside the default `frontend/` root when you import from `@games/...`.

When the games repo adds source files, imports look like:

```js
import Something from '@games/src/...';
```

Adjust paths once the games package layout exists.

---

## 4. Plan: tenants, brands, and feature gating

Aligned with `MENTAL_HEALTH_GAMES_PLATFORM_PLAN.md`:

### 4.1 Feature enablement

- Add a dedicated key on `agencies.feature_flags`, e.g. `mentalHealthGamesEnabled`.
- **Backend:** guard any games metadata, session, or score endpoints with auth + organization access + this flag.
- **Frontend:** hide nav entries and routes when the current org’s flags (or effective org context) do not include games.

### 4.2 Branding

- Pass **CSS variables** or a small **theme object** (from `BrandingProvider` / organization store: `color_palette`, `theme_settings`, logos) into the game shell as props or `postMessage` if using an iframe.
- Do not bake agency-specific colors into the games repo; read them from the host app at runtime.

### 4.3 Routing and white-label

- **Path-based:** e.g. `/:organizationSlug/games/...` reuses existing slug routing and org resolution.
- **Subdomain portals:** `portal_url` + `getSubdomain()` already scope the org; games routes should respect the same resolved organization as the rest of the session.
- **Separate marketing domain:** edge reverse proxy can still hit the same SPA; no change to the submodule layout.

### 4.4 Data and compliance

- Assume **HIPAA-sensitive** until a lighter tier is approved.
- Persist scores or progress with **organization_id** (and user/client identifiers only as required by the product).
- If games run in an iframe on another origin, coordinate **CSP**, **cookies**, and **postMessage** origin allowlists explicitly.

### 4.5 Versioning and releases

- The **gitlink** for `games/` in the main repo pins an exact games revision for reproducible deploys.
- Optionally tag the games repo (`v1.2.0`) and document which tags the main app targets for production.

---

## 5. Next implementation steps (suggested order)

1. In **games** repo: add `package.json`, build script, and `dist/` output contract; document in games `README.md`.
2. In **main** repo: add a **Games** route (behind super-admin or feature flag) that loads the first game shell from `public/games/...` or from `@games` imports, depending on chosen contract.
3. In **backend**: stub `GET /api/games/manifest` (auth + org + feature flag) returning allowed game ids and entry URLs.
4. Wire **admin UI** to toggle `mentalHealthGamesEnabled` per agency when product is ready.

---

## 6. Empty remote repository note

The games repository had **no initial commit** when submodule support was first attempted; an initial commit was pushed to `main` (README + `docs/MENTAL_HEALTH_GAMES_PLATFORM_PLAN.md`) so `git submodule add` could complete. Future work happens on `games` `main` or feature branches as usual.
