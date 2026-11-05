-- Migration 1762: store demographics read from a signed paper packet for staff merge
ALTER TABLE clients
  ADD COLUMN paper_packet_demo_candidate_enc JSON NULL DEFAULT NULL
  COMMENT 'Encrypted demographics read from a signed paper packet';
