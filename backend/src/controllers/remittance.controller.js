import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { listRemittances,remittanceDetail,syncRemittances,postRemittanceItem,matchRemittanceItem,applyResponsibilityJobs } from '../services/remittances/store.js';
const positive=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw Object.assign(new Error('A valid record identifier is required'),{status:400});return n;};
const handle=fn=>async(req,res,next)=>{try{
 const agencyId=positive(req.body?.agencyId||req.query.agencyId);
 await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
 res.json(await fn(req,agencyId));
}catch(e){next(e);}};
export const indexRemittances=handle((req,agencyId)=>listRemittances(agencyId,{before:req.query.before?positive(req.query.before):0}));
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
