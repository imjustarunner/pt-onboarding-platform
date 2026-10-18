-- Platform controls intentionally have no practice or provider override.
CREATE TABLE IF NOT EXISTS auricwell_platform_integrations (
  id TINYINT PRIMARY KEY,
  payload MEDIUMTEXT NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  updated_by CHAR(36) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auricwell_platform_integration_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id CHAR(36) NOT NULL,
  revision INT NOT NULL,
  action VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Meeting credentials stay outside chart/schedule records and general JSON responses.
CREATE TABLE IF NOT EXISTS auricwell_appointment_video (
  practice_id CHAR(36) NOT NULL,
  appointment_id CHAR(36) NOT NULL,
  provider VARCHAR(24) NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  guest_token_hash CHAR(64) NULL,
  retired_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (practice_id, appointment_id, provider),
  UNIQUE KEY aw_video_guest_token (guest_token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auricwell_session_deliveries (
  id CHAR(36) PRIMARY KEY,
  practice_id CHAR(36) NOT NULL,
  appointment_id CHAR(36) NOT NULL,
  delivery_key CHAR(64) NOT NULL,
  channel VARCHAR(10) NOT NULL,
  status VARCHAR(24) NOT NULL,
  payload MEDIUMTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY aw_session_delivery (practice_id, appointment_id, delivery_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
