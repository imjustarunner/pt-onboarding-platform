import { requireStaffPlanActor } from '../utils/planStaffAccess.js';
import { getMedicalBillingFlags } from '../services/medicalBillingFlags.service.js';
import clinicalPool from '../config/clinicalDatabase.js';
import pool from '../config/database.js';
import ClinicalNote from '../models/clinical/ClinicalNote.model.js';
import User from '../models/User.model.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { resolveNoteDocumentationPolicy, parseObject, policyError } from '../services/supervisedBillingPolicy.service.js';
import { appendReviewRequest, acknowledgeReviewRequest, reviewRequestsForDisplay, lockedNoteMutation, noteAuthorId } from '../services/clinicalSupervisorReview.service.js';
import { ensureOriginalRevision, getRevisionSummary, listPendingRevisionWork } from '../services/clinicalNoteVersion.service.js';

async function ensureLockedHistory(db, note) {
  const [[session]] = await db.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=?', [note.clinical_session_id,note.agency_id]);
  await ensureOriginalRevision({db,note,session:session || {}});
  return (await getRevisionSummary({noteId:note.id,agencyId:note.agency_id},db)).effectiveRevision;
}
async function reviewAudit(db, note, revision, request, actorUserId, eventType) {
  await db.execute(`INSERT INTO clinical_note_revision_audit(clinical_note_id,agency_id,revision_id,event_type,actor_user_id,content_hash,event_json)
    VALUES(?,?,?,?,?,?,?)`, [note.id,note.agency_id,request.revisionId || revision.id,eventType,actorUserId,request.revisionContentHash || revision.contentHash,JSON.stringify({requestId:request.id,action:request.action})]);
}

async function noteScope(req, supervisor = false) {
  const note = await ClinicalNote.findById(Number(req.params.noteId));
  if (!note || note.is_deleted) throw policyError(404,'Note not found.');
  const requested = Number(req.body?.agencyId || req.query?.agencyId || req.medicalBillingAgencyId);
  if (requested !== Number(note.agency_id)) throw policyError(404,'Note not found in this agency.');
  await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId:note.agency_id});
  if (supervisor) {
    const policy = await resolveNoteDocumentationPolicy(note);
    if (Number(policy.supervisorUserId) !== Number(req.user.id) || Number(req.user.id) === noteAuthorId(note)) throw policyError(403,'Only the assigned responsible supervisor can review this note.');
  }
  return note;
}
export async function postSupervisorReview(req,res,next) {
  try {
    const note = await noteScope(req,true);
    const request = await lockedNoteMutation({noteId:note.id,agencyId:note.agency_id,contentHash:req.body.contentHash || '',snapshotToken:req.body.reviewSnapshotToken,mutate:async({db,note:locked,meta,current})=>{
      const revision = await ensureLockedHistory(db,locked);
      const r = appendReviewRequest(meta,{action:req.body.action,message:req.body.message,actorUserId:req.user.id,contentHash:current.hash});
      r.revisionId=revision.id; r.revisionContentHash=revision.contentHash;
      await reviewAudit(db,locked,revision,r,req.user.id,'review_requested');
      return r;
    }});
    res.status(201).json({ok:true,reviewRequest:reviewRequestsForDisplay({reviewRequests:[request]})[0]});
  } catch(e) { next(e); }
}
export async function acknowledgeNoteReview(req,res,next) {
  try {
    const note = await noteScope(req);
    const request = await lockedNoteMutation({noteId:note.id,agencyId:note.agency_id,mutate:async({db,meta,note:current})=>{
      const revision = await ensureLockedHistory(db,current);
      if ((meta.reviewRequests || []).some(r=>r.id===req.params.requestId && r.source==='clinical_revision')) throw policyError(409,'Open the exact amended version and acknowledge it from Amendments and versions.');
      const result=acknowledgeReviewRequest(meta,req.params.requestId,req.user.id,noteAuthorId(current));
      await reviewAudit(db,current,revision,result,req.user.id,'review_acknowledged');
      return result;
    }});
    res.json({ok:true,reviewRequest:reviewRequestsForDisplay({reviewRequests:[request]})[0]});
  } catch(e) { next(e); }
}
export async function listMyNoteReviewWork(req,res,next) {
  try {
    requireStaffPlanActor(req.user);
    const requestedAgencyId = req.query.agencyId == null ? null : Number(req.query.agencyId);
    if (requestedAgencyId !== null && (!Number.isSafeInteger(requestedAgencyId) || requestedAgencyId < 1)) throw policyError(400,'Provide a valid agencyId.');
    const [candidates] = await clinicalPool.execute(`SELECT id,agency_id,client_id,title,metadata_json FROM clinical_notes WHERE COALESCE(provider_signed_by_user_id,created_by_user_id)=? AND is_deleted=0 AND JSON_LENGTH(JSON_EXTRACT(metadata_json,'$.reviewRequests'))>0 ${requestedAgencyId ? 'AND agency_id=?' : ''} ORDER BY updated_at DESC LIMIT 1000`,[req.user.id,...(requestedAgencyId ? [requestedAgencyId] : [])]);
    const permitted = new Set();
    const memberships=await User.getAgencies(req.user.id);
    const activeAgencyIds=(memberships || []).filter(a=>a.is_active!==0 && !a.is_archived && (!requestedAgencyId || Number(a.id)===requestedAgencyId) && (!req.auricwellPreview || Number(a.id)===Number(req.auricwellPreview.agencyId))).map(a=>Number(a.id));
    for (const agencyId of new Set(activeAgencyIds)) {
      try {
        await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
        const [[agency]] = await pool.execute('SELECT feature_flags FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[agencyId]);
        if (agency && getMedicalBillingFlags(agency).clinicalChartEnabled) permitted.add(agencyId);
      } catch(e) { if (![403,404].includes(e.status)) throw e; }
    }
    const notes = candidates.filter(n=>permitted.has(Number(n.agency_id)));
    const authorWork=(await listPendingRevisionWork({agencyIds:[...permitted],actorUserId:req.user.id})).filter(item=>item.nextAction==='author_sign');
    const ids = [...new Set([...notes.map(n=>n.client_id),...authorWork.map(item=>item.clientId)].filter(Boolean))];
    const [clients] = ids.length ? await pool.execute(`SELECT id,agency_id,full_name,initials FROM clients WHERE id IN (${ids.map(()=>'?').join(',')})`,ids) : [[]];
    const items = notes.flatMap(note=>{
      const agencyId=Number(note.agency_id), meta=parseObject(note.metadata_json), client=clients.find(c=>Number(c.id)===Number(note.client_id));
      return reviewRequestsForDisplay(meta).filter(r=>!r.resolvedAt&&!r.acknowledgedAt&&!r.dismissedAt).map(r=>({id:`review_${note.id}_${r.id}`,requestId:r.id,clinicalNoteId:note.id,agencyId,clientId:note.client_id,clientName:client?.full_name || client?.initials || meta.clientName || '',title:note.title,date:meta.dateOfService || null,serviceCode:meta.serviceCode || null,status:r.action,action:r.action,message:r.message,createdByUserId:r.createdByUserId,createdAt:r.createdAt,acknowledgedAt:r.acknowledgedAt,source:r.source,revisionId:r.revisionId || null,revisionContentHash:r.revisionContentHash || r.contentHash || null}));
    });
    for (const item of authorWork) {
      const client=clients.find(c=>Number(c.id)===item.clientId && Number(c.agency_id)===item.agencyId);
      items.push({id:`revision_${item.clinicalNoteId}_${item.revisionId}`,requestId:null,clinicalNoteId:item.clinicalNoteId,agencyId:item.agencyId,clientId:item.clientId,clientName:client?.full_name || client?.initials || '',title:item.title,date:item.dateOfService,serviceCode:item.serviceCode,status:'changes_needed',action:'changes_needed',
        message:`Review and sign clinical version ${item.revisionNumber}, proposed by user #${item.proposedByUserId}. Reason: ${item.reason}`,createdByUserId:item.proposedByUserId,createdAt:item.createdAt,acknowledgedAt:null,source:'clinical_revision_proposal',revisionId:item.revisionId,revisionContentHash:item.contentHash,revisionAction:'author_sign'});
    }
    res.json({items,hasMore:candidates.length===1000});
  } catch(e) { next(e); }
}
export async function correctNoteServiceDetails(req,res,next) {
  try {
    await noteScope(req,true);
    throw policyError(409,'Open Amendments and versions to correct the encounter, then sign and submit the exact amended version. The original signed note and its approvals are preserved.');
  } catch(e) { next(e); }
}
