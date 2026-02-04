-- Migration: Add inbound SMS unit pricing to platform billing JSON

UPDATE platform_billing_pricing
SET pricing_json = JSON_SET(
  COALESCE(pricing_json, JSON_OBJECT()),
  '$.smsUnitCents.inboundClient',
  COALESCE(JSON_EXTRACT(pricing_json, '$.smsUnitCents.inboundClient'), 0)
)
WHERE id = 1;
