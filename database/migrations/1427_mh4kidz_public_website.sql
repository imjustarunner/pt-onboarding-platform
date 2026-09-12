-- Independent public website. Tenant enrollment will be connected after onboarding.
INSERT INTO public_marketing_pages (slug,title,is_active,page_type,hero_title,hero_subtitle,hero_image_url,branding_json,seo_json)
SELECT 'mh4kidz','MH4Kidz',1,'marketing_hub','Real connections. Brighter paths.',
 'Experiential and group-oriented programs that help kids build skills, confidence, resilience, and meaningful connections.',
 '/assets/mh4kidz/home.webp',
 JSON_OBJECT('landingTemplate','mh4kidz','logoUrl','/assets/mh4kidz/logo.webp','mh4kidzWebsite',JSON_OBJECT('donationUrl','','enrollmentUrl','','partnerUrl','','contactUrl','')),
 JSON_OBJECT('title','MH4Kidz | Stronger kids. Brighter tomorrows.','description','Real connections. Brighter paths. Explore experiential programs and the Unplugged Series with MH4Kidz.')
WHERE NOT EXISTS (SELECT 1 FROM public_marketing_pages WHERE slug='mh4kidz');
