# SMS & Voice Build Instructions

**Purpose:** Continuation guide for building out SMS/voice features once Twilio is incorporated. HIPAA-compliant setup with Google transcription.

---

## Quick Reference

| Doc | Purpose |
|-----|---------|
| `TWILIO_SETUP.md` | Step-by-step Twilio account, credentials, webhooks, migrations |
| `TWILIO_HIPAA_COMPLIANCE.md` | BAA, env vars, data handling, access control, retention |
| `GOOGLE_TRANSCRIPTION_INTEGRATION.md` | Speech-to-Text usage, voicemail transcription integration point |

---

## 1. What’s Already Built

### SMS/Voice Infrastructure
- **Twilio webhooks:** `POST /api/twilio/webhook` (SMS), `POST /api/twilio/voice/inbound` (voice)
- **Signature validation:** `TWILIO_VALIDATE_SIGNATURE=true` for HIPAA
- **Routes:** `backend/src/routes/twilio.routes.js`
- **Controllers:** `backend/src/controllers/twilioVoice.controller.js`, SMS handling in `twilio.controller.js` (or equivalent)

### Usage Monitoring
- **Service:** `backend/src/services/twilioUsageMonitoring.service.js`
  - `getTwilioUsage(agencyId, { periodStart, periodEnd })` → outbound/inbound/notification SMS, call minutes, phone numbers
  - `checkUsageThresholds(agencyId, usage)` → checks `TWILIO_SMS_ALERT_THRESHOLD`, `TWILIO_CALL_MINUTES_ALERT_THRESHOLD`
- **API:** `GET /api/sms-numbers/agency/:agencyId/usage?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD`
- **UI:** Usage card in `frontend/src/components/admin/SmsNumbersManagement.vue` (last 30 days, threshold alerts)

### Billing Usage
- **Service:** `backend/src/services/billingUsage.service.js` — includes `callMinutesUsed` from `call_logs.duration_seconds`

### Google Transcription (Clinical Notes)
- **Service:** `backend/src/services/speechTranscription.service.js`
- **Flow:** User audio → GCS → `transcribeLongAudio()` → long-running recognize
- **Env:** `GOOGLE_APPLICATION_CREDENTIALS`, `CLINICAL_AUDIO_BUCKET` or `PTONBOARDFILES`, `PROJECT_ID`

---

## 2. Required Env Vars

### Twilio (Required)
```bash
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_SMS_WEBHOOK_URL=https://your-domain.com/api/twilio/webhook
TWILIO_VOICE_WEBHOOK_URL=https://your-domain.com/api/twilio/voice/inbound
TWILIO_VALIDATE_SIGNATURE=true
```

### Twilio (Optional – Alerts)
```bash
TWILIO_SMS_ALERT_THRESHOLD=5000
TWILIO_CALL_MINUTES_ALERT_THRESHOLD=1000
```

### Retention (Optional)
```bash
SMS_VOICE_RETENTION_DAYS=365   # Purge records older than N days. 0 = keep indefinitely
```

### Google Transcription
```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
CLINICAL_AUDIO_BUCKET=your-bucket   # or PTONBOARDFILES
PROJECT_ID=your-gcp-project
```

---

## 3. Post-Twilio Checklist

1. **Sign Twilio BAA** — Contact Twilio to execute BAA for HIPAA.
2. **Set env vars** — All required Twilio vars above.
3. **Deploy backend** — Webhook URLs must be publicly reachable (HTTPS).
4. **Sync webhooks** — Settings → Texting Numbers → “Sync Twilio webhooks” so all numbers use correct URLs.
5. **Verify** — Use “Check status” in the app to confirm webhooks.

---

## 4. HIPAA Checklist (Summary)

- [ ] Twilio BAA signed
- [ ] `TWILIO_VALIDATE_SIGNATURE=true`
- [ ] Webhooks use HTTPS in production
- [ ] Database encryption at rest (e.g. Cloud SQL)
- [ ] Access control: admin APIs require `requireAgencyAdmin` / `requireAgencyAccess`
- [ ] Retention policy for `message_logs`, `call_logs`, `call_voicemails`
- [ ] Recording consent: “This call may be recorded” in voice greeting
- [ ] Google Cloud BAA for Speech-to-Text (if using transcription)

---

## 5. Key Tables & Models

| Table | Purpose |
|-------|---------|
| `message_logs` | SMS (outbound, inbound, notification) |
| `call_logs` | Voice calls (duration, etc.) |
| `call_voicemails` | Voicemails (`twilio_recording_sid`, `recording_url`, `transcription_text`) |
| `notification_sms_logs` | Notification SMS |
| `contact_communication_logs` | Contact comms (encrypted via `contactCommsEncryption.service.js`) |

---

## 6. Voicemail Transcription (Implemented)

**Status:** Implemented. New voicemails are transcribed via Google Speech-to-Text.

**Flow:**
1. **Webhook:** `voiceVoicemailCompleteWebhook` creates `CallVoicemail`, then fire-and-forget calls `transcribeVoicemail()`
2. **Service:** `backend/src/services/voicemailTranscription.service.js`
   - Downloads recording: `TwilioService.downloadRecordingMedia({ recordingSid, format: 'mp3' })`
   - Transcribes: `speechTranscription.service.js` → `transcribeLongAudio()`
   - Updates: `CallVoicemail.updateTranscription(id, transcript)`
3. **UI:** Communications → Calls tab shows transcription under each voicemail when available

**Env:** `CLINICAL_AUDIO_BUCKET` or `PTONBOARDFILES`, `GOOGLE_APPLICATION_CREDENTIALS`, `PROJECT_ID`

---

## 7. Migrations (Twilio-Related)

Run these before using Twilio features:

```
350_create_twilio_numbers_and_rules.sql
351_message_logs_number_fields.sql
352_billing_add_phone_number_unit.sql
353_billing_add_inbound_sms_unit.sql
354_notification_trigger_program_reminder.sql
355_add_forward_inbound_rule_type.sql
356_add_sms_forwarding_pref.sql
357_create_program_reminder_schedules.sql
358_create_agency_notification_preferences.sql
473_twilio_assignments_sms_access_enabled.sql
474_create_user_extensions.sql
```

---

## 8. File Map

| Area | Files |
|------|-------|
| Twilio routes | `backend/src/routes/twilio.routes.js` |
| Voice controller | `backend/src/controllers/twilioVoice.controller.js` |
| Usage monitoring | `backend/src/services/twilioUsageMonitoring.service.js` |
| Usage API | `backend/src/controllers/smsNumbers.controller.js` → `getAgencyTwilioUsage` |
| Usage routes | `backend/src/routes/smsNumbers.routes.js` |
| Usage UI | `frontend/src/components/admin/SmsNumbersManagement.vue` |
| Transcription | `backend/src/services/speechTranscription.service.js` |
| Voicemail model | `backend/src/models/CallVoicemail.model.js` |

---

## 9. Troubleshooting

| Issue | Fix |
|-------|-----|
| “Twilio not configured” | Set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` |
| Inbound SMS/voice not working | Webhooks must be public HTTPS; run “Sync Twilio webhooks” |
| 403 on webhooks | With `TWILIO_VALIDATE_SIGNATURE=true`, URL in Twilio must exactly match backend |
| Local dev | Use ngrok or similar to expose local server for webhooks |

---

*Last updated: Feb 2026*
