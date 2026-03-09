-- Add audience-based targeting to agency scheduled announcements,
-- and add display_type + audience to school portal announcements
-- so both systems support splash modals with role-based audiences.

ALTER TABLE agency_scheduled_announcements
  ADD COLUMN audience VARCHAR(50) NOT NULL DEFAULT 'everyone' AFTER recipient_user_ids;

ALTER TABLE school_portal_announcements
  ADD COLUMN display_type ENUM('announcement', 'splash') NOT NULL DEFAULT 'announcement' AFTER message,
  ADD COLUMN audience VARCHAR(50) NOT NULL DEFAULT 'everyone' AFTER display_type;
