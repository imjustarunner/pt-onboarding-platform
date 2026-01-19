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

