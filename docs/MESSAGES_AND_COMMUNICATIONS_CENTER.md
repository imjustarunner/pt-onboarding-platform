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

### Communications Center (admin, support, super_admin)

**Route:** `/admin/communications` (`?mode=home|messages|support`)

| Section | Purpose |
|---------|---------|
| **Home** (default) | Unified landing: personal Messages signals + Support Hub signals (tickets, delivery/automation queues, unassigned SMS). Nothing new should be easy to miss. |
| **Messages** | Embeds the **same** Messages dashboard as My Dashboard |
| **Support Hub** | Tickets, engagement/delivery queue, analytics, management tools |

Top-nav **Communications** opens Center **Home**. Engagement Feed archive remains at `/admin/communications/feed` (linked from Support Hub tools), not a separate top-nav item.

## Role matrix

| Capability | Roles |
|------------|--------|
| Messages | Messaging-capable staff (incl. admin/support as employees) |
| Communications Center | admin, support, super_admin |
| Standalone `/tickets` | CPA, staff, school_staff (+ admins via Support Hub) |

## APIs

| Endpoint | Used by |
|----------|---------|
| `GET /api/messages/dashboard-summary` | Messages + Center Home (personal) |
| `GET /api/communications/center-summary` | Center Home + Support Hub (org) |

## Related

- [VONAGE_SMS_IMPLEMENTATION.md](../VONAGE_SMS_IMPLEMENTATION.md)
