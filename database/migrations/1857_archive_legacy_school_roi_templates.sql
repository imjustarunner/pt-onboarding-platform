-- Archive the superseded school-specific uploads found in the guardian picker.
-- Keep versions and signed documents. A template referenced by an active form
-- stays in the library until that reference can be retired.
UPDATE document_templates AS t
SET t.is_archived = TRUE,
    t.archived_at = CURRENT_TIMESTAMP,
    t.archived_by_agency_id = t.agency_id
WHERE COALESCE(t.is_archived, FALSE) = FALSE
  AND t.document_type <> 'school_roi'
  AND LOWER(TRIM(t.name)) COLLATE utf8mb4_unicode_ci REGEXP
      '^(ashley( elementary school)?|bear valley (ms|middle school)|broadmoor elementary( school)?|brown international academy|carver( school)?|cheyenne mountain (elementary|high)( school)?) roi( [(]?español[)]?)?$'
  AND NOT EXISTS (
    SELECT 1 FROM intake_links AS l WHERE l.is_active = 1 AND (
      JSON_CONTAINS(l.allowed_document_template_ids, CAST(t.id AS JSON))
      OR JSON_CONTAINS(l.allowed_document_template_ids, JSON_QUOTE(CAST(t.id AS CHAR)))
      OR JSON_SEARCH(l.intake_steps, 'one', CAST(t.id AS CHAR), NULL, '$[*].templateId', '$[*].template_id') IS NOT NULL
      OR JSON_CONTAINS(l.intake_steps, JSON_OBJECT('templateId', t.id))
      OR JSON_CONTAINS(l.intake_steps, JSON_OBJECT('template_id', t.id))
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM (
      SELECT intake_steps FROM agency_school_intake_masters
      UNION ALL SELECT intake_steps FROM agency_office_intake_masters
      UNION ALL SELECT intake_steps FROM agency_channel_intake_masters
    ) AS masters
    WHERE JSON_SEARCH(masters.intake_steps, 'one', CAST(t.id AS CHAR), NULL, '$[*].templateId', '$[*].template_id') IS NOT NULL
       OR JSON_CONTAINS(masters.intake_steps, JSON_OBJECT('templateId', t.id))
       OR JSON_CONTAINS(masters.intake_steps, JSON_OBJECT('template_id', t.id))
  );

-- Preserve the original issuer when staff explicitly assign an existing pending release.
ALTER TABLE client_school_roi_signing_links
  ADD COLUMN staff_requested_at DATETIME NULL,
  ADD COLUMN staff_requested_by_user_id INT NULL;
