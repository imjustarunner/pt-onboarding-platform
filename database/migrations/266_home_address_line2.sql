/*
Add optional Apt/Suite/Unit line for user home mailing addresses.

Note: Use block comments because the migration runner drops `--`-prefixed statements.
*/

ALTER TABLE users
  ADD COLUMN home_address_line2 VARCHAR(255) NULL AFTER home_street_address;

