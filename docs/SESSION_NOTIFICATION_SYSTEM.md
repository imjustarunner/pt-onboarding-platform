# Session Notification System

Fully customizable multi-channel notifications for unified booking appointments. Extends Phase 4 reminders into a platform → tenant → user preference stack with buffered provider-pushed updates.

Related: [`UNIFIED_BOOKING_ARCHITECTURE.md`](UNIFIED_BOOKING_ARCHITECTURE.md).

## Channels

Each channel is enabled independently at **platform** (availability) and **tenant** (opt-in) levels:

| Channel | Delivery |
|---------|----------|
| `in_app` | Staff/client inbox via notification dispatcher when a user account exists |
| `email` | EmailService / workspace sender |
| `sms` | Vonage SMS — **consent required** |
| `phone` | Automated voice (scaffold; tenant may enable when voice dialer is production-ready) |

Recipients only receive channels they have opted into. Platform minimums cannot be disabled by user preference.

## Rule layers

```
Platform minimum rules (required floors)
  → Tenant channel enablement + confirmation / standard / additional rules
       → Service-level overrides (optional, later)
            → Client/guardian preferences (timing & optional channels)
                 → Per-appointment scheduled deliveries
```

User preferences may override **optional** timing and channels. They may **not** suppress platform/tenant **required** minimum reminders.

## Notification kinds

1. **Booking confirmation** — after book; prompts interactive reply.
2. **Standard reminder** — required floor (platform and/or tenant): days / hours / minutes before.
3. **Additional reminders** — optional rules (24h, 4h, 1h, …) with channel, timing, recipient, template, confirmation flag.
4. **Provider-pushed update** — intentional “Push Session Update”; never auto-send on every edit.
5. **Buffered change digest** — coalesce edits during buffer (15/30/60 min), then one message.

## Interactive replies (booking-linked)

Reminder / confirmation messages include:

`Reply Y to confirm, N to cancel, R to request a reschedule.`

| Reply | Appointment effect |
|-------|--------------------|
| **Y** (yes / confirm) | Status → `client_confirmed`; provider in-app notice |
| **N** (no / cancel) | Runs cancel policy as client cancel (`canceled_by_client`); package/fee rules apply |
| **R** (reschedule) | Status → `reschedule_requested`; provider notified to pick a new time |

Inbound SMS (Vonage) resolves the client’s next upcoming appointment and applies the reply automatically, then ACKs the client. Staff can also `POST /api/appointments/:id/replies` with `{ body: "Y" }`.

**Free-text (not Y/N/R):** If the client has an upcoming appointment / recent reminder and texts something else, the message:
1. Is logged on the appointment as `pending_review` (needs support)
2. Soft-ACKs the client that a team member will text back
3. Lands in the normal SMS inbox (`message_log`) so staff can continue the thread
4. Notifies assigned staff **and** support (`support_safety_net_alert` — “appointment SMS needs engagement”)

## Provider-pushed updates

Booking UI should show: what changed, who will be notified, available channels, message preview, and whether the client enabled “Send me session changes and important updates.”

Buffer controls: send immediately, cancel pending, edit message, extend buffer, send none.

## APIs

- `GET/PUT /api/platform/session-notification-settings` (super_admin)
- `GET/PUT /api/tenant-booking/agencies/:agencyId/session-notifications`
- `GET/PUT /api/tenant-booking/agencies/:agencyId/clients/:clientId/session-notification-preferences`
- `POST /api/appointments/:id/push-update` — queue or send change notification
- `GET/PATCH/DELETE /api/appointments/:id/pending-update` — buffer controls
- `POST /api/tenant-booking/cron/session-notifications` — reminders + buffer drain

## Cron

Set `CRON_SECRET` or `BOOKING_CRON_SECRET`. Hit:

`POST /api/tenant-booking/cron/session-notifications` with header `x-cron-secret`.
