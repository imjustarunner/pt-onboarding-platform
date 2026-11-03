-- Public marketing/demo engagement only. No clinical records, form values or account IDs.
-- AuricWell is a platform product: no tenant source grants access to these reports.
INSERT INTO public_marketing_pages (slug,title,is_active,page_type,hero_title,hero_subtitle)
SELECT 'auricwell','AuricWell website analytics',0,'analytics_only',NULL,
  'Public website and fictional demo engagement.'
WHERE NOT EXISTS (SELECT 1 FROM public_marketing_pages WHERE slug='auricwell');

SET @aw_duration_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='public_website_analytics_events' AND COLUMN_NAME='duration_ms');
SET @aw_duration_ddl = IF(@aw_duration_exists=0,
  'ALTER TABLE public_website_analytics_events ADD COLUMN duration_ms INT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE aw_duration_statement FROM @aw_duration_ddl;
EXECUTE aw_duration_statement;
DEALLOCATE PREPARE aw_duration_statement;

-- Append to the enum so existing event values and retained evidence remain intact.
ALTER TABLE public_website_analytics_events MODIFY COLUMN event_kind ENUM(
  'page_view','section_view','click','profile_open','filter_use','search','scroll_depth',
  'document_view','document_download','page_time','section_time'
) NOT NULL;
