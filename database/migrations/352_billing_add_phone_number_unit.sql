-- Migration: Add phone number unit pricing to platform billing JSON

UPDATE platform_billing_pricing
SET pricing_json = JSON_SET(
  COALESCE(pricing_json, JSON_OBJECT()),
  '$.unitCents.phoneNumber',
  COALESCE(JSON_EXTRACT(pricing_json, '$.unitCents.phoneNumber'), 0)
)
WHERE id = 1;
