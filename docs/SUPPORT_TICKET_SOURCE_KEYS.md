# Support Ticket Source Keys

Use `support_tickets.created_by_source_key` for requests that originate outside a logged-in users-table identity.

## Current keys

- `forgot_username` - public "forgot username" help request
- `info_request` - generic public info/support request
- `mailing_list` - mailing list signup request
- `external_request` - fallback/default external source

## Conventions

- Keep keys lowercase with underscores.
- Keep keys stable once used in production (they become reporting dimensions).
- Prefer creating new keys over overloading existing meaning.
- For internal/user-created tickets, leave `created_by_source_key` null and use `created_by_user_id`.

## Usage pattern

- External/public request: `created_by_user_id = NULL`, `created_by_source_key = <key>`.
- Authenticated user request: `created_by_user_id = <user_id>`, `created_by_source_key = NULL`.
