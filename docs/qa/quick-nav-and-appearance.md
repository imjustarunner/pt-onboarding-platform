# Quick Nav and appearance regression checks

Quick Nav, dashboard Jump To, and the assistant's page picker use the same registered-route catalog. Curated entries provide useful labels and tab shortcuts; static authenticated routes supplement it. Record-detail routes that require an ID, callbacks, hidden pages, and redirects are not advertised as standalone pages.

Discovery checks route roles, capabilities, billing access, and school/program feature provisioning. The router and API remain responsible for authorization. A delegated biller may enter the billing workspace from their management organization; the API limits the organizations they can work with.

Full destinations include queries and anchors. Keep account tabs, finance areas, selected organization, and platform-only routes intact. Recent links are checked again against the active workspace. Navigation errors should leave the picker open and show a retry message.

## Automated checks

From `frontend`, run:

```sh
npm test -- src/navigation/__tests__ src/utils/__tests__/darkMode.test.js src/utils/__tests__/themeStyleIsolation.test.js
```

For the browser audit, install root Playwright dependencies, start Vite on port 5184, then run from the repository root:

```sh
node frontend/scripts/verify-navigation-appearance.cjs
```

`APPEARANCE_ORIGIN` can select another local Vite origin. `PLAYWRIGHT_CHANNEL` defaults to installed Chrome. `APPEARANCE_ARTIFACTS` can select an output directory; otherwise reports and screenshots go to a temporary directory printed by the script.

The browser script uses fictional API fixtures and refuses non-local origins. It checks:

- Thirty page states spanning settings, operations hubs, finance, billing, clients, staff, communications, tasks, learning, credentialing, and personal/administrative payroll.
- The actual Appearance control, device light/dark changes, and preference persistence after reload.
- Large opaque bright surfaces in dark mode, plus populated finance screens and an expense dialog.
- Mobile Quick Nav layout in light and dark modes.
- Actual shortcut clicks, preserved account tabs in history, and recovery from a simulated page-load failure.
- Registered catalog destinations and loading of their page components.

This is a navigation and presentation check with mocked API data. It does not validate live payer/Stripe transactions, every role's backend permissions, or all record-specific screens. Screenshots supplement the surface heuristic; document canvases and images may intentionally stay light.

## Theme implementation

Component colors use semantic `--app-*` dark tokens with their existing light colors as fallbacks. Scope selectors to the intended component, especially in Vue `:global(...)` rules. Do not invert images or documents. Hub variables need sufficient selector specificity to survive later-loaded scoped styles. New components should use shared background, text, and border tokens directly.

## Login branding and remembered accounts

Run `node frontend/scripts/verify-login-branding.cjs` with the same local Vite and Playwright setup. This serves virtual tenant hosts from local Vite and intercepts every API request with fictional data. It verifies the custom-domain timeout login, a simulated Google callback through the actual login view, a remembered account's direct Google start link, username-only password memory, scoped account forgetting, platform/tenant logo separation, and saved light/dark preferences after reload for both the logged-out page and welcome briefing. It does not authenticate with Google or access a real user's session.

Login branding comes from the login portal, including on flat custom-domain `/login` paths. A persisted Platform workspace selection must not replace it. Configured tenant logos win; known tenant marks provide a fallback when a login response omits its logo. The platform briefing uses Plot Twist Co identity and shared Appearance surfaces.

Remembered usernames and Google account display details are stored per portal in the browser, with migration from the previous single-account keys. Passwords and Google credentials are not stored. Remembered accounts remain specific to the browser origin; a different domain or browser needs its own successful Google sign-in. A saved app username or email alias must still resolve to the same remembered Google account. Forgetting one portal's account must not remove another portal's shortcut.
