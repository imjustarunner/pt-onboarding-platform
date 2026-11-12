// Public, deliberately fictional sample data. Never connect this model to patient records.
export const noteworthyPlans = [
  { name: 'Essential', price: 79, limit: 'Up to 10 team members', description: 'A clearer payday for a small practice.', features: ['Guided payroll preparation', 'TherapyNotes report imports', 'Rates by provider and service', 'Late-note tracking', 'Provider pay statements'] },
  { name: 'Growth', price: 149, limit: 'Up to 25 team members', description: 'More flexibility as your practice grows.', featured: true, features: ['Everything in Essential', 'Flexible compensation structures', 'Supervision and approved time', 'Payroll exception review', 'Expanded reporting'] },
  { name: 'Enterprise', price: 299, limit: '25+ team members', description: 'Bring a larger organization together.', features: ['Everything in Growth', 'Multiple agency workflows', 'Custom pay rules and approvals', 'Implementation planning', 'Support for your organization'] }
];

export const demoProviders = [
  { id: 'jordan', name: 'Jordan Reyes', credential: 'LPC', initials: 'JR', color: 'mint', rate: 52 },
  { id: 'taylor', name: 'Taylor Gomez', credential: 'LCSW', initials: 'TG', color: 'blue', rate: 58 },
  { id: 'morgan', name: 'Morgan Ellis', credential: 'MA', initials: 'ME', color: 'purple', rate: 38 },
  { id: 'casey', name: 'Casey Kim', credential: 'BA', initials: 'CK', color: 'gold', rate: 28 }
];

export const demoSteps = [
  { id: 'upload', phase: 0, title: 'Upload your billing report', description: 'Start with a TherapyNotes report for this pay period. In this demo, load our fictional practice instead.' },
  { id: 'prior', phase: 1, title: 'Review the prior period', description: 'Make a payment decision for drafts from the last payroll before comparing changes.' },
  { id: 'two-ago', phase: 1, title: 'Review two periods ago', description: 'The wizard checks the older report, too. When there is nothing to handle, you can move straight on.' },
  { id: 'late', phase: 1, title: 'Catch the completed late notes', description: 'A note that was unpaid last time is now finalized. Bring it into this payroll once, with its original service date.' },
  { id: 'draft', phase: 2, title: 'Decide which drafts are payable', description: 'Review matching drafts together. Keep exceptions unpaid while including the work that is ready.' },
  { id: 'fees', phase: 2, title: 'Review missed appointment fees', description: 'See fees from your report in one place. Empty sections tell you there is nothing to review.' },
  { id: 'h0031', phase: 2, title: 'Review H0031', description: 'Use recorded service units to review this assessment before adding it to the calculation.' },
  { id: 'h0032', phase: 2, title: 'Review H0032', description: 'No treatment-planning rows need action in this sample period.' },
  { id: 'h2014', phase: 2, title: 'Review H2014', description: 'The service rule applies quarter-hour units to the provider’s assigned rate.' },
  { id: '90853', phase: 2, title: 'Review group services', description: 'Review the compensation rule for group sessions alongside the imported service.' },
  { id: 'h2032', phase: 2, title: 'Review H2032', description: 'No H2032 rows need action in this sample period.' },
  { id: 'claims', phase: 3, title: 'Approve submitted time', description: 'Add the approved administrative work alongside service pay. Select several claims and approve together.' },
  { id: 'stage', phase: 3, title: 'Bring the pay rules together', description: 'Change a sample session rate and watch the calculation update. Pro bono work always stays at zero.' },
  { id: 'compliance', phase: 4, title: 'Review what still needs a note', description: 'Unfinished notes stay visible and unpaid. Your team can see which work needs attention.' },
  { id: 'run', phase: 5, title: 'Calculate the payroll', description: 'Combine the reviewed services, late notes, approved time, and compensation rules.' },
  { id: 'preview', phase: 5, title: 'See exactly what each person earned', description: 'Open a provider’s statement and follow the original service date, code, rate, and pay amount.' },
  { id: 'post', phase: 5, title: 'Post and hand off to payroll', description: 'Publishing makes statements available to providers. A reconciliation CSV carries the pay details to your payroll process.' }
];
export const demoPhases = ['Upload', 'Prior catch-up', 'Review data', 'Adjustments', 'Compliance', 'Run & post'];

export function createDemoState() {
  return { loaded: false, priorDecision: null, lateAdded: false, correctionApplied: false, draftDecision: null, assessmentReviewed: false, claimsApproved: false, rates: Object.fromEntries(demoProviders.map(p => [p.id, p.rate])), calculated: false, posted: false };
}
export function demoLines(state, providerId) {
  if (!state.loaded) return [];
  const rate = state.rates[providerId];
  const base = {
    jordan: [{ id: 'j1', date: '2026-11-02', code: '90837', label: 'Individual therapy · 12 sessions', quantity: 12, rate }, { id: 'j2', date: '2026-11-05', code: '90834', label: 'Individual therapy · 4 sessions', quantity: 4, rate: rate * .75 }],
    taylor: [{ id: 't1', date: '2026-11-03', code: '90837', label: 'Individual therapy · 16 sessions', quantity: 16, rate }, { id: 't2', date: '2026-11-05', code: 'H0031', label: 'Assessment · reviewed units', quantity: 1, rate }],
    morgan: [{ id: 'm1', date: '2026-11-02', code: '90837', label: 'Individual therapy · 10 sessions', quantity: 10, rate }],
    casey: [{ id: 'c1', date: '2026-11-04', code: 'H2014', label: 'Skills service · 24 quarter-hour units', quantity: 6, rate }, { id: 'c2', date: '2026-11-05', code: '90853', label: 'Group service · 2 pay credits', quantity: 2, rate }]
  }[providerId] || [];
  if (providerId === 'jordan' && state.lateAdded) base.push({ id: 'jlate', date: '2026-10-22', code: '90837', label: 'Completed late note · prior period', quantity: 1, rate, late: true });
  if (providerId === 'taylor' && state.priorDecision === 'payable') base.push({ id: 'tprior', date: '2026-10-23', code: '90837', label: 'Prior draft · approved for pay', quantity: 1, rate, late: true });
  if (providerId === 'morgan' && state.draftDecision === 'payable') base.push({ id: 'mdraft', date: '2026-11-06', code: '90837', label: 'Current draft · approved for pay', quantity: 1, rate });
  if (state.claimsApproved && ['jordan', 'taylor'].includes(providerId)) base.push({ id: `${providerId}-admin`, date: '2026-11-06', code: 'ADMIN', label: 'Approved administrative time', quantity: providerId === 'jordan' ? 1.5 : 1, rate: rate * .5 });
  if (providerId === 'morgan') base.push({ id: 'mprobono', date: '2026-11-05', code: 'PRO BONO', label: 'Pro bono · no compensation', quantity: 1, rate: 0 });
  if (providerId === 'morgan' && state.correctionApplied) base.push({ id: 'mcorrection', date: '2026-10-21', code: 'CORRECTION', label: 'Prior session changed to pro bono · paid Oct 29', quantity: -1, rate: 38, correction: true });
  return base.map(line => ({ ...line, amount: Math.round(line.quantity * line.rate * 100) / 100 }));
}
export function providerTotal(state, id) { return Math.round(demoLines(state, id).reduce((sum, line) => sum + line.amount, 0) * 100) / 100; }
export function demoTotal(state) { return Math.round(demoProviders.reduce((sum, p) => sum + providerTotal(state, p.id), 0) * 100) / 100; }
export const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
export function demoBlocker(stepId, state) {
  if (!state.loaded) return 'Load the fictional report to start the walkthrough.';
  if (stepId === 'prior' && !state.priorDecision) return 'Choose whether the prior draft should be paid or kept unpaid.';
  if (stepId === 'late' && !state.lateAdded) return 'Add the completed late note before continuing.';
  if (stepId === 'late' && !state.correctionApplied) return 'Review the changed service code and apply the sample correction.';
  if (stepId === 'draft' && !state.draftDecision) return 'Make a payment decision for the current draft.';
  if (stepId === 'h0031' && !state.assessmentReviewed) return 'Review and confirm the sample assessment units.';
  if (stepId === 'claims' && !state.claimsApproved) return 'Approve the sample time claims before continuing.';
  if (stepId === 'run' && !state.calculated) return 'Calculate this demo payroll before previewing the statements.';
  if (['preview', 'post'].includes(stepId) && !state.calculated) return 'The pay decisions changed. Return to Calculate and update the demo payroll.';
  if (stepId === 'post' && !state.posted) return 'Post the demo payroll to finish the walkthrough.';
  return '';
}
export function demoCsv(state) {
  const rows = [['DEMO ONLY — fictional payroll reconciliation'], ['Provider', 'Credential', 'Service date', 'Service code', 'Description', 'Pay credits / hours', 'Rate', 'Gross service pay']];
  for (const p of demoProviders) for (const line of demoLines(state, p.id)) rows.push([p.name, p.credential, line.date, line.code, line.label, line.quantity, line.rate.toFixed(2), line.amount.toFixed(2)]);
  return rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
