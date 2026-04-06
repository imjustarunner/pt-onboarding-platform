-- Migration: Per-club private notes on icons (icon_club_details)
-- Each club can write private search tags / notes on any icon they can see.
-- The details are visible and editable only by that club.

CREATE TABLE IF NOT EXISTS icon_club_details (
  id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  icon_id    INT          NOT NULL,
  agency_id  INT          NOT NULL,
  details    TEXT         NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_icon_club (icon_id, agency_id),
  CONSTRAINT fk_icd_icon   FOREIGN KEY (icon_id)   REFERENCES icons(id)    ON DELETE CASCADE,
  CONSTRAINT fk_icd_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE INDEX idx_icd_agency ON icon_club_details (agency_id);
