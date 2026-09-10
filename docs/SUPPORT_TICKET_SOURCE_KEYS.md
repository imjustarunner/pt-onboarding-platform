# Support Ticket Source Keys

Use `support_tickets.created_by_source_key` for requests that originate outside a logged-in users-table identity.

## Current keys

- `forgot_username` - public "forgot username" help request
- `info_request` - generic public info/support request
- `mailing_list` - mailing list signup request
- `external_request` - fallback/default external source
- `public_school_referral` - public school referral finder
- `public_school_intake_splash` - public school intake splash
- `guardian_temp_password` / `guardian_access_token` - guardian access flows
- `public_agency_support` - public agency support
- `prehire_portal_chat` - pre-hire portal chat
- `client_renewal` - client renewal hub
- `misdirected_email` - misdirected email report
- `inbound_email` - school support email ingested by the inbound agent (no users-table author)

## Conventions

- Keep keys lowercase with underscores.
- Keep keys stable once used in production (they become reporting dimensions).
- Prefer creating new keys over overloading existing meaning.
- For internal/user-created tickets, leave `created_by_source_key` null and use `created_by_user_id`.

## Usage pattern

- External/public request: `created_by_user_id = NULL`, `created_by_source_key = <key>`.
- Authenticated user request: `created_by_user_id = <user_id>`, `created_by_source_key = NULL`.
- Inbound school email: `created_by_user_id = NULL` (or matched user if known), `created_by_source_key = inbound_email`, display `source_email_from`.
