-- Add approval_status to kudos: peer kudos require admin approval before points count
-- pending: awaiting admin approval (peer only)
-- approved: points count toward user total
-- rejected: admin declined

ALTER TABLE kudos
  ADD COLUMN approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'
  AFTER source;

-- Backfill: existing kudos were already counted; approve all so points stay correct
UPDATE kudos SET approval_status = 'approved' WHERE source = 'notes_complete';
UPDATE kudos SET approval_status = 'approved' WHERE source = 'peer';

-- Add index for admin pending queue
CREATE INDEX idx_kudos_approval_agency ON kudos (agency_id, approval_status);
