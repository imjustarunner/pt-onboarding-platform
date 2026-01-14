# Local Development Setup Guide

This guide helps you set up local development so you can:
- See changes immediately without deploying
- Test locally before pushing to Git
- Connect to your Cloud SQL database
- Debug easily with full access to logs

## Prerequisites

- ✅ Cloud SQL Proxy installed (`brew install cloud-sql-proxy`)
- ✅ Node.js installed
- ✅ Access to Cloud SQL database

## Quick Start

### 1. Update Database Password

Edit `backend/.env` and replace `YOUR_CLOUD_SQL_PASSWORD_HERE` with your actual Cloud SQL root password.

### 2. Start Cloud SQL Proxy

In **Terminal 1**, run:

```bash
cloud-sql-proxy ptonboard-dev:us-west3:ptonboard-mysql --port 3307
```

**Keep this terminal running** - it creates a secure tunnel to your Cloud SQL database.

You should see:
```
Ready for new connections
```

### 3. Start Backend

In **Terminal 2**, run:

```bash
cd backend
/usr/local/bin/npm install  # if needed
/usr/local/bin/npm run dev
```

You should see:
```
✅ Database connected successfully
  - Connected to database: onboarding_stage
🚀 Server running on port 3000
📝 Environment: development
```

### 4. Start Frontend

In **Terminal 3**, run:

```bash
cd frontend
/usr/local/bin/npm install  # if needed
/usr/local/bin/npm run dev
```

You should see:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

### 5. Open Browser

Navigate to: **http://localhost:5173**

You should see your application running locally!

## Environment Files

### `backend/.env`
- Database connection via Cloud SQL Proxy
- Local development settings
- CORS configured for localhost:5173

### `frontend/.env`
- API URL pointing to localhost:3000
- Ensures frontend always uses local backend

**Note**: These files are gitignored and won't affect production.

## Development Workflow

1. **Make changes** to your code
2. **See changes immediately** - Vite hot-reloads frontend, backend auto-restarts
3. **Test locally** - everything runs on localhost
4. **When ready** - commit and push to Git
5. **GitHub Actions** - automatically deploys to Cloud Run

## Troubleshooting

### Backend can't connect to database

**Symptoms**: `❌ Database connection error` in backend logs

**Solutions**:
- Check Cloud SQL Proxy is running (Terminal 1)
- Verify password in `backend/.env` is correct
- Check connection name: `ptonboard-dev:us-west3:ptonboard-mysql`
- Try: `gcloud sql instances describe ptonboard-mysql --project=ptonboard-dev`

### Frontend can't reach backend

**Symptoms**: Network errors in browser console, 404s on API calls

**Solutions**:
- Check backend is running on port 3000
- Verify `VITE_API_URL=http://localhost:3000/api` in `frontend/.env`
- Check browser console for CORS errors
- Verify `CORS_ORIGIN=http://localhost:5173` in `backend/.env`

### Port already in use

**Backend port 3000**:
```bash
# Change in backend/.env
PORT=3001

# Update frontend/.env
VITE_API_URL=http://localhost:3001/api
```

**Frontend port 5173**:
- Vite will auto-increment to 5174, 5175, etc.
- Or change in `frontend/vite.config.js`

**Database port 3307**:
```bash
# Use different port for proxy
cloud-sql-proxy ptonboard-dev:us-west3:ptonboard-mysql --port 3308

# Update backend/.env
DB_PORT=3308
```

### Cloud SQL Proxy authentication errors

**Symptoms**: `permission denied` or `authentication failed`

**Solutions**:
```bash
# Re-authenticate
gcloud auth login

# Set correct project
gcloud config set project ptonboard-dev

# Verify access
gcloud sql instances list --project=ptonboard-dev
```

## Helper Scripts

### Get Cloud SQL Connection Details
```bash
./scripts/get-cloud-sql-connection.sh
```

### Start Local Development Guide
```bash
./scripts/start-local-dev.sh
```

## Switching Between Local and Production

**Local Development** (uses `.env` files):
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- Database: Cloud SQL via proxy on port 3307

**Production** (uses Cloud Run env vars):
- Frontend: `https://onboarding-frontend-...run.app`
- Backend: `https://onboarding-backend-...run.app`
- Database: Cloud SQL via Unix socket

The `.env` files are gitignored, so they only affect local development.

## Benefits

✅ **Fast iteration** - See changes immediately  
✅ **Safe testing** - Test before pushing  
✅ **Real database** - Use actual Cloud SQL data  
✅ **Easy debugging** - Full logs and DevTools  
✅ **No CI/CD delays** - Only deploy when working  

## Next Steps

1. Test login flow locally
2. Verify database queries work
3. Make a small change and see it hot-reload
4. Proceed with your overhaul planning
