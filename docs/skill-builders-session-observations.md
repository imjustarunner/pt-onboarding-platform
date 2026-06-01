# Skill Builders Session Observation Logs

Structured, encrypted session observations captured at the **kiosk Resources tab** (write-only) and reviewed in the **Event Portal** (read-only). Observations feed optional AI daily summaries and H2014 Clinical Aid generation.

## User stories

| Actor | Need |
|-------|------|
| Checked-in staff at kiosk | Log quick tap-based observations per client during session without typing long notes |
| Coordinator / admin | Review all entries and AI summaries for a session date in Event Portal |
| Provider | Review own entries; generate H2014 notes with observation context injected |
| Guardian / public | No access to observation data |

## Privacy

- Kiosk exposes **POST** (save) and **GET observation-config** (presets + activity labels only).
- Kiosk **never** returns observation entries, summaries, or history.
- `GET .../context` does **not** include observation payloads.
- Event Portal uses authenticated Skill Builders APIs with clinical-style access checks.

## Database

Run migration `831_skill_builders_session_observations.sql`:

- `skill_builders_session_observation_entries` — one row per submitted observation (multiple per client per day).
- `skill_builders_session_observation_daily_summaries` — one upserted row per client per session date (AI narrative).

Encrypted columns use the same AES-256-GCM envelope as Skill Builders clinical notes (`encryptSbClinicalPayload` / `decryptSbClinicalPayload`).

## Payload schema (JSON before encryption)

```json
{
  "overallStatus": "doing_well | mixed | struggling | not_participating",
  "activityIds": [1, 2],
  "activityOther": "",
  "behaviorValence": "positive | concerning | mixed",
  "behaviors": ["on_task", "used_coping_skills"],
  "behaviorsOther": "",
  "strengths": ["cooperation", "communication"],
  "strengthsOther": "",
  "struggles": ["transitions", "emotional_regulation"],
  "strugglesOther": "",
  "peerInteraction": "cooperative | withdrawn | conflict | needs_support | mixed",
  "briefNote": ""
}
```

Activity IDs reference `skill_builders_activity_options` (same labels as Clinical Aid).

## Default chip presets (v1)

Returned by `GET .../observation-config` from `backend/src/config/skillBuildersObservationPresets.js`:

- **overallStatus:** Doing well, Mixed, Struggling, Not participating
- **behaviorsPositive:** On task, Used coping skills, Followed directions, Self-advocated, Calm recovery
- **behaviorsConcerning:** Off task, Escalated, Left group, Unsafe choice, Needed redirection
- **strengths:** Cooperation, Communication, Emotional regulation, Problem solving, Leadership
- **struggles:** Transitions, Peer conflict, Focus, Expressing needs, Managing frustration
- **peerInteraction:** Cooperative, Withdrawn, Needed support, Conflict, Mixed

## API

### Kiosk (public program-event bearer)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/public/program-event/agency/:slug/kiosk/events/:eventId/observation-config` | Presets + activity options (no PHI) |
| POST | `/api/public/program-event/agency/:slug/kiosk/events/:eventId/observations` | Save one observation entry |

**POST body:** `{ clientId, authorUserId, sessionDate?, payload }`

**POST response:** `{ ok: true }` only.

Validation:

- Kiosk bearer + recording allowed for day
- `authorUserId` assigned to event and checked in today
- `clientId` is confirmed participant
- `session_id` resolved from `session_date` + event when Skill Builders session exists

### Event Portal (authenticated)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/skill-builders/events/:eventId/observations?agencyId=&date=&clientId=` | List entries (decrypted server-side) |
| GET | `/api/skill-builders/events/:eventId/observations/presets?agencyId=` | Preset labels for display |
| GET | `/api/skill-builders/events/:eventId/observations/clients/:clientId/daily-summary?agencyId=&date=` | Fetch AI summary |
| POST | `/api/skill-builders/events/:eventId/observations/clients/:clientId/daily-summary/generate` | Generate / refresh summary |

Access: `assertClinicalSkillBuildersAccess` (same as Clinical Aid). Providers see only entries they authored; staff-like roles see all event entries.

## AI daily summary

Uses `callGeminiText` (Gemini / Vertex). Input: client first name, session date, human-readable text built from all entries that day. Output: 1–2 paragraph staff-facing summary stored encrypted in `summary_enc`.

## Clinical Aid integration

When `includeSessionObservations: true` on H2014 generate:

- Load that session date's observation entries + daily summary (if any)
- Inject as `STAFF SESSION OBSERVATIONS (do not invent beyond this)` in the generate prompt

Providers still approve/edit the formal H2014 note.

## Retention

Align with clinical copy-aid TTL (**14 days** from insert) when `expires_at` column is populated. Purge via future retention job (same pattern as `runSkillBuildersClinicalRetention`).

## Phased rollout

1. **v1:** Migration, kiosk wizard, portal entry list
2. **v2:** AI daily summary generate + portal summary panel
3. **v3:** Clinical Aid inject toggle

## QA checklist

- [ ] Kiosk POST saves entry; response has no observation content
- [ ] Kiosk GET context has no observation fields
- [ ] Event Portal lists entries for staff; providers see own only
- [ ] Daily summary generates from multiple entries
- [ ] H2014 generate with include toggle adds observation block to prompt
- [ ] Encrypted payloads unreadable in DB without key

## UI surfaces

- **Kiosk:** `PublicProgramEventKioskStationView.vue` → resource modal → `EventKioskSessionObservationWizard.vue`
- **Event Portal:** `SkillBuildersEventPortalView.vue` → Session observations rail → `SkillBuildersSessionObservationsPanel.vue`
- **Clinical Aid:** `SkillBuildersClientManagementClinicalPanel.vue` → "Include session observations" toggle
