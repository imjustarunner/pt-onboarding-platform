-- Migration: extend user_communications with client_id, open tracking, and tracking token
-- Description:
--   * `client_id` ties an outbound communication to a specific client (typically when an
--     email is sent to the client's guardian "regarding" that client). Nullable for
--     non-client-scoped messages (e.g., staff invitations).
--   * `opened_at` / `first_clicked_at` capture inbound tracking events (1x1 pixel + future
--     link redirects). They stay NULL when no event has been observed.
--   * `tracking_token` is a random URL-safe token embedded in outgoing HTML so the
--     open-tracking endpoint can attribute hits back to a row without leaking primary keys.

ALTER TABLE user_communications
  ADD COLUMN client_id INT NULL COMMENT 'Client this communication concerns (e.g., guardian email about client). NULL when not client-scoped.' AFTER user_id,
  ADD COLUMN opened_at TIMESTAMP NULL COMMENT 'First time the recipient opened this email (tracking pixel hit).' AFTER delivered_at,
  ADD COLUMN first_clicked_at TIMESTAMP NULL COMMENT 'First time the recipient clicked a tracked link (reserved for future use).' AFTER opened_at,
  ADD COLUMN tracking_token VARCHAR(64) NULL COMMENT 'URL-safe random token used by /api/email/track-open/:token to attribute opens.' AFTER first_clicked_at;

-- Relax NOT NULL constraints so system-originated emails (no acting admin, no resolvable
-- recipient user account) can still be logged. The model layer enforces minimum required
-- fields per channel.
ALTER TABLE user_communications
  MODIFY COLUMN user_id INT NULL COMMENT 'Recipient user when known (NULL for sends to email/phone with no user record yet).',
  MODIFY COLUMN generated_by_user_id INT NULL COMMENT 'Admin/user who triggered the send. NULL for system-generated messages.';

ALTER TABLE user_communications
  ADD CONSTRAINT fk_user_communications_client
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX idx_user_communications_client_id ON user_communications(client_id);
CREATE UNIQUE INDEX idx_user_communications_tracking_token ON user_communications(tracking_token);
