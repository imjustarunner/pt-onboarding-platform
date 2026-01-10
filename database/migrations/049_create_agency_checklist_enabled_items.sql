-- Migration: Create agency_checklist_enabled_items table
-- Description: Track which platform checklist items are enabled for which agencies

CREATE TABLE IF NOT EXISTS agency_checklist_enabled_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agency_id INT NOT NULL,
    checklist_item_id INT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (checklist_item_id) REFERENCES custom_checklist_items(id) ON DELETE CASCADE,
    UNIQUE KEY unique_agency_item (agency_id, checklist_item_id),
    INDEX idx_agency_id (agency_id),
    INDEX idx_checklist_item_id (checklist_item_id)
);

-- Enable all existing platform items for all existing agencies by default
INSERT INTO agency_checklist_enabled_items (agency_id, checklist_item_id, enabled)
SELECT DISTINCT a.id, cci.id, TRUE
FROM agencies a
CROSS JOIN custom_checklist_items cci
WHERE cci.is_platform_template = TRUE
AND NOT EXISTS (
    SELECT 1 FROM agency_checklist_enabled_items acei
    WHERE acei.agency_id = a.id AND acei.checklist_item_id = cci.id
);

