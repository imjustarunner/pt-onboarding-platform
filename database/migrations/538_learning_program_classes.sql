-- Learning Program Classes
-- Classes are scoped to learning organizations (agencies.organization_type = 'learning')
-- and can have provider/client memberships, class-scoped resources, and class intake links.

CREATE TABLE IF NOT EXISTS learning_program_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  class_name VARCHAR(255) NOT NULL,
  class_code VARCHAR(100) NULL,
  description TEXT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  enrollment_opens_at DATETIME NULL,
  enrollment_closes_at DATETIME NULL,
  status ENUM('draft', 'active', 'closed', 'archived') NOT NULL DEFAULT 'draft',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  allow_late_join TINYINT(1) NOT NULL DEFAULT 0,
  max_clients INT NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_learning_program_classes_org (organization_id),
  INDEX idx_learning_program_classes_status (status, is_active),
  INDEX idx_learning_program_classes_time (starts_at, ends_at),
  CONSTRAINT fk_learning_program_classes_org
    FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_program_classes_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS learning_class_client_memberships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  client_id INT NOT NULL,
  membership_status ENUM('invited', 'active', 'removed', 'completed') NOT NULL DEFAULT 'active',
  joined_at DATETIME NULL,
  removed_at DATETIME NULL,
  role_label VARCHAR(64) NULL,
  notes VARCHAR(255) NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_learning_class_client (learning_class_id, client_id),
  INDEX idx_learning_class_client_status (learning_class_id, membership_status),
  CONSTRAINT fk_learning_class_client_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_class_client_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_class_client_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS learning_class_provider_memberships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  membership_status ENUM('invited', 'active', 'removed', 'completed') NOT NULL DEFAULT 'active',
  joined_at DATETIME NULL,
  removed_at DATETIME NULL,
  role_label VARCHAR(64) NULL,
  notes VARCHAR(255) NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_learning_class_provider (learning_class_id, provider_user_id),
  INDEX idx_learning_class_provider_status (learning_class_id, membership_status),
  CONSTRAINT fk_learning_class_provider_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_class_provider_user
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_class_provider_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS learning_class_resources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  resource_type ENUM('document', 'video', 'link', 'note') NOT NULL DEFAULT 'document',
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  file_path VARCHAR(1024) NULL,
  external_url VARCHAR(1024) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  visible_to_clients TINYINT(1) NOT NULL DEFAULT 1,
  visible_to_providers TINYINT(1) NOT NULL DEFAULT 1,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_learning_class_resources_class (learning_class_id, sort_order, id),
  CONSTRAINT fk_learning_class_resources_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_learning_class_resources_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Intake links: add class scope support.
ALTER TABLE intake_links
  MODIFY COLUMN scope_type ENUM('agency', 'school', 'program', 'learning_class') NOT NULL DEFAULT 'agency';

ALTER TABLE intake_links
  ADD COLUMN learning_class_id INT NULL AFTER program_id;

ALTER TABLE intake_links
  ADD INDEX idx_intake_learning_class (learning_class_id);

ALTER TABLE intake_links
  ADD CONSTRAINT fk_intake_links_learning_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE SET NULL;
