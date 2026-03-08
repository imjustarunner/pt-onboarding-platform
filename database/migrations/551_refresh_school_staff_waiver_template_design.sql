-- Refresh school-staff waiver template content with a formal, branded layout
-- and define signature placement coordinates for cleaner signed output.

SET @waiver_template_name = CONVERT('School Staff Account & Access Waiver (Pilot)' USING utf8mb4) COLLATE utf8mb4_unicode_ci;

UPDATE document_templates
SET
  html_content = '<h1>School Staff Account & Access Waiver</h1><p><strong>ITSCO</strong></p><p>Required for pilot school staff portal access and ongoing account accountability.</p><h2>Responsibilities and Acknowledgements</h2><ul><li><strong>Accountability:</strong> I understand activity in this account is logged and tied to my user.</li><li><strong>Account security:</strong> I will protect credentials and will not share passwords or access details.</li><li><strong>Compromise reporting:</strong> If I suspect unauthorized access, I will notify ITSCO support immediately. ITSCO may lock my account at any time for protection.</li><li><strong>ROI boundary:</strong> I understand that when a client''s ROI expires for my school, my access to that client''s information is removed.</li><li><strong>Confidentiality:</strong> I will not misuse client information or disclose internal platform/process details inappropriately.</li><li><strong>Abuse and misuse prevention:</strong> I will not harass users, misuse tools, attempt unauthorized access, or bypass controls.</li><li><strong>ITSCO privacy commitments:</strong> ITSCO does not sell my data and does not target me with outside-app ads. ITSCO may send relevant in-app service or program announcements.</li><li><strong>Electronic signature acknowledgement:</strong> By signing, I accept these responsibilities and ongoing accountability for account use.</li></ul><p><strong>Support notice:</strong> If you need account help or immediate lock support, contact ITSCO support.</p><p>School Staff Signature</p>',
  signature_x = 206,
  signature_y = 144,
  signature_width = 200,
  signature_height = 60,
  signature_page = NULL
WHERE name COLLATE utf8mb4_unicode_ci = @waiver_template_name
  AND agency_id IS NULL
  AND is_active = TRUE;

