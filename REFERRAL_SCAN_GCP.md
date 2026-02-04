# Referral Packet Malware Scanning (GCP)

This adds a Cloud Run scanner service (ClamAV) that is triggered by Eventarc on GCS object finalize events. It scans referral packets uploaded to `referrals_quarantine/`, then reports results back to the backend (`/api/referrals/scan-result`).

## What’s included

- `referral_scanner/` Cloud Run service (Node + ClamAV)
- GCS object metadata now includes the encryption fields needed to decrypt
- Backend continues to manage scan status and object moves

## Required GCP resources

- Cloud Run service account with:
  - `roles/storage.objectViewer` on the bucket
  - `roles/cloudkms.cryptoKeyDecrypter` on the KMS key used for referral encryption
- Eventarc trigger for GCS `google.cloud.storage.object.v1.finalized`

## Environment variables (Cloud Run scanner)

- `BACKEND_URL` (example: `https://onboarding-backend-...run.app`)
- `REFERRAL_SCAN_TOKEN` (must match backend `REFERRAL_SCAN_TOKEN`)

## Deploy (example)

```
gcloud run deploy referral-scanner \
  --region=us-west3 \
  --source=referral_scanner \
  --set-env-vars=BACKEND_URL=https://onboarding-backend-...run.app,REFERRAL_SCAN_TOKEN=YOUR_TOKEN \
  --service-account=YOUR_SCANNER_SA
```

## Eventarc trigger (example)

```
gcloud eventarc triggers create referral-scan-trigger \
  --location=us-west3 \
  --destination-run-service=referral-scanner \
  --destination-run-region=us-west3 \
  --event-filters="type=google.cloud.storage.object.v1.finalized" \
  --event-filters="bucket=YOUR_BUCKET_NAME"
```

## Notes

- The scanner only processes objects under `referrals_quarantine/`.
- Scan results are posted back to the backend. The backend moves clean files from quarantine to `referrals/`, or deletes infected files.
