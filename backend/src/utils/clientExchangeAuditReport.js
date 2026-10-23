const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = value => {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not recorded' : parsed.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
};
const delivery = value => value ? `${value.status}${value.reason ? ` — ${value.reason}` : ''}` : 'Not attempted / no historical receipt';
const outcome = value => {
  if (!value) return '<strong>Not attempted</strong><div class="muted">No historical receipt</div>';
  const status = String(value.status || 'unknown').replace(/_/g, ' ');
  return `<strong>${escape(status.charAt(0).toUpperCase() + status.slice(1))}</strong>${value.reason ? `<div>${escape(value.reason)}</div>` : ''}${value.sentAt ? `<div class="muted">${escape(date(value.sentAt))}</div>` : ''}`;
};
const reasons = provider => (provider.checks || []).filter(check => provider.matched ? check.status === 'pass' : ['fail', 'error'].includes(check.status)).map(check => check.reason);
const unknowns = provider => (provider.checks || []).filter(check => check.status === 'unknown').map(check => check.reason);
const paragraphs = values => values.map(value => `<p>${escape(value)}</p>`).join('');

// Only the listing ID is used. Client names, initials and clinical narratives
// must never enter the support email or its attachments.
export function buildExchangeAuditReport({audit, listing, agencyName, ordinal, link, generatedAt = new Date()}) {
  const providers = audit.providers || [];
  const matched = providers.filter(provider => provider.matched);
  const counts = channel => providers.filter(provider => ['sent', 'delivered'].includes(provider[channel]?.status)).length;
  const pending = providers.filter(provider => [provider.emailDelivery, provider.smsDelivery].some(value => value && ['failed', 'unknown', 'sending', 'queued', 'historical_unknown'].includes(value.status)));
  const safeLink = /^https?:\/\//i.test(link || '') ? link : '';
  const title = `${agencyName} — Client Exchange listing #${listing.id}`;
  const summary = [
    `${matched.length} matched; ${providers.length - matched.length} not matched or needing evaluation.`,
    `Recorded email sends: ${counts('emailDelivery')}. Recorded text sends: ${counts('smsDelivery')}.`,
    `Detail views: ${Number(audit.views?.total || 0)}; unique viewers: ${Number(audit.views?.unique_viewers || 0)}.`
  ];
  const notes = [
    `Tracking began: ${date(audit.trackingStartedAt)}. Earlier listing views were not tracked. View counts exclude list-card impressions and email opens.`,
    'Sent means accepted by the sending service, not proof the recipient read it. Current matching may differ from matching at the original posting.',
    'Unknown fields are not verified matches. Days, times and exact office availability still require manual review.'
  ];
  const text = [title, `Audit client ${ordinal} of 50.`, '', ...summary,
    pending.length ? `${pending.length} provider${pending.length === 1 ? ' has' : 's have'} failed, pending or uncertain deliveries; see the PDF for details.` : '',
    '', 'The attached PDF contains the full matching, delivery and viewing report. The CSV is included for filtering or spreadsheet review.',
    `Review in the app: ${safeLink}`, '', ...notes].filter(Boolean).join('\n');
  const html = `<p><strong>${escape(title)}</strong></p>${paragraphs(summary)}${pending.length ? `<p>${pending.length} provider${pending.length === 1 ? ' has' : 's have'} failed, pending or uncertain deliveries. See the PDF for details.</p>` : ''}<p><strong>Open the attached PDF for the full report.</strong> It includes who matched and why, who did not match, email and text outcomes, and viewing activity. A CSV is also included for spreadsheet review.</p><p><a href="${escape(safeLink)}">Review Client Exchange in the app</a></p><p>Earlier listing views were not tracked. “Sent” does not mean read.</p>`;

  function providerSection(list, heading, explanation) {
    if (!list.length) return `<section class="report-section"><h2>${heading} (0)</h2><p>No providers in this section.</p></section>`;
    // Explain identical decisions once, without losing provider-specific unknowns.
    const groups = new Map();
    for (const provider of list) {
      const checks = reasons(provider), unknown = unknowns(provider);
      const key = JSON.stringify([checks, unknown]);
      if (!groups.has(key)) groups.set(key, {checks, unknown, providers:[]});
      groups.get(key).providers.push(provider);
    }
    return `<section class="report-section"><h2>${heading} (${list.length})</h2><p>${explanation}</p>${[...groups.values()].map((group, index) => `
      <div class="group"><div class="group-heading"><h3>Group ${index + 1} · ${group.providers.length} provider${group.providers.length === 1 ? '' : 's'}</h3>
      <p><strong>${list[0].matched ? 'Why these providers matched' : 'Why these providers did not match / need review'}</strong></p>
      ${group.checks.length ? paragraphs(group.checks) : '<p>No completed matching explanation is recorded. Manual review is needed.</p>'}
      ${group.unknown.length ? `<div class="confirmation"><strong>Still needs confirmation</strong>${paragraphs(group.unknown)}</div>` : ''}</div>
      <table><colgroup><col style="width:34%"><col style="width:26%"><col style="width:26%"><col style="width:14%"></colgroup>
      <thead><tr><th>Provider</th><th>Email outcome</th><th>Text outcome</th><th>Detail views</th></tr></thead><tbody>
      ${group.providers.map(provider => `<tr><td><strong>${escape(provider.name || 'Unnamed provider')}</strong> <span class="muted">#${escape(provider.userId)}</span><div>${escape(provider.email || 'No email on file')}</div></td><td>${outcome(provider.emailDelivery)}</td><td>${outcome(provider.smsDelivery)}</td><td><strong>${Number(provider.views || 0)}</strong>${provider.lastViewedAt ? `<div class="muted">Last: ${escape(date(provider.lastViewedAt))}</div>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`).join('')}</section>`;
  }
  const metrics = [
    ['Matched providers', matched.length], ['Not matched / needs review', providers.length - matched.length],
    ['Recorded email sends', counts('emailDelivery')], ['Recorded text sends', counts('smsDelivery')],
    ['Detail views', Number(audit.views?.total || 0)], ['Unique viewers', Number(audit.views?.unique_viewers || 0)]
  ];
  const reportHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)} — audit report</title><style>
    *{box-sizing:border-box}body{font:11pt/1.4 Arial,Helvetica,sans-serif;color:#172d3b;margin:0}h1{font-size:27pt;margin:6px 0 10px}h2{font-size:20pt;margin:0 0 12px;color:#17654c}h3{font-size:13pt;margin:0 0 8px}p{margin:6px 0}a{color:#0753a8;overflow-wrap:anywhere}.eyebrow{font-size:10pt;letter-spacing:1px;text-transform:uppercase;color:#17654c}.muted{color:#526475;font-size:9pt}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.metric{background:#eef6f2;border-top:3px solid #218365;padding:12px}.metric strong{display:block;font-size:24pt}.metric span{font-size:10pt}.notes{border-left:3px solid #b5c7d2;padding:4px 14px;margin-top:20px;font-size:10pt}.report-section{break-before:page}.group{margin:18px 0 26px}.group-heading{break-inside:avoid;break-after:avoid}.group-heading p{font-size:10pt;margin:4px 0}.confirmation{background:#fff6df;padding:8px 12px;margin:10px 0}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:10px 0 20px;font-size:10pt}thead{display:table-header-group}th{text-align:left;background:#eaf0f5;padding:9px 10px;border-bottom:2px solid #9bafbb}td{vertical-align:top;padding:7px 10px;border-bottom:1px solid #d7e0e6;overflow-wrap:anywhere}tr{break-inside:avoid}tbody tr:nth-child(even){background:#f7f9fb}.empty{padding:12px;background:#f5f7f9}
    </style></head><body><section><div class="eyebrow">${escape(agencyName)} · Support report</div><h1>Client Exchange audit</h1><p><strong>Listing #${escape(listing.id)} · Audit client ${escape(ordinal)} of 50</strong></p><p class="muted">Generated ${escape(date(generatedAt))} · Matching evaluated ${escape(date(audit.run?.evaluated_at))}</p>
    <div class="metrics">${metrics.map(([label, value]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>
    ${pending.length ? `<div class="confirmation"><strong>Delivery review needed for ${pending.length} providers</strong><p>Failed, pending or uncertain delivery outcomes are shown beside each provider in the following sections.</p></div>` : ''}
    <p>This report covers all ${providers.length} evaluated providers. Matching explanations are grouped when identical; each provider’s delivery results and view counts remain separate.</p><p><a href="${escape(safeLink)}">Open this listing’s audit in Client Exchange</a></p><div class="notes"><strong>How to read this report</strong>${paragraphs(notes)}</div></section>
    ${providerSection(matched, 'Matched providers', 'These providers passed the recorded matching rules. Confirm any unknown fields before assignment.')}
    ${providerSection(providers.filter(provider => !provider.matched), 'Not matched / needs review', 'The reasons below explain the current decision. Historical delivery receipts may reflect an earlier match.')}
    <section class="report-section"><h2>Viewing activity</h2><p>All recorded viewers, including people outside the evaluated provider list.</p>${audit.viewers?.length ? `<table><colgroup><col style="width:50%"><col style="width:15%"><col style="width:35%"></colgroup><thead><tr><th>Viewer</th><th>Detail views</th><th>Last viewed (UTC)</th></tr></thead><tbody>${audit.viewers.map(viewer => `<tr><td>${escape([viewer.first_name, viewer.last_name].filter(Boolean).join(' ') || 'Unnamed viewer')}<div class="muted">User #${escape(viewer.user_id)}</div></td><td>${Number(viewer.view_count || 0)}</td><td>${escape(date(viewer.last_viewed_at))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No detail views have been recorded since tracking began.</p>'}<div class="notes">${paragraphs([notes[0]])}</div></section></body></html>`;

  const cell = value => {let text=String(value??'');if(/^[=+@\t\r-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
  const csv = [['Provider','Email address','Decision','Reasons','Needs confirmation','Email outcome','Text outcome','Detail views','Email sent at','Text sent at','Last viewed'],
    ...providers.map(provider => [`${provider.name} (#${provider.userId})`,provider.email||'No email on file',provider.matched?'Matched':'Not matched / needs review',reasons(provider).join(' '),unknowns(provider).join(' '),delivery(provider.emailDelivery),delivery(provider.smsDelivery),provider.views,date(provider.emailDelivery?.sentAt),date(provider.smsDelivery?.sentAt),date(provider.lastViewedAt)]),
    [],['All recorded viewers','Views','Last viewed'],...(audit.viewers||[]).map(viewer => [[viewer.first_name,viewer.last_name].filter(Boolean).join(' '),viewer.view_count,date(viewer.last_viewed_at)])].map(row => row.map(cell).join(',')).join('\r\n');
  return {subject:`Client Exchange audit #${listing.id}: ${matched.length} matches — ${agencyName}`,text,html,reportHtml,
    attachments:[{filename:`exchange-${listing.id}-provider-audit.csv`,contentType:'text/csv; charset=utf-8',contentBase64:Buffer.from(csv).toString('base64')}]};
}
