-- NULL uses the payer-family default, including for credentials created by imports.
-- Explicit 0/1 records the credentialer's decision without changing own credentialing.
ALTER TABLE user_insurance_credentialing
  ADD COLUMN allow_supervisee_billing TINYINT(1) NULL DEFAULT NULL;
