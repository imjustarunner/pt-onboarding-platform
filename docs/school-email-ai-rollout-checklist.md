# School Email AI Rollout Checklist

## Staged Enablement

- Keep `EMAIL_AI_STATUS_DRAFTS_ENABLED=false` in all environments until migrations are applied.
- Run DB migrations including `418_email_ai_policy_and_ticket_drafts.sql`.
- Set agency-level inbound policy in Admin -> Email Settings.
- Click **Sync school group emails → schoolreply** (or run `npm run sync-school-email-inbound` in `backend/`) so every school `itsco_email` is an inbound route on the `schoolreply` identity.
- Add school-level overrides only where needed.
- Enable `EMAIL_AI_STATUS_DRAFTS_ENABLED=true` in staging first, then production.
- Optional: set `EMAIL_AI_REINIT_ENABLED=false` to disable year-update extraction while keeping status drafts.
- Production backend polls unread mail every 5 minutes via `server.js` (`scheduleInboundEmailAgent`). You can still run `npm run email-agent` manually for a one-shot test.

## Manual Verification

- Known school contact sends status request -> ticket appears in support queue with `source_channel = email`.
- Known account holder sends status request -> ticket appears with AI draft populated when client match is clear.
- Unknown sender sends status request -> email is labeled `AI_NEEDS_HUMAN` and no auto-reply is sent.
- Ambiguous client reference -> ticket is created with escalation reason and no safe-to-send draft.
- School staff email year-update details (first day, materials, days/week) on an incomplete collaborative year update -> section data is merged and ticket metadata includes `reinit`.
- Queue reviewer can mark draft accepted/rejected and submit final answer (email tickets send from `schoolreply@itsco.health`).
- Imported contacts in Agency Management -> General tab can be deleted.

## Safety Notes

- Workflow remains draft-only for outbound; humans approve ticket answers before send.
- Sender policy is enforced by agency defaults, with optional school override.
- Ticket metadata stores reason codes for audit and future prompt tuning.
- Reinit intake never auto-finalizes a cycle and never auto-books fall check-in slots.
