-- Mental Range is a public network, never an agency/tenant. Membership is managed
-- separately and cannot be changed through the regular tenant update endpoint.
CREATE TABLE IF NOT EXISTS mental_range_memberships (
 agency_id INT NOT NULL PRIMARY KEY,
 included BOOLEAN NOT NULL DEFAULT FALSE,
 description TEXT NULL, audience TEXT NULL, focus TEXT NULL,
 website_url VARCHAR(2048) NOT NULL DEFAULT '', contact_url VARCHAR(2048) NOT NULL DEFAULT '',
 services JSON NULL, updated_by INT NULL,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_mental_range_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- One-time inclusion authorized by the owner. Reruns preserve opt-outs and edits.
INSERT INTO mental_range_memberships (agency_id,included,services,website_url)
SELECT a.id,1,
 COALESCE((SELECT JSON_ARRAYAGG(s.service_type) FROM agency_public_service_types s WHERE s.agency_id=a.id AND s.is_enabled=1 AND s.service_type IN ('counseling','tutoring','coaching')),JSON_ARRAY()),
 COALESCE((SELECT CONCAT('/p/',p.slug) FROM public_marketing_pages p WHERE p.is_active=1 AND CAST(p.slug AS BINARY)=CAST(a.slug AS BINARY) LIMIT 1),'')
FROM agencies a WHERE a.is_active=1 AND COALESCE(a.is_archived,0)=0
 AND LOWER(COALESCE(a.organization_type,'agency')) IN ('agency','clubwebapp','life_coach','consultant')
 AND LOWER(CONCAT(COALESCE(a.name,''),' ',COALESCE(a.slug,''))) NOT REGEXP 'demo|burning[ _-]*sage'
 AND NOT EXISTS (SELECT 1 FROM mental_range_memberships m WHERE m.agency_id=a.id);
INSERT INTO public_marketing_pages (slug,title,is_active,page_type,hero_title,hero_subtitle,hero_image_url,branding_json,seo_json)
SELECT 'range','Mental Range Collective',1,'marketing_hub',CONCAT('Expanding',CHAR(10),'Mental Health',CHAR(10),'Together.'),
 'A network of purpose-driven organizations working together to make mental health care, tutoring, and life coaching more accessible across our communities.',
 '/assets/range/home.webp',JSON_OBJECT('landingTemplate','range','rangeWebsite',JSON_OBJECT('partnerUrl','','contactUrl','')),
 JSON_OBJECT('title','Mental Range Collective | Stronger Together','description','Find mental health support, tutoring, and life coaching across independent partner organizations in the Mental Range Collective.')
WHERE NOT EXISTS (SELECT 1 FROM public_marketing_pages WHERE slug='range');
