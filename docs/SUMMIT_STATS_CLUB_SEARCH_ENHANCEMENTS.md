# Summit Stats — Club Search Enhancements

**Status:** Implemented.

---

## Current Behavior

- Club search at `/:slug/clubs` is public (no auth to browse)
- Simple text search by name
- "Sign in to Join" for unauthenticated users
- Links: Sign up, Create a club instead

---

## Requirements (Future Implementation)

### 1. Browse Without Logging In

- Keep clubs list **public** — no auth required to browse
- Fix any flash/redirect that causes the page to disappear (e.g. 401 redirect when API should be public)

### 2. Search & Filter

- **By state** — Filter clubs by state/region
- **By name** — Filter by club name
- **Smart typing** — As user types, rank results by relevance (fuzzy match, most likely choice first)
- Backend: support `state`, `search` (or similar) params; return ranked results

### 3. Apply Flow

- When user finds a club → "Apply to Join" (requires auth)
- Unauthenticated: show "Sign in to Join" or "Sign up to Apply"

### 4. Placeholders for Public-Facing Forms

All of these are public and need **reCAPTCHA placeholder** for future implementation:

| Flow | Path / Context |
|------|----------------|
| Start an account | Participant signup `/:slug/signup` |
| Request to join (with new account) | Club search → apply → sign up first |
| Start a club | Club Manager signup `/:slug/signup/club-manager` |

Add placeholder hooks/comments for reCAPTCHA integration. Do not implement reCAPTCHA yet.

### 5. UI Placeholders

- **Sign up** — "Don't have an account? Sign up"
- **Create a club** — "Create a club instead"
- **Apply from club search** — "Sign in to Join" or "Sign up to Apply" (when not logged in)

---

## Notes

- reCAPTCHA: use same pattern as other public forms (e.g. intake, login) when implemented
- Smart search: consider debounced input, backend ranking by relevance (e.g. name match, state match)
- State filter: clubs need `state` or `region` field; may require migration
