-- ITSCO public website. No tenant creation, synthetic providers, or invented impact totals.
CREATE TABLE IF NOT EXISTS agency_public_impact_settings (
  agency_id INT NOT NULL PRIMARY KEY,
  student_total BIGINT UNSIGNED NOT NULL,
  baseline_at DATETIME(6) NOT NULL,
  updated_by_user_id INT NOT NULL,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS agency_public_impact_baseline_clients (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  PRIMARY KEY (agency_id, client_id),
  FOREIGN KEY (agency_id) REFERENCES agency_public_impact_settings(agency_id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
INSERT INTO public_marketing_pages
 (slug, title, is_active, page_type, hero_title, hero_subtitle, hero_image_url, branding_json, seo_json)
SELECT 'itsco', 'ITSCO | In The School Counselors', 1, 'marketing_landing',
 'Therapy That Meets You Where You Are', 'Compassionate mental health care for children, teens, adults, and families — in our offices, online, and in schools.',
 '/assets/itsco/counseling-hero.png',
 JSON_OBJECT('landingTemplate', 'itsco', 'itscoWebsite', JSON_OBJECT('districts', JSON_OBJECT())),
 JSON_OBJECT('description', 'Meet the ITSCO team, explore our school partnerships, and find counseling support.')
WHERE NOT EXISTS (SELECT 1 FROM public_marketing_pages WHERE slug = 'itsco');
INSERT INTO public_marketing_page_sources (page_id, source_type, source_id, sort_order, is_active)
SELECT p.id, 'agency', a.id, 0, 1 FROM public_marketing_pages p JOIN agencies a ON a.slug = 'itsco'
WHERE p.slug = 'itsco' AND a.organization_type = 'agency'
AND NOT EXISTS (SELECT 1 FROM public_marketing_page_sources s WHERE s.page_id = p.id AND s.source_type = 'agency' AND s.source_id = a.id);
