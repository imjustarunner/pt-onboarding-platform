-- Existing healthcare agencies start with mandatory 90-day renewal; new agencies use the same runtime defaults.
UPDATE agencies
SET treatment_plan_max_age_days = 90,
    feature_flags = JSON_SET(COALESCE(feature_flags, JSON_OBJECT()), '$.treatmentPlanRenewal',
      JSON_OBJECT('flagEnabled', TRUE, 'forceUpdate', TRUE, 'flagAfterDays', 75, 'renewAfterDays', 90))
WHERE organization_type IN ('agency', 'clinical')
  AND JSON_EXTRACT(COALESCE(feature_flags, JSON_OBJECT()), '$.treatmentPlanRenewal') IS NULL;
