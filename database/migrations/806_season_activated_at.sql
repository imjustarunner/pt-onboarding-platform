-- Migration 806: activated_at on learning_program_classes (records when a season is launched)
ALTER TABLE learning_program_classes
  ADD COLUMN activated_at DATETIME NULL DEFAULT NULL
    COMMENT 'Timestamp when the season was launched (status set to active); defines pre-season start'
    AFTER ends_at;
