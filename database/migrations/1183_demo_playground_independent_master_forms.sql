-- Migration 1183: Seed Demo Playground with its own school/office master form rows
-- (independent copies of ITSCO content). Shadow/published intake_links are ensured
-- by backend/src/scripts/provisionDemoPlaygroundMasters.js on deploy or locally.

SET @demo_id = (
  SELECT id FROM agencies WHERE slug = 'demo' AND organization_type = 'agency' LIMIT 1
);
SET @itsco_id = (
  SELECT id FROM agencies WHERE slug = 'itsco' AND organization_type = 'agency' LIMIT 1
);
SET @demo_school_id = (
  SELECT a.id
  FROM agency_schools asx
  INNER JOIN agencies a ON a.id = asx.school_organization_id
  WHERE asx.agency_id = @demo_id AND asx.is_active = 1
  ORDER BY (LOWER(COALESCE(a.slug, a.portal_url, '')) = 'demo-school') DESC, a.id ASC
  LIMIT 1
);

-- School digital masters (EN/ES) — copy ITSCO content into Demo's own rows when missing
INSERT INTO agency_school_intake_masters (
  agency_id, language_code, title, intake_steps, intake_fields, version
)
SELECT
  @demo_id,
  m.language_code,
  CONCAT(
    'Demo Playground — ',
    COALESCE(NULLIF(TRIM(m.title), ''), CONCAT('School Referral Master (', UPPER(m.language_code), ')'))
  ),
  m.intake_steps,
  m.intake_fields,
  1
FROM agency_school_intake_masters m
WHERE @demo_id IS NOT NULL
  AND @itsco_id IS NOT NULL
  AND m.agency_id = @itsco_id
  AND NOT EXISTS (
    SELECT 1 FROM agency_school_intake_masters x
    WHERE x.agency_id = @demo_id AND x.language_code = m.language_code
  );

-- School printable packet templates for Demo (own agency_id rows)
INSERT INTO school_packet_templates (agency_id, locale, version, html_content, updated_by_user_id)
SELECT
  @demo_id,
  COALESCE(t.locale, 'en'),
  1,
  t.html_content,
  NULL
FROM school_packet_templates t
WHERE @demo_id IS NOT NULL
  AND @itsco_id IS NOT NULL
  AND t.agency_id = @itsco_id
  AND NOT EXISTS (
    SELECT 1 FROM school_packet_templates x
    WHERE x.agency_id = @demo_id
      AND COALESCE(x.locale, 'en') = COALESCE(t.locale, 'en')
  );

-- Office printable packet templates — copy school packet HTML as starting point
INSERT INTO office_packet_templates (agency_id, locale, version, html_content, updated_by_user_id)
SELECT
  @demo_id,
  COALESCE(t.locale, 'en'),
  1,
  t.html_content,
  NULL
FROM school_packet_templates t
WHERE @demo_id IS NOT NULL
  AND t.agency_id = @demo_id
  AND NOT EXISTS (
    SELECT 1 FROM office_packet_templates x
    WHERE x.agency_id = @demo_id AND x.locale = COALESCE(t.locale, 'en')
  );

-- Framed channel masters (tutoring / consulting / coaching) EN+ES
INSERT INTO agency_channel_intake_masters (
  agency_id, channel, language_code, title, intake_steps, intake_fields, version, status
)
SELECT
  @demo_id,
  c.channel,
  l.language_code,
  CONCAT('Demo Playground — Master Digital ', c.label, ' (', UPPER(l.language_code), ')'),
  CAST('[{"type":"questions","label":"Questionnaire","visibility":"always","fields":[]}]' AS JSON),
  NULL,
  1,
  'framed'
FROM (
  SELECT 'tutoring' AS channel, 'Tutoring' AS label
  UNION ALL SELECT 'consulting', 'Consulting'
  UNION ALL SELECT 'coaching', 'Coaching'
) c
CROSS JOIN (
  SELECT 'en' AS language_code
  UNION ALL SELECT 'es'
) l
WHERE @demo_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agency_channel_intake_masters x
    WHERE x.agency_id = @demo_id AND x.channel = c.channel AND x.language_code = l.language_code
  );

-- Note: office intake masters + published Join shells + school inheriting shells
-- are created by provisionDemoPlaygroundMasters.js (needs IntakeLink public_keys).
