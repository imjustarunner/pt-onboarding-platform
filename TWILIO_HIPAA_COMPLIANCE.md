# Twilio HIPAA Compliance Checklist

PTOnboardingApp uses Twilio for SMS and voice. For HIPAA compliance.

**→ For full build instructions and continuation guide, see `SMS_VOICE_BUILD_INSTRUCTIONS.md`**

---

## 1. Twilio BAA (Business Associate Agreement)

- [ ] **Sign Twilio BAA** — Contact Twilio to execute a BAA for your account
- [ ] **Use HIPAA-eligible products** — Twilio Programmable SMS and Voice are HIPAA-eligible when BAA is in place
- [ ] **Subprocessors** — Twilio’s subprocessor list is available in their Trust Center; ensure you’ve reviewed it

---

## 2. Environment & Security

| Setting | Purpose |
|--------|---------|
| `TWILIO_VALIDATE_SIGNATURE=true` | Validates webhook requests to prevent spoofing |
| `TWILIO_AUTH_TOKEN` | Keep secret; used for signature validation and API calls |
| `TWILIO_SMS_WEBHOOK_URL` | Must use HTTPS in production |
| `TWILIO_VOICE_WEBHOOK_URL` | Must use HTTPS in production |

---

## 3. Data Handling

- **SMS/voice content** — May contain PHI. Stored in `message_logs`, `call_logs`, `call_voicemails`
- **Encryption at rest** — Database should use encryption (e.g. Cloud SQL encryption)
- **Encryption in transit** — Webhooks use HTTPS; Twilio API uses TLS
- **Contact comms** — `contact_communication_logs` uses `contactCommsEncryption.service.js` for body encryption

---

## 4. Access Control

- **Webhook routes** — No auth middleware (Twilio calls them); validation is via `x-twilio-signature`
- **Admin APIs** — Require `requireAgencyAdmin` or `requireAgencyAccess` for number/usage access
- **Audit** — Consider logging access to SMS/voice data for audit trails

---

## 5. Retention & Deletion

**Policy:** 365 days (configurable). Records older than the retention window are purged daily at 3:00 AM.

| Table | Retention |
|-------|-----------|
| `message_logs` | 365 days |
| `call_logs` | 365 days |
| `call_voicemails` | 365 days |
| `notification_sms_logs` | 365 days |

**Config:** `SMS_VOICE_RETENTION_DAYS=365` (default). Set to `0` to keep indefinitely (no purge).

Twilio retains recordings per your account settings; configure retention in Twilio Console.

---

## 6. Recording Consent

- **Voice** — Ensure callers are informed when calls are recorded (e.g. “This call may be recorded”)
- **Voicemail** — Recording is explicit (caller leaves message); disclosure should be in voicemail greeting

---

## Quick Setup (Production)

```bash
# .env or Cloud Run env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_SMS_WEBHOOK_URL=https://your-domain.com/api/twilio/webhook
TWILIO_VOICE_WEBHOOK_URL=https://your-domain.com/api/twilio/voice/inbound
TWILIO_VALIDATE_SIGNATURE=true
```

Then run **Sync Twilio webhooks** in Settings → Texting Numbers to apply URLs to all numbers.
