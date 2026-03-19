-- School Portal: school-scoped staff capability flags
-- Adds per-school permissions for school_staff users without changing global user role.

ALTER TABLE school_contacts
  ADD COLUMN is_school_admin BOOLEAN NOT NULL DEFAULT FALSE AFTER is_primary,
  ADD COLUMN is_scheduler BOOLEAN NOT NULL DEFAULT FALSE AFTER is_school_admin;

-- Backfill existing primary contacts to also be school admins for compatibility.
UPDATE school_contacts
SET is_school_admin = TRUE
WHERE is_primary = TRUE;

CREATE INDEX idx_school_contacts_admin ON school_contacts(school_organization_id, is_school_admin);
CREATE INDEX idx_school_contacts_scheduler ON school_contacts(school_organization_id, is_scheduler);
