-- Migration: Add assistant_admin role for Budget Management
-- Description: assistant_admin sits between admin and staff, with customizable permissions per department.

ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'admin',
    'assistant_admin',
    'supervisor',
    'facilitator',
    'intern',
    'super_admin',
    'support',
    'staff',
    'provider',
    'school_staff',
    'client_guardian',
    'clinical_practice_assistant',
    'provider_plus',
    'kiosk'
  )
  NULL
  DEFAULT 'provider';

ALTER TABLE user_agencies
  ADD COLUMN assistant_admin_permissions_json JSON NULL AFTER has_department_access;
