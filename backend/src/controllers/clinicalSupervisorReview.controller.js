import { requireStaffPlanActor } from '../utils/planStaffAccess.js';
import { getMedicalBillingFlags } from '../services/medicalBillingFlags.service.js';
import clinicalPool from '../config/clinicalDatabase.js';
import pool from '../config/database.js';
import ClinicalNote from '../models/clinical/ClinicalNote.model.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { resolveNoteDocumentationPolicy, parseObject, policyError, isNonBillableDocument } from '../services/supervisedBillingPolicy.service.js';
import { maybeEncryptNotePayload } from '../services/clinicalNoteCrypto.service.js';
import { appendReviewRequest, acknowledgeReviewRequest, normalizeServiceDetails, effectiveServiceDetails, reviewRequestsForDisplay, lockedNoteMutation, noteAuthorId, serviceDetailTimes, verifiedServiceLocation, serviceLocationSnapshot, markSupervisorQueue, synchronizeSupervisorQueue } from '../services/clinicalSupervisorReview.service.js';

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
    const request = await lockedNoteMutation({noteId:note.id,agencyId:note.agency_id,contentHash:req.body.contentHash || '',snapshotToken:req.body.reviewSnapshotToken,mutate:async({db,meta,current})=>{
      const r = appendReviewRequest(meta,{action:req.body.action,message:req.body.message,actorUserId:req.user.id,contentHash:current.hash});
      if (r.action === 'changes_needed') {
        if (meta.supervisorCosign) { meta.supervisorCosignHistory=[...(meta.supervisorCosignHistory || []),meta.supervisorCosign]; delete meta.supervisorCosign; }
        markSupervisorQueue(meta,note,req.user.id,'awaiting_supervisor');
        await db.execute('UPDATE clinical_notes SET supervisor_cosigned_at=NULL,supervisor_cosigned_by_user_id=NULL WHERE id=? AND agency_id=?',[note.id,note.agency_id]);
      }
      return r;
    }});
    res.status(201).json({ok:true,reviewRequest:reviewRequestsForDisplay({reviewRequests:[request]})[0]});
  } catch(e) { next(e); }
}
export async function acknowledgeNoteReview(req,res,next) {
  try {
    const note = await noteScope(req);
    const request = await lockedNoteMutation({noteId:note.id,agencyId:note.agency_id,mutate:async({meta,note:current})=>acknowledgeReviewRequest(meta,req.params.requestId,req.user.id,noteAuthorId(current))});
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
    for (const agencyId of new Set(candidates.map(n=>Number(n.agency_id)))) {
      try {
        await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
        const [[agency]] = await pool.execute('SELECT feature_flags FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[agencyId]);
        if (agency && getMedicalBillingFlags(agency).clinicalChartEnabled) permitted.add(agencyId);
      } catch(e) { if (![403,404].includes(e.status)) throw e; }
    }
    const notes = candidates.filter(n=>permitted.has(Number(n.agency_id)));
    const ids = [...new Set(notes.map(n=>n.client_id).filter(Boolean))];
    const [clients] = ids.length ? await pool.execute(`SELECT id,agency_id,full_name,initials FROM clients WHERE id IN (${ids.map(()=>'?').join(',')})`,ids) : [[]];
    const items = notes.flatMap(note=>{
      const agencyId=Number(note.agency_id), meta=parseObject(note.metadata_json), client=clients.find(c=>Number(c.id)===Number(note.client_id));
      return reviewRequestsForDisplay(meta).filter(r=>!r.resolvedAt&&!r.acknowledgedAt&&!r.dismissedAt).map(r=>({id:`review_${note.id}_${r.id}`,requestId:r.id,clinicalNoteId:note.id,agencyId,clientId:note.client_id,clientName:client?.full_name || client?.initials || meta.clientName || '',title:note.title,date:meta.dateOfService || null,serviceCode:meta.serviceCode || null,status:r.action,action:r.action,message:r.message,createdByUserId:r.createdByUserId,createdAt:r.createdAt,acknowledgedAt:r.acknowledgedAt,source:r.source}));
    });
    res.json({items,hasMore:candidates.length===1000});
  } catch(e) { next(e); }
}
export async function correctNoteServiceDetails(req,res,next) {
  try {
    const note = await noteScope(req,true), serviceDetails = normalizeServiceDetails(req.body.serviceDetails), reason=String(req.body.reason || '').trim();
    if (req.body.attested !== true || !reason || reason.length>2000) throw policyError(400,'Sign the service correction and enter a reason of 1–2,000 characters.');
    serviceDetails.locationSnapshot = serviceLocationSnapshot(await verifiedServiceLocation(note.agency_id,serviceDetails));
    if (!note.clinical_session_id || isNonBillableDocument(note)) throw policyError(409,'Service details can be corrected only on a linked billable encounter.');
    const amendment = await lockedNoteMutation({noteId:note.id,agencyId:note.agency_id,contentHash:req.body.contentHash || '',snapshotToken:req.body.reviewSnapshotToken,lockEncounter:true,mutate:async({db,note:locked,meta,current})=>{
      const [[session]] = await db.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=?',[locked.clinical_session_id,locked.agency_id]);
      if (!session) throw policyError(409,'The linked encounter is unavailable.');
      const [claims] = await db.execute('SELECT * FROM clinical_claims WHERE clinical_session_id=? AND agency_id=? AND is_deleted=0',[locked.clinical_session_id,locked.agency_id]);
      for(const c of claims) {
        const [[attempt]]=await db.execute("SELECT id FROM claimmd_claim_events WHERE agency_id=? AND clinical_claim_id=? AND event_type='approved_submission' LIMIT 1",[locked.agency_id,c.id]);
        if(attempt||c.claimmd_submitted_at||c.claimmd_claim_id||c.claimmd_connection_id||!['draft','ready'].includes(c.claim_lifecycle)) throw policyError(409,'Billing must reconcile previously transmitted claims before correcting service details.');
      }
      const dateOfService=String(meta.dateOfService || parseObject(session.metadata_json).serviceDate || '').slice(0,10), timeZone=session.source_timezone || 'America/Denver';
      serviceDetailTimes(serviceDetails,dateOfService,timeZone);
      const before=effectiveServiceDetails(locked,session), createdAt=new Date().toISOString();
      const describe = d => `Duration: ${d.durationMinutes ?? 'Not recorded'} minutes; location: ${d.locationLabel || 'Not recorded'}; start: ${d.startTime || 'Not recorded'}; end: ${d.endTime || 'Not recorded'}; place of service: ${d.placeOfService || 'Not recorded'}; service location #${d.serviceLocationId || 'Not recorded'}${d.locationSnapshot ? `; verified address: ${[d.locationSnapshot.streetAddress,d.locationSnapshot.city,d.locationSnapshot.state,d.locationSnapshot.postalCode].filter(Boolean).join(', ') || 'Not recorded'}; billing office #${d.locationSnapshot.billingOfficeLocationId || 'Not selected'}` : ''}`;
      const body=`Supervisor service-detail correction\nDate of service: ${dateOfService}; timezone: ${timeZone}\nPrevious: ${describe(before)}\nCorrected: ${describe(serviceDetails)}\nReason: ${reason}\nElectronically attested by user #${req.user.id} at ${createdAt}. The original signed note is preserved. This correction requires supervisor approval before billing.`;
      const [added] = await db.execute('INSERT INTO clinical_note_addenda (clinical_note_id,agency_id,client_id,body,created_by_user_id,entry_kind,entry_reason,author_signed_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP(6))',[note.id,note.agency_id,note.client_id,maybeEncryptNotePayload(body),req.user.id,'correction',reason]);
      const entry={id:added.insertId,before,serviceDetails,dateOfService,timeZone,reason,createdByUserId:req.user.id,createdAt,authorSignedAt:createdAt,approvedAt:null};
      meta.serviceDetailAmendments=[...(meta.serviceDetailAmendments || []),entry];
      markSupervisorQueue(meta,locked,req.user.id,'awaiting_supervisor');
      appendReviewRequest(meta,{action:'review_acknowledge',message:`Your supervisor corrected service details on this note. ${reason}\n${JSON.stringify(serviceDetails)}`,actorUserId:req.user.id,contentHash:current.hash,source:'service_correction',amendmentId:added.insertId});
      if(meta.supervisorCosign){meta.supervisorCosignHistory=[...(meta.supervisorCosignHistory || []),meta.supervisorCosign];delete meta.supervisorCosign;}
      await db.execute('UPDATE clinical_notes SET supervisor_cosigned_at=NULL,supervisor_cosigned_by_user_id=NULL WHERE id=? AND agency_id=?',[note.id,note.agency_id]);
      return entry;
    }});
    const saved = await ClinicalNote.findById(note.id);
    const queueSynchronized = await synchronizeSupervisorQueue(saved,parseObject(saved.metadata_json).supervisorQueue);
    res.status(201).json({ok:true,amendment,requiresCosign:true,queueSynchronizationPending:!queueSynchronized,claimTransmitted:false});
  } catch(e) { next(e); }
}
