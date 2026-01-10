-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS onboarding_db;
USE onboarding_db;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'employee') DEFAULT 'employee',
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
);

-- Modules table
CREATE TABLE IF NOT EXISTS modules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order (order_index),
    INDEX idx_active (is_active)
);

-- Module content table
CREATE TABLE IF NOT EXISTS module_content (
    id INT AUTO_INCREMENT PRIMARY KEY,
    module_id INT NOT NULL,
    content_type ENUM('video', 'slide', 'quiz') NOT NULL,
    content_data JSON NOT NULL,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    INDEX idx_module (module_id),
    INDEX idx_order (order_index)
);

-- User progress table
CREATE TABLE IF NOT EXISTS user_progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    module_id INT NOT NULL,
    status ENUM('not_started', 'in_progress', 'completed') DEFAULT 'not_started',
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    time_spent_minutes INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_module (user_id, module_id),
    INDEX idx_user (user_id),
    INDEX idx_module (module_id),
    INDEX idx_status (status)
);

-- Quiz attempts table
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    module_id INT NOT NULL,
    score DECIMAL(5,2),
    answers JSON NOT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_module (module_id)
);

-- Signatures table
CREATE TABLE IF NOT EXISTS signatures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    module_id INT NOT NULL,
    signature_data TEXT NOT NULL,
    signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_module_signature (user_id, module_id),
    INDEX idx_user (user_id),
    INDEX idx_module (module_id)
);

-- Time logs table
CREATE TABLE IF NOT EXISTS time_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    module_id INT NOT NULL,
    session_start TIMESTAMP NOT NULL,
    session_end TIMESTAMP,
    duration_minutes INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_module (module_id),
    INDEX idx_session_start (session_start)
);

-- Note: Admin user should be created via the API after starting the server
-- Use the /api/auth/register endpoint (requires admin auth) or create via script

