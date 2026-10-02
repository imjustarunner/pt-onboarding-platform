-- Recover ITSCO branding from onboarding_stage_backup_20260127_195411.sql.
-- Only fill empty assignments. Match file paths, never assume historical IDs
-- still identify the same library asset. Missing library files are left alone.
-- Exact slug scope excludes Demo ITSCO / Demo Playground.

-- icon_id: Itscoindivdiual
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135509744-714644073.png') recovered ON recovered.id IS NOT NULL
SET a.icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.icon_id IS NULL;

-- manage_agencies_icon_id: Workplace
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135531239-167834932.png') recovered ON recovered.id IS NOT NULL
SET a.manage_agencies_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.manage_agencies_icon_id IS NULL;

-- manage_modules_icon_id: ManageModules
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135513593-913635141.png') recovered ON recovered.id IS NOT NULL
SET a.manage_modules_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.manage_modules_icon_id IS NULL;

-- manage_documents_icon_id: ManageDocuments
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135513125-523722740.png') recovered ON recovered.id IS NOT NULL
SET a.manage_documents_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.manage_documents_icon_id IS NULL;

-- manage_users_icon_id: ManageUsers
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135513995-583577988.png') recovered ON recovered.id IS NOT NULL
SET a.manage_users_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.manage_users_icon_id IS NULL;

-- platform_settings_icon_id: Settings
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135525152-315033226.png') recovered ON recovered.id IS NOT NULL
SET a.platform_settings_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.platform_settings_icon_id IS NULL;

-- view_all_progress_icon_id: ViewAllProgress
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135530519-797241897.png') recovered ON recovered.id IS NOT NULL
SET a.view_all_progress_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.view_all_progress_icon_id IS NULL;

-- progress_dashboard_icon_id: ViewAllProgress
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135530519-797241897.png') recovered ON recovered.id IS NOT NULL
SET a.progress_dashboard_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.progress_dashboard_icon_id IS NULL;

-- settings_icon_id: Settings
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135525152-315033226.png') recovered ON recovered.id IS NOT NULL
SET a.settings_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.settings_icon_id IS NULL;

-- my_dashboard_checklist_icon_id: Checklist2
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135492586-591193265.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_checklist_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.my_dashboard_checklist_icon_id IS NULL;

-- my_dashboard_training_icon_id: Training
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135528408-961619334.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_training_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.my_dashboard_training_icon_id IS NULL;

-- my_dashboard_documents_icon_id: Documents
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135497120-742811192.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_documents_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.my_dashboard_documents_icon_id IS NULL;

-- my_dashboard_my_account_icon_id: individualshield
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135508239-275096959.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_my_account_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.my_dashboard_my_account_icon_id IS NULL;

-- my_dashboard_on_demand_training_icon_id: Training complete
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135528063-623937063.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_on_demand_training_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.my_dashboard_on_demand_training_icon_id IS NULL;

-- my_dashboard_payroll_icon_id: Data
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135495244-282675558.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_payroll_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.my_dashboard_payroll_icon_id IS NULL;

-- my_dashboard_submit_icon_id: Individual 5
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135507150-74331839.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_submit_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.my_dashboard_submit_icon_id IS NULL;

-- manage_clients_icon_id: Improvement
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135506451-272004446.png') recovered ON recovered.id IS NOT NULL
SET a.manage_clients_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.manage_clients_icon_id IS NULL;

-- dashboard_notifications_icon_id: DiagnosisTreatment
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135496069-380288376.png') recovered ON recovered.id IS NOT NULL
SET a.dashboard_notifications_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.dashboard_notifications_icon_id IS NULL;

-- dashboard_communications_icon_id: MentalHealth
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135490664-544243216.png') recovered ON recovered.id IS NOT NULL
SET a.dashboard_communications_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.dashboard_communications_icon_id IS NULL;

-- dashboard_chats_icon_id: Communication
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135493319-495577158.png') recovered ON recovered.id IS NOT NULL
SET a.dashboard_chats_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.dashboard_chats_icon_id IS NULL;

-- dashboard_payroll_icon_id: Infinity
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135508590-171507537.png') recovered ON recovered.id IS NOT NULL
SET a.dashboard_payroll_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.dashboard_payroll_icon_id IS NULL;

-- dashboard_billing_icon_id: Document4
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135496763-707158710.png') recovered ON recovered.id IS NOT NULL
SET a.dashboard_billing_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.dashboard_billing_icon_id IS NULL;

-- external_calendar_audit_icon_id: Schedule
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135523191-335708073.png') recovered ON recovered.id IS NOT NULL
SET a.external_calendar_audit_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.external_calendar_audit_icon_id IS NULL;

-- school_overview_icon_id: School5
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135593777-649618265.png') recovered ON recovered.id IS NOT NULL
SET a.school_overview_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.school_overview_icon_id IS NULL;

-- my_dashboard_my_schedule_icon_id: Schedule
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135523191-335708073.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_my_schedule_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.my_dashboard_my_schedule_icon_id IS NULL;

-- my_dashboard_communications_icon_id: Communication
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135493319-495577158.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_communications_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.my_dashboard_communications_icon_id IS NULL;

-- my_dashboard_chats_icon_id: ITSCOgroup2
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135509355-353661105.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_chats_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.my_dashboard_chats_icon_id IS NULL;

-- my_dashboard_notifications_icon_id: Itscoindividual2
UPDATE agencies a
JOIN (SELECT MIN(id) AS id FROM icons WHERE file_path = 'icons/icon-1768135510084-457622242.png') recovered ON recovered.id IS NOT NULL
SET a.my_dashboard_notifications_icon_id = recovered.id
WHERE a.slug = 'itsco' AND a.my_dashboard_notifications_icon_id IS NULL;

-- Restore the backed-up green palette only when the entire known replacement
-- navy/blue/orange palette is present. Preserve subsequent deliberate changes.
UPDATE agencies
SET color_palette = JSON_SET(COALESCE(color_palette, JSON_OBJECT()),
  '$.primary', '#669878', '$.secondary', '#5A9B58', '$.accent', '#145A3D')
WHERE slug = 'itsco'
  AND UPPER(JSON_UNQUOTE(JSON_EXTRACT(color_palette, '$.primary'))) = '#0F172A'
  AND UPPER(JSON_UNQUOTE(JSON_EXTRACT(color_palette, '$.secondary'))) = '#1E40AF'
  AND UPPER(JSON_UNQUOTE(JSON_EXTRACT(color_palette, '$.accent'))) = '#F97316';
