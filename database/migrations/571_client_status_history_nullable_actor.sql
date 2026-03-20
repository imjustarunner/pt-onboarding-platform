-- Allow client_status_history rows with no human actor (cron / public intake / etc.)
-- Previously NULL was replaced with the first admin user, mislabeling automated changes.

-- NOTE: Do not put semicolons inside COMMENT text — the migration runner splits on `;`.
ALTER TABLE client_status_history
  MODIFY COLUMN changed_by_user_id INT NULL;

-- Fix rows created by the daily first-service promotion job (were attributed to fallback admin)
UPDATE client_status_history
SET changed_by_user_id = NULL
WHERE note = 'Auto-marked current based on first date of service (daily job)';
