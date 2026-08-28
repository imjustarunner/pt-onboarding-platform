### Unified Email Service (Gmail API + Service Account + Gemini)

This repo supports a **single Google Service Account** impersonating a single mailbox (default: `ai@plottwistco.com`) to send and read email via the Gmail API, while still sending branded messages for many agencies via Gmail **Send-as aliases**.

## What was added

- **Sender identities (DB)**: `email_sender_identities` + `email_inbound_routes`
  - Stores `from_email`, `display_name`, `reply_to`, plus inbound routing addresses.
- **Notification trigger sender selection (DB)**:
  - `notification_triggers.default_sender_identity_id` (platform default)
  - `agency_notification_trigger_settings.sender_identity_id` (agency override)
- **Unified sender**: `backend/src/services/unifiedEmail/unifiedEmailSender.service.js`
  - `sendNotificationEmail({ agencyId, triggerKey, to, subject, text, html })`
  - Resolves the correct sender identity from the trigger matrix.
- **Inbound AI agent**: `backend/src/services/unifiedEmail/inboundEmailAgent.service.js`
  - Polls unread mail, routes by To/Cc to a sender identity, calls Gemini, replies if safe.
  - Includes loop safety:
    - Ignores emails **from our own aliases**
    - Ignores auto replies: `Auto-Submitted: auto-generated` or `X-Auto-Response-Suppress: All`

## Required env vars

- **Service account credentials**
  - `GOOGLE_APPLICATION_CREDENTIALS=./secrets/service-account.json`
- **Impersonated mailbox**
  - `GMAIL_IMPERSONATE_USER=ai@plottwistco.com`
  - (fallback: `GOOGLE_WORKSPACE_IMPERSONATE_USER`)
- **Gemini**
  - `GEMINI_API_KEY=...`
  - Optional: `GEMINI_MODEL=gemini-2.0-flash`

## Migrations

- `182_create_email_sender_identities_and_notification_email_rules.sql`
  - Creates `email_sender_identities` and `email_inbound_routes` (and also creates a legacy `notification_email_rules` table that is currently not used).
- `183_notification_triggers_add_sender_identity.sql`
  - Adds `default_sender_identity_id` / `sender_identity_id` to the notification trigger matrix tables.

## Admin APIs (super_admin)

- **Sender identities**
  - `GET /api/email-senders?agencyId=<id|null>&includePlatformDefaults=true|false`
  - `POST /api/email-senders`
  - `PUT /api/email-senders/:id`
- **Notification triggers (platform defaults)**
  - `GET /api/notification-triggers`
  - `PUT /api/notification-triggers/:triggerKey/default-sender` with `{ "defaultSenderIdentityId": 123 }`
- **Agency overrides (existing endpoint)**
  - `GET /api/agencies/:id/notification-triggers`
  - `PUT /api/agencies/:id/notification-triggers/:triggerKey` supports `{ senderIdentityId: 123 }`

## Running the inbound agent locally

From `backend/`:

```bash
npm run email-agent
```

Optional:

- `EMAIL_AGENT_MAX_MESSAGES=10`

In production, Cloud Run also runs the inbound agent automatically every **5 minutes** from `server.js` (same pattern as SMS auto-replies / join reminders). Manual `npm run email-agent` is still useful for local testing.

## Sync school group emails onto schoolreply

Creates/updates the agency `schoolreply` sender identity and attaches every affiliated school `itsco_email` as an inbound route (plus `schoolreply@itsco.health` / `schools@itsco.health`):

```bash
npm run sync-school-email-inbound
# or: npm run sync-school-email-inbound -- itsco
```

Also available in Admin → Email Settings → **Sync school group emails → schoolreply**.

## Sync Google Group members → school contacts

Lists every Google Group `schoolreply@itsco.health` belongs to, matches group addresses to each school's `itsco_email`, and upserts member emails into `school_contacts`. Also refreshes inbound routes on `schoolreply`.

```bash
npm run sync-school-group-contacts
# or: npm run sync-school-group-contacts -- itsco schoolreply@itsco.health
```

Admin → Email Settings → **Sync Google Group members → school contacts**.

Requires Google Admin SDK domain-wide delegation scopes on the service account
(**Google Admin → Security → Access and data control → API controls → Domain-wide delegation**,
edit the PlotTwist service-account Client ID):

- `https://www.googleapis.com/auth/admin.directory.user`
- `https://www.googleapis.com/auth/admin.directory.group` _(write — create groups for hire emails; replaces `.group.readonly`)_
- `https://www.googleapis.com/auth/admin.directory.group.member` _(write — add members; replaces `.member.readonly`)_

Directory / Groups provisioning does **not** use the Gmail mailbox (`ai@…`). Set a human admin separately:

- `GOOGLE_WORKSPACE_DIRECTORY_IMPERSONATE_USER` — Workspace **super admin** or delegated **Groups** admin. Used for group sync, hire Group creation (`groups.insert` / `members.insert`), and Directory user lookup.
- Falls back to `GOOGLE_WORKSPACE_IMPERSONATE_USER` when unset (not recommended for `ai@` mailboxes).
- Gmail send/read still impersonates `ai@plottwistco.com` via `GMAIL_IMPERSONATE_USER` / `GOOGLE_WORKSPACE_IMPERSONATE_USER`.

