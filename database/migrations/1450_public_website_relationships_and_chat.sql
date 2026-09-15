CREATE TABLE IF NOT EXISTS public_website_support_sites (
 slug VARCHAR(80) PRIMARY KEY,
 name VARCHAR(200) NOT NULL,
 website_url VARCHAR(500) NOT NULL,
 support_agency_id INT NOT NULL,
 relationship_type ENUM('associate','affiliate','subsidiary') NULL,
 industries_json JSON NULL,
 logo_url VARCHAR(1000) NULL,
 accent_color VARCHAR(7) NOT NULL DEFAULT '#175c4f',
 local_region VARCHAR(8) NOT NULL DEFAULT 'USCO',
 coming_soon TINYINT(1) NOT NULL DEFAULT 0,
 chat_enabled TINYINT(1) NOT NULL DEFAULT 1,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE public_website_support_sites CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT IGNORE INTO public_website_support_sites
 (slug,name,website_url,support_agency_id,relationship_type,industries_json,accent_color,coming_soon)
VALUES
 ('ptco','Plot Twist Co.','https://plottwistco.com',1,NULL,JSON_ARRAY('Business management'),'#a22235',0),
 ('itsco','ITSCO','https://www.itsco.health',2,'associate',JSON_ARRAY('Healthcare · Mental health'),'#175c4f',0),
 ('nlu','Next Level Up','https://nextleveluplcc.com',6,'subsidiary',JSON_ARRAY('Healthcare · Mental health','Education · Tutoring'),'#008696',0),
 ('tisi','The Inner Strength Institute','https://theinnerstrengthinstitute.com',377,'subsidiary',JSON_ARRAY('Healthcare · Mental health'),'#647146',0),
 ('rise','Rise Revive','https://risereviveco.com',1,'subsidiary',JSON_ARRAY('Healthcare · Mental health','Life coaching'),'#b16938',0),
 ('mh4kidz','MH4Kidz','https://mh4kidz.org',1,'associate',JSON_ARRAY('Healthcare · Mental health'),'#426db0',0),
 ('range','Mental Range Collective','https://mentalrange.org',1,'associate',JSON_ARRAY('Mental health professional network'),'#655388',0),
 ('kimi','Kimi Cain Life Coaching','https://kimicain.com',432,'associate',JSON_ARRAY('Life coaching'),'#52694d',0),
 ('rmmentors','Rocky Mountain Mentors','https://rmmentors.com',1,'associate',JSON_ARRAY('Mentoring'),'#726244',1),
 ('sstc','Summit Stats Team Challenge','https://summitstatstc.com',387,'subsidiary',JSON_ARRAY(),'#29497e',1);

ALTER TABLE support_tickets ADD COLUMN source_website_slug VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;
ALTER TABLE support_tickets MODIFY COLUMN source_website_slug VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;
CREATE INDEX idx_ticket_source_website ON support_tickets (source_website_slug, created_at);
-- Recover website attribution for older website tickets without rewriting their messages or claims.
UPDATE support_tickets t JOIN agencies a ON a.id=t.agency_id
 JOIN public_website_support_sites s ON s.slug=a.slug
 SET t.source_website_slug=s.slug WHERE t.source_channel='public_web' AND t.source_website_slug IS NULL;

CREATE TABLE IF NOT EXISTS public_website_chat_sessions (
 id CHAR(36) PRIMARY KEY,
 site_slug VARCHAR(80) NOT NULL,
 token_hash CHAR(64) NOT NULL,
 ip_hash CHAR(64) NOT NULL,
 state ENUM('open','closed') NOT NULL DEFAULT 'open',
 last_seen_at DATETIME NOT NULL,
 created_at DATETIME NOT NULL,
 expires_at DATETIME NOT NULL,
 INDEX idx_webchat_site (site_slug,state,last_seen_at),
 INDEX idx_webchat_ip (ip_hash,created_at),
 FOREIGN KEY (site_slug) REFERENCES public_website_support_sites(slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS public_website_chat_messages (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 session_id CHAR(36) NOT NULL,
 sender ENUM('visitor','staff') NOT NULL,
 author_user_id INT NULL,
 client_message_id CHAR(36) NOT NULL,
 encrypted_json JSON NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY idx_webchat_dedupe (session_id,client_message_id),
 FOREIGN KEY (session_id) REFERENCES public_website_chat_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS public_website_chat_staff (
 user_id INT PRIMARY KEY,
 last_seen_at DATETIME NOT NULL,
 INDEX idx_webchat_staff_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE public_website_support_sites s JOIN public_marketing_pages p ON p.slug=s.slug
 SET s.logo_url=JSON_UNQUOTE(JSON_EXTRACT(p.branding_json,'$.logoUrl'))
 WHERE s.logo_url IS NULL AND JSON_EXTRACT(p.branding_json,'$.logoUrl') IS NOT NULL;
UPDATE public_website_support_sites SET logo_url='/assets/range/logo.svg' WHERE slug='range' AND logo_url IS NULL;
