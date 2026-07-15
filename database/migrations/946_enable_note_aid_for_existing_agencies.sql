-- Migration 946: Enable Note Aid / Clinical Note Generator for all existing agencies
-- Admins can still turn these off later in Company Profile.

UPDATE agencies
SET feature_flags = JSON_SET(
  COALESCE(feature_flags, JSON_OBJECT()),
  '$.noteAidEnabled', CAST('true' AS JSON),
  '$.clinicalNoteGeneratorEnabled', CAST('true' AS JSON)
);
