-- First-party public website engagement. No user IDs, IP addresses, referrer URLs, or form values.
CREATE TABLE IF NOT EXISTS public_website_analytics_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 page_id INT NOT NULL,
 event_id CHAR(36) CHARACTER SET ascii NOT NULL,
 visitor_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 page_path VARCHAR(255) NOT NULL,
 target_key VARCHAR(240) CHARACTER SET ascii NOT NULL,
 target_label VARCHAR(120) NOT NULL,
 event_kind ENUM('page_view','section_view','click','profile_open','filter_use','search','scroll_depth') NOT NULL,
 device_type ENUM('mobile','tablet','desktop') NOT NULL,
 language_code ENUM('en','es','other') NOT NULL,
 source_channel ENUM('direct','internal','search','social','referral') NOT NULL,
 occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_website_event (page_id,event_id),
 INDEX idx_website_date (page_id,occurred_at),
 INDEX idx_website_page (page_id,page_path,occurred_at),
 INDEX idx_website_retention (occurred_at),
 FOREIGN KEY (page_id) REFERENCES public_marketing_pages(id) ON DELETE CASCADE
);
