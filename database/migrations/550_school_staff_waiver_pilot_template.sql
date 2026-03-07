-- Seed a concise in-app waiver template for pilot school staff users.
-- Idempotent: inserts only when an active platform template with this name does not exist.

SET @waiver_template_name = CONVERT('School Staff Account & Access Waiver (Pilot)' USING utf8mb4) COLLATE utf8mb4_unicode_ci;
SET @seed_user_id = (
  SELECT id
  FROM users
  WHERE role IN ('super_admin', 'admin', 'staff')
  ORDER BY FIELD(role, 'super_admin', 'admin', 'staff'), id ASC
  LIMIT 1
);

INSERT INTO document_templates (
  name,
  description,
  version,
  template_type,
  file_path,
  html_content,
  agency_id,
  created_by_user_id,
  is_active,
  document_type,
  document_action_type
)
SELECT
  @waiver_template_name,
  'Pilot school staff waiver used for in-app access gating and accountability acknowledgement.',
  1,
  'html',
  NULL,
  '<h1>School Staff Account & Access Waiver</h1>
<p><strong>Effective when signed.</strong> This waiver is required for school staff pilot access in ITSCO.</p>
<ol>
  <li><strong>My activity is tied to me.</strong> I understand actions in this account are logged and linked to my user.</li>
  <li><strong>I protect my account.</strong> I will keep passwords and access details private and will not share them.</li>
  <li><strong>I report compromise immediately.</strong> If I suspect unauthorized access, I will notify ITSCO/support right away. ITSCO may lock my account at any time to protect users.</li>
  <li><strong>ROI limits access.</strong> I understand that when a client''s ROI expires for my school, my access to that client''s information is removed.</li>
  <li><strong>I protect confidentiality.</strong> I will not misuse client information, internal platform details, or agency process details.</li>
  <li><strong>No abuse or bypass.</strong> I will not harass users, misuse tools, attempt unauthorized access, or bypass controls.</li>
  <li><strong>ITSCO privacy commitments.</strong> ITSCO does not sell my data and does not target me with outside-app ads. ITSCO may send relevant in-app service/program announcements.</li>
  <li><strong>Electronic signature acknowledgement.</strong> By signing, I confirm these responsibilities and accept ongoing accountability for account use.</li>
</ol>
<p>If you need account help or immediate lock support, contact ITSCO support.</p>',
  NULL,
  @seed_user_id,
  TRUE,
  'school',
  'signature'
FROM DUAL
WHERE @seed_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM document_templates dt
    WHERE dt.name COLLATE utf8mb4_unicode_ci = @waiver_template_name
      AND dt.agency_id IS NULL
      AND dt.is_active = TRUE
    LIMIT 1
  );

