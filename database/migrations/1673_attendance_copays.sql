-- Additive, staged only. No agency is opted in and no card is charged here.
CREATE TABLE family_copay_attendance (
  agency_id INT NOT NULL,
  clinical_session_id BIGINT NOT NULL,
  client_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  attendance ENUM('occurred','did_not_occur') NOT NULL,
  decision_source ENUM('provider','signed_note') NOT NULL,
  clinical_note_id BIGINT NULL,
  decided_by_user_id INT NOT NULL,
  decided_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  receivable_id BIGINT NULL,
  collection_status ENUM('pending','paid','review','suppressed') NOT NULL DEFAULT 'pending',
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (agency_id,clinical_session_id),
  INDEX idx_copay_attendance_pending(agency_id,collection_status),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (provider_user_id) REFERENCES users(id),
  FOREIGN KEY (receivable_id) REFERENCES family_receivables(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE family_copay_attendance_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  clinical_session_id BIGINT NOT NULL,
  actor_user_id INT NOT NULL,
  attendance ENUM('occurred','did_not_occur') NOT NULL,
  decision_source ENUM('provider','signed_note') NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_copay_attendance_history(agency_id,clinical_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE family_copay_provider_digests (
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  service_date DATE NOT NULL,
  status ENUM('sending','sent','review') NOT NULL DEFAULT 'sending',
  communication_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,provider_user_id,service_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
