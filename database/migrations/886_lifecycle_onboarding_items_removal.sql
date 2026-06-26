-- Migration 886: Remove unused onboarding lifecycle checklist items
-- Google Drive, Slack/Teams, Calendar Setup, MFA, Company Computer, Company Vehicle
-- are no longer tracked on the employee lifecycle tab.

DELETE FROM lifecycle_checklist_definitions
WHERE agency_id IS NULL
  AND item_key IN (
    'google_drive_access',
    'slack_teams_access',
    'calendar_setup',
    'mfa_enabled',
    'company_computer_issued',
    'company_vehicle_assigned'
  );

DELETE FROM user_lifecycle_scoped_items
WHERE item_key IN (
  'google_drive_access',
  'slack_teams_access',
  'calendar_setup',
  'mfa_enabled',
  'company_computer_issued',
  'company_vehicle_assigned'
);

DELETE FROM user_lifecycle_checklist_items
WHERE definition_id NOT IN (SELECT id FROM lifecycle_checklist_definitions);
