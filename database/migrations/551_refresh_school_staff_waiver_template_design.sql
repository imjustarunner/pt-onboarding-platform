-- Refresh school-staff waiver template content with a formal, branded layout
-- and define signature placement coordinates for cleaner signed output.

SET @waiver_template_name = CONVERT('School Staff Account & Access Waiver (Pilot)' USING utf8mb4) COLLATE utf8mb4_unicode_ci;

UPDATE document_templates
SET
  html_content = '
<div style="font-family: Inter, Segoe UI, Arial, sans-serif; color:#0f172a; line-height:1.5;">
  <div style="background:#f4fbf7; border:1px solid #d3eee0; border-radius:12px; padding:14px 18px; margin-bottom:16px;">
    <div style="font-weight:700; color:#0f5132; letter-spacing:0.6px; font-size:12px;">ITSCO</div>
    <h1 style="margin:6px 0 0; font-size:28px; line-height:1.2;">School Staff Account & Access Waiver</h1>
    <p style="margin:8px 0 0; color:#334155;">Required for pilot school staff portal access and ongoing account accountability.</p>
  </div>

  <h2 style="font-size:18px; margin:18px 0 10px;">Responsibilities and Acknowledgements</h2>
  <ul style="margin:0 0 0 20px; padding:0;">
    <li style="margin-bottom:8px;"><strong>Accountability:</strong> I understand activity in this account is logged and tied to my user.</li>
    <li style="margin-bottom:8px;"><strong>Account security:</strong> I will protect credentials and will not share passwords or access details.</li>
    <li style="margin-bottom:8px;"><strong>Compromise reporting:</strong> If I suspect unauthorized access, I will notify ITSCO/support immediately. ITSCO may lock my account at any time for protection.</li>
    <li style="margin-bottom:8px;"><strong>ROI boundary:</strong> I understand that when a client''s ROI expires for my school, my access to that client''s information is removed.</li>
    <li style="margin-bottom:8px;"><strong>Confidentiality:</strong> I will not misuse client information or disclose internal platform/process details inappropriately.</li>
    <li style="margin-bottom:8px;"><strong>Abuse and misuse prevention:</strong> I will not harass users, misuse tools, attempt unauthorized access, or bypass controls.</li>
    <li style="margin-bottom:8px;"><strong>ITSCO privacy commitments:</strong> ITSCO does not sell my data and does not target me with outside-app ads. ITSCO may send relevant in-app service/program announcements.</li>
    <li style="margin-bottom:8px;"><strong>Electronic signature acknowledgement:</strong> By signing, I accept these responsibilities and ongoing accountability for account use.</li>
  </ul>

  <div style="margin-top:18px; padding:12px 14px; border:1px solid #e2e8f0; border-radius:10px; background:#fafafa;">
    <p style="margin:0;"><strong>Support notice:</strong> If you need account help or immediate lock support, contact ITSCO support.</p>
  </div>

  <div style="margin-top:42px;">
    <div style="border-top:1px solid #64748b; width:320px; margin-bottom:6px;"></div>
    <div style="font-size:12px; color:#475569;">School Staff Signature</div>
  </div>
</div>',
  signature_x = 206,
  signature_y = 144,
  signature_width = 200,
  signature_height = 60,
  signature_page = NULL
WHERE name COLLATE utf8mb4_unicode_ci = @waiver_template_name
  AND agency_id IS NULL
  AND is_active = TRUE;

