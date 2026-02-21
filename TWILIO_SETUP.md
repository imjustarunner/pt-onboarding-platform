# Twilio Setup Guide

This guide walks you through setting up Twilio for SMS and voice in PTOnboardingApp.

**→ For full build instructions and continuation guide (usage monitoring, HIPAA, voicemail transcription), see `SMS_VOICE_BUILD_INSTRUCTIONS.md`**

---

## 1. Create a Twilio Account

1. Go to [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
2. Sign up (free trial includes credits)
3. Verify your phone number and email

---

## 2. Get Your Credentials

1. Log in to the [Twilio Console](https://console.twilio.com)
2. On the dashboard, find:
   - **Account SID** (starts with `AC`)
   - **Auth Token** (click to reveal)

---

## 3. Set Backend Environment Variables

Add these to your backend (e.g. `.env` or Cloud Run env vars):

| Variable | Description | Example |
|----------|-------------|---------|
| `TWILIO_ACCOUNT_SID` | Your Account SID | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Your Auth Token | `your_auth_token` |
| `TWILIO_SMS_WEBHOOK_URL` | Public URL for inbound SMS | `https://your-app.com/api/twilio/webhook` |
| `TWILIO_VOICE_WEBHOOK_URL` | Public URL for inbound voice | `https://your-app.com/api/twilio/voice/inbound` |
| `TWILIO_VALIDATE_SIGNATURE` | Validate webhook signatures (recommended: `true`) | `true` |
| `TWILIO_SMS_ALERT_THRESHOLD` | Optional: SMS count threshold for alerts | `5000` |
| `TWILIO_CALL_MINUTES_ALERT_THRESHOLD` | Optional: Call minutes threshold for alerts | `1000` |

**Important:** The webhook URLs must be **publicly reachable**. Twilio cannot call `localhost`. Use:
- **Local dev:** [ngrok](https://ngrok.com) or similar to expose your local server
- **Production:** Your deployed backend URL (e.g. Cloud Run)

---

## 4. Run Migrations

Before using Twilio features, run these migrations:

```bash
# From project root, or your migration runner
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

## 5. Add Phone Numbers

You have two options:

### Option A: Search & Buy via Twilio (recommended)

1. In the app: **Settings → Texting Numbers**
2. Enter an area code (e.g. `303`)
3. Click **Search Twilio**
4. Click **Buy** next to a number you want

The number is purchased through your Twilio account and automatically configured with your webhook URLs.

### Option B: Add a Number You Already Own

1. If you have a number from Twilio (or ported to Twilio) that isn’t in the app yet
2. In the app: **Settings → Texting Numbers**
3. Enter the phone number (e.g. `+15551234567`) and optional friendly name
4. Click **Add number**

**Note:** For Option B, you must manually set the SMS and Voice webhook URLs on that number in the Twilio Console, or use **Sync Twilio webhooks** in the app to update them.

---

## 6. Sync Webhooks (if needed)

If you add numbers manually or change your backend URL:

1. Go to **Settings → Texting Numbers**
2. Click **Sync Twilio webhooks**

This updates all agency numbers with the correct `TWILIO_SMS_WEBHOOK_URL` and `TWILIO_VOICE_WEBHOOK_URL`.

---

## 7. Validate Webhook Signatures (Required for Production / HIPAA)

1. Set `TWILIO_VALIDATE_SIGNATURE=true` in your backend env
2. Ensure `TWILIO_AUTH_TOKEN` is set (used for validation)

See `TWILIO_HIPAA_COMPLIANCE.md` for full HIPAA checklist.

---

## Quick Reference: Webhook URLs

| Purpose | URL path |
|---------|----------|
| Inbound SMS | `POST /api/twilio/webhook` |
| Inbound Voice | `POST /api/twilio/voice/inbound` |

Full URLs: `https://<your-backend-domain>/api/twilio/webhook` and `https://<your-backend-domain>/api/twilio/voice/inbound`

---

## 8. Usage Monitoring

- **API:** `GET /api/sms-numbers/agency/:agencyId/usage?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD`
- Returns: `outboundSms`, `inboundSms`, `notificationSms`, `callMinutes`, `phoneNumbers`
- Optional env vars for alerts: `TWILIO_SMS_ALERT_THRESHOLD`, `TWILIO_CALL_MINUTES_ALERT_THRESHOLD`

---

## Troubleshooting

- **"Twilio not configured"** — Check that `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are set.
- **Inbound SMS/voice not working** — Ensure webhook URLs are public and correct. Use **Check status** in the app to verify.
- **Search/Buy fails** — Verify credentials and that your Twilio account has permission to purchase numbers (trial accounts may have limits).
- **403 on webhooks** — If `TWILIO_VALIDATE_SIGNATURE=true`, ensure the webhook URL in Twilio exactly matches your backend URL (protocol, host, path).
