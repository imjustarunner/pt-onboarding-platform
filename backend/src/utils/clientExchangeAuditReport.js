const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const delivery = value => value ? `${value.status}${value.reason ? ` — ${value.reason}` : ''}` : 'Not attempted / no historical receipt';
export function buildExchangeAuditReport({audit,listing,agencyName,ordinal,link}) {
  const providers=audit.providers||[];
  const matched=providers.filter(p=>p.matched);
  const counts=channel=>providers.filter(p=>['sent','delivered'].includes(p[channel]?.status)).length;
  const intro=[`${agencyName} — Client Exchange listing #${listing.id} (audit client ${ordinal} of 50)`,
    `Current evaluation: ${matched.length} matched; ${providers.length-matched.length} not matched or needing evaluation.`,
    `Recorded email sends: ${counts('emailDelivery')}. Recorded text sends: ${counts('smsDelivery')}.`,
    `Detail views since tracking began: ${Number(audit.views?.total||0)}; unique viewers: ${Number(audit.views?.unique_viewers||0)}.`,
    `Tracking began: ${audit.trackingStartedAt || 'this rollout'}. Earlier listing views were not tracked. These counts exclude list-card impressions and email opens.`,
    'Sent means accepted by the sending service, not proof the recipient read it. Current matching may differ from matching at the original posting. Unknown fields are not verified matches.',
    'Days, times and exact office availability still require manual review. The attached CSV contains every provider, full reasons, unknown fields, and delivery details.'];
  const rows=providers.map(p=>({name:`${p.name} (#${p.userId})`,email:p.email||'No email on file',matched:p.matched?'Matched':'Not matched / needs review',
    reasons:p.checks.filter(c=>p.matched?c.status==='pass':c.status==='fail'||c.status==='error').map(c=>c.reason).join(' '),
    unknown:p.checks.filter(c=>c.status==='unknown').map(c=>c.reason).join(' '),emailDelivery:delivery(p.emailDelivery),smsDelivery:delivery(p.smsDelivery),views:p.views}));
  const codes=providers.map(p=>p.checks.filter(c=>p.matched?c.status==='pass':c.status==='fail'||c.status==='error').map(c=>c.field).join(', '));
  const legend=new Map();
  for(const p of providers)for(const c of p.checks.filter(c=>c.status==='fail'||c.status==='error'))legend.set(c.field,c.reason);
  const emailStatus=p=>p.emailDelivery?.status||'not attempted';
  const smsStatus=p=>p.smsDelivery?.status||'not attempted';
  const text=[...intro,'',...rows.map((r,i)=>`${r.name}: ${r.matched}; checks: ${codes[i]}; email: ${emailStatus(providers[i])}; text: ${smsStatus(providers[i])}; views: ${r.views}`),
    '',...Array.from(legend,([code,reason])=>`${code}: ${reason}`),'',`Review in the app: ${link}`].join('\n');
  const html=`${intro.map(p=>`<p>${escape(p)}</p>`).join('')}<p><a href="${escape(link)}">Review Client Exchange audit</a></p><table border="1" cellpadding="4" cellspacing="0"><thead><tr>${['Provider','Decision / checks','Email','Text','Views'].map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${escape(r.name)}</td><td>${escape(r.matched)}: ${escape(codes[i])}</td><td>${escape(emailStatus(providers[i]))}</td><td>${escape(smsStatus(providers[i]))}</td><td>${r.views}</td></tr>`).join('')}</tbody></table><p>For matched providers, listed checks passed. For other providers, listed checks explain exclusions:</p>${Array.from(legend,([code,reason])=>`<p><b>${escape(code)}</b>: ${escape(reason)}</p>`).join('')}`;
  const cell=value=>{let text=String(value??'');if(/^[=+@\t\r-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
  const csv=[['Provider','Email address','Decision','Reasons','Needs confirmation','Email outcome','Text outcome','Detail views'],...rows.map(r=>[r.name,r.email,r.matched,r.reasons,r.unknown,r.emailDelivery,r.smsDelivery,r.views]),[],['All recorded viewers','Views','Last viewed'],...(audit.viewers||[]).map(v=>[[v.first_name,v.last_name].filter(Boolean).join(' '),v.view_count,v.last_viewed_at])].map(row=>row.map(cell).join(',')).join('\r\n');
  return {subject:`Client Exchange audit #${listing.id}: ${matched.length} matches — ${agencyName}`,text,html,
    attachments:[{filename:`exchange-${listing.id}-provider-audit.csv`,contentType:'text/csv; charset=utf-8',contentBase64:Buffer.from(csv).toString('base64')}]};
}
