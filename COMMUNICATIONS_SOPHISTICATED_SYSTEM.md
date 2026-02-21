# Sophisticated Communications System — Implementation Plan

This document outlines how to evolve the PTOnboardingApp communications layer to support:

1. **Multiple users eligible to receive messages for one number** (SMS access pool)
2. **Extensions that route to users' numbers** (voice extension dialing)

---

## Current State

- **Twilio**: SMS + Voice integrated via webhooks
- **Numbers**: `twilio_numbers` + `twilio_number_assignments` (one-to-one: one number → one primary user)
- **Inbound SMS**: Routes to single `ownerUser` (assigned user, provider, default agency user, or support)
- **Inbound Voice**: Routes to single `ownerUser`'s phone; no extension support
- **UI**: `SmsNumbersManagement.vue` for agency settings and number assignments

---

## Phase 1: Multi-Recipient SMS (SMS Access Pool)

### Goal

Allow multiple staff members to be eligible to receive inbound SMS for a single number. When a message arrives, all eligible users are notified; the first to claim/respond handles the thread (or all can see it, depending on mode).

### Schema Changes

**1. Allow multiple active assignments per number**

Current: `TwilioNumberAssignment.assign()` deactivates all other assignments for the number. Change to support multiple active assignments.

- Add `sms_access_enabled` (BOOLEAN) to `twilio_number_assignments` — per-user, per-number toggle for SMS eligibility
- Keep `is_primary` for outbound "default sender" semantics
- Remove the "deactivate others" behavior when adding a new assignment; instead, add/remove users from the pool

**2. Migration**

```sql
-- 4XX_add_sms_access_to_assignments.sql
ALTER TABLE twilio_number_assignments
  ADD COLUMN sms_access_enabled BOOLEAN DEFAULT TRUE AFTER is_primary;

-- Existing assignments: all have SMS access
UPDATE twilio_number_assignments SET sms_access_enabled = TRUE WHERE sms_access_enabled IS NULL;
```

### Routing Logic Changes

**`twilioNumberRouting.service.js`**

- `resolveInboundRoute()`: Instead of returning single `ownerUser`, return `eligibleUserIds[]` (all users with `sms_access_enabled` for that number)
- Keep backward compatibility: if only one user, behave as today
- Add `resolvePrimaryOwnerForNumber(numberId)` for "default" owner (first primary, or first in list)

**`twilioWebhook.controller.js` (inbound SMS)**

- When inbound SMS arrives:
  1. Resolve `eligibleUserIds` from routing
  2. Create `MessageLog` with `assigned_user_id` = null initially (or first eligible user for backward compat)
  3. Create `inbound_client_message` notification for **all** eligible users (not just one)
  4. Optionally: create a "claimable" task — first user to open/claim gets `assigned_user_id` set

### API Changes

**`GET /api/sms-numbers/agency/:agencyId/assignments`** (or extend existing)

- Return per-number list of users with `sms_access_enabled` flag
- Support `PATCH` to add/remove users and toggle `sms_access_enabled` per user

**`TwilioNumberAssignment` model**

- `addToPool({ numberId, userId, smsAccessEnabled, isPrimary })` — add user without removing others
- `removeFromPool({ numberId, userId })` — deactivate assignment
- `listEligibleUsersForNumber(numberId)` — all users with `sms_access_enabled = TRUE`

### UI Changes

- **User Management** (or SmsNumbersManagement): Per-number, show list of users with SMS access toggles (On/Off)
- "Accessing N numbers" / "Accessing N extensions" style display (extensions in Phase 2)

---

## Phase 2: Extensions (Voice Extension Routing)

### Goal

Allow staff to have extensions (e.g., 101, 102) that callers can dial after calling the main number. The system routes the call to that user's configured phone.

### Schema Changes

**1. Extensions table**

```sql
-- 4XX_create_user_extensions.sql
CREATE TABLE user_extensions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  extension VARCHAR(20) NOT NULL,
  number_id INT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_agency_extension (agency_id, extension),
  UNIQUE KEY uniq_number_user (number_id, user_id),
  INDEX idx_agency (agency_id),
  INDEX idx_number (number_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (number_id) REFERENCES twilio_numbers(id) ON DELETE SET NULL
);
```

- `extension`: e.g. "101", "102"
- `number_id`: optional — which Twilio number this extension is reachable via (null = any agency number)

### Voice Flow Changes

**Option A: "Press extension" (IVR)**

1. Caller dials main number
2. Twilio hits `/api/twilio/voice/inbound`
3. If `Digits` not provided: respond with `<Gather>` — "Press the extension you wish to reach, or stay on the line for the main line"
4. On `Digits`: look up `user_extensions` by `extension` + `number_id` (or agency)
5. Route to that user's phone via `<Dial><Number>`

**Option B: Direct extension dialing (e.g., +1-555-123-4567 ext 101)**

- Twilio supports `sendDigits` to pass extension after dial. Requires caller to dial main number + extension in one go (some carriers support this).
- Simpler: use Option A (Gather) for in-app control.

**`twilioVoice.controller.js`**

- `inboundVoiceWebhook`: Check for `Digits` in `req.body`
- If no Digits: return TwiML with `<Gather numDigits="3" action="...?withDigits=1" timeout="5">` + prompt
- If Digits: `resolveExtension(extension, numberId)` → get `user_id` → fetch user's phone → `<Dial><Number>`

### API Changes

- `GET /api/extensions/agency/:agencyId` — list extensions for agency
- `POST /api/extensions` — create extension (agency_id, user_id, extension, number_id?)
- `PATCH /api/extensions/:id` — update
- `DELETE /api/extensions/:id` — deactivate

### UI Changes

- **Extension access** section in User Management: "Accessing N Extensions" with list
- Admin: assign extensions to users, optionally scoped to specific numbers

---

## Phase 3: Optional Enhancements

- **First-to-claim semantics**: When multiple users get the notification, first to open the thread becomes the "assigned" provider (update `MessageLog.assigned_user_id` or similar)
- **Round-robin / load balancing**: Distribute new threads evenly across pool
- **Extension-based SMS**: When replying, allow "Reply to extension 101" for shared numbers (metadata in thread)

---

## Implementation Order

| Phase | Effort | Impact | Status |
|-------|--------|--------|--------|
| Phase 1: Multi-recipient SMS | Medium | High — matches User Management screenshot | ✅ Implemented |
| Phase 2: Extensions | Medium | High — professional phone system feel | ✅ Implemented |
| Phase 3: Enhancements | Low–Medium | Nice-to-have | Pending |

---

## Dependencies

- Twilio account with SMS + Voice enabled on numbers
- `TWILIO_VOICE_WEBHOOK_URL` pointing to `/api/twilio/voice/inbound`
- `TWILIO_SMS_WEBHOOK_URL` pointing to `/api/twilio/webhook`
