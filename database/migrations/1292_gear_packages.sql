-- Migration 1292: Gear packages (kits) — defaults, line items, issue audit
-- Reusable kits like "New Provider Package" that issue multiple catalog items at once.

CREATE TABLE IF NOT EXISTS gear_packages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = shared across tenant agencies the actor can access',
  name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  slug VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  package_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'new_hire'
    COMMENT 'new_hire | provider_start | welcome | custom',
  description TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Default package for package_type',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gear_packages_agency (agency_id, is_active),
  INDEX idx_gear_packages_type (package_type, is_default),
  CONSTRAINT fk_gear_packages_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
  CONSTRAINT fk_gear_packages_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gear_package_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  package_id INT NOT NULL,
  catalog_item_id INT NOT NULL,
  default_quantity INT NOT NULL DEFAULT 1,
  size_mode ENUM('FROM_PREFS', 'FIXED', 'CHOOSE_AT_ISSUE', 'NONE') NOT NULL DEFAULT 'FROM_PREFS',
  fixed_size_label VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  fixed_gender VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  pref_key VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'shirt | hoodie | pants | other — maps to user_gear_preferences',
  sort_order INT NOT NULL DEFAULT 0,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gear_package_items_pkg (package_id, sort_order),
  INDEX idx_gear_package_items_catalog (catalog_item_id),
  CONSTRAINT fk_gear_package_items_pkg FOREIGN KEY (package_id) REFERENCES gear_packages(id) ON DELETE CASCADE,
  CONSTRAINT fk_gear_package_items_catalog FOREIGN KEY (catalog_item_id) REFERENCES gear_catalog_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gear_package_issues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  package_id INT NOT NULL,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  issued_by_user_id INT NULL,
  status ENUM('pending', 'partial', 'complete', 'failed') NOT NULL DEFAULT 'pending',
  notes TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gear_package_issues_pkg (package_id, issued_at),
  INDEX idx_gear_package_issues_user (agency_id, user_id),
  CONSTRAINT fk_gear_package_issues_pkg FOREIGN KEY (package_id) REFERENCES gear_packages(id) ON DELETE CASCADE,
  CONSTRAINT fk_gear_package_issues_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_gear_package_issues_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_gear_package_issues_by FOREIGN KEY (issued_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gear_package_issue_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  package_issue_id INT NOT NULL,
  package_item_id INT NULL,
  catalog_item_id INT NULL,
  gear_assignment_id INT NULL,
  size_label VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  gender VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  quantity INT NOT NULL DEFAULT 1,
  status ENUM('ok', 'skipped', 'failed') NOT NULL DEFAULT 'ok',
  error_message VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  INDEX idx_gear_package_issue_lines_issue (package_issue_id),
  CONSTRAINT fk_gear_package_issue_lines_issue FOREIGN KEY (package_issue_id) REFERENCES gear_package_issues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
