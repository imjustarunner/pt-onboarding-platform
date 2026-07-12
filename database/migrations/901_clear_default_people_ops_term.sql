-- Migration 901: clear default "People Operations" title suffix
-- Header should show tenant name only unless an agency/platform sets a custom suffix.
UPDATE platform_branding
SET people_ops_term = NULL
WHERE people_ops_term IS NOT NULL
  AND TRIM(people_ops_term) IN ('People Operations', 'People Ops', 'HR');
