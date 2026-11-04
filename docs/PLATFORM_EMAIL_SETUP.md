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

For the Gmail transport, the impersonated user must have “Send mail as” permission
for this address. Eligible managed Group senders can instead use the configured
Workspace SMTP relay described below.

## Workspace Group SMTP relay

The shared outbound sender checks the configured relay before requiring a Gmail
Send mail as alias. A managed Group with verified app-manager membership and an
active tenant sender identity can send through an approved relay domain. Group
creation alone does not authorize sending or enable a new domain.

Keep these backend settings consistent with the relay service:

- `WORKSPACE_EMAIL_RELAY_MODE=domains`
- `WORKSPACE_EMAIL_RELAY_ADMIN_CONFIRMED=true`
- `WORKSPACE_EMAIL_RELAY_DOMAINS`: explicitly approved Workspace domains
- `WORKSPACE_EMAIL_RELAY_GMAIL_SENDERS`: retained addresses that must keep using
  Gmail; preserve the existing list when adding a relay domain
- `WORKSPACE_EMAIL_RELAY_URL`: the existing authenticated private relay service

As of November 4, 2026, the approved relay domains are `innerstrengthin.com`,
`itsco.health`, `mh4kidz.org`, `nextleveluplcc.com`, `plottwistco.com` and
`auricwell.com`. All 99 existing Gmail exceptions are retained. Other domains in
the provisioning catalog are not implicitly relay-approved. Do not add Gmail
aliases, remove existing aliases or substitute a different sender just because
the shared Gmail account has reached its alias limit.

Verify Group ownership/app membership, active app sender registration and relay
readiness before use. Preserve deliberately disabled sender identities, private
IAM, TLS and static egress. Readiness can be checked with authenticated
EHLO/STARTTLS without submitting DATA or sending a message.

Appointment reminders use `notifications@auricwell.com` with display name
`AuricWell Notifications`; native appointment configuration uses
`AURICWELL_APPOINTMENT_EMAIL_FROM`, separately from account mail. Clinical tenant
reminders resolve the registered `clinical_appointment_reminders` identity.

Provider-authored cancellations use the work mailbox resolver. For Workspace SSO
users, it selects tenant `messages@`, with the provider's official work email as
Reply-To and tenant support CC. Preserve that envelope through approval/retry.
The provider/support contact-gap report contains client initials, not full names.
Currently affiliated guardians can receive operational notices with disabled or
pending portal access; this does not enable login or chart access. Explicit
revoked/no-contact relationships and notification declines still apply.

School appointment reminder opt-outs affect reminders only. Cancellation and
schedule-change choices remain separate. Completed Cancel Day reviews are never
automatically replayed: confirmed unsent family notices require a fresh review.

### Tenant messages@ / securemessage@ / notifications@ (Messages Hub + automated notices)

Locked domains: `plottwistco.com`, `itsco.health`, `innerstrengthin.com`, `nextleveluplcc.com`, `mh4kidz.com`, `risereviveco.com`.

1. In Google Admin → Domain-wide Delegation, add `https://www.googleapis.com/auth/gmail.settings.sharing` to the Workspace service account client ID (with existing Gmail scopes), then re-authorize / wait for propagation.
2. Run `node backend/src/scripts/provisionTenantMessageGroups.js` (optional `--dry-run`, `--domain=itsco.health`).
3. Script creates Groups (`messages@` / `securemessage@` / `notifications@`), OWNER `michael@plottwistco.com` (**delivery DISABLED — no mail**), MANAGER `ai@plottwistco.com`, and upserts `email_sender_identities` + shared inboxes for agencies with `feature_flags.workspaceEmailDomain` set to that domain. Sender readiness uses the configured SMTP relay for eligible Groups and Gmail Send-as for retained Gmail routes. External *members* are off on these groups (school hire groups still allow external); anyone can still email the address for replies.
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
