-- Migration: Remove auto_assign usage and cleanup old assignments
-- Description: Delete existing user checklist assignments (keeping table for completion tracking)

-- Delete all existing user checklist assignments
-- Items will now be automatically available based on agency settings
DELETE FROM user_custom_checklist_assignments;

-- Note: We keep the auto_assign column in custom_checklist_items table for now
-- but it will no longer be used. The column can be removed in a future migration if needed.

