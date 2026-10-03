-- Migration 1532: Michael V. Mendez consultant tenant
--
-- Michael is the first individual consultant managed by PlotTwistCo.  The
-- consultant is deliberately represented as its own tenant so clients,
-- appointments, service revenue, and future staff can be scoped cleanly while
-- PlotTwistCo remains the managing organization.

SET @plot_twist_agency_id := (
  SELECT id
  FROM agencies
  WHERE LOWER(slug) IN ('plottwistco', 'plottwist-hq')
     OR LOWER(name) IN ('plottwistco', 'plot twist co.', 'plot twist co')
  ORDER BY id
  LIMIT 1
);

SET @michael_user_id := (
  SELECT id
  FROM users
  WHERE (LOWER(COALESCE(first_name, '')) = 'michael'
     AND LOWER(COALESCE(last_name, '')) = 'mendez')
     OR LOWER(COALESCE(email, '')) IN ('michael@michaelvmendez.com', 'michaelvmendez@gmail.com')
  ORDER BY id
  LIMIT 1
);

INSERT INTO agencies (
  name, official_name, slug, portal_url, organization_type, is_active,
  account_owner_user_id, website_url, feature_flags, color_palette,
  public_availability_enabled, public_booking_settings
)
VALUES (
  'Michael V. Mendez Consulting',
  'Michael V. Mendez Consulting',
  'michael',
  'michael',
  'consultant',
  TRUE,
  @michael_user_id,
  'https://michaelvmendez.com',
  JSON_OBJECT(
    'practitionerVertical', 'consultant',
    'portalVariant', 'employee',
    'publicAvailabilityEnabled', TRUE,
    'discoveryBookingEnabled', TRUE,
    'discoveryBookingRequired', FALSE,
    'discoveryDurationMin', 30,
    'discoveryLabel', 'Quick Clarity Call',
    'managedByPlotTwistCo', TRUE
  ),
  JSON_OBJECT('primary', '#6d28d9', 'secondary', '#0b1020', 'accent', '#a78bfa'),
  TRUE,
  JSON_OBJECT(
    'brandDisplayName', 'Michael V. Mendez',
    'ctaLabel', 'Start a Conversation',
    'showNav', FALSE,
    'consultantTagline', 'Build the practice, product, and systems that make your next chapter possible.',
    'consultantBenefits', JSON_ARRAY(
      'Private-practice launch strategy',
      'AI app development and automation',
      'Practical guidance from first idea to sustainable operations'
    ),
    'providerTitleFallback', 'Private Practice & AI Systems Consultant',
    'providerBioFallback', 'I help clinicians, coaches, and purpose-driven founders start or strengthen a private practice, turn good ideas into useful AI applications, and build the operating systems that support sustainable growth.',
    'specialties', JSON_ARRAY(
      'Private practice launch and operations',
      'AI app strategy and development',
      'Workflow design and automation',
      'Offer, pricing, and client journey design',
      'Founder systems and sustainable growth'
    ),
    'whatToExpectTitle', 'A focused working session',
    'whatToExpectBody', 'We will clarify the outcome you want, identify the highest-leverage next steps, and leave you with a practical path forward.',
    'modalityLabel', 'Virtual'
  )
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  official_name = VALUES(official_name),
  portal_url = VALUES(portal_url),
  organization_type = 'consultant',
  is_active = TRUE,
  account_owner_user_id = COALESCE(@michael_user_id, account_owner_user_id),
  website_url = VALUES(website_url),
  feature_flags = VALUES(feature_flags),
  color_palette = VALUES(color_palette),
  public_availability_enabled = TRUE,
  public_booking_settings = VALUES(public_booking_settings);

SET @michael_agency_id := (SELECT id FROM agencies WHERE slug = 'michael' LIMIT 1);

-- PlotTwistCo manages the consultant tenant through the same generalized
-- organization-affiliation relationship used by managed practices.
INSERT INTO organization_affiliations (agency_id, organization_id, is_active)
SELECT @plot_twist_agency_id, @michael_agency_id, TRUE
WHERE @plot_twist_agency_id IS NOT NULL
  AND @michael_agency_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_active = TRUE, updated_at = CURRENT_TIMESTAMP;

INSERT INTO agency_public_service_types
  (agency_id, service_type, display_name, intro_blurb, is_enabled, sort_order)
VALUES
  (@michael_agency_id, 'consulting', 'Consulting with Michael',
   'Get practical guidance for starting your private practice, building an AI-enabled service, or creating the systems that will help your work grow.',
   1, 0)
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  intro_blurb = VALUES(intro_blurb),
  is_enabled = 1;

-- Give Michael a usable default self-pay offer. Payments still flow through
-- the app''s configured Stripe merchant/Connect account; this is only the
-- public rate shown to a prospective client.
INSERT INTO provider_public_profiles
  (user_id, public_blurb, self_pay_rate_cents, self_pay_rate_note, accepting_new_clients_override)
SELECT @michael_user_id,
  'I help clinicians, coaches, and purpose-driven founders move from idea to a clear, workable practice and product system.',
  25000,
  '$250 per 60-minute strategy session',
  TRUE
WHERE @michael_user_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  public_blurb = VALUES(public_blurb),
  self_pay_rate_cents = VALUES(self_pay_rate_cents),
  self_pay_rate_note = VALUES(self_pay_rate_note),
  accepting_new_clients_override = TRUE;

INSERT INTO provider_public_service_enrollments (agency_id, user_id, service_type, is_active)
SELECT @michael_agency_id, @michael_user_id, 'consulting', 1
WHERE @michael_agency_id IS NOT NULL AND @michael_user_id IS NOT NULL
ON DUPLICATE KEY UPDATE is_active = 1;

-- Keep the owner able to enter the new tenant immediately. Existing access is
-- preserved if the user was already associated with another organization.
INSERT INTO user_agencies (user_id, agency_id)
SELECT @michael_user_id, @michael_agency_id
WHERE @michael_user_id IS NOT NULL AND @michael_agency_id IS NOT NULL
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id);
