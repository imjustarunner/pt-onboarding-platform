-- Migration 954: Ask Assistant review signals (thumbs + disengage) for SuperAdmin
ALTER TABLE assistant_route_feedback
  ADD COLUMN event_type VARCHAR(32) NOT NULL DEFAULT 'feedback'
    COMMENT 'feedback | disengage'
    AFTER user_id,
  ADD COLUMN assistant_excerpt VARCHAR(1500) NULL
    COMMENT 'Short snippet of assistant reply for review'
    AFTER prompt,
  ADD COLUMN review_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    COMMENT 'pending | reviewed | dismissed'
    AFTER promote_as_example,
  ADD COLUMN metadata_json JSON NULL
    COMMENT 'Offered actions/cards, disengage reason, etc.'
    AFTER review_status,
  ADD INDEX idx_arf_event_review (event_type, review_status, created_at),
  ADD INDEX idx_arf_helpful_created (helpful, created_at);

-- helpful may be NULL for disengage events (neither up nor down)
ALTER TABLE assistant_route_feedback
  MODIFY COLUMN helpful TINYINT(1) NULL
    COMMENT '1 = thumbs up, 0 = thumbs down, NULL = n/a (e.g. disengage)';
