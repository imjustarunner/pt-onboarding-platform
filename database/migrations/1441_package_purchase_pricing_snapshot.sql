-- Preserve the purchased provider rate, session count and cancellation terms.
ALTER TABLE booking_package_entitlements ADD COLUMN pricing_snapshot_json JSON NULL;
