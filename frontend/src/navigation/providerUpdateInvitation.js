// The sending service and admin preview use this same template.
export const PROVIDER_UPDATE_EMAIL_SUBJECT = 'Your Provider Update is ready — please review and complete';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildProviderUpdateInvitation({ firstName = 'there', agencyName = 'Your agency', link = '#preview' } = {}) {
  const paragraphs = [
    'The wait is over! Thank you for your patience while we prepared your personalized Provider Update. It is ready for you to review and complete. Please take time to review the agency announcements and complete each section assigned to you.',
    'Inside, you can review your profile and specialties, update your availability and communication preferences, and complete any assigned handbook acknowledgments or agreements. Your Admin Update is included in the same place.',
    'You can save your progress and return using this link. Mark each section complete as you finish, then submit the completed update.',
    'If you notice any issues or have questions, please do not hesitate to reply to People Operations. You can also use “Need help?” inside your update to contact People Operations about employment or pay, or Technology about an app issue. You can upload a screenshot with your help request.',
    'Some guide videos will be uploaded this weekend. Please look out for emails when new instructions are added to your Provider Update—even if you have already completed it.',
    'The current Workplace Handbook may not yet reflect all planned changes communicated in the Handbook Updates section of your Provider Update. The manual will be updated by Monday, October 12, 2026. Please review the Handbook Updates section for the changes being communicated now.',
    'Thank you for keeping your information current and helping us prepare for the next steps together.'
  ];
  const text = [`Hello ${firstName || 'there'},`, '', ...paragraphs.flatMap(p => [p, '']), `Open my Provider Update: ${link}`, '', 'This link is personalized for you. Please do not forward it.', '', `People Operations | ${agencyName}`].join('\n');
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f3f6f5;color:#223c3c;font-family:Arial,Helvetica,sans-serif;line-height:1.6">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #dae5df;border-radius:16px;overflow:hidden">
<tr><td style="padding:28px 32px;background:#174b49;color:#fff"><div style="font-size:13px;letter-spacing:1px">${escapeHtml(agencyName)} · PEOPLE OPERATIONS</div><h1 style="margin:8px 0 0;font-size:28px;line-height:1.25">Your Provider Update is ready</h1></td></tr>
<tr><td style="padding:28px 32px"><p style="margin-top:0">Hello ${escapeHtml(firstName || 'there')},</p><p>${escapeHtml(paragraphs[0])}</p>
<p style="margin:26px 0"><a href="${escapeHtml(link)}" target="_blank" rel="noopener" style="display:inline-block;background:#3d6b4f;color:#fff;padding:14px 24px;border-radius:8px;font-weight:bold;text-decoration:none">Open my Provider Update →</a></p>
<h2 style="font-size:18px;margin:24px 0 8px">What to review</h2><p>${escapeHtml(paragraphs[1])}</p><p>${escapeHtml(paragraphs[2])}</p>
<h2 style="font-size:18px">Workplace Handbook update</h2><p>${escapeHtml(paragraphs[5])}</p>
<div style="background:#eef4f8;border-left:4px solid #42748c;padding:14px 18px;margin:24px 0"><strong>We’re here to help</strong><p style="margin:6px 0 0">${escapeHtml(paragraphs[3])}</p></div>
<h2 style="font-size:18px">Guide videos coming this weekend</h2><p>${escapeHtml(paragraphs[4])}</p><p>${escapeHtml(paragraphs[6])}</p><p style="margin-bottom:0"><strong>People Operations</strong><br>${escapeHtml(agencyName)}</p></td></tr>
<tr><td style="padding:18px 32px;background:#f6f8f7;font-size:12px;color:#526763">This link is personalized for you. Please do not forward it.<br>If the button does not open, copy this link into your browser:<br><a href="${escapeHtml(link)}" style="color:#174b49;word-break:break-all">${escapeHtml(link)}</a></td></tr>
</table></td></tr></table></body></html>`;
  return { subject: PROVIDER_UPDATE_EMAIL_SUBJECT, text, html };
}
