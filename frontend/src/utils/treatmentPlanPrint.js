import { activePlanGoals } from './noteAidTreatmentHelpers.js';
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function treatmentPlanPrintHtml({ plan, agency = {}, logoUrl = '' }) {
  const goals = activePlanGoals(plan);
  const diagnoses = plan.planDiagnoses || plan.diagnoses || [];
  const logo = /^(https?:\/\/|\/)/.test(logoUrl) ? `<img src="${escape(logoUrl)}" alt="" />` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Treatment plan</title><style>
  @page { size: auto; margin: 0.65in; } body { margin:0; color:#111; font:11pt/1.4 Arial,sans-serif; }
  header { display:flex; align-items:center; gap:14px; border-bottom:1px solid #555; padding-bottom:10px; }
  header img { max-height:55px; max-width:180px; object-fit:contain; } h1 { font-size:17pt; margin:4px 0; } h2 { font-size:12pt; margin:16px 0 6px; } p { margin:6px 0; white-space:pre-wrap; }
  .objective { margin:8px 0 12px 12px; } h2, h3 { break-after:avoid; } .objective { break-inside:avoid; } .signatures { break-inside:avoid; margin-top:24px; } .line { margin-top:24px; border-bottom:1px solid #666; height:20px; } .signature-grid { display:grid; grid-template-columns:3fr 1fr; gap:24px; } small { font-size:9pt; }
  </style></head><body><header>${logo}<div><strong>${escape(agency.name || 'Healthcare practice')}</strong><h1>Treatment plan</h1></div></header>
  <p><strong>Date:</strong> ${escape(String(plan.effective_date || plan.effectiveDate || plan.created_at || '').slice(0, 10))}</p>
  <h2>Diagnosis</h2>${diagnoses.map((d) => `<p>${escape(d.icd10_code || d.icd10Code)} ${escape(d.description)}</p>`).join('') || '<p>Not listed</p>'}
  ${goals.map((g, gi) => `<h2>Goal ${gi + 1}</h2><p>${escape(g.goal_text || g.goalText)}</p>${g.objectives.map((o, oi) => `<div class="objective"><p><strong>Objective ${gi + 1}.${oi + 1}:</strong> ${escape(o.objective_text || o.objectiveText)}</p>${(o.interventions || []).length ? `<p><strong>Interventions:</strong> ${o.interventions.map(escape).join('; ')}</p>` : ''}</div>`).join('')}`).join('')}
  <section class="signatures"><h2>Signatures</h2><p>I have reviewed this treatment plan.</p><div class="signature-grid"><div><div class="line"></div><small>Client / guardian signature and printed name</small></div><div><div class="line"></div><small>Date</small></div><div><div class="line"></div><small>Provider signature and printed name</small></div><div><div class="line"></div><small>Date</small></div></div></section></body></html>`;
}
export async function printTreatmentPlanDocument(html) {
  const frame = document.createElement('iframe');
  frame.title = 'Printable treatment plan';
  frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;border:0';
  document.body.appendChild(frame);
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  frame.srcdoc = html;
  await loaded;
  await Promise.all(Array.from(frame.contentDocument.images).map((img) => img.decode().catch(() => {})));
  frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
  frame.contentWindow.focus();
  frame.contentWindow.print();
}
