-- Immutable, versioned evidence of the first-send communication notice.
-- Acknowledging this notice grants no clinical, scheduling or relationship access.
CREATE TABLE IF NOT EXISTS secure_family_communication_acknowledgments (
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  policy_version VARCHAR(40) NOT NULL,
  acknowledged_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ip_hash CHAR(64) NULL,
  user_agent_hash CHAR(64) NULL,
  PRIMARY KEY (user_id, agency_id, policy_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
