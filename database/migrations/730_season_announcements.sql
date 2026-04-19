-- Phase 4: Manager-broadcast "Announce season" splashes + per-member
-- acknowledgments. When a club starts a new season the manager can blast all
-- club members. Members see the splash on next dashboard load with options
-- to Join, Sit out, or "Remind me when it starts". A separate per-user ack
-- table records whether/when they've responded so the splash doesn't keep
-- popping up.

CREATE TABLE IF NOT EXISTS season_announcements (
  id              INT          AUTO_INCREMENT PRIMARY KEY,
  agency_id       INT          NOT NULL COMMENT 'Club agency id',
  learning_class_id INT        NOT NULL COMMENT 'Season id (learning_program_classes.id)',
  created_by      INT          NOT NULL COMMENT 'Manager user id who broadcast it',
  headline        VARCHAR(180) NOT NULL,
  body            TEXT         NULL,
  audience        ENUM('all_members', 'team_captains_only') NOT NULL DEFAULT 'all_members',
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  delivered_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      TIMESTAMP    NULL COMMENT 'Optional auto-expiry (e.g. season start date)',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_sa_agency (agency_id),
  INDEX idx_sa_class  (learning_class_id),
  INDEX idx_sa_active (agency_id, is_active),

  CONSTRAINT fk_sa_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_creator
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS season_announcement_acks (
  id              INT          AUTO_INCREMENT PRIMARY KEY,
  announcement_id INT          NOT NULL,
  user_id         INT          NOT NULL,
  -- 'joined' / 'sitting_out' / 'remind_me' mirror season_participation_decisions;
  -- 'dismissed' = closed the splash without choosing.
  response        ENUM('joined', 'sitting_out', 'remind_me', 'dismissed') NOT NULL DEFAULT 'dismissed',
  acted_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_ack_user (announcement_id, user_id),
  INDEX idx_saa_user (user_id),

  CONSTRAINT fk_saa_announcement
    FOREIGN KEY (announcement_id) REFERENCES season_announcements(id) ON DELETE CASCADE,
  CONSTRAINT fk_saa_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
