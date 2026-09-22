const escapeHtml = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Inline styles and presentation tables keep the invitation usable in email clients
// that strip stylesheets. The tenant sender adds its existing header and footer.
export function interviewInvitationBody({ firstName, candidateName, agencyName, title, jobTitle, whenLabel, timezone, calendar, interviewers = [], joinUrl, rsvpUrl, jobUrl, attachmentNames = [] }) {
  const button = (label, href, primary = false) => `<a href="${escapeHtml(href)}" style="display:block;padding:16px 20px;border:1px solid #34734f;border-radius:10px;background-color:${primary ? '#34734f' : '#ffffff'};color:${primary ? '#ffffff' : '#24563b'};text-align:center;text-decoration:none;font-size:${primary ? '20' : '16'}px;font-weight:bold;line-height:1.4;">${escapeHtml(label)}</a>`;
  const detail = (label, value) => `<tr><td style="padding:9px 22px;"><div style="font-size:13px;color:#53655e;line-height:1.5;">${escapeHtml(label)}</div><div style="font-size:18px;font-weight:bold;color:#183d31;line-height:1.5;">${escapeHtml(value)}</div></td></tr>`;
  const round = String(title || 'Interview').split(' — ')[0];
  const people = interviewers.length ? interviewers.map(person => `<tr><td style="padding:5px 0;"><div style="font-size:17px;font-weight:bold;color:#183d31;">${escapeHtml(person.name)}</div>${person.email ? `<a href="mailto:${escapeHtml(person.email)}" style="font-size:13px;color:#52665e;text-decoration:none;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(person.email)}</a>` : ''}</td></tr>`).join('') : '<tr><td>Our hiring team</td></tr>';
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#33443d;font-size:16px;line-height:1.6;">
    <p style="margin:0 0 14px;color:#53655e;">Hi ${escapeHtml(firstName)},</p>
    <h1 style="margin:0 0 16px;font-size:34px;line-height:1.15;letter-spacing:-1px;color:#103e2f;">Interview invitation</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr><td width="54" height="4" bgcolor="#47885f" style="border-radius:2px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
    <h2 style="margin:0 0 4px;font-size:26px;line-height:1.25;color:#183d31;">${escapeHtml(round)}</h2>
    ${jobTitle ? `<p style="margin:0 0 4px;font-size:21px;line-height:1.35;font-weight:bold;color:#43574e;">${escapeHtml(jobTitle)}</p>` : ''}
    <p style="margin:0 0 22px;color:#63736b;">${escapeHtml(candidateName)} &middot; ${escapeHtml(agencyName)}</p>
    <p style="margin:0 0 20px;"><strong style="font-size:18px;">We’re excited to meet with you.</strong><br>Thank you for your interest in ${escapeHtml(agencyName)}. We look forward to hearing about your experience and answering your questions about the team.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f6f2" style="width:100%;background-color:#f1f6f2;border-radius:14px;margin:0 0 22px;"><tr><td height="10" style="font-size:0;line-height:0;">&nbsp;</td></tr>
      ${calendar ? detail('Date', calendar.dateLabel) + detail('Time', calendar.timeLabel) + detail('Time zone', timezone) : detail('When', whenLabel)}
      ${detail('Format', 'Virtual interview')}
      <tr><td height="10" style="font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    <p style="margin:0 0 6px;color:#53655e;">You’ll meet with</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">${people}</table>
    ${button('Join Interview', joinUrl, true)}
    <p style="margin:10px 0 22px;font-size:13px;text-align:center;color:#63736b;">This is your personal interview link. Join a few minutes early; your interviewer will welcome you from the lobby.</p>
    ${button('Confirm attendance or decline', rsvpUrl)}
    ${calendar ? `<p style="margin:24px 0 10px;font-size:18px;font-weight:bold;color:#183d31;">Add to your calendar</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-bottom:8px;">${button('Google Calendar', calendar.googleUrl)}</td></tr><tr><td style="padding-bottom:8px;">${button('Outlook Calendar', calendar.outlookUrl)}</td></tr>${calendar.downloadUrl ? `<tr><td>${button('Apple Calendar / iCal', calendar.downloadUrl)}</td></tr>` : ''}</table>
      <p style="margin:10px 0 0;font-size:13px;color:#63736b;">You can also open the attached interview.ics file in your calendar app.</p>` : ''}
    ${jobUrl ? `<p style="margin:22px 0 0;"><a href="${escapeHtml(jobUrl)}" style="color:#34734f;font-weight:bold;">Review the job description</a></p>` : ''}
    <p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #dce7df;color:#52665e;">Need to reschedule or have a question? Just reply to this email to reach your interview team.</p>
    ${attachmentNames.filter(name => name !== 'interview.ics').length ? `<p style="margin:12px 0 0;font-size:12px;color:#63736b;">Attached for your reference: ${escapeHtml(attachmentNames.filter(name => name !== 'interview.ics').join(', '))}.</p>` : ''}
  </div>`;
}
