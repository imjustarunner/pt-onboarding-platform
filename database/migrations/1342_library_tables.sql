-- Migration 1342: Organization Library — tenant resource hub (files, links, Google Docs)

CREATE TABLE IF NOT EXISTS library_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  slug VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  description TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  archived_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_library_categories_agency_slug (agency_id, slug),
  KEY idx_library_categories_agency (agency_id),
  CONSTRAINT fk_library_categories_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS library_folders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  parent_folder_id INT UNSIGNED NULL DEFAULT NULL,
  name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  description TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  owner_user_id INT NULL DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  archived_at DATETIME NULL DEFAULT NULL,
  created_by INT NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_library_folders_agency (agency_id),
  KEY idx_library_folders_parent (parent_folder_id),
  CONSTRAINT fk_library_folders_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_library_folders_parent FOREIGN KEY (parent_folder_id) REFERENCES library_folders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS library_resources (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  organization_id INT NULL DEFAULT NULL,
  name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  description TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  resource_type ENUM('file', 'link', 'google_doc', 'folder') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'file',
  file_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  mime_type VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  original_filename VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  file_path VARCHAR(1024) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  external_url VARCHAR(2048) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  file_size_bytes BIGINT NULL DEFAULT NULL,
  category_id INT UNSIGNED NULL DEFAULT NULL,
  folder_id INT UNSIGNED NULL DEFAULT NULL,
  owner_user_id INT NULL DEFAULT NULL,
  visibility ENUM('internal', 'client_shareable', 'publicly_shareable') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'internal',
  audience_json JSON NULL,
  featured TINYINT(1) NOT NULL DEFAULT 0,
  client_shareable TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('current', 'review_soon', 'needs_review', 'archived') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'current',
  review_date DATE NULL DEFAULT NULL,
  version INT NOT NULL DEFAULT 1,
  created_by INT NULL DEFAULT NULL,
  updated_by INT NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at DATETIME NULL DEFAULT NULL,
  KEY idx_library_resources_agency (agency_id),
  KEY idx_library_resources_category (category_id),
  KEY idx_library_resources_folder (folder_id),
  KEY idx_library_resources_featured (agency_id, featured),
  KEY idx_library_resources_updated (agency_id, updated_at),
  FULLTEXT KEY ft_library_resources_search (name, description, original_filename),
  CONSTRAINT fk_library_resources_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_library_resources_category FOREIGN KEY (category_id) REFERENCES library_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_library_resources_folder FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS library_tags (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_library_tags_agency_name (agency_id, name),
  KEY idx_library_tags_agency (agency_id),
  CONSTRAINT fk_library_tags_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS library_resource_tags (
  resource_id INT UNSIGNED NOT NULL,
  tag_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (resource_id, tag_id),
  KEY idx_library_resource_tags_tag (tag_id),
  CONSTRAINT fk_library_resource_tags_resource FOREIGN KEY (resource_id) REFERENCES library_resources(id) ON DELETE CASCADE,
  CONSTRAINT fk_library_resource_tags_tag FOREIGN KEY (tag_id) REFERENCES library_tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS library_favorites (
  user_id INT NOT NULL,
  resource_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, resource_id),
  KEY idx_library_favorites_resource (resource_id),
  CONSTRAINT fk_library_favorites_resource FOREIGN KEY (resource_id) REFERENCES library_resources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS library_views (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  resource_id INT UNSIGNED NOT NULL,
  viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_library_views_user (user_id, viewed_at),
  KEY idx_library_views_resource (resource_id),
  CONSTRAINT fk_library_views_resource FOREIGN KEY (resource_id) REFERENCES library_resources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS library_permissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  resource_id INT UNSIGNED NULL DEFAULT NULL,
  folder_id INT UNSIGNED NULL DEFAULT NULL,
  grantee_type ENUM('role', 'user') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'role',
  grantee_value VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  permission ENUM('view', 'edit', 'manage') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'view',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_library_permissions_agency (agency_id),
  KEY idx_library_permissions_resource (resource_id),
  CONSTRAINT fk_library_permissions_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_library_permissions_resource FOREIGN KEY (resource_id) REFERENCES library_resources(id) ON DELETE CASCADE,
  CONSTRAINT fk_library_permissions_folder FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
