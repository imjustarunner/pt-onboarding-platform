-- NULL preserves the existing late-fee fallback until a separate no-show fee is selected.
SET @has_no_show_fee = (SELECT COUNT(*) FROM information_schema.columns
 WHERE table_schema=DATABASE() AND table_name='booking_cancellation_policies' AND column_name='no_show_fee_cents');
SET @ddl = IF(@has_no_show_fee=0,
 'ALTER TABLE booking_cancellation_policies ADD COLUMN no_show_fee_cents INT UNSIGNED NULL AFTER late_fee_cents',
 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
