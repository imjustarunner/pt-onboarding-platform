-- Reconcile the retained tables without replaying the colliding historical1721.
-- Activation remains off until an administrator saves reviewed agency settings.
CREATE TABLE IF NOT EXISTS people_operations_notification_recipients (
 agency_id INT NOT NULL,user_id INT NOT NULL,enabled TINYINT(1) NOT NULL DEFAULT 1,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(agency_id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS people_operations_submission_notifications (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,candidate_user_id INT NOT NULL,recipient_user_id INT NOT NULL,
 event_key VARCHAR(180) NOT NULL,event_type VARCHAR(40) NOT NULL,document_title VARCHAR(255) NULL,
 notification_created TINYINT(1) NOT NULL DEFAULT 0,email_status VARCHAR(20) NOT NULL DEFAULT 'pending',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY people_ops_submission_recipient(agency_id,candidate_user_id,recipient_user_id,event_key),
 INDEX people_ops_submission_pending(email_status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Existing live tables lack durable source/receipt binding. Legacy rows retain
-- NULL source_json and are never selected by the new worker. No data backfill.
SET @people_ops_sql=IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
 AND TABLE_NAME='people_operations_submission_notifications' AND COLUMN_NAME='source_json')=0,
 'ALTER TABLE people_operations_submission_notifications ADD COLUMN source_json JSON NULL','SELECT 1');
PREPARE people_ops_stmt FROM @people_ops_sql;
EXECUTE people_ops_stmt;
DEALLOCATE PREPARE people_ops_stmt;
SET @people_ops_sql=IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
 AND TABLE_NAME='people_operations_submission_notifications' AND COLUMN_NAME='communication_id')=0,
 'ALTER TABLE people_operations_submission_notifications ADD COLUMN communication_id INT NULL','SELECT 1');
PREPARE people_ops_stmt FROM @people_ops_sql;
EXECUTE people_ops_stmt;
DEALLOCATE PREPARE people_ops_stmt;

-- Exact server-created receipt ownership; existing user-global documents stay
-- unbound and cannot be announced to a tenant merely through user membership.
SET @people_ops_sql=IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
 AND TABLE_NAME='hiring_prehire_checklist_items' AND COLUMN_NAME='submission_admin_doc_id')=0,
 'ALTER TABLE hiring_prehire_checklist_items ADD COLUMN submission_admin_doc_id INT NULL','SELECT 1');
PREPARE people_ops_stmt FROM @people_ops_sql;
EXECUTE people_ops_stmt;
DEALLOCATE PREPARE people_ops_stmt;
