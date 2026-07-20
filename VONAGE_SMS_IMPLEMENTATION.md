# Vonage Communication System Implementation (PT Platform)

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

---
*Last Updated: 2026-07-20*
