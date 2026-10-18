-- Clinical messaging is disabled until a platform operator verifies the connection.
-- Bodies, contact details, preferences and provider responses use application encryption.
CREATE TABLE IF NOT EXISTS auricwell_sms_phone_state (
  phone_key CHAR(64) PRIMARY KEY,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  command_at BIGINT NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE TABLE IF NOT EXISTS auricwell_sms_contacts (
  id CHAR(36) PRIMARY KEY,
  practice_id CHAR(36) NOT NULL,
  phone_key CHAR(64) NOT NULL,
  patient_id CHAR(36) NULL,
  payload LONGTEXT NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY sms_contact_phone (practice_id,phone_key),
  KEY sms_contact_patient (practice_id,patient_id)
);
CREATE TABLE IF NOT EXISTS auricwell_sms_outbox (
  id CHAR(36) PRIMARY KEY,
  practice_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  thread_id CHAR(36) NULL,
  dedupe_key CHAR(64) NOT NULL,
  category VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  provider_id VARCHAR(150) NULL,
  payload LONGTEXT NOT NULL,
  due_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY sms_outbox_dedupe (practice_id,dedupe_key),
  KEY sms_outbox_worker (status,due_at),
  KEY sms_outbox_provider (provider_id),
  KEY sms_outbox_thread (practice_id,thread_id)
);
CREATE TABLE IF NOT EXISTS auricwell_sms_events (
  event_key CHAR(64) PRIMARY KEY,
  payload LONGTEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY sms_event_worker (status,created_at)
);
-- Reserve case-insensitive conversation codes without storing names/initials in
-- a plaintext index. Old codes are never reassigned to a different conversation.
CREATE TABLE IF NOT EXISTS auricwell_sms_thread_tags (
  practice_id CHAR(36) NOT NULL,
  tag_key CHAR(64) NOT NULL,
  thread_id CHAR(36) NOT NULL,
  PRIMARY KEY (practice_id,tag_key),
  UNIQUE KEY sms_tag_thread (thread_id)
);
