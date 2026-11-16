import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import { recordClaimEvent } from './claimMdWorkflow.service.js';
import { previouslyTransmitted } from './claimServiceChanges.service.js';

const fail = (status,message) => Object.assign(new Error(message),{status});
export async function closeUnsubmittedClaim({agencyId,claimId,actorUserId,reason,revision}, {dbPool=clinicalPool,record=recordClaimEvent,transmitted=previouslyTransmitted}={}) {
  const explanation=String(reason || '').trim();
  if(explanation.length<10 || explanation.length>2000)throw fail(400,'Enter a closure reason of 10–2,000 characters');
  if(!Number.isSafeInteger(Number(revision)) || Number(revision)<0)throw fail(400,'A current billing revision is required');
  if(!Number.isSafeInteger(Number(actorUserId)) || Number(actorUserId)<1)throw fail(401,'An authenticated closure actor is required');
  const db=await dbPool.getConnection();
  try {
    await db.beginTransaction();
    const [[claim]]=await db.execute('SELECT * FROM clinical_claims WHERE id=? AND agency_id=? AND is_deleted=0 FOR UPDATE',[claimId,agencyId]);
    if(!claim)throw fail(404,'Claim not found');
    if(Number(claim.billing_revision)!==Number(revision))throw fail(409,'This claim changed. Refresh before closing it');
    if(!['draft','ready','rejected'].includes(claim.claim_lifecycle) || await transmitted(claim,db))throw fail(409,'Only an unsubmitted claim can be closed locally. Reconcile transmitted claims with the payer first');
    const [[submission]]=await db.execute("SELECT id FROM claimmd_claim_events WHERE agency_id=? AND clinical_claim_id=? AND event_type='approved_submission' LIMIT 1",[agencyId,claimId]);
    if(submission)throw fail(409,'This claim has a recorded submission approval. Reconcile that attempt before closing it');
    const metadata=typeof claim.metadata_json==='string'?JSON.parse(claim.metadata_json):claim.metadata_json || {};
    const closure={actorUserId:Number(actorUserId),closedAt:new Date().toISOString(),reason:explanation,previousLifecycle:claim.claim_lifecycle};
    const recorded=await record({agencyId,claimId,connectionId:claim.claimmd_connection_id || `local:${agencyId}`,eventKey:`closure:${crypto.randomUUID()}`,eventType:'claim_closed',status:'closed',actorUserId:Number(actorUserId),payload:closure},db);
    if(!recorded)throw fail(409,'Closure history could not be recorded');
    await db.execute("UPDATE clinical_claims SET claim_lifecycle='closed',metadata_json=?,billing_revision=billing_revision+1 WHERE id=? AND agency_id=?",[JSON.stringify({...metadata,claimClosure:closure}),claimId,agencyId]);
    await db.commit();
    return {closed:true,closure};
  } catch(error){await db.rollback();throw error;} finally {db.release();}
}
