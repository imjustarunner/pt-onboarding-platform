# Quick View presence and personal calendar improvements

Quick View → Presence shows the admin/support team’s availability, portal timedown phase, inactive users, and expected return times. Set your own Away reason, return duration, and reachability, or choose “I’m back.” Existing tenant and role permissions apply. Deliberate Quick View interaction updates live presence; polling does not renew authentication. After ten minutes without interaction, Quick View locks. The last two minutes show a warning. Existing meeting grace still applies. Deploy the API and frontend together and reload existing Quick View tabs.

The Quick View launcher, private-link form, and Family form now use password-manager autocomplete. Enter your account email alongside the code to distinguish saved accounts, then accept your browser’s save offer. Family continues remembering its device session. Quick View keeps its inactivity deadline. This enables saving/autofilling the reusable code; it does not register a WebAuthn passkey. Browser save prompts and autofill depend on the browser and its settings. Form conventions follow [web.dev sign-in guidance](https://web.dev/articles/sign-in-form-best-practices).

Family → Settings → Bring in a Google calendar connects a shared calendar available through the existing Workspace integration. Create events in that calendar from your computer or Google Calendar. Connected events appear live in Family’s calendar and Home, with title-based type, icon, and cover matching. Changes appear on refresh or the next dashboard refresh. Live events are edited in Google. Imported copies remain separate, as before. A saved family event is also available to other devices signed into that household.

New personal events match their title automatically. “Pick up Sam from airport” selects Airport; “Going to zoo” selects Zoo. The title field offers catalog suggestions. Search Event type and expand “Browse matching pictures” to choose visually; choosing a type turns off automatic matching. Turn matching back on to follow subsequent title changes. Explicit custom uploads remain supported. Existing explicit selections are retained.

## New artwork

Generated with the built-in image generation tool, then saved as optimized JPEGs:

- `frontend/public/assets/family-events/zoo.jpg`
- `frontend/public/assets/family-events/airport.jpg`

These are illustrations, not documentary photographs. Final prompts:

- **zoo**: Use case: illustration-story. Asset type: family calendar event cover. Primary request: a zoo outing, recognizable giraffes and zebras in spacious landscaped zoo habitats with a winding visitor path. Style: polished softly painted editorial illustration, warm sunlight, welcoming natural greens, landscape 3:2, clear subjects visible at thumbnail size, quieter left side for overlay text. No lettering, no watermark, no logos.
- **airport**: Use case: illustration-story. Asset type: family calendar event cover. Primary request: airport pickup, a modern airport arrivals terminal, airplane visible beyond its glass windows, rolling luggage and a curbside car. Style: polished softly painted editorial illustration, warm sunlight, blue and sage palette, landscape 3:2, clear subjects visible at thumbnail size, quieter left side for overlay text. No lettering, no watermark, no logos.

## Verification

Run `node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.quick-view.config.js` for presence permissions and expiry, and the existing `backend/vitest.family.config.js` suite for family persistence and Google imports. Frontend coverage includes `familyCommandCenter.test.js`, `familyCalendarDisplay.test.js`, `QuickView.messaging.test.js`, `QuickView.presence.test.js`, and `FamilyEventTypePicker.test.js`. Build with `NODE_OPTIONS=--max-old-space-size=8192 npm --prefix frontend run build`.

Live Google account access and password-manager save prompts require a deployed browser/account smoke test; automated tests use mocked API boundaries.
