-- Activate only after the new application revision is serving traffic and the
-- migration audit has reconciled the latest legacy grants.
CREATE TABLE IF NOT EXISTS user_agency_access_rollout (
 id TINYINT NOT NULL PRIMARY KEY,
 enabled TINYINT(1) NOT NULL DEFAULT 0,
 activated_by_user_id INT NULL,
 activated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO user_agency_access_rollout (id,enabled) VALUES (1,0);

-- Preserve the complete existing membership role/permission state before enabling local overrides.
-- Platform defaults start disabled; no person is enrolled in another company by this migration.
CREATE TABLE IF NOT EXISTS user_platform_access_defaults (
 user_id INT NOT NULL PRIMARY KEY,
 enabled TINYINT(1) NOT NULL DEFAULT 0,
 role VARCHAR(64) NULL,
 permissions_json JSON NOT NULL,
 platform_services_json JSON NULL,
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 updated_by_user_id INT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_agency_access_profiles (
 user_id INT NOT NULL,
 agency_id INT NOT NULL,
 access_origin VARCHAR(32) NOT NULL DEFAULT 'membership',
 role_baseline VARCHAR(64) NOT NULL,
 permissions_baseline JSON NOT NULL,
 role_override VARCHAR(64) NULL,
 permissions_overrides JSON NOT NULL,
 effective_role VARCHAR(64) NOT NULL,
 effective_permissions JSON NOT NULL,
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,agency_id),
 KEY idx_agency_access_agency (agency_id,effective_role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_agency_access_audit (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 agency_id INT NULL,
 actor_user_id INT NOT NULL,
 scope VARCHAR(32) NOT NULL,
 before_json JSON NOT NULL,
 after_json JSON NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_agency_access_audit_user (user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO user_agency_access_profiles
(user_id,agency_id,role_baseline,permissions_baseline,role_override,permissions_overrides,effective_role,effective_permissions)
SELECT u.id,ua.agency_id,COALESCE(NULLIF(ua.agency_role,''),NULLIF(u.role,''),'provider'),
 JSON_OBJECT('has_hiring_access', (COALESCE(u.has_hiring_access,0) = 1 OR u.role IN ('admin','super_admin','support','staff') OR ua.agency_role IN ('admin','support','staff')),
  'has_payroll_access', COALESCE(ua.has_payroll_access,0) = 1,
  'has_billing_access', COALESCE(ua.has_billing_access,0) = 1,
  'has_department_access', COALESCE(ua.has_department_access,0) = 1,
  'can_manage_credentialing', COALESCE(ua.can_manage_credentialing,0) = 1,
  'has_medical_records_release_access', COALESCE(u.has_medical_records_release_access,0) = 1,
  'has_outreach_access', (COALESCE(u.has_outreach_access,0) = 1 OR u.role IN ('admin','super_admin','support') OR ua.agency_role IN ('admin','support')),
  'is_marketing_contact', COALESCE(ua.is_marketing_contact,0) = 1,
  'has_provider_access', COALESCE(u.has_provider_access,0) = 1,
  'has_staff_access', COALESCE(u.has_staff_access,0) = 1,
  'has_supervisor_privileges', COALESCE(u.has_supervisor_privileges,0) = 1,
  'has_skill_builder_coordinator_access', COALESCE(u.has_skill_builder_coordinator_access,0) = 1,
  'skill_builder_eligible', COALESCE(u.skill_builder_eligible,0) = 1,
  'group_supervision_eligible', COALESCE(u.group_supervision_eligible,0) = 1,
  'has_games_access', COALESCE(u.has_games_access,0) = 1,
  'company_card_enabled', COALESCE(u.company_card_enabled,0) = 1,
  'company_car_submit_access', COALESCE(u.company_car_submit_access,0) = 1,
  'company_car_manage_access', COALESCE(u.company_car_manage_access,0) = 1,
  'is_hourly_worker', COALESCE(u.is_hourly_worker,0) = 1),
 NULLIF(ua.agency_role,''),JSON_OBJECT(),COALESCE(NULLIF(ua.agency_role,''),NULLIF(u.role,''),'provider'),
 JSON_OBJECT('has_hiring_access', (COALESCE(u.has_hiring_access,0) = 1 OR u.role IN ('admin','super_admin','support','staff') OR ua.agency_role IN ('admin','support','staff')),
  'has_payroll_access', COALESCE(ua.has_payroll_access,0) = 1,
  'has_billing_access', COALESCE(ua.has_billing_access,0) = 1,
  'has_department_access', COALESCE(ua.has_department_access,0) = 1,
  'can_manage_credentialing', COALESCE(ua.can_manage_credentialing,0) = 1,
  'has_medical_records_release_access', COALESCE(u.has_medical_records_release_access,0) = 1,
  'has_outreach_access', (COALESCE(u.has_outreach_access,0) = 1 OR u.role IN ('admin','super_admin','support') OR ua.agency_role IN ('admin','support')),
  'is_marketing_contact', COALESCE(ua.is_marketing_contact,0) = 1,
  'has_provider_access', COALESCE(u.has_provider_access,0) = 1,
  'has_staff_access', COALESCE(u.has_staff_access,0) = 1,
  'has_supervisor_privileges', COALESCE(u.has_supervisor_privileges,0) = 1,
  'has_skill_builder_coordinator_access', COALESCE(u.has_skill_builder_coordinator_access,0) = 1,
  'skill_builder_eligible', COALESCE(u.skill_builder_eligible,0) = 1,
  'group_supervision_eligible', COALESCE(u.group_supervision_eligible,0) = 1,
  'has_games_access', COALESCE(u.has_games_access,0) = 1,
  'company_card_enabled', COALESCE(u.company_card_enabled,0) = 1,
  'company_car_submit_access', COALESCE(u.company_car_submit_access,0) = 1,
  'company_car_manage_access', COALESCE(u.company_car_manage_access,0) = 1,
  'is_hourly_worker', COALESCE(u.is_hourly_worker,0) = 1)
FROM users u JOIN user_agencies ua ON ua.user_id=u.id;

-- Retain credentialing coverage previously expanded by the tenant-tree helper.
WITH credential_seeds AS (
 SELECT DISTINCT ua.user_id,
  CASE WHEN a.organization_type IN ('agency','clubwebapp','life_coach','consultant') THEN a.id
   ELSE COALESCE((SELECT oa.agency_id FROM organization_affiliations oa WHERE oa.organization_id=a.id AND COALESCE(oa.is_active,1)=1 ORDER BY oa.id LIMIT 1),a.id) END AS root_id
 FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id WHERE ua.can_manage_credentialing=1 AND COALESCE(ua.is_active,1)=1
), credential_coverage AS (
 SELECT user_id,root_id AS agency_id FROM credential_seeds
 UNION SELECT s.user_id,oa.organization_id FROM credential_seeds s JOIN organization_affiliations oa ON oa.agency_id=s.root_id AND COALESCE(oa.is_active,1)=1
)
UPDATE user_agency_access_profiles p JOIN credential_coverage c ON c.user_id=p.user_id AND c.agency_id=p.agency_id
LEFT JOIN user_platform_access_defaults d ON d.user_id=p.user_id AND d.enabled=1
SET p.permissions_baseline=JSON_SET(p.permissions_baseline,'$.can_manage_credentialing',TRUE),
 p.effective_permissions=JSON_SET(p.effective_permissions,'$.can_manage_credentialing',TRUE)
WHERE p.revision=1 AND JSON_LENGTH(p.permissions_overrides)=0 AND d.user_id IS NULL;

INSERT IGNORE INTO user_agency_access_profiles
(user_id,agency_id,access_origin,role_baseline,permissions_baseline,permissions_overrides,effective_role,effective_permissions)
WITH credential_seeds AS (
 SELECT DISTINCT ua.user_id,
  CASE WHEN a.organization_type IN ('agency','clubwebapp','life_coach','consultant') THEN a.id
   ELSE COALESCE((SELECT oa.agency_id FROM organization_affiliations oa WHERE oa.organization_id=a.id AND COALESCE(oa.is_active,1)=1 ORDER BY oa.id LIMIT 1),a.id) END AS root_id
 FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id WHERE ua.can_manage_credentialing=1 AND COALESCE(ua.is_active,1)=1
), credential_coverage AS (
 SELECT user_id,root_id AS agency_id FROM credential_seeds
 UNION SELECT s.user_id,oa.organization_id FROM credential_seeds s JOIN organization_affiliations oa ON oa.agency_id=s.root_id AND COALESCE(oa.is_active,1)=1
)
SELECT c.user_id,c.agency_id,'legacy_tenant_grant','support',JSON_OBJECT('can_manage_credentialing',TRUE),JSON_OBJECT(),'support',JSON_OBJECT('can_manage_credentialing',TRUE)
FROM credential_coverage c JOIN users u ON u.id=c.user_id JOIN agencies a ON a.id=c.agency_id;
