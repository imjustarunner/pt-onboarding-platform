-- Migration: Create user_accounts table
-- Description: Store confidential account credentials per user (platform and agency level)

CREATE TABLE IF NOT EXISTS user_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_type_id INT NULL,
    username VARCHAR(255) NULL,
    pin VARCHAR(50) NULL,
    temporary_password VARCHAR(255) NULL,
    temporary_link VARCHAR(500) NULL,
    agency_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (account_type_id) REFERENCES account_types(id) ON DELETE SET NULL,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_agency_id (agency_id),
    INDEX idx_account_type (account_type_id)
);

