-- Migration 1146: add whiteboard_data JSON column to task_projects
-- Stores the serialized whiteboard state (strokes, shapes, text) as JSON.

ALTER TABLE task_projects
  ADD COLUMN whiteboard_data LONGTEXT NULL DEFAULT NULL
    COMMENT 'JSON-serialized whiteboard canvas state';
