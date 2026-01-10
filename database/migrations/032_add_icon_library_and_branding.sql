-- Migration: Add icon library and platform branding system
-- Description: Create icons table, add icon_id to various tables, and create platform_branding table

-- Icons table
CREATE TABLE IF NOT EXISTS icons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255),
    file_size INT,
    mime_type VARCHAR(100),
    category VARCHAR(100) NULL,
    description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id INT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_name (name),
    INDEX idx_category (category),
    INDEX idx_active (is_active)
);

-- Add icon_id to modules
ALTER TABLE modules
ADD COLUMN icon_id INT NULL AFTER standalone_category,
ADD FOREIGN KEY (icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD INDEX idx_icon (icon_id);

-- Add icon_id to training_tracks
ALTER TABLE training_tracks
ADD COLUMN icon_id INT NULL AFTER is_active,
ADD FOREIGN KEY (icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD INDEX idx_icon (icon_id);

-- Add icon_id to agencies
ALTER TABLE agencies
ADD COLUMN icon_id INT NULL AFTER logo_url,
ADD FOREIGN KEY (icon_id) REFERENCES icons(id) ON DELETE SET NULL,
ADD INDEX idx_icon (icon_id);

-- Add icon_id to document_templates (if table exists)
-- Note: This will be handled in a later migration (046a) to avoid PREPARE/EXECUTE issues
-- The table check and column addition will be done there

-- Platform branding table (single row configuration)
CREATE TABLE IF NOT EXISTS platform_branding (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tagline VARCHAR(255) NULL,
    primary_color VARCHAR(7) DEFAULT '#C69A2B',
    secondary_color VARCHAR(7) DEFAULT '#1D2633',
    accent_color VARCHAR(7) DEFAULT '#3A4C6B',
    success_color VARCHAR(7) DEFAULT '#2F8F83',
    background_color VARCHAR(7) DEFAULT '#F3F6FA',
    error_color VARCHAR(7) DEFAULT '#CC3D3D',
    warning_color VARCHAR(7) DEFAULT '#E6A700',
    header_font VARCHAR(100) DEFAULT 'Inter',
    body_font VARCHAR(100) DEFAULT 'Source Sans 3',
    numeric_font VARCHAR(100) DEFAULT 'IBM Plex Mono',
    display_font VARCHAR(100) DEFAULT 'Montserrat',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by_user_id INT NULL,
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default platform branding configuration
INSERT INTO platform_branding (
    tagline,
    primary_color,
    secondary_color,
    accent_color,
    success_color,
    background_color,
    error_color,
    warning_color,
    header_font,
    body_font,
    numeric_font,
    display_font
) VALUES (
    'The gold standard for behavioral health workflows.',
    '#C69A2B',
    '#1D2633',
    '#3A4C6B',
    '#2F8F83',
    '#F3F6FA',
    '#CC3D3D',
    '#E6A700',
    'Inter',
    'Source Sans 3',
    'IBM Plex Mono',
    'Montserrat'
) ON DUPLICATE KEY UPDATE
    tagline = VALUES(tagline),
    primary_color = VALUES(primary_color),
    secondary_color = VALUES(secondary_color),
    accent_color = VALUES(accent_color),
    success_color = VALUES(success_color),
    background_color = VALUES(background_color),
    error_color = VALUES(error_color),
    warning_color = VALUES(warning_color),
    header_font = VALUES(header_font),
    body_font = VALUES(body_font),
    numeric_font = VALUES(numeric_font),
    display_font = VALUES(display_font);

