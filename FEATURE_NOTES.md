# Feature notes — public marketing hub, events, guardians

Living document for product/engineering context. Update as behavior evolves.

## Public marketing hub — program listings

- **Inline address search**: After the event list, visitors enter an address and tap **Find** to sort by driving distance (Google Distance Matrix). No modal.
- **Condensed row per event**: Location name, miles (when sorted), **Register now**, optional hero image (links to Maps when an address exists).
- **Open in Maps**: Kept on venue and session rows; addresses are clickable links.
- **Agency / program logos**: Hub sources include `sourceAgencyLogoUrl` when the API can build an absolute URL. Clicking a logo filters the list to that source agency; **Show all programs** clears the filter.
- **Session display** (`company_events`): `public_session_label` and `public_session_date_range` — edited in Skill Builders **Edit event → Public registration page**. Same label across events enables **Show all [label] locations** on the public list.
- **Cinema / process overlay**: Scroll duration is tuned faster via `--pmh-cinema-scroll-sec` (see `PublicMarketingHubView.vue`).

### Admin checklist — event visible on hub

1. **Registration eligible** = Yes on the event.
2. Active **intake link** locked to the event (`company_event_id`), any `form_type` with link active.
3. Hub **sources** include the correct agency or program organization.
4. Optional: **Hero image URL**, **venue** / geocode for distance search, **session label** for cross-site grouping.

## Guardian registration → portal

- **New guardian + client** (`create_client` + `create_guardian` on the intake link):
  - Guardian user may receive a **temporary password** (email) when a new guardian account is created.
  - `client_guardians.access_enabled` is **true** for that flow.
  - `clients.guardian_portal_enabled` is set **true** when `create_guardian` is on.
- **`ensureGuardianAccountLinkedForClient`** (finalize paths): `accessEnabled` follows **`link.create_guardian`**. Smart school ROI path keeps `accessEnabled: false`. When enabled, client `guardian_portal_enabled` is set to 1.
- **Guardian dashboard**:
  - Skill Builders cards **pulse** when enrollment is within **48 hours** or when URL has `?highlight=<companyEventId>`.
  - **Your event registrations** (full-width card) lists the same upcoming events with **Registered** date from `skills_group_clients.created_at`.

## Migrations

- `607_company_events_public_session_display.sql` — adds `public_session_label`, `public_session_date_range` to `company_events`.

## Follow-ups (not in scope of initial pass)

- Staff **Guardians** view: card listing events with guardians/clients signed up (admin UX).
- Post-registration redirect to guardian dashboard with `?highlight=` from intake completion response.
