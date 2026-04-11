# Vonage Communication System Implementation (PT Platform)

This document summarizes the complete migration from Twilio to Vonage, the rebranding of SSC to SSTC, and the implementation of the "Stellar" communication suite.

## 1. Core Architecture
The system handles SMS, Voice (NCCO), and Video (OpenTok) through a unified backend routing layer.

- **Primary Brand**: PT Platform
- **Tenant Support**: Multi-tenant white-labeling is supported via `BrandingProvider.vue` and `Agency` feature flags.
- **Provider-Client Linking**: One number can route to multiple providers based on the client relationship.

## 2. SMS & Messaging Features

### Unified Messaging Hub
- Supports both **Clients** and **Agency Contacts**.
- Contacts can be converted to `Client` or `Guardian` accounts with one click.
- **MMS Support**: Outbound images, PDFs, and Word documents are supported via the Vonage Messages API.

### Auto-Reply & Escalation Rules
- **Unanswered Message Rule**: Configurable per-agency (e.g., 20 minutes). If a provider doesn't reply, an auto-reply offers to forward to support.
- **Support Escalation**: If the client replies "YES" to the auto-reply, the thread is escalated to the agency's support phone.
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
*Last Updated: 2026-04-11*
