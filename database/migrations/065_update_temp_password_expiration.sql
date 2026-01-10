-- Migration: Update temporary password expiration to 48 hours
-- Description: Change default temporary password expiration from 30 days to 48 hours
-- Note: This migration doesn't modify the database schema, but documents the change
-- The actual expiration logic is updated in User.model.js setTemporaryPassword method
-- Existing temporary passwords with longer expiration will remain until they expire naturally
-- No schema changes needed - expiration is handled in application code
-- This is a no-op migration that only serves as documentation

SELECT 1;
