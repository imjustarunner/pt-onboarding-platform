-- Migration 1330: ITSCO hire group_password mode + prehire settings defaults
-- Enables Group work-email + app password hire path (no Workspace user per hire).

UPDATE agencies
SET feature_flags = JSON_SET(
  COALESCE(feature_flags, JSON_OBJECT()),
  '$.hireAccountMode', 'group_password',
  '$.workspaceEmailDomain', COALESCE(
    NULLIF(JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.workspaceEmailDomain')), ''),
    'itsco.health'
  ),
  '$.workspaceEmailFormat', COALESCE(
    NULLIF(JSON_UNQUOTE(JSON_EXTRACT(feature_flags, '$.workspaceEmailFormat')), ''),
    'first_initial_last'
  ),
  '$.workspaceProvisioningEnabled', false
)
WHERE (
  LOWER(COALESCE(slug, '')) LIKE '%itsco%'
  OR LOWER(COALESCE(portal_url, '')) LIKE '%itsco%'
  OR LOWER(COALESCE(name, '')) LIKE '%itsco%'
  OR LOWER(COALESCE(official_name, '')) LIKE '%itsco%'
);
