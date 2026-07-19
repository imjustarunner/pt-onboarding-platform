-- Migration 975: Provider credential tiers that may bill each medical service code

ALTER TABLE agency_medical_service_codes
  ADD COLUMN allowed_credential_tiers_json JSON NULL
    COMMENT '["qbha","bachelors","intern_plus"] — null means all tiers may bill';
;