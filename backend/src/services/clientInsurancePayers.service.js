import { listPayerSetupRequests } from './payerSetupCatalog.service.js';
import { applyConfiguredCarrier, policyIsMedicaid } from '../utils/insurancePaymentPolicy.js';

const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
export async function clientInsurancePayers(agencyId, db) {
  const rows = await listPayerSetupRequests(agencyId, db);
  return rows.filter(row => row.directory_status === 'id_match' && row.claimmd_payer_id).map(row => {
    const snapshot = parse(row.directory_snapshot_json);
    const aliases = parse(row.source_names_json);
    const names = [...new Set([row.payer_name, row.directory_name, ...(Array.isArray(aliases) ? aliases : []),
      ...(Array.isArray(snapshot.payer_alt_names) ? snapshot.payer_alt_names.map(item => item.alt_payer_name) : [])].filter(Boolean))];
    // Match the printed carrier to an already verified agency route. Never add
    // a route or make a directory request from an OCR guess.
    if(row.claimmd_payer_id==='84146' && names.some(name=>/\bchampva\b/i.test(name)))names.push('CHAMPVA');
    if(['COCHA','SKCO0'].includes(row.claimmd_payer_id))names.push('Colorado Medicaid','Health First Colorado');
    const isMedicaid = names.some(insurerName => policyIsMedicaid({insurerName})) || ['COCHA', 'SKCO0'].includes(row.claimmd_payer_id);
    const colorado = isMedicaid && (row.claimmd_payer_id === 'COCHA' || names.some(name => /colorado|\bccha\b/i.test(name)));
    return {id: Number(row.id), sourcePayerId: row.source_payer_id || null, name: row.payer_name || row.directory_name, names, payerId: row.claimmd_payer_id,
      eligibilityPayerId: colorado ? 'SKCO0' : row.claimmd_payer_id, isMedicaid};
  });
}

export function resolveConfiguredPolicy(policy, payers) {
  if (!policy?.payerCatalogId) return policy;
  const payer = payers.find(row => String(row.id) === String(policy.payerCatalogId));
  if (!payer) throw Object.assign(new Error('The selected carrier is no longer configured for this agency. Reload and select its current payer.'), {status:409});
  return applyConfiguredCarrier(policy, payer);
}
