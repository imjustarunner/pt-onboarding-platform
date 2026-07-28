-- Migration 1064: flag historical auto employee clock-out claims for payroll review
-- Auto clock-out (last client checkout + 90 minutes) created silent submitted claims.
-- Mark those payloads so payroll UI can show "Auto — verify".

UPDATE payroll_time_claims
SET payload_json = JSON_SET(
      COALESCE(payload_json, JSON_OBJECT()),
      '$.needsVerification', TRUE,
      '$.autoClockOut', TRUE,
      '$.verificationReason', 'auto_all_clients_out'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE claim_type = 'skill_builder_event'
  AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.source')) = 'auto_all_clients_out'
  AND (
    JSON_EXTRACT(payload_json, '$.needsVerification') IS NULL
    OR JSON_EXTRACT(payload_json, '$.needsVerification') = FALSE
  );
