-- Phase 4A: Group class session domain

-- NOTE:
-- delivery_mode was already added during the first partial execution attempt
-- before the FK mismatch failure. Keep this migration driver-compatible by
-- avoiding prepared/dynamic SQL here.
SELECT 1;

CREATE TABLE IF NOT EXISTS learning_class_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  title VARCHAR(191) NOT NULL,
  description TEXT NULL,
  mode ENUM('group','individual') NOT NULL DEFAULT 'group',
  status ENUM('scheduled','live','ended','cancelled') NOT NULL DEFAULT 'scheduled',
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  twilio_room_sid VARCHAR(64) NULL,
  twilio_room_unique_name VARCHAR(191) NULL,
  created_by_user_id INT NULL,
  started_by_user_id INT NULL,
  ended_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_learning_class_sessions_class (learning_class_id),
  INDEX idx_learning_class_sessions_status (status),
  INDEX idx_learning_class_sessions_start (starts_at),
  CONSTRAINT fk_learning_class_sessions_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_class_sessions_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_class_sessions_started_by
    FOREIGN KEY (started_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_class_sessions_ended_by
    FOREIGN KEY (ended_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_class_session_participants (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('presenter','co_presenter','proctor','participant') NOT NULL DEFAULT 'participant',
  can_unmute_participants TINYINT(1) NOT NULL DEFAULT 0,
  can_enable_participant_video TINYINT(1) NOT NULL DEFAULT 0,
  can_manage_slides TINYINT(1) NOT NULL DEFAULT 0,
  can_manage_polls TINYINT(1) NOT NULL DEFAULT 0,
  joined_at DATETIME NULL,
  left_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_learning_class_session_user (session_id, user_id),
  INDEX idx_learning_class_session_participants_role (session_id, role),
  CONSTRAINT fk_learning_class_session_participants_session
    FOREIGN KEY (session_id) REFERENCES learning_class_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_class_session_participants_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_class_session_slides (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  slide_order INT NOT NULL DEFAULT 0,
  title VARCHAR(191) NULL,
  body_text LONGTEXT NULL,
  media_url VARCHAR(1024) NULL,
  linked_assignment_id BIGINT NULL,
  linked_resource_id INT NULL,
  metadata_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_learning_class_session_slides_order (session_id, slide_order),
  CONSTRAINT fk_learning_class_session_slides_session
    FOREIGN KEY (session_id) REFERENCES learning_class_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_class_session_slides_assignment
    FOREIGN KEY (linked_assignment_id) REFERENCES learning_assignments(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_class_session_slides_resource
    FOREIGN KEY (linked_resource_id) REFERENCES learning_class_resources(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_class_session_slides_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_class_session_state (
  session_id BIGINT PRIMARY KEY,
  current_slide_id BIGINT NULL,
  current_slide_order INT NOT NULL DEFAULT 0,
  linked_document_url VARCHAR(1024) NULL,
  presenter_user_id INT NULL,
  metadata_json JSON NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_learning_class_session_state_session
    FOREIGN KEY (session_id) REFERENCES learning_class_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_class_session_state_slide
    FOREIGN KEY (current_slide_id) REFERENCES learning_class_session_slides(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_class_session_state_presenter
    FOREIGN KEY (presenter_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_learning_class_session_state_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_class_session_hand_raises (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('raised','approved','dismissed','answered') NOT NULL DEFAULT 'raised',
  note VARCHAR(512) NULL,
  requested_camera TINYINT(1) NOT NULL DEFAULT 0,
  approved_audio TINYINT(1) NOT NULL DEFAULT 0,
  approved_video TINYINT(1) NOT NULL DEFAULT 0,
  approved_by_user_id INT NULL,
  approved_at DATETIME NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_learning_class_session_hand_raises_session (session_id, status, created_at),
  CONSTRAINT fk_learning_class_session_hand_raises_session
    FOREIGN KEY (session_id) REFERENCES learning_class_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_class_session_hand_raises_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_class_session_hand_raises_approved_by
    FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_class_session_activity (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  user_id INT NULL,
  participant_identity VARCHAR(128) NOT NULL,
  activity_type ENUM('chat','poll','poll_vote','question','answer','hand_raise','slide_change','document_change','system') NOT NULL,
  payload_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_learning_class_session_activity_session (session_id, created_at),
  CONSTRAINT fk_learning_class_session_activity_session
    FOREIGN KEY (session_id) REFERENCES learning_class_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_class_session_activity_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
