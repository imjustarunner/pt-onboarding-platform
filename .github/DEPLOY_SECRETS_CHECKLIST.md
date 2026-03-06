# GitHub Secrets Checklist for deploy-backend

Compare this list to **Settings → Secrets and variables → Actions** in your repo.
Each secret is only used if it exists (non-empty). Missing optional secrets = feature disabled.

## Required (deploy fails without these)

| Secret | Used for |
|--------|----------|
| `GCP_PROJECT_ID` | GCP project, image path |
| `GCP_SA_KEY` | Auth to GCP |
| `CLOUD_SQL_CONNECTION_NAME` | DB connection |
| `CLOUD_RUN_SA_EMAIL` | Cloud Run service account |
| `GCS_BUCKET_NAME` | Storage bucket (also PTONBOARDFILES) |

## Strongly recommended

| Secret | Used for |
|--------|----------|
| `JWT_SECRET` | Auth tokens (default is insecure) |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |

## Optional (by feature)

### reCAPTCHA
- `RECAPTCHA_SITE_KEY`
- `RECAPTCHA_SECRET_KEY`
- `RECAPTCHA_MIN_SCORE`
- `RECAPTCHA_MIN_SCORE_INTAKE` – optional; lower threshold for public intake (default 0.3)
- `RECAPTCHA_SITE_KEY_INTAKE` – **checkbox key** for public intake; when set, parents must complete "I'm not a robot" challenge
- `RECAPTCHA_REQUIRED_ORG_NAMES` – comma-separated org names that require captcha (e.g. `Fakey School`). When unset, captcha is disabled for all intakes.
- `RECAPTCHA_REQUIRED_FOR_ALL` – set to `true` to require captcha for **all** public intakes (all schools). Overrides `RECAPTCHA_REQUIRED_ORG_NAMES`.
- `RECAPTCHA_ENTERPRISE_API_KEY`
- `RECAPTCHA_ENTERPRISE_PROJECT_ID`

### Google Workspace / OAuth
- `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64`
- `GOOGLE_WORKSPACE_IMPERSONATE_USER`
- `GOOGLE_WORKSPACE_DRIVE_IMPERSONATE_USER`
- `GMAIL_IMPERSONATE_USER`
- `GOOGLE_WORKSPACE_FROM_NAME`
- `GOOGLE_WORKSPACE_FROM_ADDRESS`
- `GOOGLE_WORKSPACE_DEFAULT_FROM`
- `GOOGLE_WORKSPACE_REPLY_TO`
- `EXPENSE_RECEIPTS_DRIVE_FOLDER_ID`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_OAUTH_ALLOWED_REDIRECT_HOSTS`
- `GOOGLE_OAUTH_STATE_SECRET`

### Twilio
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_API_KEY_SID`
- `TWILIO_API_KEY_SECRET`
- `TWILIO_SMS_WEBHOOK_URL`
- `TWILIO_VOICE_WEBHOOK_URL`
- `TWILIO_VIDEO_WEBHOOK_URL`
- `TWILIO_VALIDATE_SIGNATURE`
- `TWILIO_DEFAULT_FROM`
- `TWILIO_BROADCAST_FROM`
- `TWILIO_NOTIFICATIONS_FROM`
- `SMS_VOICE_RETENTION_DAYS`
- `TWILIO_SMS_ALERT_THRESHOLD`
- `TWILIO_CALL_MINUTES_ALERT_THRESHOLD`

### Chat encryption
- `CLIENT_CHAT_ENCRYPTION_KEY_ID`
- `CLIENT_CHAT_ENCRYPTION_KEY_BASE64`

### Meta / Instagram
- `META_APP_ID`
- `META_APP_SECRET`
- `META_INSTAGRAM_REDIRECT_URI`
- `BACKEND_PUBLIC_URL`

### Clinical
- `CLINICAL_KB_BUCKET`
- `DATA_STORE_ID`
- `CLINICAL_KB_PREFIX`
- `CLINICAL_DB_HOST`
- `CLINICAL_DB_PORT`
- `CLINICAL_DB_NAME`
- `CLINICAL_DB_USER`
- `CLINICAL_DB_PASSWORD`
- `CLINICAL_AUDIO_BUCKET`
- `CLINICAL_DB_CONNECTION_LIMIT`

### Clinical Director Agent
- `CLINICAL_DIRECTOR_AGENT_URL`
- `CLINICAL_DIRECTOR_ADK_APP_NAME`

### Audit log
- `AUDIT_LOG_COLD_STORAGE_ENABLED`
- `AUDIT_LOG_HOT_DAYS`
- `AUDIT_LOG_COLD_STORAGE_BATCH_SIZE`
- `AUDIT_LOG_COLD_STORAGE_PREFIX`
- `AUDIT_LOG_DELETE_AFTER_EXPORT`

### Demo mode
- `DEMO_MODE_ENABLED`
- `DEMO_MODE_USER_ALLOWLIST`
- `DEMO_MODE_FAKE_AGENCY_IDS`

### Billing / encryption
- `LEARNING_BILLING_RENEWAL_SECRET`
- `BILLING_JOB_SECRET`
- `BILLING_ENCRYPTION_KEY_BASE64`
- `BILLING_ENCRYPTION_KEY_ID`

### Other
- `EMAIL_AI_STATUS_DRAFTS_ENABLED`
- `VAPID_PUBLIC_KEY` (push notifications)
- `REFERRAL_KMS_KEY`
- `DOCUMENTS_KMS_KEY`
- `ADMIN_ACTIONS_TOKEN`
- `GEMINI_API_KEY`
- `GEMINI_FORCE_API_KEY`
- `GEMINI_MODEL`
- `VERTEX_AUTH_SOURCE`
- `VERTEX_AI_LOCATION`
- `VERTEX_AI_MODEL`
- `ADK_AGENT_URL`
- `VERTEX_AI_AGENT_TIMEOUT_MS`
- `VERTEX_AGENT_ENGINE_ID`
- `VERTEX_AI_AGENT_MODEL`
- `PROJECT_ID`
- `VIRUSTOTAL_API_KEY`
- `CLINICAL_KB_PREFIX`
- `EMAIL_SENDING_MODE`
- `DB_CONNECTION_LIMIT`
- `JWT_EXPIRES_IN`

### QuickBooks
- `QUICKBOOKS_CLIENT_ID`
- `QUICKBOOKS_CLIENT_SECRET`
- `QUICKBOOKS_REDIRECT_URI`
- `QUICKBOOKS_OAUTH_STATE_SECRET`
- `QUICKBOOKS_ENV`
- `QBO_VENDOR_DISPLAY_NAME`

---

## How to verify after deploy

1. **GitHub**: Repo → Settings → Secrets and variables → Actions (check names match)
2. **Cloud Run**: After deploy, run:
   ```bash
   gcloud run services describe onboarding-backend --region us-west3 \
     --format='value(spec.template.spec.containers[0].env[].name)' | sort
   ```
   This lists env var names on the running service.
3. **Health check**: `GET https://app.itsco.health/api/health-check/twilio-video` shows Twilio config status.
