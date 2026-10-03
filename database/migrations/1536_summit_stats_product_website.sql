-- Public website metadata only. Preserve the existing tenant, support routing,
-- ownership relationship, club accounts, trial dates, and billing configuration.
-- Identity resolution requires an active public-page record even though the
-- actual website is served as pre-rendered HTML, not by the generic page editor.
INSERT INTO public_marketing_pages
 (slug, title, is_active, page_type, hero_title, hero_subtitle, branding_json)
SELECT 'sstc', 'Summit Stats Team Challenge', 1, 'product_website',
 'Move together. Make every effort count.',
 'A web application for fitness clubs, community groups, and team competitions.',
 JSON_OBJECT('logoUrl', 'https://summitstatstc.com/assets/sstc/logo.png')
WHERE EXISTS (SELECT 1 FROM agencies WHERE slug = 'sstc' AND is_active = 1)
 AND NOT EXISTS (SELECT 1 FROM public_marketing_pages WHERE slug = 'sstc');

UPDATE public_website_support_sites
SET name = 'Summit Stats Team Challenge',
    website_url = 'https://summitstatstc.com',
    logo_url = '/assets/sstc/logo.png',
    industries_json = JSON_ARRAY('Fitness group web application', 'Team competitions & activity tracking'),
    coming_soon = 0
WHERE slug = 'sstc';
