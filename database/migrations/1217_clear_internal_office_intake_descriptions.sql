-- Migration 1217: remove internal office-master copy from public intake links
UPDATE intake_links
SET description = NULL
WHERE description LIKE '%inherits office master%'
   OR description LIKE '%in-depth intake shell%'
   OR description LIKE '%not for public sharing%'
   OR description LIKE '%published shell inherits%';
