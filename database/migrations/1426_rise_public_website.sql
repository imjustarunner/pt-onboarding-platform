-- Public marketing is independent of tenant provisioning. The owner will onboard
-- Rise Revive separately, then connect its published enrollment URL in the editor.
-- Preserve existing content and publication status when this seed is rerun.
INSERT INTO public_marketing_pages
  (slug, title, is_active, page_type, hero_title, hero_subtitle, hero_image_url, branding_json, seo_json)
SELECT
  'rise', 'Rise Revive Counseling and Coaching', 1, 'marketing_hub',
  CONCAT('Rise in Strength.', CHAR(10), 'Revive in Purpose.'),
  'In-person and virtual counseling and coaching for individuals ready to build a healthier, more meaningful life.',
  '/assets/rise/mountain-sunrise.webp',
  JSON_OBJECT(
    'landingTemplate', 'rise',
    'siteName', 'Rise Revive Counseling and Coaching',
    'logoUrl', '/assets/rise/logo.webp',
    'designReferenceUrl', '/assets/rise/reference-home.webp',
    'programThemePrimary', '#123f2e',
    'riseWebsite', JSON_OBJECT('enrollmentUrl', '', 'careersUrl', '', 'partnerUrl', '', 'contactUrl', '',
      'openingMessage', 'We’re preparing to welcome you. Online enrollment and appointment requests are not open yet. Please check back for updates.')
  ),
  JSON_OBJECT('title', 'Rise Revive | Counseling and Coaching',
    'description', 'Rise in strength. Revive in purpose. Explore counseling, coaching, and your next chapter with Rise Revive.')
WHERE NOT EXISTS (SELECT 1 FROM public_marketing_pages WHERE slug = 'rise');
