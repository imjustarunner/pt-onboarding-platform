CREATE TABLE IF NOT EXISTS agency_campaigns (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  created_by_user_id INT NULL,
  title VARCHAR(255) NOT NULL,
  question TEXT NOT NULL,
  status ENUM('draft', 'sent', 'closed') DEFAULT 'draft',
  audience_mode ENUM('all', 'selected') DEFAULT 'all',
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  response_options JSON NULL,
  short_code VARCHAR(20) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_agency_campaigns_agency (agency_id),
  KEY idx_agency_campaigns_status (status),
  CONSTRAINT fk_agency_campaigns_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_agency_campaigns_created_by_user_id FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agency_campaign_recipients (
  id INT NOT NULL AUTO_INCREMENT,
  campaign_id INT NOT NULL,
  user_id INT NOT NULL,
  phone_number VARCHAR(32) NULL,
  delivery_status ENUM('pending', 'sent', 'failed', 'skipped') DEFAULT 'pending',
  status_reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_recipient (campaign_id, user_id),
  KEY idx_campaign_recipients_campaign (campaign_id),
  KEY idx_campaign_recipients_user (user_id),
  CONSTRAINT fk_campaign_recipients_campaign_id FOREIGN KEY (campaign_id) REFERENCES agency_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_campaign_recipients_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agency_campaign_responses (
  id INT NOT NULL AUTO_INCREMENT,
  campaign_id INT NOT NULL,
  user_id INT NOT NULL,
  response_key VARCHAR(20) NULL,
  response_label VARCHAR(50) NULL,
  response_body TEXT NULL,
  from_number VARCHAR(32) NULL,
  received_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_response (campaign_id, user_id),
  KEY idx_campaign_responses_campaign (campaign_id),
  KEY idx_campaign_responses_user (user_id),
  CONSTRAINT fk_campaign_responses_campaign_id FOREIGN KEY (campaign_id) REFERENCES agency_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_campaign_responses_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agency_campaign_opt_outs (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  opted_out_at DATETIME NULL,
  source VARCHAR(50) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_opt_out (agency_id, user_id),
  KEY idx_campaign_opt_outs_agency (agency_id),
  KEY idx_campaign_opt_outs_user (user_id),
  CONSTRAINT fk_campaign_opt_outs_agency_id FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_campaign_opt_outs_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
