-- Reserve public six-digit client numbers. Existing identifiers and primary keys remain stable.
CREATE TABLE IF NOT EXISTS client_identifier_sequences (
  sequence_key VARCHAR(40) NOT NULL PRIMARY KEY,
  last_value INT UNSIGNED NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO client_identifier_sequences (sequence_key,last_value)
VALUES ('client',99999)
ON DUPLICATE KEY UPDATE sequence_key=VALUES(sequence_key);
