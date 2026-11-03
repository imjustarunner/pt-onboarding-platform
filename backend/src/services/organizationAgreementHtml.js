import { agreementHash } from './auricwell/agreements.js';
const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function agreementHtml(record) {
  const d=record.data;
  const state=d.status==='completed'?'EXECUTED AGREEMENT':'UNEXECUTED COPY';
  const content=[state,d.title,`Document ${record.id} · revision ${record.revision}`,`Effective date: ${d.effectiveDate || 'Not set'}`,JSON.stringify(d.parties || {},null,2),d.body,d.terms || 'Terms not completed',...(d.signatures || []).map(s=>`Signed by ${s.name}, ${s.capacity}, ${s.signedAt}\nAccount ${s.accountId}\nDocument SHA-256 ${s.contentHash}`),`Document SHA-256 ${d.contentHash || agreementHash(d)}`].join('\n\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(d.title)}</title><style>body{font:16px/1.6 system-ui;max-width:850px;margin:40px auto;padding:24px;color:#16354a}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}@media print{body{margin:0}}</style></head><body><main><h1>${escape(d.title)}</h1><pre>${escape(content)}</pre></main></body></html>`;
}
