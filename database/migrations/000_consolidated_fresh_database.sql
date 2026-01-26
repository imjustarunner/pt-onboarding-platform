-- Consolidated Migration for Fresh Database
-- Generated: 2026-01-13T19:05:36.888Z
-- This migration combines all essential schema changes
-- Data-only migrations and negated migrations have been excluded
--
-- Total migrations analyzed: 107
-- Essential migrations included: 85
-- Redundant migrations excluded: 73
-- Data-only migrations excluded: 14
--

-- ========================================
-- Migration: 002_add_programs
-- File: 002_add_programs.sql
-- ========================================
-- Migration: Add programs table
-- Description: Programs belong to agencies

CREATE TABLE IF NOT EXISTS programs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    INDEX idx_agency (agency_id),
    INDEX idx_active (is_active)
);

-- Create default ITSCO program (assuming PlotTwistCo agency has id=1)
INSERT INTO programs (agency_id, name, description, is_active)
SELECT id, 'ITSCO', 'ITSCO Program', TRUE
FROM agencies WHERE slug = 'plottwistco' LIMIT 1
ON DUPLICATE KEY UPDATE programs.name=programs.name;



-- ========================================
-- Migration: 003_add_user_relationships
-- File: 003_add_user_relationships.sql
-- ========================================
-- Migration: Add user-agency and user-program relationships
-- Description: Many-to-many relationships for multi-agency support

CREATE TABLE IF NOT EXISTS user_agencies (
    user_id INT NOT NULL,
    agency_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, agency_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_agency (agency_id)
);

CREATE TABLE IF NOT EXISTS user_programs (
    user_id INT NOT NULL,
    program_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, program_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_program (program_id)
);



-- ========================================
-- Migration: 005_add_module_assignments
-- File: 005_add_module_assignments.sql
-- ========================================
-- Migration: Add module assignments table
-- Description: Track module assignments at platform/agency/program/role levels

CREATE TABLE IF NOT EXISTS module_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    module_id INT NOT NULL,
    assignment_type ENUM('platform', 'agency', 'program', 'role') NOT NULL,
    assignment_id INT NOT NULL,
    is_required BOOLEAN DEFAULT FALSE,
    is_optional BOOLEAN DEFAULT FALSE,
    is_assigned BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    INDEX idx_module (module_id),
    INDEX idx_assignment_type (assignment_type, assignment_id),
    UNIQUE KEY unique_assignment (module_id, assignment_type, assignment_id)
);



-- ========================================
-- Migration: 006_add_acknowledgments
-- File: 006_add_acknowledgments.sql
-- ========================================
-- Migration: Add acknowledgments table
-- Description: Track user acknowledgments (checkbox + timestamp)

CREATE TABLE IF NOT EXISTS acknowledgments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    module_id INT NOT NULL,
    acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_module (user_id, module_id),
    INDEX idx_user (user_id),
    INDEX idx_module (module_id),
    INDEX idx_acknowledged_at (acknowledged_at)
);



-- ========================================
-- Migration: 007_update_users_roles
-- File: 007_update_users_roles.sql
-- ========================================
-- Migration: Update users table roles
-- Description: Expand role enum to support new roles (admin, supervisor, clinician, facilitator, intern)

-- Note: MySQL doesn't support ALTER ENUM directly, so we need to recreate
-- This migration assumes the table exists and we're adding new roles

-- First, add a temporary column with new enum
ALTER TABLE users 
ADD COLUMN role_new ENUM('admin', 'supervisor', 'clinician', 'facilitator', 'intern') 
AFTER password_hash;

-- Copy data, mapping 'employee' to 'clinician'
UPDATE users 
SET role_new = CASE 
    WHEN role = 'admin' THEN 'admin'
    WHEN role = 'employee' THEN 'clinician'
    ELSE 'clinician'
END;

-- Drop old column
ALTER TABLE users DROP COLUMN role;

-- Rename new column
ALTER TABLE users CHANGE role_new role ENUM('admin', 'supervisor', 'clinician', 'facilitator', 'intern') DEFAULT 'clinician';



-- ========================================
-- Migration: 008_update_modules_tracks
-- File: 008_update_modules_tracks.sql
-- ========================================
-- Migration: Update modules table for tracks and enhancements
-- Description: Add track support, estimated time, visual style, assignment level

ALTER TABLE modules
ADD COLUMN track_id INT NULL AFTER description,
ADD COLUMN estimated_time_minutes INT DEFAULT 0 AFTER order_index,
ADD COLUMN visual_style JSON AFTER estimated_time_minutes,
ADD COLUMN assignment_level ENUM('platform', 'agency', 'role') DEFAULT 'platform' AFTER visual_style,
ADD FOREIGN KEY (track_id) REFERENCES training_tracks(id) ON DELETE SET NULL,
ADD INDEX idx_track (track_id),
ADD INDEX idx_assignment_level (assignment_level);

-- Update module_content to support acknowledgments
ALTER TABLE module_content
MODIFY COLUMN content_type ENUM('video', 'slide', 'quiz', 'acknowledgment', 'text') NOT NULL;

-- Update user_progress to add stage and program_id
ALTER TABLE user_progress
ADD COLUMN stage ENUM('pre-hire', 'onboarding', 'ongoing') DEFAULT 'onboarding' AFTER status,
ADD COLUMN program_id INT NULL AFTER module_id,
ADD FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL,
ADD INDEX idx_stage (stage),
ADD INDEX idx_program (program_id);



-- ========================================
-- Migration: 009_add_super_admin_role
-- File: 009_add_super_admin_role.sql
-- ========================================
-- Migration: Add super_admin role
-- Description: Add super_admin role for PlotTwistCo full system access

-- Add super_admin to role enum
ALTER TABLE users 
MODIFY COLUMN role ENUM('super_admin', 'admin', 'supervisor', 'clinician', 'facilitator', 'intern') 
DEFAULT 'clinician';



-- ========================================
-- Migration: 011_add_program_modules_relationship
-- File: 011_add_program_modules_relationship.sql
-- ========================================
-- Migration: Add program modules relationship
-- Description: Add program_id to modules table for program-level ownership

ALTER TABLE modules
ADD COLUMN program_id INT NULL AFTER agency_id,
ADD FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL,
ADD INDEX idx_program (program_id);



-- ========================================
-- Migration: 012_remove_programs_consolidate_to_tracks
-- File: 012_remove_programs_consolidate_to_tracks.sql
-- ========================================
-- Migration: Remove programs, consolidate to tracks
-- Description: Remove program_id from modules and user_progress, migrate to track-based structure

-- First, ensure any modules with program_id but no track_id get assigned to a default track
-- Create default tracks for agencies that had programs (if needed)
INSERT INTO training_tracks (name, description, agency_id, is_active, order_index)
SELECT 
    CONCAT(p.name, ' Track') as name,
    p.description,
    p.agency_id,
    p.is_active,
    0 as order_index
FROM programs p
WHERE NOT EXISTS (
    SELECT 1 FROM training_tracks t 
    WHERE t.agency_id = p.agency_id 
    AND t.name = CONCAT(p.name, ' Track')
);

-- Migrate modules from programs to tracks
-- Assign modules with program_id to corresponding track
UPDATE modules m
JOIN programs p ON m.program_id = p.id
JOIN training_tracks t ON t.agency_id = p.agency_id AND t.name = CONCAT(p.name, ' Track')
SET m.track_id = t.id, m.program_id = NULL
WHERE m.program_id IS NOT NULL AND m.track_id IS NULL;

-- Also add modules to track_modules junction table if not already there
INSERT INTO track_modules (track_id, module_id, order_index)
SELECT DISTINCT m.track_id, m.id, m.order_index
FROM modules m
WHERE m.track_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM track_modules tm 
    WHERE tm.track_id = m.track_id 
    AND tm.module_id = m.id
)
ON DUPLICATE KEY UPDATE order_index = track_modules.order_index;


-- ========================================
-- Migration: 012a_drop_program_id_columns
-- File: 012a_drop_program_id_columns.sql
-- ========================================
-- Migration: Drop program_id columns
-- Description: Remove program_id from modules and user_progress tables
-- Note: This is split into a separate migration to handle cases where columns may not exist

-- Drop foreign key constraints first
-- Try to drop constraint - if it doesn't exist, migration runner will ignore the error
ALTER TABLE modules DROP FOREIGN KEY modules_ibfk_5;

-- Remove program_id from modules table
ALTER TABLE modules DROP COLUMN program_id;

-- Try to drop foreign key from user_progress (constraint name from migration 008)
ALTER TABLE user_progress DROP FOREIGN KEY user_progress_ibfk_3;

-- Remove program_id from user_progress table  
ALTER TABLE user_progress DROP COLUMN program_id;



-- ========================================
-- Migration: 013_add_track_duplication_fields
-- File: 013_add_track_duplication_fields.sql
-- ========================================
-- Migration: Add track duplication fields
-- Description: Add source_track_id and is_template to training_tracks for duplication support

ALTER TABLE training_tracks
ADD COLUMN source_track_id INT NULL AFTER role,
ADD COLUMN is_template BOOLEAN DEFAULT FALSE AFTER source_track_id,
ADD FOREIGN KEY (source_track_id) REFERENCES training_tracks(id) ON DELETE SET NULL,
ADD INDEX idx_source_track (source_track_id),
ADD INDEX idx_template (is_template);



-- ========================================
-- Migration: 014_add_user_tracks_and_audit
-- File: 014_add_user_tracks_and_audit.sql
-- ========================================
-- Migration: Add user tracks and admin audit log
-- Description: Support user-track assignments and track admin actions

-- Create user_tracks table for assigning users to tracks within agencies
CREATE TABLE IF NOT EXISTS user_tracks (
    user_id INT NOT NULL,
    track_id INT NOT NULL,
    agency_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by_user_id INT NULL,
    PRIMARY KEY (user_id, track_id, agency_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES training_tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_track (track_id),
    INDEX idx_agency (agency_id),
    INDEX idx_user_agency (user_id, agency_id)
);

-- Create admin_audit_log table for tracking admin actions
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action_type ENUM('reset_module', 'reset_track', 'mark_module_complete', 'mark_track_complete') NOT NULL,
    actor_user_id INT NOT NULL,
    target_user_id INT NOT NULL,
    module_id INT NULL,
    track_id INT NULL,
    agency_id INT NOT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL,
    FOREIGN KEY (track_id) REFERENCES training_tracks(id) ON DELETE SET NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    INDEX idx_actor (actor_user_id),
    INDEX idx_target (target_user_id),
    INDEX idx_agency (agency_id),
    INDEX idx_action_type (action_type),
    INDEX idx_created_at (created_at)
);

-- Update user_progress table to add time_spent_seconds and override tracking
ALTER TABLE user_progress
ADD COLUMN time_spent_seconds INT DEFAULT 0 AFTER time_spent_minutes,
ADD COLUMN overridden_by_user_id INT NULL AFTER completed_at,
ADD COLUMN overridden_at TIMESTAMP NULL AFTER overridden_by_user_id,
ADD FOREIGN KEY (overridden_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
ADD INDEX idx_time_seconds (time_spent_seconds),
ADD INDEX idx_overridden (overridden_by_user_id);



-- ========================================
-- Migration: 016_add_document_action_type
-- File: 016_add_document_action_type.sql
-- ========================================
-- Add document_action_type column to tasks table
ALTER TABLE tasks 
ADD COLUMN document_action_type ENUM('signature', 'review', 'acroform') 
DEFAULT 'signature' 
AFTER task_type;

-- Update existing document tasks to have 'signature' type
UPDATE tasks 
SET document_action_type = 'signature' 
WHERE task_type = 'document' AND document_action_type IS NULL;

-- Create document_acknowledgments table
CREATE TABLE IF NOT EXISTS document_acknowledgments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  task_id INT NOT NULL,
  user_id INT NOT NULL,
  acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_task_user (task_id, user_id)
);



-- ========================================
-- Migration: 017_add_agency_terminology
-- File: 017_add_agency_terminology.sql
-- ========================================
-- Migration: Add terminology_settings to agencies table
-- Description: Allow agencies to override platform-wide terminology

ALTER TABLE agencies
ADD COLUMN terminology_settings JSON NULL AFTER color_palette;



-- ========================================
-- Migration: 018_add_user_phone
-- File: 018_add_user_phone.sql
-- ========================================
-- Migration: Add phone_number to users table
-- Description: Store personal cell phone number for user account information

ALTER TABLE users
ADD COLUMN phone_number VARCHAR(20) NULL AFTER email;



-- ========================================
-- Migration: 019_create_account_types
-- File: 019_create_account_types.sql
-- ========================================
-- Migration: Create account_types table
-- Description: Platform-level account type templates that can be pushed to agencies

CREATE TABLE IF NOT EXISTS account_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    is_platform_template BOOLEAN DEFAULT FALSE,
    agency_id INT NULL,
    created_by_user_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_platform_template (is_platform_template),
    INDEX idx_agency_id (agency_id)
);



-- ========================================
-- Migration: 019_create_user_accounts
-- File: 019_create_user_accounts.sql
-- ========================================
-- Migration: Create user_accounts table
-- Description: Store confidential account credentials per user (platform and agency level)

CREATE TABLE IF NOT EXISTS user_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_type_id INT NULL,
    username VARCHAR(255) NULL,
    pin VARCHAR(50) NULL,
    temporary_password VARCHAR(255) NULL,
    temporary_link VARCHAR(500) NULL,
    agency_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (account_type_id) REFERENCES account_types(id) ON DELETE SET NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_agency_id (agency_id),
    INDEX idx_account_type (account_type_id)
);



-- ========================================
-- Migration: 020_create_account_types
-- File: 020_create_account_types.sql
-- ========================================
-- Migration: Create account_types table
-- Description: Platform-level account type templates that can be pushed to agencies

CREATE TABLE IF NOT EXISTS account_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    is_platform_template BOOLEAN DEFAULT FALSE,
    agency_id INT NULL,
    created_by_user_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_platform_template (is_platform_template),
    INDEX idx_agency_id (agency_id)
);



-- ========================================
-- Migration: 020_create_user_accounts
-- File: 020_create_user_accounts.sql
-- ========================================
-- Migration: Create user_accounts table
-- Description: Store confidential account credentials per user (platform and agency level)

CREATE TABLE IF NOT EXISTS user_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_type_id INT NULL,
    username VARCHAR(255) NULL,
    pin VARCHAR(50) NULL,
    temporary_password VARCHAR(255) NULL,
    temporary_link VARCHAR(500) NULL,
    agency_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (account_type_id) REFERENCES account_types(id) ON DELETE SET NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_agency_id (agency_id),
    INDEX idx_account_type (account_type_id)
);



-- ========================================
-- Migration: 021_create_onboarding_checklist
-- File: 021_create_onboarding_checklist.sql
-- ========================================
-- Migration: Create onboarding_checklist_items table
-- Description: Track onboarding progress per user

CREATE TABLE IF NOT EXISTS onboarding_checklist_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_type ENUM('profile', 'training', 'document', 'account_setup', 'custom') NOT NULL,
    item_id INT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP NULL,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_item_type (item_type),
    INDEX idx_completed (is_completed)
);



-- ========================================
-- Migration: 022_add_invitation_token
-- File: 022_add_invitation_token.sql
-- ========================================
-- Migration: Add invitation token and temporary password fields to users table
-- Description: Support user invitation tokens and temporary passwords

ALTER TABLE users
ADD COLUMN invitation_token VARCHAR(255) NULL UNIQUE AFTER phone_number,
ADD COLUMN invitation_token_expires_at TIMESTAMP NULL AFTER invitation_token,
ADD COLUMN temporary_password_hash VARCHAR(255) NULL AFTER invitation_token_expires_at,
ADD COLUMN temporary_password_expires_at TIMESTAMP NULL AFTER temporary_password_hash,
ADD INDEX idx_invitation_token (invitation_token);



-- ========================================
-- Migration: 023_create_user_info_fields
-- File: 023_create_user_info_fields.sql
-- ========================================
-- Migration: Create user_info_field_definitions table
-- Description: Store field definitions at platform and agency level for user information variables

CREATE TABLE IF NOT EXISTS user_info_field_definitions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    field_key VARCHAR(100) NOT NULL,
    field_label VARCHAR(255) NOT NULL,
    field_type ENUM('text', 'number', 'date', 'email', 'phone', 'select', 'textarea', 'boolean') NOT NULL,
    options JSON NULL,
    is_required BOOLEAN DEFAULT FALSE,
    is_platform_template BOOLEAN DEFAULT FALSE,
    agency_id INT NULL,
    parent_field_id INT NULL,
    order_index INT DEFAULT 0,
    created_by_user_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_field_id) REFERENCES user_info_field_definitions(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_agency_id (agency_id),
    INDEX idx_is_platform_template (is_platform_template),
    INDEX idx_field_key (field_key),
    INDEX idx_parent_field (parent_field_id),
    UNIQUE KEY unique_agency_field_key (agency_id, field_key)
);



-- ========================================
-- Migration: 024_create_user_info_values
-- File: 024_create_user_info_values.sql
-- ========================================
-- Migration: Create user_info_values table
-- Description: Store actual user values for information fields

CREATE TABLE IF NOT EXISTS user_info_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    field_definition_id INT NOT NULL,
    value TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (field_definition_id) REFERENCES user_info_field_definitions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_field (user_id, field_definition_id),
    INDEX idx_user_id (user_id),
    INDEX idx_field_definition_id (field_definition_id)
);



-- ========================================
-- Migration: 026_create_user_checklist_assignments
-- File: 026_create_user_checklist_assignments.sql
-- ========================================
-- Migration: Create user_custom_checklist_assignments table
-- Description: Track which custom checklist items are assigned to which users

CREATE TABLE IF NOT EXISTS user_custom_checklist_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    checklist_item_id INT NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP NULL,
    assigned_by_user_id INT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (checklist_item_id) REFERENCES custom_checklist_items(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_user_checklist_item (user_id, checklist_item_id),
    INDEX idx_user_id (user_id),
    INDEX idx_checklist_item_id (checklist_item_id),
    INDEX idx_is_completed (is_completed)
);



-- ========================================
-- Migration: 027_add_user_status
-- File: 027_add_user_status.sql
-- ========================================
-- Migration: Add user status fields for completion/termination tracking
-- Description: Add status tracking and 7-day expiration for completed/terminated users

ALTER TABLE users
ADD COLUMN status ENUM('active', 'completed', 'terminated') DEFAULT 'active' AFTER role,
ADD COLUMN completed_at TIMESTAMP NULL AFTER status,
ADD COLUMN terminated_at TIMESTAMP NULL AFTER completed_at,
ADD COLUMN status_expires_at TIMESTAMP NULL AFTER terminated_at;

CREATE INDEX idx_user_status ON users(status);
CREATE INDEX idx_status_expires_at ON users(status_expires_at);



-- ========================================
-- Migration: 033_add_icon_id_to_agencies
-- File: 033_add_icon_id_to_agencies.sql
-- ========================================
-- Migration: Add icon_id to agencies table if it doesn't exist
-- Description: Safely add icon_id column to agencies table
-- Note: This is handled in migration 032, so this migration is now a no-op
-- Keeping file for migration history but column should already exist
-- This migration intentionally does nothing as the column is added in 032

SELECT 1;


-- ========================================
-- Migration: 034_make_signed_document_pdf_fields_nullable
-- File: 034_make_signed_document_pdf_fields_nullable.sql
-- ========================================
-- Migration: Make signed_pdf_path and pdf_hash nullable in signed_documents table
-- Description: These fields should be NULL during consent phase, then populated when document is finalized

ALTER TABLE signed_documents 
  MODIFY COLUMN signed_pdf_path VARCHAR(500) NULL,
  MODIFY COLUMN pdf_hash VARCHAR(64) NULL;



-- ========================================
-- Migration: 035_fix_signed_at_default
-- File: 035_fix_signed_at_default.sql
-- ========================================
-- Migration: Fix signed_at field default value
-- Description: Ensure signed_at field has a default value to work correctly with prepared statements

ALTER TABLE signed_documents 
  MODIFY COLUMN signed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;



-- ========================================
-- Migration: 036_add_signature_coordinates_to_document_templates
-- File: 036_add_signature_coordinates_to_document_templates.sql
-- ========================================
-- Migration: Add signature coordinate fields to document_templates
-- Description: Allow admins to specify where signatures should be placed on documents

ALTER TABLE document_templates
  ADD COLUMN signature_x DECIMAL(10, 2) NULL COMMENT 'X coordinate for signature placement (in points, 72 per inch)',
  ADD COLUMN signature_y DECIMAL(10, 2) NULL COMMENT 'Y coordinate for signature placement (in points, 72 per inch)',
  ADD COLUMN signature_width DECIMAL(10, 2) NULL COMMENT 'Width of signature field (in points)',
  ADD COLUMN signature_height DECIMAL(10, 2) NULL COMMENT 'Height of signature field (in points)',
  ADD COLUMN signature_page INT NULL COMMENT 'Page number where signature should be placed (NULL = last page)';



-- ========================================
-- Migration: 038_add_people_ops_term_to_platform_branding
-- File: 038_add_people_ops_term_to_platform_branding.sql
-- ========================================
-- Add people_ops_term column to platform_branding table
-- Note: The migration script will catch "Duplicate column" errors and skip them
ALTER TABLE platform_branding
ADD COLUMN people_ops_term VARCHAR(100) NULL DEFAULT NULL;


-- ========================================
-- Migration: 039_add_archive_fields
-- File: 039_add_archive_fields.sql
-- ========================================
-- Migration: Add archive fields to training_tracks, modules, and users tables
-- Description: Add is_archived and archived_at fields to support soft deletion
-- Rewritten to use plain SQL compatible with mysql2 prepared statements (no PREPARE/EXECUTE)
-- The migration runner will catch "Duplicate column", "Duplicate key", and "Duplicate foreign key" errors and skip them

-- Add archive fields to training_tracks
ALTER TABLE training_tracks
ADD COLUMN is_archived BOOLEAN DEFAULT FALSE AFTER is_active,
ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER is_archived,
ADD COLUMN archived_by_user_id INT NULL DEFAULT NULL AFTER archived_at;

-- Add index for is_archived on training_tracks
CREATE INDEX idx_training_tracks_is_archived ON training_tracks(is_archived);

-- Add archive fields to modules
ALTER TABLE modules
ADD COLUMN is_archived BOOLEAN DEFAULT FALSE AFTER is_active,
ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER is_archived,
ADD COLUMN archived_by_user_id INT NULL DEFAULT NULL AFTER archived_at;

-- Add index for is_archived on modules
CREATE INDEX idx_modules_is_archived ON modules(is_archived);

-- Add archive fields to users
ALTER TABLE users
ADD COLUMN is_archived BOOLEAN DEFAULT FALSE AFTER status,
ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER is_archived,
ADD COLUMN archived_by_user_id INT NULL DEFAULT NULL AFTER archived_at;

-- Add index for is_archived on users
CREATE INDEX idx_users_is_archived ON users(is_archived);

-- Add foreign key constraints for archived_by_user_id
-- Note: If these constraints already exist, the migration runner will catch ER_FK_DUP_NAME and skip them
ALTER TABLE training_tracks
ADD CONSTRAINT fk_training_tracks_archived_by
FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE modules
ADD CONSTRAINT fk_modules_archived_by
FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users
ADD CONSTRAINT fk_users_archived_by
FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL;


-- ========================================
-- Migration: 040_add_archive_fields_to_document_templates
-- File: 040_add_archive_fields_to_document_templates.sql
-- ========================================
-- Migration: Add archive fields to document_templates table
-- Description: Add is_archived and archived_at fields to support soft deletion

-- Add archive fields to document_templates
ALTER TABLE document_templates
ADD COLUMN is_archived BOOLEAN DEFAULT FALSE AFTER is_active,
ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER is_archived,
ADD COLUMN archived_by_user_id INT NULL DEFAULT NULL AFTER archived_at;

-- Add index for is_archived on document_templates
CREATE INDEX idx_document_templates_is_archived ON document_templates(is_archived);

-- Add foreign key constraint for archived_by_user_id
ALTER TABLE document_templates
ADD CONSTRAINT fk_document_templates_archived_by
FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL;



-- ========================================
-- Migration: 041_add_icon_defaults
-- File: 041_add_icon_defaults.sql
-- ========================================
-- Migration: Add icon defaults to platform_branding and agencies
-- Description: Add default icon fields for training focus, module, user, and document icons

-- Add default icon fields to platform_branding
ALTER TABLE platform_branding
ADD COLUMN training_focus_default_icon_id INT NULL AFTER display_font,
ADD COLUMN module_default_icon_id INT NULL AFTER training_focus_default_icon_id,
ADD COLUMN user_default_icon_id INT NULL AFTER module_default_icon_id,
ADD COLUMN document_default_icon_id INT NULL AFTER user_default_icon_id,
ADD CONSTRAINT fk_platform_training_focus_icon FOREIGN KEY (training_focus_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_module_icon FOREIGN KEY (module_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_user_icon FOREIGN KEY (user_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_document_icon FOREIGN KEY (document_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Add default icon fields to agencies
ALTER TABLE agencies
ADD COLUMN training_focus_default_icon_id INT NULL AFTER icon_id,
ADD COLUMN module_default_icon_id INT NULL AFTER training_focus_default_icon_id,
ADD COLUMN user_default_icon_id INT NULL AFTER module_default_icon_id,
ADD COLUMN document_default_icon_id INT NULL AFTER user_default_icon_id,
ADD CONSTRAINT fk_agency_training_focus_icon FOREIGN KEY (training_focus_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_module_icon FOREIGN KEY (module_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_user_icon FOREIGN KEY (user_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_document_icon FOREIGN KEY (document_default_icon_id) REFERENCES icons(id) ON DELETE SET NULL;



-- ========================================
-- Migration: 042_add_is_active_to_users
-- File: 042_add_is_active_to_users.sql
-- ========================================
-- Migration: Add is_active field to users table
-- Description: Add is_active field to allow deactivating users without archiving them
-- Rewritten to use plain SQL compatible with MySQL 8.0 (no IF NOT EXISTS)
-- The migration runner will catch "Duplicate column" errors and skip them

-- Add is_active column
ALTER TABLE users 
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER status;

-- Add index for is_active
CREATE INDEX idx_is_active ON users(is_active);

-- Set all existing users to active by default (in case of NULL values)
UPDATE users SET is_active = TRUE WHERE is_active IS NULL;


-- ========================================
-- Migration: 043_add_approved_employee_passwords
-- File: 043_add_approved_employee_passwords.sql
-- ========================================
-- Migration: Add password fields for approved employee authentication
-- Description: Add company default password to agencies and individual passwords to approved_employee_emails

-- Add company default password hash to agencies table
ALTER TABLE agencies
ADD COLUMN company_default_password_hash VARCHAR(255) NULL AFTER terminology_settings;

-- Add individual password hash to approved_employee_emails table
ALTER TABLE approved_employee_emails
ADD COLUMN password_hash VARCHAR(255) NULL AFTER is_active;

-- Add index on password_hash for approved_employee_emails
CREATE INDEX idx_password_hash ON approved_employee_emails(password_hash);



-- ========================================
-- Migration: 044_add_agency_public_training_assignments
-- File: 044_add_agency_public_training_assignments.sql
-- ========================================
-- Migration: Add Agency Public Training Assignments
-- Description: Allow agencies to have specific training focuses and modules assigned as public

-- Agency Public Training Focuses
CREATE TABLE IF NOT EXISTS agency_public_training_focuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NOT NULL,
    training_focus_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (training_focus_id) REFERENCES training_tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_agency_training_focus (agency_id, training_focus_id),
    INDEX idx_agency (agency_id),
    INDEX idx_training_focus (training_focus_id)
);

-- Agency Public Modules
CREATE TABLE IF NOT EXISTS agency_public_modules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NOT NULL,
    module_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INT NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_agency_module (agency_id, module_id),
    INDEX idx_agency (agency_id),
    INDEX idx_module (module_id)
);



-- ========================================
-- Migration: 046_add_agency_to_icons_and_fix_document_icon
-- File: 046_add_agency_to_icons_and_fix_document_icon.sql
-- ========================================
-- Migration: Add agency_id to icons and ensure icon_id exists in document_templates
-- Description: Icons should be associated with either platform (agency_id = NULL) or an agency
-- Rewritten to use plain SQL compatible with MySQL 8.0 and mysql2 prepared statements
-- The migration runner will catch "Duplicate column", "Duplicate key", and "already exists" errors and skip them

-- Add agency_id column to icons table
ALTER TABLE icons
ADD COLUMN agency_id INT NULL AFTER created_by_user_id;

-- Add index on agency_id in icons table
CREATE INDEX idx_icons_agency_id ON icons(agency_id);

-- Add named foreign key constraint for agency_id in icons table
ALTER TABLE icons
ADD CONSTRAINT fk_icons_agency_id
FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE;

-- Add icon_id column to document_templates (if it doesn't exist)
-- Note: If column already exists, the migration runner will catch "Duplicate column" error and skip
ALTER TABLE document_templates
ADD COLUMN icon_id INT NULL AFTER user_id;

-- Add index on icon_id in document_templates
CREATE INDEX idx_document_templates_icon_id ON document_templates(icon_id);

-- Add foreign key constraint for icon_id in document_templates
-- Note: Using a named constraint to avoid conflicts
ALTER TABLE document_templates
ADD CONSTRAINT fk_document_templates_icon_id
FOREIGN KEY (icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Set existing icons without agency_id to platform (NULL = platform)
-- This ensures all existing icons are platform icons
UPDATE icons SET agency_id = NULL WHERE agency_id IS NULL;


-- ========================================
-- Migration: 046a_add_icon_id_to_document_templates_simple
-- File: 046a_add_icon_id_to_document_templates_simple.sql
-- ========================================
-- Migration: Add icon_id to document_templates (simplified version)
-- Description: Adds icon_id column to document_templates if it doesn't exist

-- Add icon_id column if it doesn't exist (using a simple approach)
-- First, try to add it - if it fails because it exists, that's okay
ALTER TABLE document_templates 
ADD COLUMN icon_id INT NULL AFTER user_id;

-- Add foreign key constraint if it doesn't exist
ALTER TABLE document_templates 
ADD CONSTRAINT document_templates_ibfk_icon_id 
FOREIGN KEY (icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Add index if it doesn't exist
ALTER TABLE document_templates 
ADD INDEX idx_icon (icon_id);



-- ========================================
-- Migration: 047_add_dashboard_action_icons
-- File: 047_add_dashboard_action_icons.sql
-- ========================================
-- Migration: Add dashboard action icon fields to platform_branding and agencies
-- Description: Add icon fields for each quick action on the dashboard

-- Add dashboard action icon fields to platform_branding
-- Note: The migration script will catch "Duplicate column" errors and skip them
ALTER TABLE platform_branding
ADD COLUMN manage_agencies_icon_id INT NULL,
ADD COLUMN manage_modules_icon_id INT NULL,
ADD COLUMN manage_documents_icon_id INT NULL,
ADD COLUMN manage_users_icon_id INT NULL,
ADD COLUMN platform_settings_icon_id INT NULL,
ADD COLUMN view_all_progress_icon_id INT NULL,
ADD COLUMN progress_dashboard_icon_id INT NULL,
ADD COLUMN settings_icon_id INT NULL;

-- Add foreign key constraints for platform_branding
ALTER TABLE platform_branding
ADD CONSTRAINT fk_platform_manage_agencies_icon FOREIGN KEY (manage_agencies_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_manage_modules_icon FOREIGN KEY (manage_modules_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_manage_documents_icon FOREIGN KEY (manage_documents_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_manage_users_icon FOREIGN KEY (manage_users_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_platform_settings_icon FOREIGN KEY (platform_settings_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_view_all_progress_icon FOREIGN KEY (view_all_progress_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_progress_dashboard_icon FOREIGN KEY (progress_dashboard_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_platform_settings_icon FOREIGN KEY (settings_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Add dashboard action icon fields to agencies
ALTER TABLE agencies
ADD COLUMN manage_agencies_icon_id INT NULL,
ADD COLUMN manage_modules_icon_id INT NULL,
ADD COLUMN manage_documents_icon_id INT NULL,
ADD COLUMN manage_users_icon_id INT NULL,
ADD COLUMN platform_settings_icon_id INT NULL,
ADD COLUMN view_all_progress_icon_id INT NULL,
ADD COLUMN progress_dashboard_icon_id INT NULL,
ADD COLUMN settings_icon_id INT NULL;

-- Add foreign key constraints for agencies
ALTER TABLE agencies
ADD CONSTRAINT fk_agency_manage_agencies_icon FOREIGN KEY (manage_agencies_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_manage_modules_icon FOREIGN KEY (manage_modules_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_manage_documents_icon FOREIGN KEY (manage_documents_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_manage_users_icon FOREIGN KEY (manage_users_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_platform_settings_icon FOREIGN KEY (platform_settings_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_view_all_progress_icon FOREIGN KEY (view_all_progress_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_progress_dashboard_icon FOREIGN KEY (progress_dashboard_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_agency_settings_icon FOREIGN KEY (settings_icon_id) REFERENCES icons(id) ON DELETE SET NULL;


-- ========================================
-- Migration: 048_add_support_role
-- File: 048_add_support_role.sql
-- ========================================
-- Migration: Add support role
-- Description: Add support role for users who can manage users and assign training but cannot create/edit modules or training focuses

-- Add support to role enum
ALTER TABLE users
MODIFY COLUMN role ENUM('super_admin', 'admin', 'support', 'supervisor', 'clinician', 'facilitator', 'intern') 
DEFAULT 'clinician';



-- ========================================
-- Migration: 049_create_agency_checklist_enabled_items
-- File: 049_create_agency_checklist_enabled_items.sql
-- ========================================
-- Migration: Create agency_checklist_enabled_items table
-- Description: Track which platform checklist items are enabled for which agencies

CREATE TABLE IF NOT EXISTS agency_checklist_enabled_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NOT NULL,
    checklist_item_id INT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (checklist_item_id) REFERENCES custom_checklist_items(id) ON DELETE CASCADE,
    UNIQUE KEY unique_agency_item (agency_id, checklist_item_id),
    INDEX idx_agency_id (agency_id),
    INDEX idx_checklist_item_id (checklist_item_id)
);

-- Enable all existing platform items for all existing agencies by default
INSERT INTO agency_checklist_enabled_items (agency_id, checklist_item_id, enabled)
SELECT DISTINCT a.id, cci.id, TRUE
FROM agencies a
CROSS JOIN custom_checklist_items cci
WHERE cci.is_platform_template = TRUE
AND NOT EXISTS (
    SELECT 1 FROM agency_checklist_enabled_items acei
    WHERE acei.agency_id = a.id AND acei.checklist_item_id = cci.id
);



-- ========================================
-- Migration: 050_remove_auto_assign_and_cleanup
-- File: 050_remove_auto_assign_and_cleanup.sql
-- ========================================
-- Migration: Remove auto_assign usage and cleanup old assignments
-- Description: Delete existing user checklist assignments (keeping table for completion tracking)

-- Delete all existing user checklist assignments
-- Items will now be automatically available based on agency settings
DELETE FROM user_custom_checklist_assignments;

-- Note: We keep the auto_assign column in custom_checklist_items table for now
-- but it will no longer be used. The column can be removed in a future migration if needed.



-- ========================================
-- Migration: 051_ensure_support_role_in_enum
-- File: 051_ensure_support_role_in_enum.sql
-- ========================================
-- Migration: Ensure support role is in enum
-- Description: Ensure the 'support' role is included in the users.role enum
-- This is a safe migration that will work even if the role already exists

-- Add support to role enum (this will work even if support is already in the enum)
ALTER TABLE users
MODIFY COLUMN role ENUM('super_admin', 'admin', 'support', 'supervisor', 'clinician', 'facilitator', 'intern') 
DEFAULT 'clinician';



-- ========================================
-- Migration: 052_add_archive_fields_to_agencies
-- File: 052_add_archive_fields_to_agencies.sql
-- ========================================
-- Migration: Add archive fields to agencies table
-- Description: Add is_archived, archived_at, and archived_by_user_id fields to support soft deletion

-- Add archive fields to agencies
ALTER TABLE agencies
ADD COLUMN is_archived BOOLEAN DEFAULT FALSE AFTER is_active,
ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER is_archived,
ADD COLUMN archived_by_user_id INT NULL DEFAULT NULL AFTER archived_at;

-- Add index for is_archived on agencies
CREATE INDEX idx_agencies_is_archived ON agencies(is_archived);

-- Add foreign key constraint for archived_by_user_id
ALTER TABLE agencies
ADD CONSTRAINT fk_agencies_archived_by
FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL;



-- ========================================
-- Migration: 052_add_staff_role
-- File: 052_add_staff_role.sql
-- ========================================
-- Migration: Add staff role
-- Description: Add staff role for users who are in training and will transition to support role after onboarding. Same access as clinician, facilitator, and intern.

-- Add staff to role enum
ALTER TABLE users
MODIFY COLUMN role ENUM('super_admin', 'admin', 'support', 'supervisor', 'staff', 'clinician', 'facilitator', 'intern') 
DEFAULT 'clinician';



-- ========================================
-- Migration: 053_add_master_brand_icon
-- File: 053_add_master_brand_icon.sql
-- ========================================
-- Migration: Add master brand icon to platform branding
-- Description: Add master_brand_icon_id field for use as the logo when viewing all agencies

-- Add master_brand_icon_id column to platform_branding
ALTER TABLE platform_branding
ADD COLUMN master_brand_icon_id INT NULL AFTER document_default_icon_id,
ADD CONSTRAINT fk_platform_master_brand_icon FOREIGN KEY (master_brand_icon_id) REFERENCES icons(id) ON DELETE SET NULL;



-- ========================================
-- Migration: 054_add_archived_by_agency_id
-- File: 054_add_archived_by_agency_id.sql
-- ========================================
-- Migration: Add archived_by_agency_id to archive tables
-- Description: Track which agency archived each item to enforce agency-scoped archive management
-- Rewritten to use plain SQL compatible with mysql2 prepared statements (no PREPARE/EXECUTE)

-- Add archived_by_agency_id to training_tracks
ALTER TABLE training_tracks
ADD COLUMN archived_by_agency_id INT NULL DEFAULT NULL AFTER archived_by_user_id;

-- Add foreign key constraint for training_tracks
ALTER TABLE training_tracks
ADD CONSTRAINT fk_training_tracks_archived_by_agency
FOREIGN KEY (archived_by_agency_id) REFERENCES agencies(id) ON DELETE SET NULL;

-- Add index for filtering on training_tracks
CREATE INDEX idx_training_tracks_archived_by_agency ON training_tracks(archived_by_agency_id);

-- Add archived_by_agency_id to modules
ALTER TABLE modules
ADD COLUMN archived_by_agency_id INT NULL DEFAULT NULL AFTER archived_by_user_id;

-- Add foreign key constraint for modules
ALTER TABLE modules
ADD CONSTRAINT fk_modules_archived_by_agency
FOREIGN KEY (archived_by_agency_id) REFERENCES agencies(id) ON DELETE SET NULL;

-- Add index for filtering on modules
CREATE INDEX idx_modules_archived_by_agency ON modules(archived_by_agency_id);

-- Add archived_by_agency_id to users
ALTER TABLE users
ADD COLUMN archived_by_agency_id INT NULL DEFAULT NULL AFTER archived_by_user_id;

-- Add foreign key constraint for users
ALTER TABLE users
ADD CONSTRAINT fk_users_archived_by_agency
FOREIGN KEY (archived_by_agency_id) REFERENCES agencies(id) ON DELETE SET NULL;

-- Add index for filtering on users
CREATE INDEX idx_users_archived_by_agency ON users(archived_by_agency_id);

-- Add archived_by_agency_id to document_templates (if table exists)
-- Note: If column already exists, the migration runner will catch "Duplicate column" error and skip
ALTER TABLE document_templates
ADD COLUMN archived_by_agency_id INT NULL DEFAULT NULL AFTER archived_by_user_id;

-- Add foreign key constraint for document_templates
ALTER TABLE document_templates
ADD CONSTRAINT fk_document_templates_archived_by_agency
FOREIGN KEY (archived_by_agency_id) REFERENCES agencies(id) ON DELETE SET NULL;

-- Add index for filtering on document_templates
CREATE INDEX idx_document_templates_archived_by_agency ON document_templates(archived_by_agency_id);


-- ========================================
-- Migration: 055_add_certificate_template_to_agencies
-- File: 055_add_certificate_template_to_agencies.sql
-- ========================================
-- Migration: Add certificate_template_url to agencies table
-- Description: Add certificate_template_url field to support agency-specific certificate templates from Google Docs

-- Add certificate_template_url to agencies table
ALTER TABLE agencies
ADD COLUMN certificate_template_url VARCHAR(500) NULL DEFAULT NULL AFTER contact_info;

-- Add index for certificate_template_url
CREATE INDEX idx_agencies_certificate_template_url ON agencies(certificate_template_url);



-- ========================================
-- Migration: 056_add_module_response_answers
-- File: 056_add_module_response_answers.sql
-- ========================================
-- Migration: Add module response answers storage
-- Description: Add table to store user responses to text/response page questions in modules

-- Module response answers table
CREATE TABLE IF NOT EXISTS module_response_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    module_id INT NOT NULL,
    content_id INT NOT NULL COMMENT 'Reference to module_content.id',
    response_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    FOREIGN KEY (content_id) REFERENCES module_content(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_content_response (user_id, content_id),
    INDEX idx_user (user_id),
    INDEX idx_module (module_id),
    INDEX idx_content (content_id)
);



-- ========================================
-- Migration: 057_protect_superadmin_role
-- File: 057_protect_superadmin_role.sql
-- ========================================
-- Migration: Protect superadmin role (NO-OP)
-- Description: This migration was originally intended to create a database trigger to protect
-- the superadmin account from role changes. However, database triggers require SUPER privilege
-- which is not available in Cloud SQL (error 1419: ER_BINLOG_CREATE_ROUTINE_NEED_SUPER).
-- 
-- Instead, we use application-layer protection in:
--   - backend/src/models/User.model.js (User.update method)
--   - backend/src/controllers/user.controller.js (updateUser controller)
--
-- These application-layer checks prevent:
--   1. Changing superadmin@plottwistco.com away from super_admin role
--   2. Removing super_admin role from any user who currently has it
--
-- This migration is a no-op to maintain migration sequence integrity.
-- The protection is enforced at the application layer, not the database layer.

-- No SQL statements - this migration intentionally does nothing
SELECT 1;


-- ========================================
-- Migration: 058_add_agency_portal_config
-- File: 058_add_agency_portal_config.sql
-- ========================================
-- Migration: Add agency portal configuration fields
-- Description: Add fields for agency portal configuration including onboarding team contact info, portal URL, and theme settings

ALTER TABLE agencies
  ADD COLUMN onboarding_team_email VARCHAR(255) NULL COMMENT 'Email address for the onboarding team',
  ADD COLUMN phone_number VARCHAR(20) NULL COMMENT 'Phone number for the agency',
  ADD COLUMN phone_extension VARCHAR(10) NULL COMMENT 'Phone extension (optional)',
  ADD COLUMN portal_url VARCHAR(255) NULL COMMENT 'Subdomain/URL identifier for portal access (e.g., "itsco", "nextleveluplcc")',
  ADD COLUMN theme_settings JSON NULL COMMENT 'Extended theme configuration (fonts, login background, etc.)';

-- Add unique index on portal_url to prevent conflicts
CREATE UNIQUE INDEX idx_portal_url ON agencies(portal_url);

-- Add index for faster lookups
CREATE INDEX idx_agencies_portal_url ON agencies(portal_url);



-- ========================================
-- Migration: 059_add_user_documents_and_variables
-- File: 059_add_user_documents_and_variables.sql
-- ========================================
-- Migration: Add user documents and template variables system
-- Description: Create tables for personalized user document copies and user-specific documents, update signed_documents
-- Rewritten to use plain SQL compatible with mysql2 prepared statements (no DELIMITER or stored procedures)

-- Create user_documents table for personalized template copies
CREATE TABLE IF NOT EXISTS user_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_template_id INT NOT NULL,
  user_id INT NOT NULL,
  task_id INT NOT NULL,
  personalized_content LONGTEXT NULL COMMENT 'HTML with variables replaced',
  personalized_file_path VARCHAR(500) NULL COMMENT 'PDF with variables replaced',
  generated_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_template_id) REFERENCES document_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_template_task (user_id, document_template_id, task_id),
  INDEX idx_user (user_id),
  INDEX idx_template (document_template_id),
  INDEX idx_task (task_id)
);

-- Create user_specific_documents table for non-template documents
CREATE TABLE IF NOT EXISTS user_specific_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  task_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_type ENUM('pdf', 'html') NOT NULL,
  file_path VARCHAR(500) NULL,
  html_content LONGTEXT NULL,
  document_action_type ENUM('signature', 'review') DEFAULT 'signature',
  icon_id INT NULL,
  signature_x DECIMAL(10, 2) NULL,
  signature_y DECIMAL(10, 2) NULL,
  signature_width DECIMAL(10, 2) NULL,
  signature_height DECIMAL(10, 2) NULL,
  signature_page INT NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_task (task_id)
);

-- Update signed_documents to link to user_documents
-- Note: If column already exists, the migration runner will catch "Duplicate column" error and skip
ALTER TABLE signed_documents 
ADD COLUMN user_document_id INT NULL AFTER document_template_id;

-- Add foreign key constraint for user_document_id
ALTER TABLE signed_documents 
ADD CONSTRAINT fk_signed_documents_user_document_id
FOREIGN KEY (user_document_id) REFERENCES user_documents(id) ON DELETE CASCADE;

-- Add index for user_document_id
CREATE INDEX idx_signed_documents_user_document ON signed_documents(user_document_id);

-- Migrate existing user-specific documents from document_templates to user_specific_documents
-- Note: This will only work if there are existing tasks linked to these documents
INSERT INTO user_specific_documents (
  user_id,
  task_id,
  name,
  description,
  template_type,
  file_path,
  html_content,
  document_action_type,
  icon_id,
  signature_x,
  signature_y,
  signature_width,
  signature_height,
  signature_page,
  created_by_user_id,
  created_at
)
SELECT 
  dt.user_id,
  t.id as task_id,
  dt.name,
  dt.description,
  dt.template_type,
  dt.file_path,
  dt.html_content,
  dt.document_action_type,
  dt.icon_id,
  dt.signature_x,
  dt.signature_y,
  dt.signature_width,
  dt.signature_height,
  dt.signature_page,
  dt.created_by_user_id,
  dt.created_at
FROM document_templates dt
LEFT JOIN tasks t ON t.reference_id = dt.id AND t.task_type = 'document'
WHERE dt.is_user_specific = TRUE
AND dt.user_id IS NOT NULL
AND t.id IS NOT NULL
ON DUPLICATE KEY UPDATE user_specific_documents.name = dt.name;


-- ========================================
-- Migration: 060_fix_role_enum_add_support_staff
-- File: 060_fix_role_enum_add_support_staff.sql
-- ========================================
-- Migration: Fix role enum to include support and staff
-- Description: Add support and staff roles to the users.role enum
-- This migration ensures both roles are present in the correct order

-- Add support and staff to role enum
ALTER TABLE users
MODIFY COLUMN role ENUM('super_admin', 'admin', 'support', 'supervisor', 'staff', 'clinician', 'facilitator', 'intern') 
DEFAULT 'clinician';


-- ========================================
-- Migration: 061_add_all_agencies_notifications_icon
-- File: 061_add_all_agencies_notifications_icon.sql
-- ========================================
-- Migration: Add all agencies notifications icon to platform_branding
-- Description: Add icon field for the "All Agencies" notification card

-- Add all_agencies_notifications_icon_id to platform_branding
ALTER TABLE platform_branding
ADD COLUMN all_agencies_notifications_icon_id INT NULL;

-- Add foreign key constraint
ALTER TABLE platform_branding
ADD CONSTRAINT fk_platform_all_agencies_notifications_icon 
FOREIGN KEY (all_agencies_notifications_icon_id) REFERENCES icons(id) ON DELETE SET NULL;


-- ========================================
-- Migration: 062_add_muted_until_to_notifications
-- File: 062_add_muted_until_to_notifications.sql
-- ========================================
-- Migration: Add muted_until field to notifications table
-- Description: Allow notifications to be muted for 48 hours when marked as read

ALTER TABLE notifications
ADD COLUMN muted_until TIMESTAMP NULL COMMENT 'Notification muted until this timestamp (48 hours from read_at)';

-- Add index for efficient querying
CREATE INDEX idx_muted_until ON notifications(muted_until);


-- ========================================
-- Migration: 064_create_user_communications_table
-- File: 064_create_user_communications_table.sql
-- ========================================
-- Migration: Create user_communications table
-- Description: Store generated email communications sent to users for reference

CREATE TABLE IF NOT EXISTS user_communications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT 'User who received the communication',
    agency_id INT NOT NULL COMMENT 'Agency context for this communication',
    template_type VARCHAR(100) NOT NULL COMMENT 'Type of template used (e.g., "user_welcome")',
    template_id INT NULL COMMENT 'Reference to email_templates table (may be NULL if template was deleted)',
    subject VARCHAR(500) NOT NULL COMMENT 'Rendered email subject',
    body TEXT NOT NULL COMMENT 'Rendered email body (all variables replaced)',
    generated_by_user_id INT NOT NULL COMMENT 'Admin/support user who generated this communication',
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL,
    FOREIGN KEY (generated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_user_id (user_id),
    INDEX idx_agency_id (agency_id),
    INDEX idx_template_type (template_type),
    INDEX idx_generated_at (generated_at),
    INDEX idx_user_agency (user_id, agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ========================================
-- Migration: 065_update_temp_password_expiration
-- File: 065_update_temp_password_expiration.sql
-- ========================================
-- Migration: Update temporary password expiration to 48 hours
-- Description: Change default temporary password expiration from 30 days to 48 hours
-- Note: This migration doesn't modify the database schema, but documents the change
-- The actual expiration logic is updated in User.model.js setTemporaryPassword method
-- Existing temporary passwords with longer expiration will remain until they expire naturally
-- No schema changes needed - expiration is handled in application code
-- This is a no-op migration that only serves as documentation

SELECT 1;


-- ========================================
-- Migration: 066_add_passwordless_token
-- File: 066_add_passwordless_token.sql
-- ========================================
-- Migration: Add passwordless login token fields to users table
-- Description: Add fields for passwordless login tokens that auto-login users

ALTER TABLE users
ADD COLUMN passwordless_token VARCHAR(255) NULL COMMENT 'Token for passwordless login',
ADD COLUMN passwordless_token_expires_at TIMESTAMP NULL COMMENT 'Expiration time for passwordless token (48 hours)';

-- Add indexes for efficient token lookups
CREATE INDEX idx_passwordless_token ON users(passwordless_token);
CREATE INDEX idx_passwordless_token_expires ON users(passwordless_token_expires_at);


-- ========================================
-- Migration: 067_add_checklist_nesting
-- File: 067_add_checklist_nesting.sql
-- ========================================
-- Migration: Add checklist nesting support
-- Description: Add training_focus_id and module_id columns to custom_checklist_items to support nesting under training focuses and modules

ALTER TABLE custom_checklist_items
ADD COLUMN training_focus_id INT NULL AFTER parent_item_id,
ADD COLUMN module_id INT NULL AFTER training_focus_id;

-- Add foreign keys
ALTER TABLE custom_checklist_items
ADD CONSTRAINT fk_checklist_training_focus
  FOREIGN KEY (training_focus_id) REFERENCES training_tracks(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_checklist_module
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX idx_training_focus ON custom_checklist_items(training_focus_id);
CREATE INDEX idx_module ON custom_checklist_items(module_id);


-- ========================================
-- Migration: 068_add_checklist_to_onboarding_packages
-- File: 068_add_checklist_to_onboarding_packages.sql
-- ========================================
-- Migration: Add checklist items to onboarding packages
-- Description: Create junction table to link checklist items directly to onboarding packages

CREATE TABLE IF NOT EXISTS onboarding_package_checklist_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    package_id INT NOT NULL,
    checklist_item_id INT NOT NULL,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES onboarding_packages(id) ON DELETE CASCADE,
    FOREIGN KEY (checklist_item_id) REFERENCES custom_checklist_items(id) ON DELETE CASCADE,
    UNIQUE KEY unique_package_checklist_item (package_id, checklist_item_id),
    INDEX idx_package (package_id),
    INDEX idx_checklist_item (checklist_item_id)
);


-- ========================================
-- Migration: 069_create_branding_templates
-- File: 069_create_branding_templates.sql
-- ========================================
-- Migration: Create branding templates system
-- Description: Add tables for branding templates and scheduling to allow users to save, share, and schedule branding themes

-- Create branding_templates table
CREATE TABLE IF NOT EXISTS branding_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  scope ENUM('platform', 'agency') NOT NULL,
  agency_id INT NULL,
  created_by_user_id INT NOT NULL,
  is_shared BOOLEAN DEFAULT FALSE COMMENT 'Platform templates that can be used by agencies',
  template_data JSON NOT NULL COMMENT 'Selective branding data (colors, fonts, icons, etc.)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_scope_agency (scope, agency_id),
  INDEX idx_shared (is_shared)
);

-- Create branding_template_schedules table
CREATE TABLE IF NOT EXISTS branding_template_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id INT NOT NULL,
  scope ENUM('platform', 'agency') NOT NULL,
  agency_id INT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES branding_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_scope_agency (scope, agency_id),
  INDEX idx_dates (start_date, end_date, is_active)
);


-- ========================================
-- Migration: 070_create_fonts_system
-- File: 070_create_fonts_system.sql
-- ========================================
-- Migration: Create fonts management system
-- Description: Add fonts table and update platform_branding to use font_id references

-- Create fonts table
CREATE TABLE IF NOT EXISTS fonts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  family_name VARCHAR(255) NOT NULL COMMENT 'CSS font-family name',
  file_path VARCHAR(500) NOT NULL COMMENT 'Path to font file (woff2, woff, ttf)',
  file_type ENUM('woff2', 'woff', 'ttf', 'otf') NOT NULL,
  agency_id INT NULL COMMENT 'NULL for platform fonts, agency_id for agency-specific fonts',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_agency (agency_id),
  INDEX idx_active (is_active),
  INDEX idx_family_name (family_name)
);

-- Add font_id columns to platform_branding (keeping old columns for migration)
ALTER TABLE platform_branding
  ADD COLUMN header_font_id INT NULL AFTER header_font,
  ADD COLUMN body_font_id INT NULL AFTER body_font,
  ADD COLUMN numeric_font_id INT NULL AFTER numeric_font,
  ADD COLUMN display_font_id INT NULL AFTER display_font,
  ADD FOREIGN KEY (header_font_id) REFERENCES fonts(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (body_font_id) REFERENCES fonts(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (numeric_font_id) REFERENCES fonts(id) ON DELETE SET NULL,
  ADD FOREIGN KEY (display_font_id) REFERENCES fonts(id) ON DELETE SET NULL;

-- Insert default fonts (Comfortaa and Montserrat)
-- Note: These will need actual font files uploaded, but we create the records
INSERT INTO fonts (name, family_name, file_path, file_type, agency_id, is_active) VALUES
  ('Comfortaa Regular', 'Comfortaa', '/fonts/comfortaa-regular.woff2', 'woff2', NULL, TRUE),
  ('Comfortaa Bold', 'Comfortaa', '/fonts/comfortaa-bold.woff2', 'woff2', NULL, TRUE),
  ('Montserrat Regular', 'Montserrat', '/fonts/montserrat-regular.woff2', 'woff2', NULL, TRUE),
  ('Montserrat Bold', 'Montserrat', '/fonts/montserrat-bold.woff2', 'woff2', NULL, TRUE),
  ('Inter Regular', 'Inter', '/fonts/inter-regular.woff2', 'woff2', NULL, TRUE),
  ('Source Sans 3 Regular', 'Source Sans 3', '/fonts/source-sans-3-regular.woff2', 'woff2', NULL, TRUE),
  ('IBM Plex Mono Regular', 'IBM Plex Mono', '/fonts/ibm-plex-mono-regular.woff2', 'woff2', NULL, TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name);


-- ========================================
-- Migration: 071_add_pending_status
-- File: 071_add_pending_status.sql
-- ========================================
-- Migration: Add pending and ready_for_review status to users
-- Description: Support pre-onboarding offer-to-hire workflow with pending status

-- First, update existing NULL values to 'active' if any exist
UPDATE users SET status = 'active' WHERE status IS NULL;

-- Modify the status ENUM to include 'pending' and 'ready_for_review'
ALTER TABLE users 
MODIFY COLUMN status ENUM('active', 'completed', 'terminated', 'pending', 'ready_for_review') NOT NULL DEFAULT 'active';

-- Add pending completion tracking fields
ALTER TABLE users
ADD COLUMN pending_completed_at TIMESTAMP NULL COMMENT 'Timestamp when pending hiring process was completed' AFTER status_expires_at,
ADD COLUMN pending_auto_complete_at TIMESTAMP NULL COMMENT 'Timestamp when pending will auto-complete (24 hours after last checklist item)' AFTER pending_completed_at,
ADD COLUMN pending_identity_verified BOOLEAN DEFAULT FALSE COMMENT 'Whether last name identity verification has been completed' AFTER pending_auto_complete_at;

-- Add indexes for efficient queries
CREATE INDEX idx_pending_status ON users(status);
CREATE INDEX idx_pending_completed_at ON users(pending_completed_at);
CREATE INDEX idx_pending_auto_complete_at ON users(pending_auto_complete_at);


-- ========================================
-- Migration: 072_add_pending_access_tracking
-- File: 072_add_pending_access_tracking.sql
-- ========================================
-- Migration: Add pending access tracking fields
-- Description: Track access locking and notification status for pending users

ALTER TABLE users
ADD COLUMN pending_access_locked BOOLEAN DEFAULT FALSE COMMENT 'Whether pending user access is locked (after completion)' AFTER pending_identity_verified,
ADD COLUMN pending_completion_notified BOOLEAN DEFAULT FALSE COMMENT 'Whether admins have been notified of pending completion' AFTER pending_access_locked;

-- Add index for efficient queries
CREATE INDEX idx_pending_access_locked ON users(pending_access_locked);


-- ========================================
-- Migration: 073_add_pending_completed_notification_type
-- File: 073_add_pending_completed_notification_type.sql
-- ========================================
-- Migration: Add pending_completed notification type (NO-OP)
-- Description: This migration originally attempted to add 'pending_completed' to the notifications.type ENUM.
-- However, ENUM modifications cause WARN_DATA_TRUNCATED errors in Cloud SQL when legacy values exist.
-- 
-- Instead, notification types are now managed as VARCHAR(50) starting from migration 080,
-- and validation is enforced at the application layer in backend/src/models/Notification.model.js
--
-- This migration is a no-op to maintain migration sequence integrity.
-- The 'pending_completed' type is included in the application-layer validation.

-- No SQL statements - this migration intentionally does nothing
SELECT 1;


-- ========================================
-- Migration: 074_add_user_email_fields
-- File: 074_add_user_email_fields.sql
-- ========================================
-- Migration: Add work email and personal email fields to users
-- Description: Add separate email fields for work (username) and personal (communications)

ALTER TABLE users
ADD COLUMN work_email VARCHAR(255) NULL COMMENT 'Work email used as username for active users' AFTER email,
ADD COLUMN personal_email VARCHAR(255) NULL COMMENT 'Personal email for communications, not used for login' AFTER work_email;

-- Add indexes for efficient lookups
CREATE INDEX idx_work_email ON users(work_email);
CREATE INDEX idx_personal_email ON users(personal_email);


-- ========================================
-- Migration: 075_make_email_nullable
-- File: 075_make_email_nullable.sql
-- ========================================
-- Migration: Make email column nullable for pending users
-- Description: Allow pending users to be created without email addresses. Email will be set when they transition to active status.

-- First, update any existing NULL emails to a placeholder or set them based on work_email if available
-- For users with work_email but NULL email, copy work_email to email
UPDATE users 
SET email = work_email 
WHERE email IS NULL AND work_email IS NOT NULL;

-- For any remaining NULL emails (shouldn't happen in production, but safety check)
-- Set them to a placeholder that won't conflict (using user ID)
UPDATE users 
SET email = CONCAT('user_', id, '@placeholder.local')
WHERE email IS NULL;

-- Drop existing unique constraint/index on email
-- Note: This will fail if index doesn't exist, but the migration script will handle it
ALTER TABLE users DROP INDEX email;

-- Also drop idx_email_unique if it exists (from a previous migration attempt)
ALTER TABLE users DROP INDEX idx_email_unique;

-- Modify the email column to allow NULL values
ALTER TABLE users 
MODIFY COLUMN email VARCHAR(255) NULL;

-- Re-add UNIQUE constraint (MySQL allows multiple NULL values in UNIQUE columns)
-- This ensures email uniqueness for non-NULL values while allowing NULL for pending users
ALTER TABLE users 
ADD UNIQUE INDEX email (email);


-- ========================================
-- Migration: 076_make_password_hash_nullable
-- File: 076_make_password_hash_nullable.sql
-- ========================================
-- Migration: Make password_hash column nullable for pending users
-- Description: Allow pending users to be created without passwords. Pending users use passwordless access only.

-- Modify the password_hash column to allow NULL values
ALTER TABLE users 
MODIFY COLUMN password_hash VARCHAR(255) NULL;


-- ========================================
-- Migration: 077_add_agency_custom_parameters
-- File: 077_add_agency_custom_parameters.sql
-- ========================================
-- Migration: Add custom_parameters field to agencies table
-- Description: Allow agencies to store custom parameters that can be used in email templates

ALTER TABLE agencies
  ADD COLUMN custom_parameters JSON NULL COMMENT 'Custom parameters for email templates (e.g., {"department_name": "HR", "office_location": "New York"})' AFTER theme_settings;

-- Add index for faster lookups (though JSON indexing is limited in MySQL)
-- Note: For complex queries, consider using generated columns


-- ========================================
-- Migration: 078_enhance_user_activity_log
-- File: 078_enhance_user_activity_log.sql
-- ========================================
-- Migration: Enhance user activity log table
-- Description: Add new action types and fields to track module activities, password changes, and durations

-- Add new action types to the enum
ALTER TABLE user_activity_log
MODIFY COLUMN action_type ENUM(
    'login', 
    'logout', 
    'timeout', 
    'page_view', 
    'api_call',
    'password_change',
    'module_start',
    'module_end',
    'module_complete',
    'page_navigation'
) NOT NULL;

-- Add duration_seconds field to track time spent for timed activities
ALTER TABLE user_activity_log
ADD COLUMN duration_seconds INT NULL COMMENT 'Duration in seconds for timed activities (e.g., session duration, module time)';

-- Add module_id field to track module-specific activities
ALTER TABLE user_activity_log
ADD COLUMN module_id INT NULL COMMENT 'Module ID for module-related activities',
ADD FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL,
ADD INDEX idx_module_id (module_id);


-- ========================================
-- Migration: 079_add_user_activity_notification_types
-- File: 079_add_user_activity_notification_types.sql
-- ========================================
-- Migration: Add user activity notification types (NO-OP)
-- Description: This migration originally attempted to add 'first_login_pending', 'first_login', and 
-- 'password_changed' to the notifications.type ENUM. However, ENUM modifications cause 
-- WARN_DATA_TRUNCATED errors in Cloud SQL when legacy values exist.
-- 
-- Instead, notification types are now managed as VARCHAR(50) starting from migration 080,
-- and validation is enforced at the application layer in backend/src/models/Notification.model.js
--
-- This migration is a no-op to maintain migration sequence integrity.
-- The types 'first_login_pending', 'first_login', and 'password_changed' are included in 
-- the application-layer validation.

-- No SQL statements - this migration intentionally does nothing
SELECT 1;


-- ========================================
-- Migration: 081_add_clinical_practice_assistant_role
-- File: 081_add_clinical_practice_assistant_role.sql
-- ========================================
-- Migration: Add Clinical Practice Assistant role
-- Description: Add clinical_practice_assistant role to the users.role enum

-- Add clinical_practice_assistant to role enum
ALTER TABLE users
MODIFY COLUMN role ENUM('super_admin', 'admin', 'support', 'supervisor', 'clinical_practice_assistant', 'staff', 'clinician', 'facilitator', 'intern') 
DEFAULT 'clinician';


-- ========================================
-- Migration: 082_create_supervisor_assignments
-- File: 082_create_supervisor_assignments.sql
-- ========================================
-- Migration: Create supervisor assignments table
-- Description: Create table for assigning users to supervisors within agencies

CREATE TABLE IF NOT EXISTS supervisor_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supervisor_id INT NOT NULL COMMENT 'User ID of the supervisor',
    supervisee_id INT NOT NULL COMMENT 'User ID of the supervisee',
    agency_id INT NOT NULL COMMENT 'Agency where this assignment applies',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INT NULL COMMENT 'User who created this assignment',
    FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (supervisee_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_assignment (supervisor_id, supervisee_id, agency_id),
    INDEX idx_supervisor_id (supervisor_id),
    INDEX idx_supervisee_id (supervisee_id),
    INDEX idx_agency_id (agency_id),
    INDEX idx_supervisor_agency (supervisor_id, agency_id),
    INDEX idx_supervisee_agency (supervisee_id, agency_id)
);


-- ========================================
-- Migration: 083_fix_pending_completed_notification_type
-- File: 083_fix_pending_completed_notification_type.sql
-- ========================================
-- Migration: Fix pending_completed notification type (NO-OP)
-- Description: This migration originally attempted to add 'pending_completed' back to the 
-- notifications.type ENUM. However, ENUM modifications cause WARN_DATA_TRUNCATED errors in 
-- Cloud SQL when legacy values exist.
-- 
-- Instead, notification types are now managed as VARCHAR(50) starting from migration 080,
-- and validation is enforced at the application layer in backend/src/models/Notification.model.js
--
-- This migration is a no-op to maintain migration sequence integrity.
-- The 'pending_completed' type is included in the application-layer validation.

-- No SQL statements - this migration intentionally does nothing
SELECT 1;


-- ========================================
-- Migration: 085_add_supervisor_privileges
-- File: 085_add_supervisor_privileges.sql
-- ========================================
-- Migration: Add supervisor privileges field
-- Description: Add has_supervisor_privileges field to allow admins, superadmins, and CPAs to be assigned as supervisors

ALTER TABLE users
ADD COLUMN has_supervisor_privileges BOOLEAN DEFAULT FALSE COMMENT 'Allows admins, superadmins, and CPAs to be assigned as supervisors while maintaining their primary roles';

-- Add index for efficient queries
CREATE INDEX idx_has_supervisor_privileges ON users(has_supervisor_privileges);


-- ========================================
-- Migration: 086_restructure_phone_numbers
-- File: 086_restructure_phone_numbers.sql
-- ========================================
-- Migration: Restructure phone numbers
-- Description: Add separate fields for personal_phone, work_phone, and work_phone_extension
-- Migrate existing phone_number data to personal_phone

-- Add new phone number columns
ALTER TABLE users
ADD COLUMN personal_phone VARCHAR(20) NULL COMMENT 'Personal phone number' AFTER phone_number,
ADD COLUMN work_phone VARCHAR(20) NULL COMMENT 'Work phone number' AFTER personal_phone,
ADD COLUMN work_phone_extension VARCHAR(10) NULL COMMENT 'Work phone extension' AFTER work_phone;

-- Migrate existing phone_number data to personal_phone
UPDATE users
SET personal_phone = phone_number
WHERE phone_number IS NOT NULL AND personal_phone IS NULL;

-- Add indexes for efficient queries
CREATE INDEX idx_personal_phone ON users(personal_phone);
CREATE INDEX idx_work_phone ON users(work_phone);


-- ========================================
-- Migration: 088_clear_user_activity_log
-- File: 088_clear_user_activity_log.sql
-- ========================================
-- Migration: Clear user activity log table
-- Description: Truncate the user_activity_log table to remove all existing broken data
-- This is part of rebuilding the activity log system with a centralized service

TRUNCATE TABLE user_activity_log;


-- ========================================
-- Migration: 089_remove_email_template_unique_constraints
-- File: 089_remove_email_template_unique_constraints.sql
-- ========================================
-- Migration: Remove unique constraints from email_templates table
-- Description: Allow multiple templates of the same type for the same agency/platform
-- This enables users to create multiple versions of welcome emails and other templates

-- Drop the unique constraints that prevent multiple templates of the same type
-- Note: Using separate statements for better MySQL compatibility
ALTER TABLE email_templates DROP INDEX unique_agency_template;
ALTER TABLE email_templates DROP INDEX unique_platform_template;

-- Note: The indexes on type, agency_id, and platform_branding_id remain for query performance


-- ========================================
-- Migration: 090_seed_default_email_templates
-- File: 090_seed_default_email_templates.sql
-- ========================================
-- Migration: Seed default email templates as platform templates
-- File: 090_seed_default_email_templates.sql
-- Description:
-- Inserts default lifecycle email templates for the platform.
-- Platform templates are identified by: agency_id IS NULL AND platform_branding_id IS NOT NULL.

SET @platform_branding_id = (SELECT id FROM platform_branding ORDER BY id DESC LIMIT 1);

-- Safety check (optional): if platform branding isn't present, fail fast by inserting nothing.
-- (MySQL doesn't support THROW easily; so we rely on @platform_branding_id being non-null.)

/*
Idempotency strategy (since unique constraints were removed in migration 088):
- Delete existing platform templates by type (only for the types we are inserting below),
  then insert fresh rows.
*/

DELETE FROM email_templates
WHERE agency_id IS NULL
  AND platform_branding_id = @platform_branding_id
  AND type IN (
    'pending_welcome',
    'onboarding_portal_welcome',
    'password_expired_pre_activation',
    'admin_initiated_password_reset',

    'pre_hire_admin_review_access',
    'pre_hire_role_ack_request',
    'pre_hire_authorization_request',
    'pre_hire_hold_status',
    'pre_hire_not_moving_forward',
    'pre_hire_review_waiting',

    'conditional_offer_warm',
    'conditional_offer_formal',

    'onboarding_opening_soon',
    'onboarding_incomplete_nudge',
    'onboarding_complete_confirmation',

    'internal_pre_hire_access_issued',
    'internal_pre_hire_materials_submitted',
    'internal_background_check_initiated',
    'internal_pre_hire_review_complete'
  );

INSERT INTO email_templates
  (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id)
VALUES

-- =========================================================
-- PENDING SETUP (NEW USER CREATION - PENDING_SETUP STATUS)
-- =========================================================
(
  'Pending Welcome: Initial Account Setup',
  'pending_welcome',
  'Welcome to {{AGENCY_NAME}} — Complete Your Account Setup',
  'Hello {{FIRST_NAME}},\n\nWelcome to {{AGENCY_NAME}}! We''re excited to have you join our team.\n\nTo get started, please complete your account setup by creating your password using the secure link below:\n\n{{PORTAL_LOGIN_LINK}}\n\nThis link will allow you to:\n- Set your password\n- Access your pre-hire portal\n- Begin completing required pre-hire materials\n\n**Important:** This link will expire in 7 days. Please complete your account setup as soon as possible.\n\nIf you have any questions or need assistance, please contact {{TERMINOLOGY_SETTINGS}} at {{PEOPLE_OPS_EMAIL}}.\n\nWe look forward to working with you!\n\nBest regards,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),

-- =========================================================
-- ONBOARDING (WELCOME + DEADLINES + CREDENTIALS)
-- =========================================================
(
  'Onboarding Welcome: Portal Access + Deadlines',
  'onboarding_portal_welcome',
  'Welcome to {{AGENCY_NAME}} — Your Onboarding Portal Access',
  'Hello {{FIRST_NAME}},\n\nWelcome to {{AGENCY_NAME}}! We’re glad to have you joining our team.\n\nThis email provides access to your **Onboarding & Training Portal**, which will guide you through the required steps for onboarding, training, and initial documentation.\n\n### Portal Access\n\nYou may access the portal using **either** of the options below:\n\n**Option 1: Secure Login Link**\n{{PORTAL_LOGIN_LINK}}\n\n**Option 2: Manual Login**\n- **Portal URL:** {{PORTAL_URL}}\n- **Username:** {{USERNAME}}\n- **Temporary Password:** {{TEMP_PASSWORD}}\n\n> For security purposes, you will be prompted to create a new password upon first login.\n\n### What This Portal Includes\n\nThe onboarding portal is your central location for onboarding-related items only. You can expect to find:\n\n- **Your onboarding checklist**\n  Assigned tasks, required forms, and completion tracking\n- **Training materials**\n  Training focuses, modules, videos, and required acknowledgments\n- **Required documents**\n  Policies, guides, and materials you are expected to review\n- **Status visibility**\n  Clear indicators of what is complete, pending, or upcoming\n\nThis portal is used **specifically for onboarding and training** and is separate from other internal systems you may use later.\n\n### Important Deadlines\n\nPlease note the following required completion deadlines:\n\n- **Onboarding documents due by:** {{DOCUMENT_DEADLINE}}\n- **Required trainings due by:** {{TRAINING_DEADLINE}}\n\nSome items must be completed **before** you can begin certain work activities. Missing deadlines may delay your start or access.\n\n### Questions or Support\n\nIf you have any questions, run into access issues, or are unsure how to complete a task, please reach out to:\n\n**{{TERMINOLOGY_SETTINGS}}**\n📧 {{PEOPLE_OPS_EMAIL}}\n\nWe ask that onboarding-related questions go through {{TERMINOLOGY_SETTINGS}} rather than individual staff, as this helps us respond more efficiently and consistently.\n\nWe’re looking forward to working with you and supporting your onboarding process.\n\nWelcome to {{AGENCY_NAME}},\n**{{SENDER_NAME}}**\n**{{TERMINOLOGY_SETTINGS}}**\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),

-- =========================================================
-- CREDENTIAL / ACCESS SUPPORT
-- =========================================================
(
  'Password Expired: Pre-Login Reissue',
  'password_expired_pre_activation',
  'New Portal Login Credentials',
  'Hello {{FIRST_NAME}},\n\nYour previous temporary portal password has expired, so we’ve issued new access details.\n\n**Primary option (recommended):**\nClick here to access the portal and set your password:\n{{RESET_TOKEN_LINK}}\n\n**Alternate option:**\n- **Portal URL:** {{PORTAL_URL}}\n- **Username:** {{USERNAME}}\n- **Temporary Password:** {{TEMP_PASSWORD}}\n\nPlease set a new password once logged in.\n\nIf you have questions or need assistance, contact {{TERMINOLOGY_SETTINGS}} at {{PEOPLE_OPS_EMAIL}}.\n\nBest,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Admin-Initiated Password Reset',
  'admin_initiated_password_reset',
  'Updated Portal Access',
  'Hello {{FIRST_NAME}},\n\nPer your request, we’ve reset your onboarding portal access.\n\n**Primary option (recommended):**\nClick here to access and reset your password:\n{{RESET_TOKEN_LINK}}\n\n**Alternate option:**\n- **Portal URL:** {{PORTAL_URL}}\n- **Username:** {{USERNAME}}\n- **Temporary Password:** {{TEMP_PASSWORD}}\n\nYou’ll be prompted to set a new password after logging in.\n\nIf you need help, feel free to reply to this message.\n\n—\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),

-- =========================================================
-- PRE-HIRE (NO OFFER YET)
-- =========================================================
(
  'Pre-Hire: Admin Review Access (No Offer)',
  'pre_hire_admin_review_access',
  'Next Steps — Pre-Hire Review with {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nThank you for your continued interest in {{AGENCY_NAME}}.\n\nAs part of our pre-hire review process, we are requesting completion of a brief set of administrative items. These materials are used solely to support internal review and do not constitute an offer of employment.\n\nPlease access your **Pre-Hire Portal** using the secure link below:\n\n{{PORTAL_LOGIN_LINK}}\n\nWithin the portal, you will be asked to:\n- Acknowledge the job description\n- Complete required releases and reference information\n- Submit information necessary for a background check\n\nOnce submitted, our team will review the materials and follow up with you as appropriate.\n\nIf you have questions or encounter issues accessing the portal, please contact {{TERMINOLOGY_SETTINGS}} at {{PEOPLE_OPS_EMAIL}}.\n\nBest regards,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Pre-Hire: Job Description Acknowledgement Only',
  'pre_hire_role_ack_request',
  'Role Acknowledgement Request — {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nAs part of our review process, we ask all candidates to formally acknowledge the role description before moving forward.\n\nPlease use the secure link below to review and acknowledge the job description associated with this position:\n\n{{PORTAL_LOGIN_LINK}}\n\nThis step helps ensure role clarity and alignment before any further consideration. Completion of this item does not represent an offer of employment.\n\nIf you have questions, feel free to reach out to {{TERMINOLOGY_SETTINGS}}.\n\nThank you,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Pre-Hire: Authorization Request (Background + References)',
  'pre_hire_authorization_request',
  'Authorization Request — Background Check & References',
  'Hello {{FIRST_NAME}},\n\nAs part of our internal screening process, we are requesting authorization to conduct a background check and contact references.\n\nPlease access the secure portal below to complete the required authorization forms:\n\n{{PORTAL_LOGIN_LINK}}\n\nThese materials are used solely for evaluation purposes and do not indicate an offer or guarantee of employment. We will notify you if additional information is needed.\n\nIf you experience any issues or have questions, contact {{TERMINOLOGY_SETTINGS}} at {{PEOPLE_OPS_EMAIL}}.\n\nSincerely,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Pre-Hire: Hold Status (Candidate-Facing)',
  'pre_hire_hold_status',
  'Update on Your Status with {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nWe wanted to provide a brief update regarding your status with {{AGENCY_NAME}}.\n\nAt this time, your application has been placed on hold while we complete internal review and coordination. This does not require any action from you right now.\n\nWe appreciate your patience and will reach out if additional information is needed or once we are ready to proceed.\n\nThank you for your interest in {{AGENCY_NAME}}.\n\nKind regards,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Pre-Hire: Not Moving Forward (Candidate-Facing)',
  'pre_hire_not_moving_forward',
  'Update Regarding Your Application with {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nThank you for your time and for completing the requested pre-hire materials.\n\nAt this time, we will not be moving forward to the next stage of the process. This decision is based on internal considerations and does not reflect a single factor or submission.\n\nWe appreciate your interest in {{AGENCY_NAME}} and wish you the best in your future endeavors.\n\nKind regards,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Pre-Hire: Waiting for Review (PREHIRE_REVIEW Status)',
  'pre_hire_review_waiting',
  'Pre-Hire Materials Submitted — Awaiting Review',
  'Hello {{FIRST_NAME}},\n\nThank you for completing all required pre-hire materials with {{AGENCY_NAME}}.\n\nYour submission has been received and is now being reviewed by our team. This review process typically takes a few business days.\n\n**What happens next:**\n- Our team will review your submitted materials\n- We will contact your references\n- A background check will be initiated if applicable\n- You will be notified once the review is complete\n\n**Your access:**\nYour portal access has been temporarily locked during this review period. You will receive an email notification once your account is activated and you can proceed to the next steps.\n\nIf you have any questions or need to provide additional information, please contact {{TERMINOLOGY_SETTINGS}} at {{PEOPLE_OPS_EMAIL}}.\n\nThank you for your patience during this process.\n\nBest regards,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),

-- =========================================================
-- CONDITIONAL OFFER (OPTIONAL PATH)
-- =========================================================
(
  'Conditional Offer (Warm Variant)',
  'conditional_offer_warm',
  'Next Steps with {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nWe truly enjoyed getting to know you throughout the interview process and appreciate the time and thought you brought to our conversations. Based on our discussions, we believe you would be a great addition to the {{AGENCY_NAME}} team.\n\nTo move forward, we’ve provided access to your **Pre-Hire Portal** using the secure link below:\n\n{{PORTAL_LOGIN_LINK}}\n\nWithin the portal, you’ll find your **Conditional Employment Agreement** and a brief **pre-hire checklist**. This offer is contingent upon the successful completion of required references and a background check.\n\nOnce you’ve completed the checklist and submitted it for review:\n- Our team will contact your references\n- We will initiate the background check\n- We’ll follow up with you if anything further is needed\n\nAfter this review is complete, you will be provided with a **final, fully signed copy of your employment agreement**, which will be available through our {{TERMINOLOGY_SETTINGS}} website and your workspace.\n\nWe’re excited about the possibility of working together and look forward to the next steps.\n\nWarm regards,\n{{SENDER_NAME}}\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Conditional Offer (Formal Variant)',
  'conditional_offer_formal',
  'Conditional Employment Offer – {{AGENCY_NAME}}',
  'Hello {{FIRST_NAME}},\n\nThank you again for your interest in {{AGENCY_NAME}} and for participating in our interview process. We appreciate the opportunity to learn more about your background and experience.\n\nWe are pleased to extend a **conditional offer of employment**, pending completion of required references and a background check.\n\nPlease access your **Pre-Hire Portal** using the secure link below to review your Conditional Employment Agreement and complete the pre-hire requirements:\n\n{{PORTAL_LOGIN_LINK}}\n\nOnce your pre-hire checklist is submitted:\n- References will be contacted\n- A background check will be initiated\n- You will be notified of any additional steps\n\nUpon successful completion, a final signed employment agreement will be issued and made available through your workspace and the {{TERMINOLOGY_SETTINGS}} site.\n\nWe appreciate your time and look forward to moving ahead.\n\nSincerely,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),

-- =========================================================
-- ONBOARDING (LIGHTWEIGHT LIFECYCLE EMAILS)
-- =========================================================
(
  'Onboarding Heads-Up: Opening Soon',
  'onboarding_opening_soon',
  'Your Onboarding Will Begin Soon',
  'Hello {{FIRST_NAME}},\n\nWe wanted to give you a quick heads-up that your onboarding access will be opening shortly.\n\nOnce activated, you’ll receive an email with:\n- Your onboarding portal access\n- Required training and documents\n- Key deadlines and next steps\n\nWe recommend keeping an eye on your inbox so you can get started promptly.\n\nLooking forward to working with you,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Onboarding Reminder: Incomplete Items',
  'onboarding_incomplete_nudge',
  'Quick Check-In',
  'Hello {{FIRST_NAME}},\n\nWe’re checking in regarding your {{AGENCY_NAME}} portal access. It looks like there are still a few items waiting for completion.\n\nYou can return to your portal anytime using the link below:\n{{PORTAL_LOGIN_LINK}}\n\nIf you have questions or ran into any issues, {{TERMINOLOGY_SETTINGS}} is happy to help.\n\nBest,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Onboarding Completion Confirmation',
  'onboarding_complete_confirmation',
  'Onboarding Complete — Welcome Aboard',
  'Hello {{FIRST_NAME}},\n\nCongratulations — you’ve completed your onboarding requirements with {{AGENCY_NAME}}.\n\nYour account is now fully active, and you’ll have continued access to relevant training materials and documents through your workspace and the {{TERMINOLOGY_SETTINGS}} site.\n\nWe’re glad to have you on board and look forward to working together.\n\nWelcome again,\n{{TERMINOLOGY_SETTINGS}}\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),

-- =========================================================
-- INTERNAL-ONLY ADMIN NOTIFICATIONS
-- =========================================================
(
  'Internal: Pre-Hire Access Issued',
  'internal_pre_hire_access_issued',
  'Pre-Hire Portal Access Issued — {{FIRST_NAME}}',
  'Pre-hire portal access has been issued for the following individual:\n\n- Name: {{FIRST_NAME}} {{LAST_NAME}}\n- Agency: {{AGENCY_NAME}}\n- Status: Pre-Hire (Administrative Review)\n- Items Requested: Job description acknowledgement, references, releases, background check authorization\n\nThe candidate has been provided a secure token link and may begin completing pre-hire materials.\n\nNo offer of employment has been extended at this stage.\n\n—\nSystem Notification\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Internal: Pre-Hire Materials Submitted',
  'internal_pre_hire_materials_submitted',
  'Pre-Hire Materials Submitted — {{FIRST_NAME}}',
  'Pre-hire materials have been submitted and are ready for review.\n\n- Name: {{FIRST_NAME}} {{LAST_NAME}}\n- Agency: {{AGENCY_NAME}}\n- Submitted Items: {{SUBMITTED_ITEMS}}\n- Next Steps: Reference checks and background check initiation\n\nPlease review and proceed with the appropriate next steps. Follow-up with the candidate only if additional information is required.\n\n—\nSystem Notification\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Internal: Background Check Initiated',
  'internal_background_check_initiated',
  'Background Check Initiated — {{FIRST_NAME}}',
  'A background check has been initiated for the following individual:\n\n- Name: {{FIRST_NAME}} {{LAST_NAME}}\n- Agency: {{AGENCY_NAME}}\n- Initiated By: {{INITIATED_BY}}\n- Date: {{DATE_INITIATED}}\n\nThis notification is for tracking purposes only. No action is required unless follow-up is needed.\n\n—\nSystem Notification\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
),
(
  'Internal: Pre-Hire Review Complete',
  'internal_pre_hire_review_complete',
  'Pre-Hire Review Complete — {{FIRST_NAME}}',
  'The pre-hire review process has been completed for the following individual:\n\n- Name: {{FIRST_NAME}} {{LAST_NAME}}\n- Agency: {{AGENCY_NAME}}\n- Outcome: {{REVIEW_OUTCOME}}\n- Notes: {{INTERNAL_NOTES}}\n\nPlease proceed according to the determined next step (offer, onboarding, hold, or close).\n\n—\nSystem Notification\n{{AGENCY_NAME}}\n',
  NULL,
  @platform_branding_id,
  NULL
);

-- End migration


-- ========================================
-- Migration: 091_add_username_field
-- File: 091_add_username_field.sql
-- ========================================
-- Migration: Add username field to users table
-- Description: Add separate username field that can be updated independently from email
-- Username starts as personal_email, can be changed to corporate email by admin

ALTER TABLE users
ADD COLUMN username VARCHAR(255) NULL COMMENT 'Username for login, initially set to personal_email, can be changed to corporate email' AFTER personal_email;

-- Set initial username value to personal_email for existing users
UPDATE users
SET username = personal_email
WHERE personal_email IS NOT NULL AND username IS NULL;

-- For users without personal_email, set username to email
UPDATE users
SET username = email
WHERE username IS NULL AND email IS NOT NULL;

-- Add unique index on username (allows NULL values)
CREATE UNIQUE INDEX idx_username ON users(username);

-- Add index for efficient lookups
CREATE INDEX idx_username_lookup ON users(username);


-- ========================================
-- Migration: 092_add_platform_org_fields
-- File: 092_add_platform_org_fields.sql
-- ========================================
-- Migration: Add platform organization fields to platform_branding table
-- Description: Add organization_name and organization_logo_icon_id for platform branding on login pages

ALTER TABLE platform_branding
  ADD COLUMN organization_name VARCHAR(255) NULL COMMENT 'Platform organization name (e.g., PlotTwistCo)',
  ADD COLUMN organization_logo_icon_id INT NULL COMMENT 'Platform organization logo icon',
  ADD FOREIGN KEY (organization_logo_icon_id) REFERENCES icons(id) ON DELETE SET NULL;


-- ========================================
-- Migration: 093_add_organization_logo_url
-- File: 093_add_organization_logo_url.sql
-- ========================================
-- Migration: Add organization_logo_url column to platform_branding table
-- Description: Add organization_logo_url for platform branding logo (separate from icon library)

ALTER TABLE platform_branding
  ADD COLUMN organization_logo_url VARCHAR(500) NULL COMMENT 'Platform organization logo URL (full URL to logo image)';


-- ========================================
-- Migration: 094_create_migrations_log
-- File: 094_create_migrations_log.sql
-- ========================================
-- Migration: Create migrations_log table for tracking executed migrations
-- Description: This table tracks which migrations have been run and when

CREATE TABLE IF NOT EXISTS migrations_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL UNIQUE,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  execution_time_ms INT,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  INDEX idx_migration_name (migration_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ========================================
-- Migration: 095_refactor_user_status_lifecycle
-- File: 095_refactor_user_status_lifecycle.sql
-- ========================================
-- Migration: Refactor user status lifecycle system
-- Description: Update status ENUM to new lifecycle values and add termination_date field

-- Step 1: Add termination_date field if it doesn't exist
-- Copy from terminated_at if available
-- Note: Migration runner will ignore "already exists" errors
ALTER TABLE users
ADD COLUMN termination_date TIMESTAMP NULL COMMENT 'Date when user was terminated' AFTER terminated_at;

-- Populate termination_date from terminated_at for existing terminated users
UPDATE users 
SET termination_date = terminated_at 
WHERE terminated_at IS NOT NULL AND termination_date IS NULL;

-- Add index on termination_date
-- Note: Migration runner will ignore "already exists" errors
CREATE INDEX idx_termination_date ON users(termination_date);

-- Step 2: Modify status ENUM to new values
-- Note: MySQL requires dropping and recreating the column to change ENUM values
-- We'll use a temporary column approach for safety

-- Add temporary column with new ENUM
ALTER TABLE users
ADD COLUMN status_new ENUM(
  'PENDING_SETUP',
  'PREHIRE_OPEN',
  'PREHIRE_REVIEW',
  'ONBOARDING',
  'ACTIVE_EMPLOYEE',
  'TERMINATED_PENDING',
  'ARCHIVED'
) NOT NULL DEFAULT 'PENDING_SETUP' AFTER status;

-- Step 3: Map existing statuses to new values in the temporary column
-- Map pending to PREHIRE_OPEN
UPDATE users SET status_new = 'PREHIRE_OPEN' WHERE status = 'pending';

-- Map ready_for_review to PREHIRE_REVIEW
UPDATE users SET status_new = 'PREHIRE_REVIEW' WHERE status = 'ready_for_review';

-- Map active to ACTIVE_EMPLOYEE
UPDATE users SET status_new = 'ACTIVE_EMPLOYEE' WHERE status = 'active';

-- Map completed to ACTIVE_EMPLOYEE
UPDATE users SET status_new = 'ACTIVE_EMPLOYEE' WHERE status = 'completed';

-- Map terminated to TERMINATED_PENDING (if within 7 days) or ARCHIVED
UPDATE users 
SET status_new = CASE 
  WHEN terminated_at IS NOT NULL AND terminated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 'TERMINATED_PENDING'
  WHEN terminated_at IS NOT NULL AND terminated_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 'ARCHIVED'
  ELSE 'TERMINATED_PENDING'
END
WHERE status = 'terminated';

-- Ensure all admin/superadmin/support users are set to ACTIVE_EMPLOYEE
-- This ensures they can still log in after the migration
UPDATE users 
SET status_new = 'ACTIVE_EMPLOYEE'
WHERE role IN ('super_admin', 'admin', 'support')
  AND status_new != 'ARCHIVED' AND status_new != 'TERMINATED_PENDING';

-- Step 4: Replace old status column with new one
-- Drop old status column
ALTER TABLE users DROP COLUMN status;

-- Rename new column to status
ALTER TABLE users CHANGE COLUMN status_new status ENUM(
  'PENDING_SETUP',
  'PREHIRE_OPEN',
  'PREHIRE_REVIEW',
  'ONBOARDING',
  'ACTIVE_EMPLOYEE',
  'TERMINATED_PENDING',
  'ARCHIVED'
) NOT NULL DEFAULT 'PENDING_SETUP';

-- Recreate index on status
CREATE INDEX idx_user_status ON users(status);


-- ========================================
-- Migration: 096_add_package_type
-- File: 096_add_package_type.sql
-- ========================================
-- Migration: Add package_type field to onboarding_packages
-- Description: Add package_type ENUM to categorize packages and trigger status changes

-- Add package_type column to onboarding_packages table
ALTER TABLE onboarding_packages
ADD COLUMN package_type ENUM('pre_hire', 'onboarding', 'training', 'other') NOT NULL DEFAULT 'onboarding' COMMENT 'Type of package: pre_hire, onboarding, training, or other';

-- Add index on package_type for efficient filtering
CREATE INDEX idx_package_type ON onboarding_packages(package_type);

-- Set default package_type for existing packages
-- Most existing packages are likely onboarding packages
UPDATE onboarding_packages 
SET package_type = 'onboarding' 
WHERE package_type IS NULL OR package_type = '';


