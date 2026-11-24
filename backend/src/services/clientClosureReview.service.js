import { createHash } from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import NoteAidWorkQueueItem from '../models/NoteAidWorkQueueItem.model.js';

export const canMarkClientInactive = role => ['admin','support','super_admin'].includes(String(role || '').toLowerCase());
export const isClosureStatus = status => ['inactive','archived','terminated','dead'].includes(String(status?.status_key || status?.statusKey || '').toLowerCase());
const fail = (message,status=400) => Object.assign(new Error(message),{status});

export async function clientClosureReview(client, { clinicalDatabase = clinicalPool } = {}) {
  // A former episode's termination note does not document a later course of care.
  const [[note]] = await clinicalDatabase.execute(`SELECT n.id,n.provider_signed_at,n.created_at FROM clinical_notes n
    WHERE n.agency_id=? AND n.client_id=? AND n.note_type='TERMINATION' AND n.is_deleted=0
      AND (n.provider_signed_at IS NOT NULL OR (n.content_review_source='provider_review'
        AND JSON_EXTRACT(n.content_review_json,'$.reviewedAt') IS NOT NULL AND CAST(JSON_UNQUOTE(JSON_EXTRACT(n.content_review_json,'$.reviewedByUserId')) AS UNSIGNED)=n.created_by_user_id))
      AND (? IS NULL OR n.created_at>=?)
      AND NOT EXISTS (SELECT 1 FROM clinical_notes later WHERE later.agency_id=n.agency_id AND later.client_id=n.client_id
        AND later.is_deleted=0 AND later.note_type<>'TERMINATION' AND later.provider_signed_at IS NOT NULL AND later.created_at>n.created_at)
    ORDER BY n.created_at DESC,n.id DESC LIMIT 1`,[client.agency_id,client.id,client.enrollment_reopened_at || null,client.enrollment_reopened_at || null]);
  const reviewToken=createHash('sha256').update(JSON.stringify([client.id,client.agency_id,client.client_status_id,client.status,client.updated_at,note?.id || null])).digest('hex');
  return { reviewToken, terminationNote:note ? {id:Number(note.id),completedAt:note.provider_signed_at || note.created_at} : null,
    providerId:Number(client.provider_id) || null };
}

export async function validateClientClosureReview(body,client,options) {
  if (body?.confirmClientClosure !== true) throw fail('Review this action and confirm that you want to make this client inactive.');
  if (!String(body?.termination_reason || '').trim()) throw fail('Enter a reason for ending active services.');
  const review=await clientClosureReview(client,options);
  if (body?.closureReviewToken !== review.reviewToken) throw fail('This client or their documentation changed. Reopen the confirmation and review the current details.',409);
  if (!review.terminationNote && typeof body.termination_note_required !== 'boolean') throw fail('Choose whether this client requires a termination note.');
  if (!review.terminationNote && body.termination_note_required === false && !String(body.termination_note_not_required_reason || '').trim()) throw fail('Explain why a termination note is not required.');
  return {
    termination_note_required: review.terminationNote ? true : body.termination_note_required,
    termination_note_not_required_reason: !review.terminationNote && body.termination_note_required === false ? String(body.termination_note_not_required_reason).trim().slice(0,2000) : null,
    terminationNote:review.terminationNote
  };
}

export async function queueClientClosureNote(db,{client,actorUserId,providerId,review}) {
  if (!review.termination_note_required || review.terminationNote) return;
  if (!providerId) throw fail('Choose the provider responsible for the termination note.');
  const [[provider]]=await db.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
    WHERE u.id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND (u.role IN ('provider','provider_plus','intern','intern_plus','clinical_practice_assistant') OR u.id=?
        OR EXISTS (SELECT 1 FROM client_provider_assignments a WHERE a.client_id=? AND a.provider_user_id=u.id))`,[client.agency_id,providerId,client.provider_id || null,client.id]);
  if (!provider) throw fail('Choose an active provider in this agency for the termination note.');
  await NoteAidWorkQueueItem.createIfMissingForUser(providerId,{
    id:`client_closure_${client.id}_${client.client_status_id}_${+new Date(client.updated_at || 0)}`,
    clientId:Number(client.id),agencyId:Number(client.agency_id),noteKind:'termination',
    action:'Write and review termination note',status:'not_started',date:new Date().toISOString().slice(0,10),
    requestedByUserId:actorUserId
  },{executor:db});
}
