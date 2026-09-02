-- Clinical migration 012: content review columns on clinical_notes
-- Review checks note body content only (never demographics/PHI fields).
-- Termination/contact notes use review instead of supervisor cosign.

ALTER TABLE clinical_notes
  ADD COLUMN content_review_status VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'pending|passed|not_required — AI content checklist (not demographics/PHI)',
  ADD COLUMN content_review_source VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'ai_generated|ai_checked|manual — how content review was satisfied',
  ADD COLUMN content_review_json JSON NULL
    COMMENT 'Checklist items and review metadata (content only; no demographics/PHI)';
