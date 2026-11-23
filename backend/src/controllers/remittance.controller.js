import { createHash } from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import { claimEventHistory, recordClaimEvent } from '../services/claimMdWorkflow.service.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { listRemittances,remittanceDetail,syncRemittances,postRemittanceItem,matchRemittanceItem,applyResponsibilityJobs } from '../services/remittances/store.js';
const positive=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw Object.assign(new Error('A valid record identifier is required'),{status:400});return n;};
const handle=fn=>async(req,res,next)=>{try{
 const agencyId=positive(req.body?.agencyId||req.query?.agencyId);
 await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
 res.json(await fn(req,agencyId));
}catch(e){next(e);}};
export const indexRemittances=handle((req,agencyId)=>listRemittances(agencyId,{...req.query,before:req.query.before?positive(req.query.before):0}));
export const getRemittance=handle((req,agencyId)=>remittanceDetail(agencyId,positive(req.params.id)));
export const syncEras=handle(async(req,agencyId)=>{const result=await syncRemittances({agencyId});return {...result,balanceUpdates:await applyResponsibilityJobs(agencyId)};});
export const retryBalances=handle((req,agencyId)=>applyResponsibilityJobs(agencyId));
export const matchEra=handle(async(req,agencyId)=>{await matchRemittanceItem({agencyId,id:positive(req.params.id),itemId:positive(req.params.itemId),claimId:positive(req.body.claimId),reason:req.body.reason,actorUserId:req.user.id});return {matched:true};});
export const postEra=handle(async(req,agencyId)=>{
 const result=await postRemittanceItem({agencyId,id:positive(req.params.id),itemId:positive(req.params.itemId),reviewHash:req.body.reviewHash,approved:req.body.approved,actorUserId:req.user.id});
 // A main-database outage cannot roll back the immutable insurance posting.
 // The durable outbox remains visible and retryable.
 try{return {...result,balanceUpdates:await applyResponsibilityJobs(agencyId)};}catch{return {...result,balanceReviewRequired:true};}
});

const externalEventType = 'external_remittance_processed';
export const externalRemittance = handle(async (req, agencyId) => {
  const claimId = positive(req.params.claimId);
  const [[claim]] = await clinicalPool.execute(
    'SELECT id FROM clinical_claims WHERE id = ? AND agency_id = ? AND is_deleted = 0',
    [claimId, agencyId]
  );
  if (!claim) throw Object.assign(new Error('Claim not found.'), { status: 404 });
  if (req.method === 'POST') {
    const { source, reference, processedOn } = req.body || {};
    const sourceName = typeof source === 'string' ? source.trim() : '';
    const trace = typeof reference === 'string' ? reference.trim() : '';
    const date = typeof processedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(processedOn)
      ? new Date(processedOn + 'T00:00:00Z') : null;
    if (!sourceName || sourceName.length > 80 || !trace || trace.length > 120
      || !date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== processedOn
      || date.getTime() > Date.now()) {
      throw Object.assign(new Error('Enter where the remittance was processed, a reference and a valid processing date.'), { status: 400 });
    }
    const fingerprint = createHash('sha256').update(JSON.stringify([claimId, sourceName.toLowerCase(), trace.toLowerCase(), processedOn])).digest('hex');
    await recordClaimEvent({
      agencyId, claimId, connectionId: 'external', eventKey: `era-external:${fingerprint}`,
      eventType: externalEventType, actorUserId: req.user.id,
      payload: { source: sourceName, reference: trace, processedOn }
    });
  }
  return { records: await claimEventHistory(agencyId, claimId, { eventType: externalEventType }) };
});
