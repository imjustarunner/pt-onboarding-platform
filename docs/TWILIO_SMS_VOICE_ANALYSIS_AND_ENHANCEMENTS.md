# Twilio SMS & Voice: Current State, Texting Flow, and Enhancement Roadmap

## Executive Summary

**Your intuition is correct:** Client–provider texting should be a **full in-app experience**. Personal phone forwarding is only for awareness; replies must happen in-app to preserve the agency number and audit trail.

---

## Provider-Only Number Model (Implemented)

**Each provider must have their own assigned Twilio number** for texting and calling clients. Agency numbers are for company events, after-hours, and support fallback—not for 1:1 client communication.

- **One number = calling + texting:** The same Twilio number is used for both.
- **On/off toggles:** Per-user settings in Communications → Calls tab:
  - Inbound/outbound calls
  - Inbound/outbound texts (sms_inbound_enabled, sms_outbound_enabled)
- **Non-providers:** Can have a number and be added to additional numbers via "Add to pool" to receive and respond.
- **Outbound:** No agency fallback. Providers need an assigned number to text/call.
- **Available numbers:** Only assigned numbers (including pool membership).
- **Consent:** Only shows consent states for numbers the user is assigned to.

---

## 1. How Client–Provider Texting Works Today

### Flow: Client → Provider

1. **Client** texts the **agency/provider Twilio number** (from their personal phone).
2. **Twilio** receives the message and POSTs to your webhook: `POST /api/twilio/webhook`.
3. **Backend** (`twilioWebhook.controller.js`):
   - `resolveInboundRoute()` finds the owner (provider assigned to that number).
   - Message is stored in `message_logs`.
   - **In-app notifications** are sent to all eligible users via `createNotificationAndDispatch` (type: `inbound_client_message`).
   - **Optional SMS forwarding**: If a `forward_inbound` rule is configured for the number, AND the user has `sms_forwarding_enabled`, the system sends a **second** SMS to the provider’s personal phone.

**Where the provider receives the message:**

| Channel | Always | When |
|---------|--------|------|
| **In-app** | ✅ Yes | Always via notification + SMS Inbox |
| **Personal phone** | ❌ Optional | Only if `forward_inbound` rule exists AND `sms_forwarding_enabled` is true |

### Flow: Provider → Client

1. **Provider** sends from within the app (SMS Inbox, ProviderMobileCommunicationsView) via the API.
2. **Backend** uses the agency/provider Twilio number as "from" and sends via Twilio.
3. **Client** receives the message on their personal phone from the agency number.

### Why personal phone is not the right place to reply

- **Reply from personal phone** → Client would see the provider’s personal number, not the agency number.
- **Reply from app** → Client sees the agency number; all messages stay in the audit trail.
- **Conclusion:** Personal phone forwarding is mainly for *awareness* (“you got a message”). The actual reply should be in-app.

---

## 2. In-App Experience (Already Present)

You already have:

- **SMS Inbox** (`SmsInboxView.vue`) – Admin/provider view: threads, conversation, send/reply.
- **ProviderMobileCommunicationsView** – Provider-focused view.
- **Communications** – Unified feed with tabs for texting, calls, etc.

**Recommendation:** Treat the in-app SMS Inbox as the primary interface. Make it discoverable and ensure providers are notified when new messages arrive.

---

## 3. SMS Forwarding Preference

- **User preference:** `sms_forwarding_enabled` in `user_preferences`.
- **UI:** `UserPreferencesHub.vue` – “Forward inbound texts to my phone”.
- **Help text:** “Used when agencies enable text forwarding rules.”

So personal phone forwarding is only used when:

1. A `forward_inbound` rule is configured for the number (in SmsNumbersManagement).
2. The user has `sms_forwarding_enabled = true`.

If you want to **de-emphasize SMS forwarding** and rely on in-app:

- Option A: Default `sms_forwarding_enabled` to `false`.
- Option B: Keep it as an opt-in for awareness; keep the UI clearly stating that replies should be in-app.

---

## 4. Twilio Voice / SMS (What’s Already Built)

### Voice (Twilio Voice is used)

- **Inbound voice:** `inboundVoiceWebhook` – routes to provider’s personal phone, supports extensions (IVR), voicemail.
- **Outbound:** `calls.controller.js` – provider can start calls from the app.
- **Call logs:** `call_logs` table.
- **Voicemail:** Recording + transcription via Google Speech-to-Text.
- **Extensions:** `UserExtension` – extension dialing (e.g. “Press 1234 for Dr. Smith”).

### SMS (Twilio SMS is used)

- Inbound/outbound webhooks.
- `message_logs` table.
- Opt-in/opt-out handling.

---

## 5. Enhancement Roadmap

### 5.1 Conference Calls (Multi-Party Voice)

- **Purpose:** Group calls without video.
- **Twilio:** Uses TwiML `<Conference>` or Programmable Voice Conference API.
- **Implementation:** Add a conference endpoint that creates a conference room, then dials participants.
- **Effort:** Medium.

### 5.2 IVR (Interactive Voice Response)

- **Current:** Basic extension dialing (“Press the extension you wish to reach”).
- **Enhancement:** Menus like “Press 1 for scheduling, 2 for support, 3 for provider”.
- **Implementation:** Add a `TwilioNumberRule` rule type `ivr_menu` with configurable options (digit → action).
- **Effort:** Medium.

### 5.3 Call Transfer / Hold

- **Purpose:** Transfer calls between users or put callers on hold.
- **Twilio:** `<Dial>` with `transfer` attribute, or `warm` transfer.
- **Implementation:** Add endpoints:
  - `POST /api/twilio/voice/transfer/:callSid` – transfer to another number/user.
  - `POST /api/twilio/voice/hold/:callSid` – play hold music.
- **Effort:** Medium.

### 5.4 MMS (Media in SMS) — Implemented

- **Backend:** `TwilioService.sendSms` accepts `mediaUrl`; `message_logs.metadata` stores `media_urls`.
- **Inbound:** Webhook extracts `MediaUrl0`, `MediaUrl1`, etc. and stores in metadata.
- **Outbound:** `POST /messages/send` accepts `mediaUrls`; `POST /messages/upload-media` uploads images to GCS and returns signed URL.
- **UI:** SMS Inbox, CommunicationThreadView, and ProviderMobileCommunicationsView support attach image, display images in bubbles.

---

## 6. Recommended Priorities

1. **Clarify SMS UX** – Ensure onboarding and help text explain that replies are in-app; optionally default `sms_forwarding_enabled` to `false`.
2. **MMS** – High value for sending/receiving documents or images.
3. **IVR** – Useful for after-hours routing and self-service.
4. **Conference calls** – Useful for group calls.
5. **Call transfer / hold** – Useful for front-desk/support workflows.

---

## 7. Quick Reference: Key Files

| Area | File |
|------|------|
| Inbound SMS webhook | `backend/src/controllers/twilioWebhook.controller.js` |
| Inbound voice webhook | `backend/src/controllers/twilioVoice.controller.js` |
| Outbound calls | `backend/src/controllers/calls.controller.js` |
| Twilio API wrapper | `backend/src/services/twilio.service.js` |
| SMS Inbox UI | `frontend/src/views/admin/SmsInboxView.vue` |
| SMS forwarding pref | `frontend/src/components/UserPreferencesHub.vue` |
| Number rules (forward_inbound, etc.) | `frontend/src/components/admin/SmsNumbersManagement.vue` |
