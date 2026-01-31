-- Migration: Flag AI-generated hiring research reports
-- Description: Adds is_ai_generated column to hiring_research_reports for AI-generated pre-screen reports.

ALTER TABLE hiring_research_reports
  ADD COLUMN is_ai_generated TINYINT(1) NOT NULL DEFAULT 0 AFTER report_json;

