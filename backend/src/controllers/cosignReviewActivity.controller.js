import pool from '../config/database.js';
import {documentationScope} from './supervisedBilling.controller.js';
import {loadReviewDocument} from '../services/clinicalReviewDocument.service.js';
import {hasCurrentSupervisorCosign,policyError} from '../services/supervisedBillingPolicy.service.js';
import {assertOtherProviderNote,startCosignActivity,heartbeatCosignActivity,submitCosignActivity} from '../services/cosignReviewActivity.service.js';
export async function startReviewActivity(req,res,next){try{
 const s=await documentationScope(req,{supervisorOnly:true}),noteId=Number(req.body.noteId);
 if(!Number.isSafeInteger(noteId)||noteId<1)throw policyError(400,'Note is required.');
 const d=await loadReviewDocument(s,'note',noteId);assertOtherProviderNote({actorId:req.user.id,providerId:s.providerUserId,note:d.row,canAttest:s.canAttest});
 if(d.hash!==req.body.contentHash||hasCurrentSupervisorCosign(d.row,s.policy.supervisorUserId,d.hash))throw policyError(409,'Open the current note awaiting your co-signature.');
 res.json({item:await startCosignActivity({agencyId:s.agencyId,providerId:s.providerUserId,actorId:req.user.id,noteId,hash:d.hash,sessionKey:req.body.sessionKey})});
}catch(e){next(e);}}
export async function pulseReviewActivity(req,res,next){try{
 const s=await documentationScope(req,{supervisorOnly:true});
 res.json({item:await heartbeatCosignActivity({agencyId:s.agencyId,providerId:s.providerUserId,actorId:req.user.id,id:Number(req.params.activityId),active:req.body.active===true,close:req.body.close===true})});
}catch(e){next(e);}}
export async function submitReviewActivity(req,res,next){try{
 const s=await documentationScope(req,{supervisorOnly:true});
 res.json(await submitCosignActivity({agencyId:s.agencyId,providerId:s.providerUserId,actorId:req.user.id,id:Number(req.params.activityId),attested:req.body.attested}));
}catch(e){next(e);}}
export async function listReviewActivities(req,res,next){try{
 const s=await documentationScope(req,{supervisorOnly:true});
 const [items]=await pool.execute('SELECT a.id,a.note_id,a.started_at,a.ended_at,a.active_seconds,a.payroll_time_claim_id,c.status AS claim_status FROM cosign_review_activity a LEFT JOIN payroll_time_claims c ON c.id=a.payroll_time_claim_id WHERE a.agency_id=? AND a.provider_user_id=? AND a.supervisor_user_id=? ORDER BY a.id DESC LIMIT 200',[s.agencyId,s.providerUserId,req.user.id]);res.json({items});
}catch(e){next(e);}}
