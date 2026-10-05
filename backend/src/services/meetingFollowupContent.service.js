const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Render only escaped text and a small Markdown subset; AI output cannot add HTML or links.
export function meetingSummaryEmailHtml(summary) {
  const inline = line => escape(line).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return String(summary || '').split(/\r?\n/).filter(line => line.trim()).map(line => {
    const heading = line.match(/^#{1,6}\s+(.+)/);
    if (heading) return `<h2 style="font-size:18px;margin:20px 0 8px;color:#184765">${inline(heading[1])}</h2>`;
    const bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)/);
    return `<p style="margin:6px 0;line-height:1.55">${bullet ? '• ' + inline(bullet[1]) : inline(line)}</p>`;
  }).join('');
}
export function meetingFollowupContent({ title, summary, generatedAt, url }) {
  const transcriptUrl = new URL(url); transcriptUrl.searchParams.set('tab', 'Transcript');
  const disclaimer = `Auto-generated meeting notes${generatedAt ? ` (${generatedAt})` : ''}. Review for accuracy; suggested next steps are not confirmed assignments.`;
  return {
    subject: `Notes from “${String(title || 'Meeting').replace(/[\r\n]/g, ' ')}”`,
    text: `${title}\n\n${disclaimer}\n\n${summary}\n\nOpen meeting notes: ${url}\nView transcript: ${transcriptUrl}\nSign in with the account you used to attend the meeting.`,
    html: `<div style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#20332f"><h1 style="font-size:24px">Notes from “${escape(title)}”</h1><p style="font-size:13px;color:#64748b">${escape(disclaimer)}</p><p><a href="${escape(url)}" style="display:inline-block;background:#17634b;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Open meeting notes</a></p><div style="padding:4px 18px 16px;background:#f4f8fb;border-radius:12px">${meetingSummaryEmailHtml(summary)}</div><p><a href="${escape(transcriptUrl)}">View transcript</a> · <a href="${escape(url)}">View summary and next steps</a></p><p style="font-size:13px">Sign in with the account you used to attend the meeting. These records are kept in My Dashboard → My meetings.</p></div>`
  };
}
