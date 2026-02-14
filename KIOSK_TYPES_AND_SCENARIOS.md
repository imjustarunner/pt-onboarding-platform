# Kiosk Types and Scenarios

## Overview

Support multiple kiosk types/configurations to cover:
- **Lobby kiosk** – always on, general-purpose
- **Event kiosk** – temporary (e.g. 8 weeks), place-specific
- **Program staff kiosk** – program check-in, schedule-constrained (e.g. Saturdays only)
- **Client check-in kiosk** – clients select time/provider, check in, provider notified, optional surveys per slot

A single kiosk can support multiple types (e.g. lobby does both client check-in and staff clock-in). Types are expressed via `allowed_modes` and `kiosk_type` in settings.

---

## Kiosk Types

| Type | Description | Key Config |
|------|-------------|------------|
| `lobby` | Always-on, general purpose. Can offer clock, guardian, event check-in, client check-in. | `office_location_id`, no time bounds |
| `event` | Temporary deployment (e.g. 8 weeks at a school). Same features as lobby but time-bound. | `valid_from`, `valid_until`, `office_location_id` |
| `program_staff` | Staff clock-in/guardian check-in for a specific program. Can be schedule-constrained. | `program_id`, `allowed_days` (e.g. `["saturday"]`), optional `office_location_id` |
| `client_check_in` | Clients select appointment (time + provider), check in. Provider gets in-app notification. Optional surveys per slot. | `office_location_id`, questionnaire rules |

---

## Data Model Extensions

### 1. Extend `kiosk_agency_assignments`

```sql
ALTER TABLE kiosk_agency_assignments
  ADD COLUMN valid_from DATE NULL COMMENT 'Event kiosks: start date',
  ADD COLUMN valid_until DATE NULL COMMENT 'Event kiosks: end date (e.g. 8 weeks)',
  ADD COLUMN allowed_days_json JSON NULL COMMENT 'e.g. ["saturday"] for program staff kiosk';
```

### 2. `settings_json` structure (per assignment)

```json
{
  "kiosk_type": "lobby" | "event" | "program_staff" | "client_check_in",
  "allowed_modes": ["clock", "guardian", "event", "client_check_in"],
  "default_mode": "client_check_in",
  "show_mode_selector": true
}
```

- **lobby**: `allowed_modes` = `["clock", "guardian", "event", "client_check_in"]`, `show_mode_selector` = true
- **event**: same as lobby, plus `valid_from`/`valid_until` on assignment
- **program_staff**: `allowed_modes` = `["clock", "guardian"]`, `program_id` set, `allowed_days_json` = `["saturday"]`
- **client_check_in**: `allowed_modes` = `["client_check_in"]`, `default_mode` = `"client_check_in"`

### 3. Per-slot questionnaire rules (new table)

To assign surveys/questionnaires to specific slots (room, time, provider):

```sql
CREATE TABLE office_slot_questionnaire_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  office_location_id INT NOT NULL,
  room_id INT NULL COMMENT 'null = all rooms',
  day_of_week TINYINT NULL COMMENT '0=Sun..6=Sat, null = all days',
  hour_start TINYINT NULL COMMENT '0-23, null = all hours',
  module_id INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (office_location_id) REFERENCES office_locations(id),
  FOREIGN KEY (room_id) REFERENCES office_rooms(id),
  FOREIGN KEY (module_id) REFERENCES modules(id)
);
```

- Rule: "Room 3, Saturdays, 9am–5pm → PHQ9"
- Rule: "All rooms, all times → intake survey" (room_id, day_of_week, hour_start = null)
- When client checks in, evaluate rules for that event's room + start time; show matching questionnaires.

---

## Flows by Type

### Lobby kiosk
1. Kiosk logs in (or uses public `/kiosk/:locationId`).
2. Mode selector: Clock In/Out | Guardian Check-in | Office Event Check-in | Client Check-in.
3. User picks mode and completes flow.

### Event kiosk (8 weeks)
1. Same as lobby, but assignment has `valid_from` and `valid_until`.
2. Context API filters out assignments outside the valid window.
3. After 8 weeks, kiosk no longer sees that location.

### Program staff kiosk (Saturdays only)
1. Kiosk shows only program staff clock-in / guardian check-in.
2. `allowed_days` = `["saturday"]` → only show UI on Saturdays; other days show "Not available today" or similar.
3. Single program, single site (or filtered by assignment).

### Client check-in kiosk
1. Client sees today's appointments (from office events / schedule).
2. Client selects their slot (time + provider/room).
3. Check-in → create `office_event_checkin`, notify provider.
4. If slot matches a questionnaire rule → show survey before or after check-in.
5. Provider gets in-app notification: "Your 5pm client has checked in."

---

## Provider Notification (Already Exists)

Current `checkInToEvent` already:
- Creates `office_event_checkin`
- Calls `createNotificationAndDispatch` with `type: 'kiosk_checkin'` to the booked provider

Enhancement: ensure notification is prominent (e.g. push, in-app badge) and message is clear: "Your 5pm appointment has checked in" with time and room.

---

## Implementation Phases

### Phase 1: Kiosk types in settings (minimal)
- Add `kiosk_type` and mode config to `settings_json`.
- Filter `allowed_modes` per assignment.
- No schema change.

### Phase 2: Time-bound and schedule-constrained assignments
- Add `valid_from`, `valid_until`, `allowed_days_json` to `kiosk_agency_assignments`.
- Context API filters by current date and day-of-week.
- Program staff kiosk shows "Not available" on non-Saturdays.

### Phase 3: Client check-in as first-class mode
- Client check-in is already supported via event check-in.
- Add `client_check_in` to `allowed_modes`.
- Default mode for client-check-in kiosks = `client_check_in`.
- Ensure provider notification is clear and reliable.

### Phase 4: Per-slot questionnaire rules
- Add `office_slot_questionnaire_rules` table.
- Admin UI to assign questionnaires to room/time.
- Kiosk evaluates rules on check-in and shows matching surveys.

---

## Summary

| Scenario | Type | Assignment Config | Notes |
|----------|------|-------------------|-------|
| Lobby, always on | lobby | `office_location_id`, no time bounds | Mode selector: clock, guardian, event, client |
| Event, 8 weeks | event | `valid_from`, `valid_until`, `office_location_id` | Same as lobby, time-bound |
| Program, Saturdays | program_staff | `program_id`, `allowed_days_json: ["saturday"]` | Clock/guardian only, Saturdays |
| Client check-in | client_check_in | `office_location_id` | Clients pick slot, check in, provider notified, optional surveys |

All can coexist. One kiosk can have multiple assignments (e.g. lobby + program on Saturdays) and the UI can switch by context (location, day, mode).
