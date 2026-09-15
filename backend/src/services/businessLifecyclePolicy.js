// Business administration only. Checklist completion records a team's confirmation;
// it does not execute provisioning, sign an agreement, or revoke access.
export class BusinessLifecycleError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = message => { throw new BusinessLifecycleError(400, message); };
const task = (id, label, category, item, agencyTab) => ({ id, label, ...(item ? { destination: { category, item, agencyTab } } : {}) });
export const BUSINESS_JOURNEY = [
  { id: 'interview', title: 'Interview & discovery', description: 'PlotTwistCo and the business owner agree on the problems to solve and the outcomes to measure.', tasks: [
    task('discovery', 'Interview the owner and record goals, challenges, and current systems'),
    task('scope', 'Choose management services and PlotTwistHQ capabilities'),
    task('success', 'Agree on success measures, decision makers, and next steps')
  ] },
  { id: 'agreement', title: 'Agreement & pricing', description: 'Record the signed management agreement, responsibilities, service prices, and revenue-share terms.', tasks: [
    task('proposal', 'Review the scope, selected services, and pricing with the owner', 'general', 'business-commercial'),
    task('signed', 'Record the signed agreement and effective billing month', 'general', 'business-commercial'),
    task('responsibilities', 'Agree on responsibilities, review cadence, and exit terms')
  ] },
  { id: 'setup', title: 'Set up the organization', description: 'PlotTwistHQ becomes the working home for the organization, its people, and its services.', tasks: [
    task('identity', 'Confirm business identity, contact details, and branding', 'general', 'business-details', 'general'),
    task('services', 'Set up services and booking', 'general', 'booking-service-types'),
    task('features', 'Choose the app features the company needs', 'general', 'tenant-features'),
    task('team', 'Invite the team and review access', 'general', 'team-roles'),
    task('billing', 'Confirm billing contact, payment method, and invoice readiness', 'general', 'billing')
  ] },
  { id: 'training', title: 'Onboard & train', description: 'Give each person the knowledge and practice needed to work in the organization.', tasks: [
    task('packages', 'Prepare role-specific onboarding and training', 'workflow', 'packages'),
    task('practice', 'Walk through daily work in PlotTwistHQ with the team'),
    task('readiness', 'Confirm training completion, support contacts, and launch readiness')
  ] },
  { id: 'launch', title: 'Launch together', description: 'Validate the real operating process and begin the agreed management rhythm.', tasks: [
    task('walkthrough', 'Walk through booking, service delivery, and billing from start to finish'),
    task('baseline', 'Record baseline business measures and schedule the first review'),
    task('approval', 'Record owner and PlotTwistCo approval to launch')
  ] },
  { id: 'management', title: 'Facilitate & manage', description: 'PlotTwistCo facilitates improvements; PlotTwistHQ supports daily operations and progress tracking.', tasks: [
    task('cadence', 'Establish recurring management meetings and action owners'),
    task('outcomes', 'Review business outcomes, training needs, and organizational interventions'),
    task('monthly', 'Reconcile monthly revenue, services, and invoices', 'general', 'business-commercial')
  ] },
  { id: 'exit', title: 'Transition & exit', description: 'Plan the handoff, settle the account, and confirm the business can continue independently.', tasks: [
    task('notice', 'Confirm notice, final service month, and the transition owner', 'general', 'business-commercial'),
    task('handoff', 'Deliver agreed records, exports, procedures, and final training'),
    task('settlement', 'Reconcile final revenue and settle outstanding invoices', 'general', 'billing'),
    task('access', 'Transfer ownership and complete agreed access changes', 'general', 'team-roles'),
    task('acceptance', 'Record owner acceptance of the completed handoff')
  ] }
];

export const emptyLifecycle = () => ({ stages: Object.fromEntries(BUSINESS_JOURNEY.map(s => [s.id, { owner: '', targetDate: '', notes: '', completed: [] }])), exitStarted: false, agreements: [], revenue: [] });
const string = (value, max, name) => { if (typeof value !== 'string' || value.length > max) fail(`Check ${name}.`); return value.trim(); };
const integer = (value, max, name) => { if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(`Check ${name}.`); return value; };
const month = (v, name) => { if (typeof v !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(v)) fail(`Check ${name}.`); return v; };
const date = (v, name) => { if (v === '') return ''; if (typeof v !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) fail(`Check ${name}.`); return v; };
const list = (v, max, name) => { if (!Array.isArray(v) || v.length > max) fail(`Check ${name}.`); return v; };
export function validateLifecycle(input) {
  if (!input || typeof input !== 'object') fail('Check the business journey.');
  const state = emptyLifecycle();
  if (typeof input.exitStarted !== 'boolean') fail('Check exit status.');
  state.exitStarted = input.exitStarted;
  for (const stage of BUSINESS_JOURNEY) {
    const raw = input.stages?.[stage.id];
    if (!raw) fail(`Check ${stage.title}.`);
    const completed = list(raw.completed, stage.tasks.length, 'completed tasks');
    if (completed.some(id => !stage.tasks.some(t => t.id === id)) || new Set(completed).size !== completed.length) fail('Check completed tasks.');
    state.stages[stage.id] = { owner: string(raw.owner, 160, 'owner'), targetDate: date(raw.targetDate, 'target date'), notes: string(raw.notes, 4000, 'notes'), completed: [...completed].sort() };
  }
  if (!state.exitStarted && state.stages.exit.completed.length) fail('Start the transition before completing exit tasks.');
  state.agreements = list(input.agreements, 120, 'agreements').map(raw => {
    if (!raw || typeof raw !== 'object') fail('Check agreement terms.');
    const a = { startMonth: month(raw.startMonth, 'first billing month'), endMonth: raw.endMonth ? month(raw.endMonth, 'last billing month') : '', contractReference: string(raw.contractReference, 500, 'agreement reference'), signedOn: date(raw.signedOn, 'signed date'), revenueBasis: string(raw.revenueBasis, 500, 'revenue definition'), mode: raw.mode, revenueShareBps: integer(raw.revenueShareBps, 10000, 'revenue percentage'), thresholdCents: integer(raw.thresholdCents, 100000000000, 'revenue threshold'), status: raw.status };
    if (!['draft', 'active'].includes(a.status) || !['higher_of', 'threshold', 'additive', 'a_la_carte'].includes(a.mode)) fail('Choose valid agreement terms.');
    if (a.endMonth && a.endMonth < a.startMonth) fail('The last billing month must follow the first.');
    if (a.status === 'active' && (!a.signedOn || !a.contractReference || !a.revenueBasis)) fail('An active agreement needs its signed date, reference, and definition of revenue.');
    if (a.mode !== 'a_la_carte' && !a.revenueShareBps) fail('Enter the contracted revenue percentage.');
    if (a.mode === 'threshold' && !a.thresholdCents) fail('Enter the agreed revenue threshold.');
    a.services = list(raw.services, 50, 'services').map(s => {
      if (!s || typeof s !== 'object') fail('Check service details.');
      const service = { id: string(s.id, 80, 'service identifier'), name: string(s.name, 160, 'service name'), amountCents: integer(s.amountCents, 100000000, 'service price'), cadence: s.cadence, month: s.month ? month(s.month, 'service month') : '' };
      if (!service.id || !service.name || !['monthly', 'once'].includes(service.cadence)) fail('Enter each service name, price, and frequency.');
      if (service.cadence === 'once' && (!service.month || service.month < a.startMonth || (a.endMonth && service.month > a.endMonth))) fail('One-time services need a month within the agreement.');
      return service;
    });
    if (new Set(a.services.map(s => s.id)).size !== a.services.length) fail('Service identifiers must be unique.');
    return a;
  }).sort((a, b) => a.startMonth.localeCompare(b.startMonth));
  if (new Set(state.agreements.map(a => a.startMonth)).size !== state.agreements.length) fail('Use one agreement version per effective month.');
  state.revenue = list(input.revenue, 120, 'monthly revenue').map(r => {
    if (!r || typeof r !== 'object' || typeof r.confirmed !== 'boolean') fail('Check monthly revenue.');
    return { month: month(r.month, 'revenue month'), amountCents: integer(r.amountCents, 100000000000, 'monthly revenue'), reference: string(r.reference, 500, 'revenue source'), confirmed: r.confirmed };
  });
  if (state.revenue.some(r => r.confirmed && !r.reference)) fail('Confirmed revenue needs a source or reconciliation reference.');
  if (new Set(state.revenue.map(r => r.month)).size !== state.revenue.length) fail('Use one revenue record per month.');
  state.revenue.sort((a, b) => a.month.localeCompare(b.month));
  return state;
}

export function agreementForMonth(state, billingMonth) {
  return (state?.agreements || []).filter(a => a.status === 'active' && a.startMonth <= billingMonth).sort((a, b) => b.startMonth.localeCompare(a.startMonth))[0] || null;
}

export function businessFinancialSnapshot(state, billingMonth) {
  const agreement = agreementForMonth(state, billingMonth);
  if (!agreement) return { agreement: null };
  const { endMonth, services, ...terms } = agreement;
  return { agreement: { ...terms, ended: !!endMonth && billingMonth > endMonth, services: services.filter(s => s.cadence === 'monthly' || s.month === billingMonth) }, revenue: state.revenue.find(r => r.month === billingMonth) || null };
}

export function assertBusinessReadyForInvitation(state) {
  const ready = ['interview', 'agreement'].every(id => BUSINESS_JOURNEY.find(s => s.id === id).tasks.every(t => state?.stages?.[id]?.completed?.includes(t.id)));
  if (!ready || !(state?.agreements || []).some(a => a.status === 'active' && a.signedOn && a.contractReference)) throw new BusinessLifecycleError(409, 'Complete the interview and agreement checklist, and record signed pricing terms before inviting the owner.');
}

// A single set of charge lines is used by the screen, saved invoice, PDF and QBO.
export function platformChargeLines(estimate) {
  const lines = [{ key: 'platform_base', label: 'PlotTwistHQ platform base', amountCents: estimate.totals.baseFeeCents }];
  for (const line of estimate.lineItems || []) {
    if (estimate.featureBilling && line.key?.startsWith('feature_')) continue;
    lines.push({ key: line.key, label: line.label, amountCents: line.extraCents });
  }
  if (estimate.featureBilling) {
    for (const p of [...(estimate.featureBilling.tenantPortions || []), ...(estimate.featureBilling.userPortions || [])]) {
      lines.push({ key: `feature_${p.featureKey}`, label: `${p.featureLabel || p.featureKey}${p.userName ? ` - ${p.userName}` : ''}`, amountCents: p.chargeCents });
    }
  }
  return lines.filter(l => l.amountCents > 0);
}

export function applyBusinessAgreement(estimate, state, billingMonth, { requireRevenue = false } = {}) {
  const a = agreementForMonth(state, billingMonth);
  if (!a) return estimate;
  if (a.endMonth && billingMonth > a.endMonth) {
    if (requireRevenue) throw new BusinessLifecycleError(409, 'This management agreement has ended. Review the company transition before generating another invoice.');
    return { ...estimate, chargeLines: [], totals: { ...estimate.totals, totalCents: 0 }, businessAgreement: { ended: true, ready: false, billingMonth, contractReference: a.contractReference } };
  }
  const revenue = state.revenue.find(r => r.month === billingMonth);
  const ready = a.mode === 'a_la_carte' || revenue?.confirmed === true;
  if (!ready && requireRevenue) throw new BusinessLifecycleError(409, `Confirm company revenue for ${billingMonth}, including zero revenue, before generating its invoice.`);
  const monthlyServices = a.services.filter(s => s.cadence === 'monthly');
  const oneTime = a.services.filter(s => s.cadence === 'once' && s.month === billingMonth);
  const serviceCents = monthlyServices.reduce((sum, s) => sum + s.amountCents, 0);
  const floorCents = estimate.totals.totalCents + serviceCents;
  const revenueShareCents = Math.round((revenue?.amountCents || 0) * a.revenueShareBps / 10000);
  const oneTimeCents = oneTime.reduce((sum, s) => sum + s.amountCents, 0);
  let recurringCents = floorCents, basis = 'a_la_carte';
  if (ready && a.mode === 'higher_of' && revenueShareCents >= floorCents) { recurringCents = revenueShareCents; basis = 'revenue_share'; }
  if (ready && a.mode === 'threshold' && revenue.amountCents >= a.thresholdCents) { recurringCents = revenueShareCents; basis = 'revenue_share'; }
  if (ready && a.mode === 'additive') { recurringCents = floorCents + revenueShareCents; basis = 'additive'; }
  let chargeLines = basis === 'revenue_share'
    ? [{ key: 'management_revenue_share', label: `PlotTwistCo management + PlotTwistHQ (${a.revenueShareBps / 100}% revenue share)`, amountCents: revenueShareCents }]
    : [...platformChargeLines(estimate), ...monthlyServices.map(s => ({ key: `service_${s.id}`, label: `PlotTwistCo - ${s.name}`, amountCents: s.amountCents }))];
  if (basis === 'additive') chargeLines.push({ key: 'management_revenue_share', label: `PlotTwistCo revenue share (${a.revenueShareBps / 100}%)`, amountCents: revenueShareCents });
  chargeLines.push(...oneTime.map(s => ({ key: `service_${s.id}`, label: `PlotTwistCo - ${s.name} (one-time)`, amountCents: s.amountCents })));
  const totalCents = recurringCents + oneTimeCents;
  if (chargeLines.reduce((sum, l) => sum + l.amountCents, 0) !== totalCents) throw new BusinessLifecycleError(409, 'The platform charge breakdown does not reconcile. Review feature pricing before invoicing.');
  return { ...estimate, chargeLines, totals: { ...estimate.totals, totalCents }, businessAgreement: { billingMonth, ready, basis, mode: a.mode, contractReference: a.contractReference, signedOn: a.signedOn, revenueBasis: a.revenueBasis, revenueCents: revenue?.amountCents ?? null, revenueReference: revenue?.reference || '', revenueShareBps: a.revenueShareBps, revenueShareCents, platformCents: estimate.totals.totalCents, serviceCents, floorCents, oneTimeCents, breakEvenRevenueCents: a.revenueShareBps ? Math.ceil(floorCents * 10000 / a.revenueShareBps) : null } };
}
