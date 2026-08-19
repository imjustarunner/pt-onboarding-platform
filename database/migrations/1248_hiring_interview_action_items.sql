-- Migration 1248: Store AI-extracted interview action items on hiring interview artifacts

ALTER TABLE hiring_interview_artifacts
  ADD COLUMN action_items_json JSON NULL
  COMMENT 'AI-extracted interview action items with assignee hints';
