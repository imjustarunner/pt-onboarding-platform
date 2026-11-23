/* Keep each setting attached to its agency's existing billing identity. */
INSERT INTO agency_service_locations
  (agency_id, name, place_of_service, street_address, city, state, postal_code,
   billing_office_location_id, location_kind, default_modifiers, is_provider_visible, is_active)
SELECT o.agency_id, setting.name, setting.pos, o.street_address, o.city, o.state, o.postal_code,
       o.id, setting.kind, setting.modifier, 1, 1
FROM office_locations o
JOIN agencies a ON a.id = o.agency_id AND a.is_active = 1
CROSS JOIN (
  SELECT 'Office' AS name, '11' AS pos, 'office_pos' AS kind, NULL AS modifier
  UNION ALL SELECT 'Telehealth', '02', 'office_pos', 'GT'
  UNION ALL SELECT 'Telehealth - In Patient''s Home', '10', 'office_pos', NULL
  UNION ALL SELECT 'Patient''s Residence', '12', 'office_pos', NULL
  UNION ALL SELECT 'Park', '99', 'custom', NULL
  UNION ALL SELECT 'Library', '99', 'custom', NULL
) setting
WHERE o.is_active = 1
  AND (
    (LOWER(COALESCE(a.slug, a.portal_url)) IN ('itsco','nlu','next-level-up','nextlevelup','nextleveluplcc','tisi',
      'inner-strength','innerstrength','theinnerstrengthinstitute','the-inner-strength-institute')
     AND LOWER(TRIM(o.street_address)) IN ('437 windchime place', '437 windchime pl'))
    OR (LOWER(COALESCE(a.slug, a.portal_url)) = 'itsco' AND LOWER(TRIM(o.city)) = 'denver')
    OR EXISTS (SELECT 1 FROM agency_service_locations l
      WHERE l.agency_id = o.agency_id AND l.billing_office_location_id = o.id
        AND l.place_of_service = '11' AND l.is_active = 1)
  )
  AND NOT EXISTS (SELECT 1 FROM agency_service_locations l
    WHERE l.agency_id = o.agency_id AND l.billing_office_location_id = o.id
      AND l.place_of_service = setting.pos AND l.school_organization_id IS NULL
      AND (setting.pos <> '99' OR l.name = setting.name)
      AND l.is_active = 1);

/* Fill in missing ITSCO school sites using the agency's district-to-office rule. */
INSERT INTO agency_service_locations
  (agency_id, school_organization_id, name, place_of_service, street_address, city, state, postal_code,
   billing_office_location_id, location_kind, is_provider_visible, is_active)
SELECT a.id, school.id, school.name, '03', school.street_address, school.city, school.state, school.postal_code,
  o.id, 'school', 1, 1
FROM agencies a
JOIN (
  SELECT agency_id, school_organization_id AS school_id FROM agency_schools WHERE is_active = 1
  UNION
  SELECT agency_id, organization_id FROM organization_affiliations WHERE is_active = 1
) AS affiliations ON affiliations.agency_id = a.id
JOIN agencies school ON school.id = affiliations.school_id AND school.organization_type = 'school' AND school.is_active = 1
LEFT JOIN school_profiles profile ON profile.school_organization_id = school.id
JOIN office_locations o ON o.id = (
  SELECT MIN(office.id) FROM office_locations office
  WHERE office.agency_id = a.id AND office.is_active = 1
    AND IF(LOWER(COALESCE(profile.district_name,'')) REGEXP 'dps|denver public',
      LOWER(TRIM(office.city)) = 'denver',
      LOWER(TRIM(office.street_address)) IN ('437 windchime place','437 windchime pl'))
)
WHERE LOWER(COALESCE(a.slug, a.portal_url)) = 'itsco'
  AND NOT EXISTS (SELECT 1 FROM agency_service_locations l
    WHERE l.agency_id = a.id AND l.school_organization_id = school.id AND l.is_active = 1);

/* Repair school sites that predate a configured billing office. */
UPDATE agency_service_locations l
JOIN agencies a ON a.id = l.agency_id AND LOWER(COALESCE(a.slug, a.portal_url)) = 'itsco'
JOIN agencies school ON school.id = l.school_organization_id AND school.organization_type = 'school' AND school.is_active = 1
LEFT JOIN school_profiles profile ON profile.school_organization_id = school.id
LEFT JOIN office_locations original ON original.id = l.billing_office_location_id
JOIN office_locations o ON o.id = (
  SELECT MIN(office.id) FROM office_locations office
  WHERE office.agency_id = a.id AND office.is_active = 1
    AND IF(LOWER(COALESCE(profile.district_name,'')) REGEXP 'dps|denver public',
      LOWER(TRIM(office.city)) = 'denver',
      LOWER(TRIM(office.street_address)) IN ('437 windchime place','437 windchime pl'))
)
SET l.billing_office_location_id = o.id, l.place_of_service = '03', l.location_kind = 'school'
WHERE l.is_active = 1 AND (original.id IS NULL OR original.agency_id <> a.id OR original.is_active <> 1);
