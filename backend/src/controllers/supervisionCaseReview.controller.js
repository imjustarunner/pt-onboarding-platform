import pool from '../config/database.js';
import { documentationScope } from './supervisedBilling.controller.js';
import { listSupervisionCases, buildSupervisionCaseOverview } from '../services/supervisionCaseReview.service.js';
import { policyError } from '../services/supervisedBillingPolicy.service.js';
const clientIdFor=req=>{const id=Number(req.params.clientId);if(!Number.isSafeInteger(id)||id<1)throw policyError(400,'Valid client is required');return id;};
export async function getSupervisionCases(req,res,next) {
  try {
    const s=await documentationScope(req),cursor=Number(req.query.afterClientId || 0);
    if(!Number.isSafeInteger(cursor)||cursor<0)throw policyError(400,'Invalid case cursor');
    res.json(await listSupervisionCases(s,cursor));
  }catch(e){next(e);}
}
export async function getSupervisionCaseOverview(req,res,next) {
  try {
    const s=await documentationScope(req),clientId=clientIdFor(req),overview=await buildSupervisionCaseOverview(s,clientId);
    // Fail closed when the durable access audit is unavailable.
    await pool.execute(`INSERT INTO supervision_case_review_events (agency_id,provider_user_id,reviewer_user_id,client_id,event_type,content_hash) VALUES (?,?,?,?,'view',?)`,[s.agencyId,s.providerUserId,req.user.id,clientId,overview.contentHash]);
    const [[ack]]=await pool.execute(`SELECT created_at,content_hash FROM supervision_case_review_events WHERE agency_id=? AND provider_user_id=? AND reviewer_user_id=? AND client_id=? AND event_type='acknowledged' ORDER BY id DESC LIMIT 1`,[s.agencyId,s.providerUserId,req.user.id,clientId]);
    res.json({...overview,acknowledgedAt:ack?.content_hash===overview.contentHash?ack.created_at:null});
  }catch(e){next(e);}
}
export async function acknowledgeSupervisionCase(req,res,next) {
  try {
    const s=await documentationScope(req,{reviewerOnly:true}),clientId=clientIdFor(req);
    if(req.body.attested!==true)throw policyError(400,'Attest to review of this case overview');
    const overview=await buildSupervisionCaseOverview(s,clientId);
    if(req.body.contentHash!==overview.contentHash)throw policyError(409,'Case documents changed. Refresh and review before acknowledging.');
    await pool.execute(`INSERT INTO supervision_case_review_events (agency_id,provider_user_id,reviewer_user_id,client_id,event_type,content_hash) VALUES (?,?,?,?,'acknowledged',?)`,[s.agencyId,s.providerUserId,req.user.id,clientId,overview.contentHash]);
    res.json({ok:true});
  }catch(e){next(e);}
}
