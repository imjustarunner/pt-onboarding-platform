-- 735_referral_directory_categories.sql
-- Phase 1 of the Referral Directory feature: addable categories per agency.
--
-- A referral directory entry (migration 736) belongs to exactly one category.
-- Categories are agency-scoped, free-form (admins add new ones at will), and
-- ordered via order_index for display. Modeled after user_info_categories
-- (migration 134), with a small set of seeded defaults so every agency has
-- meaningful groupings out-of-the-box without a manual setup step.

CREATE TABLE IF NOT EXISTS referral_directory_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_by_user_id INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_agency_slug (agency_id, slug),
  INDEX idx_agency (agency_id),
  INDEX idx_active_order (agency_id, is_active, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
