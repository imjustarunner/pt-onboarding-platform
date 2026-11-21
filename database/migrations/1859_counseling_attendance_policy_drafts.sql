-- Review-ready terms for 90837. Activate only with verified provider and payer
-- eligibility and an applicable signed attendance agreement. No fees are enabled.
INSERT INTO booking_cancellation_policies (
  agency_id, name, description, scope_level, business_type, service_code,
  notice_hours, late_fee_cents, no_show_fee_cents, is_active
)
SELECT a.id, '90837 counseling missed visits (review required)',
  'Proposed terms for fully licensed counselors. Verify licensure, payer terms, and the client’s signed agreement before assessing a fee.',
  'tenant', 'mental_health', '90837', 24, 8000, 10000, 0
FROM agencies a
WHERE COALESCE(a.is_archived, 0) = 0
  AND LOWER(COALESCE(NULLIF(a.slug, ''), a.portal_url)) IN (
    'itsco', 'nlu', 'next-level-up', 'nextlevelup', 'nextleveluplcc',
    'tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute', 'the-inner-strength-institute'
  )
  AND NOT EXISTS (
    SELECT 1 FROM booking_cancellation_policies existing
    WHERE existing.agency_id = a.id
      AND existing.name = '90837 counseling missed visits (review required)'
  );
