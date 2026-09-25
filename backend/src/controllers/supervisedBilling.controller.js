import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { hasSchedulingBillingAccess } from '../services/schedulingBillingAccess.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../services/familyBillingEncryption.service.js';
import { loadReviewDocument } from '../services/clinicalReviewDocument.service.js';
import { recordClaimEvent } from '../services/claimMdWorkflow.service.js';
import { resolveDocumentationPolicy, normalizeSupervisionPolicy, normalizePayerPolicy, policyError, parseObject, normalizeNoteType, NONBILLABLE_TYPES, requiredDocumentReviewTypes, validNpi, isNonBillableDocument } from '../services/supervisedBillingPolicy.service.js';
import { withSupervisorTimeLock, reviewInterval, assertNoReviewTimeOverlap, assertNoMeetingOverlap } from '../services/supervisionReviewTime.service.js';

const mysqlTime=v=>v instanceof Date?v.toISOString().slice(0,19).replace('T',' '):String(v);

async function scope(req, { write = false, supervisorOnly = false } = {}) {
  const agencyId = Number(req.body?.agencyId || req.query?.agencyId), providerUserId = Number(req.params.providerId);
  if (!Number.isSafeInteger(agencyId) || agencyId < 1 || !Number.isSafeInteger(providerUserId) || providerUserId < 1) throw policyError(400, 'Agency and provider are required');
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  const [[member]] = await pool.execute('SELECT user_id FROM user_agencies WHERE agency_id = ? AND user_id = ?', [agencyId, providerUserId]);
  if (!member) throw policyError(404, 'Provider is not in this agency');
  const policy = await resolveDocumentationPolicy(agencyId, providerUserId);
  const assigned = Number(req.user.id) === policy.supervisorUserId;
  const admin = ['admin','super_admin'].includes(req.user.role);
  if (supervisorOnly ? !assigned : write ? !(assigned || admin) : !(assigned || admin || Number(req.user.id) === providerUserId)) throw policyError(403, 'Assigned supervisor or agency administrator access required');
  return { agencyId, providerUserId, policy, canManage: assigned || admin, canAttest: assigned };
}
export async function getSupervisionDocumentationPolicy(req, res, next) {
  try { const s = await scope(req); res.json({ policy: s.policy, canManage: s.canManage, canAttest: s.canAttest, noteTypes: NONBILLABLE_TYPES }); } catch(e) { next(e); }
}
export async function saveSupervisionDocumentationPolicy(req, res, next) {
  try {
    const s = await scope(req, { write: true });
    if (!s.policy.supervisorUserId) throw policyError(409, 'Assign a clinical or billing supervisor first');
    const reason = String(req.body.reason || '').trim();
    if (!reason || reason.length > 1000) throw policyError(400, 'A policy change reason is required');
    const policy = normalizeSupervisionPolicy(req.body.policy || {});
    // Serialize policy changes against user membership so stale settings cannot overwrite a newer version.
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      await db.execute('SELECT user_id FROM user_agencies WHERE agency_id = ? AND user_id = ? FOR UPDATE', [s.agencyId, s.providerUserId]);
      const [[last]] = await db.execute('SELECT id FROM clinical_supervision_policies WHERE agency_id = ? AND provider_user_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE', [s.agencyId,s.providerUserId]);
      if (Number(req.body.version || 0) !== Number(last?.id || 0)) throw policyError(409, 'Supervision policy changed. Reload before saving.');
      await db.execute('INSERT INTO clinical_supervision_policies (agency_id, provider_user_id, supervisor_user_id, policy_json, changed_by_user_id, reason) VALUES (?, ?, ?, ?, ?, ?)', [s.agencyId,s.providerUserId,s.policy.supervisorUserId,JSON.stringify(policy),req.user.id,reason]);
      await db.commit();
    } catch(e) { await db.rollback(); throw e; } finally { db.release(); }
    res.json({ ok: true });
  } catch(e) { next(e); }
}
async function billingScope(req) {
  const agencyId = Number(req.body?.agencyId || req.query?.agencyId);
  if (!Number.isSafeInteger(agencyId) || agencyId < 1) throw policyError(400,'Agency is required');
  if (!await hasSchedulingBillingAccess(req.user,agencyId)) throw policyError(403,'Billing access required');
  return agencyId;
}
export async function listSupervisedPayerPolicies(req,res,next) {
  try {
    const agencyId = await billingScope(req);
    const [rows] = await pool.execute(`SELECT p.* FROM billing_payer_policy_versions p
      WHERE agency_id = ? AND NOT EXISTS (SELECT 1 FROM billing_payer_policy_versions newer WHERE newer.agency_id = p.agency_id AND newer.payer_id = p.payer_id AND newer.plan_type = p.plan_type AND newer.id > p.id)
      ORDER BY payer_id, plan_type`,[agencyId]);
    res.json({ items: rows.map(r => ({ ...parseObject(r.policy_json), version:r.id, updatedAt:r.created_at })) });
  } catch(e) { next(e); }
}
export async function supervisedProviderReadiness(req,res,next) {
  try {
    const agencyId=await billingScope(req);
    const [rows]=await pool.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.npi FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=? AND (u.role IN ('provider','provider_plus','supervisor') OR u.npi IS NOT NULL) ORDER BY u.last_name,u.first_name`,[agencyId]);
    res.json({providers:rows.map(u=>({id:u.id,name:[u.first_name,u.last_name].filter(Boolean).join(' '),npi:u.npi||null,npiValid:validNpi(u.npi)}))});
  }catch(e){next(e);}
}
export async function saveSupervisedPayerPolicy(req,res,next) {
  let db;
  try {
    const agencyId = await billingScope(req), policy = normalizePayerPolicy(req.body.policy || {}), reason=String(req.body.reason || '').trim();
    if (!reason || reason.length > 1000) throw policyError(400,'A policy change reason is required');
    db = await pool.getConnection(); await db.beginTransaction();
    await db.execute('SELECT id FROM agencies WHERE id = ? FOR UPDATE',[agencyId]);
    const [[last]] = await db.execute('SELECT id FROM billing_payer_policy_versions WHERE agency_id = ? AND payer_id = ? AND plan_type = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',[agencyId,policy.payerId,policy.planType]);
    if (Number(req.body.version || 0) !== Number(last?.id || 0)) throw policyError(409,'Payer policy changed. Reload before saving.');
    await db.execute('INSERT INTO billing_payer_policy_versions (agency_id,payer_id,plan_type,policy_json,changed_by_user_id,reason) VALUES (?,?,?,?,?,?)',[agencyId,policy.payerId,policy.planType,JSON.stringify(policy),req.user.id,reason]);
    await db.commit();res.json({ok:true});
  } catch(e) { if(db) await db.rollback();next(e); } finally {db?.release();}
}
export async function listDocumentationReviewTime(req,res,next) {
  try { const s=await scope(req); const [items]=await pool.execute('SELECT * FROM supervision_review_time WHERE agency_id = ? AND supervisee_user_id = ? ORDER BY start_at DESC LIMIT 200',[s.agencyId,s.providerUserId]); res.json({items}); } catch(e) {next(e);}
}
export async function saveDocumentationReviewTime(req,res,next) {
  try {
    const s=await scope(req,{supervisorOnly:true}), interval=reviewInterval(req.body), requestId=String(req.body.requestId || '');
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(requestId) || !['documentation_review','rendering_provider_oversight'].includes(req.body.activityType)) throw policyError(400,'Activity and request ID are required');
    const refs=req.body.documents || [];
    if (!Array.isArray(refs) || refs.length>100 || refs.some(r=>!['note','treatment_plan'].includes(r.type) || !Number.isSafeInteger(r.id) || r.id<1)) throw policyError(400,'Invalid document references');
    for (const ref of refs) await loadReviewDocument(s,ref.type,ref.id);
    const item = await withSupervisorTimeLock([req.user.id],async db=>{
      const [[existing]]=await db.execute('SELECT * FROM supervision_review_time WHERE supervisor_user_id = ? AND request_id = ?',[req.user.id,requestId]);
      if(existing) {
        if (Number(existing.agency_id)!==s.agencyId || Number(existing.supervisee_user_id)!==s.providerUserId || mysqlTime(existing.start_at)!==interval.startAt || mysqlTime(existing.end_at)!==interval.endAt || existing.activity_type!==req.body.activityType || existing.timezone!==req.body.timezone || (req.body.attested===true && existing.status==='planned') || JSON.stringify(parseObject(existing.document_refs_json))!==JSON.stringify(refs)) throw policyError(409,'Request ID already used');
        return existing;
      }
      await assertNoReviewTimeOverlap(db,[req.user.id],interval.startAt,interval.endAt);
      await assertNoMeetingOverlap(db,req.user.id,interval.startAt,interval.endAt);
      const [result]=await db.execute(`INSERT INTO supervision_review_time (agency_id,supervisor_user_id,supervisee_user_id,start_at,end_at,timezone,status,activity_type,document_refs_json,attested_at,request_id)
        VALUES (?,?,?,?,?,?,?,?,?,IF(? = 1, UTC_TIMESTAMP(), NULL),?)`,[s.agencyId,req.user.id,s.providerUserId,interval.startAt,interval.endAt,req.body.timezone,req.body.attested===true?'attested':'planned',req.body.activityType,JSON.stringify(refs),req.body.attested===true?1:0,requestId]);
      return {id:result.insertId};
    }); res.status(201).json({item});
  } catch(e) {next(e);}
}
export async function changeDocumentationReviewTime(req,res,next) {
  try {
    const s=await scope(req,{supervisorOnly:true}), id=Number(req.params.timeId);
    await withSupervisorTimeLock([req.user.id],async db=>{
      const [[item]]=await db.execute('SELECT * FROM supervision_review_time WHERE id = ? AND agency_id = ? AND supervisee_user_id = ? AND supervisor_user_id = ?',[id,s.agencyId,s.providerUserId,req.user.id]);
      if(!item) throw policyError(404,'Review time not found');
      if(req.body.action==='void') {
        const reason=String(req.body.reason || '').trim();if(!reason || reason.length>1000)throw policyError(400,'A void reason is required');
        await db.execute("UPDATE supervision_review_time SET status = 'void', voided_at = UTC_TIMESTAMP(), void_reason = ? WHERE id = ? AND status <> 'void'",[reason,id]);
      } else if(req.body.action==='attest' && req.body.attested===true && item.status==='planned') {
        const end = item.end_at instanceof Date ? item.end_at : new Date(`${String(item.end_at).replace(' ','T')}Z`);
        if(end>new Date())throw policyError(400,'Cannot attest future work');
        await assertNoReviewTimeOverlap(db,[req.user.id],item.start_at,item.end_at,id);
        await assertNoMeetingOverlap(db,req.user.id,item.start_at,item.end_at);
        await db.execute("UPDATE supervision_review_time SET status = 'attested', attested_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'planned'",[id]);
      } else throw policyError(409,'This entry cannot be attested. Correct it by voiding and recording a replacement.');
    });res.json({ok:true});
  } catch(e){next(e);}
}
export async function getSuperviseeReviewDocument(req,res,next) {
  try { const s=await scope(req);if(!['note','treatment_plan'].includes(req.params.type))throw policyError(400,'Invalid document type'); const d=await loadReviewDocument(s,req.params.type,Number(req.params.documentId));const signedHash=parseObject(d.row.metadata_json).supervisorCosign?.contentHash; const cosignCurrent=d.row.supervisor_cosigned_at && (signedHash ? signedHash===d.hash : !d.row.latest_addendum_at || new Date(d.row.latest_addendum_at)<new Date(d.row.supervisor_cosigned_at));res.json({content:d.content,contentHash:d.hash,cosignedAt:cosignCurrent?d.row.supervisor_cosigned_at:null}); }catch(e){next(e);}
}
export async function listSuperviseeDocumentReviews(req,res,next) {
  try {
    const s=await scope(req), [notes]=await clinicalPool.execute(`SELECT id,client_id,note_type,title,provider_signed_at,supervisor_cosigned_at,metadata_json,created_at FROM clinical_notes WHERE agency_id = ? AND created_by_user_id = ? AND is_deleted = 0 AND provider_signed_at IS NOT NULL ORDER BY id DESC LIMIT 100`,[s.agencyId,s.providerUserId]);
    const [plans]=await clinicalPool.execute(`SELECT id,client_id,title,status,created_at FROM clinical_treatment_plans WHERE agency_id = ? AND created_by_user_id = ? AND status IN ('active','final') ORDER BY id DESC LIMIT 100`,[s.agencyId,s.providerUserId]);
    const [reviews]=await pool.execute('SELECT id,document_type,document_id,outcome,created_at,content_hash,feedback_encrypted FROM clinical_document_reviews WHERE agency_id = ? AND provider_user_id = ? ORDER BY id DESC LIMIT 300',[s.agencyId,s.providerUserId]);
    const wants=type=>s.policy.nonBillableReview==='all'||(s.policy.nonBillableReview==='selected'&&s.policy.noteTypes.includes(type));
    const documents=[...notes.map(n=>({id:n.id,nonBillable:isNonBillableDocument(n),clientId:n.client_id,createdAt:n.created_at,type:'note',noteType:normalizeNoteType(n.note_type),title:n.title,signedAt:n.provider_signed_at,cosignedAt:n.supervisor_cosigned_at,cosignDueAt:n.provider_signed_at ? new Date(new Date(n.provider_signed_at).getTime()+Number(parseObject(n.metadata_json).supervisionPolicyAtSignature?.cosignDueDays || s.policy.cosignDueDays)*86400000).toISOString():null})),...plans.map(p=>({id:p.id,nonBillable:true,clientId:p.client_id,createdAt:p.created_at,type:'treatment_plan',noteType:'TREATMENT_PLAN',title:p.title}))]
      .map(d=>({...d,reviewRequested:!d.nonBillable||wants(d.noteType),latestReview:reviews.find(r=>r.document_type===d.type&&Number(r.document_id)===Number(d.id))||null}));
    const cache=new Map();
    for(const d of documents) {
      const key=`${d.clientId}:${String(d.createdAt).slice(0,10)}`;
      if(!cache.has(key))cache.set(key,await requiredDocumentReviewTypes(s.agencyId,d.clientId,d.createdAt));
      d.mandatoryReview=cache.get(key).includes(d.noteType);
      d.reviewRequested ||= d.mandatoryReview;
      if(d.latestReview) {
        const current=await loadReviewDocument(s,d.type,d.id);
        if(d.type==='note' && ((parseObject(current.row.metadata_json).supervisorCosign?.contentHash && parseObject(current.row.metadata_json).supervisorCosign.contentHash!==current.hash) || (current.row.latest_addendum_at && new Date(current.row.latest_addendum_at)>new Date(d.cosignedAt || 0)))) d.cosignedAt=null;
        d.latestReview={id:d.latestReview.id,outcome:d.latestReview.outcome,created_at:d.latestReview.created_at,stale:d.latestReview.content_hash!==current.hash,
          feedback:decryptFamilyBilling(d.latestReview.feedback_encrypted,`document-review:${s.agencyId}:${d.type}:${d.id}`)?.feedback || ''};
      }
    }
    res.json({documents});
  }catch(e){next(e);}
}
export async function recordSuperviseeDocumentReview(req,res,next) {
  try {
    const s=await scope(req,{supervisorOnly:true}), type=req.body.documentType,id=Number(req.body.documentId);
    if(!['note','treatment_plan'].includes(type)||!['approved','changes_requested'].includes(req.body.outcome)||req.body.attested!==true)throw policyError(400,'Document, outcome and review attestation are required');
    const {hash}=await loadReviewDocument(s,type,id), feedback=String(req.body.feedback || '').trim();
    if(req.body.contentHash!==hash)throw policyError(409,'Document changed or was not opened. Read the latest version before attesting.');
    if(feedback.length>4000 || (req.body.outcome==='changes_requested'&&!feedback))throw policyError(400,'Describe the requested changes (up to 4000 characters)');
    await pool.execute('INSERT INTO clinical_document_reviews (agency_id,provider_user_id,supervisor_user_id,document_type,document_id,content_hash,outcome,feedback_encrypted) VALUES (?,?,?,?,?,?,?,?)',[s.agencyId,s.providerUserId,req.user.id,type,id,hash,req.body.outcome,encryptFamilyBilling({feedback},`document-review:${s.agencyId}:${type}:${id}`)]);
    if(type==='note' && req.body.outcome==='changes_requested') {
      const [claims]=await clinicalPool.execute("SELECT id,claimmd_connection_id FROM clinical_claims WHERE agency_id = ? AND clinical_note_id = ? AND is_deleted = 0 AND claim_lifecycle NOT IN ('draft','ready','rejected')",[s.agencyId,id]);
      for(const claim of claims)await recordClaimEvent({agencyId:s.agencyId,claimId:claim.id,connectionId:claim.claimmd_connection_id||`agency:${s.agencyId}`,eventKey:`documentation-changes:${id}:${hash}:${Date.now()}`,eventType:'documentation_followup',actorUserId:req.user.id,payload:{message:'Supervisor requested a documentation amendment after submission. Review whether a corrected claim or payer follow-up is required.',documentId:id}});
    }
    res.json({ok:true});
  }catch(e){next(e);}
}
