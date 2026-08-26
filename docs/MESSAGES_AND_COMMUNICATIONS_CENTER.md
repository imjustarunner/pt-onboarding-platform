# Messages & Communications Center

## Product model

### Messages (everyone who can message)

**One Messages experience**, reached from:
- My Dashboard → Messages
- Side chat → **Messages Dashboard**
- Communications Center → **Messages** tab

**Route:** `/messages` (and `/:slug/messages`)

**Job:** Personal inbox overview (unread, client SMS, team chat, calls, voicemail, mentions, files) then the conversation workspace (`?view=workspace`). No tickets.

Admins/support use this same Messages UI when they select **Messages** in the Communications Center — not a separate ops-only variant.

### Communications Center (admin, support, super_admin + eligible staff mailbox roles)

**Route:** `/admin/communications` (`?mode=home|messages|support`)

| Section | Purpose |
|---------|---------|
| **Home** (default) | **Unified Inbox** — personal + shared inboxes, attention KPIs, email threads, status/snooze/owner, Linked To, directory compose, send warnings |
| **Messages** | Embeds the **same** Messages dashboard as My Dashboard |
| **Support Hub** | Tickets, engagement/delivery queue, analytics, management tools |

Top-nav **Communications** opens Center **Home** (Unified Inbox). Engagement Feed archive remains at `/admin/communications/feed` (linked from Support Hub tools), not a separate top-nav item.

## Roadmap

Full product plan:

→ [`UNIFIED_COMMUNICATIONS_CENTER_PLAN.md`](./UNIFIED_COMMUNICATIONS_CENTER_PLAN.md)

**Phase 1:** Unified Inbox shell, `communication_*` (1310), ticket-email adapter, Reply/Reply all/Forward, shared inboxes, workflow + Linked To.

**Phase 2:** Personal app mailboxes (1311), membership ACL, personal-email digest opt-in (24/48h), directory typeahead, external/PHI send preflight.

**Phase 3:** Thread actions (attach client/school, task/ticket/referral, school note), SMS/calls/voicemail in unified list (1312), print/download, spam/block, scheduled send + undo delay.

**Phase 4:** Composer AI draft + thread summary/next action (1313), full search (sender/subject/body/attachment/date), Response Time (7d) KPI.

**Phase 5:** SMS reply from unified Home; legacy SMS URLs redirect to Center; Full SMS tools → Messages workspace. Workspace seat removal is an org/IT policy step (not app code).

Later: optional further chat/secure channel unification.

## Role matrix

| Capability | Roles |
|------------|--------|
| Messages | Messaging-capable staff (incl. admin/support as employees) |
| Communications Center / Unified Inbox | admin, support, super_admin (+ eligible staff for personal mailbox APIs) |
| Standalone `/tickets` | CPA, staff, school_staff (+ admins via Support Hub) |

## APIs

| Endpoint | Used by |
|----------|---------|
| `GET /api/messages/dashboard-summary` | Messages + legacy Center summaries |
| `GET /api/communications/center-summary` | Support Hub (org) |
| `GET /api/communications/inboxes` | Unified Inbox selector |
| `POST /api/communications/inboxes/personal/ensure` | Provision personal My Inbox |
| `GET/PATCH /api/communications/prefs` | Personal email digest prefs |
| `GET /api/communications/directory` | Compose recipient typeahead |
| `POST /api/communications/send-preflight` | External / PHI warnings |
| `GET /api/communications/attention-summary` | Unified Inbox KPIs |
| `GET/PATCH /api/communications/conversations` | Unified Inbox list / workflow |
| `GET/POST /api/communications/conversations/:id` | Thread detail / compose |
| `POST /api/communications/conversations/:id/reply` | Reply / internal note / schedule |
| `POST /api/communications/conversations/:id/links` | Attach client/school |
| `POST /api/communications/conversations/:id/actions/*` | Task / ticket / referral / school note |
| `GET /api/communications/conversations/:id/export` | Print / download |
| `POST /api/communications/conversations/:id/spam` | Spam + block sender |
| `POST /api/communications/conversations/:id/ai/draft` | Composer AI assist |
| `POST /api/communications/conversations/:id/ai/insight` | Thread summary + next action |

## Related

- [VONAGE_SMS_IMPLEMENTATION.md](../VONAGE_SMS_IMPLEMENTATION.md)
- [VONAGE_10DLC_PROVIDER_NUMBER_PLAN.md](./VONAGE_10DLC_PROVIDER_NUMBER_PLAN.md) — 10DLC campaigns, per-provider numbers, screenshot evidence pack
- [PLATFORM_EMAIL_SETUP.md](./PLATFORM_EMAIL_SETUP.md)
- [UNIFIED_COMMUNICATIONS_CENTER_PLAN.md](./UNIFIED_COMMUNICATIONS_CENTER_PLAN.md)
