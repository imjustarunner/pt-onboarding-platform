-- Migration: Store referral packet object path on clients
-- Purpose: allow admin-side viewing with PHI access logging

ALTER TABLE clients
  ADD COLUMN referral_packet_path VARCHAR(512) NULL AFTER document_status,
  ADD INDEX idx_clients_referral_packet_path (referral_packet_path);

