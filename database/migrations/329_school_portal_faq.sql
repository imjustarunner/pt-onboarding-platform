-- School Portal FAQ (agency-scoped) + configurable FAQ card icon.

-- 1) Icon columns (optional) for School Portal FAQ card.
ALTER TABLE agencies
  ADD COLUMN school_portal_faq_icon_id INT NULL;

ALTER TABLE platform_branding
  ADD COLUMN school_portal_faq_icon_id INT NULL;

-- 2) Optional AI summary for closed/answered support tickets (best-effort, no PHI should be included)
ALTER TABLE support_tickets
  ADD COLUMN ai_summary TEXT NULL;

-- 3) FAQ table (agency-scoped; never includes client identifiers).
CREATE TABLE IF NOT EXISTS school_portal_faqs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  subject VARCHAR(120) NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending', -- pending | published | archived
  ai_summary TEXT NULL,
  source_support_ticket_id INT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school_portal_faqs_agency_status (agency_id, status),
  INDEX idx_school_portal_faqs_subject (subject)
);

