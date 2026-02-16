# School Email AI Rollout Checklist

## Staged Enablement

- Keep `EMAIL_AI_STATUS_DRAFTS_ENABLED=false` in all environments until migrations are applied.
- Run DB migrations including `418_email_ai_policy_and_ticket_drafts.sql`.
- Set agency-level inbound policy in Admin -> Email Settings.
- Add school-level overrides only where needed.
- Enable `EMAIL_AI_STATUS_DRAFTS_ENABLED=true` in staging first, then production.

## Manual Verification

- Known school contact sends status request -> ticket appears in support queue with `source_channel = email`.
- Known account holder sends status request -> ticket appears with AI draft populated when client match is clear.
- Unknown sender sends status request -> email is labeled `AI_NEEDS_HUMAN` and no auto-reply is sent.
- Ambiguous client reference -> ticket is created with escalation reason and no safe-to-send draft.
- Queue reviewer can mark draft accepted/rejected and submit final answer.
- Imported contacts in Agency Management -> General tab can be deleted.

## Safety Notes

- Workflow remains draft-only; no outbound auto-send occurs in the status-ticket path.
- Sender policy is enforced by agency defaults, with optional school override.
- Ticket metadata stores reason codes for audit and future prompt tuning.
