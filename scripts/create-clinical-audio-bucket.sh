#!/bin/bash
# Create GCS bucket for clinical/voicemail audio (Speech-to-Text temp storage)
# Run after: gcloud auth login && gcloud config set project ptonboard-dev

set -e
PROJECT_ID="${GCP_PROJECT_ID:-ptonboard-dev}"
BUCKET_NAME="ptonboard-clinical-audio"
LOCATION="us-west3"

echo "Creating bucket gs://${BUCKET_NAME} in ${PROJECT_ID} (${LOCATION})..."
gcloud storage buckets create "gs://${BUCKET_NAME}" \
  --project="$PROJECT_ID" \
  --location="$LOCATION" \
  --uniform-bucket-level-access

echo ""
echo "✅ Bucket created. Add to backend/.env:"
echo "   CLINICAL_AUDIO_BUCKET=${BUCKET_NAME}"
echo ""
echo "Ensure your Cloud Run service account has Storage Object Admin on this bucket."
echo "If using default compute SA: projects/${PROJECT_ID}.iam.gserviceaccount.com"
