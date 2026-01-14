-- Migration: Create user_preferences table
-- Description: Store user preferences for notifications, UI, availability, and display settings
-- This table supports the "My Preferences" system as outlined in OVERHAUL_PLAN.md

CREATE TABLE IF NOT EXISTS user_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    
    -- Notification Preferences
    email_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    in_app_enabled BOOLEAN DEFAULT TRUE, -- Always true, cannot be disabled
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_allowed_days JSON NULL, -- Array of day names (e.g., ["Monday", "Tuesday"])
    quiet_hours_start_time TIME NULL,
    quiet_hours_end_time TIME NULL,
    auto_reply_enabled BOOLEAN DEFAULT FALSE,
    auto_reply_message TEXT NULL,
    
    -- Notification Category Preferences (JSON object with category keys and boolean values)
    notification_categories JSON NULL,
    
    -- Availability & Work Style
    work_modality ENUM('in_person', 'telehealth', 'hybrid') NULL,
    scheduling_preferences JSON NULL, -- Preferred buildings, default booking duration, etc.
    
    -- Communication Preferences
    show_read_receipts BOOLEAN DEFAULT FALSE,
    allow_staff_step_in BOOLEAN DEFAULT TRUE,
    
    -- Privacy & Display
    show_full_name_on_schedules BOOLEAN DEFAULT TRUE,
    show_initials_only_on_boards BOOLEAN DEFAULT TRUE,
    allow_name_in_pdfs BOOLEAN DEFAULT TRUE,
    
    -- Accessibility & UI Preferences
    reduced_motion BOOLEAN DEFAULT FALSE,
    high_contrast_mode BOOLEAN DEFAULT FALSE,
    larger_text BOOLEAN DEFAULT FALSE,
    default_landing_page VARCHAR(50) DEFAULT 'dashboard', -- 'dashboard', 'clients', 'schedule'
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
);
