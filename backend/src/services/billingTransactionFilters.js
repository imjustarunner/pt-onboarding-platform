const fail = message => Object.assign(new Error(message), { status: 400 });
const present = value => value != null && value !== '';
const date = (value, label) => {
  if (!present(value)) return null;
  const text = String(value);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0,10) !== text) throw fail(`Choose a valid ${label} date.`);
  return text;
};
export const includesDemoBilling = query => query.includeDemo === true || query.includeDemo === 'true' || query.includeDemo === '1';
export const syntheticBillingRow = row => Number(row.is_demo_client) === 1 || row.is_demo_source === true || ['qa_appointment','guardian_demo_copay','guardian_demo_receipt'].includes(row.source_type) || row.source_hold_reason === 'synthetic_demo';
export const transactionPayerKey = row => row.destination_payer_id ? `id:${row.destination_payer_id}` : row.payer_name ? `name:${row.payer_name}` : '';

export function parseTransactionFilters(query = {}) {
  let clinicianId = null;
  if (present(query.clinicianId)) {
    clinicianId = Number(query.clinicianId);
    if (!Number.isSafeInteger(clinicianId) || clinicianId < 1) throw fail('Choose a valid clinician.');
  }
  const filters = { clinicianId, serviceFrom:date(query.serviceFrom,'service start'),serviceTo:date(query.serviceTo,'service end'),postedFrom:date(query.postedFrom,'posted start'),postedTo:date(query.postedTo,'posted end') };
  for (const [from,to,label] of [['serviceFrom','serviceTo','service'],['postedFrom','postedTo','posted']]) if (filters[from] && filters[to] && filters[from] > filters[to]) throw fail(`The ${label} end date must be on or after its start date.`);
  for (const key of ['serviceCode','payer','claimStatus','transactionType']) {
    const value = String(query[key] || '').trim();
    if (value.length > 160 || /[\x00-\x1f]/.test(value)) throw fail('A transaction filter is invalid.');
    filters[key] = key === 'serviceCode' ? value.toUpperCase() : value;
  }
  return filters;
}

export function transactionMatches(row, filters) {
  const dos = String(row.date_of_service || '').slice(0,10), posted = row.posted_date || String(row.posted_at || '').slice(0,10);
  return !!((!filters.clinicianId || Number(row.provider_user_id) === filters.clinicianId)
    && (!filters.serviceFrom || (dos && dos >= filters.serviceFrom)) && (!filters.serviceTo || (dos && dos <= filters.serviceTo))
    && (!filters.postedFrom || (posted && posted >= filters.postedFrom)) && (!filters.postedTo || (posted && posted <= filters.postedTo))
    && (!filters.serviceCode || (row.service_codes || [row.service_code]).some(code => String(code || '').toUpperCase() === filters.serviceCode))
    && (!filters.payer || transactionPayerKey(row) === filters.payer)
    && (!filters.claimStatus || (row.claim_stage || row.claim_lifecycle || 'not_linked') === filters.claimStatus)
    && (!filters.transactionType || row.kind === filters.transactionType));
}

export function transactionFilterOptions(rows) {
  const choices = { clinicians:new Map(),serviceCodes:new Map(),payers:new Map(),claimStatuses:new Map(),transactionTypes:new Map() };
  for (const row of rows) {
    if (row.provider_user_id) choices.clinicians.set(String(row.provider_user_id), row.provider_name || `Clinician #${row.provider_user_id}`);
    for (const code of row.service_codes || [row.service_code]) if (code) choices.serviceCodes.set(code,code);
    const payer = transactionPayerKey(row); if (payer) choices.payers.set(payer,row.payer_name || row.destination_payer_id);
    const status = row.claim_stage || row.claim_lifecycle || 'not_linked'; choices.claimStatuses.set(status,status);
    if (row.kind) choices.transactionTypes.set(row.kind,row.kind);
  }
  return Object.fromEntries(Object.entries(choices).map(([key,map]) => [key,[...map].map(([value,label]) => ({ value,label })).sort((a,b) => a.label.localeCompare(b.label,undefined,{numeric:true,sensitivity:'base'}))]));
}
