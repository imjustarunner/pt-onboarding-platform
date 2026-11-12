CREATE TABLE IF NOT EXISTS payroll_compliance_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  user_id INT NOT NULL,
  requested_by_user_id INT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'sending',
  communication_id INT NULL,
  sent_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_payroll_compliance_provider (agency_id,payroll_period_id,user_id)
);

-- Preserve confirmed earlier sends when an existing period-specific audit marker
-- and one delivery receipt establish the same provider and send window.
INSERT IGNORE INTO payroll_compliance_deliveries
  (agency_id,payroll_period_id,user_id,requested_by_user_id,status,communication_id,sent_at)
SELECT n.agency_id,
  CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(n.trigger_key,'|user:',1),'period:',-1) AS UNSIGNED),
  n.provider_user_id,MIN(c.generated_by_user_id),'sent',MIN(c.id),MIN(c.sent_at)
FROM notification_events n JOIN user_communications c
  ON c.agency_id=n.agency_id AND c.user_id=n.provider_user_id AND c.template_type='compliance_digest'
  AND c.delivery_status IN ('sent','delivered','opened') AND c.sent_at>=n.created_at
  AND c.sent_at<DATE_ADD(n.created_at,INTERVAL 5 MINUTE)
WHERE n.trigger_key REGEXP '^compliance_digest_send[|]period:[0-9]+[|]user:[0-9]+[|]at:'
  AND c.external_message_id IS NOT NULL
  AND JSON_EXTRACT(c.metadata,'$.testInboxRedirect') IS NULL
  AND JSON_EXTRACT(c.metadata,'$.testInboxRedirected') IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM notification_events other
    WHERE other.agency_id=n.agency_id AND other.provider_user_id=n.provider_user_id
      AND other.trigger_key LIKE 'compliance_digest_send|period:%'
      AND SUBSTRING_INDEX(other.trigger_key,'|user:',1)<>SUBSTRING_INDEX(n.trigger_key,'|user:',1)
      AND c.sent_at>=other.created_at AND c.sent_at<DATE_ADD(other.created_at,INTERVAL 5 MINUTE)
  )
GROUP BY n.agency_id,2,n.provider_user_id
HAVING COUNT(DISTINCT c.id)=1;
