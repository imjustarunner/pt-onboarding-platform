# Client and guardian START enrollment

For the main application's approved Notifyre client campaigns with START/UNSTOP
support enabled (`allowRestart`), a new authenticated START or UNSTOP records
phone consent for the campaign's registered `reminders` and `care` purposes.
Either sending number on the same campaign reaches the same phone ledger.
Marketing, billing, account-security and workforce purposes are not enrolled.
Vonage staff programs and the standalone AuricWell messaging routes retain their
existing keyword flows. An explicitly configured `startEnrollment` flow also
retains its existing approved disclosure and identity-review requirements,
including its explicit disabled state. Inner Strength's existing registration
has no such separate flow and uses the automatic relationship checks here.

The existing `sms_recipient_permissions` and append-only `sms_permission_events`
tables store the phone, campaign, receiving number, provider receipt ID, carrier
timestamp, purposes, policy version and disclosure. No migration is needed. No
human actor or signature is invented. Historical START events are not converted
into new consent, and historical signed disclosures remain reviewable without
rewriting their original contents.

An unknown phone retains its new grant. Effective preference reads and the final
SMS sending gate resolve the current client/guardian relationship each time.
A later enrollment No or saved reminder-channel decline takes precedence for
that category; an older decline can be superseded by a fresh START. Revoked,
ambiguous, inactive and archived relationships cannot activate the grant.
Changing a chart's phone does not transfer the old phone's permission. When a
send names a client, another child's permission cannot authorize that send.

Account restart and both purpose grants commit in one transaction under the
existing program/phone consent lock and account phone-state row lock. Provider
receipt IDs deduplicate events. Delayed START cannot undo a newer STOP; STOP
wins timestamp ties. Same-timestamp STARTs for distinct programs remain separate.
A new START refreshes existing recipients' future reminder schedules using the
existing reconciliation, which does not replay attempted deliveries. Scheduling
failures can retry without regranting consent or replaying a confirmation.

NOREMIND and NOPROVIDER remain separate category declines. STOP remains the
Notifyre account-wide block. The registered keyword owner continues sending
START confirmations; provider-forwarding category confirmations retain their
existing behavior. Existing delivery readiness, tenant pause and staff-access
checks continue to apply.

Validation:

- `frontend/node_modules/.bin/vitest run --config backend/vitest.sms-start.config.js`
- `frontend/node_modules/.bin/vitest run --config backend/vitest.sms-carrier.config.js`
- The latter includes local HTTP webhook tests and requires loopback access.
- Compile the SMS settings Vue template; no full frontend build is required for
  its wording-only change.

This implementation does not send live texts, alter carrier registrations,
change production settings or deploy itself. After deployment, verify START,
STOP, NOREMIND and NOPROVIDER with an authorized test recipient through the
normal carrier webhook; preserve receipt and delivery evidence.
