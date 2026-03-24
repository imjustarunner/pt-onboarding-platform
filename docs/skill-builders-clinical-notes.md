# Skill Builders Clinical Notes & Clinical Aid

## Database

Run migration `599_skill_builders_activity_options_and_note_ttl.sql`:

- `skill_builders_activity_options` — labels per `skills_group_id`.
- `skill_builders_session_clinical_notes`: `expires_at` (14 days from insert), `selected_activity_ids_json`, `client_note_status`.

## API (authenticated)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/skill-builders/me/clinical-notes?agencyId=&eventId=&limit=` | Index for program hub / Clinical Notes (providers: own rows; staff-like: all for agency). Optional `eventId` filters to one event. |
| GET | `/api/skill-builders/events/:eventId/activity-options?agencyId=` | List activity options. |
| POST | `/api/skill-builders/events/:eventId/activity-options` body `{ agencyId, label }` | Create option (coordinator/staff). |
| PATCH | `/api/skill-builders/events/:eventId/activity-options/:optionId` | Update label/sort/active. |
| DELETE | `/api/skill-builders/events/:eventId/activity-options/:optionId?agencyId=` | Delete option. |

Generate H2014 note (`POST .../clinical-notes/clients/:clientId/generate`) now accepts `activityIds: number[]`. If the group has **any** active activity options, **at least one** id is required.

## Retention

`runSkillBuildersClinicalRetention` also deletes rows with `expires_at < NOW()` (batch).

## UI surfaces

- **My Dashboard → Clinical Aid**: opens Skill Builders program hub on **Clinical Notes** (initial section).
- **Program hub (`ProgramHubModal`)**: **Clinical Notes** card (supervision icon) → `SkillBuildersClinicalNotesHubPanel`.
- **Event portal**: **Clinical Notes** rail → same panel filtered by `eventId`.
- **Materials**: **Activities** button (coordinator/staff) to manage options.
- **Client management → Clinical (H2014 group)**: activity checkboxes, generate with `activityIds`, sectioned output display.

## Schedule / Note Aid

- **Therapy Notes (ebusy)** 15-minute labels use **slot** time; stack modal lists ICS events with **Open Note Aid**.
- **Note Aid** (`ClinicalNoteGeneratorView`): therapy query prefill; **Approve** only with office booking; section **Edit** + **Copy**.
