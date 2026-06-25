-- Migration 885: Digital forms (intake links) attachable to onboarding packages
-- Allows HR to attach structured data-collection forms (clinical profile,
-- marketing directory, etc.) to any onboarding package. When the package is
-- assigned, a task of type 'intake_form' is created so the candidate sees it
-- in their pre-hire portal.

CREATE TABLE onboarding_package_intake_links (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  package_id     INT NOT NULL,
  intake_link_id INT NOT NULL,
  order_index    INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pkg_intake (package_id, intake_link_id),
  INDEX idx_opil_package (package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Junction: onboarding_packages ↔ intake_links';
