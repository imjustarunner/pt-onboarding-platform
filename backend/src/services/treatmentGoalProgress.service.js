import clinicalPool from '../config/clinicalDatabase.js';
import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import { requireStaffCareEligibility } from './staffCareEligibility.service.js';
import { requireGuardianPlanAccess, isSharedPlanStatus } from './guardianPlanProgress.service.js';
import { logNoteAidChartEvent } from './noteAidChartAudit.service.js';
import { listClientServices } from './clientServiceEnrollment.service.js';
import { notificationTransportReceipt } from '../utils/notificationTransportReceipt.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const id = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const progressStates = new Set(['active', 'improved', 'achieved']);
const actorRoles = new Set(['provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'admin', 'super_admin']);
const email = (value) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(value || '').trim()) ? String(value).trim() : null;
const deliverySelect = `SELECT d.*, e.agency_id,e.client_id,e.treatment_plan_id,e.service_id,e.goal_id,e.actor_user_id,e.progress_status
  FROM clinical_treatment_goal_progress_deliveries d
  JOIN clinical_treatment_goal_progress_events e ON e.id=d.progress_event_id`;

export function treatmentGoalProgressEmail(status, url, locale = 'en') {
  if (!['improved', 'achieved'].includes(status)) throw fail('A progress notification requires improved or achieved status.');
  const spanish = String(locale).toLowerCase().startsWith('es');
  const text = spanish
    ? `Su profesional ha marcado una meta del tratamiento como ${status === 'achieved' ? 'alcanzada' : 'mejorada'}. Inicie sesión en su portal para ver las actualizaciones.\n\n${url}`
    : `Your provider marked a treatment goal as ${status}. Sign in to your portal to see the updates.\n\n${url}`;
  return { subject: spanish ? 'Hay novedades sobre su plan' : 'An update to your treatment plan', text, linkUrl: url,
    linkLabel: spanish ? 'Ver las actualizaciones' : 'View plan updates', locale: spanish ? 'es' : 'en' };
}

async function requirePlanProvider(user, goal) {
  if (!user?.id || !actorRoles.has(String(user.role || '').toLowerCase())) throw fail('A clinical provider must update goal progress.', 403);
  await requireStaffCareEligibility(user.id, goal.agency_id);
  if (Number(goal.created_by_user_id) === Number(user.id)) return;
  const supervisor = await SupervisorAssignment.findBySuperviseeAndType(goal.created_by_user_id, goal.agency_id, 'clinical');
  if (Number(supervisor?.supervisor_id) !== Number(user.id)) throw fail('Only the plan provider or their assigned clinical supervisor can update this goal.', 403);
}

async function eligibleRecipients(context) {
  const recipients = [];
  for (const guardian of await ClientGuardian.listForClient(context.clientId)) {
    if (Number(guardian.access_enabled) !== 1 || !id(guardian.guardian_user_id)) continue;
    try {
      await requireGuardianPlanAccess({ ...context, userId: guardian.guardian_user_id });
      recipients.push(Number(guardian.guardian_user_id));
    } catch (error) { if (error.status !== 403) throw error; }
  }
  return [...new Set(recipients)];
}

async function goalServiceContext(goal, requestedServiceId = null) {
  const services = (await listClientServices(goal.client_id, goal.agency_id)).filter((service) => service.is_active && service.service_kind === 'counseling');
  const matches = services.filter((service) => Number(service.provider_user_id) === Number(goal.created_by_user_id));
  const selected = requestedServiceId ? services.find((service) => Number(service.id) === Number(requestedServiceId))
    : matches.length === 1 ? matches[0] : services.length === 1 && !services[0].provider_user_id ? services[0] : null;
  if (requestedServiceId && (!selected || (selected.provider_user_id && Number(selected.provider_user_id) !== Number(goal.created_by_user_id)))) throw fail('The counseling service no longer matches this plan provider.', 409);
  if (!selected && services.length) throw fail('Choose the counseling service for this plan before notifying the family.', 409);
  return selected ? Number(selected.id) : null;
}

async function currentRecipient(job) {
  const context = { agencyId: job.agency_id, clientId: job.client_id, userId: job.recipient_user_id, serviceId: job.service_id || null };
  await requireGuardianPlanAccess(context);
  const user = await User.findById(job.recipient_user_id);
  if (!user || Number(user.is_active) !== 1 || !['ACTIVE', 'ACTIVE_EMPLOYEE'].includes(String(user.status || '').toUpperCase())) throw fail('Recipient account is inactive.', 403);
  const to = email(user.email);
  if (!to) throw fail('Recipient email is unavailable.', 403);
  const [[goal]] = await clinicalPool.execute(`SELECT g.status,p.status AS plan_status,p.agency_id,p.client_id,p.created_by_user_id
    FROM clinical_treatment_plan_goals g JOIN clinical_treatment_plans p ON p.id=g.treatment_plan_id
    WHERE g.id=? AND p.id=? AND p.agency_id=? AND p.client_id=? LIMIT 1`, [job.goal_id, job.treatment_plan_id, job.agency_id, job.client_id]);
  if (!goal || !isSharedPlanStatus(goal.plan_status) || goal.status !== job.progress_status) throw fail('Progress update is no longer current.', 403);
  try { await goalServiceContext(goal, job.service_id || null); }
  catch (error) { if (error.status !== 409) throw error; throw fail('The plan service changed. Review family access before notifying.', 403); }
  return { user, to };
}

export async function sendProgressEmail(job, recipient) {
  const { clientEmailContext, sendClientPortalEmail } = await import('./clientPortalEmail.service.js');
  const context = await clientEmailContext({ agencyId: job.agency_id, clientId: job.client_id });
  const url = context.url(`guardian?panel=plan&clientId=${Number(job.client_id)}${job.service_id ? `&serviceId=${Number(job.service_id)}` : ''}`);
  return sendClientPortalEmail({ agencyId: job.agency_id, clientId: job.client_id, context,
    userId: job.recipient_user_id, to: recipient.to, source: 'auto', templateType: 'treatment_goal_progress',
    generatedByUserId: job.actor_user_id,
    ...treatmentGoalProgressEmail(job.progress_status, url, recipient.user.preferred_language || recipient.user.language) });
}

async function createProgressNotification(job) {
  const [existing] = await pool.execute(`SELECT id FROM notifications WHERE type='treatment_goal_progress'
    AND user_id=? AND agency_id=? AND related_entity_type='clinical_goal_progress_event' AND related_entity_id=? LIMIT 1`,
  [job.recipient_user_id, job.agency_id, job.progress_event_id]);
  if (existing.length) return existing[0];
  return Notification.create({ type: 'treatment_goal_progress', severity: 'info', title: 'Your treatment plan has a progress update',
    message: `Your provider marked a treatment goal as ${job.progress_status}. Open your portal to see the updates.`,
    userId: job.recipient_user_id, agencyId: job.agency_id, relatedEntityType: 'clinical_goal_progress_event',
    relatedEntityId: job.progress_event_id, actorUserId: job.actor_user_id, actorSource: 'provider_goal_progress', audienceJson: { clientId: job.client_id, serviceId: job.service_id || null } });
}

async function progressReceipt(job) {
  const [[receipt]] = await pool.execute(`SELECT delivery_status,external_message_id FROM user_communications
    WHERE id=? AND agency_id=? AND client_id=? AND user_id=? LIMIT 1`,
  [job.communication_id, job.agency_id, job.client_id, job.recipient_user_id]);
  return receipt || null;
}

export function createTreatmentGoalProgressService({ database = clinicalPool, requireProvider = requirePlanProvider,
  recipients = eligibleRecipients, authorizeRecipient = currentRecipient, notify = createProgressNotification,
  send = sendProgressEmail, audit = logNoteAidChartEvent, receipt = progressReceipt, serviceContext = goalServiceContext } = {}) {
  async function history(req, input) {
    if (!req.user?.id || !actorRoles.has(String(req.user.role || '').toLowerCase())) throw fail('A clinical provider must review goal progress.', 403);
    const agencyId = id(input.agencyId), clientId = id(input.clientId), planId = id(input.planId);
    if (!agencyId || !clientId || !planId) throw fail('Select an agency, client and plan.');
    const [[plan]] = await database.execute('SELECT id,agency_id,client_id,created_by_user_id FROM clinical_treatment_plans WHERE id=? AND agency_id=? AND client_id=? LIMIT 1', [planId, agencyId, clientId]);
    if (!plan) throw fail('Plan not found.', 404);
    await requireProvider(req.user, plan);
    const [rows] = await database.execute(`SELECT e.id,e.goal_id,e.progress_status,e.created_at,d.delivery_status,COUNT(d.id) AS recipient_count
      FROM clinical_treatment_goal_progress_events e LEFT JOIN clinical_treatment_goal_progress_deliveries d ON d.progress_event_id=e.id
      WHERE e.agency_id=? AND e.client_id=? AND e.treatment_plan_id=?
      GROUP BY e.id,e.goal_id,e.progress_status,e.created_at,d.delivery_status ORDER BY e.id DESC LIMIT 200`, [agencyId, clientId, planId]);
    const events = new Map();
    for (const row of rows) {
      if (!events.has(row.id)) events.set(row.id, { id: row.id, goalId: row.goal_id, status: row.progress_status, createdAt: row.created_at, delivery: {} });
      if (row.delivery_status) events.get(row.id).delivery[row.delivery_status] = Number(row.recipient_count);
    }
    await audit(req, { agencyId, clientId, action: 'clinical_treatment_goal_progress_viewed', metadata: { treatmentPlanId: planId } });
    return { events: [...events.values()] };
  }
  async function update(req, input) {
    if (!req.user?.id || !actorRoles.has(String(req.user.role || '').toLowerCase())) throw fail('A clinical provider must update goal progress.', 403);
    const agencyId = id(input.agencyId), clientId = id(input.clientId), planId = id(input.planId), goalId = id(input.goalId);
    if (!agencyId || !clientId || !planId || !goalId || !progressStates.has(input.status) || !String(input.expectedStatus || '')) throw fail('Choose a goal and its current and requested progress status.');
    // Authorization precedes the lock; repeat exact ownership checks under lock.
    const [[goal]] = await database.execute(`SELECT g.*,p.agency_id,p.client_id,p.created_by_user_id,p.status AS plan_status
      FROM clinical_treatment_plan_goals g JOIN clinical_treatment_plans p ON p.id=g.treatment_plan_id
      WHERE g.id=? AND p.id=? AND p.agency_id=? AND p.client_id=? LIMIT 1`, [goalId, planId, agencyId, clientId]);
    if (!goal) throw fail('Goal not found for this client and plan.', 404);
    await requireProvider(req.user, goal);
    if (!isSharedPlanStatus(goal.plan_status) || ['inactive', 'archived', 'superseded'].includes(goal.status) || goal.superseded_at) throw fail('Progress can be recorded only on a current shared plan goal.', 409);
    const serviceId = await serviceContext(goal, input.serviceId || null);
    const recipientIds = ['improved', 'achieved'].includes(input.status) ? await recipients({ agencyId, clientId, serviceId }) : [];
    const db = await database.getConnection();
    let eventId = null;
    try {
      await db.beginTransaction();
      const [[current]] = await db.execute(`SELECT g.status,g.superseded_at,p.status AS plan_status,p.created_by_user_id
        FROM clinical_treatment_plan_goals g JOIN clinical_treatment_plans p ON p.id=g.treatment_plan_id
        WHERE g.id=? AND p.id=? AND p.agency_id=? AND p.client_id=? FOR UPDATE`, [goalId, planId, agencyId, clientId]);
      if (!current || !isSharedPlanStatus(current.plan_status) || current.superseded_at || Number(current.created_by_user_id) !== Number(goal.created_by_user_id)) throw fail('The plan changed. Refresh before updating progress.', 409);
      if (current.status === input.status) { await db.rollback(); return { changed: false, status: current.status, notifications: { pending: 0 } }; }
      if (current.status !== input.expectedStatus) throw fail('The goal changed. Refresh before updating progress.', 409);
      await db.execute('UPDATE clinical_treatment_plan_goals SET status=? WHERE id=? AND treatment_plan_id=?', [input.status, goalId, planId]);
      const [event] = await db.execute(`INSERT INTO clinical_treatment_goal_progress_events
        (agency_id,client_id,treatment_plan_id,goal_id,actor_user_id,previous_status,progress_status,service_id) VALUES (?,?,?,?,?,?,?,?)`,
      [agencyId, clientId, planId, goalId, req.user.id, current.status, input.status, serviceId]);
      eventId = event.insertId;
      for (const userId of recipientIds) await db.execute(`INSERT INTO clinical_treatment_goal_progress_deliveries (progress_event_id,recipient_user_id) VALUES (?,?)`, [eventId, userId]);
      await db.commit();
    } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
    await audit(req, { agencyId, clientId, action: 'clinical_treatment_goal_progress_updated', metadata: { treatmentPlanId: planId, goalId, progressEventId: eventId, status: input.status } });
    // Keep the durable jobs pending when downstream channels are unavailable.
    let notifications;
    try { notifications = await dispatch({ eventId }); }
    catch { notifications = { pending: recipientIds.length, followUpRequired: true }; }
    return { changed: true, status: input.status, progressEventId: eventId, notifications };
  }

  async function deliver(deliveryId) {
    const db = await database.getConnection();
    const lock = `goal-progress-delivery:${deliveryId}`;
    let locked = false, sending = false;
    try {
      const [[acquired]] = await db.execute('SELECT GET_LOCK(?,0) AS acquired', [lock]);
      if (Number(acquired?.acquired) !== 1) return 'busy'; locked = true;
      const [[job]] = await db.execute(`${deliverySelect} WHERE d.id=?`, [deliveryId]);
      if (!job || job.delivery_status !== 'pending') return job?.delivery_status || 'skipped';
      let recipient;
      try { recipient = await authorizeRecipient(job); }
      catch (error) {
        if (error.status !== 403) throw error;
        await db.execute("UPDATE clinical_treatment_goal_progress_deliveries SET delivery_status='skipped',last_error='recipient_or_progress_no_longer_authorized' WHERE id=?", [deliveryId]); return 'skipped';
      }
      if (!job.notification_id) {
        const notification = await notify(job);
        await db.execute('UPDATE clinical_treatment_goal_progress_deliveries SET notification_id=? WHERE id=?', [notification.id, deliveryId]);
      }
      // Recheck after notification creation and immediately before entering transport.
      recipient = await authorizeRecipient(job);
      await db.execute("UPDATE clinical_treatment_goal_progress_deliveries SET delivery_status='sending',last_error=NULL WHERE id=?", [deliveryId]); sending = true;
      const result = await send(job, recipient);
      const status = notificationTransportReceipt(result, job.agency_id).accepted ? 'sent'
        : result?.queued && result.communicationId ? 'queued' : result?.skipped || result?.blocked ? 'skipped' : 'needs_review';
      await db.execute(`UPDATE clinical_treatment_goal_progress_deliveries SET delivery_status=?,communication_id=?,
        sent_at=CASE WHEN ?='sent' THEN NOW() ELSE NULL END,last_error=? WHERE id=?`,
      [status, result?.communicationId || null, status, ['sent', 'queued'].includes(status) ? null : 'email_not_confirmed', deliveryId]);
      return status;
    } catch (error) {
      // A transport exception may follow acceptance. Never retry it blindly.
      if (sending) await db.execute("UPDATE clinical_treatment_goal_progress_deliveries SET delivery_status='needs_review',last_error='transport_result_uncertain' WHERE id=?", [deliveryId]);
      return sending ? 'needs_review' : 'pending';
    } finally { try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lock]); } finally { db.release(); } }
  }

  async function dispatch({ eventId = null, limit = 50 } = {}) {
    const bounded = Math.max(1, Math.min(Number(limit) || 50, 100));
    const [queued] = await database.execute(`${deliverySelect} WHERE d.delivery_status IN ('queued','sending') AND d.communication_id IS NOT NULL ORDER BY d.id LIMIT ${bounded}`);
    for (const job of queued) {
      const evidence = await receipt(job);
      const state = evidence?.external_message_id ? 'sent'
        : ['failed', 'skipped'].includes(evidence?.delivery_status) ? 'needs_review' : null;
      if (state) await database.execute(`UPDATE clinical_treatment_goal_progress_deliveries SET delivery_status=?,
        sent_at=CASE WHEN ?='sent' THEN COALESCE(sent_at,NOW()) ELSE NULL END,last_error=? WHERE id=? AND delivery_status IN ('queued','sending')`,
      [state, state, state === 'sent' ? null : 'queued_email_requires_receipt_review', job.id]);
    }
    // An interrupted sending job is deliberately held for reconciliation, never resent.
    await database.execute("UPDATE clinical_treatment_goal_progress_deliveries SET delivery_status='needs_review',last_error='interrupted_send_requires_receipt_review' WHERE delivery_status='sending' AND updated_at < NOW() - INTERVAL 15 MINUTE");
    const [jobs] = await database.execute(`${deliverySelect} WHERE d.delivery_status='pending' ${eventId ? 'AND d.progress_event_id=?' : ''} ORDER BY d.id LIMIT ${bounded}`, eventId ? [eventId] : []);
    const summary = {};
    for (const job of jobs) { const status = await deliver(job.id); summary[status] = (summary[status] || 0) + 1; }
    return summary;
  }
  return { update, dispatch, deliver, history };
}

export const updateTreatmentGoalProgress = (req, input) => createTreatmentGoalProgressService().update(req, input);
export const runTreatmentGoalProgressNotifications = () => createTreatmentGoalProgressService().dispatch();
export const treatmentGoalProgressHistory = (req, input) => createTreatmentGoalProgressService().history(req, input);

// Admin approval may happen after the family relationship or goal state changed.
// The queued generic sender must not skip this last authorization check.
export async function assertQueuedTreatmentGoalProgressRecipient({ communicationId, agencyId, clientId, userId, to, claim = false }) {
  const [[job]] = await clinicalPool.execute(`${deliverySelect} WHERE d.communication_id=? AND e.agency_id=? AND e.client_id=? AND d.recipient_user_id=? LIMIT 1`, [communicationId, agencyId, clientId, userId]);
  if (!job || job.delivery_status !== 'queued') throw fail('This plan notification is not available for delivery.', 403);
  const recipient = await currentRecipient(job);
  if (recipient.to.toLowerCase() !== String(to || '').trim().toLowerCase()) throw fail('The plan notification recipient changed. Review the current portal relationship.', 403);
  const receipt = await progressReceipt(job);
  if (receipt?.external_message_id) throw fail('This plan notification was already accepted for delivery.', 409);
  if (claim) {
    const [claimed] = await clinicalPool.execute("UPDATE clinical_treatment_goal_progress_deliveries SET delivery_status='sending' WHERE id=? AND delivery_status='queued'", [job.id]);
    if (Number(claimed.affectedRows) !== 1) throw fail('Another delivery attempt is already in progress.', 409);
  }
}
