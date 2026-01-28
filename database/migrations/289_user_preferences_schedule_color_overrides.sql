/*
Add per-user schedule block color overrides.

Stored as JSON so we can evolve without schema churn.
Example:
{
  "request": "#F2C94C",
  "school": "#2D9CDB",
  "office_assigned": "#27AE60",
  "office_temporary": "#9B51E0",
  "office_booked": "#EB5757",
  "google_busy": "#111827",
  "ehr_busy": "#F2994A"
}
*/

ALTER TABLE user_preferences
  ADD COLUMN schedule_color_overrides JSON NULL;

