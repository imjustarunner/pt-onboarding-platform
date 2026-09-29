-- Presentation and future billing ownership only; no payment or invoice activation.
CREATE TABLE IF NOT EXISTS schoolcarebridge_program_config (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  operator_agency_id INT NULL,
  operator_name VARCHAR(100) NOT NULL DEFAULT 'MH4Kidz',
  revenue_recipient VARCHAR(100) NOT NULL DEFAULT 'MH4Kidz',
  invoice_issuer VARCHAR(100) NOT NULL DEFAULT 'Plot Twist Co',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO schoolcarebridge_program_config (id, operator_agency_id)
SELECT 1, (SELECT id FROM agencies WHERE slug = 'mh4kidz' AND organization_type = 'agency' LIMIT 1);

CREATE TABLE IF NOT EXISTS schoolcarebridge_routing_hints (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  destination VARCHAR(512) NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX scb_hint_expiry (expires_at)
);

INSERT INTO public_marketing_pages (slug,title,is_active,page_type,hero_title,hero_subtitle,hero_image_url,branding_json,seo_json)
SELECT 'schoolcarebridge','SchoolCareBridge',1,'marketing_hub',
 'Connecting Schools. Supporting Students.',
 'A program of MH4Kidz connecting schools and mental health agencies through one school-centered experience.',
 '/assets/mh4kidz/teamwork.webp',
 JSON_OBJECT('landingTemplate','schoolcarebridge','logoUrl','/assets/schoolcarebridge/logo.png','schoolcarebridgeWebsite',JSON_OBJECT('contactUrl','','partnerUrl','','demoUrl','')),
 JSON_OBJECT('title','SchoolCareBridge | A program of MH4Kidz','description','Connect your school with mental health agencies. Coordinate providers, enrollment, schedules, and communication in your school portal.')
WHERE NOT EXISTS (SELECT 1 FROM public_marketing_pages WHERE slug='schoolcarebridge');
