-- Event opt-outs supplement carrier/campaign STOP. No existing consent is changed.
CREATE TABLE IF NOT EXISTS company_event_sms_topics (
  code BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_sms_topic (company_event_id),
  KEY idx_event_sms_topic_agency (agency_id),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=112 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_event_sms_preferences (
  company_event_id INT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  muted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider_message_id VARCHAR(100) NULL,
  PRIMARY KEY (company_event_id, phone),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_event_sms_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  user_id INT NULL,
  phone VARCHAR(20) NOT NULL,
  from_number VARCHAR(20) NOT NULL,
  campaign_id VARCHAR(64) NOT NULL,
  campaign_number TINYINT NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  dispatch_type VARCHAR(64) NOT NULL,
  batch_id VARCHAR(80) NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  status_reason VARCHAR(255) NULL,
  provider_message_id VARCHAR(100) NULL,
  response_key VARCHAR(32) NULL,
  responded_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_event_sms_delivery_event (company_event_id, created_at),
  KEY idx_event_sms_delivery_reply (agency_id, phone, from_number, created_at),
  KEY idx_event_sms_delivery_provider (provider_message_id),
  UNIQUE KEY uq_event_sms_delivery_batch (company_event_id, batch_id, phone),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Event checkbox consent is retained separately from reviewed campaign enrollment.
CREATE TABLE IF NOT EXISTS company_event_sms_enrollments (
  company_event_id INT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  guest_registration_id INT NULL,
  campaign_number TINYINT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending_review',
  evidence_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_event_id, phone),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Public self-service signatures have no authenticated employee creator.
ALTER TABLE sms_consent_requests MODIFY COLUMN created_by_user_id INT NULL;
