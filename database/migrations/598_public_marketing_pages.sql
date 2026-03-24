-- Public marketing hubs: multi-source registratable events + hub branding (superadmin-managed).

CREATE TABLE IF NOT EXISTS public_marketing_pages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(191) NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  page_type VARCHAR(64) NOT NULL DEFAULT 'event_hub',
  hero_title VARCHAR(512) NULL DEFAULT NULL,
  hero_subtitle TEXT NULL,
  hero_image_url VARCHAR(1024) NULL DEFAULT NULL,
  branding_json JSON NULL,
  seo_json JSON NULL,
  metrics_profile VARCHAR(64) NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_public_marketing_pages_slug (slug),
  INDEX idx_public_marketing_pages_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS public_marketing_page_sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  page_id INT NOT NULL,
  source_type ENUM('agency', 'organization') NOT NULL DEFAULT 'agency',
  source_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pmp_sources_page FOREIGN KEY (page_id) REFERENCES public_marketing_pages(id) ON DELETE CASCADE,
  CONSTRAINT fk_pmp_sources_agency FOREIGN KEY (source_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_pmp_page_source (page_id, source_type, source_id),
  INDEX idx_pmp_sources_page_active (page_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
