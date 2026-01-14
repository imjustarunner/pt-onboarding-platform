#!/bin/bash
# Helper script to get Cloud SQL connection details for local development

echo "🔍 Getting Cloud SQL Connection Details..."
echo ""

# Get project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ No project set. Run: gcloud config set project ptonboard-dev"
    exit 1
fi

echo "📋 Project ID: $PROJECT_ID"
echo ""

# List Cloud SQL instances
echo "📊 Cloud SQL Instances:"
gcloud sql instances list --format="table(connectionName,name,region,databaseVersion)" --project="$PROJECT_ID" 2>/dev/null

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Error: Could not list instances. Make sure you're authenticated:"
    echo "   gcloud auth login"
    exit 1
fi

echo ""
echo "✅ Connection name format: PROJECT_ID:REGION:INSTANCE_NAME"
echo ""
echo "💡 To start Cloud SQL Proxy, use:"
echo "   cloud-sql-proxy PROJECT_ID:REGION:INSTANCE_NAME --port 3307"
echo ""
