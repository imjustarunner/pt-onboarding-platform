-- Migration 1073: final legacy clinician cleanup (3 remaining rows)

-- Sharon Tuttle: hiring profile marked hired but never started — archive account.
UPDATE users
SET status = 'ARCHIVED'
WHERE id = 599
  AND LOWER(COALESCE(role, '')) = 'clinician';

-- Noel Harris + Elsa Villarruel: guardian intake signups (intake_submissions.guardian_user_id).
UPDATE users
SET role = 'client_guardian'
WHERE id IN (923, 955)
  AND LOWER(COALESCE(role, '')) = 'clinician';
