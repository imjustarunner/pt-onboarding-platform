-- Migration 1331: job application emails should From PO@tenant (not notifications@)
-- Reply-To was already PO@ on job_applications; align From so Workspace "Send mail as"
-- for PO@ can show the correct sender. people_operations stays PO@ as well.

UPDATE email_sender_identities e
INNER JOIN agencies a ON a.id = e.agency_id
SET
  e.from_email = CASE
    WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
      THEN 'PO@nextleveluplcc.com'
    WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('itsco', 'it')
      THEN 'PO@itsco.health'
    WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('sstc', 'southsuburban')
      THEN 'PO@southsuburbantherapy.com'
    ELSE e.from_email
  END,
  e.reply_to = CASE
    WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
      THEN 'PO@nextleveluplcc.com'
    WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('itsco', 'it')
      THEN 'PO@itsco.health'
    WHEN LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('sstc', 'southsuburban')
      THEN 'PO@southsuburbantherapy.com'
    ELSE e.reply_to
  END
WHERE LOWER(e.identity_key) IN ('job_applications', 'people_operations')
  AND e.agency_id IS NOT NULL
  AND e.is_active = 1
  AND LOWER(COALESCE(a.slug, a.portal_url, '')) IN (
    'nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up',
    'itsco', 'it',
    'sstc', 'southsuburban'
  );
