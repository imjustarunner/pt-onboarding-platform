# Deployment Guide - Google Cloud Platform

This guide will walk you through deploying the PlotTwistCo People Operations Platform to Google Cloud Platform using Cloud Run, Cloud SQL, and Cloud Storage.

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **GitHub Account** for repository hosting
3. **gcloud CLI** installed locally (optional, for manual deployments)
4. **Docker** installed locally (optional, for testing)

## Architecture Overview

- **Frontend**: Vue.js app deployed to Cloud Run
- **Backend**: Node.js/Express API deployed to Cloud Run
- **Database**: MySQL on Cloud SQL
- **Storage**: Google Cloud Storage for file uploads
- **CI/CD**: GitHub Actions for automated deployments

## Step-by-Step Deployment

### Part 1: Google Cloud Setup

#### 1.1 Create a New GCP Project

```bash
# Install gcloud CLI if you haven't already
# https://cloud.google.com/sdk/docs/install

# Login to Google Cloud
gcloud auth login

# Create a new project (replace with your project name)
gcloud projects create your-project-id --name="Onboarding Platform"

# Set the project as default
gcloud config set project your-project-id

# Enable billing (you'll need to do this in the console)
# https://console.cloud.google.com/billing
```

#### 1.2 Enable Required APIs

```bash
# Enable Cloud Run API
gcloud services enable run.googleapis.com

# Enable Cloud SQL Admin API
gcloud services enable sqladmin.googleapis.com

# Enable Cloud Build API
gcloud services enable cloudbuild.googleapis.com

# Enable Container Registry API
gcloud services enable containerregistry.googleapis.com

# Enable Cloud Storage API
gcloud services enable storage-component.googleapis.com

# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com
```

#### 1.3 Create Cloud SQL MySQL Instance

```bash
# Create a MySQL instance (this will take several minutes)
gcloud sql instances create onboarding-mysql \
  --database-version=MYSQL_8_0 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=YOUR_ROOT_PASSWORD \
  --storage-type=SSD \
  --storage-size=20GB \
  --backup-start-time=03:00 \
  --enable-bin-log

# Create a database
gcloud sql databases create onboarding_db --instance=onboarding-mysql

# Create a database user
gcloud sql users create onboarding_user \
  --instance=onboarding-mysql \
  --password=YOUR_DB_PASSWORD
```

**Note**: Save the connection name for later:
```bash
# Get the connection name
gcloud sql instances describe onboarding-mysql --format="value(connectionName)"
# Output format: PROJECT_ID:REGION:INSTANCE_NAME
```

#### 1.4 Create Cloud Storage Bucket

```bash
# Create a bucket for file storage
gsutil mb -p your-project-id -l us-central1 gs://your-project-id-uploads

# Make the bucket private (recommended)
gsutil iam ch allUsers:objectViewer gs://your-project-id-uploads
```

#### 1.5 Create Service Account for Cloud Run

```bash
# Create service account
gcloud iam service-accounts create cloud-run-sa \
  --display-name="Cloud Run Service Account"

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:cloud-run-sa@your-project-id.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Grant Cloud Storage access
gsutil iam ch serviceAccount:cloud-run-sa@your-project-id.iam.gserviceaccount.com:objectAdmin gs://your-project-id-uploads
```

#### 1.6 Store Secrets in Secret Manager

```bash
# Generate a JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Store secrets
echo -n "your-jwt-secret-here" | gcloud secrets create JWT_SECRET --data-file=-
echo -n "your-db-password" | gcloud secrets create DB_PASSWORD --data-file=-
echo -n "onboarding_user" | gcloud secrets create DB_USER --data-file=-
echo -n "onboarding_db" | gcloud secrets create DB_NAME --data-file=-

# For GCS credentials, you'll need to create a service account key
# Download the key and store it as a secret
gcloud iam service-accounts create gcs-sa --display-name="GCS Service Account"
gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:gcs-sa@your-project-id.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Create and download key
gcloud iam service-accounts keys create gcs-key.json \
  --iam-account=gcs-sa@your-project-id.iam.gserviceaccount.com

# Store as secret (you'll need to base64 encode it or store as JSON)
cat gcs-key.json | gcloud secrets create GCS_CREDENTIALS --data-file=-
```

### Part 2: GitHub Setup

#### 2.1 Create GitHub Repository

1. Go to GitHub and create a new repository
2. Push your code to the repository

```bash
# Initialize git if not already done
git init
git add .
git commit -m "Initial commit"

# Add remote and push
git remote add origin https://github.com/your-username/your-repo.git
git branch -M main
git push -u origin main
```

#### 2.2 Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following secrets:

- `GCP_PROJECT_ID`: Your GCP project ID
- `GCP_SA_KEY`: Service account key JSON (download from GCP Console)
- `CLOUD_SQL_CONNECTION_NAME`: Format: `PROJECT_ID:REGION:INSTANCE_NAME`
- `FRONTEND_API_URL`: Your backend API URL (will be set after first deployment)

**To get GCP_SA_KEY:**
```bash
# Create a service account for GitHub Actions
gcloud iam service-accounts create github-actions-sa \
  --display-name="GitHub Actions Service Account"

# Grant necessary permissions
gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:github-actions-sa@your-project-id.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:github-actions-sa@your-project-id.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:github-actions-sa@your-project-id.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Create and download key
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions-sa@your-project-id.iam.gserviceaccount.com

# Copy the contents of github-actions-key.json to GitHub secret GCP_SA_KEY
```

### Part 3: Configure Environment Variables

#### 3.1 Backend Environment Variables

Update `backend/.env.example` with your actual values, then create `backend/.env` (DO NOT commit this):

```env
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://your-frontend-url.run.app
CORS_ORIGIN=https://your-frontend-url.run.app
JWT_SECRET=your-secret-from-secret-manager
JWT_EXPIRES_IN=24h
DB_HOST=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME
DB_PORT=3306
DB_USER=onboarding_user
DB_PASSWORD=your-password-from-secret-manager
DB_NAME=onboarding_db
STORAGE_TYPE=gcs
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket-name
GCS_CREDENTIALS={"type":"service_account",...}
```

#### 3.2 Frontend Environment Variables

Update `frontend/.env.example` with your actual values, then create `frontend/.env`:

```env
VITE_API_URL=https://your-backend-url.run.app/api
```

**Important**: For Cloud Run deployment, you'll set these via Cloud Run's environment variables interface or in the GitHub Actions workflow.

### Part 4: First Deployment

#### 4.1 Manual Deployment (Testing)

Before setting up CI/CD, test deployment manually:

**Backend:**
```bash
cd backend
gcloud builds submit --tag gcr.io/your-project-id/onboarding-backend

gcloud run deploy onboarding-backend \
  --image gcr.io/your-project-id/onboarding-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --service-account cloud-run-sa@your-project-id.iam.gserviceaccount.com \
  --add-cloudsql-instances=PROJECT_ID:REGION:INSTANCE_NAME \
  --set-env-vars="NODE_ENV=production,DB_HOST=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME,DB_PORT=3306,DB_NAME=onboarding_db,STORAGE_TYPE=gcs,GCS_PROJECT_ID=your-project-id,GCS_BUCKET_NAME=your-bucket-name" \
  --set-secrets="JWT_SECRET=JWT_SECRET:latest,DB_PASSWORD=DB_PASSWORD:latest,DB_USER=DB_USER:latest,GCS_CREDENTIALS=GCS_CREDENTIALS:latest,GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_API_KEY:latest"
```

**Google Maps (Distance Matrix)**

- The backend reads the key from **`GOOGLE_MAPS_API_KEY`** (used for automatic mileage distance calculation).
- Recommended: store it in Secret Manager and mount it as an env var (as shown above).

**Frontend:**
```bash
cd frontend
# Update VITE_API_URL in .env first
gcloud builds submit --tag gcr.io/your-project-id/onboarding-frontend

gcloud run deploy onboarding-frontend \
  --image gcr.io/your-project-id/onboarding-frontend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="VITE_API_URL=https://your-backend-url.run.app/api"
```

#### 4.2 Run Database Migrations

After first deployment, run migrations:

```bash
# Connect to Cloud SQL and run migrations
# Option 1: Using Cloud SQL Proxy
cloud_sql_proxy -instances=PROJECT_ID:REGION:INSTANCE_NAME=tcp:3306

# In another terminal, run migrations
cd backend
DB_HOST=localhost DB_PORT=3306 DB_USER=onboarding_user DB_PASSWORD=your-password DB_NAME=onboarding_db npm run migrate

# Option 2: Using Cloud Run Job (recommended for production)
# Create a Cloud Run job for migrations
```

### Part 5: Set Up Custom Domains (Optional)

1. Go to Cloud Run in GCP Console
2. Click on your service → Manage Custom Domains
3. Add your domain
4. Update DNS records as instructed
5. Update CORS_ORIGIN and FRONTEND_URL environment variables

### Part 6: Automated CI/CD

Once you've pushed the GitHub Actions workflows, they will automatically deploy on push to main:

- Backend changes in `backend/` → Deploys backend
- Frontend changes in `frontend/` → Deploys frontend

### Part 7: Post-Deployment

#### 7.1 Create Admin User

```bash
# Connect to your Cloud Run backend
# You can use Cloud Run's "Execute command" feature or create a script

# Or use Cloud SQL directly
gcloud sql connect onboarding-mysql --user=root

# Then run the create admin script
```

#### 7.2 Verify Deployment

1. Check Cloud Run services are running
2. Test frontend URL
3. Test backend API endpoints
4. Verify database connection
5. Test file uploads to Cloud Storage

## Troubleshooting

### Database Connection Issues

- Verify Cloud SQL instance is running
- Check connection name format: `PROJECT_ID:REGION:INSTANCE_NAME`
- Ensure service account has `cloudsql.client` role
- Check firewall rules if using public IP

### Build Failures

- Check Cloud Build logs in GCP Console
- Verify Dockerfile syntax
- Check for missing dependencies

### Runtime Errors

- Check Cloud Run logs: `gcloud run services logs read onboarding-backend`
- Verify environment variables are set correctly
- Check Secret Manager secrets are accessible

## Cost Optimization

- Use Cloud Run's automatic scaling (pay per request)
- Use Cloud SQL's smallest tier for development
- Enable Cloud CDN for frontend static assets
- Set up Cloud Storage lifecycle policies for old files

## Security Best Practices

1. ✅ Never commit `.env` files (already in `.gitignore`)
2. ✅ Use Secret Manager for sensitive data
3. ✅ Enable Cloud SQL private IP
4. ✅ Use IAM roles with least privilege
5. ✅ Enable Cloud Armor for DDoS protection
6. ✅ Regular security updates for dependencies

## Next Steps

- Set up monitoring with Cloud Monitoring
- Configure alerts for errors and high latency
- Set up backup schedules for Cloud SQL
- Configure custom domains with SSL
- Set up staging environment

## Support

For issues, check:
- Cloud Run logs
- Cloud Build logs
- Cloud SQL logs
- GitHub Actions logs
