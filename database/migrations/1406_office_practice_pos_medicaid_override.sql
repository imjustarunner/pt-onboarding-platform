-- Migration 1406: office practice billing fields, office POS templates, school→office districts, Medicaid NPI override

ALTER TABLE office_locations
  ADD COLUMN practice_name VARCHAR(255)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'Legal practice name shown on credentialing / claims for this office',
  ADD COLUMN phone VARCHAR(40)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL,
  ADD COLUMN fax VARCHAR(40)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL,
  ADD COLUMN practice_npi VARCHAR(20)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'Default billing / practice NPI for this office',
  ADD COLUMN taxonomy_code VARCHAR(32)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL,
  ADD COLUMN default_modifiers VARCHAR(64)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'Comma-separated default claim modifiers for office POS 11',
  ADD COLUMN services_provided_at_address TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN telehealth_default TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Use telehealth by default for new appointments at this office';

ALTER TABLE agency_service_locations
  ADD COLUMN location_kind VARCHAR(32)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NOT NULL DEFAULT 'custom'
    COMMENT 'office_pos | school | custom — office_pos rows are per billing office templates',
  ADD COLUMN default_modifiers VARCHAR(64)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'e.g. GT for telehealth other than patient home',
  ADD COLUMN is_provider_visible TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1 = shown in booking POS pickers; 0 = internal/system only';

-- Widen override to_value for NPI-length values (already VARCHAR(64) — ensure notes document usage)
-- billing_claim_overrides.field_key may be place_of_service | billing_npi | taxonomy_code | modifiers

-- ITSCO Windchime (office id resolved by agency + name/address)
UPDATE office_locations ol
INNER JOIN agencies a ON a.id = ol.agency_id AND a.slug = 'itsco'
SET
  ol.name = 'Windchime',
  ol.practice_name = 'ITSCO, LLC',
  ol.street_address = '437 Windchime Place',
  ol.city = 'Colorado Springs',
  ol.state = 'CO',
  ol.postal_code = '80919-1984',
  ol.phone = '(833) 444-8726',
  ol.fax = '(833) 444-8726',
  ol.practice_npi = '1972246940',
  ol.taxonomy_code = '101YP2500X',
  ol.default_place_of_service = '11',
  ol.services_provided_at_address = 1,
  ol.telehealth_default = 0,
  ol.use_as_billing_address = 1,
  ol.is_active = 1
WHERE ol.is_active = 1
  AND (
    ol.name LIKE '%Windchime%'
    OR ol.street_address LIKE '%Windchime%'
  );

UPDATE office_locations ol
INNER JOIN agencies a ON a.id = ol.agency_id AND a.slug = 'itsco'
SET
  ol.name = 'Denver',
  ol.practice_name = 'ITSCO, LLC',
  ol.phone = '(833) 444-8726',
  ol.fax = '(833) 444-8726',
  ol.practice_npi = '1972246940',
  ol.taxonomy_code = '101YP2500X',
  ol.default_place_of_service = '11',
  ol.services_provided_at_address = 1,
  ol.telehealth_default = 0,
  ol.use_as_billing_address = 1,
  ol.is_active = 1
WHERE ol.is_active = 1
  AND (
    ol.name LIKE '%Denver%'
    OR ol.city = 'Denver'
  );

-- Reactivate NLU Windchime and seed practice fields (agency-owned row preferred)
UPDATE office_locations ol
INNER JOIN agencies a ON a.id = ol.agency_id AND a.slug IN ('nlu', 'nextlevelup', 'nextleveluplcc')
SET
  ol.name = 'Windchime',
  ol.practice_name = 'Next Level Up, LLC',
  ol.street_address = '437 Windchime Place',
  ol.city = 'Colorado Springs',
  ol.state = 'CO',
  ol.postal_code = '80919-1984',
  ol.phone = '(719) 377-6577',
  ol.fax = '(719) 377-6577',
  ol.practice_npi = '1942945316',
  ol.taxonomy_code = '101YM0800X',
  ol.default_place_of_service = '11',
  ol.services_provided_at_address = 1,
  ol.telehealth_default = 0,
  ol.use_as_billing_address = 1,
  ol.is_active = 1
WHERE ol.name LIKE '%Windchime%'
   OR ol.street_address LIKE '%Windchime%';

-- Create ISI Windchime if missing
INSERT INTO office_locations (
  agency_id, name, practice_name, street_address, city, state, postal_code,
  phone, fax, practice_npi, taxonomy_code, default_place_of_service,
  services_provided_at_address, telehealth_default, use_as_billing_address,
  timezone, access_key, is_active
)
SELECT
  a.id,
  'Windchime',
  'The Inner Strength Institute LLC',
  '437 Windchime Place',
  'Colorado Springs',
  'CO',
  '80919-1984',
  '(618) 447-2420',
  NULL,
  '1306688650',
  '101YP2500X',
  '11',
  1,
  0,
  1,
  'America/Denver',
  LOWER(HEX(RANDOM_BYTES(16))),
  1
FROM agencies a
WHERE a.slug IN ('tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute')
  AND NOT EXISTS (
    SELECT 1 FROM office_locations ol
    WHERE ol.agency_id = a.id AND ol.name LIKE '%Windchime%' AND ol.is_active = 1
  )
LIMIT 1;

INSERT IGNORE INTO office_location_agencies (office_location_id, agency_id)
SELECT ol.id, ol.agency_id
FROM office_locations ol
INNER JOIN agencies a ON a.id = ol.agency_id
WHERE a.slug IN ('tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute')
  AND ol.name LIKE '%Windchime%';

-- Per-office POS templates (provider-facing labels; billing_office_location_id = credentialed office)
-- ITSCO: Office / Telehealth / Telehealth patient's home / Home for each active office
INSERT INTO agency_service_locations (
  agency_id, name, place_of_service, street_address, city, state, postal_code,
  notes, requires_credentialing, billing_office_location_id, location_kind,
  default_modifiers, is_provider_visible, is_active
)
SELECT
  ol.agency_id,
  tpl.name,
  tpl.pos,
  ol.street_address,
  ol.city,
  ol.state,
  ol.postal_code,
  CONCAT('Office POS template for ', ol.name),
  0,
  ol.id,
  'office_pos',
  tpl.modifiers,
  1,
  1
FROM office_locations ol
INNER JOIN agencies a ON a.id = ol.agency_id AND a.slug = 'itsco'
CROSS JOIN (
  SELECT 'Office' AS name, '11' AS pos, NULL AS modifiers
  UNION ALL SELECT 'Telehealth', '02', 'GT'
  UNION ALL SELECT 'Telehealth - In Patient''s Home', '10', NULL
  UNION ALL SELECT 'Home', '12', NULL
) tpl
WHERE ol.is_active = 1
  AND NOT EXISTS (
    SELECT 1 FROM agency_service_locations l
    WHERE l.agency_id = ol.agency_id
      AND l.billing_office_location_id = ol.id
      AND l.place_of_service = tpl.pos
      AND l.location_kind = 'office_pos'
      AND l.is_active = 1
  );

-- NLU Windchime POS templates (agency-owned active Windchime)
INSERT INTO agency_service_locations (
  agency_id, name, place_of_service, street_address, city, state, postal_code,
  notes, requires_credentialing, billing_office_location_id, location_kind,
  default_modifiers, is_provider_visible, is_active
)
SELECT
  ol.agency_id,
  tpl.name,
  tpl.pos,
  ol.street_address,
  ol.city,
  ol.state,
  ol.postal_code,
  CONCAT('Office POS template for ', ol.name),
  0,
  ol.id,
  'office_pos',
  tpl.modifiers,
  1,
  1
FROM office_locations ol
INNER JOIN agencies a ON a.id = ol.agency_id AND a.slug IN ('nlu', 'nextlevelup', 'nextleveluplcc')
CROSS JOIN (
  SELECT 'Office' AS name, '11' AS pos, NULL AS modifiers
  UNION ALL SELECT 'Telehealth', '02', 'GT'
  UNION ALL SELECT 'Telehealth - In Patient''s Home', '10', NULL
  UNION ALL SELECT 'Home', '12', NULL
) tpl
WHERE ol.is_active = 1
  AND (ol.name LIKE '%Windchime%' OR ol.street_address LIKE '%Windchime%')
  AND NOT EXISTS (
    SELECT 1 FROM agency_service_locations l
    WHERE l.agency_id = ol.agency_id
      AND l.billing_office_location_id = ol.id
      AND l.place_of_service = tpl.pos
      AND l.location_kind = 'office_pos'
      AND l.is_active = 1
  );

-- Point legacy NLU service locations at NLU's own Windchime office when possible
UPDATE agency_service_locations l
INNER JOIN agencies a ON a.id = l.agency_id AND a.slug IN ('nlu', 'nextlevelup', 'nextleveluplcc')
INNER JOIN office_locations ol ON ol.agency_id = a.id AND ol.is_active = 1
  AND (ol.name LIKE '%Windchime%' OR ol.street_address LIKE '%Windchime%')
SET l.billing_office_location_id = ol.id,
    l.location_kind = IF(l.school_organization_id IS NULL AND l.place_of_service IN ('02','10','11','12'), 'office_pos', l.location_kind)
WHERE l.is_active = 1
  AND (l.billing_office_location_id IS NULL OR l.billing_office_location_id <> ol.id);

-- ISI POS templates
INSERT INTO agency_service_locations (
  agency_id, name, place_of_service, street_address, city, state, postal_code,
  notes, requires_credentialing, billing_office_location_id, location_kind,
  default_modifiers, is_provider_visible, is_active
)
SELECT
  ol.agency_id,
  tpl.name,
  tpl.pos,
  ol.street_address,
  ol.city,
  ol.state,
  ol.postal_code,
  CONCAT('Office POS template for ', ol.name),
  0,
  ol.id,
  'office_pos',
  tpl.modifiers,
  1,
  1
FROM office_locations ol
INNER JOIN agencies a ON a.id = ol.agency_id AND a.slug IN ('tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute')
CROSS JOIN (
  SELECT 'Office' AS name, '11' AS pos, NULL AS modifiers
  UNION ALL SELECT 'Telehealth', '02', 'GT'
  UNION ALL SELECT 'Telehealth - In Patient''s Home', '10', NULL
  UNION ALL SELECT 'Home', '12', NULL
) tpl
WHERE ol.is_active = 1
  AND NOT EXISTS (
    SELECT 1 FROM agency_service_locations l
    WHERE l.agency_id = ol.agency_id
      AND l.billing_office_location_id = ol.id
      AND l.place_of_service = tpl.pos
      AND l.location_kind = 'office_pos'
      AND l.is_active = 1
  );

-- Link ITSCO school service locations: DPS → Denver; D11/D12 → Windchime
UPDATE agency_service_locations l
INNER JOIN agencies school ON school.id = l.school_organization_id
LEFT JOIN school_profiles sp ON sp.school_organization_id = school.id
INNER JOIN agencies tenant ON tenant.id = l.agency_id AND tenant.slug = 'itsco'
INNER JOIN office_locations denver ON denver.agency_id = tenant.id AND denver.is_active = 1
  AND (denver.name LIKE '%Denver%' OR denver.city = 'Denver')
SET l.billing_office_location_id = denver.id,
    l.location_kind = 'school',
    l.place_of_service = COALESCE(NULLIF(l.place_of_service, ''), '03')
WHERE l.school_organization_id IS NOT NULL
  AND (
    LOWER(COALESCE(sp.district_name, '')) LIKE '%dps%'
    OR LOWER(COALESCE(sp.district_name, '')) LIKE '%denver public%'
  );

UPDATE agency_service_locations l
INNER JOIN agencies school ON school.id = l.school_organization_id
LEFT JOIN school_profiles sp ON sp.school_organization_id = school.id
INNER JOIN agencies tenant ON tenant.id = l.agency_id AND tenant.slug = 'itsco'
INNER JOIN office_locations wind ON wind.agency_id = tenant.id AND wind.is_active = 1
  AND (wind.name LIKE '%Windchime%' OR wind.street_address LIKE '%Windchime%')
SET l.billing_office_location_id = wind.id,
    l.location_kind = 'school',
    l.place_of_service = COALESCE(NULLIF(l.place_of_service, ''), '03')
WHERE l.school_organization_id IS NOT NULL
  AND (
    LOWER(COALESCE(sp.district_name, '')) LIKE '%d11%'
    OR LOWER(COALESCE(sp.district_name, '')) LIKE '%district 11%'
    OR LOWER(COALESCE(sp.district_name, '')) LIKE '%district11%'
    OR LOWER(COALESCE(sp.district_name, '')) LIKE '%d12%'
    OR LOWER(COALESCE(sp.district_name, '')) LIKE '%district 12%'
    OR LOWER(COALESCE(sp.district_name, '')) LIKE '%colorado springs school district 11%'
  );

-- Ensure school service locations exist for affiliated ITSCO schools (POS 03) linked to district office
INSERT INTO agency_service_locations (
  agency_id, name, place_of_service, notes, requires_credentialing,
  billing_office_location_id, school_organization_id, location_kind, is_provider_visible, is_active
)
SELECT
  tenant.id,
  school.name,
  '03',
  'School service site — claims bill under linked office',
  0,
  CASE
    WHEN LOWER(COALESCE(sp.district_name, '')) LIKE '%dps%'
      OR LOWER(COALESCE(sp.district_name, '')) LIKE '%denver public%'
      THEN denver.id
    ELSE wind.id
  END,
  school.id,
  'school',
  1,
  1
FROM agencies tenant
JOIN (
  SELECT school_organization_id AS oid, agency_id FROM agency_schools WHERE is_active = 1
  UNION
  SELECT organization_id, agency_id FROM organization_affiliations WHERE is_active = 1
) x ON x.agency_id = tenant.id
JOIN agencies school ON school.id = x.oid
LEFT JOIN school_profiles sp ON sp.school_organization_id = school.id
JOIN office_locations wind ON wind.agency_id = tenant.id AND wind.is_active = 1
  AND (wind.name LIKE '%Windchime%' OR wind.street_address LIKE '%Windchime%')
JOIN office_locations denver ON denver.agency_id = tenant.id AND denver.is_active = 1
  AND (denver.name LIKE '%Denver%' OR denver.city = 'Denver')
WHERE tenant.slug = 'itsco'
  AND (LOWER(COALESCE(school.organization_type, 'school')) = 'school' OR school.organization_type IS NULL OR school.organization_type = '')
  AND (
    LOWER(COALESCE(sp.district_name, '')) LIKE '%dps%'
    OR LOWER(COALESCE(sp.district_name, '')) LIKE '%denver public%'
    OR LOWER(COALESCE(sp.district_name, '')) LIKE '%d11%'
    OR LOWER(COALESCE(sp.district_name, '')) LIKE '%district 11%'
    OR LOWER(COALESCE(sp.district_name, '')) LIKE '%colorado springs school district 11%'
    OR LOWER(COALESCE(sp.district_name, '')) LIKE '%d12%'
    OR LOWER(COALESCE(sp.district_name, '')) LIKE '%district 12%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM agency_service_locations l
    WHERE l.agency_id = tenant.id AND l.school_organization_id = school.id AND l.is_active = 1
  );

-- Group NPIs (practice + Medicaid override NPI)
INSERT INTO agency_group_npis (agency_id, npi_number, label, taxonomy_code, office_location_id, notes, is_active)
SELECT a.id, '1972246940', 'ITSCO Windchime / Denver practice', '101YP2500X', ol.id, 'Primary practice NPI', 1
FROM agencies a
JOIN office_locations ol ON ol.agency_id = a.id AND ol.is_active = 1 AND ol.name LIKE '%Windchime%'
WHERE a.slug = 'itsco'
  AND NOT EXISTS (SELECT 1 FROM agency_group_npis g WHERE g.agency_id = a.id AND g.npi_number = '1972246940')
LIMIT 1;

INSERT INTO agency_group_npis (agency_id, npi_number, label, taxonomy_code, office_location_id, notes, is_active)
SELECT a.id, '1215615711', 'ITSCO Medicaid billing NPI', '101YP2500X', ol.id, 'Payer override: Medicaid claims bill under this NPI', 1
FROM agencies a
JOIN office_locations ol ON ol.agency_id = a.id AND ol.is_active = 1 AND ol.name LIKE '%Windchime%'
WHERE a.slug = 'itsco'
  AND NOT EXISTS (SELECT 1 FROM agency_group_npis g WHERE g.agency_id = a.id AND g.npi_number = '1215615711')
LIMIT 1;

INSERT INTO agency_group_npis (agency_id, npi_number, label, taxonomy_code, office_location_id, notes, is_active)
SELECT a.id, '1942945316', 'NLU Windchime practice', '101YM0800X', ol.id, 'Primary practice NPI', 1
FROM agencies a
JOIN office_locations ol ON ol.agency_id = a.id AND ol.is_active = 1 AND ol.name LIKE '%Windchime%'
WHERE a.slug IN ('nlu', 'nextlevelup', 'nextleveluplcc')
  AND NOT EXISTS (SELECT 1 FROM agency_group_npis g WHERE g.agency_id = a.id AND g.npi_number = '1942945316')
LIMIT 1;

INSERT INTO agency_group_npis (agency_id, npi_number, label, taxonomy_code, office_location_id, notes, is_active)
SELECT a.id, '1215615711', 'NLU Medicaid billing NPI', '101YP2500X', ol.id, 'Payer override: Medicaid claims bill under this NPI', 1
FROM agencies a
JOIN office_locations ol ON ol.agency_id = a.id AND ol.is_active = 1 AND ol.name LIKE '%Windchime%'
WHERE a.slug IN ('nlu', 'nextlevelup', 'nextleveluplcc')
  AND NOT EXISTS (SELECT 1 FROM agency_group_npis g WHERE g.agency_id = a.id AND g.npi_number = '1215615711')
LIMIT 1;

INSERT INTO agency_group_npis (agency_id, npi_number, label, taxonomy_code, office_location_id, notes, is_active)
SELECT a.id, '1306688650', 'ISI Windchime practice', '101YP2500X', ol.id, 'Primary practice NPI', 1
FROM agencies a
JOIN office_locations ol ON ol.agency_id = a.id AND ol.is_active = 1 AND ol.name LIKE '%Windchime%'
WHERE a.slug IN ('tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute')
  AND NOT EXISTS (SELECT 1 FROM agency_group_npis g WHERE g.agency_id = a.id AND g.npi_number = '1306688650')
LIMIT 1;

-- Medicaid billing NPI claim overrides (payer-scoped)
INSERT INTO billing_claim_overrides (
  agency_id, scope, payer_name, field_key, from_value, to_value, is_active, notes
)
SELECT a.id, 'payer', 'Medicaid', 'billing_npi', NULL, '1215615711', 1,
  'Any Medicaid payer match bills under Medicaid group NPI 1215615711'
FROM agencies a
WHERE a.slug IN ('itsco', 'nlu', 'nextlevelup', 'nextleveluplcc')
  AND NOT EXISTS (
    SELECT 1 FROM billing_claim_overrides o
    WHERE o.agency_id = a.id AND o.scope = 'payer' AND o.field_key = 'billing_npi'
      AND o.payer_name = 'Medicaid' AND o.to_value = '1215615711' AND o.is_active = 1
  );

INSERT INTO billing_claim_overrides (
  agency_id, scope, payer_name, field_key, from_value, to_value, is_active, notes
)
SELECT a.id, 'payer', 'Colorado Medicaid', 'billing_npi', NULL, '1215615711', 1,
  'Colorado Medicaid variant — same NPI override'
FROM agencies a
WHERE a.slug IN ('itsco', 'nlu', 'nextlevelup', 'nextleveluplcc')
  AND NOT EXISTS (
    SELECT 1 FROM billing_claim_overrides o
    WHERE o.agency_id = a.id AND o.scope = 'payer' AND o.field_key = 'billing_npi'
      AND o.payer_name = 'Colorado Medicaid' AND o.to_value = '1215615711' AND o.is_active = 1
  );

-- Seed / refresh ISI Windchime practice fields if office already existed
UPDATE office_locations ol
INNER JOIN agencies a ON a.id = ol.agency_id
  AND a.slug IN ('tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute')
SET
  ol.name = 'Windchime',
  ol.practice_name = 'The Inner Strength Institute LLC',
  ol.street_address = '437 Windchime Place',
  ol.city = 'Colorado Springs',
  ol.state = 'CO',
  ol.postal_code = '80919-1984',
  ol.phone = '(618) 447-2420',
  ol.fax = NULL,
  ol.practice_npi = '1306688650',
  ol.taxonomy_code = '101YP2500X',
  ol.default_place_of_service = '11',
  ol.services_provided_at_address = 1,
  ol.telehealth_default = 0,
  ol.use_as_billing_address = 1,
  ol.is_active = 1
WHERE ol.name LIKE '%Windchime%'
   OR ol.street_address LIKE '%Windchime%';

-- Deactivate legacy ITSCO custom POS rows superseded by per-office office_pos templates.
-- MySQL forbids referencing the updated table in a subquery of the same UPDATE;
-- use a derived table wrapper so the EXISTS check is allowed.
UPDATE agency_service_locations l
INNER JOIN agencies a ON a.id = l.agency_id AND a.slug = 'itsco'
SET l.is_active = 0,
    l.notes = CONCAT(
      COALESCE(l.notes, ''),
      IF(COALESCE(l.notes, '') = '' OR l.notes LIKE '%[superseded by office_pos]%', '', ' [superseded by office_pos]')
    )
WHERE l.is_active = 1
  AND l.school_organization_id IS NULL
  AND COALESCE(l.location_kind, 'custom') <> 'office_pos'
  AND l.place_of_service IN ('02', '10', '11', '12')
  AND EXISTS (
    SELECT 1 FROM (
      SELECT n.agency_id, n.billing_office_location_id, n.place_of_service, n.id
      FROM agency_service_locations n
      WHERE n.location_kind = 'office_pos'
        AND n.is_active = 1
    ) n
    WHERE n.agency_id = l.agency_id
      AND n.billing_office_location_id <=> l.billing_office_location_id
      AND n.place_of_service = l.place_of_service
      AND n.id <> l.id
  );