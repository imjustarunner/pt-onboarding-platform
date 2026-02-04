-- Track manual OCR requests for referral packets
CREATE TABLE IF NOT EXISTS client_referral_ocr_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  phi_document_id INT NOT NULL,
  requested_by_user_id INT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  result_text LONGTEXT NULL,
  error_message VARCHAR(512) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (phi_document_id) REFERENCES client_phi_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_referral_ocr_client (client_id),
  INDEX idx_referral_ocr_status (status)
);
