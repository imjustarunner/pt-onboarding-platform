-- Explicit, one-session staff requests. No watches are enabled by migration.
CREATE TABLE IF NOT EXISTS portal_activity_watches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  target_user_id INT NOT NULL,
  observer_user_id INT NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  sender_identity_id INT NOT NULL,
  request_key VARCHAR(64) NOT NULL,
  not_before DATETIME(3) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Denver',
  status ENUM('armed','watching','completed','canceled','attention') NOT NULL DEFAULT 'armed',
  session_ref CHAR(64) NULL,
  login_at DATETIME(3) NULL,
  ended_at DATETIME(3) NULL,
  end_reason VARCHAR(64) NULL,
  login_state ENUM('pending','sending','sent','attention') NOT NULL DEFAULT 'pending',
  summary_state ENUM('pending','sending','sent','attention') NOT NULL DEFAULT 'pending',
  login_receipt_json JSON NULL,
  summary_receipt_json JSON NULL,
  report_json JSON NULL,
  error_code VARCHAR(100) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  open_watch TINYINT GENERATED ALWAYS AS (CASE WHEN status IN ('armed','watching','attention') THEN 1 ELSE NULL END) STORED,
  UNIQUE KEY uq_portal_watch_request (observer_user_id, request_key),
  UNIQUE KEY uq_portal_watch_open (agency_id, target_user_id, observer_user_id, open_watch),
  KEY idx_portal_watch_worker (status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Delivery types only. No user is monitored until an administrator creates an
-- explicit, agency-scoped watch; its stored observer is the sole recipient.
INSERT IGNORE INTO notification_triggers
  (trigger_key,name,description,default_enabled,default_channels_json,default_recipients_json)
VALUES
  ('portal_activity_login','Requested portal sign-in alert','One sign-in alert for an explicitly requested guardian session watch.',1,'{"inApp":false,"email":true,"sms":false}','{"admin":true}'),
  ('portal_activity_summary','Requested portal session audit','One activity summary when an explicitly requested guardian session ends.',1,'{"inApp":false,"email":true,"sms":false}','{"admin":true}');
