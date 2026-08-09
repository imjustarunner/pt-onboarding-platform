-- Migration 1158: Demo Playground public-facing pages, branding refresh, and careers seed

SET @demo_id = (
  SELECT id FROM agencies WHERE slug = 'demo' AND organization_type = 'agency' LIMIT 1
);

SET @demo_admin_user_id = (
  SELECT id FROM users WHERE LOWER(email) = 'admin@demtest.com' LIMIT 1
);

-- Warmer, professional palette (teal / navy / amber — less purple/indigo)
UPDATE agencies
SET
  color_palette = CAST('{"primary":"#0F766E","secondary":"#1E3A8A","accent":"#D97706"}' AS JSON),
  logo_url = '/assets/demo/demo-playground-icon.svg',
  careers_page_json = CAST('{
    "accentColor":"#0F766E",
    "heroHeadline":"Build something meaningful.",
    "heroSubheadline":"Grow with a team that cares.",
    "lead":"Demo Playground is a safe sandbox for exploring careers, intake, and community-facing workflows — the same tools your live tenant will use.",
    "heroImageUrl":"/assets/careers/heroes/neutral-framed.png",
    "heroImageAlt":"Welcoming team environment — Demo Playground careers",
    "heroFrameStyle":"preframed",
    "showLeafAccent":false,
    "navItems":[
      {"label":"Why join us","style":"link","action":"why","icon":"care","href":""},
      {"label":"Our impact","style":"link","action":"impact","icon":"team","href":""},
      {"label":"View open roles","style":"button","action":"jobs","href":"#jobs"}
    ],
    "featureCards":[
      {"icon":"team","title":"Collaborative teams","body":"School-based and office-based roles with clear handoffs and shared tools."},
      {"icon":"growth","title":"Room to grow","body":"Supervision, training, and advancement pathways built into how we work."}
    ],
    "bannerText":"Explore hiring, intake, and public pages in a fully featured demo tenant.",
    "bannerBullets":["Live careers page","Office join intake","Appointment request form"],
    "bannerLinkText":"Learn more about Demo Playground",
    "bannerLinkHref":"","bannerLinkAction":"why",
    "whyModal":{"enabled":true,"title":"Why Demo Playground","subtitle":"A realistic environment for testing outreach, hiring, and intake before you go live.","icon":"care","cards":[{"icon":"team","title":"Purpose-driven work","body":"Practice the same public workflows your families and applicants will see."},{"icon":"growth","title":"Clear pathways","body":"From application to onboarding — see the full journey end to end."},{"icon":"learning","title":"Training built in","body":"Onboarding packages, checklists, and learning modules ready to explore."},{"icon":"care","title":"People-first design","body":"Tools shaped for behavioral health and education teams."}],"ctaText":"View open roles","ctaAction":"jobs","ctaHref":"#jobs"},
    "impactModal":{"enabled":true,"title":"Demo impact snapshot","subtitle":"Sample metrics for preview — replace with your agency story when you go live.","icon":"community","stats":[{"icon":"team","value":"1,200+","label":"Students supported","body":"Representative caseload across school and office programs."},{"icon":"learning","value":"12","label":"Partner schools","body":"District and charter partners in the sandbox dataset."},{"icon":"care","value":"8,500+","label":"Sessions delivered","body":"Illustrative volume for reporting and ops dashboards."},{"icon":"badge","value":"45+","label":"Team members","body":"Providers, facilitators, and support staff in the demo roster."}],"growthTitle":"Growth over four years","growthLabel":"Students supported","growthPoints":[{"label":"2022","value":420},{"label":"2023","value":780},{"label":"2024","value":1100},{"label":"2025","value":1200}],"sidebarTitle":"Ready for your story","sidebarBody":"Swap in your own impact numbers, photos, and copy from Admin → Careers when you launch.","sidebarButtonText":"Learn more","sidebarButtonHref":"","sidebarButtonAction":"why"}
  }' AS JSON),
  updated_at = NOW()
WHERE id = @demo_id;

-- Adaptive intake / Office Join — counseling service enabled
INSERT INTO agency_public_service_types (
  agency_id, service_type, display_name, intro_blurb, is_enabled, sort_order
)
SELECT
  @demo_id,
  'counseling',
  'Mental Health Counseling',
  'Start counseling for yourself or a family member. Choose a provider, share a few details, and our team will follow up to schedule.',
  1,
  0
FROM DUAL
WHERE @demo_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agency_public_service_types
    WHERE agency_id = @demo_id AND service_type = 'counseling'
  );

INSERT INTO agency_public_service_types (
  agency_id, service_type, display_name, intro_blurb, is_enabled, sort_order
)
SELECT
  @demo_id,
  'tutoring',
  'Academic Tutoring',
  'Request tutoring support for a student. Tell us about goals and availability — we will match you with the right facilitator.',
  1,
  1
FROM DUAL
WHERE @demo_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agency_public_service_types
    WHERE agency_id = @demo_id AND service_type = 'tutoring'
  );

-- Sample open role for the public careers page
INSERT INTO hiring_job_descriptions (
  agency_id,
  title,
  description_text,
  is_active,
  created_by_user_id,
  posted_date,
  city,
  state,
  education_level,
  role_type,
  is_featured
)
SELECT
  @demo_id,
  'Mental Health Clinician (School-Based)',
  'Join our school-based team providing individual and group counseling for students. This demo posting shows how careers, applications, and hiring workflows connect in PlotTwist HQ.',
  1,
  COALESCE(@demo_admin_user_id, 1),
  CURDATE(),
  'Denver',
  'CO',
  'masters',
  'clinician',
  1
FROM DUAL
WHERE @demo_id IS NOT NULL
  AND @demo_admin_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM hiring_job_descriptions
    WHERE agency_id = @demo_id
      AND title = 'Mental Health Clinician (School-Based)'
  );

SET @demo_job_id = (
  SELECT id FROM hiring_job_descriptions
  WHERE agency_id = @demo_id
    AND title = 'Mental Health Clinician (School-Based)'
  LIMIT 1
);

INSERT INTO intake_links (
  public_key,
  title,
  description,
  scope_type,
  form_type,
  organization_id,
  job_description_id,
  is_active,
  create_client,
  create_guardian,
  created_by_user_id
)
SELECT
  'demoPgClinicianApp2026',
  'Apply — Mental Health Clinician (School-Based)',
  'Public job application for Demo Playground',
  'agency',
  'job_application',
  @demo_id,
  @demo_job_id,
  1,
  0,
  0,
  @demo_admin_user_id
FROM DUAL
WHERE @demo_id IS NOT NULL
  AND @demo_job_id IS NOT NULL
  AND @demo_admin_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM intake_links WHERE public_key = 'demoPgClinicianApp2026'
  );
