-- Seed feature entitlement events from existing legacy state so day counters
-- start cleanly when dual-axis pricing goes live.
--
-- Tenant-side: for each known feature flag key on agencies.feature_flags that is
-- truthy, insert an "enabled" event at NOW(). User-side: for users with
-- has_games_access = 1, insert one "enabled" event per agency membership.
--
-- The application also lazy-seeds events on first read for anything missed
-- here, so it is safe if this seed only covers a subset.

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'gamesPlatformEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.gamesPlatformEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.gamesPlatformEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'bookClubEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.bookClubEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.bookClubEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'hiringEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.hiringEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.hiringEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'payrollEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.payrollEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.payrollEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'budgetManagementEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.budgetManagementEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.budgetManagementEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'medcancelEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.medcancelEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.medcancelEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'shiftProgramsEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.shiftProgramsEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.shiftProgramsEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'noteAidEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.noteAidEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.noteAidEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'kudosEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.kudosEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.kudosEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'presenceEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.presenceEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.presenceEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'momentumListEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.momentumListEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.momentumListEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'publicProviderFinderEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.publicProviderFinderEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.publicProviderFinderEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'standardsLearningEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.standardsLearningEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.standardsLearningEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'groupClassSessionsEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.groupClassSessionsEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.groupClassSessionsEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'guardianWaiversEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.guardianWaiversEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.guardianWaiversEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'clinicalNoteGeneratorEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.clinicalNoteGeneratorEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.clinicalNoteGeneratorEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'aiProviderSearchEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.aiProviderSearchEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.aiProviderSearchEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'inSchoolSubmissionsEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.inSchoolSubmissionsEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.inSchoolSubmissionsEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'schoolPortalsEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.schoolPortalsEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.schoolPortalsEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'skillBuildersSchoolProgramEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.skillBuildersSchoolProgramEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.skillBuildersSchoolProgramEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'onboardingTrainingEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.onboardingTrainingEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.onboardingTrainingEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'googleSsoEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.googleSsoEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.googleSsoEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'workspaceProvisioningEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.workspaceProvisioningEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.workspaceProvisioningEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'platformSharedMarketingEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.platformSharedMarketingEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.platformSharedMarketingEnabled')) IN ('1','true','yes','on');

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'platformPublicRegistrationEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from agencies.feature_flags during migration 718'
FROM agencies
WHERE JSON_EXTRACT(feature_flags, '$.platformPublicRegistrationEnabled') = TRUE
   OR JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.platformPublicRegistrationEnabled')) IN ('1','true','yes','on');

-- Project the seeded tenant events into the current-state denorm.
INSERT INTO agency_feature_entitlements_current (agency_id, feature_key, enabled, last_event_id)
SELECT e.agency_id, e.feature_key, 1, MAX(e.id)
FROM agency_feature_entitlement_events e
WHERE e.notes = 'Seeded from agencies.feature_flags during migration 718'
GROUP BY e.agency_id, e.feature_key
ON DUPLICATE KEY UPDATE
  enabled = VALUES(enabled),
  last_event_id = VALUES(last_event_id);

-- Per-user games access seed (one event per user per agency membership).
INSERT INTO user_feature_entitlement_events
  (agency_id, user_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT ua.agency_id, u.id, 'gamesPlatformEnabled', 'enabled', NULL, 'system', NOW(),
       'Seeded from users.has_games_access during migration 718'
FROM users u
INNER JOIN user_agencies ua ON ua.user_id = u.id
WHERE u.has_games_access = 1;

INSERT INTO user_feature_entitlements_current (user_id, feature_key, agency_id, enabled, last_event_id)
SELECT e.user_id, e.feature_key, e.agency_id, 1, MAX(e.id)
FROM user_feature_entitlement_events e
WHERE e.notes = 'Seeded from users.has_games_access during migration 718'
GROUP BY e.user_id, e.feature_key, e.agency_id
ON DUPLICATE KEY UPDATE
  enabled = VALUES(enabled),
  last_event_id = VALUES(last_event_id);
