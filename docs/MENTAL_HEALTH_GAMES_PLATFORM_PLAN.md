# Mental health games — platform plan (PlotTwist reference)

A copy of this document for collaborators working in the games repository lives at `games/docs/MENTAL_HEALTH_GAMES_PLATFORM_PLAN.md` (git submodule). Technical submodule setup is in `docs/GAMES_SUBMODULE_INTEGRATION.md`.

This document is the working north star for the mental health games initiative. It is written against **this repository**: the PlotTwistCo People Operations platform (Vue 3 + Pinia frontend, Express + MySQL backend, multi-organization `agencies` model). Use it when scoping features, integrations, and handoffs with collaborators.

---

## Purpose

- Keep product and engineering decisions aligned: games are an **add-on layer** on the existing platform, not a one-off microsite.
- Make explicit how “tenant,” “brand,” and “feature enablement” map to **concrete tables and patterns already in production**.

---

## How this app already thinks about “tenants” and brands

In this codebase, a **tenant-facing slice of the product** usually maps to one or more rows in `agencies`:

- **`organization_type`** distinguishes agency, school, program, learning, clinical, affiliation (clubs), etc.
- **`slug`** and **`portal_url`** identify the org for routing and white-label portals.
- **`color_palette`**, **`theme_settings`**, **`logo_url`**, and related fields drive per-org UI; the frontend applies them via `BrandingProvider.vue` and the organization/branding stores.
- **Subdomain portals** follow the pattern `<portal>.app.<base-domain>` (see `frontend/src/utils/subdomain.js`). That is the primary mechanism today for “this hostname resolves to this organization’s branded experience.”
- **Path-based org context** also exists (e.g. slug-prefixed routes); `BrandingProvider` explicitly avoids letting the wrong agency’s theme override the route’s org when slugs differ.

**Implication for games:** “A dedicated games brand” should be expressed as **real organization(s)** plus routing (subdomain and/or path) and branding data—not as a parallel auth or database silo unless compliance forces it.

---

## Core vision

- A **library of mental health games** usable in **virtual** and **in-person** care settings, sold or bundled as part of the broader PlotTwist offering.
- Games remain **modular**: shared engine/assets where possible, tenant-aware presentation, embeddable or launchable from the same SPA the rest of the platform uses.
- **Commercial model (future):** optional per-organization or per-seat add-on; revenue share with a games creator or partner is compatible with existing **platform billing** direction (e.g. QuickBooks-backed usage billing patterns in this repo). Exact pricing lives outside this doc until product defines it.

---

## Product structure: separate games repo, integrated app

**Direction (unchanged in intent):** keep game source in a **separate repository** for clean ownership, CI, and designer/creator workflows.

**Integration constraints for *this* app:**

- The main Vue app should consume games through a **stable contract**: versioned package, built bundle, or clearly defined URL surface—whatever keeps releases decoupled but deployable together.
- Avoid copying opaque game binaries into random `public/` folders without a documented update path; prefer something the main app’s build can pin (semver, lockfile, or release tag).

---

## Feature enablement: map to `agencies.feature_flags`

The platform already stores **per-agency JSON feature flags** (`feature_flags` on `agencies`, used in billing and other controllers).

**Guidance:**

- Add a explicit flag (implemented as `gamesPlatformEnabled` on `agencies.feature_flags`) when games are ready to gate, and enforce it in **API routes** that serve game metadata, sessions, or scores—not only in the UI.
- Keep flag semantics documented in one place (this file + a short backend comment or shared constant) so super-admin tooling and billing stay aligned later.

---

## Delivery models that fit this codebase

### Branded web (current platform strengths)

- **Subdomain white-label** aligned with `portal_url` and `getSubdomain()` behavior.
- **Path-based experiences** under the same deployment (similar in spirit to dedicated routes for large features).
- **Reverse proxy / rewrite** at the edge is still valid for “games look like their own domain” while the SPA and API remain the PlotTwist stack.

### Virtual sessions

- The backend already exposes **voice/video** capabilities (Vonage, `/api/voice-video`, related services). Games that run during a live session should be designed to **coexist with session lifecycle** (join/leave, permissions, audit expectations)—exact UX TBD with clinical/compliance input.

### Mobile

- The repo includes **Capacitor / iOS** artifacts under `frontend/`. Long term, the same Vue codebase can ship a store app; games should be **responsive and touch-first** where applicable, and avoid assumptions that break inside a WebView unless tested there.

---

## Real precedent already in this platform: Summit Stats / SSTC

The **Summit Stats Team Challenge** work demonstrates the intended pattern at scale:

- **Same platform:** agencies, clubs (`affiliation`), parent/child agency relationships, dedicated controllers and routes (e.g. summit stats, Garmin-adjacent flows).
- **Distinct experience:** users can interact with a branded, feature-scoped surface while the data model remains org-scoped.

Treat **mental health games** as the next major “vertical feature” in that family: org-scoped, optionally flagship-branded, backed by the same auth and `agencies` model.

---

## Development guidance (concrete)

When designing or implementing games and integrations:

1. **Reusable modules** — shared game shell (loading, scoring API, accessibility hooks), per-game packs.
2. **Tenant-aware branding** — read org theme from existing stores/APIs; do not hardcode palettes inside game assets when avoidable.
3. **Telehealth and in-person** — support launching from provider workflows and from a participant-facing portal; consider offline or low-connectivity for in-person where relevant.
4. **Embed vs navigate** — decide early: full-page route vs embedded iframe/web component; both can work if CSP and auth cookies are planned.
5. **Platform boundary** — core onboarding/training/clinical flows stay in this repo; game-specific assets and rapid iteration live in the games repo with a thin adapter in the main app.
6. **Security and compliance** — games that touch PHI or session content need the same discipline as the rest of the app (auth middleware, org access checks, logging). Assume **HIPAA-sensitive** until compliance signs off on a lighter tier.

---

## Immediate technical direction

1. **Games repository** — create or attach; define build output and versioning.
2. **Main app integration** — add a minimal “games hub” route and API stub protected by auth + org access; wire **feature flag** before any production traffic.
3. **Org enablement** — super-admin or self-serve toggle (product decision) backed by `feature_flags`.
4. **Branding** — use existing agency branding fields; add platform-level branding only if games need a global default separate from PlotTwist marketing site.
5. **Observability** — basic analytics events (game started/completed) with org id, no unnecessary PII in event payloads.

---

## Business framing

- **Feature expansion** for PlotTwist customers (schools, agencies, programs), not a disconnected product unless marketing chooses to position it that way.
- **Recurring revenue** optional add-on; implementation should not block turning billing on later (flags + entitlements pattern).
- **Partner / creator share** is a business arrangement; engineering supplies **reporting hooks** and clean separation of “game SKU” vs “platform fee” when those requirements arrive.

---

## Summary

The goal is a **scalable games layer** that:

- Plugs into the **existing PlotTwist platform** (same `agencies`, auth, branding, and deployment story).
- Can be **enabled per organization** via **`agencies.feature_flags`** (and billing when ready).
- Supports **white-label and path-based** delivery already used elsewhere.
- Aligns with **Summit Stats–style** “big feature, same platform” precedent.
- Keeps **game iteration** in a **separate repo** with a **thin, versioned integration** in this one.

---

## Document maintenance

- Update this file when: integration mechanism is chosen (package vs CDN vs monorepo), flag names are finalized, or compliance scope for v1 is decided.
- For small AI/collaboration snippets, consider adding focused cards under `docs/ai/context/` that link back here.
