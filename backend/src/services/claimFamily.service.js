import clinicalPool from '../config/clinicalDatabase.js';
import { attachClaimReferences } from './clinicalClaimReferences.service.js';

const object = value => { try { return typeof value === 'string' ? JSON.parse(value) || {} : value || {}; } catch { return {}; } };
export const claimRecordId = row => Number(row.claimId || row.id);
const metadata = row => object(row.metadata_json || row.claim_metadata_json);
const retry = row => row.resubmission || metadata(row).resubmission;
const sameService = (a,b) => ['agency_id','client_id','clinical_session_id'].every(key => Number(a[key])===Number(b[key])) && Number(a.payer_sequence||1)===Number(b.payer_sequence||1) && Number(a.parent_claim_id||0)===Number(b.parent_claim_id||0);
const fail = message => Object.assign(new Error(message), {status:409});

// Follow explicit retry links only. A separate original or secondary claim is
// never merged just because it has the same patient, service date or amount.
export function claimFamilies(rows) {
  const byId=new Map(rows.map(row=>[claimRecordId(row),row])), groups=new Map();
  for(const row of rows){
    let root=row;const seen=new Set();
    while(retry(root)?.sourceClaimId){
      const id=claimRecordId(root);
      if(seen.has(id))throw fail('The claim submission history contains a circular link. Billing must reconcile it before continuing.');
      seen.add(id);
      const source=byId.get(Number(retry(root).sourceClaimId));
      if(!source || !sameService(row,source))throw fail('The linked claim submission is unavailable or belongs to a different service.');
      root=source;
    }
    const rootId=claimRecordId(root);
    if(!groups.has(rootId))groups.set(rootId,{root,attempts:[]});
    groups.get(rootId).attempts.push(row);
  }
  return [...groups.values()].map(group=>{
    group.attempts.sort((a,b)=>claimRecordId(a)-claimRecordId(b));
    return {...group,current:group.attempts.at(-1),claimReference:group.root.claim_reference || group.root.claim_number || null};
  });
}

export function collapseClaimAttempts(items) {
  const claims=items.filter(row=>row.claimId), other=items.filter(row=>!row.claimId);
  return [...other,...claimFamilies(claims).map(family=>({...family.current,
    claim_reference:family.claimReference,claim_root_id:claimRecordId(family.root),
    attempt_count:family.attempts.length,attempt_ids:family.attempts.map(claimRecordId),
    claim_aliases:[...new Set(family.attempts.flatMap(row=>[row.claim_reference,row.attempt_reference,row.claim_number,String(claimRecordId(row))]).filter(Boolean))]
  }))];
}

export async function loadClaimFamily(agencyId,claimId,db=clinicalPool) {
  const [[target]]=await db.execute('SELECT id,agency_id,client_id,clinical_session_id,payer_sequence,parent_claim_id FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0',[claimId,agencyId]);
  if(!target)throw Object.assign(new Error('Claim not found'),{status:404});
  const [rows]=await db.execute(`SELECT id,agency_id,client_id,clinical_session_id,payer_sequence,parent_claim_id,claim_number,claim_lifecycle,billing_revision,claimmd_submitted_at,claimmd_claim_id,metadata_json,created_at
    FROM clinical_claims WHERE agency_id=? AND client_id=? AND clinical_session_id=? AND is_deleted=0 ORDER BY id`,[agencyId,target.client_id,target.clinical_session_id]);
  await attachClaimReferences(rows,db);
  const family=claimFamilies(rows).find(group=>group.attempts.some(row=>claimRecordId(row)===Number(claimId)));
  if(!family)throw fail('Claim history could not be resolved. Refresh before continuing.');
  // Existing transmissions retain their actual patient-control number. New
  // claims use the practice/year/month/sequence number. Retry creation freezes
  // that value so an old transmitted alias is never silently renumbered.
  const own=family.attempts.find(row=>claimRecordId(row)===Number(claimId));
  const frozen=metadata(own).resubmission?.patientControlNumber;
  const submitted=family.attempts.filter(row=>row.claimmd_submitted_at || row.claimmd_claim_id).at(-1);
  family.patientControlNumber=String(frozen || (submitted ? submitted.claim_number || submitted.id : family.root.claim_number || family.claimReference) || '');
  if(!family.patientControlNumber || family.patientControlNumber.length>32)throw fail('A claim number of up to 32 characters is required before submission.');
  return family;
}
