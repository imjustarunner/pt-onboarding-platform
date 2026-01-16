-- Migration: Add multi_select field type to user_info_field_definitions
-- Description: Enables checkbox-style multi-select fields for Provider Info modules.

ALTER TABLE user_info_field_definitions
MODIFY COLUMN field_type ENUM('text', 'number', 'date', 'email', 'phone', 'select', 'multi_select', 'textarea', 'boolean') NOT NULL;

