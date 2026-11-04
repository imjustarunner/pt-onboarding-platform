-- Migration 1742: Denver and Next Level Up office billing NPIs
-- Denver bills as 1912817149. Next Level Up Windchime bills as 1063191336.
-- 1215615711 stays the Medicaid payer override and is not the office identity.

UPDATE office_locations ol
JOIN agencies a ON a.id = ol.agency_id
SET ol.practice_npi = '1912817149'
WHERE a.slug = 'itsco'
  AND ol.is_active = 1
  AND ol.name = 'Denver';

INSERT INTO agency_group_npis (agency_id, npi_number, label, taxonomy_code, office_location_id, notes, is_active)
SELECT a.id, '1912817149', 'ITSCO Denver practice', '101YP2500X', ol.id, 'Primary practice NPI', 1
FROM agencies a
JOIN office_locations ol ON ol.agency_id = a.id AND ol.is_active = 1 AND ol.name = 'Denver'
WHERE a.slug = 'itsco'
  AND NOT EXISTS (
    SELECT 1 FROM agency_group_npis g
    WHERE g.agency_id = a.id AND g.office_location_id = ol.id AND g.npi_number = '1912817149'
  );

UPDATE office_locations ol
JOIN agencies a ON a.id = ol.agency_id
SET ol.practice_npi = '1063191336'
WHERE a.slug IN ('nlu', 'nextlevelup', 'nextleveluplcc')
  AND ol.is_active = 1
  AND ol.use_as_billing_address = 1
  AND (ol.name LIKE '%Windchime%' OR ol.street_address LIKE '%Windchime%');

UPDATE agency_group_npis g
JOIN agencies a ON a.id = g.agency_id
SET g.npi_number = '1063191336',
    g.label = 'NLU Windchime practice',
    g.notes = 'Primary practice NPI'
WHERE a.slug IN ('nlu', 'nextlevelup', 'nextleveluplcc')
  AND g.is_active = 1
  AND g.npi_number = '1942945316';

INSERT INTO agency_group_npis (agency_id, npi_number, label, taxonomy_code, office_location_id, notes, is_active)
SELECT a.id, '1063191336', 'NLU Windchime practice', '101YM0800X', ol.id, 'Primary practice NPI', 1
FROM agencies a
JOIN office_locations ol ON ol.agency_id = a.id AND ol.is_active = 1 AND ol.use_as_billing_address = 1
  AND (ol.name LIKE '%Windchime%' OR ol.street_address LIKE '%Windchime%')
WHERE a.slug IN ('nlu', 'nextlevelup', 'nextleveluplcc')
  AND NOT EXISTS (
    SELECT 1 FROM agency_group_npis g
    WHERE g.agency_id = a.id AND g.office_location_id = ol.id AND g.npi_number = '1063191336'
  );
