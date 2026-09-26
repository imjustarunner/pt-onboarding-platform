import clinicalPool from '../../config/clinicalDatabase.js';
import Agency from '../../models/Agency.model.js';
import { encryptFamilyBilling as encrypt, decryptFamilyBilling as decrypt } from '../familyBillingEncryption.service.js';
import { assertExclusiveClaimMdTaxId, listClaimMdBillingProfiles } from '../claimMdBillingProfile.service.js';
import { fetchEraList, fetchEraData } from '../claimMd.service.js';
import { resolveClaimMdConnection } from '../claimMdConnection.service.js';
import { recordClaimEvent } from '../claimMdWorkflow.service.js';
import { setClaimResponsibility } from '../familyLedger/sources.js';
import { normalizeEra, matchesSubmission, list, hash, fail } from './normalize.js';

const context = (agencyId, id, kind='era') => `remittance:${agencyId}:${kind}:${id}`;
const decode = row => decrypt(row.payload_encrypted,context(row.agency_id,row.id));
const decodeItem = row => decrypt(row.payload_encrypted,context(row.agency_id,row.id,'item'));
async function transaction(fn, pool=clinicalPool) {
 const db=await pool.getConnection();
 try { await db.beginTransaction();const result=await fn(db);await db.commit();return result; }
 catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function billingIdentity(agencyId) {
 const [agency,profiles,connection]=await Promise.all([Agency.findById(agencyId),listClaimMdBillingProfiles(agencyId),resolveClaimMdConnection(agencyId)]);
 const taxId=String(agency?.tax_id||'').replace(/\D/g,'');
 if(!/^\d{9}$/.test(taxId))throw fail(409,'Save the agency tax ID in Company Profile first');
 await assertExclusiveClaimMdTaxId(agencyId,taxId);
 const npis=[...new Set(profiles.map(p=>String(p.practice_npi||'')).filter(n=>/^\d{10}$/.test(n)))];
 if(!npis.length)throw fail(409,'Configure an agency-owned billing office and group NPI first');
 return {taxId,npis,connection};
}
async function submissionMatches(db,agencyId,connectionId,item,era,claimId=null) {
 const [claims]=await db.execute(`SELECT id,claim_lifecycle,claimmd_submitted_at FROM clinical_claims WHERE agency_id=? AND claimmd_connection_id=? AND is_deleted=0 AND ${claimId?'id=?':'(claim_number=? OR CAST(id AS CHAR)=?)'}`,
 claimId?[agencyId,connectionId,claimId]:[agencyId,connectionId,item.pcn,item.pcn]);
 const matches=[];
 for(const claim of claims){
  if(!claim.claimmd_submitted_at||claim.claim_lifecycle==='void')continue;
  const [events]=await db.execute("SELECT event_key,payload_encrypted FROM claimmd_claim_events WHERE agency_id=? AND clinical_claim_id=? AND connection_id=? AND event_type='approved_submission' ORDER BY id DESC LIMIT 1",[agencyId,claim.id,connectionId]);
  const event=events[0];if(!event)continue;
  const sent=decrypt(event.payload_encrypted,`claimmd:${agencyId}:${claim.id}:${event.event_key}`)?.payload;
  if(matchesSubmission(item,era,sent,{allowPcnOverride:!!claimId}))matches.push(claim.id);
 }
 return matches;
}
export async function importRemittance({agencyId,connection,raw,identity,pool=clinicalPool}) {
 const era=normalizeEra(raw,{...identity,eraId:raw.eraid}),digest=hash(raw);
 return transaction(async db=>{
  // The unique insert serializes concurrent imports before any child records exist.
  await db.execute(`INSERT INTO claimmd_remittances(agency_id,connection_id,era_id,payload_hash,payer_id,billing_npi,paid_date,paid_cents,difference_cents,status,payload_encrypted) VALUES(?,?,?,?,?,?,?,?,?,'review','') ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
   [agencyId,connection.connectionId,era.eraId,digest,era.payerId,era.billingNpi,era.paidDate,era.paidCents,era.differenceCents]);
  const [[row]]=await db.execute('SELECT * FROM claimmd_remittances WHERE agency_id=? AND connection_id=? AND era_id=? FOR UPDATE',[agencyId,connection.connectionId,era.eraId]);
  if(row.payload_encrypted){
   if(row.payload_hash!==digest){await db.execute("UPDATE claimmd_remittances SET status='source_changed' WHERE id=?",[row.id]);return {id:row.id,status:'source_changed'};}
   return {id:row.id,status:row.status,existing:true};
  }
  // Preserve the original ERA encrypted. The API only exposes a curated view, never bank account fields.
  await db.execute('UPDATE claimmd_remittances SET payload_encrypted=? WHERE id=?',[encrypt({raw,era},context(agencyId,row.id)),row.id]);
  for(const item of era.items){
   const matches=await submissionMatches(db,agencyId,connection.connectionId,item,era);
   const claimId=matches.length===1?matches[0]:null;
   const status=item.blockers.length||era.requiresReview||item.reversal?'review':claimId?'matched':'unmatched';
   const [created]=await db.execute("INSERT INTO claimmd_remittance_items(agency_id,remittance_id,item_index,clinical_claim_id,status,payload_encrypted) VALUES(?,?,?,?,?,'')",[agencyId,row.id,item.index,claimId,status]);
   await db.execute('UPDATE claimmd_remittance_items SET payload_encrypted=? WHERE id=?',[encrypt(item,context(agencyId,created.insertId,'item')),created.insertId]);
  }
  return {id:row.id,status:'review',existing:false};
 },pool);
}
export async function syncRemittances({agencyId,maxDownloads=10}) {
 const identity=await billingIdentity(agencyId),{connection}=identity;
 let imported=0,skipped=0,moreAvailable=false;
 // Rescan directory pages: a cursor must never skip an older unimported ERA.
 // Bounded runs resume by skipping durable imports. This also works for initial backfill.
 for(let page=1;page<=100;page++){
  const result=await fetchEraList({accountKey:connection.accountKey,taxId:identity.taxId,page:String(page)}),rows=list(result.era);
  for(const entry of rows){
   if(String(entry.prov_taxid||'').replace(/\D/g,'')!==identity.taxId||!identity.npis.includes(String(entry.prov_npi))){skipped++;continue;}
   const [[known]]=await clinicalPool.execute('SELECT id FROM claimmd_remittances WHERE agency_id=? AND connection_id=? AND era_id=?',[agencyId,connection.connectionId,String(entry.eraid)]);
   if(known)continue;
   if(imported>=maxDownloads){moreAvailable=true;break;}
   const raw=await fetchEraData({accountKey:connection.accountKey,eraId:String(entry.eraid)});
   normalizeEra(raw,{...identity,eraId:String(entry.eraid)});
   await importRemittance({agencyId,connection,raw,identity});imported++;
   await new Promise(resolve=>setTimeout(resolve,700));
  }
  if(moreAvailable||rows.length<100)break;
  if(page===100)moreAvailable=true;
  await new Promise(resolve=>setTimeout(resolve,700));
 }
 await clinicalPool.execute('INSERT INTO claimmd_era_sync_state(agency_id,connection_id,last_success_at) VALUES(?,?,NOW()) ON DUPLICATE KEY UPDATE last_success_at=NOW()',[agencyId,connection.connectionId]);
 return {imported,skipped,moreAvailable};
}
export async function listRemittances(agencyId,{before=0}={}) {
 const [rows]=await clinicalPool.execute(`SELECT * FROM claimmd_remittances WHERE agency_id=? ${before?'AND id<?':''} ORDER BY id DESC LIMIT 51`,before?[agencyId,before]:[agencyId]);
 const [totals]=await clinicalPool.execute('SELECT COUNT(*) AS count,COALESCE(SUM(paid_cents),0) AS paidCents,COALESCE(SUM(adjustment_cents-responsibility_cents),0) AS adjustmentCents FROM claimmd_payment_postings WHERE agency_id=?',[agencyId]);
 const [jobs]=await clinicalPool.execute("SELECT COUNT(*) AS count FROM claimmd_responsibility_jobs WHERE agency_id=? AND status NOT IN ('completed','superseded')",[agencyId]);
 const [sync]=await clinicalPool.execute('SELECT MAX(last_success_at) AS lastSyncAt FROM claimmd_era_sync_state WHERE agency_id=?',[agencyId]);
 return {rows:rows.slice(0,50).map(r=>{const {era}=decode(r);return {id:r.id,eraId:era.eraId,payerName:era.payerName,paidDate:era.paidDate,paidCents:era.paidCents,status:r.status,claimCount:era.items.length};}),nextBefore:rows.length>50?rows[49].id:null,totals:totals[0],pendingBalances:Number(jobs[0].count),lastSyncAt:sync[0].lastSyncAt};
}
export async function remittanceDetail(agencyId,id) {
 const [[row]]=await clinicalPool.execute('SELECT * FROM claimmd_remittances WHERE id=? AND agency_id=?',[id,agencyId]);
 if(!row)throw fail(404,'Remittance not found');
 const {era}=decode(row);
 const [items]=await clinicalPool.execute('SELECT i.*,j.status AS balance_status,j.error_message FROM claimmd_remittance_items i LEFT JOIN claimmd_payment_postings p ON p.remittance_item_id=i.id LEFT JOIN claimmd_responsibility_jobs j ON j.posting_id=p.id WHERE i.remittance_id=? AND i.agency_id=? ORDER BY i.item_index',[id,agencyId]);
 return {id:row.id,status:row.status,reviewHash:row.payload_hash,...era,items:items.map(i=>({...decodeItem(i),id:i.id,claimId:i.clinical_claim_id,postingStatus:i.status,balanceStatus:i.balance_status,balanceError:i.error_message}))};
}
export async function matchRemittanceItem({agencyId,id,itemId,claimId,reason,actorUserId}) {
 if(!String(reason||'').trim())throw fail(400,'Document why this claim matches the remittance');
 return transaction(async db=>{
  const [[row]]=await db.execute('SELECT * FROM claimmd_remittances WHERE id=? AND agency_id=? FOR UPDATE',[id,agencyId]);
  if(!row||row.status==='source_changed')throw fail(409,'Remittance requires source reconciliation');
  const [[itemRow]]=await db.execute('SELECT * FROM claimmd_remittance_items WHERE id=? AND remittance_id=? AND agency_id=? FOR UPDATE',[itemId,id,agencyId]);
  if(!itemRow)throw fail(404,'Remittance item not found');
  if(itemRow.status==='posted')throw fail(409,'A posted remittance cannot be reassigned');
  const item=decodeItem(itemRow),{era}=decode(row);
  if((await submissionMatches(db,agencyId,row.connection_id,item,era,claimId)).length!==1)throw fail(409,'Payer, member, NPI, dates and service amounts must match the submitted claim');
  await db.execute('UPDATE claimmd_remittance_items SET clinical_claim_id=?,status=?,reviewed_by_user_id=?,review_encrypted=? WHERE id=?',[claimId,item.blockers.length||era.requiresReview||item.reversal?'review':'matched',actorUserId,encrypt({reason:String(reason).slice(0,2000),at:new Date().toISOString()},context(agencyId,itemId,'review')),itemId]);
 });
}
export async function postRemittanceItem({agencyId,id,itemId,reviewHash,actorUserId,approved,pool=clinicalPool}) {
 if(approved!==true)throw fail(400,'Review and approve the remittance before posting');
 const result=await transaction(async db=>{
  const [[row]]=await db.execute('SELECT * FROM claimmd_remittances WHERE id=? AND agency_id=? FOR UPDATE',[id,agencyId]);
  if(!row)throw fail(404,'Remittance not found');
  if(row.payload_hash!==reviewHash||row.status==='source_changed')throw fail(409,'Remittance changed; refresh and reconcile before posting');
  const [[itemRow]]=await db.execute('SELECT * FROM claimmd_remittance_items WHERE id=? AND remittance_id=? AND agency_id=? FOR UPDATE',[itemId,id,agencyId]);
  if(!itemRow)throw fail(404,'Remittance item not found');
  if(itemRow.status==='posted')return {posted:true,existing:true};
  const item=decodeItem(itemRow),{era}=decode(row);
  if(item.blockers.length||era.requiresReview||item.reversal)throw fail(409,'Reversals, provider adjustments and incomplete remittances require manual reconciliation');
  if(!itemRow.clinical_claim_id)throw fail(409,'Match this remittance to its submitted claim first');
  const [[claim]]=await db.execute('SELECT * FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0 FOR UPDATE',[itemRow.clinical_claim_id,agencyId]);
  if(!claim||claim.claim_lifecycle==='void')throw fail(409,'Reconcile the missing or voided claim first');
  if((await submissionMatches(db,agencyId,row.connection_id,item,era,claim.id)).length!==1)throw fail(409,'The claim no longer matches its remittance');
  const [previous]=await db.execute('SELECT id FROM claimmd_payment_postings WHERE agency_id=? AND clinical_claim_id=?',[agencyId,claim.id]);
  if(previous.length)throw fail(409,'This claim already has an adjudication. Reconcile additional payments or reversals before posting again');
  const [posting]=await db.execute('INSERT INTO claimmd_payment_postings(agency_id,remittance_item_id,clinical_claim_id,kind,paid_cents,adjustment_cents,responsibility_cents,posted_by_user_id) VALUES(?,?,?,?,?,?,?,?)',[agencyId,itemId,claim.id,item.denied?'denial':'payment',item.paidCents,item.adjustmentCents,item.responsibilityCents,actorUserId]);
  await db.execute("UPDATE claimmd_remittance_items SET status='posted',reviewed_by_user_id=? WHERE id=?",[actorUserId,itemId]);
  await db.execute('UPDATE clinical_claims SET claim_lifecycle=? WHERE id=? AND agency_id=?',[item.denied?'denied':item.paidCents>0?'paid':'adjusted',claim.id,agencyId]);
  await recordClaimEvent({agencyId,claimId:claim.id,connectionId:row.connection_id,eventKey:`era-post:${itemId}`,eventType:'remittance_posted',actorUserId,payload:{eraId:era.eraId,postingId:posting.insertId,paidCents:item.paidCents,adjustmentCents:item.adjustmentCents,responsibilityCents:item.responsibilityCents,payerControlNumber:item.payerControlNumber,denied:item.denied,forwarded:item.forwarded}},db);
  await db.execute('INSERT INTO claimmd_responsibility_jobs(posting_id,agency_id,clinical_claim_id,amount_cents,action,actor_user_id) VALUES(?,?,?,?,?,?)',[posting.insertId,agencyId,claim.id,item.responsibilityCents,item.forwarded?'secondary_review':'set',actorUserId]);
  const [[remaining]]=await db.execute("SELECT COUNT(*) AS count FROM claimmd_remittance_items WHERE remittance_id=? AND status<>'posted'",[id]);
  await db.execute('UPDATE claimmd_remittances SET status=? WHERE id=?',[Number(remaining.count)?'partially_posted':'posted',id]);
  return {posted:true,postingId:posting.insertId};
 },pool);
 return result;
}
export async function applyResponsibilityJobs(agencyId) {
 const [jobs]=await clinicalPool.execute("SELECT * FROM claimmd_responsibility_jobs WHERE agency_id=? AND status IN ('pending','review') ORDER BY id LIMIT 50",[agencyId]);
 const results=[];
 for(const job of jobs){
  // Cross-database delivery is at-least-once; the family ledger stores postingId
  // in the same transaction as its balance update so retries cannot double bill.
  try {
   const [[source]]=await clinicalPool.execute(`SELECT r.status FROM claimmd_payment_postings p JOIN claimmd_remittance_items i ON i.id=p.remittance_item_id JOIN claimmd_remittances r ON r.id=i.remittance_id WHERE p.id=? AND p.agency_id=?`,[job.posting_id,agencyId]);
   if(!source||source.status==='source_changed')throw fail(409,'Remittance source changed; reconcile the original posting before updating patient balances');
   if(job.action!=='set')throw fail(409,'Forwarded to another payer; review its final ERA before patient billing');
   const [[claim]]=await clinicalPool.execute('SELECT client_id,parent_claim_id,payer_sequence FROM clinical_claims WHERE id=? AND agency_id=?',[job.clinical_claim_id,agencyId]);
   if(!claim)throw fail(409,'Claim unavailable for balance reconciliation');
   await setClaimResponsibility({agencyId,claimId:job.clinical_claim_id,amountCents:Number(job.amount_cents),verificationBasis:'era',reason:`Claim.MD remittance posting ${job.posting_id}`,actorUserId:job.actor_user_id,remittancePostingId:job.posting_id});
   await transaction(async db=>{
    await db.execute("UPDATE claimmd_responsibility_jobs SET status='completed',error_message=NULL WHERE id=?",[job.id]);
    if(Number(claim.payer_sequence)===2&&claim.parent_claim_id)await db.execute("UPDATE claimmd_responsibility_jobs SET status='superseded',error_message='Replaced by verified final secondary adjudication' WHERE agency_id=? AND clinical_claim_id=? AND id<? AND status IN ('pending','review')",[agencyId,claim.parent_claim_id,job.id]);
   });
   results.push({id:job.id,status:'completed'});
  }catch(e){
   const message=e.status===409?e.message:'Patient balance update needs review; retry after resolving its setup';
   await clinicalPool.execute("UPDATE claimmd_responsibility_jobs SET status='review',error_message=? WHERE id=?",[String(message).slice(0,1000),job.id]);results.push({id:job.id,status:'review'});
  }
 }
 return results;
}
