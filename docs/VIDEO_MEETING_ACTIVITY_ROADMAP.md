# Video Meeting Activity: Encryption, Search & Program Context

Roadmap for enhancing in-meeting chat, polls, and Q&A with encryption, better discoverability, and program/class grouping.

---

## 1. Encryption at Rest

**Goal:** Encrypt `payload_json` (and any sensitive fields) when storing video meeting activity.

**Approach:** Reuse the existing `chatEncryption.service.js` pattern (AES-256-GCM):

- Add columns to `video_meeting_activity`:
  - `payload_ciphertext` MEDIUMTEXT (encrypted JSON)
  - `payload_iv` VARCHAR(64)
  - `payload_auth_tag` VARCHAR(64)
  - `encryption_key_id` VARCHAR(64)
- Keep `payload_json` for backward compatibility during migration; new rows use ciphertext when `CLIENT_CHAT_ENCRYPTION_KEY_BASE64` (or a dedicated `VIDEO_ACTIVITY_ENCRYPTION_KEY_BASE64`) is set.
- Model: encrypt before insert, decrypt when reading. Same key ring / rotation pattern as platform chat.

**Trade-off:** Encrypted payloads cannot be full-text searched in SQL. Search requires either:
- A separate search index (e.g., Elasticsearch) with encrypted-at-rest storage, or
- Application-level search: fetch by meeting, decrypt in memory, filter (works for small datasets).

---

## 2. View Activity When Clicking the Meeting

**Goal:** When a user clicks a meeting (supervision session or team meeting), show that meeting’s chat, polls, and Q&A.

**Current state:**
- Supervision: "View meeting chat & Q&A" in the supervision modal ✓
- Team meetings: API exists (`GET /api/team-meetings/:eventId/activity`) but no UI yet

**To add:**
- **Team meetings:** In the schedule grid or team meeting detail view, add an "Activity" or "Chat & Q&A" section/button that loads and displays activity for that event.
- **Unified meeting detail:** If there is a shared meeting detail modal or page, add an "Activity" tab that shows chat, polls, and Q&A for that meeting.

---

## 3. Search Across Meetings

**Goal:** A searchable list of meetings and their activity so users can find past discussions.

**Options:**

| Approach | Pros | Cons |
|----------|------|------|
| **A. Search by meeting metadata** | Simple: search by title, date, participants. No decryption needed for search. | Cannot search inside chat text. |
| **B. Application-level search** | Can search decrypted content. Works with existing encryption. | Must decrypt in memory; slower for large datasets. |
| **C. Separate search index** | Fast full-text search at scale. | Requires Elasticsearch/OpenSearch; index must be secured. |
| **D. Searchable encryption** | Search without decrypting in app. | Complex (e.g., order-preserving encryption); limited query support. |

**Recommended:** Start with **A + B**:
- **A:** Search by meeting title, date range, participant names, program name.
- **B:** For meetings the user can access, optionally decrypt and search activity in memory (e.g., "search in my meetings’ activity").

**UI:** A "Meeting activity search" page or section:
- Filters: date range, meeting type (supervision / team meeting), program (if applicable).
- Results: list of meetings with snippets of matching activity.
- Click a result → open that meeting’s full activity view.

---

## 4. Program / Class Context

**Goal:** When meetings belong to a program (e.g., 6-week parent-child partnership class), the class lead can see all classes’ chat, polls, and Q&A.

**Data model changes:**

1. **Link meetings to programs**
   - Add `program_id` to `provider_schedule_events` (nullable), or
   - Create `meeting_program_assignments` (event_id, program_id) for many-to-many.
   - For supervision: optionally add `program_id` to `supervision_sessions` if program-based supervision exists.

2. **Class lead / program lead**
   - Use `program_staff` (program_id, user_id) or similar to define who can view all meetings in a program.
   - Or: `program_lead_user_id` on `programs`.

**API:**
- `GET /api/programs/:programId/meeting-activity` – list activity for all meetings in the program (restricted to program lead/staff).
- Include `program_id` in activity list responses when the meeting is program-linked.

**UI:**
- Program/class view: list of "classes" (meetings) in the program.
- Each class shows its chat, polls, Q&A.
- Class lead sees all classes; participants see only their own.

---

## 5. Implementation Phases

### Phase 1: Encryption (high priority)
- Migration: add encryption columns to `video_meeting_activity`.
- Create or reuse `videoActivityEncryption.service.js` (mirror `chatEncryption.service.js`).
- Update `VideoMeetingActivity` model: encrypt on create, decrypt on read.
- Update API responses to return decrypted payloads.

### Phase 2: Meeting-click activity view
- Add activity section/button to team meeting detail (schedule grid, event modal, etc.).
- Ensure supervision "View meeting chat & Q&A" remains the primary entry point.

### Phase 3: Search
- New endpoint: `GET /api/video-meetings/activity-search` with filters (date, type, program, participant).
- Optional: application-level search in activity text for meetings the user can access.
- New UI: "Meeting activity search" page with filters and results.

### Phase 4: Program/class context
- Migration: add `program_id` to `provider_schedule_events` (or equivalent link).
- Migration: add `program_id` to `supervision_sessions` if needed.
- API: `GET /api/programs/:programId/meeting-activity`.
- UI: program view showing all classes and their activity for program leads.

---

## 6. Environment Variables

For encryption (Phase 1):

```env
# Reuse existing chat encryption (recommended for consistency)
CLIENT_CHAT_ENCRYPTION_KEY_BASE64=<32-byte-key-base64>
CLIENT_CHAT_ENCRYPTION_KEY_ID=v1

# Or dedicated key for video activity
VIDEO_ACTIVITY_ENCRYPTION_KEY_BASE64=<32-byte-key-base64>
VIDEO_ACTIVITY_ENCRYPTION_KEY_ID=v1
```

---

## 7. Security Notes

- Encrypt `payload_json`; `participant_identity` can stay plain for access control and display.
- Use the same key management and rotation approach as platform chat.
- Program/class access must enforce: only program staff/leads see all meetings in the program.
