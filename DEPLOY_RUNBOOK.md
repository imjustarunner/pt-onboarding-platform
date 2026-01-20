# DEPLOYMENT RUNBOOK – Cloud Run + Cloud SQL (Reusable Framework)

This runbook documents **exactly** how to deploy, connect, and verify a backend + frontend system using **Google Cloud Run**, **Cloud SQL (MySQL)**, and **Docker**.

It is written so you can reuse the same steps for future systems that share this framework.

---

## 0. Mental Model (Read This First)

* **Cloud SQL** = where your data lives (tables, rows)
* **Migrations** = how tables are created/updated
* **Cloud Run** = runs your backend & frontend containers
* **Artifact Registry** = stores container images
* **Cloud SQL Proxy** = lets your laptop connect to Cloud SQL
* **Ports like 3307/3308** = local-only (Cloud Run always uses 3306)

If `/health` returns **200**, infrastructure is working.

---

## 1. Google Cloud Project Setup (One-Time Per Project)

### 1.1 Set active project

```bash
gcloud config set project YOUR_PROJECT_ID
```

### 1.2 Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com
```

---

## 2. Artifact Registry (One-Time Per Project/Region)

```bash
gcloud artifacts repositories create onboarding-repo \
  --repository-format=docker \
  --location=us-central1 \
  --description="Application images"
```

This is where Cloud Build pushes images.

---

## 3. Cloud SQL Setup (One-Time Per Database)

### 3.1 Create instance, database, and user

Do this via **GCP Console** or `gcloud`:

* Instance: MySQL 8
* Database: e.g. `onboarding_stage`
* User: e.g. `onboarding_user`
* Password: **shell-safe** (no quotes/backticks)

### 3.2 Get connection name

Format:

```
PROJECT_ID:REGION:INSTANCE_NAME
```

---

## 4. Deploy BACKEND to Cloud Run

### 4.1 Build backend image

```bash
cd backend
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/onboarding-repo/onboarding-backend:latest
```

### 4.2 Deploy backend service

```bash
gcloud run deploy onboarding-backend \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/onboarding-repo/onboarding-backend:latest \
  --region us-central1 \
  --platform managed
```

> Your org blocks public access. This is expected.

---

## 5. Connect Cloud Run → Cloud SQL

### 5.1 Grant Cloud SQL access to service account

Most projects use the default compute SA:

```
PROJECT_NUMBER-compute@developer.gserviceaccount.com
```

Grant role:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

### 5.2 Attach DB + env vars to Cloud Run

```bash
gcloud run services update onboarding-backend \
  --region us-central1 \
  --add-cloudsql-instances PROJECT:REGION:INSTANCE \
  --set-env-vars "DB_HOST=/cloudsql/PROJECT:REGION:INSTANCE,DB_PORT=3306,DB_NAME=DB_NAME,DB_USER=DB_USER,DB_PASSWORD=DB_PASSWORD,NODE_ENV=production"
```

---

## 6. Verify Backend Is Live

### 6.1 Get service URL

```bash
URL=$(gcloud run services describe onboarding-backend --region us-central1 --format="value(status.url)")
```

### 6.2 Test `/health`

```bash
curl -i -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$URL/health"
```

**Expected:** HTTP 200

---

## 7. Run Database Migrations (Critical)

### 7.1 Start Cloud SQL Proxy (local)

```bash
cloud-sql-proxy PROJECT:REGION:INSTANCE --port 3307
```

### 7.2 Run migrations

```bash
cd backend
DB_HOST=127.0.0.1 DB_PORT=3307 DB_NAME=DB_NAME DB_USER=DB_USER DB_PASSWORD=DB_PASSWORD npm run migrate
```

**Success indicator:**

```
All migrations completed successfully
```

---

## 8. Create First Admin (Required to Use App)

Your API requires JWT auth. You must create a user.

### Recommended approach

Create a script:

```
backend/src/scripts/createAdmin.js
```

It should:

* Check if admin exists
* Hash password correctly
* Insert admin user

Run it via proxy using same DB env vars.

---

## 9. Deploy FRONTEND to Cloud Run

### 9.1 Build frontend image

```bash
cd frontend
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/onboarding-repo/onboarding-frontend:latest
```

### 9.2 Deploy frontend

```bash
gcloud run deploy onboarding-frontend \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/onboarding-repo/onboarding-frontend:latest \
  --region us-central1 \
  --platform managed
```

---

## 10. Wire Frontend → Backend

### 10.1 Get backend URL

```bash
BACKEND_URL=$(gcloud run services describe onboarding-backend --region us-central1 --format="value(status.url)")
```

### 10.2 Set frontend API URL

```bash
gcloud run services update onboarding-frontend \
  --region us-central1 \
  --set-env-vars "VITE_API_URL=${BACKEND_URL}/api"
```

### Google Maps API Key (automatic mileage)

- The backend uses `GOOGLE_MAPS_API_KEY` (server-side) for Distance Matrix calls.
- If you deploy via Cloud Build / `gcloud run deploy`, ensure the service has:
  - Secret: `GOOGLE_MAPS_API_KEY` in Secret Manager
  - Mounted env var: `GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_API_KEY:latest`

> Adjust `/api` if your backend routes differ.

---

## 11. Fix Backend CORS (Required to See App)

### 11.1 Get frontend URL

```bash
FRONTEND_URL=$(gcloud run services describe onboarding-frontend --region us-central1 --format="value(status.url)")
```

### 11.2 Update backend CORS env vars

```bash
gcloud run services update onboarding-backend \
  --region us-central1 \
  --update-env-vars "CORS_ORIGIN=${FRONTEND_URL},FRONTEND_URL=${FRONTEND_URL}"
```

---

## 12. Final Result (What "Seeing It on the Internet" Means)

* Frontend Cloud Run URL opens in browser
* Frontend calls backend API
* Backend connects to Cloud SQL
* Login works
* Protected routes work

---

## 13. Common Problems & Fixes

### Forbidden when opening URL

Cause: Cloud Run is private.
Fix: org IAM or authenticated access.

### `bquote>` in terminal

Cause: password contains shell-breaking chars.
Fix: change DB password.

### ENUM `Data truncated`

Cause: legacy values.
Fix: normalize data or avoid ENUMs.

### Trigger SUPER privilege error

Cause: Cloud SQL restrictions.
Fix: enforce rules in application code.

---

## 14. Reuse Checklist (TL;DR)

* [ ] Create project
* [ ] Enable APIs
* [ ] Create Artifact Registry
* [ ] Create Cloud SQL + DB
* [ ] Deploy backend
* [ ] Attach Cloud SQL
* [ ] Run migrations
* [ ] Create admin
* [ ] Deploy frontend
* [ ] Set API URL
* [ ] Fix CORS
* [ ] Open frontend URL

---

**If `/health` = 200 and frontend loads, infrastructure is done.**

---

## 15. Scheduled Monthly Billing (Cloud Scheduler)

The backend exposes an internal endpoint to generate monthly invoices and sync them to each agency’s connected QuickBooks Online company:

- `POST /api/billing/run-monthly`

### 15.1 Required backend env vars

Set these on the backend Cloud Run service:

- `BILLING_JOB_SECRET`: random secret used by Cloud Scheduler header `X-Billing-Job-Secret`

### 15.2 Create a Cloud Scheduler job (example)

This example runs at **03:00 on the 1st of every month** (America/Los_Angeles) and bills the **previous calendar month**.

```bash
BILLING_URL=$(gcloud run services describe onboarding-backend --region us-central1 --format="value(status.url)")

gcloud scheduler jobs create http onboarding-monthly-billing \
  --location us-central1 \
  --schedule "0 3 1 * *" \
  --time-zone "America/Los_Angeles" \
  --uri "${BILLING_URL}/api/billing/run-monthly" \
  --http-method POST \
  --oidc-service-account-email "PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --oidc-token-audience "${BILLING_URL}" \
  --headers "X-Billing-Job-Secret=YOUR_BILLING_JOB_SECRET"
```

Notes:

- Cloud Run is private in many orgs; Cloud Scheduler should use **OIDC auth** (service account must have `roles/run.invoker`).
- The endpoint also requires the **header secret** (`BILLING_JOB_SECRET`) to reduce risk of accidental/unauthorized triggering.
