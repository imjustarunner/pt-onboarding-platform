-- Migration: Add agencies table
-- Description: Support for multi-agency architecture

CREATE TABLE IF NOT EXISTS agencies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url VARCHAR(500),
    color_palette JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_slug (slug),
    INDEX idx_active (is_active)
);

-- Create default PlotTwistCo agency
INSERT INTO agencies (name, slug, is_active, color_palette) 
VALUES ('PlotTwistCo', 'plottwistco', TRUE, '{"primary": "#4f46e5", "secondary": "#7c3aed", "accent": "#06b6d4"}')
ON DUPLICATE KEY UPDATE name=name;

