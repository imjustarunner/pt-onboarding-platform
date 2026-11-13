import pool from '../config/database.js';
import { getContactPlanContext } from './schoolContactPlan.service.js';
import ClinicalNote from '../models/clinical/ClinicalNote.model.js';

// This error is raised by sender verification before the transport is invoked.
// Other failures, including missing/unknown transport receipts, are not retryable.
export const INITIAL_RETRY_DETAIL = 'provider_retry:EMAIL_SENDER_UNVERIFIED';
const failure = (message, status = 409) => Object.assign(new Error(message), { status });
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const time = value => value ? new Date(value).getTime() : 0;
const email = value => String(value || '').trim().toLowerCase();
const stopped = w => !!(w.initial_sent_at || w.parent_reply_at || w.provider_replied_at || w.external_reply_recorded_at
  || w.intake_arranged_at || w.second_contact_at || w.final_contact_at || w.provider_notified_at);
const unsafeReceipt = r => r.delivery_status !== 'failed' || r.external_message_id || r.sent_at || r.delivered_at;

async function initialReceipts(db,w) {
  const [receipts] = await db.execute(`SELECT id,delivery_status,external_message_id,sent_at,delivered_at
    FROM user_communications WHERE agency_id=? AND client_id=? AND generated_by_user_id=? AND channel='email'
      AND template_type='school_contact_plan' AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.internetMessageIdOverride'))=?`,
  [w.agency_id,w.client_id,w.provider_user_id,`<school-contact-${Number(w.id)}-initial_email@itsco.health>`]);
  return receipts;
}

export const initialRetryWorkflowSql = `SELECT w.*,p.status AS plan_status,p.decided_at AS current_plan_decided_at,
  EXISTS(SELECT 1 FROM client_provider_assignments a WHERE a.client_id=w.client_id AND a.organization_id=w.school_id
    AND a.provider_user_id=w.provider_user_id AND a.is_active=1) AS assignment_active,
  (c.status='ARCHIVED' OR LOWER(COALESCE(cs.status_key,'')) IN ('terminated','discharged','closed','dead','archived')
    OR LOWER(COALESCE(cs.label,'')) LIKE '%terminated%') AS client_terminal
  FROM school_contact_workflows w JOIN clients c ON c.id=w.client_id AND c.agency_id=w.agency_id
  LEFT JOIN client_statuses cs ON cs.id=c.client_status_id
  JOIN school_provider_contact_plans p ON p.agency_id=w.agency_id AND p.provider_user_id=w.provider_user_id
  WHERE w.id=? AND w.agency_id=? AND w.provider_user_id=?`;

function currentPlan(w) {
  return !!Number(w.assignment_active) && !Number(w.client_terminal) && w.plan_status === 'enabled'
    && time(w.plan_decided_at) === time(w.current_plan_decided_at);
}

async function currentGuardian(db, w) {
  const [[guardian]] = await db.execute(`SELECT u.id,COALESCE(NULLIF(u.personal_email,''),u.email) AS email
    FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE cg.client_id=? AND cg.relationship_type='guardian' AND cg.access_enabled=1
      AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL
    ORDER BY cg.created_at,u.id LIMIT 1`, [w.agency_id,w.client_id]);
  return guardian;
}

async function careOrReplyStopped(db, w, conversationId) {
  const [[facts]] = await db.execute(`SELECT
    EXISTS(SELECT 1 FROM client_intake_note_drafts WHERE agency_id=? AND client_id=? AND status='final' AND finalized_at IS NOT NULL) AS intake_completed,
    EXISTS(SELECT 1 FROM appointments ap JOIN appointment_participants pt ON pt.appointment_id=ap.id AND pt.client_id=?
      WHERE ap.agency_id=? AND ap.provider_user_id=? AND ap.business_type IN ('clinical','mental_health','healthcare')
        AND ap.service_code IN ('90791','H0031') AND ap.status IN ('scheduled','confirmed','client_confirmed') AND ap.end_at>=UTC_TIMESTAMP()) AS intake_scheduled,
    EXISTS(SELECT 1 FROM communication_messages WHERE conversation_id=? AND COALESCE(is_internal_note,0)=0 AND COALESCE(is_auto_reply,0)=0
      AND (direction='inbound' OR (direction='outbound' AND send_status IN ('sent','delivered')
        AND JSON_EXTRACT(from_json,'$.schoolContactAutomation') IS NULL))) AS conversation_replied`,
  [w.agency_id,w.client_id,w.client_id,w.agency_id,w.provider_user_id,conversationId]);
  return !!(Number(facts?.intake_completed) || Number(facts?.intake_scheduled) || Number(facts?.conversation_replied)
    || await ClinicalNote.hasSignedIntakeForClient({ agencyId:Number(w.agency_id),clientId:Number(w.client_id) }));
}

/** Read-only eligibility. A failed owned message binds the old attempt to one
 * client/school conversation. All transport records must be conclusively failed. */
export async function readSchoolContactInitialRetry(db, w) {
  const no = reason => ({ canRetryInitial:false,retryInitialQueued:false,reason });
  if (!w || stopped(w) || !currentPlan(w)) return no('Current assignment, plan and an unsent introduction are required.');
  const [[step]] = await db.execute("SELECT * FROM school_contact_workflow_steps WHERE workflow_id=? AND step_key='initial_email'", [w.id]);
  if (!step) return no('There is no failed introduction to retry.');
  if (w.status === 'queued' && ['pending','sending'].includes(step.status) && step.detail === INITIAL_RETRY_DETAIL) {
    return { canRetryInitial:false,retryInitialQueued:true,reason:null };
  }
  if (w.status !== 'needs_review' || w.last_error !== 'EMAIL_SENDER_UNVERIFIED' || step.status !== 'needs_review'
    || step.detail !== 'EMAIL_SENDER_UNVERIFIED' || step.completed_at || step.message_id) {
    return no('Review the existing delivery history; this outcome cannot be retried automatically.');
  }
  const [messages] = await db.execute(`SELECT m.id,m.conversation_id,m.send_status,m.sent_at,m.to_json,
      c.agency_id AS conversation_agency_id,c.owner_user_id,
      EXISTS(SELECT 1 FROM communication_links l WHERE l.conversation_id=c.id AND l.entity_type='client' AND l.entity_id=?) AS client_linked,
      EXISTS(SELECT 1 FROM communication_links l WHERE l.conversation_id=c.id AND l.entity_type='school' AND l.entity_id=?) AS school_linked
    FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id
    WHERE m.channel='email' AND m.direction='outbound' AND m.author_user_id=?
      AND JSON_UNQUOTE(JSON_EXTRACT(m.from_json,'$.schoolContactAutomation.workflowId'))=?
      AND JSON_UNQUOTE(JSON_EXTRACT(m.from_json,'$.schoolContactAutomation.stepKey'))='initial_email'
    ORDER BY m.id`, [w.client_id,w.school_id,w.provider_user_id,String(w.id)]);
  if (!messages.length || messages.some(m => m.send_status !== 'failed' || m.sent_at || Number(m.conversation_agency_id) !== Number(w.agency_id)
    || Number(m.owner_user_id) !== Number(w.provider_user_id) || !Number(m.client_linked) || !Number(m.school_linked))) {
    return no('The previous attempt needs delivery-history review.');
  }
  const conversationIds = [...new Set(messages.map(m => Number(m.conversation_id)))];
  if (conversationIds.length !== 1 || (w.conversation_id && Number(w.conversation_id) !== conversationIds[0])) return no('The previous conversation needs review.');
  const receipts = await initialReceipts(db,w);
  if (receipts.some(unsafeReceipt)) {
    return no('An accepted or uncertain delivery must be reconciled before another send.');
  }
  const guardian = await currentGuardian(db,w);
  const originalTo = parse(messages.at(-1).to_json);
  if (!guardian?.email || !Array.isArray(originalTo) || originalTo.length !== 1
    || email(typeof originalTo[0] === 'string' ? originalTo[0] : originalTo[0]?.email) !== email(guardian.email)) {
    return no('The current authorized recipient differs from the failed attempt; review the contact first.');
  }
  if (await careOrReplyStopped(db,w,conversationIds[0])) return no('A reply or intake has already stopped this introduction.');
  return { canRetryInitial:true,retryInitialQueued:false,reason:null,conversationId:conversationIds[0],messageId:Number(messages.at(-1).id),
    receiptIds:receipts.map(r => Number(r.id)),stepId:Number(step.id) };
}

/** Queue, never send, under the same exact-workflow lock used by the worker. */
export async function retrySchoolContactInitial({ agencyId,userId,workflowId }) {
  if (![agencyId,userId,workflowId].every(v => Number.isSafeInteger(Number(v)) && Number(v)>0)) throw failure('Choose a valid contact workflow.',400);
  const ctx = await getContactPlanContext({ agencyId,userId });
  const db = await pool.getConnection(); let locked = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,0) AS claimed',[`school-contact:${Number(workflowId)}`]);
    if (!Number(lock?.claimed)) throw failure('The introduction is being processed. Refresh its delivery status.');
    locked = true; await db.beginTransaction();
    const [[w]] = await db.execute(`${initialRetryWorkflowSql} FOR UPDATE`,[Number(workflowId),ctx.agencyId,ctx.userId]);
    if (!w || !ctx.schools.some(s => Number(s.id) === Number(w.school_id))) throw failure('Contact workflow not found.',404);
    const state = await readSchoolContactInitialRetry(db,w);
    if (state.retryInitialQueued) { await db.commit(); return { queued:true,alreadyQueued:true,workflowId:Number(w.id),status:'queued' }; }
    if (!state.canRetryInitial) throw failure(state.reason);
    const metadata = { workflowId:Number(w.id),clientId:Number(w.client_id),schoolId:Number(w.school_id),conversationId:state.conversationId,
      failedMessageId:state.messageId,failedReceiptIds:state.receiptIds,previousError:w.last_error,previousStepStatus:'needs_review' };
    await db.execute(`INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES('family_welcome_initial_retry_queued',?,?,?)`,
      [ctx.userId,ctx.agencyId,JSON.stringify(metadata)]);
    const [step] = await db.execute(`UPDATE school_contact_workflow_steps SET status='pending',detail=?,conversation_id=?
      WHERE id=? AND workflow_id=? AND status='needs_review' AND detail='EMAIL_SENDER_UNVERIFIED' AND completed_at IS NULL AND message_id IS NULL`,
    [INITIAL_RETRY_DETAIL,state.conversationId,state.stepId,w.id]);
    const [workflow] = await db.execute(`UPDATE school_contact_workflows SET status='queued',conversation_id=?,last_error=NULL
      WHERE id=? AND agency_id=? AND provider_user_id=? AND status='needs_review' AND last_error='EMAIL_SENDER_UNVERIFIED' AND initial_sent_at IS NULL`,
    [state.conversationId,w.id,ctx.agencyId,ctx.userId]);
    if (step.affectedRows !== 1 || workflow.affectedRows !== 1) throw failure('The introduction changed. Refresh its delivery status.');
    await db.commit();
    return { queued:true,alreadyQueued:false,workflowId:Number(w.id),status:'queued' };
  } catch (error) { try { await db.rollback(); } catch { /* preserve the original failure */ } throw error; }
  finally { if (locked) try { await db.execute('SELECT RELEASE_LOCK(?)',[`school-contact:${Number(workflowId)}`]); } catch { /* connection release also releases it */ } db.release(); }
}

/** A queued retry cannot rely on the request-time snapshot. Called again just
 * before transport, after preparation, without changing recipient or policy. */
export async function assertSchoolContactInitialRetryDelivery({ workflow,guardian }) {
  const ctx = await getContactPlanContext({ agencyId:workflow.agency_id,userId:workflow.provider_user_id });
  const [[fresh]] = await pool.execute(initialRetryWorkflowSql,[workflow.id,ctx.agencyId,ctx.userId]);
  const current = fresh && await currentGuardian(pool,fresh);
  const [[audit]] = await pool.execute(`SELECT metadata FROM user_activity_log WHERE action_type='family_welcome_initial_retry_queued'
    AND user_id=? AND agency_id=? AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.workflowId'))=? ORDER BY id DESC LIMIT 1`,
  [ctx.userId,ctx.agencyId,String(workflow.id)]);
  const queued = parse(audit?.metadata);
  const [[failedMessage]] = queued.failedMessageId ? await pool.execute(`SELECT to_json FROM communication_messages
    WHERE id=? AND conversation_id=? AND author_user_id=? AND direction='outbound' AND send_status='failed' AND sent_at IS NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(from_json,'$.schoolContactAutomation.workflowId'))=?
      AND JSON_UNQUOTE(JSON_EXTRACT(from_json,'$.schoolContactAutomation.stepKey'))='initial_email'`,
  [queued.failedMessageId,workflow.conversation_id,ctx.userId,String(workflow.id)]) : [[]];
  const originalTo = parse(failedMessage?.to_json);
  if (!fresh || !ctx.schools.some(s => Number(s.id) === Number(fresh.school_id)) || stopped(fresh) || !currentPlan(fresh)
    || !current || Number(current.id) !== Number(guardian.id) || email(current.email) !== email(guardian.email)
    || Number(queued.conversationId) !== Number(workflow.conversation_id) || !Array.isArray(originalTo) || originalTo.length !== 1
    || email(typeof originalTo[0] === 'string' ? originalTo[0] : originalTo[0]?.email) !== email(current.email)
    || (await initialReceipts(pool,fresh)).some(unsafeReceipt)
    || await careOrReplyStopped(pool,fresh,workflow.conversation_id)) {
    throw Object.assign(failure('The introduction recipient, access, reply or intake state changed before delivery.'),{code:'school_contact_retry_stopped'});
  }
}
