-- Migration 1164: Flag clients needing school-staff ROI configuration after paper packet upload.
ALTER TABLE clients
  ADD COLUMN paper_packet_staff_roi_pending TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 when paper packet uploaded and per-staff ROI levels still need configuration';
