-- Migration: Add School Portal "Parent/Packet" card icon fields
-- Purpose:
-- - Add platform defaults (platform_branding) + agency overrides (agencies) for:
--   1) Parent QR code card
--   2) Parent fill + sign card
--   3) Upload packet card

-- Platform defaults
ALTER TABLE platform_branding
  ADD COLUMN school_portal_parent_qr_icon_id INT NULL,
  ADD COLUMN school_portal_parent_sign_icon_id INT NULL,
  ADD COLUMN school_portal_upload_packet_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD CONSTRAINT fk_platform_school_portal_parent_qr_icon
    FOREIGN KEY (school_portal_parent_qr_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_school_portal_parent_sign_icon
    FOREIGN KEY (school_portal_parent_sign_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_platform_school_portal_upload_packet_icon
    FOREIGN KEY (school_portal_upload_packet_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- Agency overrides
ALTER TABLE agencies
  ADD COLUMN school_portal_parent_qr_icon_id INT NULL,
  ADD COLUMN school_portal_parent_sign_icon_id INT NULL,
  ADD COLUMN school_portal_upload_packet_icon_id INT NULL;

ALTER TABLE agencies
  ADD CONSTRAINT fk_agency_school_portal_parent_qr_icon
    FOREIGN KEY (school_portal_parent_qr_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agency_school_portal_parent_sign_icon
    FOREIGN KEY (school_portal_parent_sign_icon_id) REFERENCES icons(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agency_school_portal_upload_packet_icon
    FOREIGN KEY (school_portal_upload_packet_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

