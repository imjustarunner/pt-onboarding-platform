-- The send gate and Communications Center already record these terminal states.
-- Preserve the original enum order/values while making cancel/skip/flag writable.
ALTER TABLE user_communications
  MODIFY COLUMN delivery_status ENUM('pending','sent','delivered','failed','bounced','undelivered','skipped','flagged','cancelled')
  NULL DEFAULT 'pending' COMMENT 'Delivery status from API';
