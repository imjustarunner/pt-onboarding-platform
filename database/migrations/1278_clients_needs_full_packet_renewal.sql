-- Migration 1278: Flag clients who need a full enrollment packet after unarchive
ALTER TABLE clients
  ADD COLUMN needs_full_packet_renewal TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Set on unarchive; cleared when Client Renewal full packet completes';

CREATE INDEX idx_clients_agency_needs_full_packet
  ON clients (agency_id, needs_full_packet_renewal);
