-- Next Level Up public website; uses the existing NLU tenant and public service enrollment.
-- Reruns preserve publication status and owner-edited content.
INSERT INTO public_marketing_pages (slug,title,is_active,page_type,hero_title,hero_subtitle,hero_image_url,branding_json,seo_json)
SELECT 'nlu','Next Level Up | Learning and Counseling Centers',1,'marketing_hub',
 CONCAT('Academic Support.',CHAR(10),'Emotional Support.'),
 'Every student has potential. We connect individualized tutoring, counseling, and cognitive and emotional enrichment — because learning and well-being work best together.',
 '/assets/nlu/family.png',
 JSON_OBJECT('landingTemplate','nlu','logoUrl','/assets/nlu/logo.png','nluWebsite',JSON_OBJECT('pages',JSON_OBJECT(),'ctaImageUrl','/assets/nlu/mountains.png')),
 JSON_OBJECT('title','Next Level Up | Tutoring, Counseling & Learning','description','Individualized tutoring, counseling, and coordinated learning support for students and families. Explore Next Level Up Learning and Counseling Centers.')
WHERE NOT EXISTS (SELECT 1 FROM public_marketing_pages WHERE slug='nlu');
INSERT INTO public_marketing_page_sources (page_id,source_type,source_id,sort_order,is_active)
SELECT p.id,'agency',a.id,0,1 FROM public_marketing_pages p JOIN agencies a
 ON LOWER(COALESCE(a.slug,'')) IN ('nlu','nextlevelup','nextleveluplcc','next-level-up')
WHERE p.slug='nlu' AND LOWER(COALESCE(a.organization_type,'agency'))='agency'
AND NOT EXISTS (SELECT 1 FROM public_marketing_page_sources s WHERE s.page_id=p.id AND s.source_type='agency' AND s.source_id=a.id);
-- Existing collective members can discover the newly published website without changing opt-in.
UPDATE mental_range_memberships m JOIN agencies a ON a.id=m.agency_id
SET m.website_url='https://app.nextleveluplcc.com/p/nlu'
WHERE LOWER(COALESCE(a.slug,'')) IN ('nlu','nextlevelup','nextleveluplcc','next-level-up') AND TRIM(m.website_url)='';
