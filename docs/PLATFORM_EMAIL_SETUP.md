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

## Optional: custom From address

To use a different From address (e.g. `noreply@summitstats.com`):

```
GOOGLE_WORKSPACE_FROM_ADDRESS=noreply@summitstats.com
GOOGLE_WORKSPACE_FROM_NAME=Summit Stats Team Challenge
GOOGLE_WORKSPACE_REPLY_TO=support@summitstats.com
```

The impersonated user must have “Send mail as” permission for this address in Gmail.

## Optional: platform sender identity (DB)

To control branding via the admin UI, create a platform sender identity:

- `agency_id`: NULL (platform default)
- `identity_key`: `platform` or `summit_stats`
- `from_email`, `display_name`, `reply_to` as desired

Club manager verification will use this identity when present, otherwise it falls back to the env-based config above.

## Changing emails later

- **Env-based**: Update `GOOGLE_WORKSPACE_FROM_*` env vars
- **DB-based**: Update the platform sender identity via the email-senders admin API
