-- Client date of birth for age display (e.g. coordinator master list, Skill Builders detail).
-- Populated from digital intake / guardian profile when available.

ALTER TABLE clients
  ADD COLUMN date_of_birth DATE NULL DEFAULT NULL
    COMMENT 'Student date of birth when collected (e.g. digital intake)'
    AFTER gender;
