-- Tenant-editable public support page content/settings.
ALTER TABLE platform_branding
  ADD COLUMN support_page_json JSON NULL COMMENT 'Public support page configuration for tenant-branded /support route';
