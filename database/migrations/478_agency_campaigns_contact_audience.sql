-- Add contacts audience mode to agency campaigns for mass-communications targeting

ALTER TABLE agency_campaigns
  MODIFY COLUMN audience_mode ENUM('all', 'selected', 'contacts') DEFAULT 'all',
  ADD COLUMN audience_target JSON NULL COMMENT 'For audience_mode=contacts: { schoolId?, providerId?, clientId? }';

CREATE TABLE IF NOT EXISTS agency_campaign_contact_deliveries (
  id INT NOT NULL AUTO_INCREMENT,
  campaign_id INT NOT NULL,
  contact_id INT NOT NULL,
  phone_number VARCHAR(32) NULL,
  delivery_status ENUM('pending', 'sent', 'failed', 'skipped') DEFAULT 'pending',
  status_reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_contact (campaign_id, contact_id),
  KEY idx_campaign_contact_deliveries_campaign (campaign_id),
  KEY idx_campaign_contact_deliveries_contact (contact_id),
  CONSTRAINT fk_campaign_contact_deliveries_campaign FOREIGN KEY (campaign_id) REFERENCES agency_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_campaign_contact_deliveries_contact FOREIGN KEY (contact_id) REFERENCES agency_contacts(id) ON DELETE CASCADE
);
