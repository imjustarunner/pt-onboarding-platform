// Prices supplied by the agency on 2026-10-21 are editable draft defaults.
// This catalog is never a payer fee schedule, a collectible balance, or a coding rule.
export const COST_ESTIMATE_VERSION = '2026-10-21.1';
export const ESTIMATE_ACKNOWLEDGMENT = 'I acknowledge receiving this cost estimate. My acknowledgment does not authorize a payment, require me to receive services, or waive any billing or dispute rights.';
export const ESTIMATE_DEFAULTS = Object.freeze([
  ['90791', 'Diagnostic assessment', 13000], ['90832', 'Individual psychotherapy, brief session', 5000],
  ['90834', 'Individual psychotherapy, standard session', 7500], ['90837', 'Individual psychotherapy, extended session', 10000],
  ['90846', 'Family psychotherapy without the client present', 10000], ['90847', 'Family psychotherapy with the client present', 10000],
  ['90839', 'Psychotherapy for crisis', 13000], ['90853', 'Group psychotherapy', null],
  ['90840', 'Additional crisis psychotherapy', 7500, 'coding_review'], ['99051', 'Additional scheduled service charge', 3000, 'coding_review'],
  ['90785', 'Interactive complexity', 1500, 'coding_review'], ['T1017', 'Case management', 2000, 'coding_review', '15-minute unit'],
  ['H0032', 'Service plan development', 4000, 'coding_review'],
  ['99441', 'Legacy telephone service', 1500, 'legacy_code_review'], ['99442', 'Legacy telephone service', 3000, 'legacy_code_review'],
  ['99443', 'Legacy telephone service', 4500, 'legacy_code_review'], ['99242', 'Consultation', 10000, 'coding_review'],
  ['NOSHOW', 'Missed appointment policy', 10000, 'policy_review'], ['LTECNCL', 'Late cancellation policy', 8000, 'policy_review'],
  ['TS001', 'Requested treatment summary', 15000, 'policy_review'],
  ['CALF001', 'Legal preparation', 15000, 'policy_review', 'hour'], ['CALF002', 'Legal phone call', 15000, 'policy_review', 'hour'],
  ['CALF003', 'Deposition', 20000, 'policy_review', 'hour'], ['CALF004', 'Testimony', 20000, 'policy_review', 'hour'],
  ['CALF005', 'Legal mileage', 53, 'policy_review', 'mile'], ['CALF006', 'Legal time away', 15000, 'policy_review', 'hour'],
  ['CALF007', 'Legal expenses', null, 'policy_review'], ['CALF008', 'Court filing', 5000, 'policy_review'],
  ['CALF009', 'Court appearance retainer', 120000, 'policy_review'], ['CALF010', 'Short-notice legal request', 20000, 'policy_review'],
  ['CALF011', 'Court rescheduling', 25000, 'policy_review'],
  ['MRF001', 'Record copies, initial pages', 1853, 'patient_access_review'], ['MRF002', 'Record copies, additional pages', 85, 'patient_access_review', 'page'],
  ['MRF003', 'Record copies, additional pages', 57, 'patient_access_review', 'page'], ['MRF004', 'Microfilm copies', 150, 'patient_access_review', 'page']
].map(([serviceCode, description, amountCents, reviewReason = null, unitLabel = 'session']) => Object.freeze({ serviceCode, description, amountCents, unitLabel, reviewReason, approved: false, revision: 0 })));

const fail = message => Object.assign(new Error(message), { status: 400, statusCode: 400 });
const text = value => String(value ?? '').trim();
const validNpi = value => {
  const number = text(value);
  if (!/^[12]\d{9}$/.test(number)) return false;
  const digits = `80840${number}`.split('').reverse().map(Number);
  return digits.reduce((sum, digit, index) => { const n = index % 2 ? digit * 2 : digit; return sum + (n > 9 ? n - 9 : n); }, 0) % 10 === 0;
};
export function estimateDate(value) {
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw fail('Use a valid date');
  return date;
}
export function estimateMoney(value) {
  if (value === null || value === '' || typeof value === 'boolean') throw fail('A verified amount in cents is required');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1000000000) throw fail('Use a valid amount in cents');
  return n;
}
export function estimateWindow(startDate, weeks = 6) {
  const start = estimateDate(startDate), count = Number(weeks);
  if (!Number.isInteger(count) || count < 1 || count > 52) throw fail('Choose a planning period from 1 to 52 weeks');
  const end = new Date(`${start}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + count * 7 - 1);
  return { startDate: start, endDate: end.toISOString().slice(0, 10), weeks: count };
}
export function costEstimateReadiness(snapshot) {
  const missing = [];
  for (const [value, label] of [[snapshot.patient?.name, 'Client name'], [snapshot.patient?.dateOfBirth, 'Client date of birth'], [snapshot.provider?.name, 'Assigned provider'], [snapshot.agency?.name, 'Agency name'], [snapshot.location?.address, 'Service location'], [snapshot.frequency, 'Expected frequency'], [snapshot.coverageEvidence, 'Self-pay coverage review']]) if (!text(value)) missing.push(label);
  if (!validNpi(snapshot.provider?.npi)) missing.push('Assigned provider NPI');
  if (!validNpi(snapshot.agency?.npi)) missing.push('Agency billing NPI');
  if (!/^\d{9}$/.test(text(snapshot.agency?.taxId).replace(/\D/g, ''))) missing.push('Agency tax ID');
  if (!/^[A-Z]{2}$/.test(text(snapshot.location?.state))) missing.push('Service state');
  if (!snapshot.diagnosisCodes?.length && snapshot.diagnosisNotApplicable !== true) missing.push('Applicable diagnosis or documented not yet applicable');
  if (snapshot.diagnosisNotApplicable && !text(snapshot.diagnosisReason)) missing.push('Reason diagnosis is not applicable');
  if (!snapshot.lines?.length) missing.push('Expected services');
  if (snapshot.lines?.some(line => !line.approved || line.amountCents == null)) missing.push('Approved agency prices for each expected service');
  return missing;
}
export function buildCostEstimate({ agency, provider, patient, location, startDate, weeks = 6, frequency = 'One session per week', lines, diagnosisCodes = [], diagnosisNotApplicable = false, diagnosisReason = '', coverageEvidence = '', selfPayElection = false, hasCoverage = false, medicaid = false, separatelyScheduled = [], createdAt = new Date().toISOString() }) {
  if (medicaid) throw fail('Medicaid-covered care is excluded from patient-pay estimates; review any exception separately');
  if (hasCoverage && !selfPayElection) throw fail('Confirm the client has elected not to use commercial insurance for these services');
  if (!Array.isArray(lines) || !lines.length || lines.length > 30) throw fail('Select between one and 30 expected services');
  if (new Set(lines.map(line => text(line.serviceCode))).size !== lines.length) throw fail('Combine each service code into one expected quantity');
  const normalized = lines.map(line => {
    const quantity = Number(line.quantity ?? 6);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 366) throw fail('Enter a whole expected service count');
    if (!text(line.serviceCode) || !text(line.description)) throw fail('Each service needs a code and plain-language description');
    if (['99441', '99442', '99443'].includes(text(line.serviceCode))) throw fail('This legacy telephone code was deleted. Select a currently applicable service code');
    const amountCents = line.amountCents == null ? null : estimateMoney(line.amountCents);
    return { serviceCode: text(line.serviceCode), description: text(line.description), quantity, amountCents, totalCents: amountCents === null ? null : estimateMoney(amountCents * quantity), unitLabel: text(line.unitLabel) || 'session', approved: line.approved === true, rateRevision: Number(line.revision || 0) };
  });
  const snapshot = { version: COST_ESTIMATE_VERSION, kind: 'good_faith_estimate', title: 'Good Faith Estimate', agency, provider, patient, location, ...estimateWindow(startDate, weeks), frequency: text(frequency).slice(0, 500), lines: normalized, diagnosisCodes: diagnosisCodes.map(text).filter(Boolean), diagnosisNotApplicable: diagnosisNotApplicable === true, diagnosisReason: text(diagnosisReason).slice(0, 1000), coverageEvidence: text(coverageEvidence).slice(0, 2000), selfPayElection: selfPayElection === true, separatelyScheduled: separatelyScheduled.map(text).filter(Boolean).slice(0, 20), createdAt };
  snapshot.totalCents = normalized.some(line => line.totalCents == null) ? null : estimateMoney(normalized.reduce((sum, line) => sum + line.totalCents, 0));
  snapshot.missing = costEstimateReadiness(snapshot);
  return snapshot;
}
// Only a verified per-visit responsibility may be multiplied here. Generic
// eligibility does not establish deductible sequencing, network status or cost.
export function insuredPlanningCost({ verified = false, evidenceReference, perSessionResponsibilityCents, validFrom, validThrough, startDate, endDate, sessionCount = 6, hasSecondaryCoverage = false }) {
  if (!verified || !text(evidenceReference) || hasSecondaryCoverage) return { status: 'review_required', totalCents: null };
  const start = estimateDate(startDate), end = estimateDate(endDate);
  if (estimateDate(validFrom) > start || estimateDate(validThrough) < end || end < start) return { status: 'review_required', totalCents: null };
  if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 366) throw fail('Use a valid session count');
  const amountCents = estimateMoney(perSessionResponsibilityCents);
  return { status: 'verified_estimate', sessionCount, perSessionResponsibilityCents: amountCents, totalCents: estimateMoney(amountCents * sessionCount), disclaimer: 'This planning estimate is not a guarantee of coverage or final patient responsibility. The planning period is not a limit on covered care.' };
}
export function estimateDisclosure(snapshot) {
  return [
    `This estimate covers ${snapshot.startDate} through ${snapshot.endDate}. Expected frequency: ${snapshot.frequency}. The planning period does not limit treatment or insurance coverage. We will review expected services and provide an updated estimate when the care plan, provider, frequency or fees change.`,
    'This estimate describes the services reasonably expected now. Actual services and charges may differ. Additional services may need separate scheduling and a separate estimate. Ask billing for an estimate for those services before scheduling.',
    'This is not a contract. You are not required to receive services from the providers listed. Acknowledging receipt does not waive any rights or authorize a card charge.',
    'If a provider’s bill is at least $400 more than that provider’s Good Faith Estimate, you may qualify for the federal patient-provider dispute process. Start within 120 calendar days of the date on the initial bill. Visit https://www.cms.gov/medical-bill-rights or call 1-800-985-3059 for instructions. Using the dispute process will not affect the quality of your care.',
    'Keep a copy of this estimate. You may request a copy from the care team. The cost estimate is retained with your client record.'
  ];
}
