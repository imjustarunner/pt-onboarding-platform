-- Migration 1382: Tenant HTML email header/footer assets (Email Settings)
ALTER TABLE agency_email_settings
  ADD COLUMN html_email_header_url VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'Public URL or /email-branding/... path for HTML email header banner',
  ADD COLUMN html_email_footer_url VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'Public URL or /email-branding/... path for HTML email footer banner';

-- Seed ITSCO agencies to the bundled ITSCO brand art (relative public paths)
UPDATE agency_email_settings aes
JOIN agencies a ON a.id = aes.agency_id
SET
  aes.html_email_header_url = COALESCE(NULLIF(TRIM(aes.html_email_header_url), ''), '/email-branding/itsco/email-header.png'),
  aes.html_email_footer_url = COALESCE(NULLIF(TRIM(aes.html_email_footer_url), ''), '/email-branding/itsco/email-footer.png')
WHERE LOWER(CONCAT(COALESCE(a.name,''), ' ', COALESCE(a.slug,''), ' ', COALESCE(a.official_name,''))) LIKE '%itsco%';

INSERT INTO agency_email_settings (agency_id, notifications_enabled, html_email_header_url, html_email_footer_url)
SELECT a.id, 1, '/email-branding/itsco/email-header.png', '/email-branding/itsco/email-footer.png'
FROM agencies a
WHERE LOWER(CONCAT(COALESCE(a.name,''), ' ', COALESCE(a.slug,''), ' ', COALESCE(a.official_name,''))) LIKE '%itsco%'
  AND NOT EXISTS (SELECT 1 FROM agency_email_settings aes WHERE aes.agency_id = a.id);
