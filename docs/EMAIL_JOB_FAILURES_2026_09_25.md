# School status and meeting invitation failures — September 25, 2026

Read-only investigation confirmed two independent preparation failures.

- School status jobs 20, 21, 27, 31, 32, 36, 37, and 38 were pending with `Unknown column 'c.first_name' in 'field list'`. Attempts ranged from 279 to 594 at inspection. The worker retries preparation errors every five minutes.
- The failing query belongs to provider lifecycle task initialization, called before sending an assignment notice. It also selected nonexistent `clients.last_name` and `clients.agency_clearance_json`. The fix uses the existing `full_name`; yearly clearance continues to come from the existing `getDisposition` lookup. The corrected SELECT was verified with EXPLAIN against the connected database schema.
- Invitation 1317 was a pending supervision invitation with a future occurrence, a valid recipient roster and calendar, and no supervision delivery receipt. Its reply Group member list omitted `delivery_settings`. Reading the individual members confirmed the app receives `ALL_MAIL` and the non-app member has `NONE`. The old privacy check rejected the omitted field before sending.
- The reply mailbox now reads the individual member when that field is omitted. It still refuses actual mail delivery to non-app members, elevated non-app roles, missing settings, or failed verification. Privacy rejection has a specific error code rather than the generic `send_failed` fallback.

Verification: 38 focused lifecycle, school email, meeting invitation, supervision delivery, and reply mailbox tests passed. No emails were manually sent, no queue states were reset, and no Google Group memberships were changed during investigation. Pending jobs remain eligible for the existing worker's normal retries after deployment, subject to its current-state checks.
