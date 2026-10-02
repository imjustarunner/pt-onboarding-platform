-- Extend 1524 recovery to NLU and PlotTwistCo.
-- Source: onboarding_stage_backup_20260127_195411.sql.
-- Match historical assets by file_path, and fill ONLY empty assignments.
-- Preserve existing choices, including newer PlotTwistCo marks and its current palette.

-- nlu: icon_id (NLU Main)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1768661056042-943843204.png') recovered ON recovered.id IS NOT NULL
SET a.icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.icon_id IS NULL;

-- nlu: manage_agencies_icon_id (Tutordevelopment)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168529879-709682560.png') recovered ON recovered.id IS NOT NULL
SET a.manage_agencies_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.manage_agencies_icon_id IS NULL;

-- nlu: manage_modules_icon_id (ManageModulesNLU)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168685145-983403051.png') recovered ON recovered.id IS NOT NULL
SET a.manage_modules_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.manage_modules_icon_id IS NULL;

-- nlu: manage_documents_icon_id (DocumentManagement)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168525894-562203483.png') recovered ON recovered.id IS NOT NULL
SET a.manage_documents_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.manage_documents_icon_id IS NULL;

-- nlu: manage_users_icon_id (UserManagement)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168525229-344208131.png') recovered ON recovered.id IS NOT NULL
SET a.manage_users_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.manage_users_icon_id IS NULL;

-- nlu: platform_settings_icon_id (SettingsNLU)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168684458-466294590.png') recovered ON recovered.id IS NOT NULL
SET a.platform_settings_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.platform_settings_icon_id IS NULL;

-- nlu: view_all_progress_icon_id (ViewProgress)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168524052-222632157.png') recovered ON recovered.id IS NOT NULL
SET a.view_all_progress_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.view_all_progress_icon_id IS NULL;

-- nlu: progress_dashboard_icon_id (ViewProgress)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168524052-222632157.png') recovered ON recovered.id IS NOT NULL
SET a.progress_dashboard_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.progress_dashboard_icon_id IS NULL;

-- nlu: settings_icon_id (SettingsNLU)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168684458-466294590.png') recovered ON recovered.id IS NOT NULL
SET a.settings_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.settings_icon_id IS NULL;

-- nlu: my_dashboard_checklist_icon_id (ChecklistNLU)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168669641-970496115.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_checklist_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.my_dashboard_checklist_icon_id IS NULL;

-- nlu: my_dashboard_training_icon_id (Learning Differences)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168537052-341787826.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_training_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.my_dashboard_training_icon_id IS NULL;

-- nlu: my_dashboard_documents_icon_id (Docs3)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168481690-102873026.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_documents_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.my_dashboard_documents_icon_id IS NULL;

-- nlu: my_dashboard_my_account_icon_id (Boundaries)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168519537-187544338.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_my_account_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.my_dashboard_my_account_icon_id IS NULL;

-- nlu: my_dashboard_on_demand_training_icon_id (CompleteTech)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168505534-291309649.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_on_demand_training_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.my_dashboard_on_demand_training_icon_id IS NULL;

-- nlu: my_dashboard_payroll_icon_id (MoneyDocs)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168477422-796282251.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_payroll_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.my_dashboard_payroll_icon_id IS NULL;

-- nlu: my_dashboard_submit_icon_id (hittarget)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168554240-642217768.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_submit_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.my_dashboard_submit_icon_id IS NULL;

-- nlu: manage_clients_icon_id (PeopleGotit)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168487852-534657031.png') recovered ON recovered.id IS NOT NULL
SET a.manage_clients_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.manage_clients_icon_id IS NULL;

-- nlu: dashboard_notifications_icon_id (GroupFacilitation)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168520867-986968147.png') recovered ON recovered.id IS NOT NULL
SET a.dashboard_notifications_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.dashboard_notifications_icon_id IS NULL;

-- nlu: dashboard_communications_icon_id (carepeople)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168553092-393063967.png') recovered ON recovered.id IS NOT NULL
SET a.dashboard_communications_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.dashboard_communications_icon_id IS NULL;

-- nlu: dashboard_chats_icon_id (CommunicationNLU)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168692902-822440878.png') recovered ON recovered.id IS NOT NULL
SET a.dashboard_chats_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.dashboard_chats_icon_id IS NULL;

-- nlu: dashboard_payroll_icon_id (MoneyDocs)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168477422-796282251.png') recovered ON recovered.id IS NOT NULL
SET a.dashboard_payroll_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.dashboard_payroll_icon_id IS NULL;

-- nlu: dashboard_billing_icon_id (dataNLU)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168691074-813024448.png') recovered ON recovered.id IS NOT NULL
SET a.dashboard_billing_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.dashboard_billing_icon_id IS NULL;

-- nlu: my_dashboard_my_schedule_icon_id (ScheduleNLU)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769168692255-245648996.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_my_schedule_icon_id = recovered.id
WHERE a.slug = 'nlu' AND a.my_dashboard_my_schedule_icon_id IS NULL;

-- plottwistco: icon_id (MainLogo7)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768233889438-146842703.png') recovered ON recovered.id IS NOT NULL
SET a.icon_id = recovered.id
WHERE a.slug = 'plottwistco' AND a.icon_id IS NULL;

-- plottwistco: manage_modules_icon_id (FileManagement)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768233881433-596090406.png') recovered ON recovered.id IS NOT NULL
SET a.manage_modules_icon_id = recovered.id
WHERE a.slug = 'plottwistco' AND a.manage_modules_icon_id IS NULL;

-- plottwistco: manage_documents_icon_id (Checklist)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768233872472-884270353.png') recovered ON recovered.id IS NOT NULL
SET a.manage_documents_icon_id = recovered.id
WHERE a.slug = 'plottwistco' AND a.manage_documents_icon_id IS NULL;

-- plottwistco: manage_users_icon_id (OperationalDivision)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768233894440-721999693.png') recovered ON recovered.id IS NOT NULL
SET a.manage_users_icon_id = recovered.id
WHERE a.slug = 'plottwistco' AND a.manage_users_icon_id IS NULL;

-- plottwistco: progress_dashboard_icon_id (Progress2)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768233900228-524072610.png') recovered ON recovered.id IS NOT NULL
SET a.progress_dashboard_icon_id = recovered.id
WHERE a.slug = 'plottwistco' AND a.progress_dashboard_icon_id IS NULL;

-- plottwistco: settings_icon_id (SystemSettings)
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768233902901-438312113.png') recovered ON recovered.id IS NOT NULL
SET a.settings_icon_id = recovered.id
WHERE a.slug = 'plottwistco' AND a.settings_icon_id IS NULL;

-- NLU has the same known replacement palette as ITSCO. Restore only this exact triple.
UPDATE agencies
SET color_palette = JSON_SET(COALESCE(color_palette, JSON_OBJECT()),
  '$.primary', '#6FCFBE', '$.secondary', '#1F2A44', '$.accent', '#9FB7A5')
WHERE slug = 'nlu'
  AND UPPER(JSON_UNQUOTE(JSON_EXTRACT(color_palette, '$.primary'))) = '#0F172A'
  AND UPPER(JSON_UNQUOTE(JSON_EXTRACT(color_palette, '$.secondary'))) = '#1E40AF'
  AND UPPER(JSON_UNQUOTE(JSON_EXTRACT(color_palette, '$.accent'))) = '#F97316';

-- PlatformBranding.get() reads the highest ID, not a merge of historical rows.
-- Recover its missing UI icons from the newest valid historical assignment.
-- LIMIT and aggregate derived tables are deliberately materialized by MySQL,
-- allowing an UPDATE to read historical rows from the same table (no error 1093).
-- Preserve platform colors, logos, and load-screen branding.

-- Platform history: all_agencies_notifications_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.all_agencies_notifications_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.all_agencies_notifications_icon_id
      WHERE prior.all_agencies_notifications_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.all_agencies_notifications_icon_id = previous.icon_id
WHERE active.all_agencies_notifications_icon_id IS NULL;

-- Platform history: archive_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.archive_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.archive_icon_id
      WHERE prior.archive_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.archive_icon_id = previous.icon_id
WHERE active.archive_icon_id IS NULL;

-- Platform history: assets_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.assets_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.assets_icon_id
      WHERE prior.assets_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.assets_icon_id = previous.icon_id
WHERE active.assets_icon_id IS NULL;

-- Platform history: audit_center_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.audit_center_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.audit_center_icon_id
      WHERE prior.audit_center_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.audit_center_icon_id = previous.icon_id
WHERE active.audit_center_icon_id IS NULL;

-- Platform history: beta_feedback_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.beta_feedback_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.beta_feedback_icon_id
      WHERE prior.beta_feedback_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.beta_feedback_icon_id = previous.icon_id
WHERE active.beta_feedback_icon_id IS NULL;

-- Platform history: billing_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.billing_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.billing_icon_id
      WHERE prior.billing_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.billing_icon_id = previous.icon_id
WHERE active.billing_icon_id IS NULL;

-- Platform history: branding_templates_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.branding_templates_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.branding_templates_icon_id
      WHERE prior.branding_templates_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.branding_templates_icon_id = previous.icon_id
WHERE active.branding_templates_icon_id IS NULL;

-- Platform history: chat_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.chat_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.chat_icon_id
      WHERE prior.chat_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.chat_icon_id = previous.icon_id
WHERE active.chat_icon_id IS NULL;

-- Platform history: checklist_items_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.checklist_items_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.checklist_items_icon_id
      WHERE prior.checklist_items_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.checklist_items_icon_id = previous.icon_id
WHERE active.checklist_items_icon_id IS NULL;

-- Platform history: communications_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.communications_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.communications_icon_id
      WHERE prior.communications_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.communications_icon_id = previous.icon_id
WHERE active.communications_icon_id IS NULL;

-- Platform history: company_profile_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.company_profile_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.company_profile_icon_id
      WHERE prior.company_profile_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.company_profile_icon_id = previous.icon_id
WHERE active.company_profile_icon_id IS NULL;

-- Platform history: dashboard_billing_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.dashboard_billing_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.dashboard_billing_icon_id
      WHERE prior.dashboard_billing_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.dashboard_billing_icon_id = previous.icon_id
WHERE active.dashboard_billing_icon_id IS NULL;

-- Platform history: dashboard_chats_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.dashboard_chats_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.dashboard_chats_icon_id
      WHERE prior.dashboard_chats_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.dashboard_chats_icon_id = previous.icon_id
WHERE active.dashboard_chats_icon_id IS NULL;

-- Platform history: dashboard_communications_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.dashboard_communications_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.dashboard_communications_icon_id
      WHERE prior.dashboard_communications_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.dashboard_communications_icon_id = previous.icon_id
WHERE active.dashboard_communications_icon_id IS NULL;

-- Platform history: dashboard_notifications_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.dashboard_notifications_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.dashboard_notifications_icon_id
      WHERE prior.dashboard_notifications_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.dashboard_notifications_icon_id = previous.icon_id
WHERE active.dashboard_notifications_icon_id IS NULL;

-- Platform history: dashboard_payroll_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.dashboard_payroll_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.dashboard_payroll_icon_id
      WHERE prior.dashboard_payroll_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.dashboard_payroll_icon_id = previous.icon_id
WHERE active.dashboard_payroll_icon_id IS NULL;

-- Platform history: document_default_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.document_default_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.document_default_icon_id
      WHERE prior.document_default_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.document_default_icon_id = previous.icon_id
WHERE active.document_default_icon_id IS NULL;

-- Platform history: executive_report_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.executive_report_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.executive_report_icon_id
      WHERE prior.executive_report_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.executive_report_icon_id = previous.icon_id
WHERE active.executive_report_icon_id IS NULL;

-- Platform history: external_calendar_audit_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.external_calendar_audit_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.external_calendar_audit_icon_id
      WHERE prior.external_calendar_audit_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.external_calendar_audit_icon_id = previous.icon_id
WHERE active.external_calendar_audit_icon_id IS NULL;

-- Platform history: field_definitions_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.field_definitions_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.field_definitions_icon_id
      WHERE prior.field_definitions_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.field_definitions_icon_id = previous.icon_id
WHERE active.field_definitions_icon_id IS NULL;

-- Platform history: first_login_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.first_login_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.first_login_icon_id
      WHERE prior.first_login_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.first_login_icon_id = previous.icon_id
WHERE active.first_login_icon_id IS NULL;

-- Platform history: first_login_pending_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.first_login_pending_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.first_login_pending_icon_id
      WHERE prior.first_login_pending_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.first_login_pending_icon_id = previous.icon_id
WHERE active.first_login_pending_icon_id IS NULL;

-- Platform history: intake_links_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.intake_links_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.intake_links_icon_id
      WHERE prior.intake_links_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.intake_links_icon_id = previous.icon_id
WHERE active.intake_links_icon_id IS NULL;

-- Platform history: integrations_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.integrations_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.integrations_icon_id
      WHERE prior.integrations_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.integrations_icon_id = previous.icon_id
WHERE active.integrations_icon_id IS NULL;

-- Platform history: invitation_expired_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.invitation_expired_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.invitation_expired_icon_id
      WHERE prior.invitation_expired_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.invitation_expired_icon_id = previous.icon_id
WHERE active.invitation_expired_icon_id IS NULL;

-- Platform history: manage_agencies_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.manage_agencies_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.manage_agencies_icon_id
      WHERE prior.manage_agencies_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.manage_agencies_icon_id = previous.icon_id
WHERE active.manage_agencies_icon_id IS NULL;

-- Platform history: manage_clients_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.manage_clients_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.manage_clients_icon_id
      WHERE prior.manage_clients_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.manage_clients_icon_id = previous.icon_id
WHERE active.manage_clients_icon_id IS NULL;

-- Platform history: manage_documents_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.manage_documents_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.manage_documents_icon_id
      WHERE prior.manage_documents_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.manage_documents_icon_id = previous.icon_id
WHERE active.manage_documents_icon_id IS NULL;

-- Platform history: manage_modules_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.manage_modules_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.manage_modules_icon_id
      WHERE prior.manage_modules_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.manage_modules_icon_id = previous.icon_id
WHERE active.manage_modules_icon_id IS NULL;

-- Platform history: manage_users_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.manage_users_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.manage_users_icon_id
      WHERE prior.manage_users_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.manage_users_icon_id = previous.icon_id
WHERE active.manage_users_icon_id IS NULL;

-- Platform history: marketing_social_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.marketing_social_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.marketing_social_icon_id
      WHERE prior.marketing_social_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.marketing_social_icon_id = previous.icon_id
WHERE active.marketing_social_icon_id IS NULL;

-- Platform history: module_default_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.module_default_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.module_default_icon_id
      WHERE prior.module_default_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.module_default_icon_id = previous.icon_id
WHERE active.module_default_icon_id IS NULL;

-- Platform history: my_dashboard_chats_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_chats_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_chats_icon_id
      WHERE prior.my_dashboard_chats_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_chats_icon_id = previous.icon_id
WHERE active.my_dashboard_chats_icon_id IS NULL;

-- Platform history: my_dashboard_checklist_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_checklist_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_checklist_icon_id
      WHERE prior.my_dashboard_checklist_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_checklist_icon_id = previous.icon_id
WHERE active.my_dashboard_checklist_icon_id IS NULL;

-- Platform history: my_dashboard_clients_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_clients_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_clients_icon_id
      WHERE prior.my_dashboard_clients_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_clients_icon_id = previous.icon_id
WHERE active.my_dashboard_clients_icon_id IS NULL;

-- Platform history: my_dashboard_clinical_note_generator_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_clinical_note_generator_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_clinical_note_generator_icon_id
      WHERE prior.my_dashboard_clinical_note_generator_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_clinical_note_generator_icon_id = previous.icon_id
WHERE active.my_dashboard_clinical_note_generator_icon_id IS NULL;

-- Platform history: my_dashboard_communications_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_communications_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_communications_icon_id
      WHERE prior.my_dashboard_communications_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_communications_icon_id = previous.icon_id
WHERE active.my_dashboard_communications_icon_id IS NULL;

-- Platform history: my_dashboard_contacts_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_contacts_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_contacts_icon_id
      WHERE prior.my_dashboard_contacts_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_contacts_icon_id = previous.icon_id
WHERE active.my_dashboard_contacts_icon_id IS NULL;

-- Platform history: my_dashboard_documents_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_documents_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_documents_icon_id
      WHERE prior.my_dashboard_documents_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_documents_icon_id = previous.icon_id
WHERE active.my_dashboard_documents_icon_id IS NULL;

-- Platform history: my_dashboard_momentum_list_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_momentum_list_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_momentum_list_icon_id
      WHERE prior.my_dashboard_momentum_list_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_momentum_list_icon_id = previous.icon_id
WHERE active.my_dashboard_momentum_list_icon_id IS NULL;

-- Platform history: my_dashboard_momentum_stickies_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_momentum_stickies_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_momentum_stickies_icon_id
      WHERE prior.my_dashboard_momentum_stickies_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_momentum_stickies_icon_id = previous.icon_id
WHERE active.my_dashboard_momentum_stickies_icon_id IS NULL;

-- Platform history: my_dashboard_my_account_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_my_account_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_my_account_icon_id
      WHERE prior.my_dashboard_my_account_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_my_account_icon_id = previous.icon_id
WHERE active.my_dashboard_my_account_icon_id IS NULL;

-- Platform history: my_dashboard_my_schedule_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_my_schedule_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_my_schedule_icon_id
      WHERE prior.my_dashboard_my_schedule_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_my_schedule_icon_id = previous.icon_id
WHERE active.my_dashboard_my_schedule_icon_id IS NULL;

-- Platform history: my_dashboard_notifications_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_notifications_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_notifications_icon_id
      WHERE prior.my_dashboard_notifications_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_notifications_icon_id = previous.icon_id
WHERE active.my_dashboard_notifications_icon_id IS NULL;

-- Platform history: my_dashboard_on_demand_training_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_on_demand_training_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_on_demand_training_icon_id
      WHERE prior.my_dashboard_on_demand_training_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_on_demand_training_icon_id = previous.icon_id
WHERE active.my_dashboard_on_demand_training_icon_id IS NULL;

-- Platform history: my_dashboard_payroll_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_payroll_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_payroll_icon_id
      WHERE prior.my_dashboard_payroll_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_payroll_icon_id = previous.icon_id
WHERE active.my_dashboard_payroll_icon_id IS NULL;

-- Platform history: my_dashboard_staff_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_staff_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_staff_icon_id
      WHERE prior.my_dashboard_staff_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_staff_icon_id = previous.icon_id
WHERE active.my_dashboard_staff_icon_id IS NULL;

-- Platform history: my_dashboard_submit_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_submit_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_submit_icon_id
      WHERE prior.my_dashboard_submit_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_submit_icon_id = previous.icon_id
WHERE active.my_dashboard_submit_icon_id IS NULL;

-- Platform history: my_dashboard_supervision_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_supervision_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_supervision_icon_id
      WHERE prior.my_dashboard_supervision_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_supervision_icon_id = previous.icon_id
WHERE active.my_dashboard_supervision_icon_id IS NULL;

-- Platform history: my_dashboard_training_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.my_dashboard_training_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.my_dashboard_training_icon_id
      WHERE prior.my_dashboard_training_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.my_dashboard_training_icon_id = previous.icon_id
WHERE active.my_dashboard_training_icon_id IS NULL;

-- Platform history: onboarding_completed_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.onboarding_completed_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.onboarding_completed_icon_id
      WHERE prior.onboarding_completed_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.onboarding_completed_icon_id = previous.icon_id
WHERE active.onboarding_completed_icon_id IS NULL;

-- Platform history: packages_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.packages_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.packages_icon_id
      WHERE prior.packages_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.packages_icon_id = previous.icon_id
WHERE active.packages_icon_id IS NULL;

-- Platform history: password_changed_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.password_changed_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.password_changed_icon_id
      WHERE prior.password_changed_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.password_changed_icon_id = previous.icon_id
WHERE active.password_changed_icon_id IS NULL;

-- Platform history: platform_settings_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.platform_settings_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.platform_settings_icon_id
      WHERE prior.platform_settings_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.platform_settings_icon_id = previous.icon_id
WHERE active.platform_settings_icon_id IS NULL;

-- Platform history: presence_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.presence_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.presence_icon_id
      WHERE prior.presence_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.presence_icon_id = previous.icon_id
WHERE active.presence_icon_id IS NULL;

-- Platform history: program_overview_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.program_overview_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.program_overview_icon_id
      WHERE prior.program_overview_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.program_overview_icon_id = previous.icon_id
WHERE active.program_overview_icon_id IS NULL;

-- Platform history: progress_dashboard_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.progress_dashboard_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.progress_dashboard_icon_id
      WHERE prior.progress_dashboard_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.progress_dashboard_icon_id = previous.icon_id
WHERE active.progress_dashboard_icon_id IS NULL;

-- Platform history: provider_availability_dashboard_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.provider_availability_dashboard_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.provider_availability_dashboard_icon_id
      WHERE prior.provider_availability_dashboard_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.provider_availability_dashboard_icon_id = previous.icon_id
WHERE active.provider_availability_dashboard_icon_id IS NULL;

-- Platform history: school_overview_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_overview_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_overview_icon_id
      WHERE prior.school_overview_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_overview_icon_id = previous.icon_id
WHERE active.school_overview_icon_id IS NULL;

-- Platform history: school_portal_announcements_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_announcements_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_announcements_icon_id
      WHERE prior.school_portal_announcements_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_announcements_icon_id = previous.icon_id
WHERE active.school_portal_announcements_icon_id IS NULL;

-- Platform history: school_portal_calendar_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_calendar_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_calendar_icon_id
      WHERE prior.school_portal_calendar_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_calendar_icon_id = previous.icon_id
WHERE active.school_portal_calendar_icon_id IS NULL;

-- Platform history: school_portal_contact_admin_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_contact_admin_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_contact_admin_icon_id
      WHERE prior.school_portal_contact_admin_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_contact_admin_icon_id = previous.icon_id
WHERE active.school_portal_contact_admin_icon_id IS NULL;

-- Platform history: school_portal_days_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_days_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_days_icon_id
      WHERE prior.school_portal_days_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_days_icon_id = previous.icon_id
WHERE active.school_portal_days_icon_id IS NULL;

-- Platform history: school_portal_digital_forms_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_digital_forms_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_digital_forms_icon_id
      WHERE prior.school_portal_digital_forms_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_digital_forms_icon_id = previous.icon_id
WHERE active.school_portal_digital_forms_icon_id IS NULL;

-- Platform history: school_portal_events_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_events_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_events_icon_id
      WHERE prior.school_portal_events_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_events_icon_id = previous.icon_id
WHERE active.school_portal_events_icon_id IS NULL;

-- Platform history: school_portal_faq_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_faq_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_faq_icon_id
      WHERE prior.school_portal_faq_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_faq_icon_id = previous.icon_id
WHERE active.school_portal_faq_icon_id IS NULL;

-- Platform history: school_portal_parent_qr_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_parent_qr_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_parent_qr_icon_id
      WHERE prior.school_portal_parent_qr_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_parent_qr_icon_id = previous.icon_id
WHERE active.school_portal_parent_qr_icon_id IS NULL;

-- Platform history: school_portal_parent_sign_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_parent_sign_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_parent_sign_icon_id
      WHERE prior.school_portal_parent_sign_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_parent_sign_icon_id = previous.icon_id
WHERE active.school_portal_parent_sign_icon_id IS NULL;

-- Platform history: school_portal_providers_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_providers_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_providers_icon_id
      WHERE prior.school_portal_providers_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_providers_icon_id = previous.icon_id
WHERE active.school_portal_providers_icon_id IS NULL;

-- Platform history: school_portal_roster_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_roster_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_roster_icon_id
      WHERE prior.school_portal_roster_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_roster_icon_id = previous.icon_id
WHERE active.school_portal_roster_icon_id IS NULL;

-- Platform history: school_portal_school_staff_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_school_staff_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_school_staff_icon_id
      WHERE prior.school_portal_school_staff_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_school_staff_icon_id = previous.icon_id
WHERE active.school_portal_school_staff_icon_id IS NULL;

-- Platform history: school_portal_skills_groups_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_skills_groups_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_skills_groups_icon_id
      WHERE prior.school_portal_skills_groups_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_skills_groups_icon_id = previous.icon_id
WHERE active.school_portal_skills_groups_icon_id IS NULL;

-- Platform history: school_portal_upload_packet_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.school_portal_upload_packet_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.school_portal_upload_packet_icon_id
      WHERE prior.school_portal_upload_packet_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.school_portal_upload_packet_icon_id = previous.icon_id
WHERE active.school_portal_upload_packet_icon_id IS NULL;

-- Platform history: settings_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.settings_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.settings_icon_id
      WHERE prior.settings_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.settings_icon_id = previous.icon_id
WHERE active.settings_icon_id IS NULL;

-- Platform history: skill_builders_availability_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.skill_builders_availability_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.skill_builders_availability_icon_id
      WHERE prior.skill_builders_availability_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.skill_builders_availability_icon_id = previous.icon_id
WHERE active.skill_builders_availability_icon_id IS NULL;

-- Platform history: status_expired_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.status_expired_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.status_expired_icon_id
      WHERE prior.status_expired_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.status_expired_icon_id = previous.icon_id
WHERE active.status_expired_icon_id IS NULL;

-- Platform history: support_ticket_created_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.support_ticket_created_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.support_ticket_created_icon_id
      WHERE prior.support_ticket_created_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.support_ticket_created_icon_id = previous.icon_id
WHERE active.support_ticket_created_icon_id IS NULL;

-- Platform history: task_overdue_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.task_overdue_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.task_overdue_icon_id
      WHERE prior.task_overdue_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.task_overdue_icon_id = previous.icon_id
WHERE active.task_overdue_icon_id IS NULL;

-- Platform history: team_roles_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.team_roles_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.team_roles_icon_id
      WHERE prior.team_roles_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.team_roles_icon_id = previous.icon_id
WHERE active.team_roles_icon_id IS NULL;

-- Platform history: temp_password_expired_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.temp_password_expired_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.temp_password_expired_icon_id
      WHERE prior.temp_password_expired_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.temp_password_expired_icon_id = previous.icon_id
WHERE active.temp_password_expired_icon_id IS NULL;

-- Platform history: training_focus_default_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.training_focus_default_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.training_focus_default_icon_id
      WHERE prior.training_focus_default_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.training_focus_default_icon_id = previous.icon_id
WHERE active.training_focus_default_icon_id IS NULL;

-- Platform history: user_default_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.user_default_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.user_default_icon_id
      WHERE prior.user_default_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.user_default_icon_id = previous.icon_id
WHERE active.user_default_icon_id IS NULL;

-- Platform history: view_all_progress_icon_id
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT prior.view_all_progress_icon_id AS icon_id
      FROM platform_branding prior JOIN icons i ON i.id = prior.view_all_progress_icon_id
      WHERE prior.view_all_progress_icon_id IS NOT NULL
      ORDER BY prior.id DESC LIMIT 1) previous ON previous.icon_id IS NOT NULL
SET active.view_all_progress_icon_id = previous.icon_id
WHERE active.view_all_progress_icon_id IS NULL;

-- Backup fallback only when runtime history could not recover an assignment.

-- Platform backup: manage_agencies_icon_id (ManageAgencies)
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768237096951-919384222.png') recovered ON recovered.id IS NOT NULL
SET active.manage_agencies_icon_id = recovered.id
WHERE active.manage_agencies_icon_id IS NULL;

-- Platform backup: manage_modules_icon_id (ManageModulesPT2)
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768237166491-716973584.png') recovered ON recovered.id IS NOT NULL
SET active.manage_modules_icon_id = recovered.id
WHERE active.manage_modules_icon_id IS NULL;

-- Platform backup: manage_documents_icon_id (ManageDocumentsPT2)
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768237166006-606493663.png') recovered ON recovered.id IS NOT NULL
SET active.manage_documents_icon_id = recovered.id
WHERE active.manage_documents_icon_id IS NULL;

-- Platform backup: manage_users_icon_id (ManageUsersPT2)
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768237098410-124864991.png') recovered ON recovered.id IS NOT NULL
SET active.manage_users_icon_id = recovered.id
WHERE active.manage_users_icon_id IS NULL;

-- Platform backup: platform_settings_icon_id (SystemSettingsPT2)
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768237173252-210824507.png') recovered ON recovered.id IS NOT NULL
SET active.platform_settings_icon_id = recovered.id
WHERE active.platform_settings_icon_id IS NULL;

-- Platform backup: view_all_progress_icon_id (ViewAllProgressPT)
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768237112512-820836304.png') recovered ON recovered.id IS NOT NULL
SET active.view_all_progress_icon_id = recovered.id
WHERE active.view_all_progress_icon_id IS NULL;

-- Platform backup: all_agencies_notifications_icon_id (BrainandTree)
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768233871647-756510151.png') recovered ON recovered.id IS NOT NULL
SET active.all_agencies_notifications_icon_id = recovered.id
WHERE active.all_agencies_notifications_icon_id IS NULL;

-- Platform backup: skill_builders_availability_icon_id (SkillBuilders)
UPDATE platform_branding active
JOIN (SELECT MAX(id) AS id FROM platform_branding) current_row ON current_row.id = active.id
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'uploads/icons/icon-1769567631905-993375299.png') recovered ON recovered.id IS NOT NULL
SET active.skill_builders_availability_icon_id = recovered.id
WHERE active.skill_builders_availability_icon_id IS NULL;
