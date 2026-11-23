-- Offer common community settings to agencies that already use clinical
-- service locations. Service and payer rules still decide which are billable.
INSERT INTO agency_service_locations
  (agency_id, name, place_of_service, location_kind, is_provider_visible)
SELECT agency.agency_id, setting.name, '99', 'custom', 1
FROM (
  SELECT DISTINCT agency_id
  FROM agency_service_locations
  WHERE is_active = 1 AND place_of_service IN ('11', '12')
) agency
CROSS JOIN (SELECT 'Park' AS name UNION ALL SELECT 'Library') setting
LEFT JOIN agency_service_locations existing
  ON existing.agency_id = agency.agency_id AND existing.name = setting.name
WHERE existing.id IS NULL;
