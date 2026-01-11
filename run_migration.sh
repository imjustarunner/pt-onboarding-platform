#!/bin/bash
# Run migration 091_add_username_field.sql
# This script connects to Cloud SQL and runs the migration

echo "Running migration 091_add_username_field.sql..."
echo "Please enter your MySQL root password when prompted:"
echo ""

mysql -h 127.0.0.1 -P 3307 -u root -p onboarding_stage < database/migrations/091_add_username_field.sql

echo ""
echo "Migration complete!"
