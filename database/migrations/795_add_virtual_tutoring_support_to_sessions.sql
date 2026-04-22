-- Migration: Add virtual tutoring support to learning_class_sessions (final safe version)
-- Description: Extends the existing learning_class_sessions table (which already supports mode='individual')
-- to fully support dedicated 1:1 virtual tutoring sessions as per VIRTUAL_TUTORING_GUIDE.md.
-- Adds columns for Vonage integration, transcripts, AI insights (strengths/needs mapped to standards),
-- primary worksheet/assignment linkage, and session subtype for distinction from group classes.
-- Aligns with STANDARDS_ALIGNED_LEARNING_SYSTEM_INITIATIVE.md by supporting direct links to learning_goals
-- and learning_assignments for standards-aligned homework generation and progress tracking.
--
-- This enables the separate VirtualTutoringSessionView dashboard, transcript AI analysis,
-- branded homework PDFs for guardians, and real-time progress insights.
--
-- NOTE: The migration runner ignores "duplicate column" and "constraint exists" errors (see similar migrations like 334, 738). This is safe to re-run.

SELECT 'Starting virtual tutoring migration (safe version - duplicate column errors are ignored by runner)...' AS status;

-- Add columns (safe to re-run; runner handles duplicates)
ALTER TABLE learning_class_sessions ADD COLUMN session_subtype ENUM('class', 'tutoring') NULL DEFAULT NULL AFTER `mode`;
ALTER TABLE learning_class_sessions ADD COLUMN vonage_session_id VARCHAR(255) NULL AFTER `twilio_room_unique_name`;
ALTER TABLE learning_class_sessions ADD COLUMN transcript_text LONGTEXT NULL AFTER `vonage_session_id`;
ALTER TABLE learning_class_sessions ADD COLUMN ai_summary_json JSON NULL AFTER `transcript_text`;
ALTER TABLE learning_class_sessions ADD COLUMN primary_assignment_id BIGINT NULL AFTER `ai_summary_json`;
ALTER TABLE learning_class_sessions ADD COLUMN standards_context_json JSON NULL COMMENT 'Standards domains/goals active in this tutoring session' AFTER `primary_assignment_id`;

-- Add index (safe)
ALTER TABLE learning_class_sessions ADD INDEX idx_learning_class_sessions_tutoring (session_subtype, status, starts_at);

-- Add FK (safe - runner ignores if exists)
ALTER TABLE learning_class_sessions ADD CONSTRAINT fk_learning_class_sessions_primary_assignment 
  FOREIGN KEY (primary_assignment_id) REFERENCES learning_assignments(id) ON DELETE SET NULL;

-- Safe update for existing individual mode sessions to mark as tutoring (idempotent)
UPDATE learning_class_sessions 
SET session_subtype = 'tutoring' 
WHERE mode = 'individual' 
  AND (session_subtype IS NULL OR session_subtype = '')
  AND (title LIKE '%tutor%' OR title LIKE '%tutoring%')
LIMIT 50;

-- Update table comment
ALTER TABLE learning_class_sessions 
  COMMENT = 'Supports both group classes and individual virtual tutoring (session_subtype = tutoring). Integrates with Vonage video, agents for AI tutor, learning standards (CAS/CMAS), transcripts for progress analysis, and guardian homework exports.';

SELECT 'Virtual tutoring session enhancements migration completed successfully. All columns, index, FK, and comments added (or already present). LearningClassSession.model.js supports the new fields. Restart dev server if needed.' AS migration_status;
