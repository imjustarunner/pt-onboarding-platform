# School status and meeting invitation failures — September 25, 2026

Read-only investigation confirmed two independent preparation failures.

- School status jobs 20, 21, 27, 31, 32, 36, 37, and 38 were pending with `Unknown column 'c.first_name' in 'field list'`. Attempts ranged from 279 to 594 at inspection. The worker retries preparation errors every five minutes.
- The failing query belongs to provider lifecycle task initialization, called before sending an assignment notice. It also selected nonexistent `clients.last_name` and `clients.agency_clearance_json`. The fix uses the existing `full_name`; yearly clearance continues to come from the existing `getDisposition` lookup. The corrected SELECT was verified with EXPLAIN against the connected database schema.
- Invitation 1317 was a pending supervision invitation with a future occurrence, a valid recipient roster and calendar, and no supervision delivery receipt. Its reply Group member list omitted `delivery_settings`. Reading the individual members confirmed the app receives `ALL_MAIL` and the non-app member has `NONE`. The old privacy check rejected the omitted field before sending.
- The reply mailbox now reads the individual member when that field is omitted. It still refuses actual mail delivery to non-app members, elevated non-app roles, missing settings, or failed verification. Privacy rejection has a specific error code rather than the generic `send_failed` fallback.

Verification: 38 focused lifecycle, school email, meeting invitation, supervision delivery, and reply mailbox tests passed. No emails were manually sent, no queue states were reset, and no Google Group memberships were changed during investigation. Pending jobs remain eligible for the existing worker's normal retries after deployment, subject to its current-state checks.

## Follow-up: inbound SUPPORT handler

A later startup log showed successful provider-task creation but repeated `Field 'school_organization_id' doesn't have a default value` errors. The SUPPORT handler's raw insert omitted the required organization and question context, used a nonexistent `metadata_json` column, and repeated the omissions in its fallback. Schema inspection confirmed these mismatches.

The handler now creates an encrypted ticket under a transaction with a conversation lock, uses a tenant-validated linked school or the tenant organization for general support, preserves the external sender attribution, and commits the conversation link with the ticket. Repeated deliveries reuse the existing ticket. An explicit keyword on the first new reply line is required; quoted OOO instructions, signatures, and mentions of support in ordinary prose do not trigger it.

The email agent now reports `inboxDeliveries` separately from `draftedToTickets`; multiple recipient inbox copies can exceed the scanned Gmail-message count without creating tickets. Missing-author contact-note warnings refer to a skipped chart-note mirror, not failed email delivery. The logged database connection/server startup succeeded, the punycode message is a deprecation warning, and the overlapping-tick message is the scheduler's overlap guard.

Validation: all 134 messaging tests passed; the 13 SUPPORT/agent tests passed again after the counter change. No live tickets or emails were created in verification. Previously ingested messages are not replayed automatically by this code change.

## Follow-up: staff/group auto-replies and the AI From address

Read-only inspection matched the four screenshots to SSO staff inboxes. The sender's work address matched an old guardian testing record (confirmed by the user); that record was left unchanged. The prior OOO handler checked the sender classification and availability but never verified that the inbox owner was an app-only provider.

The new policy permits an OOO reply only for an active, positively verified app-only provider receiving a direct, single-recipient external client/guardian email. Staff, managed-organization addresses, shared inboxes, group/multi-recipient emails, SSO owners, and missing original-recipient context are excluded. Both outbound sender entry points recheck the policy, so old queued OOO messages cannot bypass it. Normal SSO app delivery is immediate; app-only inbox mail is stored immediately and can remain held until the owner's availability window. External client behavior is preserved within the existing agency setting.

The app Gmail transport's primary account is `ai@plottwistco.com`. Its send-as list did not contain any of the four staff From addresses shown in the screenshots. A database sender-identity row alone is insufficient. Outbound Gmail paths now verify the exact accepted send-as address before sending, and reject visible `ai@` senders. Unverified staff aliases must be configured before the app can send from them; incoming email and normal Gmail sending are unaffected. No verification emails or test messages were sent.

A proposed global settings shutdown was rejected by automatic approval review because it would affect unrelated client workflows. It was not executed; the fix uses the narrower eligibility checks above. No global live email settings or account roles were changed.

Validation: 153 messaging tests passed, including SSO and group suppression, guardian-test-record handling, app-only availability holds, preserved external client replies, missing/pending/mismatched Gmail aliases, and old queued OOO suppression. The updated settings component passed Vue parsing.
