-- Business enquiries are separate from clinical/client intake and tenant records.
CREATE TABLE IF NOT EXISTS business_onboarding_requests (
  id CHAR(36) PRIMARY KEY,
  submission_hash CHAR(64) NOT NULL,
  private_payload MEDIUMBLOB NOT NULL,
  private_iv VARCHAR(64) NOT NULL,
  private_tag VARCHAR(64) NOT NULL,
  private_key_id VARCHAR(50) NOT NULL,
  status ENUM('submitted','approved','activated','declined') NOT NULL DEFAULT 'submitted',
  approved_slug VARCHAR(100) NULL,
  invite_hash CHAR(64) NULL,
  invite_expires_at DATETIME NULL,
  reviewed_by INT NULL,
  agency_id INT NULL,
  owner_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_business_invite (invite_hash),
  INDEX ix_business_status (status, created_at),
  FOREIGN KEY (reviewed_by) REFERENCES users(id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS business_onboarding_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  request_id CHAR(36) NOT NULL,
  action VARCHAR(40) NOT NULL,
  actor_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES business_onboarding_requests(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
INSERT INTO public_marketing_pages (slug,title,page_type,hero_title,hero_subtitle,hero_image_url,branding_json,seo_json)
SELECT 'ptco','Plot Twist Co.','marketing_hub','Build. Manage. Scale. Your Next Chapter.',
  'Plot Twist Co. helps service-based businesses — especially mental health agencies — go from idea to impact with expert support and our management app, Plot Twist HQ.',
  '/assets/ptco/home-hero.webp',
  JSON_OBJECT('landingTemplate','ptco','siteName','Plot Twist Co.','logoUrl','/assets/ptco/logo-flat.webp'),
  JSON_OBJECT('title','Plot Twist Co. | Your Next Chapter','description','Expert support and Plot Twist HQ for service-based businesses. Start your next chapter.')
WHERE NOT EXISTS (SELECT 1 FROM public_marketing_pages WHERE slug='ptco');
