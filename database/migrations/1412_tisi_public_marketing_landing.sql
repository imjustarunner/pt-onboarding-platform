-- Migration 1412: Seed Inner Strength Institute public marketing landing (/p/tisi)
-- Dedicated Vue template PublicMarketingLandingTisiView renders when slug = tisi.
-- Linked nav/service pages are markdown contentPages marked Coming soon for iterative build-out.

INSERT INTO public_marketing_pages (
  slug,
  title,
  is_active,
  page_type,
  hero_title,
  hero_subtitle,
  hero_image_url,
  branding_json,
  seo_json,
  metrics_profile
)
SELECT
  'tisi',
  'Inner Strength Institute',
  1,
  'marketing_landing',
  'Build Inner Strength',
  'Compassionate, expert mental health services for men, boys, athletes and everyone on the journey to a healthier, more resilient life.',
  '/assets/careers/heroes/colorado-photo.png',
  CAST('{
    "landingTemplate": "tisi",
    "siteName": "Inner Strength Institute",
    "tagline": "Stronger People. Brighter Tomorrows.",
    "logoUrl": "/assets/branding/innerstrength-mark.png",
    "ctaHref": "/p/tisi/get-started",
    "ctaImageUrl": "/assets/careers/heroes/colorado-photo.png",
    "contactEmail": "hello@theinnerstrengthinstitute.com",
    "contactPhone": "Phone — coming soon",
    "contactAddress": "Colorado — details coming soon",
    "primaryNav": [
      {"label": "Home", "href": "/p/tisi"},
      {"label": "Services", "href": "/p/tisi/services"},
      {"label": "Who We Help", "href": "/p/tisi/who-we-help"},
      {"label": "About", "href": "/p/tisi/about"},
      {"label": "Resources", "href": "/p/tisi/resources"},
      {"label": "Contact", "href": "/p/tisi/contact"}
    ],
    "legalFooterTitle": "Legal",
    "legalFooterLinks": [
      {"label": "Privacy Policy", "href": "/p/tisi/privacy"},
      {"label": "Terms of Service", "href": "/p/tisi/terms"},
      {"label": "Accessibility", "href": "/p/tisi/accessibility"}
    ],
    "landing": {
      "heroEyebrow": "Mental health care for a stronger tomorrow",
      "heroTitle": "Build Inner Strength",
      "heroSubtitle": "Compassionate, expert mental health services for men, boys, athletes and everyone on the journey to a healthier, more resilient life.",
      "heroScript": "Stronger People\\nBrighter Tomorrows",
      "supportKicker": "Real people. Real potential.",
      "supportTitle": "Who We Support",
      "supportBody": "We create a welcoming, inclusive space for growth — whether you are navigating pressure, purpose, performance, or the next chapter of life.",
      "servicesTitle": "Our Services",
      "whyTitle": "Why Clients Choose Inner Strength Institute",
      "processKicker": "Simple steps. Meaningful progress.",
      "processTitle": "How It Works",
      "testimonialsTitle": "What Our Clients Say",
      "ctaTitle": "Ready to Take the Next Step?",
      "ctaBody": "Reach out today for a confidential consultation. A healthier, stronger you is possible.",
      "ctaNote": "No pressure. Just a conversation."
    },
    "contentPages": [
      {
        "slug": "services",
        "title": "Our Services",
        "body": "## Coming soon\\n\\nWe are building out detailed service pages for Individual Therapy, Adolescent Counseling, Sports & Performance Support, Anxiety & Stress, Depression & Mood Support, and Life Transitions.\\n\\nIn the meantime, [return home](/p/tisi) or [get started](/p/tisi/get-started)."
      },
      {
        "slug": "who-we-help",
        "title": "Who We Help",
        "body": "## Coming soon\\n\\nDedicated pages for the people we support — men, boys, athletes, and more — are on the way.\\n\\n[Explore Men](/p/tisi/men) · [Boys](/p/tisi/boys) · [Athletes](/p/tisi/athletes) · [Home](/p/tisi)"
      },
      {
        "slug": "men",
        "title": "Support for Men",
        "body": "## Coming soon\\n\\nA focused page for men navigating pressure, identity, purpose, and life challenges is coming soon.\\n\\n[Back to home](/p/tisi) · [Get started](/p/tisi/get-started)"
      },
      {
        "slug": "boys",
        "title": "Support for Boys",
        "body": "## Coming soon\\n\\nGuidance for boys facing today''s challenges and building tomorrow''s brighter future — full page coming soon.\\n\\n[Back to home](/p/tisi) · [Get started](/p/tisi/get-started)"
      },
      {
        "slug": "athletes",
        "title": "Support for Athletes",
        "body": "## Coming soon\\n\\nMental skills, resilience, and support on and off the field — this page is coming soon.\\n\\n[Back to home](/p/tisi) · [Get started](/p/tisi/get-started)"
      },
      {
        "slug": "about",
        "title": "About Inner Strength Institute",
        "body": "## Coming soon\\n\\nOur story, mission, and team overview will live here.\\n\\n[Back to home](/p/tisi)"
      },
      {
        "slug": "resources",
        "title": "Resources",
        "body": "## Coming soon\\n\\nArticles, tools, and community resources are on the way. Social channels will also be linked from here.\\n\\n[Back to home](/p/tisi)"
      },
      {
        "slug": "contact",
        "title": "Contact",
        "body": "## Coming soon\\n\\nA secure contact form and full office details will appear here soon.\\n\\nEmail us at **hello@theinnerstrengthinstitute.com** for now, or [get started](/p/tisi/get-started).\\n\\n[Back to home](/p/tisi)"
      },
      {
        "slug": "get-started",
        "title": "Get Started",
        "body": "## Coming soon\\n\\nOur intake / consultation request flow is next. Thank you for your interest in Inner Strength Institute.\\n\\nEmail **hello@theinnerstrengthinstitute.com** and we will follow up.\\n\\n[Back to home](/p/tisi)"
      },
      {
        "slug": "individual-therapy",
        "title": "Individual Therapy",
        "body": "## Coming soon\\n\\nDetails about individual therapy at Inner Strength Institute are coming soon.\\n\\n[All services](/p/tisi/services) · [Get started](/p/tisi/get-started)"
      },
      {
        "slug": "adolescent-counseling",
        "title": "Adolescent Counseling",
        "body": "## Coming soon\\n\\nDetails about adolescent counseling are coming soon.\\n\\n[All services](/p/tisi/services) · [Get started](/p/tisi/get-started)"
      },
      {
        "slug": "sports-performance",
        "title": "Sports & Performance Support",
        "body": "## Coming soon\\n\\nDetails about sports and performance support are coming soon.\\n\\n[All services](/p/tisi/services) · [Get started](/p/tisi/get-started)"
      },
      {
        "slug": "anxiety-stress",
        "title": "Anxiety & Stress",
        "body": "## Coming soon\\n\\nDetails about anxiety and stress support are coming soon.\\n\\n[All services](/p/tisi/services) · [Get started](/p/tisi/get-started)"
      },
      {
        "slug": "depression-mood",
        "title": "Depression & Mood Support",
        "body": "## Coming soon\\n\\nDetails about depression and mood support are coming soon.\\n\\n[All services](/p/tisi/services) · [Get started](/p/tisi/get-started)"
      },
      {
        "slug": "life-transitions",
        "title": "Life Transitions",
        "body": "## Coming soon\\n\\nDetails about life-transition support are coming soon.\\n\\n[All services](/p/tisi/services) · [Get started](/p/tisi/get-started)"
      },
      {
        "slug": "privacy",
        "title": "Privacy Policy",
        "body": "## Coming soon\\n\\nOur full privacy policy will be published here.\\n\\n[Back to home](/p/tisi)"
      },
      {
        "slug": "terms",
        "title": "Terms of Service",
        "body": "## Coming soon\\n\\nOur terms of service will be published here.\\n\\n[Back to home](/p/tisi)"
      },
      {
        "slug": "accessibility",
        "title": "Accessibility",
        "body": "## Coming soon\\n\\nOur accessibility statement will be published here.\\n\\n[Back to home](/p/tisi)"
      }
    ]
  }' AS JSON),
  CAST('{
    "title": "Inner Strength Institute | Mental Health Care",
    "description": "Compassionate mental health services for men, boys, athletes, and everyone building a stronger tomorrow."
  }' AS JSON),
  NULL
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM public_marketing_pages WHERE slug = 'tisi'
);

-- Optionally attach TISI agency as a source (for future listings / partners).
INSERT INTO public_marketing_page_sources (page_id, source_type, source_id, sort_order, is_active)
SELECT p.id, 'agency', a.id, 0, 1
FROM public_marketing_pages p
JOIN agencies a ON LOWER(a.slug) IN ('tisi', 'innerstrength', 'theinnerstrengthinstitute', 'inner-strength')
WHERE p.slug = 'tisi'
  AND NOT EXISTS (
    SELECT 1
    FROM public_marketing_page_sources s
    WHERE s.page_id = p.id AND s.source_type = 'agency' AND s.source_id = a.id
  )
LIMIT 1;
