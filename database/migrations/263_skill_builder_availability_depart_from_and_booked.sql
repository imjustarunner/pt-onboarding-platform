/*
Skill Builder availability: capture depart-from + optional depart-time + booked flag.

- Providers must select >= 6 hours/week of DIRECT time (indirect setup/cleanup is not counted here).
- After school is typically 3:00–4:30 (subject to change); Weekend is 12:00–3:00.

Note: Use block comments because the migration runner drops `--`-prefixed statements.
*/

ALTER TABLE provider_skill_builder_availability
  ADD COLUMN depart_from VARCHAR(255) NOT NULL DEFAULT 'Unknown' AFTER provider_id,
  ADD COLUMN depart_time TIME NULL AFTER depart_from,
  ADD COLUMN is_booked BOOLEAN NOT NULL DEFAULT FALSE AFTER depart_time;

