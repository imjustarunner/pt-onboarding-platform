# Provider ↔ School Staff Messaging – Feature Plan

## Current State

### What exists today

1. **School staff ↔ School staff messaging**
   - School staff can message each other from the School staff panel (Message button on each staff card).
   - Uses the same platform chat (direct threads) with `agencyId` = school org id.
   - Opens the global PlatformChatDrawer; threads appear in the chat list.
   - Messages are private between the two participants (1:1).

2. **School staff → Provider messaging**
   - School staff can message providers from the provider’s profile in the school portal (Providers → select provider → “Message provider”).
   - Creates a 1:1 direct chat thread between that school staff user and the provider.
   - Messages are correctly attributed to the individual school staff member (not the whole school).
   - Uses `POST /chat/threads/direct` with `organizationId` for school-scoped threads.

2. **Provider replies**
   - Providers can see threads in `PlatformChatDrawer` (global chat rail).
   - When school staff sends a message, the provider sees it in their chat list and can reply.
   - `chat_message` notifications are created for recipients.

3. **Provider → School staff initiation**
   - Providers cannot currently initiate a chat with school staff from the UI.
   - The chat drawer’s presence list shows agency users; school staff may not appear if they’re only in the school org (not the parent agency).
   - There is no “Message school staff” or “School staff” section in the provider’s chat or school portal.

### What to verify

1. **School staff chat notifications**
   - Confirm that `chat_message` notifications are delivered to school staff when they are offline.
   - Confirm `presence.controller.js` converts unread chat messages into notifications when the recipient goes offline.

2. **School staff → Provider 1:1**
   - Already correct: each message is from the logged-in school staff user.

---

## Proposed Enhancements

### 1. Provider-initiated school staff messaging

**Goal:** Allow providers to start a conversation with school staff at a school they serve.

**Options:**

- **A. School staff list in provider view**
  - Add a “School staff” or “Contacts” section in the school portal when a provider is viewing it.
  - Provider can click a school staff member and open a chat.

- **B. Provider profile → school staff**
  - When a provider views their own school profile (or a school they’re assigned to), show a list of school staff contacts.
  - Provider clicks a school staff member to open a chat.

- **C. Chat drawer**
  - Include school staff in the presence list when the provider is in a school context.
  - Ensure school staff are visible in the agency’s presence for school-affiliated orgs.

### 2. School staff notifications and navigation

**Goal:** School staff can see and act on new messages.

**Implementation:**

- **A. Chat notifications**
  - Ensure `chat_message` notifications are created for school staff recipients.
  - Ensure school staff receive notifications when they’re offline.

- **B. Notification → chat**
  - When a school staff user clicks a notification for a chat message, open the chat thread (e.g. PlatformChatDrawer or a dedicated chat view).

- **C. Message card on school portal**
  - Add a “Messages” card on the school portal dashboard.
  - Shows unread count and links to the chat interface.
  - School staff can open it from the dashboard.

### 3. Chat UI placement

**Current:** Provider profile has messages in the right panel.

**Proposed:**

- Keep the same message panel for provider profiles.
- School staff can open messages from:
  - Provider profile (when viewing a provider).
  - Dashboard “Messages” card.
  - Notifications (click → open chat).

---

## Technical Notes

### Chat backend

- `createOrGetDirectThread` accepts `agencyId`, `organizationId`, `otherUserId`.
- `assertAgencyOrOrgAccess` allows org access (school staff).
- `otherUserId` must be in the agency or on the agency management team.
- School staff are in `user_agencies` for the school org; the agency may be the affiliated parent agency.

### Presence

- `/presence/agency/:agencyId` returns users in that agency.
- School staff may be in the school org only; presence may need to include school org members for school-affiliated providers.

### Notifications

- `chat_message` type exists.
- `related_entity_type: 'chat_thread'`, `related_entity_id: threadId`.
- Notification click handler should open the chat thread.

### Encryption

- Platform chat messages (`chat_messages.body`) are stored as plaintext at rest.
- The `chatEncryption.service` is used for ClientNotes and clinical notes, not for platform chat.
- If encryption-at-rest for chat is required, it would need to be added to the chat send/list flow.

---

## Implementation Order

1. **Verify** school staff receive `chat_message` notifications and can open chat from them.
2. **Add** “Messages” card to school portal dashboard (unread count + link to chat).
3. **Add** provider-initiated school staff messaging (school staff list in provider view or school portal).
4. **Optional:** Add school staff to presence when provider is in school context.
