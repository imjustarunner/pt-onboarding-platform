-- Migration: Backfill users.provider_school_info_blurb from existing provider_school_profiles
-- Purpose: For providers who already have a blurb for one or more schools, copy one into the
--          new user-level field so it applies to all schools. Uses the most recently updated blurb
--          when a provider has blurbs for multiple schools.

UPDATE users u
SET u.provider_school_info_blurb = (
  SELECT psp.school_info_blurb
  FROM provider_school_profiles psp
  WHERE psp.provider_user_id = u.id
    AND psp.school_info_blurb IS NOT NULL
    AND TRIM(psp.school_info_blurb) != ''
  ORDER BY psp.updated_at DESC, psp.school_organization_id ASC
  LIMIT 1
)
WHERE (u.provider_school_info_blurb IS NULL OR TRIM(COALESCE(u.provider_school_info_blurb, '')) = '')
  AND EXISTS (
    SELECT 1 FROM provider_school_profiles psp2
    WHERE psp2.provider_user_id = u.id
      AND psp2.school_info_blurb IS NOT NULL
      AND TRIM(psp2.school_info_blurb) != ''
  );
