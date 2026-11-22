-- Reuse ITSCO assets only in the explicitly identified synthetic training tenant.
-- Accounts, memberships, client records, permissions, and audit actors stay intact.
SET @demo_branding_prior_group_concat_max_len = @@SESSION.group_concat_max_len;
SET SESSION group_concat_max_len = 32768;
SELECT GROUP_CONCAT(CONCAT('demo.`', COLUMN_NAME, '` = source.`', COLUMN_NAME, '`') ORDER BY ORDINAL_POSITION SEPARATOR ', ')
INTO @demo_branding_icon_assignments
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies'
  AND (RIGHT(COLUMN_NAME, 8) = '_icon_id' OR COLUMN_NAME = 'icon_id');
SET @demo_branding_statement = CONCAT(
  'UPDATE agencies demo JOIN agencies source ON source.slug = ''itsco'' SET ',
  'demo.logo_url = COALESCE(NULLIF(source.logo_url, ''''), ''/assets/itsco/logo.png''), ',
  'demo.logo_path = source.logo_path, demo.color_palette = source.color_palette',
  IF(COALESCE(@demo_branding_icon_assignments, '') = '', '', CONCAT(', ', @demo_branding_icon_assignments)),
  ' WHERE demo.slug = ''auricwell-qa-demo'' AND demo.organization_type = ''agency''',
  ' AND JSON_EXTRACT(demo.feature_flags, ''$.qaSandbox.syntheticOnly'') = TRUE'
);
PREPARE demo_branding_update FROM @demo_branding_statement;
EXECUTE demo_branding_update;
DEALLOCATE PREPARE demo_branding_update;
SET SESSION group_concat_max_len = @demo_branding_prior_group_concat_max_len;
