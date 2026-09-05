# Platform Email Setup (Summit Stats Team Challenge)

Club manager verification and other platform-level emails use the same sending mechanism as the rest of the app.

## Why emails might not send

1. **Missing credentials** – Service account or impersonated user not configured
2. **Email sending disabled** – `EMAIL_SENDING_MODE=manual_only` or notifications disabled in platform settings
3. **Gmail scopes** – Domain-wide delegation must include Gmail scopes in Google Admin Console

## Minimum config (emails from platform mailbox)

Set these env vars so emails send from the impersonated user’s address:

```
GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64=<base64-encoded service account JSON>
GOOGLE_WORKSPACE_IMPERSONATE_USER=ai@yourdomain.com
```

Or:

```
GMAIL_IMPERSONATE_USER=ai@yourdomain.com
```

Emails will be sent as `Summit Stats Team Challenge <ai@yourdomain.com>` when no other From address is configured.

## Optional: custom From address / Send-as

To use a different From address (e.g. `noreply@summitstats.com`):

```
GOOGLE_WORKSPACE_FROM_ADDRESS=noreply@summitstats.com
GOOGLE_WORKSPACE_FROM_NAME=Summit Stats Team Challenge
GOOGLE_WORKSPACE_REPLY_TO=support@summitstats.com
```

The impersonated user must have “Send mail as” permission for this address in Gmail.

### Tenant messages@ / securemessage@ / notifications@ (Messages Hub + automated notices)

Locked domains: `plottwistco.com`, `itsco.health`, `innerstrengthin.com`, `nextleveluplcc.com`, `mh4kidz.com`, `risereviveco.com`.

1. In Google Admin → Domain-wide Delegation, add `https://www.googleapis.com/auth/gmail.settings.sharing` to the Workspace service account client ID (with existing Gmail scopes), then re-authorize / wait for propagation.
2. Run `node backend/src/scripts/provisionTenantMessageGroups.js` (optional `--dry-run`, `--domain=itsco.health`).
3. Script creates Groups (`messages@` / `securemessage@` / `notifications@`), OWNER `michael@plottwistco.com` (**delivery DISABLED — no mail**), MANAGER `ai@plottwistco.com`, Gmail Send-as on `ai@`, and upserts `email_sender_identities` + shared inboxes for agencies with `feature_flags.workspaceEmailDomain` set to that domain. External *members* are off on these groups (school hire groups still allow external); anyone can still email the address for replies.
4. **`notifications@`** is the From/Reply-To for automated notices (contact reminder assignment, digests, etc.). Re-run the provision script to create the group if missing and to upsert the `notifications` sender identity.

### Hire / individual work-email groups (`hireAccountMode: group_password`)

App-created hire mailboxes (e.g. `eden@itsco.health`) use the same ownership pattern:

| Role | Address | Delivery |
|------|---------|----------|
| OWNER | `michael@plottwistco.com` | **DISABLED** (no mail) |
| MANAGER | `ai@plottwistco.com` | ALL_MAIL |

- **Do not** add the hire’s personal email as a Google Group member — personal mail stays in the app.
- **Allow external members:** OFF. **Who can join:** Invited only. **Who can post:** Anyone on the web (so outsiders can *email* the address).
- When the user is marked **terminated**, **inactive**, or **archived**, the app deletes their hire Google Group automatically.

## Optional: platform sender identity (DB)

To control branding via the admin UI, create a platform sender identity:

- `agency_id`: NULL (platform default)
- `identity_key`: `platform` or `summit_stats`
- `from_email`, `display_name`, `reply_to` as desired

Club manager verification will use this identity when present, otherwise it falls back to the env-based config above.

## Changing emails later

- **Env-based**: Update `GOOGLE_WORKSPACE_FROM_*` env vars
- **DB-based**: Update the platform sender identity via the email-senders admin API
