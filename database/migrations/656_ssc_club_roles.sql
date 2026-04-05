-- Club-scoped manager roles for SSC/SSTC affiliations.

ALTER TABLE user_agencies
  ADD COLUMN club_role ENUM('member','assistant_manager','manager') NULL DEFAULT NULL AFTER is_active;

UPDATE user_agencies ua
INNER JOIN agencies a ON a.id = ua.agency_id
INNER JOIN users u ON u.id = ua.user_id
SET ua.club_role = CASE
  WHEN LOWER(COALESCE(u.role, '')) IN ('super_admin', 'admin', 'support') THEN 'manager'
  WHEN LOWER(COALESCE(u.role, '')) IN ('provider_plus', 'clinical_practice_assistant', 'staff') THEN 'assistant_manager'
  ELSE 'member'
END
WHERE LOWER(COALESCE(a.organization_type, '')) = 'affiliation'
  AND ua.club_role IS NULL;

CREATE INDEX idx_user_agencies_club_role ON user_agencies (agency_id, club_role);
