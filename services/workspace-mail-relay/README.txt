GOOGLE WORKSPACE GROUP MAIL RELAY

Purpose: preserve staff/tenant Google Group From/Reply-To addresses without
adding every Group to ai@plottwistco.com's Gmail Send mail as list.

This service is initially DISABLED. Google Admin configuration, an actual
outbound-IP/TLS check, and a small authorized pilot are required before use.
Deploy with Cloud Run IAM authentication required. Grant run.invoker only to
the app's existing runtime service account. Use a dedicated runtime service
account with storage.objectUser on this private state bucket only. Never grant
allUsers or allAuthenticatedUsers. Run the service through the existing VPC
connector with all-traffic egress; leave the main backend's routing unchanged.

Runtime environment:
WORKSPACE_EMAIL_RELAY_ENABLED=false
WORKSPACE_EMAIL_RELAY_DOMAINS=comma-separated verified Workspace domains
WORKSPACE_EMAIL_RELAY_BUCKET=private durable delivery-status bucket
WORKSPACE_EMAIL_RELAY_EXPECTED_IP=verified static NAT IPv4 address

GET /health reports process readiness and the enabled state.
GET /readiness checks the public egress IP with ipify (no app/user data), then
performs only SMTP EHLO/STARTTLS verification. It never sends a message or
claims to have verified the Google Admin rule. Both routes require Cloud Run IAM.
POST /send is disabled until WORKSPACE_EMAIL_RELAY_ENABLED=true. It accepts a
communication key and raw MIME from the authenticated app, validates approved
sender domains/headers/envelopes, strips Bcc from delivered headers, requires
TLS, and dispatches through smtp-relay.gmail.com:587. No app password is used.

The storage precondition lock prevents concurrent or uncertain sends from
being dispatched again. Status objects retain hashes and delivery state only;
MIME, subjects, bodies, recipient addresses and credentials are never stored
here or logged. Do not add a deletion lifecycle to these deduplication records
without a corresponding key-retirement policy. Interrupted DATA transactions
stay held for manual review. Explicit rejection can retry the same key. A
partial recipient acceptance is recorded, never automatically resent in full.

Backend environment (OFF by default):
WORKSPACE_EMAIL_RELAY_MODE=off | pilot | domains
WORKSPACE_EMAIL_RELAY_SENDERS=comma-separated exact sender addresses for pilot
WORKSPACE_EMAIL_RELAY_DOMAINS=comma-separated approved Workspace domains
WORKSPACE_EMAIL_RELAY_URL=https://the-private-service.run.app
WORKSPACE_EMAIL_RELAY_ADMIN_CONFIRMED=false (true only after administrator setup)

The backend still checks app/tenant staff permissions, approvals, activity holds,
recipient preferences, active sender registration, actual Workspace Group and
active ai@plottwistco.com Group membership. Domain mode removes the per-address
pilot restriction only after a successful pilot; it does not remove those checks.
Selected relay senders never fall back to Gmail or another From on failure.
New staff provisioning validates Group readiness instead of adding a Gmail alias.

Every relay send requires an existing communication record. A stable RFC Message-ID
and delivery key identify that record across retries. The optional Gmail Sent
copy is imported after SMTP acceptance and located by RFC Message-ID on retries.
A failed archive import retains accepted status and archivePending metadata;
it does not cause another send. Communication history retains partial/uncertain
outcomes for administrator review. Missing Sent copies need separate reconciliation.

Google Admin (top-level organization; Gmail Settings privilege):
Apps > Google Workspace > Gmail > Routing > SMTP relay service > Configure.
Name: PlotTwist application Groups.
Allowed senders: Only addresses in my domains.
Authentication: Only accept mail from specified IP addresses; enter the verified
single public egress IP. For this IP-only route, Require SMTP Authentication is
unchecked. Encryption: Require TLS encryption. Save the rule.
Do not configure an Outbound gateway or an unrestricted Any addresses relay.
Verify every intended secondary/tenant domain through the pilot before expansion.

Pilot: first enable the service, keep the backend off, and validate the saved
rule and static IP. Then select one sender with MODE=pilot and administrator
confirmation. Use an explicitly authorized internal recipient; check true From,
Reply-To, email authentication, inline/PDF receipt, Sent/app history, a reply,
and repeat delivery of the same record. Review partial/uncertain results without
blind resends. Expand to verified domains after that passes. Keep old aliases.
Rollback: MODE=off and service ENABLED=false; it must not resend held deliveries.

Tests: npm test (service); backend vitest.workspace-relay.config.js plus existing
copay-receipts and family-email suites. No real SMTP message is needed for tests.

References:
https://knowledge.workspace.google.com/admin/gmail/advanced/route-outgoing-smtp-relay-messages-through-google
https://docs.cloud.google.com/run/docs/configuring/static-outbound-ip
https://nodemailer.com/smtp
