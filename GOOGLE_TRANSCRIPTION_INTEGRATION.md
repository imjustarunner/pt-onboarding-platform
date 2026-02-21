# Google Speech-to-Text Transcription Integration

PTOnboardingApp uses **Google Cloud Speech-to-Text** for transcription. This document describes current usage and integration points for voice/video.

**→ For full SMS/voice build instructions, see `SMS_VOICE_BUILD_INSTRUCTIONS.md`**

---

## Current Usage

### 1. Clinical Note Generator

- **File:** `backend/src/services/speechTranscription.service.js`
- **Flow:** User records audio → uploaded to GCS → `transcribeLongAudio()` → long-running recognize
- **Env:** `CLINICAL_AUDIO_BUCKET` or `PTONBOARDFILES`, `GOOGLE_APPLICATION_CREDENTIALS`

### 2. Call Voicemails (Implemented)

- **Table:** `call_voicemails` has `transcription_text` column
- **Flow:** When `voiceVoicemailCompleteWebhook` receives a recording, we create the voicemail then fire-and-forget `transcribeVoicemail()` which downloads, transcribes via Google Speech-to-Text, and updates the record
- **UI:** Communications → Calls tab displays transcription under each voicemail when available

---

## (Obsolete) Adding Voicemail Transcription — now implemented

### Option A: Webhook + Background Job

1. In `voiceVoicemailCompleteWebhook`, after `CallVoicemail.create()`:
   - Enqueue a job: `transcribeVoicemail({ voicemailId, recordingSid })`
2. Job:
   - `TwilioService.downloadRecordingMedia({ recordingSid })`
   - `transcribeLongAudio({ buffer, mimeType: 'audio/mp3', userId })`
   - `CallVoicemail.update(id, { transcriptionText })`

### Option B: Twilio Transcription Callback

- Twilio can transcribe recordings via its own pipeline
- Configure `transcriptionCallback` when creating the `<Record>` verb
- Simpler but uses Twilio’s transcription (not Google)

---

## Future: Video Transcription

For Twilio Video (or other video):

1. **Record** — Save video/audio to GCS
2. **Extract audio** — Use FFmpeg or Cloud Video Intelligence if needed
3. **Transcribe** — `speechTranscription.service.js` or Speech-to-Text long-running
4. **Store** — New table or extend `contact_communication_logs` with `transcription_text`

---

## Env Vars

| Variable | Purpose |
|----------|---------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON |
| `CLINICAL_AUDIO_BUCKET` | GCS bucket for audio (optional; falls back to `PTONBOARDFILES`) |
| `PROJECT_ID` | GCP project for Speech-to-Text |

---

## HIPAA

Google Cloud Speech-to-Text is HIPAA-eligible. Ensure:

- BAA is in place with Google Cloud
- Audio stored in HIPAA-compliant GCS bucket
- Access controls and audit logging are configured
