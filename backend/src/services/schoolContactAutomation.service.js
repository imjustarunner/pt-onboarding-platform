import pool from '../config/database.js';
import { getContactPlanContext, sendSchoolContactEmail, SCHOOL_CONTACT_DEMO_AGENCY_ID, schoolContactRouting } from './schoolContactPlan.service.js';
import { SCHOOL_CONTACT_AGENCY_IDS, schoolContactScopeSql, schoolContactDelivery } from './schoolContactRollout.js';
import { resolveOutboundNumber } from './communicationRouting.service.js';
import { resolveRegisteredSmsSender } from './smsCompliance.service.js';
import VonageService from './vonage.service.js';
import MessageLog from '../models/MessageLog.model.js';
import Notification from '../models/Notification.model.js';
import { DEFAULT_SECOND_CONTACT_TEMPLATE, DEFAULT_FINAL_CONTACT_TEMPLATE, DEFAULT_CONTACT_SMS_TEMPLATE, SCHOOL_CONTACT_SUBJECTS,preferredSchoolContactTemplate,displaySchoolContactDay } from './schoolContactTemplates.js';
import { renderSchoolContactTemplate } from './schoolContactPlan.service.js';
import { sendSchoolContactProviderNotice } from './schoolContactProviderNotice.service.js';
import ClientNotes from '../models/ClientNotes.model.js';
import ClinicalNote from '../models/clinical/ClinicalNote.model.js';
import { resolveMessagesSendMailbox } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import {requireQaContactScope} from './schoolContactQaScope.service.js';

const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const millis = value => value ? new Date(typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:/.test(value) ? value.replace(' ','T')+'Z' : value).getTime() : 0;
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
  if (plan?.status !== 'enabled' || !workflow.assignment_active || workflow.client_terminal) return 'cancel';
  if (workflow.plan_decided_at && plan.decided_at && millis(workflow.plan_decided_at) !== millis(plan.decided_at)) return 'cancel';
  if (workflow.intake_completed) return 'complete';
  // Once the day-six notice is issued, only a completed, documented intake ends
  // documentation reminders. A scheduled visit or draft is not completion.
  if (workflow.provider_notified_at) return millis(now) >= millis(workflow.last_intake_reminder_at || workflow.provider_notified_at) + 48*HOUR ? 'intake_reminder' : 'await_intake';
  if (workflow.parent_reply_at && !workflow.provider_replied_at && !workflow.external_reply_recorded_at)
    return !workflow.stale_notified_at && millis(now) >= millis(workflow.parent_reply_at) + 48*HOUR ? 'stale' : 'await_provider';
  if (workflow.external_reply_recorded_at || workflow.provider_replied_at || workflow.intake_scheduled || workflow.intake_arranged_at) return 'await_intake';
  if (!workflow.initial_sent_at) return 'initial_email';
  if (!workflow.second_contact_at && millis(now) >= millis(workflow.initial_sent_at) + 48*HOUR) return 'second_contact';
  if (workflow.second_contact_at && !workflow.final_contact_at && millis(now) >= millis(workflow.second_contact_at) + 48*HOUR) return 'final_contact';
  if (workflow.final_contact_at && millis(now) >= millis(workflow.final_contact_at) + 48*HOUR) return 'provider_notice';
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
      JOIN agencies pilot ON pilot.id=p.agency_id
      JOIN agencies s ON s.id=a.organization_id AND s.organization_type='school' AND s.is_active=1 AND COALESCE(s.is_archived,0)=0
      JOIN organization_affiliations oa ON oa.organization_id=s.id AND oa.agency_id=p.agency_id AND oa.is_active=1
      WHERE p.agency_id IN (?,?) AND ${schoolContactScopeSql()} AND a.is_active=1 AND c.status<>'ARCHIVED'
        AND a.created_at>=p.decided_at
        AND (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(pilot.feature_flags,'$.schoolContactPlanPilot.audience')),'')<>'assigned_school_providers'
          OR a.created_at>=CAST(REPLACE(LEFT(JSON_UNQUOTE(JSON_EXTRACT(pilot.feature_flags,'$.schoolContactPlanPilot.expandedAt')),23),'T',' ') AS DATETIME(3))) ${clientId ? 'AND c.id=?' : ''}
      GROUP BY p.agency_id,c.id,a.organization_id,a.provider_user_id,p.decided_at`, [...SCHOOL_CONTACT_AGENCY_IDS, ...(clientId ? [Number(clientId)] : [])]);
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
    await pool.execute('UPDATE school_contact_workflow_steps SET status=?,message_id=?,detail=?,completed_at=?,channel=?,conversation_id=? WHERE workflow_id=? AND step_key=?',
      [result.skipped ? 'skipped' : 'sent', result.messageId || null, result.reason || null, completedAt, result.channel || (key==='support_alert'?'in_app':key==='provider_sms'?'sms':'email'), result.conversationId || null, workflow.id, key]);
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
    JOIN organization_affiliations oa ON oa.organization_id=w.school_id AND oa.agency_id=w.agency_id AND oa.is_active=1
    JOIN agencies school ON school.id=w.school_id AND school.is_active=1 AND COALESCE(school.is_archived,0)=0
    WHERE w.id=? AND p.agency_id=? AND p.provider_user_id=? AND w.status NOT IN ('cancelled','complete') AND w.external_reply_recorded_at IS NULL
      AND EXISTS(SELECT 1 FROM client_provider_assignments cp WHERE cp.client_id=w.client_id AND cp.organization_id=w.school_id AND cp.provider_user_id=w.provider_user_id AND cp.is_active=1)`, [workflow.id,workflow.agency_id,workflow.provider_user_id]);
  return plan?.status === 'enabled' && millis(plan.decided_at) === millis(workflow.plan_decided_at);
}

async function guardianFor(workflow) {
  const [[guardian]] = await pool.execute(`SELECT u.id,u.first_name,u.last_name,COALESCE(NULLIF(u.personal_email,''),u.email) AS email,
      COALESCE(NULLIF(u.personal_phone,''),NULLIF(u.phone_number,''),u.work_phone) AS phone
    FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
    WHERE cg.client_id=? AND cg.relationship_type='guardian' AND cg.access_enabled=1 AND COALESCE(u.is_archived,0)=0 AND u.is_active=1
      AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1)
    ORDER BY cg.created_at,u.id LIMIT 1`, [workflow.client_id,workflow.agency_id]);
  return guardian;
}

async function sendFollowupSms(workflow, ctx, guardian) {
  if (!await stillEnabled(workflow)) return { skipped: true, reason: 'Contact plan was disabled or its enrollment window changed.' };
  if (Number(workflow.session_sms_opt_in) !== 1) return { skipped: true, reason: 'Client has not opted in to text follow-ups.' };
  const to = Number(workflow.agency_id) === SCHOOL_CONTACT_DEMO_AGENCY_ID
    ? schoolContactDemoSmsRecipient(ctx.agency.feature_flags, { clientId: workflow.client_id, phone: guardian?.phone }) : MessageLog.normalizePhone(guardian?.phone);
  if (!to) return { skipped: true, reason: 'No permitted family text destination is configured.' };
  const resolved = await resolveOutboundNumber({ userId: workflow.provider_user_id, clientId: workflow.client_id });
  if (!resolved?.number || Number(resolved.number.agency_id) !== Number(workflow.agency_id)) return { skipped: true, reason: 'An active clinical text sender is required.' };
  const values={parent_name:guardian.first_name || 'there',provider_name:[ctx.provider.first_name,ctx.provider.last_name].filter(Boolean).join(' '),agency_name:ctx.agency.name,school_name:workflow.school_name,service_day:displaySchoolContactDay(workflow.service_day)};
  const body=String(workflow.sms_template || DEFAULT_CONTACT_SMS_TEMPLATE).replace(/{{(\w+)}}/g,(_,key)=>values[key] || '');
  const metadata = { schoolContactWorkflowId: workflow.id, schoolContactStep: 'second_contact', automated: true, startsParentContactConversation: true };
  const log = await MessageLog.createOutbound({ agencyId: workflow.agency_id, userId: workflow.provider_user_id, assignedUserId: workflow.provider_user_id,
    numberId: resolved.number.id, ownerType: resolved.ownerType || 'agency', clientId: workflow.client_id, body,
    fromNumber: resolved.number.phone_number, toNumber: to, metadata });
  try {
    const receipt = await VonageService.sendSms({ purpose: 'care', agencyId: workflow.agency_id, from: resolved.number.phone_number, to, body, senderFirstName: ctx.provider.first_name });
    if (!receipt?.sid) throw Object.assign(new Error('Missing SMS receipt'), { code: 'sms_receipt_missing' });
    await MessageLog.markSent(log.id, receipt.sid, metadata);
    return { sent: true, messageId: log.id, channel:'sms' };
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
  return support.length ? { sent: true } : { skipped: true, reason: 'No active support recipients configured.' };
}

async function remindProviderEmail(workflow, ctx) {
  if (!await stillEnabled(workflow)) return { skipped: true, reason: 'Contact plan was disabled.' };
  const mailbox = await resolveMessagesSendMailbox(workflow.agency_id);
  const body = 'You have a new client message waiting for a reply to begin the school intake. Please open the client’s Communications record in SchoolCareBridge and reply. This reminder contains no client details.';
  const recipient = schoolContactRouting(ctx.provider, mailbox.fromEmail, ctx.agency).providerEmail;
  if (!recipient) return { skipped: true, reason: 'Provider email is not configured.' };
  const receipt = await sendEmailFromIdentity({ senderIdentityId: mailbox.identity.id, ...schoolContactDelivery(workflow.agency_id, { to: recipient, bcc: Number(workflow.agency_id) === SCHOOL_CONTACT_DEMO_AGENCY_ID ? recipient : null }),
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
  const to = Number(workflow.agency_id) === SCHOOL_CONTACT_DEMO_AGENCY_ID
    ? schoolContactDemoSmsRecipient(ctx.agency.feature_flags, { providerUserId: workflow.provider_user_id, phone }) : MessageLog.normalizePhone(phone);
  if (!to) return { skipped: true, reason: 'No provider text destination is configured.' };
  const from = await resolveRegisteredSmsSender({ agencyId: workflow.agency_id, purpose: 'workforce' });
  if (!from) return { skipped: true, reason: 'No registered staff text sender is available.' };
  const body = 'You have a new client message waiting for your reply to begin a school intake. Please open Communications in the app.';
  const metadata = { schoolContactWorkflowId: workflow.id, schoolContactStep: 'provider_sms', automated: true };
  const log = await MessageLog.createOutbound({ agencyId: workflow.agency_id, userId: workflow.provider_user_id, assignedUserId: workflow.provider_user_id,
    body, fromNumber: from, toNumber: to, metadata });
  try {
    const receipt = await VonageService.sendSms({ purpose: 'workforce', agencyId: workflow.agency_id, staffNotificationKind: 'messageAlerts', from, to, body });
    if (!receipt?.sid) throw Object.assign(new Error('Missing SMS receipt'), { code: 'sms_receipt_missing' });
    await MessageLog.markSent(log.id, receipt.sid, metadata);
    return { sent: true, messageId: log.id, channel:'sms' };
  } catch (e) {
    await MessageLog.markFailed(log.id, safeError(e));
    if (smsPolicySkipped(e)) return { skipped: true, reason: `Provider text not sent: ${e.code}` };
    throw e;
  }
}

async function processWorkflow(workflow, now, qa = null) {
  // This rechecks the enabled cohort, current membership, provider role, and
  // school access on every tick, even if a pending row was manually inserted.
  let ctx;
  try { ctx = await getContactPlanContext({ agencyId: workflow.agency_id, userId: workflow.provider_user_id }); }
  catch (e) {
    if ([403,404].includes(e.status)) { await pool.execute("UPDATE school_contact_workflows SET status='cancelled',last_error='Current provider or school access is required.' WHERE id=?", [workflow.id]); return; }
    throw e;
  }
  if (!ctx.schools?.some(s=>Number(s.id)===Number(workflow.school_id))) {
    await pool.execute("UPDATE school_contact_workflows SET status='cancelled',last_error='The original school assignment or affiliation is no longer active.' WHERE id=?",[workflow.id]);
    return;
  }
  workflow = await observeReplies(workflow);
  // Scheduled intake stops guardian outreach; finalized intake alone ends documentation reminders.
  const [[care]] = await pool.execute(`SELECT EXISTS(SELECT 1 FROM client_intake_note_drafts d WHERE d.agency_id=? AND d.client_id=? AND d.status='final' AND d.finalized_at IS NOT NULL) AS intake_completed,
    EXISTS(SELECT 1 FROM appointments ap JOIN appointment_participants pt ON pt.appointment_id=ap.id AND pt.client_id=?
      WHERE ap.agency_id=? AND ap.provider_user_id=? AND ap.business_type IN ('clinical','mental_health','healthcare') AND ap.service_code IN ('90791','H0031')
        AND ap.status IN ('scheduled','confirmed','client_confirmed') AND ap.end_at>=UTC_TIMESTAMP()) AS intake_scheduled`,
    [workflow.agency_id,workflow.client_id,workflow.client_id,workflow.agency_id,workflow.provider_user_id]);
  // Note Workspace signs into the clinical DB, independently of imported intake
  // drafts in the main DB. Use the same metadata-only predicate as plan activation.
  if (!Number(care.intake_completed)) care.intake_completed = await ClinicalNote.hasSignedIntakeForClient({
    agencyId: Number(workflow.agency_id), clientId: Number(workflow.client_id)
  });
  workflow={...workflow,...care};
  if (workflow.intake_scheduled && !workflow.intake_arranged_at) {
    const observedAt=qa?new Date():now;
    await pool.execute('UPDATE school_contact_workflows SET intake_arranged_at=COALESCE(intake_arranged_at,?) WHERE id=?',[observedAt,workflow.id]);
    workflow.intake_arranged_at=observedAt;
  }
  const decision=qa&&workflow.second_contact_at?{...workflow,second_contact_at:new Date(millis(workflow.initial_sent_at)+48*HOUR)}:workflow;
  const action = nextSchoolContactStep(decision, { status: workflow.plan_status, stale_after_hours: workflow.stale_after_hours,
    sms_after_days: workflow.sms_after_days, email_after_days: workflow.email_after_days, decided_at: workflow.current_plan_decided_at }, now);
  if(qa && action!==qa.stepKey) return {action:'stopped',reason:action};
  if (['cancel','complete','await_provider','await_parent','await_intake'].includes(action)) {
    const status = { cancel: 'cancelled', complete: 'complete', await_provider: 'awaiting_provider', await_parent: 'waiting_parent', await_intake:workflow.provider_notified_at?'intake_followup_required':'intake_arranged' }[action];
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
  if (['provider_notice','intake_reminder'].includes(action)) {
    const key=action==='provider_notice'?'provider_notice':`intake_reminder_${Math.floor(millis(workflow.last_intake_reminder_at || workflow.provider_notified_at)/1000)}`;
    const result=await runStep(workflow,key,()=>sendSchoolContactProviderNotice(workflow,ctx,{reminder:action==='intake_reminder',stepKey:key}));
    if (result.needsReview) return;
    await pool.execute("UPDATE school_contact_workflows SET provider_notified_at=COALESCE(provider_notified_at,?),last_intake_reminder_at=?,status='intake_followup_required',last_error=NULL WHERE id=?",[result.completedAt,result.completedAt,workflow.id]);
    return;
  }
  const guardian = await guardianFor(workflow);
  if (!guardian?.email) { await pool.execute("UPDATE school_contact_workflows SET status='blocked',last_error='Link an authorized guardian with an email address to begin.' WHERE id=?", [workflow.id]); return; }
  if(qa&&!/^testing(?:\+[^@\s]+)?@itsco\.health$/i.test(guardian.email))throw Object.assign(new Error('Use a controlled testing alias for the QA family.'),{status:403});
  const beforeDelivery=qa?async()=>{
    const authority=await requireQaContactScope(qa.actorUserId,qa.scope);
    const current=await guardianFor(workflow),fresh=await observeReplies(workflow);
    const [[latestCare]]=await pool.execute(`SELECT EXISTS(SELECT 1 FROM client_intake_note_drafts WHERE agency_id=? AND client_id=? AND status='final' AND finalized_at IS NOT NULL) AS intake_completed,
      EXISTS(SELECT 1 FROM appointments ap JOIN appointment_participants pt ON pt.appointment_id=ap.id AND pt.client_id=? WHERE ap.agency_id=? AND ap.provider_user_id=? AND ap.business_type IN ('clinical','mental_health','healthcare') AND ap.service_code IN ('90791','H0031') AND ap.status IN ('scheduled','confirmed','client_confirmed') AND ap.end_at>=UTC_TIMESTAMP()) AS intake_scheduled`,[workflow.agency_id,workflow.client_id,workflow.client_id,workflow.agency_id,workflow.provider_user_id]);
    if(!current||Number(current.id)!==Number(guardian.id)||current.email!==guardian.email||String(authority.initial_recipient_email).toLowerCase()!==guardian.email.toLowerCase()||fresh.parent_reply_at||fresh.provider_replied_at||fresh.external_reply_recorded_at||latestCare?.intake_completed||latestCare?.intake_scheduled
      ||await ClinicalNote.hasSignedIntakeForClient({agencyId:workflow.agency_id,clientId:workflow.client_id})||!await stillEnabled(workflow))throw Object.assign(new Error('QA contact access, intake or reply state changed before delivery.'),{code:'qa_contact_stopped',status:409});
  }:null;
  const values={parent_name:[guardian.first_name,guardian.last_name].filter(Boolean).join(' ') || 'Parent',provider_name:[ctx.provider.first_name,ctx.provider.last_name].filter(Boolean).join(' '),school_name:workflow.school_name,service_day:displaySchoolContactDay(workflow.service_day)};
  const sendEmail=()=>sendSchoolContactEmail({agencyId:workflow.agency_id,providerUserId:workflow.provider_user_id,clientId:workflow.client_id,schoolId:workflow.school_id,
    to:guardian.email,parentName:values.parent_name,schoolName:values.school_name,serviceDay:values.service_day,
    template:action==='initial_email'?preferredSchoolContactTemplate(workflow.template):action==='second_contact'?(workflow.second_template || DEFAULT_SECOND_CONTACT_TEMPLATE):(workflow.final_template || DEFAULT_FINAL_CONTACT_TEMPLATE),
    subject:SCHOOL_CONTACT_SUBJECTS[action],conversationId:workflow.conversation_id,workflowId:workflow.id,stepKey:action,beforeDelivery,
    qaAcceleration:qa?{elapsedHours:qa.elapsedHours,actorUserId:qa.actorUserId,actualTriggeredAt:qa.actualTriggeredAt}:null});
  const result=await runStep(workflow,action,async()=>{
    if(beforeDelivery)await beforeDelivery();
    // The accelerated endpoint admits only a text-declined fixture and must
    // never dispatch a carrier call from an earlier cached preference value.
    if(action==='second_contact' && !qa){
      const sms=await sendFollowupSms(workflow,ctx,guardian);
      if(sms.sent || sms.needsReview) return sms;
      // No opted-in, active clinical route: use the requested second email.
      // An ambiguous carrier send throws and never falls back to a duplicate.
    }
    const sent=await sendEmail();
    return qa?{...sent,reason:`Accelerated QA only: logical elapsed${qa.elapsedHours}h; triggered${qa.actualTriggeredAt}; actual delivery timestamps retained.`}:sent;
  });
  if(result.needsReview) return qa?{action:'needs_review',stepKey:action}:undefined;
  if(action==='initial_email') await pool.execute("UPDATE school_contact_workflows SET initial_sent_at=?,conversation_id=?,status='waiting_parent',last_error=NULL WHERE id=?",[result.completedAt,result.conversationId || workflow.conversation_id,workflow.id]);
  if(action==='second_contact') await pool.execute("UPDATE school_contact_workflows SET second_contact_at=?,status='waiting_parent',last_error=NULL WHERE id=?",[result.completedAt,workflow.id]);
  if(action==='final_contact') await pool.execute("UPDATE school_contact_workflows SET final_contact_at=?,status='waiting_parent',last_error=NULL WHERE id=?",[result.completedAt,workflow.id]);
  if(action!=='initial_email' && result.channel!=='sms') await pool.execute(`INSERT IGNORE INTO client_parent_contact_attempts (client_id,agency_id,source_type,conversation_key,first_source_id,occurred_at)
    VALUES (?,?,'email',?,?,?)`,[workflow.client_id,workflow.agency_id,`${workflow.conversation_id}:school-${action}:${workflow.id}`,result.messageId,result.completedAt]);
  return qa?{action:result.sent?'sent':result.skipped?'skipped':'evaluated',stepKey:action,messageId:result.messageId||null}:undefined;
}

const workflowSelect = `SELECT w.*,p.status AS plan_status,p.template,p.sms_after_days,p.email_after_days,p.stale_after_hours,p.second_template,p.final_template,p.sms_template,p.decided_at AS current_plan_decided_at,s.name AS school_name,
      c.session_sms_opt_in,c.first_service_at,COALESCE(a.service_day,c.service_day) AS service_day,
      EXISTS(SELECT 1 FROM client_provider_assignments active WHERE active.client_id=w.client_id AND active.organization_id=w.school_id AND active.provider_user_id=w.provider_user_id AND active.is_active=1) AS assignment_active,
      (c.status='ARCHIVED' OR LOWER(COALESCE(cs.status_key,'')) IN ('terminated','discharged','closed','dead','archived') OR LOWER(COALESCE(cs.label,'')) LIKE '%terminated%') AS client_terminal
    FROM school_contact_workflows w LEFT JOIN school_provider_contact_plans p ON p.agency_id=w.agency_id AND p.provider_user_id=w.provider_user_id
    JOIN agencies pilot ON pilot.id=w.agency_id
    JOIN clients c ON c.id=w.client_id AND c.agency_id=w.agency_id LEFT JOIN client_statuses cs ON cs.id=c.client_status_id
    JOIN agencies s ON s.id=w.school_id LEFT JOIN client_provider_assignments a ON a.id=w.assignment_id
    WHERE w.agency_id IN (?,?) AND ${schoolContactScopeSql('pilot','w.provider_user_id')} AND w.status NOT IN ('cancelled','complete','needs_review')`;

export async function processSchoolContactAutomation({ now = new Date(), limit = 50, scope=null,qaElapsedHours=null,qaActorId=null } = {}) {
  if(scope && (scope.agencyId!==450 || !['clientId','providerUserId','workflowId'].every(key=>Number.isSafeInteger(scope[key])&&scope[key]>0)))throw Object.assign(new Error('Invalid exact QA workflow scope.'),{status:400});
  if(qaElapsedHours!==null && (!scope||![48,96].includes(qaElapsedHours)||!Number.isSafeInteger(Number(qaActorId))||Number(qaActorId)<1))throw Object.assign(new Error('An exact QA scope and48/96-hour stage are required.'),{status:400});
  if(!scope)await queueSchoolContactAssignments();
  const size = Math.min(100,Math.max(1,Number(limit)||50));
  const filter=scope?` AND w.agency_id=? AND w.client_id=? AND w.provider_user_id=? AND w.id=? AND c.is_demo=1`:'';
  const bindings=[...SCHOOL_CONTACT_AGENCY_IDS,...(scope?[scope.agencyId,scope.clientId,scope.providerUserId,scope.workflowId]:[])];
  const [rows] = await pool.execute(`${workflowSelect}${filter} ORDER BY w.updated_at,w.id LIMIT ${scope?1:Math.floor(size)}`, bindings);
  let processed = 0;
  const outcomes=[];
  for (const row of rows) {
    const lock = await pool.getConnection();
    try {
      const [[claim]] = await lock.execute('SELECT GET_LOCK(?,0) AS claimed', [`school-contact:${row.id}`]);
      if (!Number(claim?.claimed)) continue;
      const [[fresh]] = await pool.execute(`${workflowSelect}${filter} AND w.id=? LIMIT 1`, [...bindings,row.id]);
      if (!fresh) continue;
      let qa=null,decisionNow=now;
      if(qaElapsedHours!==null){
        await requireQaContactScope(qaActorId,scope);
        if((qaElapsedHours===48&&fresh.second_contact_at)||(qaElapsedHours===96&&fresh.final_contact_at)){outcomes.push({action:'already_completed',workflowId:fresh.id,stepKey:qaElapsedHours===48?'second_contact':'final_contact'});processed++;continue;}
        if(qaElapsedHours===96&&!fresh.second_contact_at)throw Object.assign(new Error('Complete the48-hour QA stage before96 hours.'),{status:409});
        qa={actorUserId:qaActorId,scope,elapsedHours:qaElapsedHours,stepKey:qaElapsedHours===48?'second_contact':'final_contact',actualTriggeredAt:new Date().toISOString()};
        decisionNow=new Date(millis(fresh.initial_sent_at)+qaElapsedHours*HOUR);
      }
      const outcome=await processWorkflow(fresh, decisionNow,qa);
      if(scope)outcomes.push({workflowId:fresh.id,...(outcome||{action:'evaluated'})});
      processed++;
    } finally { try { await lock.execute('SELECT RELEASE_LOCK(?)', [`school-contact:${row.id}`]); } finally { lock.release(); } }
  }
  return { processed,...(scope?{outcomes}:{}) };
}

export async function listSchoolContactWorkflows({ agencyId, providerUserId, clientId = null }) {
  await getContactPlanContext({ agencyId, userId: providerUserId });
  const [rows] = await pool.execute(`SELECT w.id,w.client_id AS clientId,c.initials,w.status,w.initial_sent_at AS initialSentAt,
    w.parent_reply_at AS parentReplyAt,w.external_reply_recorded_at AS externalReplyRecordedAt,w.stale_notified_at AS staleNotifiedAt,w.second_contact_at AS secondContactAt,w.final_contact_at AS finalContactAt,w.provider_notified_at AS providerNotifiedAt,w.last_intake_reminder_at AS lastIntakeReminderAt,
    w.last_error AS note,w.conversation_id AS conversationId FROM school_contact_workflows w JOIN clients c ON c.id=w.client_id AND c.agency_id=w.agency_id
    WHERE w.agency_id=? AND w.provider_user_id=? ${clientId ? 'AND w.client_id=?' : ''}
      AND EXISTS(SELECT 1 FROM client_provider_assignments a WHERE a.client_id=w.client_id AND a.organization_id=w.school_id AND a.provider_user_id=w.provider_user_id AND a.is_active=1)
    ORDER BY w.created_at DESC LIMIT 100`, [Number(agencyId),Number(providerUserId),...(clientId ? [Number(clientId)] : [])]);
  if(rows.length) {
    const [steps]=await pool.execute(`SELECT st.id,st.workflow_id,st.step_key,st.status,st.completed_at,st.detail,st.channel,st.conversation_id
      FROM school_contact_workflow_steps st JOIN school_contact_workflows w ON w.id=st.workflow_id
      WHERE w.agency_id=? AND w.provider_user_id=? AND w.id IN (${rows.map(()=>'?').join(',')}) ORDER BY st.id`,[Number(agencyId),Number(providerUserId),...rows.map(r=>r.id)]);
    for(const row of rows) row.steps=steps.filter(s=>Number(s.workflow_id)===Number(row.id));
  }
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
  const [result] = await pool.execute(`UPDATE school_contact_workflows SET external_reply_recorded_at=NOW(),status=IF(provider_notified_at IS NULL,'intake_arranged','intake_followup_required'),last_error='Provider recorded a reply received outside the app; automated follow-ups stopped.'
    WHERE id=? AND agency_id=? AND provider_user_id=? AND initial_sent_at IS NOT NULL AND external_reply_recorded_at IS NULL`, [Number(workflowId),Number(agencyId),Number(providerUserId)]);
  if (!result.affectedRows) return { stopped: true };
  await ClientNotes.create({ client_id: workflow.client_id, author_id: Number(providerUserId), category: 'contact', urgency: 'low',
    message: `Provider recorded a parent / guardian reply received outside the app. Automated school initial contact follow-ups stopped. Workflow #${Number(workflowId)}.`, is_internal_only: true },
  { hasAgencyAccess: true, canViewInternalNotes: true });
  return { stopped: true };
}
