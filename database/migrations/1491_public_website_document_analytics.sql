-- Append document actions without changing the values of existing event kinds.
-- Safe to run again; existing analytics and retention rules are preserved.
ALTER TABLE public_website_analytics_events
  MODIFY COLUMN event_kind ENUM(
    'page_view','section_view','click','profile_open','filter_use','search','scroll_depth',
    'document_view','document_download'
  ) NOT NULL;
