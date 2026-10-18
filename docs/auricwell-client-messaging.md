# AuricWell client texting: setup and activation

Implementation is prepared for Notifyre; deployment, secrets, number hosting and
carrier approval are separate steps. No migration or setup action sends texts.
The default platform SMS provider is **Disabled**, and new agency routes are
disabled. Record the executed BAA reference in the platform settings; do not put
API tokens or signing secrets in source control, tickets or chat.

## Deploy

### Current hosting and exact deployment controls

Deployed October 17, 2026 in project `ptonboard-dev`, region `us-west3`.
The backend, main frontend and standalone AuricWell deployments passed for
implementation commit `f8dfc3cef`. The required database migrations are present.

- AuricWell service: `https://auricwell-65v3jdyqba-wm.a.run.app`
- Sign in: `https://auricwell-65v3jdyqba-wm.a.run.app/app`
- Platform settings: `https://auricwell-65v3jdyqba-wm.a.run.app/platform/settings`
- Notifyre webhook: `https://auricwell-65v3jdyqba-wm.a.run.app/api/auricwell-sms/webhook`

The backend values below have already been configured. Secret Manager entries
and backend access permissions are created; secret values still need to be added
and pinned to a backend revision. Clinical SMS remains disabled. No practice
routes or campaign approvals have been invented. The custom domain has not moved.

The public frontend uses Cloud Run's `--no-invoker-iam-check`, like the existing
frontend, because domain-restricted sharing prevents an `allUsers` IAM binding.
Application authentication, MFA and signed-webhook checks remain enforced.
The deployment checks the public login page so an unreachable frontend fails
validation instead of reporting success.

Use GitHub repository **imjustarunner/pt-onboarding-platform → Actions**:

1. Run **Deploy Backend to Cloud Run** on the release commit containing this
   implementation. Wait for the health gate and deployment to succeed.
2. Run **Deploy Frontend to Cloud Run** for the same commit. This updates the
   existing staff Communications Hub.
3. Run **Deploy AuricWell to Cloud Run** for the same commit. This new manual
   workflow builds `auricwell/Dockerfile` from the repository root, uses the
   existing project credentials/artifact repository, and creates service
   `auricwell`. Its GitHub run summary prints the exact service URL, settings URL
   and Notifyre webhook URL. The workflow is available in Actions.

In **Google Cloud Console → project ptonboard-dev → Cloud Run →
onboarding-backend → Edit & deploy new revision → Variables & Secrets**, add or
update these variables, retaining all existing configuration:

| Name | Value during initial service testing |
| --- | --- |
| `AURICWELL_ENABLED` | `true` |
| `AURICWELL_ORIGINS` | `https://auricwell.com,https://auricwell-65v3jdyqba-wm.a.run.app` |
| `AURICWELL_PUBLIC_ORIGIN` | `https://auricwell-65v3jdyqba-wm.a.run.app` |

Click **Deploy**. These variables belong to **onboarding-backend**, not the
frontend, GoDaddy DNS or Notifyre. Do not change the existing encryption key.
The new frontend workflow automatically sets its own `AURICWELL_API_UPSTREAM`
to the backend URL; it does not take Notifyre secrets as environment variables.

Initial setup uses the new service's `/app` and `/platform/settings` paths.
An AuricWell platform operator account with MFA must be provisioned if one does
not exist; a staff-app superadmin role alone is not an AuricWell operator account.
Use the operator-bootstrap process in `docs/auricwell/RUNBOOK.md` with the actual
backend environment; do not enter a password into a workflow argument or commit.

After the standalone service is verified, add an **auricwell.com-only** route to
the existing HTTPS load balancer pointing at the new service, verify TLS and
both `/app` and `/api/auricwell-sms/webhook`, then set `AURICWELL_PUBLIC_ORIGIN` to
`https://auricwell.com`. Existing staff domains must keep their current routes.
The exact load-balancer rule must be reviewed before changing domain traffic.
Until that route is configured, use the generated Cloud Run webhook URL instead
of assuming `https://auricwell.com/api/auricwell-sms/webhook` reaches the new service.

### Deployment prerequisites

1. Apply main database migration `1620_auricwell_client_messaging.sql` using the
   repository migration runner (`node database/run-migrations.js --migration 1620`).
   Earlier AuricWell migrations, including 1619, must already be applied.
2. Deploy the API and AuricWell frontend/server together. The existing
   `AURICWELL_ENABLED=true`, database encryption configuration and practice
   infrastructure/agreement activation gates remain required.
3. Set `AURICWELL_PUBLIC_ORIGIN` to the HTTPS AuricWell origin. Confirm
   `AURICWELL_API_UPSTREAM` points to the API service. The frontend server proxies
   `/api/auricwell-sms/webhook` without parsing or changing the signed body.
4. Deploy the main frontend to expose the shared client inbox in Communications
   Hub. Users need an active linked AuricWell staff membership and verified MFA;
   existing legacy roles alone do not grant patient texting access.

## Configure while campaigns are pending

Open **AuricWell platform integrations** with an MFA-verified platform superadmin.
Practice administrators and individual providers cannot activate a carrier,
change sender numbers or turn on permanent virtual offices.

1. Leave client SMS **Disabled**.
2. Enter the executed Notifyre BAA reference. Configure the API token using
   **Credentials outside the application** below, or use the encrypted app field.
   Use an account/API role permitted to send and receive SMS, not a developer-only
   role. Blank secret fields preserve the saved encrypted values.
3. Add one agency route per practice. Set campaign status to **Submitted —
   awaiting approval** and leave the agency disabled. Enter the patient-facing
   brand, support contact, campaign ID and its two numbers.

   | Agency | Notifications/support | Provider conversations |
   | --- | --- | --- |
   | ITSCO | +17196577444 | +17193684020 |
   | The Inner Strength Institute | Its own assigned number | Its own assigned number |
   | Next Level Up | Its own assigned number | Its own assigned number |

   ITSCO's numbers are not placeholders for the other agencies. Configuration
   does not buy or port numbers, change voice service, or submit campaigns.
4. In Notifyre **Developer → Webhooks**, register the displayed HTTPS webhook
   address for SMS received and SMS sent. Save that endpoint's signing secret in
   Secret Manager and attach its version to the backend, or use the encrypted
   AuricWell field. Signed callbacks are accepted while outbound sending is paused.
5. Receive a real signed callback on a configured number. The setup screen shows
   successful signature verification. Unsigned, altered or stale callbacks fail
   closed. This test is still required against the real account.

## Activate after approval

1. Confirm Notifyre has approved the agency campaign and assigned both numbers to
   it. Complete any SMS hosting/porting with Notifyre, preserving the intended
   voice arrangement separately.
2. Record **Approved by carrier** and the approval evidence/reference; save with
   the agency disabled.
3. Select **Verify saved agency numbers**. This checks account ownership of the
   numbers. It does not independently certify campaign approval: the approval
   reference is the operator's record of the carrier's confirmation.
4. Refresh after the signed callback check, select Notifyre as the platform
   provider, enable the approved agency and save. Each send checks the approval,
   carrier verification, BAA reference, token and signed webhook readiness again.
5. Run the acceptance checks below with consenting test recipients before
   routine client traffic. No automatic carrier fallback is configured.

## Consent and messages

In a client chart, **Messages and reminders** records the authorized patient or
guardian recipient, categories, consent method, evidence, staff actor and time.
Changing the recipient or enabling a new category requires affirmative consent.
An inbound inquiry permits a direct response for 72 hours, not enrollment in
recurring notifications. Shared/ambiguous chart phone matches require support
review; they do not guess a provider or enroll another chart.

| Category | Delivery | Category opt-out |
| --- | --- | --- |
| Appointment reminders | Confirmation, day-before and hour-before windows; late bookings avoid overlapping reminders | NOREMIND |
| Virtual-session links | Separate text approximately five minutes before the scheduled visit | NOLINK |
| Forms/documents | One notice per intake assignment/review cycle or unsigned document recipient | NOFORM |
| Account/billing | Staff-triggered secure billing notice; balance and billing access checked again at send time | Portal category preference |
| Staff/provider conversations | Authorized app replies or approved staff phone relay | Portal category preference |

The minute-based worker may send a five-minute link slightly after that threshold.
Form/document texts link to the authenticated portal. Session links use the
existing appointment video transport. Cancelled/rescheduled appointments,
completed forms, revoked recipient access and changed patient phone numbers
suppress queued messages. Obsolete reminder windows expire instead of being
sent in a backlog after campaign activation.

`STOP` blocks SMS for that phone across the connected agency routes, including
staff replies and billing notices. `START` restores transport eligibility but
preserves category preferences and consent requirements. The carrier supplies
the standard STOP/START confirmation; the app does not duplicate it. STOP also
creates an app notice and an email explaining how to text START. SMS opt-out
does not change a balance, discharge a client or trigger collections.

## Support and provider inboxes

- Main-number messages appear in the support/admin inbox. Provider-number
  messages route only to a single enabled assigned provider, or to support for
  review. An administrator can choose among enabled care-team providers in the
  conversation when an assignment needs clarification.
- The same client text history is available in the AuricWell chart, AuricWell
  Messages and the linked Communications Hub client inbox. Replies identify
  the employee and whether they came from the app or a staff phone.
- In **Texting operations**, configure provider texting separately from phone
  forwarding. Provider texting can work entirely in the app without a staff
  mobile number. Forwarding requires staff consent, device approval, an approved
  number, timezone and work hours.
- Relays include a unique code such as `(ConBen)` or an unknown-contact number.
  Reply `ConBen Your message` or `ConBen CLOSED`. Codes are case-insensitive and
  stripped from the client's copy. Missing, unknown, off-duty or unauthorized
  replies fail closed; staff should review errors in the inbox. Codes are never
  reassigned to another conversation.
- Only explicitly approved, exact-match FAQ questions produce an automated
  answer. They are labelled automated and still leave the thread needing staff
  attention. A failed staff reply also leaves it needing attention.
- Only resolved conversations auto-close (default seven days). Unanswered
  messages stay open; new inbound messages reopen conversations.
- Media messages are flagged for review; attachments are not automatically
  downloaded or forwarded. Staff review them in the authorized carrier account.

## Delivery review and switching carriers

Messages enter an encrypted durable outbox. Worker claims prevent duplicate sends
across processes. Consent, STOP state, recipient access, source status and staff
authorization are checked immediately before the carrier call. A timeout or
uncertain receipt goes to **needs review** and is not blindly retried. In delivery
activity, confirm in the carrier account that a message was not sent before
retrying. Rejected inbound events can be retried after correcting the cause.

Platform superadmins can later switch to Vonage after server-side clinical
readiness is enabled (`VONAGE_CLINICAL_APPROVED=true`), its clinical campaign is
approved, and the agency numbers have been verified for that carrier. Both
numbers must belong to the agency's registered clinical campaign and support
care, reminder and billing purposes. Workforce Campaign 2 remains separate.
Preferences and global STOP records survive a carrier switch. Changing an API
token or number invalidates the applicable verification; uncertain old sends
still require review. Always-available virtual offices remain a separate,
platform-only feature that is disabled by default.

## Acceptance checks after carrier approval

Use synthetic/test clients and consenting staff devices:

1. Verify both numbers, inbound signature handling, outbound receipts and the
   correct agency branding. Test an actual delivered and failed message.
2. Verify NOREMIND, NOLINK and NOFORM independently; confirm unaffected categories
   still work. Test that forms completed before dispatch are suppressed.
3. STOP on the main number, then attempt a provider-number reply and a billing
   notice. Both must be blocked. Confirm the email/app notice, then START and
   confirm category opt-outs remain. Check same-account cross-agency behavior
   against Notifyre's actual suppression settings.
4. Confirm Y against one upcoming appointment; ambiguous appointments must not
   be automatically confirmed.
5. Test assigned-provider routing, unknown-number support routing, two clients
   with similar names, lower/uppercase relay codes, malformed replies, CLOSED,
   off-duty forwarding and revoked staff access.
6. Test an opted-in virtual visit, cancelled/rescheduled visit and NOREMIND with
   session links still enabled. Confirm the actual client device/browser can
   open the intended appointment link.

Local validation uses the disposable MySQL integration suite
(`cd backend && npm run test:auricwell`) with synthetic data and fake carriers,
plus both frontend builds. It does not establish real carrier delivery or deploy
the migration to production.

## Credentials outside the application

Google Secret Manager is supported on the **onboarding-backend** Cloud Run
service. The frontend never receives these credentials.

| Secret Manager secret | Backend secret-reference environment variable |
| --- | --- |
| `auricwell-notifyre-api-token` | `AURICWELL_NOTIFYRE_API_TOKEN` |
| `auricwell-notifyre-webhook-secret` | `AURICWELL_NOTIFYRE_WEBHOOK_SECRET` |

In project `ptonboard-dev`, open each secret, choose **New version**, and enter
its value. For the API token, use the token from Notifyre Developer → API Tokens.
For the webhook secret, use the Signing Secret displayed after creating the
webhook. Do not use the API token as the signing secret.

Once both versions exist, edit onboarding-backend → Containers → Variables &
Secrets → Reference a secret. Add the two mappings above, selecting the actual
numbered versions, and deploy. Do not attach an empty secret: Cloud Run cannot
start a revision that references a nonexistent secret version. The backend
service account needs Secret Manager Secret Accessor on these two secrets.

Runtime credentials override app-stored credentials. Settings show “configured
in Google Secret Manager,” omit the input controls, and never persist the runtime
values into the settings document. Rotating the token invalidates the account's
number verification and disables affected agency routes. Rotating the webhook
secret requires a fresh signed callback before sending resumes.

Use the standalone service's `/api/auricwell-sms/webhook` endpoint for this
integration. `/api/notifyre/webhook` remains the existing staff application's
legacy receiver and must not be substituted. In Notifyre select **SMS Sent** and
**SMS Received**; optionally select **MMS Received** to flag incoming media for
staff review. No fax events are required. Keep the carrier disabled and agency
routes off while campaign approval and number hosting/porting are pending.
