-- Phase 2: Per-season opt-in/opt-out decisions for SSTC club members.
-- A member can be a club member but choose to "sit out" or "remind me when it
-- starts" for any individual season, while still receiving notifications for
-- future seasons. Decisions persist; managers see the breakdown.
--
-- Note: actual enrollment ("joined") still lives in
-- learning_class_provider_memberships. This table only records intent for
-- seasons the user has *not* (yet) enrolled in. When a user explicitly joins,
-- their decision row is updated to 'joined' so we have a single source of
-- truth for the member's intent across the season list.

CREATE TABLE IF NOT EXISTS season_participation_decisions (
  id              INT          AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL,
  agency_id       INT          NOT NULL COMMENT 'Club agency id (organizations.id)',
  learning_class_id INT        NOT NULL COMMENT 'Season id (learning_program_classes.id)',
  decision        ENUM('joined', 'sitting_out', 'remind_me') NOT NULL,
  decided_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source          VARCHAR(32)  NULL COMMENT 'Where the decision was set (e.g. dashboard, season_announcement, join_modal)',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_user_class (user_id, learning_class_id),
  INDEX idx_spd_class (learning_class_id),
  INDEX idx_spd_agency (agency_id),
  INDEX idx_spd_user (user_id),

  CONSTRAINT fk_spd_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_spd_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_spd_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE
);
