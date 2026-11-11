-- Each new portal conversation has one immutable, versioned audience. Changing
-- eligible family/provider membership starts a new conversation, never grants
-- access to prior private or differently addressed messages.
CREATE TABLE IF NOT EXISTS family_shared_conversations (
  thread_id INT NOT NULL PRIMARY KEY,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  service_id INT NOT NULL DEFAULT 0,
  provider_user_id INT NOT NULL,
  clinical_required TINYINT(1) NOT NULL DEFAULT 1,
  policy_version VARCHAR(40) NOT NULL,
  audience_hash CHAR(64) NOT NULL,
  audience_json JSON NOT NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_family_shared_audience (client_id,agency_id,service_id,provider_user_id,policy_version,audience_hash),
  KEY ix_family_shared_client (client_id,agency_id,thread_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
