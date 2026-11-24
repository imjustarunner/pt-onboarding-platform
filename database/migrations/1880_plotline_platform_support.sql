-- Plotline is a product operated by PlotTwistCo, not an employer PO department.
-- A future legal-entity transfer changes the operator mapping, not old tickets.
CREATE TABLE IF NOT EXISTS platform_support_products (
 product_key VARCHAR(60) NOT NULL PRIMARY KEY,
 product_name VARCHAR(120) NOT NULL,
 operator_name VARCHAR(120) NOT NULL,
 operator_agency_id INT NOT NULL,
 default_owner_user_id INT NULL,
 is_active TINYINT(1) NOT NULL DEFAULT 1
);
INSERT IGNORE INTO platform_support_products
 (product_key,product_name,operator_name,operator_agency_id)
 VALUES ('plotline','Plotline','PlotTwistCo',1);
-- No message text, email addresses or bearer capabilities in this retry ledger.
CREATE TABLE IF NOT EXISTS platform_support_submissions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 product_key VARCHAR(60) NOT NULL,
 reference_request_id INT NULL,
 source_agency_id INT NULL,
 submission_key CHAR(36) NOT NULL,
 payload_fingerprint CHAR(64) NOT NULL,
 support_ticket_id INT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY platform_support_submission (product_key,submission_key),
 UNIQUE KEY platform_support_ticket (support_ticket_id),
 KEY platform_support_reference (reference_request_id,created_at)
);
