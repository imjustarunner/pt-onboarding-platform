-- Current legacy fee items remain a supported input to canonical claim quotes.
-- This changes fee configuration only, not submitted or saved claim amounts.
UPDATE medical_fee_schedule_items SET unit_price_cents=13500 WHERE UPPER(TRIM(procedure_code))='90791';
