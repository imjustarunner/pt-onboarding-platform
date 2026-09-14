-- NLU explicitly authorized public service discovery. Provider publication remains staff controlled.
UPDATE agencies SET public_availability_enabled = 1 WHERE slug = 'nlu';
INSERT INTO agency_public_service_types (agency_id, service_type, display_name, intro_blurb, is_enabled, sort_order)
SELECT id, 'tutoring', 'Learning services', 'Explore learning providers, qualifications, rates, and openings.', 1, 1 FROM agencies WHERE slug='nlu'
ON DUPLICATE KEY UPDATE is_enabled=1;
INSERT INTO agency_public_service_types (agency_id, service_type, display_name, intro_blurb, is_enabled, sort_order)
SELECT id, 'counseling', 'Counseling', 'Explore counseling providers and openings.', 1, 0 FROM agencies WHERE slug='nlu'
ON DUPLICATE KEY UPDATE is_enabled=1;
CREATE TABLE IF NOT EXISTS agency_learning_catalogs (
 agency_id INT NOT NULL PRIMARY KEY,
 catalog_json JSON NOT NULL,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
ALTER TABLE provider_tutoring_profiles ADD COLUMN learning_settings_json JSON NULL;
