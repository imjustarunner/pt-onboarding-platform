import { listPayerSetupRequests } from './payerSetupCatalog.service.js';
import { applyConfiguredCarrier, policyIsMedicaid } from '../utils/insurancePaymentPolicy.js';
import { listSharedPayerDirectory } from './sharedPayerDirectory.service.js';

const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
export async function clientInsurancePayers(agencyId, db) {
  const rows = await listPayerSetupRequests(agencyId, db);
  const own=rows.filter(row => row.directory_status === 'id_match' && row.claimmd_payer_id);
  const existing=new Set(own.map(row=>row.claimmd_payer_id));
  const shared=await listSharedPayerDirectory(db,process.env,agencyId);
  const catalog=[...own,...shared.filter(row=>!existing.has(row.claimmd_payer_id)).map(row=>({...row,id:`claimmd:${row.claimmd_payer_id}`,sharedDirectory:true}))];
  return catalog.map(row => {
    const snapshot = parse(row.directory_snapshot_json);
    const aliases = parse(row.source_names_json);
    const names = [...new Set([row.payer_name, row.directory_name, ...(Array.isArray(aliases) ? aliases : []),
      ...(Array.isArray(snapshot.payer_alt_names) ? snapshot.payer_alt_names.map(item => item.alt_payer_name) : [])].filter(Boolean))];
    // Match the printed carrier to an already verified agency route. Never add
    // a route or make a directory request from an OCR guess.
    if(row.claimmd_payer_id==='84146' && names.some(name=>/\bchampva\b/i.test(name)))names.push('CHAMPVA');
    if(['COCHA','SKCO0'].includes(row.claimmd_payer_id))names.push('Colorado Medicaid','Health First Colorado');
    // A shared route can carry Commercial and Medicaid plans. Its aliases are
    // search hints, not evidence that this client's coverage is Medicaid.
    const isMedicaid = (row.sharedDirectory ? String(snapshot.payer_type || '').toLowerCase()==='medicaid' : names.some(insurerName => policyIsMedicaid({insurerName}))) || ['COCHA', 'SKCO0'].includes(row.claimmd_payer_id);
    const colorado = isMedicaid && (row.claimmd_payer_id === 'COCHA' || names.some(name => /colorado|\bccha\b/i.test(name)));
    return {id: row.sharedDirectory?row.id:Number(row.id), sharedDirectory:row.sharedDirectory===true, sourcePayerId: row.source_payer_id || null, name: row.sharedDirectory ? (row.directory_name || snapshot.payer_name || row.payer_name) : (row.payer_name || row.directory_name), names, payerId: row.claimmd_payer_id,
      eligibilityPayerId: colorado ? 'SKCO0' : row.claimmd_payer_id, isMedicaid,
      directoryName:row.directory_name || snapshot.payer_name || row.payer_name,
      directoryCheckedAt:row.directory_checked_at || null,
      claimsSupport:snapshot['1500_claims'] || 'unknown',eligibilitySupport:snapshot.eligibility || 'unknown'};
  });
}

export function resolveConfiguredPolicy(policy, payers) {
  if (!policy?.payerCatalogId) return policy;
  const catalogId=String(policy.payerCatalogId);
  const payer = payers.find(row => String(row.id) === catalogId) || (catalogId.startsWith('claimmd:') ? payers.find(row=>row.payerId===catalogId.slice('claimmd:'.length)) : null);
  if (!payer) throw Object.assign(new Error('The selected carrier is no longer available in this organization’s payer directory. Reload and select its current payer.'), {status:409});
  return applyConfiguredCarrier(policy, payer);
}
