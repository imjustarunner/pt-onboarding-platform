-- Migration: Add checklist nesting support
-- Description: Add training_focus_id and module_id columns to custom_checklist_items to support nesting under training focuses and modules

ALTER TABLE custom_checklist_items
ADD COLUMN training_focus_id INT NULL AFTER parent_item_id,
ADD COLUMN module_id INT NULL AFTER training_focus_id;

-- Add foreign keys
ALTER TABLE custom_checklist_items
ADD CONSTRAINT fk_checklist_training_focus
  FOREIGN KEY (training_focus_id) REFERENCES training_tracks(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_checklist_module
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX idx_training_focus ON custom_checklist_items(training_focus_id);
CREATE INDEX idx_module ON custom_checklist_items(module_id);
