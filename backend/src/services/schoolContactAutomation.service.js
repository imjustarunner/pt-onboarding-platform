import pool from '../config/database.js';
import { getContactPlanContext, sendSchoolContactEmail, SCHOOL_CONTACT_DEMO_AGENCY_ID, SCHOOL_CONTACT_TEST_INBOX } from './schoolContactPlan.service.js';
import { resolveOutboundNumber } from './communicationRouting.service.js';
import { resolveRegisteredSmsSender } from './smsCompliance.service.js';
import VonageService from './vonage.service.js';
import MessageLog from '../models/MessageLog.model.js';
import Notification from '../models/Notification.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import { resolveMessagesSendMailbox } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const millis = value => value ? new Date(value).getTime() : 0;
const DAY = 86400000;
const HOUR = 3600000;
const safeError = e => String(e?.code || 'send_requires_review').slice(0, 200);
const smsPolicySkipped = error => /^sms_/.test(String(error?.code || '')) && error.code !== 'sms_receipt_missing';

// The fixture belongs to a particular demo client/staff account. A family phone
// cannot silently become another family's or a clinician's test destination.
export function schoolContactDemoSmsRecipient(flags, { clientId, providerUserId, phone }) {
  const key = clientId ? `client:${Number(clientId)}` : `provider:${Number(providerUserId)}`;
  const allowed = MessageLog.normalizePhone(parse(flags).schoolContactPlanDemoSmsRecipients?.[key]);
  const target = MessageLog.normalizePhone(phone);
  return allowed && target && allowed === target ? target : null;
}

export function nextSchoolContactStep(workflow, plan, now = new Date()) {
  if (plan?.status !== 'enabled' || !workflow.assignment_active || workflow.client_terminal || workflow.first_service_at) return 'cancel';
  if (workflow.plan_decided_at && plan.decided_at && millis(workflow.plan_decided_at) !== millis(plan.decided_at)) return 'cancel';
  if (workflow.external_reply_recorded_at || workflow.provider_replied_at) return 'complete';
  if (workflow.parent_reply_at) return !workflow.stale_notified_at && millis(now) >= millis(workflow.parent_reply_at) + Number(plan.stale_after_hours) * HOUR ? 'stale' : 'await_provider';
  if (!workflow.initial_sent_at) return 'initial_email';
  if (!workflow.sms_completed_at && millis(now) >= millis(workflow.initial_sent_at) + Number(plan.sms_after_days) * DAY) return 'followup_sms';
  if (workflow.sms_completed_at && !workflow.followup_sent_at && millis(now) >= millis(workflow.initial_sent_at) + Number(plan.email_after_days) * DAY) return 'followup_email';
  return 'await_parent';
}

/** Queue inside an assignment transaction; delivery happens only after commit. */
export async function queueSchoolContactAssignments(db = pool, { clientId = null } = {}) {
  try {
    const [result] = await db.execute(`INSERT IGNORE INTO school_contact_workflows
      (agency_id,client_id,school_id,provider_user_id,assignment_id,plan_decided_at)
      SELECT p.agency_id,c.id,a.organization_id,a.provider_user_id,MIN(a.id),p.decided_at
      FROM client_provider_assignments a JOIN clients c ON c.id=a.client_id
      JOIN school_provider_contact_plans p ON p.agency_id=c.agency_id AND p.provider_user_id=a.provider_user_id AND p.status='enabled'
      JOIN agencies s ON s.id=a.organization_id AND s.organization_type='school' AND s.is_active=1 AND COALESCE(s.is_archived,0)=0
      JOIN organization_affiliations oa ON oa.organization_id=s.id AND oa.agency_id=p.agency_id AND oa.is_active=1
      WHERE p.agency_id=? AND a.is_active=1 AND c.status<>'ARCHIVED'
        AND a.created_at>=p.decided_at ${clientId ? 'AND c.id=?' : ''}
      GROUP BY p.agency_id,c.id,a.organization_id,a.provider_user_id,p.decided_at`, [SCHOOL_CONTACT_DEMO_AGENCY_ID, ...(clientId ? [Number(clientId)] : [])]);
    return Number(result.affectedRows || 0);
  } catch (e) {
    // Assignment changes must still work while a deployment's migration runs.
    if (e.code === 'ER_NO_SUCH_TABLE') return 0;
    throw e;
  }
}

async function observeReplies(workflow) {
  if (!workflow.initial_sent_at) return workflow;
  const [[provider]] = await pool.execute(`SELECT MAX(replied_at) AS replied_at FROM (
      SELECT COALESCE(sent_at,created_at) AS replied_at FROM communication_messages
      WHERE conversation_id=? AND author_user_id=? AND direction='outbound' AND send_status IN ('sent','delivered')
        AND COALESCE(is_auto_reply,0)=0 AND COALESCE(is_internal_note,0)=0
        AND JSON_EXTRACT(from_json,'$.schoolContactAutomation') IS NULL AND COALESCE(sent_at,created_at)>?
      UNION ALL SELECT created_at FROM message_logs WHERE agency_id=? AND client_id=? AND user_id=? AND direction='OUTBOUND'
        AND delivery_status IN ('sent','delivered') AND created_at>?
        AND sms_thread_key IN (SELECT sms_thread_key FROM message_logs WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.schoolContactWorkflowId'))=?)
        AND COALESCE(JSON_EXTRACT(metadata,'$.schoolContactWorkflowId'),0)=0
        AND COALESCE(JSON_EXTRACT(metadata,'$.autoReply'),FALSE)=FALSE
        AND COALESCE(JSON_EXTRACT(metadata,'$.vacationReply'),FALSE)=FALSE
    ) replies`, [workflow.conversation_id, workflow.provider_user_id, workflow.initial_sent_at, workflow.agency_id, workflow.client_id, workflow.provider_user_id, workflow.initial_sent_at, String(workflow.id)]);
  // Use the existing linked-guardian evidence, excluding receipts, auto-replies,
  // another clinician's conversation, and notes that merely say "contacted".
  const [[parent]] = await pool.execute(`SELECT MIN(e.occurred_at) AS replied_at FROM client_parent_contact_events e
    LEFT JOIN communication_messages em ON e.source_type='email' AND em.id=e.source_id
    LEFT JOIN message_logs sm ON e.source_type='sms' AND sm.id=e.source_id
    WHERE e.agency_id=? AND e.client_id=? AND e.author_user_id=? AND e.successful=1 AND e.direction='inbound' AND e.occurred_at>=?
      AND ((e.source_type='email' AND em.conversation_id=?) OR (e.source_type='sms' AND sm.sms_thread_key IN
        (SELECT sms_thread_key FROM message_logs WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.schoolContactWorkflowId'))=?)))`,
  [workflow.agency_id, workflow.client_id, workflow.provider_user_id, provider?.replied_at || workflow.initial_sent_at, workflow.conversation_id, String(workflow.id)]);
  if (!parent?.replied_at && !provider?.replied_at) return workflow;
  const providerReply = parent?.replied_at ? null : provider?.replied_at || null;
  await pool.execute('UPDATE school_contact_workflows SET parent_reply_at=?,provider_replied_at=? WHERE id=?', [parent?.replied_at || workflow.parent_reply_at || null, providerReply, workflow.id]);
  return { ...workflow, parent_reply_at: parent?.replied_at || workflow.parent_reply_at || null, provider_replied_at: providerReply };
}

// Claim BEFORE transport. Never automatically resend an ambiguous delivery after
// a crash or timeout; an operator reconciles its receipt. Normal scheduler retries
// resume pending work, without repeating already sent/skipped steps.
async function runStep(workflow, key, send) {
  const [claim] = await pool.execute("INSERT IGNORE INTO school_contact_workflow_steps (workflow_id,step_key,status) VALUES (?,?,'sending')", [workflow.id, key]);
  if (!claim.affectedRows) {
    const [[existing]] = await pool.execute('SELECT * FROM school_contact_workflow_steps WHERE workflow_id=? AND step_key=?', [workflow.id, key]);
    if (['sent','skipped'].includes(existing?.status)) {
      const [[message]] = key === 'initial_email' && existing.message_id ? await pool.execute('SELECT conversation_id FROM communication_messages WHERE id=?', [existing.message_id]) : [[null]];
      return { sent: existing.status === 'sent', skipped: existing.status === 'skipped', reason: existing.detail, messageId: existing.message_id, conversationId: message?.conversation_id, completedAt: existing.completed_at };
    }
    await pool.execute("UPDATE school_contact_workflows SET status='needs_review',last_error='Delivery needs receipt reconciliation; no automatic duplicate was sent.' WHERE id=?", [workflow.id]);
    return { needsReview: true };
  }
  try {
    const result = await send();
    if (result.recordPending) throw Object.assign(new Error('Accepted send needs local receipt reconciliation'), { code: 'accepted_send_record_pending' });
    const completedAt = new Date();
    await pool.execute('UPDATE school_contact_workflow_steps SET status=?,message_id=?,detail=?,completed_at=? WHERE workflow_id=? AND step_key=?',
      [result.skipped ? 'skipped' : 'sent', result.messageId || null, result.reason || null, completedAt, workflow.id, key]);
    return { ...result, completedAt };
  } catch (e) {
    await pool.execute("UPDATE school_contact_workflow_steps SET status='needs_review',detail=? WHERE workflow_id=? AND step_key=?", [safeError(e), workflow.id, key]);
    await pool.execute("UPDATE school_contact_workflows SET status='needs_review',last_error=? WHERE id=?", [safeError(e), workflow.id]);
    return { needsReview: true };
  }
}

async function stillEnabled(workflow) {
  const [[plan]] = await pool.execute(`SELECT p.status,p.decided_at FROM school_provider_contact_plans p JOIN school_contact_workflows w
    ON w.agency_id=p.agency_id AND w.provider_user_id=p.provider_user_id
    WHERE w.id=? AND p.agency_id=? AND p.provider_user_id=? AND w.status NOT IN ('cancelled','complete') AND w.external_reply_recorded_at IS NULL`, [workflow.id,workflow.agency_id,workflow.provider_user_id]);
  return plan?.status === 'enabled' && millis(plan.decided_at) === millis(workflow.plan_decided_at);
}

async function guardianFor(workflow) {
  const [[guardian]] = await pool.execute(`SELECT u.id,u.first_name,u.last_name,COALESCE(NULLIF(u.personal_email,''),u.email) AS email,
      COALESCE(NULLIF(u.personal_phone,''),NULLIF(u.phone_number,''),u.work_phone) AS phone
    FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
    WHERE cg.client_id=? AND cg.relationship_type='guardian' AND cg.access_enabled=1 AND COALESCE(u.is_archived,0)=0
    ORDER BY cg.created_at,u.id LIMIT 1`, [workflow.client_id]);
  return guardian;
}

async function sendFollowupSms(workflow, ctx, guardian) {
  if (!await stillEnabled(workflow)) return { skipped: true, reason: 'Contact plan was disabled or its enrollment window changed.' };
  if (Number(workflow.session_sms_opt_in) !== 1) return { skipped: true, reason: 'Client has not opted in to text follow-ups.' };
  const to = schoolContactDemoSmsRecipient(ctx.agency.feature_flags, { clientId: workflow.client_id, phone: guardian?.phone });
  if (!to) return { skipped: true, reason: 'No matching client-bound demo text fixture is configured.' };
  const resolved = await resolveOutboundNumber({ userId: workflow.provider_user_id, clientId: workflow.client_id });
  if (!resolved?.number || Number(resolved.number.agency_id) !== Number(workflow.agency_id)) return { skipped: true, reason: 'A demo clinical text sender is required.' };
  const body = `Hi ${guardian.first_name || 'there'}, this is ${ctx.provider.first_name || 'your provider'}. I emailed about arranging an intake for school therapy. Please reply with days and times you can meet virtually. Thank you!`;
  const metadata = { schoolContactWorkflowId: workflow.id, schoolContactStep: 'followup_sms', automated: true, startsParentContactConversation: true };
  const log = await MessageLog.createOutbound({ agencyId: workflow.agency_id, userId: workflow.provider_user_id, assignedUserId: workflow.provider_user_id,
    numberId: resolved.number.id, ownerType: resolved.ownerType || 'agency', clientId: workflow.client_id, body,
    fromNumber: resolved.number.phone_number, toNumber: to, metadata });
  try {
    const receipt = await VonageService.sendSms({ purpose: 'care', agencyId: workflow.agency_id, from: resolved.number.phone_number, to, body, senderFirstName: ctx.provider.first_name });
    if (!receipt?.sid) throw Object.assign(new Error('Missing SMS receipt'), { code: 'sms_receipt_missing' });
    await MessageLog.markSent(log.id, receipt.sid, metadata);
    return { sent: true, messageId: log.id };
  } catch (e) {
    await MessageLog.markFailed(log.id, safeError(e));
    if (smsPolicySkipped(e)) return { skipped: true, reason: `Text not sent: ${e.code}` };
    throw e;
  }
}

async function notifySupport(workflow) {
  if (!await stillEnabled(workflow)) return { skipped: true, reason: 'Contact plan was disabled.' };
  const [support] = await pool.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.role IN ('admin','support','clinical_practice_assistant') AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL`, [workflow.agency_id]);
  for (const user of support) await Notification.coalesceOrCreate({ type: 'support_safety_net_alert', severity: 'warning',
    title: 'School intake reply needs follow-up', message: 'A guardian replied to a school contact plan and is still waiting for a provider response. Review the client’s Communications record.',
    userId: user.id, agencyId: workflow.agency_id, relatedEntityType: 'client', relatedEntityId: workflow.client_id,
    audienceJson: { workflowId: workflow.id, providerUserId: workflow.provider_user_id }, actorSource: 'school_contact_plan' });
  return support.length ? { sent: true } : { skipped: true, reason: 'No active demo support recipients configured.' };
}

async function remindProviderEmail(workflow, ctx) {
  if (!await stillEnabled(workflow)) return { skipped: true, reason: 'Contact plan was disabled.' };
  const mailbox = await resolveMessagesSendMailbox(workflow.agency_id);
  const body = 'You have a new client message waiting for a reply to begin the school intake. Please open the client’s Communications record in SchoolCareBridge and reply. This reminder contains no client details.';
  const receipt = await sendEmailFromIdentity({ senderIdentityId: mailbox.identity.id, to: SCHOOL_CONTACT_TEST_INBOX, bcc: SCHOOL_CONTACT_TEST_INBOX,
    subject: 'A school intake message is waiting for your reply', text: body, html: `<p>${body}</p>`, source: 'auto',
    templateType: 'school_contact_stale_provider', generatedByUserId: ctx.userId, replyToOverride: mailbox.fromEmail,
    internetMessageIdOverride: `<school-contact-${workflow.id}-provider-reminder@itsco.health>` });
  if (!receipt?.id || receipt.queued || receipt.pendingApproval || receipt.skipped) throw Object.assign(new Error('No email receipt'), { code: 'email_receipt_missing' });
  return { sent: true };
}

async function remindProviderSms(workflow, ctx) {
  if (!await stillEnabled(workflow)) return { skipped: true, reason: 'Contact plan was disabled.' };
  const [[provider]] = await pool.execute('SELECT personal_phone,phone_number,work_phone FROM users WHERE id=?', [workflow.provider_user_id]);
  const phone = provider?.personal_phone || provider?.phone_number || provider?.work_phone;
  const to = schoolContactDemoSmsRecipient(ctx.agency.feature_flags, { providerUserId: workflow.provider_user_id, phone });
  if (!to) return { skipped: true, reason: 'No matching provider-bound demo text fixture is configured.' };
  const from = await resolveRegisteredSmsSender({ agencyId: workflow.agency_id, purpose: 'workforce' });
  if (!from) return { skipped: true, reason: 'No registered demo staff text sender is available.' };
  const body = 'You have a new client message waiting for your reply to begin a school intake. Please open Communications in the app.';
  const metadata = { schoolContactWorkflowId: workflow.id, schoolContactStep: 'provider_sms', automated: true };
  const log = await MessageLog.createOutbound({ agencyId: workflow.agency_id, userId: workflow.provider_user_id, assignedUserId: workflow.provider_user_id,
    body, fromNumber: from, toNumber: to, metadata });
  try {
    const receipt = await VonageService.sendSms({ purpose: 'workforce', agencyId: workflow.agency_id, staffNotificationKind: 'messageAlerts', from, to, body });
    if (!receipt?.sid) throw Object.assign(new Error('Missing SMS receipt'), { code: 'sms_receipt_missing' });
    await MessageLog.markSent(log.id, receipt.sid, metadata);
    return { sent: true, messageId: log.id };
  } catch (e) {
    await MessageLog.markFailed(log.id, safeError(e));
    if (smsPolicySkipped(e)) return { skipped: true, reason: `Provider text not sent: ${e.code}` };
    throw e;
  }
}

async function processWorkflow(workflow, now) {
  // This rechecks the exact demo agency, current membership, provider role, and
  // school access on every tick, even if a pending row was manually inserted.
  let ctx;
  try { ctx = await getContactPlanContext({ agencyId: workflow.agency_id, userId: workflow.provider_user_id }); }
  catch (e) {
    if ([403,404].includes(e.status)) { await pool.execute("UPDATE school_contact_workflows SET status='cancelled',last_error='Current provider or school access is required.' WHERE id=?", [workflow.id]); return; }
    throw e;
  }
  workflow = await observeReplies(workflow);
  const action = nextSchoolContactStep(workflow, { status: workflow.plan_status, stale_after_hours: workflow.stale_after_hours,
    sms_after_days: workflow.sms_after_days, email_after_days: workflow.email_after_days, decided_at: workflow.current_plan_decided_at }, now);
  if (['cancel','complete','await_provider','await_parent'].includes(action)) {
    const status = { cancel: 'cancelled', complete: 'complete', await_provider: 'awaiting_provider', await_parent: 'waiting_parent' }[action];
    await pool.execute('UPDATE school_contact_workflows SET status=? WHERE id=?', [status, workflow.id]);
    return;
  }
  if (action === 'stale') {
    const support = await runStep(workflow, 'support_alert', () => notifySupport(workflow));
    const email = await runStep(workflow, 'provider_email', () => remindProviderEmail(workflow, ctx));
    const sms = await runStep(workflow, 'provider_sms', () => remindProviderSms(workflow, ctx));
    if (![support,email,sms].some(r => r.needsReview)) await pool.execute("UPDATE school_contact_workflows SET stale_notified_at=?,status='awaiting_provider' WHERE id=?", [now, workflow.id]);
    return;
  }
  const guardian = await guardianFor(workflow);
  if (!guardian?.email) { await pool.execute("UPDATE school_contact_workflows SET status='blocked',last_error='Link an authorized guardian with an email address to begin.' WHERE id=?", [workflow.id]); return; }
  const result = await runStep(workflow, action, () => action === 'followup_sms' ? sendFollowupSms(workflow, ctx, guardian) : sendSchoolContactEmail({
    agencyId: workflow.agency_id, providerUserId: workflow.provider_user_id, clientId: workflow.client_id, schoolId: workflow.school_id,
    to: guardian.email, parentName: [guardian.first_name,guardian.last_name].filter(Boolean).join(' ') || 'Parent', schoolName: workflow.school_name,
    serviceDay: workflow.service_day || 'a day we will confirm together', template: workflow.template,
    conversationId: workflow.conversation_id, workflowId: workflow.id, stepKey: action,
    ...(action === 'followup_email' ? { subject: 'Following up on your school therapy intake', body: `Hi ${guardian.first_name || 'there'},\n\nI am following up on my earlier email about beginning school therapy. Please reply with some days and times you can meet virtually so we can schedule an intake and establish our goals together. If you have questions, please hit reply.\n\n${[ctx.provider.first_name,ctx.provider.last_name].filter(Boolean).join(' ')}` } : {})
  }));
  if (result.needsReview) return;
  if (action === 'initial_email') await pool.execute("UPDATE school_contact_workflows SET initial_sent_at=?,conversation_id=?,status='waiting_parent',last_error=NULL WHERE id=?", [result.completedAt, result.conversationId || workflow.conversation_id, workflow.id]);
  if (action === 'followup_sms') await pool.execute("UPDATE school_contact_workflows SET sms_completed_at=?,status='waiting_parent',last_error=? WHERE id=?", [result.completedAt, result.reason || null, workflow.id]);
  if (action === 'followup_email') {
    // The normal counter records the first email conversation. This additional
    // outreach is a second attempt within that same threaded conversation.
    await pool.execute(`INSERT IGNORE INTO client_parent_contact_attempts (client_id,agency_id,source_type,conversation_key,first_source_id,occurred_at)
      VALUES (?,?,'email',?,?,?)`, [workflow.client_id, workflow.agency_id, `${workflow.conversation_id}:school-followup:${workflow.id}`, result.messageId, result.completedAt]);
    await pool.execute("UPDATE school_contact_workflows SET followup_sent_at=?,status='waiting_parent',last_error=NULL WHERE id=?", [result.completedAt, workflow.id]);
  }
}

const workflowSelect = `SELECT w.*,p.status AS plan_status,p.template,p.sms_after_days,p.email_after_days,p.stale_after_hours,p.decided_at AS current_plan_decided_at,s.name AS school_name,
      c.session_sms_opt_in,c.first_service_at,COALESCE(a.service_day,c.service_day) AS service_day,
      EXISTS(SELECT 1 FROM client_provider_assignments active WHERE active.client_id=w.client_id AND active.organization_id=w.school_id AND active.provider_user_id=w.provider_user_id AND active.is_active=1) AS assignment_active,
      (c.status='ARCHIVED' OR LOWER(COALESCE(cs.status_key,'')) IN ('terminated','discharged','closed','dead','archived') OR LOWER(COALESCE(cs.label,'')) LIKE '%terminated%') AS client_terminal
    FROM school_contact_workflows w LEFT JOIN school_provider_contact_plans p ON p.agency_id=w.agency_id AND p.provider_user_id=w.provider_user_id
    JOIN clients c ON c.id=w.client_id AND c.agency_id=w.agency_id LEFT JOIN client_statuses cs ON cs.id=c.client_status_id
    JOIN agencies s ON s.id=w.school_id LEFT JOIN client_provider_assignments a ON a.id=w.assignment_id
    WHERE w.agency_id=? AND w.status NOT IN ('cancelled','complete','needs_review')`;

export async function processSchoolContactAutomation({ now = new Date(), limit = 50 } = {}) {
  await queueSchoolContactAssignments();
  const size = Math.min(100,Math.max(1,Number(limit)||50));
  const [rows] = await pool.execute(`${workflowSelect} ORDER BY w.updated_at,w.id LIMIT ${Math.floor(size)}`, [SCHOOL_CONTACT_DEMO_AGENCY_ID]);
  let processed = 0;
  for (const row of rows) {
    const lock = await pool.getConnection();
    try {
      const [[claim]] = await lock.execute('SELECT GET_LOCK(?,0) AS claimed', [`school-contact:${row.id}`]);
      if (!Number(claim?.claimed)) continue;
      const [[fresh]] = await pool.execute(`${workflowSelect} AND w.id=? LIMIT 1`, [SCHOOL_CONTACT_DEMO_AGENCY_ID,row.id]);
      if (!fresh) continue;
      await processWorkflow(fresh, now);
      processed++;
    } finally { try { await lock.execute('SELECT RELEASE_LOCK(?)', [`school-contact:${row.id}`]); } finally { lock.release(); } }
  }
  return { processed };
}

export async function listSchoolContactWorkflows({ agencyId, providerUserId, clientId = null }) {
  await getContactPlanContext({ agencyId, userId: providerUserId });
  const [rows] = await pool.execute(`SELECT w.id,w.client_id AS clientId,c.initials,w.status,w.initial_sent_at AS initialSentAt,
    w.parent_reply_at AS parentReplyAt,w.external_reply_recorded_at AS externalReplyRecordedAt,w.stale_notified_at AS staleNotifiedAt,
    w.last_error AS note,w.conversation_id AS conversationId FROM school_contact_workflows w JOIN clients c ON c.id=w.client_id AND c.agency_id=w.agency_id
    WHERE w.agency_id=? AND w.provider_user_id=? ${clientId ? 'AND w.client_id=?' : ''}
      AND EXISTS(SELECT 1 FROM client_provider_assignments a WHERE a.client_id=w.client_id AND a.organization_id=w.school_id AND a.provider_user_id=w.provider_user_id AND a.is_active=1)
    ORDER BY w.created_at DESC LIMIT 100`, [Number(agencyId),Number(providerUserId),...(clientId ? [Number(clientId)] : [])]);
  return rows;
}

export async function markSchoolContactWorkflowReplied({ agencyId, providerUserId, workflowId }) {
  await getContactPlanContext({ agencyId, userId: providerUserId });
  const [[workflow]] = await pool.execute(`SELECT w.client_id,w.external_reply_recorded_at FROM school_contact_workflows w
    WHERE w.id=? AND w.agency_id=? AND w.provider_user_id=? AND w.initial_sent_at IS NOT NULL
      AND EXISTS(SELECT 1 FROM client_provider_assignments a WHERE a.client_id=w.client_id AND a.organization_id=w.school_id AND a.provider_user_id=w.provider_user_id AND a.is_active=1)`,
  [Number(workflowId),Number(agencyId),Number(providerUserId)]);
  if (!workflow) throw Object.assign(new Error('Contact workflow not found.'), { status: 404 });
  if (workflow.external_reply_recorded_at) return { stopped: true };
  const [result] = await pool.execute(`UPDATE school_contact_workflows SET external_reply_recorded_at=NOW(),status='complete',last_error='Provider recorded a reply received outside the app; automated follow-ups stopped.'
    WHERE id=? AND agency_id=? AND provider_user_id=? AND initial_sent_at IS NOT NULL AND external_reply_recorded_at IS NULL`, [Number(workflowId),Number(agencyId),Number(providerUserId)]);
  if (!result.affectedRows) return { stopped: true };
  await ClientNotes.create({ client_id: workflow.client_id, author_id: Number(providerUserId), category: 'contact', urgency: 'low',
    message: `Provider recorded a parent / guardian reply received outside the app. Automated school initial contact follow-ups stopped. Workflow #${Number(workflowId)}.`, is_internal_only: true },
  { hasAgencyAccess: true, canViewInternalNotes: true });
  return { stopped: true };
}
