# Storage Setup Guide

## Overview

The application supports two storage backends:
1. **Local Filesystem** (default) - Files stored on the server's local disk
2. **Google Cloud Storage** - Files stored in a GCS bucket

## Current Storage Structure

- **Signed Documents**: `signed/{userId}/{documentId}/{filename}`
- **Templates**: `templates/{templateId}/{filename}`
- **User-specific**: `users/{userId}/{type}/{filename}`

## Local Storage (Default)

No configuration needed. Files are stored in `backend/uploads/` directory.

## Google Cloud Storage Setup

### Prerequisites

1. Google Cloud Project with Storage API enabled
2. Service Account with Storage Admin role
3. GCS Bucket created

### Installation

```bash
npm install @google-cloud/storage
```

### Configuration

Add these environment variables to your `.env` file:

```env
STORAGE_TYPE=gcs
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket-name
GCS_KEY_FILENAME=path/to/service-account-key.json
```

**OR** use credentials as a JSON string:

```env
STORAGE_TYPE=gcs
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket-name
GCS_CREDENTIALS={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

### Service Account Setup

1. Go to Google Cloud Console → IAM & Admin → Service Accounts
2. Create a new service account or use existing
3. Grant "Storage Admin" role
4. Create a JSON key and download it
5. Set `GCS_KEY_FILENAME` to the path of this file, or paste the JSON content into `GCS_CREDENTIALS`

### Bucket Setup

1. Create a bucket in Google Cloud Storage
2. Set appropriate permissions (service account should have access)
3. Set `GCS_BUCKET_NAME` to your bucket name

### Migration from Local to GCS

When switching from local to GCS storage:

1. **New documents** will automatically be saved to GCS
2. **Old documents** will remain on local filesystem until migrated
3. The system will attempt to read from both locations (new format first, then fallback to old)

### Troubleshooting

**Error: "File not found"**
- Check that the file path in the database matches the actual file location
- For old documents, they may be in the old format and need migration
- Check server logs for detailed error messages

**Error: "Google Cloud Storage not yet implemented"**
- Make sure `STORAGE_TYPE=gcs` is set in your `.env`
- Install `@google-cloud/storage` package: `npm install @google-cloud/storage`
- Verify GCS credentials are correct

**Error: "Access denied" or "Permission denied"**
- Verify service account has "Storage Admin" role
- Check bucket permissions
- Verify service account email has access to the bucket

## Error Handling

The system includes fallback mechanisms:
- If a file is not found in the new format, it will try the old format
- Detailed error messages are logged to help diagnose issues
- Old documents signed before proper storage implementation may need manual migration

