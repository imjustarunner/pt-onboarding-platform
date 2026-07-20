# Team Collaboration & Internal Communication Module

**Slack-inspired overhaul for Mental Health SaaS**  
Status: Phase 1–2 done · Phase 3 Channels, members, Threads/Mentions, rich composer, full-page Messages, Files/Bookmarks/Pins, Tickets desk + ticket encryption, Tasks/Calendar from messages, DM video/huddle, calendar-busy presence labels, guardian↔provider inbox, unified multi-tenant Messages, guardian support tickets, medical billing access flag shipped · Spec supersedes fragmented presence UX in chat vs Team Board

Related docs:

- [`Presence_module.md`](../Presence_module.md) — original Team Board / In-Out status proposal (still valid for roster views; status entry moves into chat)
- [`TEAM_BOARD_ROLES_AND_COVERAGE.md`](./TEAM_BOARD_ROLES_AND_COVERAGE.md) — role slots & coverage; Team Board becomes a **view** of unified status, not a separate product

---

## 1. Current-state audit

### Two disconnected presence systems

| System | Storage | UI | Role now |
|--------|---------|-----|----------|
| **Chat presence (authoritative for Messages)** | `user_presence` heartbeat + `session_extend_until` | Messages dots/labels | Active / Idle / Inactive for peers |
| **Legacy Team Board** | `user_presence_status` enums (`out_am`, `in_available`, …) | `/admin/presence` roster only | **Must not drive chat.** Broken for messaging; roster-only |

### Known bugs (addressed in Phase 1+)

1. **Pending chats always green** — `PlatformChatDrawer` hardcoded `dot-online` on unread rows.
2. **Admin default offline** — heartbeat alone does not show admins Online.
3. **Self excluded** — Online list empty when only you are online (rail count can still include self).
4. **Heartbeat vs offline mismatch** — offline after 2 min without heartbeat; heartbeats pause on hidden tabs and can be 90–300s apart.
5. **`support` excluded** from admin-like availability / status UX.
6. **Timeout/logout never asks for status** — Timedown only offers “I’m still here.”
7. **Legacy Team Board leaked into chat** — meal/reason labels and Team Board enums drove peer status; removed. Peers only see Active / Idle / Inactive.

---

## 2. Unified presence model (Messages)

```
DOM activity / heartbeat ──► Active (fresh heartbeat)
Timedown / Logout ──► StatusPromptModal
                         ├── Idle ≤ 2h (session_extend) ──► peer: Idle · self: meal/reason overlay
                         ├── Out for day / skip ──► Session Ended → Inactive
                         └── Still here / I’m back ──► Active
```

### Peer-facing display (Messages / assist / channel members)

| Dot | Peer label | Source |
|-----|------------|--------|
| Green | **Active** | Fresh heartbeat; not in signed-in Idle session |
| Orange | **Idle** | `session_extend_until` active only (Away overlay — timedown but not TIMED OUT). Never expose “Out for Meal” etc. to peers |
| Gray | **Inactive** | Stale/no heartbeat, appear-offline, or timed out |
| Indigo | In Session / Meeting | Calendar busy overlay on **Active** only |

**Do not use for chat:** Team Board status enums, soft 5‑minute activity idle, or `display_label` / reason strings for peers.

### Privileged Team Board (admin / support / super_admin)

`/admin/presence` shows the full Timedown reason labels (“Out for Meal”, “Out for the Day”, return times) so coverage can be planned without extra chat. Support can view the agency Team Board. Messages peers still only see Idle.

### Self-only rich status (admin / super_admin / support)

Stored on `user_presence_status` for the Away overlay + Timedown prompts (self UI + Team Board; not Messages peers):

**Out for (quick reasons):** Meal · Fitness · Family · Personal  

**Reachable while out:** Available for Call · Available for Text · Available for Call & Text  

**Longer:** Out for the Day  

`session_extend_until` is the only field that makes peers show **Idle**.

### Session extension rules (privileged roles only)

1. Idle → Timedown (admin floor 5 min idle + 10 min countdown; agency overrides apply).
2. On Timedown **and** manual logout: show Status Prompt.
3. Choosing away/idle with duration ≤ **2 hours**:
   - Set `session_extend_until`; chat peers see **Idle** (not the meal label)
   - Pause Timedown; keep session alive
   - Continue away-aware heartbeats so the user stays Idle, not Inactive
4. Hard cap: **2 hours** from status set.
5. On expiry: prompt again; ignore through grace Timedown → Session Ended → Inactive.
6. “I’m still here” / “I’m back” clears extend → Active.

Staff/providers keep simple Go Online / Offline until a later phase.

---

## 2b. Direct Messages vs Channels (“chats”)

| Concept | What it is | Who uses it |
|---------|------------|-------------|
| **Direct Messages** | 1:1 private threads (what the Messages rail is today) | Team employees, school staff (school-scoped), providers as contacts |
| **Channels / Chats** | Group collaboration spaces (`#general`, school channels, etc.) | **Team employees only** (Phase 3+). School staff do **not** get channels — DM only |

### DM directory audiences

- **Default (`audience=team`)** — internal team employees only (admin, support, staff, CPA, providers, etc.). Excludes `school_staff`, guardians, kiosk.
- **School staff viewers** — always school-scoped: only people who share their affiliated school(s) (plus providers assigned to those schools). School name is always shown on school staff rows.
- **Privileged toggle** (`admin` / `super_admin` / `support` / `clinical_practice_assistant`) — switch to **Other roles** and filter by role type (School staff, Providers, …) while online indicators still apply.

API: `GET /api/presence/agency/:agencyId?audience=team|directory|school&role=school_staff`

---

## 3. Slack-inspired information architecture

```
Team Communication
├── Home
├── Threads
├── Mentions
├── Direct Messages          ← Phase 2 primary
├── Channels                 ← Phase 3+
│   ├── Organization Wide
│   ├── School Channels
│   ├── Department Channels
│   └── Private Groups
├── AI Assistant             ← later
├── Files / Bookmarks / Pins ← shipped
├── Tasks / Calendar actions ← from message (personal)
├── Voice Huddles / Video    ← DM start-meeting (TEAM_MEETING / HUDDLE)
├── Notifications
└── Settings
```

**Left sidebar (Phase 2):** collapsible; org header stub; DM-first list sorted Online → Away → Offline; self status footer; stubs for Threads / Mentions / Channels.

**Unified multi-tenant Messages** — multi-agency users read/reply across memberships without AgencySelector; Messages-local “Compose in” agency for directory/channels/new DMs.

---

## 4. Phased roadmap

### Phase 1 — Fix presence + status in chat (priority)

- Unify heartbeat + rich status in API responses
- Migration: `reason`, `display_label`, `session_extend_until` on `user_presence_status`
- Align offline threshold with heartbeat cadence
- Treat `support` like admin for status/session-extend
- Fix pending-chat dots; Slack-style self status in drawer
- Status prompt on Timedown + logout; pause Timedown up to 2h

**Acceptance**

- [x] Pending row colors match real presence
- [x] Privileged roles can set Meal/etc. and appear Away with return time
- [x] Timedown → set status → no forced re-login for up to 2h
- [x] Logout can set Out for the Day then end session
- [x] Support role included

### Phase 2 — Slack-inspired Messages shell

- DM-first list (no Online/Idle/Offline silos; sort by presence)
- Self presence footer + status menu
- Nav stubs: Threads, Mentions, Channels
- Keep existing DM thread UI
- **Edge-dockable Messages rail** — click-hold + drag; snaps to left/right/top/bottom; position persisted in `localStorage` (`pt.messages.dock.v1`)

### Phase 3 — Channels foundation (in progress)

**Shipped (first cut):**
- [x] Migration `963_chat_channels_foundation.sql` — `name`, `slug`, `description`, `visibility`, `created_by_user_id`, `archived_at` on `chat_threads`
- [x] `thread_type = 'channel'` reuses `chat_messages` / participants / reads
- [x] Auto `#general` (org-wide) + school auto-channels (`school-{orgId}`) for affiliated schools
- [x] APIs: `GET/POST /api/chat/channels`, `POST .../:id/join`, `POST .../:id/open`
- [x] Messages rail **Channels** tab (team employees only; school_staff stay DM-only)
- [x] Create public/private custom channels (admin / support / staff / CPA)
- [x] Join rules: public = open join; private = members only
- [x] Channel member management — list / invite / remove / leave (`GET|POST /channels/:id/members`, `DELETE .../members/:userId`, `POST .../leave`); private create can seed `memberUserIds`; Members panel in Messages drawer
- [x] Threads + Mentions — migration `1000_chat_reply_threads_and_mentions.sql` (`parent_message_id`, `chat_message_mentions`); reply-in-thread + `@` mentions on send; `GET /chat/inbox/threads` + `GET /chat/inbox/mentions`; Threads/Mentions tabs in Messages drawer
- [x] Rich composer — Messages drawer Attach (upload → stage → send) + inline image/video/file render; emoji reaction chips/picker wired to existing reactions API (replies included)
- [x] Full-page Messages workspace — shared `MessagesWorkspace.vue` powers the edge rail and My Dashboard / `/messages` page (DMs, Channels, Threads, Mentions, members, replies, attach, reactions); responsive list/detail on mobile
- [x] Ticket encryption — `1001_support_ticket_encryption.sql`; question/answer/message bodies use `chatEncryption.service` when key configured (same AES-GCM as chat)
- [x] School_staff DMs — already encrypt via chat path when key set; production fail-closed if key missing for school_staff-involved threads
- [x] Ticket Desk UI — split-pane overhaul (`TicketDeskView.vue`) with metrics, filters, conversation, internal notes, priority; Messages **Tickets** tab embeds compact desk; power actions restored (AI draft, official answer, assign, forward-to-providers, my/all toggle)
- [x] Desk fields — `1002_support_ticket_desk_fields.sql` (`priority`, `is_internal`); display status Open / In Progress / Waiting / Closed
- [x] Files / Bookmarks / Pins — `1003_chat_files_bookmarks_pins.sql`; inbox APIs + Messages tabs; Bookmark/Pin actions on messages
- [x] Tasks + Calendar from messages — message actions create `POST /me/tasks` and `PERSONAL_EVENT` via `POST /users/:meId/schedule-events` (`allowLocalOnly`)
- [x] DM video / huddle — `teamMeetingStart.service.js` + `POST /chat/threads/:threadId/start-meeting`; DM header Start video / Huddle; join link posted into thread
- [x] Calendar-synced presence labels — `calendarPresence.service.js` overlays current session/supervision/meeting onto `/presence/me` + agency roster; Messages shows indigo busy dot + label
- [x] Guardian↔provider secure inbox — guardian portal Messages tab (`GuardianMessagesPanel` + `/guardian-portal/messages*`); encrypted DMs with assigned provider; staff “Message” on client Guardians tab opens same thread
- [x] Unified multi-tenant Messages — omit agency filter on DM/threads/mentions for multi-membership users; thread-scoped writes; Messages-local compose agency (`pt.messages.composeAgencyId.v1`); soft reload on app agency change without closing in-membership chats
- [x] Peer tenant branding — presence attaches viewer-scoped `shared_agency_memberships`; one shared tenant → that brand logo/color; multiple/shared → viewer default brand; “i” hover lists tenants (`PeerTenantMark.vue`)
- [x] Guardian→support queue — `/guardian-portal/support-tickets*`; portal Support tab create/list/reply; Ticket Desk “Creator → Guardian” filter (reuses support_tickets, not a new queue)
- [x] Medical billing access — migration `1004_user_agencies_billing_access.sql` (`has_billing_access`); payroll-style grant + `canManageMedicalBilling` / `billingAgencyIds`; support/staff gated on claims/Claim.MD; providers/admin unchanged

**Still next within Phase 3+:**
1. AI assistant hooks  
2. Channel-wide huddles / voice-only / merge in-meeting chat into Messages  
3. Google Calendar as presence source; hard DND that blocks messages  
4. Multi-provider clinical rooms / Ticket Desk power tools for guardians  

Feature-flag each slice and ship independently.

**Cross-link:** Medical billing capability mirrors payroll (`user_agencies.has_payroll_access`). Agency product flag remains `medicalBillingEnabled`.

---

## 5. Out of scope / later

- Full channel system, huddles, AI, universal search in Phase 1–2
- Forcing staff/providers onto 2h status-extension
- Removing Team Board pages (repurpose as roster)
- HIPAA message class restrictions (design later)
- Life Balance Wheel (separate deferred initiative)

---

## 6. Key implementation files

| Area | Path |
|------|------|
| Spec | `docs/TEAM_COLLABORATION_OVERHAUL.md` |
| Presence API | `backend/src/controllers/presence.controller.js` |
| Status model | `backend/src/models/UserPresenceStatus.model.js` |
| Chat drawer (rail/dock) | `frontend/src/components/PlatformChatDrawer.vue` |
| Messages workspace (shared) | `frontend/src/components/messages/MessagesWorkspace.vue` |
| Full-page Messages | `frontend/src/views/admin/PlatformChatsView.vue` |
| Activity / Timedown | `frontend/src/utils/activityTracker.js` |
| Status prompt | `frontend/src/components/StatusPromptModal.vue` |
| Migration (presence) | `database/migrations/962_user_presence_status_rich_fields.sql` |
| Migration (channels) | `database/migrations/963_chat_channels_foundation.sql` |
| Migration (threads/mentions) | `database/migrations/1000_chat_reply_threads_and_mentions.sql` |
| Migration (ticket encryption) | `database/migrations/1001_support_ticket_encryption.sql` |
| Migration (ticket desk fields) | `database/migrations/1002_support_ticket_desk_fields.sql` |
| Migration (files/bookmarks/pins) | `database/migrations/1003_chat_files_bookmarks_pins.sql` |
| Channels API | `backend/src/controllers/chatChannels.controller.js` |
| Chat API (threads/mentions/files) | `backend/src/controllers/chat.controller.js` |
| Ticket Desk UI | `frontend/src/components/tickets/TicketDeskView.vue` |
| Tickets page | `frontend/src/views/admin/SupportTicketsQueueView.vue` |
| Ticket crypto helpers | `backend/src/utils/supportTicketCrypto.js` |
| Ad-hoc DM meetings | `backend/src/services/teamMeetingStart.service.js` |
| Calendar busy presence | `backend/src/services/calendarPresence.service.js` |
| Guardian messages API | `backend/src/controllers/guardianMessages.controller.js` |
| Guardian support tickets | `backend/src/controllers/guardianSupportTickets.controller.js` |
| Guardian Messages UI | `frontend/src/components/guardian/GuardianMessagesPanel.vue` |
| Medical billing access | `user_agencies.has_billing_access` + `requireMedicalBillingActorAccess` |
| Migration (billing access) | `database/migrations/1004_user_agencies_billing_access.sql` |
