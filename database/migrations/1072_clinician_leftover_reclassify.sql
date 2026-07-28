-- Migration 1072: second-pass cleanup for leftover legacy clinician rows

-- Orton school contacts → school_staff
UPDATE users
SET role = 'school_staff'
WHERE id IN (687, 688)
  AND LOWER(COALESCE(role, '')) = 'clinician';

-- Orphaned SSTC placeholder merges → athlete
UPDATE users
SET role = 'athlete'
WHERE id IN (831, 874, 881)
  AND LOWER(COALESCE(role, '')) = 'clinician';

-- Test / junk accounts → archive (keep clinician role until fully reviewed)
UPDATE users
SET status = 'ARCHIVED'
WHERE id IN (534, 537, 803)
  AND LOWER(COALESCE(role, '')) = 'clinician';

-- Guardian accounts
UPDATE users
SET role = 'client_guardian'
WHERE id IN (577, 987)
  AND LOWER(COALESCE(role, '')) = 'clinician';

-- Clinical test account + obvious fake-name junk → provider
UPDATE users
SET role = 'provider'
WHERE id IN (602, 801, 827, 828)
  AND LOWER(COALESCE(role, '')) = 'clinician';

-- Former applicants / archived never-hired → provider
UPDATE users
SET role = 'provider'
WHERE LOWER(COALESCE(role, '')) = 'clinician'
  AND UPPER(COALESCE(status, '')) = 'ARCHIVED';
