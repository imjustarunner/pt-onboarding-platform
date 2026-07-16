-- Migration 950: Gear & inventory catalog, stock, unique assets, assignments

CREATE TABLE IF NOT EXISTS gear_item_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'general'
    COMMENT 'general | apparel | electronics | keys_access | vehicle | other',
  tracking_mode ENUM('SIZED_STOCK', 'UNIQUE_ASSET') NOT NULL DEFAULT 'SIZED_STOCK',
  size_options_json JSON NULL
    COMMENT 'Array of size labels for SIZED_STOCK, e.g. ["XS","S","M","L","XL"]',
  lifecycle_item_key VARCHAR(64) NULL
    COMMENT 'Optional lifecycle checklist item_key to auto-complete on issue',
  low_stock_threshold INT NOT NULL DEFAULT 2,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gear_types_agency (agency_id, is_active),
  CONSTRAINT fk_gear_types_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gear_stock_levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  gear_item_type_id INT NOT NULL,
  size_label VARCHAR(32) NOT NULL DEFAULT '',
  quantity_on_hand INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gear_stock_type_size (gear_item_type_id, size_label),
  INDEX idx_gear_stock_agency (agency_id),
  CONSTRAINT fk_gear_stock_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_gear_stock_type FOREIGN KEY (gear_item_type_id) REFERENCES gear_item_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gear_unique_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  gear_item_type_id INT NOT NULL,
  asset_code VARCHAR(64) NOT NULL COMMENT 'e.g. CART-4',
  status ENUM('AVAILABLE', 'ISSUED', 'RETIRED') NOT NULL DEFAULT 'AVAILABLE',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gear_asset_agency_code (agency_id, asset_code),
  INDEX idx_gear_assets_type_status (gear_item_type_id, status),
  CONSTRAINT fk_gear_assets_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_gear_assets_type FOREIGN KEY (gear_item_type_id) REFERENCES gear_item_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gear_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  gear_item_type_id INT NOT NULL,
  size_label VARCHAR(32) NULL,
  unique_asset_id INT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issued_by_user_id INT NULL,
  returned_at TIMESTAMP NULL,
  returned_by_user_id INT NULL,
  notes TEXT NULL,
  INDEX idx_gear_assign_user_active (user_id, returned_at),
  INDEX idx_gear_assign_agency (agency_id, returned_at),
  INDEX idx_gear_assign_asset (unique_asset_id),
  CONSTRAINT fk_gear_assign_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_gear_assign_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_gear_assign_type FOREIGN KEY (gear_item_type_id) REFERENCES gear_item_types(id) ON DELETE CASCADE,
  CONSTRAINT fk_gear_assign_asset FOREIGN KEY (unique_asset_id) REFERENCES gear_unique_assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_gear_assign_issued_by FOREIGN KEY (issued_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_gear_assign_returned_by FOREIGN KEY (returned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gear_stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  gear_item_type_id INT NOT NULL,
  size_label VARCHAR(32) NULL,
  unique_asset_id INT NULL,
  user_id INT NULL COMMENT 'Person gear was issued to / returned from',
  assignment_id INT NULL,
  movement_type ENUM('ISSUE', 'RETURN', 'ADJUST', 'CREATE_ASSET', 'RETIRE_ASSET') NOT NULL,
  quantity_delta INT NOT NULL DEFAULT 0 COMMENT 'Change to on-hand for sized stock; 0 for unique assets',
  reason VARCHAR(255) NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gear_movements_agency_created (agency_id, created_at),
  CONSTRAINT fk_gear_movements_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_gear_movements_type FOREIGN KEY (gear_item_type_id) REFERENCES gear_item_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_gear_preferences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  preferences_json JSON NOT NULL COMMENT 'e.g. {"shirt":"M","hoodie":"L","pants":"32"}',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by_user_id INT NULL,
  UNIQUE KEY uq_user_gear_prefs (agency_id, user_id),
  CONSTRAINT fk_user_gear_prefs_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_gear_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
