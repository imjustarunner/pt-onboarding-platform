// Review-copy annotation only. Never call this for a live automated notification.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function annotateEmailReviewSample(email, details) {
  if (!/^ER\d{3,4}$/.test(details.sampleId || '')) throw new Error('Use a stable ER review ID.');
  const fields = [
    ['Normally from', details.normalFrom],
    ['Typically sent to', details.typicalTo],
    ['Why it is sent', details.why],
    ['Replies go to', details.replyTo]
  ];
  if (fields.some(([,v]) => !String(v || '').trim())) throw new Error('All four review details are required.');
  const note = 'Review copy only. Delivered to testing@itsco.health; review-copy replies return there too. Sample buttons open the demo sign-in page instead of executing live actions. No client workflow or reminder clock is advanced.';
  const html = `<table role="presentation" data-qa-email-review="${details.sampleId}" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:20px auto;font:12px/1.6 Arial,Helvetica,sans-serif;color:#52637a;border:1px solid #dce4ed;border-radius:8px;background:#f7f9fc"><tr><td style="padding:16px 20px"><div style="font-weight:700;letter-spacing:.6px;color:#234166;margin-bottom:9px">ABOUT THIS SAMPLE · ${details.sampleId}</div>${fields.map(([label,value]) => `<div style="margin:3px 0"><strong>${label}:</strong> ${escape(value)}</div>`).join('')}<div style="font-size:11px;color:#6a7b90;border-top:1px solid #dce4ed;padding-top:9px;margin-top:11px">${note}</div></td></tr></table>`;
  const text = `About this sample · ${details.sampleId}\n${fields.map(([label,value]) => `${label}: ${value}`).join('\n')}\n${note}`;
  const originalHtml = String(email.html || '');
  return {...email,
    subject:`[Email review ${details.sampleId}] ${String(email.subject || '').replace(/[\r\n]/g,' ')}`,
    text:`${email.text || ''}\n\n---\n${text}`,
    html: /<\/body\s*>/i.test(originalHtml) ? originalHtml.replace(/<\/body\s*>/i, `${html}</body>`) : `${originalHtml}\n${html}`
  };
}
