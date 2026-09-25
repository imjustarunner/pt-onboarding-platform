-- Post-signature entries retain their own author attestation and current entry time.
-- Historical entries remain unclassified; do not invent signatures or backdate them.
ALTER TABLE clinical_note_addenda
  ADD COLUMN entry_kind ENUM('addendum', 'correction', 'late_entry') NULL,
  ADD COLUMN entry_reason TEXT NULL,
  ADD COLUMN author_signed_at DATETIME(6) NULL;
