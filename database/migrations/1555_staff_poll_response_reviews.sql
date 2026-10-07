-- Keep original staff replies intact. Reviews are append-only and apply only to
-- the exact reply version reviewed; a new participant reply resets categorization.
CREATE TABLE IF NOT EXISTS staff_poll_response_reviews (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 company_event_id INT NOT NULL,
 response_id INT NOT NULL,
 original_body TEXT NOT NULL,
 original_received_at DATETIME NOT NULL,
 bucket_key VARCHAR(64) NULL,
 excluded BOOLEAN NOT NULL DEFAULT FALSE,
 reason VARCHAR(1000) NOT NULL,
 reviewed_by_user_id INT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_poll_response_review (company_event_id,response_id,id)
);
