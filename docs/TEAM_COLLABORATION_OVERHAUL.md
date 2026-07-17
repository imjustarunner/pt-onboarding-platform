# Team Collaboration & Internal Communication Module

**Slack-inspired overhaul for Mental Health SaaS**  
Status: Phase 1–2 done · Phase 3 Channels foundation started · Spec supersedes fragmented presence UX in chat vs Team Board

Related docs:

- [`Presence_module.md`](../Presence_module.md) — original Team Board / In-Out status proposal (still valid for roster views; status entry moves into chat)
- [`TEAM_BOARD_ROLES_AND_COVERAGE.md`](./TEAM_BOARD_ROLES_AND_COVERAGE.md) — role slots & coverage; Team Board becomes a **view** of unified status, not a separate product

---

## 1. Current-state audit

### Two disconnected presence systems

| System | Storage | UI | Problem |
|--------|---------|-----|---------|
| Chat heartbeat | `user_presence` | Messages drawer Online/Idle/Offline | Admin/super_admin default `availability_level=offline` until Go Online; heartbeat offline window too short |
| Team Board | `user_presence_status` | Dashboard widget + `/admin/presence` | Rarely used; never drives chat dots |

### Known bugs (addressed in Phase 1)

1. **Pending chats always green** — `PlatformChatDrawer` hardcoded `dot-online` on unread rows.
2. **Admin default offline** — heartbeat alone does not show admins Online.
3. **Self excluded** — Online list empty when only you are online (rail count can still include self).
4. **Heartbeat vs offline mismatch** — offline after 2 min without heartbeat; heartbeats pause on hidden tabs and can be 90–300s apart.
5. **`support` excluded** from admin-like availability / status UX.
6. **Timeout/logout never asks for status** — Timedown only offers “I’m still here.”

---

## 2. Unified presence model

```
DOM activity / heartbeat ──┐
                           ├──► computePresence ──► Sidebar dots + labels
Rich status (reason/time) ─┘
Timedown / Logout ──► StatusPromptModal
                         ├── Idle ≤ 2h ──► pause Timedown, show Away
                         ├── Out for day / skip ──► Session Ended
                         └── Still here / I’m back ──► Active
```

### Display status (Slack-like)

| Dot | Meaning | Source |
|-----|---------|--------|
| Green | Online / Active | Fresh heartbeat + working / no away status |
| Orange | Away / Idle | Manual idle status **or** heartbeat idle |
| Gray | Offline | Stale heartbeat, availability offline, or logged out |
| Later | In Session, Focused, DND | Calendar sync / focused modes (Phase 3+) |

### Rich status catalog (admin / super_admin / support)

**Out for (quick reasons):** Meal · Fitness · Family · Personal  

**Reachable while out:** Available for Call · Available for Text · Available for Call & Text  

**Longer:** Out for the Day · Returning at [time]  

Mapped onto `user_presence_status` via `status` enum + new `reason`, `display_label`, `session_extend_until`.

### Session extension rules (privileged roles only)

1. Idle → Timedown (admin floor 5 min idle + 10 min countdown; agency overrides apply).
2. On Timedown **and** manual logout: show Status Prompt.
3. Choosing away/idle with duration ≤ **2 hours**:
   - Upsert rich status; chat presence computes as `idle`/`away`
   - Pause Timedown; keep session alive
   - Continue away-aware heartbeats so user stays Away, not Offline
4. Hard cap: **2 hours** from status set.
5. On expiry: prompt again; ignore through grace Timedown → Session Ended.
6. “I’m still here” / “I’m back” clears away status → Active.

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
├── Files / Calendar / Tasks ← later
├── Bookmarks
├── Voice Huddles / Video    ← later (existing meetings)
├── Notifications
└── Settings
```

**Left sidebar (Phase 2):** collapsible; org header stub; DM-first list sorted Online → Away → Offline; self status footer; stubs for Threads / Mentions / Channels.

**Organization / workspace switcher** (ITSCO, Next Level Up, MH4Kidz, Plot Twist, RiseRevive, TMRC) — Phase 3+.

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

**Still next within Phase 3+:**
1. Channel member management (invite / remove) for private channels  
2. Threads + Mentions inbox  
3. Rich composer upgrades (already partial: reactions, attachments)  
4. Files / Bookmarks / Pins  
5. Tasks + Calendar from messages  
6. Voice huddles / video (leverage existing meetings)  
7. AI assistant hooks  
8. Calendar-synced presence (In Session, Supervision, Meeting)  
9. Workspace switcher across ITSCO / NLU / etc.

Feature-flag each slice and ship independently.

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
| Chat drawer | `frontend/src/components/PlatformChatDrawer.vue` |
| Activity / Timedown | `frontend/src/utils/activityTracker.js` |
| Status prompt | `frontend/src/components/StatusPromptModal.vue` |
| Migration (presence) | `database/migrations/962_user_presence_status_rich_fields.sql` |
| Migration (channels) | `database/migrations/963_chat_channels_foundation.sql` |
| Channels API | `backend/src/controllers/chatChannels.controller.js` |
