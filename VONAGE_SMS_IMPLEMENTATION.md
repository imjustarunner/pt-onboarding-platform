# Vonage Communication System Implementation (PT Platform)

> Current registration, signed consent, deployment blockers and proof artifacts: [ITSCO SMS audit](docs/VONAGE_10DLC_ITSCO_AUDIT.md). The shared transport now requires approved program configuration and purpose-specific permission; older opt-in flags alone do not enable sends.


## School and family reminder rollout — October 6, 2026

1. **Confirm the actual service site.** The selected school/service location is distinct from the billing office. Office-booking synchronization preserves `service_location_id`; existing reminders also resolve the linked office event or agency-scoped clinical encounter. A billing office alone is displayed as “Service location needs review.” A child’s school enrollment alone does not make every appointment a school visit.
2. **Collect a real choice in enrollment.** Client enrollment includes the communication step even when an older packet omitted it. Standalone ROI, disclosure and job-application links are not converted into enrollment packets. The recipient chooses Yes or No, signs their choices, and supplies the phone they control when requesting texts. All-No completes the step without a phone. The saved intake includes the practice name, disclosure/version/hash, signature, phone, policy links and server timestamp. Printed intake records include this evidence. Staff voting is not part of a client’s enrollment.
3. **Review existing evidence.** In Texting Numbers → Campaign registration and consent → **Enrollment reminder consent audit**, review the paginated client list. “Legacy Yes” is not an activation count; attendance Y, an imported phone number, treatment consent or school ROI does not establish a text subscription. Current signed reminder choices can prefill **Record a recipient’s documented consent** for the selected number; verify recipient authority and the disclosure before activating. For insufficient older evidence, issue a current signing link by email or in person. Do not text an unconsented recipient to request consent.
4. **Link the ITSCO sender.** In Vonage, link the chosen ITSCO number to the approved ITSCO Service Communications campaign and verify active linkage. In the app, add/select that number under ITSCO, record the actual brand/campaign IDs and approved `reminders` purpose (and `care` for two-way replies if approved), and record verified approval/linkage. Configure the inbound webhook and the registered owner of STOP/HELP. The app’s checkbox does not link a number in Vonage. A workforce/polling sender is not a fallback for family reminders.
5. **Enable the desired SMS rules.** Tenant session notification settings must enable SMS and the intended reminder times. Recipient No choices and STOP take precedence over mandatory reminder rules. Portal guardians can change their own reminder channels, additional reminders and provider-update preferences. Each other recipient needs their own permission; listing another adult in an intake does not enroll that adult.
6. **Run a small consented test.** Check a school booking that bills through the office. Expect the school in the appointment view and an informational message: “A school visit is scheduled for [local date/time]. No confirmation is needed. If your child will be absent or plans change, please let our team know. Continue to report school absences to the school as usual.” The SMS transport adds the practice name and STOP instructions. Verify office visits retain their confirmation flow, school Y/N/R does not cancel or charge anyone, an absence message reaches staff, and STOP plus portal opt-out suppress later sends. Already queued school confirmation text is replaced at delivery.
7. **Release gradually after those checks.** No reply to a school reminder is not a cancellation, no-show or consent to texting. School reply reviews do not automatically apply fees. Keep details minimal and use authenticated portal pages for private information. A reminder is not permission to disclose clinical information to school staff. Reporting an absence to the practice does not replace the school’s attendance process.

At implementation time, the local database at `127.0.0.1:3307` refused connections, so no live family consent totals were verified. No number was purchased/linked and no test or bulk SMS was sent as part of this change. Carrier configuration and a consented delivery test remain operational steps.

References: [Vonage campaign requirements](https://api.support.vonage.com/hc/en-us/articles/12132309081500-10DLC-Campaign-requirements) and [HHS reminder/confidential-communication guidance](https://www.hhs.gov/hipaa/for-professionals/faq/may-health-care-providers-leave-messages/index.html).


This document summarizes the complete migration from Twilio to Vonage, the rebranding of SSC to SSTC, and the implementation of the "Stellar" communication suite.

## 1. Core Architecture
The system handles SMS, Voice (NCCO), and Video (OpenTok) through a unified backend routing layer.

- **Primary Brand**: PT Platform
- **Tenant Support**: Multi-tenant white-labeling is supported via `BrandingProvider.vue` and `Agency` feature flags.
- **Provider-Client Linking**: One number can route to multiple providers based on the client relationship.

## 2. SMS & Messaging Features

### Messages surface (staff)
- Primary UI: **Messages** at `/:slug/messages` and `/messages` — lands on the **employee Messages Dashboard**, then inbox via `?view=workspace`.
- Role-gated inbox tabs: team chat, **SMS** (clinical inbox, page layout). Tickets are **not** in Messages (see Communications Center / `/tickets` for CPA).
- **Communications Center** (`/admin/communications`) for admin/support/superadmin: Support Hub + ops Messages Dashboard modes.
- Legacy SMS hub URL `/admin/communications/sms` still works; Engagement Feed stays under `/admin/communications/feed` (nested under the Center). See `docs/MESSAGES_AND_COMMUNICATIONS_CENTER.md`.

### Number purposes (`twilio_numbers.number_purpose`)

| Purpose | Owner | Role |
|---------|--------|------|
| `platform_contact` | Platform (`agency_id` NULL) | Contact Plot Twist HQ |
| `tenant_contact` | Agency | Public “call/text the org” number (may differ from care DID) |
| `clinical_care` | Agency | Care inbox + CPA ownership |
| `notification` | Agency | Reminders, appointment confirmations, system SMS (legacy `appointment_verify` maps here) |
| `provider_contact` | Agency (optional assign to user) | Contacting providers (staff-facing), not clinical client inbox |

Directory phone on `agencies.phone_number` remains a fallback listing; Vonage DIDs live only in `twilio_numbers`.

### Care routing (agency numbers + CPA)
- Prefer **agency `clinical_care` numbers** with **assignment-based ownership** via `client_provider_assignments` (primary CPA = thread owner; co-providers eligible).
- Thread metadata in `sms_care_threads`: `owner_user_id`, `care_state` (`observing` | `under_care` | `escalated` | `closed`), `support_access` (`none` | `observe` | `respond`), optional `support_ticket_id`.
- Inbox visibility is caseload/care-thread scoped for providers (not “everyone on the number pool”).
- `notification`, `tenant_contact`, `platform_contact`, and `provider_contact` **never** enter the clinical SMS inbox.
- Optional later: personal Vonage number per high-volume provider.

### Encrypted SMS profile audit (HIPAA)
- Table `sms_profile_audit` stores AES-GCM ciphertext (same key stack as support tickets / chat encryption).
- Written whenever inbound/outbound SMS matches a **client** `contact_phone` or a **guardian** `users.phone_number` / `personal_phone` / `work_phone`, regardless of number purpose.
- Dual-write: clinical ops still use `message_logs` (plaintext for now); audit table is the compliance ledger.
- APIs (decrypt only for authorized callers; never log plaintext):
  - Staff: `GET /api/clients/:id/sms-audit`
  - Guardian: `GET /api/guardian-portal/sms-audit`
- UI: Client Communications **SMS audit** section; guardian portal **Text history** panel.

### Unified Messaging Hub
- Supports both **Clients** and **Agency Contacts**.
- Contacts can be converted to `Client` or `Guardian` accounts with one click.
- **MMS Support**: Outbound images, PDFs, and Word documents are supported via the Vonage Messages API (wiring still maturing).

### Auto-Reply & Escalation Rules
- **Unanswered Message Rule**: Configurable per-agency (e.g., 20 minutes). If a provider doesn't reply, an auto-reply offers to forward to support.
- **Support Escalation**: Client replies **YES** → opens a **support ticket**, sets care thread `escalated` + support `respond` (desk is primary; optional SMS notify if configured).
- Manual forward from the SMS thread also creates/claims a ticket and escalates care state.
- **Vacation Mode**: Integrated with `ProviderScheduleEvent`. Immediate auto-replies are sent if a provider is on vacation.
- **Return-from-OOO Digest**: Providers receive an SMS summary of missed messages when their vacation/OOO period ends.

### AI Suite (Gemini)
- **Smart Replies**: 3 AI-suggested responses appear in the thread for quick provider replies.
- **Voicemail Transcription**: Incoming voicemails are automatically transcribed and sent as notifications.

## 3. Voice & IVR (NCCO)
The system uses Vonage NCCO for dynamic call flow:
- **Extension Routing**: Main number prompts for a 3-digit extension.
- **Personal Routing**: If a personal number is called, it rings the provider's forwarding phone.
- **Smart Voicemail**: Plays different greetings for Working Hours, Out of Office, and Vacation.

## 4. UI/UX Design ("Stellar")
- **Glass Morphism**: Used in the Communications Hub sidebar and thread headers.
- **Modern Animations**: Typing indicators, floating empty states, and smooth transitions.
- **Interactive Previews**: 
  - Agency admins can preview the SMS auto-reply mockup in settings.
  - Providers can preview their TTS (Text-to-Speech) voicemail greetings.

## 5. Deployment Configuration

### Environment Variables (.env)
```bash
# Vonage Credentials
VONAGE_API_KEY=xxx
VONAGE_API_SECRET=xxx
VONAGE_APPLICATION_ID=xxx
VONAGE_PRIVATE_KEY_PATH=./secrets/private.key
VONAGE_SIGNATURE_SECRET=xxx

# Webhooks
VONAGE_SMS_WEBHOOK_URL=https://plottwisthq.com/api/vonage/inbound
VONAGE_VOICE_ANSWER_URL=https://plottwisthq.com/api/voice-video/voice/answer
VONAGE_VOICE_EVENT_URL=https://plottwisthq.com/api/voice-video/voice/event
```

### Vonage Application Webhooks
- **Voice Answer**: `GET https://plottwisthq.com/api/voice-video/voice/answer`
- **Voice Event**: `POST https://plottwisthq.com/api/voice-video/voice/event`
- **RTC Event**: `POST https://plottwisthq.com/api/voice-video/voice/event`
- **Captions (Video)**: `POST https://plottwisthq.com/api/voice-video/voice/transcription`

## 6. 10DLC registration

Start with the [current campaign walkthrough](docs/VONAGE_10DLC_CAMPAIGN_WALKTHROUGH.md).
Each campaign has dashboard steps 1–6 and post-approval step 7. Next Level Up comes first,
followed by ITSCO, optional marketing, and AuricWell's own account-access program.

Practice employee video/session reminders and client session-login links belong under that
practice's Service Communications campaign when disclosed and consented. AuricWell hosting
does not change the sender. Billing is an optional expansion requiring matching consent and
implementation before use. See the walkthrough's dated proof/readiness findings.

- [SMS audit and implementation history](docs/VONAGE_10DLC_ITSCO_AUDIT.md)
- [Historical provider-number engineering plan](docs/VONAGE_10DLC_PROVIDER_NUMBER_PLAN.md) — old campaign copy is superseded.

---
*Registration documentation updated: 2026-10-05. Other implementation sections retain their own validation scope.*

## Provider choices and phone workflow — October 6, 2026

Provider Update → Notification Preferences, Fall Update → Text choices, onboarding, and My Preferences share the same signed, organization-specific phone choices. Each category starts at No: staff reminders/announcements; generic message-waiting alerts; optional polls/voting. All No is a valid completed review. Staff can change choices in My Preferences without an administrator opting in on their behalf. Signatures, the displayed notice and timestamp are encrypted and appended to security evidence; ordinary preference edits cannot replace them. A new phone or changed program requires another review. Campaign approval, number linking, recipient permission and STOP remain independent delivery checks. Choices saved before a usable sender exists show pending; staff review/save again once setup is ready. No campaign registration is created or altered by this form.

Client SMS to the assigned business number remains in the app. Declining personal-phone alerts does not turn off that inbox or change a client's consent. Message-waiting texts contain generic wording and a normal authenticated portal link, not a client's initials, message body or reusable login token. Poll results are visible in the app after closing; a results SMS remains a separate per-poll choice. Changing an SMS preference never deletes communication history.

**Current implementation limits:** raw client-message forwarding is disabled. There is no active personal-phone reply relay. Voice calling and voicemail transcription remain unimplemented provider stubs. Recording cannot be enabled in call settings. The current release does not place calls, record participants, provision numbers, move numbers between campaigns, send enrollment messages on behalf of staff without their signed selection, or claim that existing SMS/voice account settings establish HIPAA compliance.

### Intended relay workflow (not launched)

Use one assigned business number for each provider's supported SMS and voice traffic. Extensions can route voice from a main number but cannot replace an SMS-capable sending number. Never expose the provider's personal number to the client. A dedicated relay sender/conversation identity must not share an ambiguous reply route with attendance votes, appointment Y/N/R replies or client threads.

Require a separate opt-in for full message forwarding, independently of generic alerts. Only enable it after the practice verifies the relevant Vonage account/subaccount, BAA, number configuration, device safeguards, recording/transcription subprocessors where applicable, and permitted campaign content. Initials and message content can remain PHI; a staff signature alone does not authorize every disclosure.

Allow one active relayed client conversation per provider phone across agencies, enforced by a database uniqueness constraint and transaction/lock. Save incoming messages to the correct app thread immediately. Queue subsequent conversations without forwarding their content until the current one closes. Require explicit provider acceptance with a session identifier; send opening and closing notices. Bind every reply to that session and authorized client. Plain SMS has no reliable native thread binding: after switching clients, require a reply/session code or explicit re-acceptance so delayed replies cannot be delivered to the next client. STOP/HELP always take precedence. Refuse and retain ambiguous or stale replies; never guess a client from message text. Provider opt-out, loss of assignment, a changed phone and session expiry suspend forwarding immediately; queued items remain visible in the app.

Record the open/accepted/closed timestamps, actors, delivery states, every inbound/outbound message and attachments where supported. On close, attach a versioned conversation artifact to the correct client chart, with references to original messages, access controls, retention/legal-hold handling and audited access. Preserve amendments and late arrivals separately. Apply the same chart-linked close/archive contract to email threads; email chart linkage must be verified rather than inferred from matching names or addresses. This automatic close-to-chart workflow is not implemented by the current consent release.

### Intended calls, voicemail and recordings (not launched)

Click Call in an authorized client record, select the authorized contact, ring the provider's verified private phone, and require the provider to accept before dialing the client. This prevents a personal voicemail greeting from connecting to the client. Present the business number as caller ID. Inbound business calls can ring the provider or an extension; unanswered calls go to the app's voicemail, not the provider's personal voicemail. Log call attempts, answered/ended times, participants, direction, business number, actor, disposition and duration against the client ID. Do not associate an unidentified caller with a chart based solely on a shared household number.

Default recording and transcription to off. Before recording any conversation, give a clear notice to every participant and collect the configured affirmative acceptance; preserve evidence with the call log. A generic “may be recorded” sentence does not implement consent handling. Offer a path to continue without recording or transcription. Consent withdrawal stops capture. Announce that voicemail will be recorded before the caller leaves it. Store audio and transcripts as encrypted, access-controlled chart artifacts, with authenticated streaming/download, retention, legal holds and access auditing. Treat transcripts as machine-generated until reviewed; do not automatically promote them into signed clinical notes. Recording/transcription should remain unavailable unless the specific services and subprocessors are covered by the organization's verified healthcare arrangement.

Sources checked: [HHS mobile/cloud safeguards and BAAs](https://www.hhs.gov/hipaa/for-professionals/faq/do-the-hipaa-rules-allow-health-care-providers-to-use-mobile-devices-to-access-ephi-in-a-cloud/index.html), [HHS audio-only communications guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/hipaa-audio-telehealth/index.html), [Vonage number-linking and HIPAA configuration](https://api.support.vonage.com/hc/en-us/articles/4407235273876-10-DLC-Number-linking-guide), [Vonage recording and transcription API](https://developer.vonage.com/en/voice/voice-api/concepts/recording).
