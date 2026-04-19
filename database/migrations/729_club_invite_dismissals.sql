-- Phase 3: Permanent "don't show again" dismissals for SSTC club invites.
-- When a user is offered to join a club (via a manager invite, a season
-- announcement that requires club membership, or a public splash) they can
-- decline this once OR decline forever. A "decline forever" row in this
-- table suppresses any future invites/announcements from that club until the
-- user explicitly re-engages.

CREATE TABLE IF NOT EXISTS club_invite_dismissals (
  id              INT          AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL,
  agency_id       INT          NOT NULL COMMENT 'Club agency id',
  reason          VARCHAR(160) NULL COMMENT 'Optional free-text reason captured at decline time',
  dismissed_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_user_agency (user_id, agency_id),
  INDEX idx_cid_agency (agency_id),
  INDEX idx_cid_user (user_id),

  CONSTRAINT fk_cid_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cid_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);
