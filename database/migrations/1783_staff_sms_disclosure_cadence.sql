-- Receipt of a campaign reminder, never consent or an opt-out override.
CREATE TABLE IF NOT EXISTS sms_program_opt_out_notices (
  scope_key VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  last_sent_at DATETIME NOT NULL,
  provider_message_id VARCHAR(100) NULL,
  PRIMARY KEY (scope_key, phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserve evidence of recently accepted legacy event notices so upgrading does
-- not repeat the same STOP paragraph on the recipient's very next poll.
INSERT INTO sms_program_opt_out_notices (scope_key, phone, last_sent_at)
SELECT CONCAT('campaign:', campaign_id), phone, MAX(created_at)
FROM company_event_sms_deliveries
WHERE purpose IN ('polling', 'workforce') AND status IN ('sent', 'delivered')
  AND provider_message_id IS NOT NULL
  AND (body LIKE '%Reply STOP to%' OR body LIKE '%Text STOP to%' OR body LIKE '%STOP to stop%')
GROUP BY campaign_id, phone
ON DUPLICATE KEY UPDATE last_sent_at = GREATEST(last_sent_at, VALUES(last_sent_at));
