import { emailActionButton } from '../utils/emailActionButton.js';
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
export function meetingFollowupContent({ title, summary, generatedAt, url, receipt = {}, backfill = false, training = false, recordNotice = null }) {
  const transcriptUrl = new URL(url); transcriptUrl.searchParams.set('tab', 'Transcript');
  const assetsUrl = new URL(url); assetsUrl.searchParams.set('tab', training ? 'Documents' : 'Overview');
  const disclaimer = recordNotice?.manual ? 'Manually recorded meeting notes. Please review for accuracy.' : `Auto-generated meeting notes. Please review for accuracy.${training ? '' : ' Suggested next steps are not confirmed assignments.'}`;
  const details = [receipt.dateLabel, receipt.host ? `Host: ${receipt.host}` : '',
    receipt.minutes != null ? `Your recorded attendance: ${receipt.minutes} minutes.` : 'Your attendance duration needs review.', receipt.compensation];
  if (receipt.balance) {
    const b = receipt.balance;
    details.push(`${b.track}: ${b.earned} hours credited for this session.`);
    if (b.before != null && b.after != null) details.push(`Supervision balance at this session: ${Number(b.before).toFixed(2)} hours before + ${Number(b.earned).toFixed(2)} hours credited = ${Number(b.after).toFixed(2)} hours after. This is the balance at that session, not your current total.`);
  }
  if (backfill) details.unshift(`This follow-up is for past ${training ? 'training' : 'supervision'} on ${receipt.dateLabel || 'the date shown in your meeting record'}. We are introducing attendance and summary follow-ups for future meetings. This receipt does not add a second time claim or duplicate supervision hours.`);
  const lines = [...(recordNotice?.lines || []),...details].filter(Boolean);
  return {
    subject: `${recordNotice?.heading || (backfill ? 'Past session follow-up' : 'Notes')} from “${String(title || 'Meeting').replace(/[\r\n]/g, ' ')}”`,
    text: `${title}\n\n${lines.join('\n')}\n\n${disclaimer}\n\n${summary}\n\nOpen meeting notes: ${url}\nView transcript: ${transcriptUrl}\nDocuments and assets: ${assetsUrl}\nDocuments stay in the app; no files are attached to this email.\nSign in with the account you used to attend the meeting.`,
    html: `<div style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#20332f"><h1 style="font-size:24px">${escape(title)}</h1>${lines.map(line=>`<p style="line-height:1.5">${escape(line)}</p>`).join('')}<p style="font-size:13px;color:#64748b">${escape(disclaimer)}</p>${emailActionButton('Open meeting notes',url,true)}<div style="padding:4px 18px 16px;background:#f4f8fb;border-radius:12px">${meetingSummaryEmailHtml(summary)}</div>${emailActionButton('View transcript',transcriptUrl)}${emailActionButton('Documents and assets',assetsUrl)}<p style="font-size:13px">Documents stay in the app; no files are attached to this email. These records are in My Dashboard → My meetings.</p></div>`
  };
}
