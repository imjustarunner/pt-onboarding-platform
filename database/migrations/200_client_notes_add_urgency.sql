-- Migration: Add urgency to client notes
-- Description: Supports Low/Medium/High urgency tags on client comment threads.

ALTER TABLE client_notes
  ADD COLUMN urgency VARCHAR(16) NOT NULL DEFAULT 'low' AFTER category,
  ADD INDEX idx_client_notes_urgency (urgency);

