import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { passwordRecoverySsoState } from './passwordRecoveryPolicy.service.js';
import { usesPasswordLogin } from '../utils/passwordLogin.js';
import { isActiveTeamMember } from './conversaTeamRecipients.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { ticketMailVisibilitySql } from './messageInboxPolicy.js';

export function ticketAssignmentWorkEmail(user, agency) {
  if (!isActiveTeamMember(user) || usesPasswordLogin(user) || !passwordRecoverySsoState(user, [agency]).ssoEnabled) return null;
  const email = String(user.email || user.work_email || '').trim().toLowerCase();
  return /^[^\s<>@,;]+@[^\s<>@,;]+$/.test(email) ? email : null;
}
export function ticketAssignmentMessage(agency, ticketId) {
  const url = new URL(buildPublicAppUrl(agency, 'tickets'));
  url.searchParams.set('ticketId', String(ticketId)); url.searchParams.set('agencyId', String(agency.id));
  return { subject: 'You have a new ticket assigned',
    text: `You have a new ticket assigned: #${ticketId}.\n\nOpen your ticket: ${url.href}\n\nSign in with your work account to review it.`, linkUrl: url.href };
}

/** Claimed before transport; uncertain sends are retained for review, never
 * automatically resent. Assignment mail is automation, not the assigner's send. */
export async function sendTicketAssignmentEmail({ ticketId }, dependencies = {}) {
  const database = dependencies.database || pool;
  const [[row]] = await database.execute(`SELECT t.id AS ticket_id,t.agency_id AS ticket_agency_id,t.claimed_at,t.claimed_by_user_id,
    u.*,ua.is_active AS membership_active,ua.agency_role,a.slug AS agency_slug,a.name AS agency_name,a.feature_flags AS agency_flags
    FROM support_tickets t JOIN users u ON u.id=t.claimed_by_user_id
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=t.agency_id AND ua.is_active=1
    JOIN agencies a ON a.id=t.agency_id
    JOIN ticket_assignment_email_settings rollout ON rollout.id=1 AND t.claimed_at>=rollout.enabled_at
    WHERE t.id=? AND ${ticketMailVisibilitySql('t')} AND t.status NOT IN ('closed','resolved','done') LIMIT 1`, [ticketId]);
  if (!row?.claimed_at) return { skipped: true, reason: 'not_assigned' };
  const agency = { id: row.ticket_agency_id, slug: row.agency_slug, name: row.agency_name, feature_flags: row.agency_flags };
  const to = ticketAssignmentWorkEmail(row, agency);
  if (!to) return { skipped: true, reason: 'not_sso_staff' };
  const assignmentAt = new Date(row.claimed_at);
  const key = createHash('sha256').update(`${ticketId}:${row.claimed_by_user_id}:${assignmentAt.toISOString()}`).digest('hex');
  const [[previous]] = await database.execute('SELECT delivery_status FROM ticket_assignment_email_deliveries WHERE assignment_key=?', [key]);
  if (previous) return { duplicate: true, status: previous.delivery_status, sent: previous.delivery_status === 'sent' };
  const resolveSender = dependencies.resolveSender || (async agencyId => (await import('./emailSenderIdentityResolver.service.js')).resolvePreferredSenderIdentityForAgency({ agencyId, templateType: 'support_ticket_assigned', preferredKeys: ['support','schoolreply','notifications','system'], includePlatformDefaults: false }));
  const sender = await resolveSender(agency.id);
  if (!sender?.id) return { skipped: true, reason: 'ticket_sender_unavailable' };
  const [claim] = await database.execute(`INSERT IGNORE INTO ticket_assignment_email_deliveries
    (agency_id,ticket_id,assignee_user_id,assignment_key,assignment_at,delivery_status) VALUES (?,?,?,?,?,'sending')`,
  [agency.id, ticketId, row.claimed_by_user_id, key, assignmentAt]);
  if (!claim.affectedRows) return { duplicate: true, status: 'sending' };
  const send = dependencies.send || (await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity;
  try {
    const [[fresh]] = await database.execute('SELECT claimed_by_user_id,claimed_at,status FROM support_tickets WHERE id=? AND agency_id=?', [ticketId, agency.id]);
    if (Number(fresh?.claimed_by_user_id) !== Number(row.claimed_by_user_id) || new Date(fresh.claimed_at).getTime() !== assignmentAt.getTime() || ['closed','resolved','done'].includes(fresh.status)) {
      await database.execute("UPDATE ticket_assignment_email_deliveries SET delivery_status='cancelled',error_code='assignment_changed' WHERE id=?", [claim.insertId]);
      return { skipped: true, reason: 'assignment_changed' };
    }
    const result = await send({ senderIdentityId: sender.id, to, ...ticketAssignmentMessage(agency, ticketId),
      source: 'auto', templateType: 'support_ticket_assigned', templateId: ticketId,
      userId: row.claimed_by_user_id, generatedByUserId: null,
      internetMessageIdOverride: `<ticket-assignment-${key}@${String(sender.from_email).split('@')[1]}>` });
    const status = result?.redirected || result?.blocked || result?.skipped ? 'review' : result?.pendingApproval || result?.queued ? 'queued' : result?.id ? 'sent' : 'review';
    await database.execute('UPDATE ticket_assignment_email_deliveries SET delivery_status=?,communication_id=?,sent_at=IF(?=\'sent\',NOW(),NULL) WHERE id=?', [status, result?.communicationId || null, status, claim.insertId]);
    return { sent: status === 'sent', status };
  } catch (error) {
    await database.execute("UPDATE ticket_assignment_email_deliveries SET delivery_status='review',error_code=? WHERE id=?", [String(error.code || 'delivery_unconfirmed').slice(0, 120), claim.insertId]);
    throw error;
  }
}

export async function runTicketAssignmentEmails({ database = pool, limit = 100 } = {}) {
  await database.execute(`UPDATE ticket_assignment_email_deliveries d JOIN user_communications c ON c.id=d.communication_id
    SET d.delivery_status=CASE WHEN c.delivery_status='sent' THEN 'sent' WHEN c.delivery_status IN ('failed','blocked','skipped') THEN 'review' ELSE d.delivery_status END,
      d.sent_at=IF(c.delivery_status='sent',c.sent_at,d.sent_at) WHERE d.delivery_status='queued'`);
  const [rows] = await database.execute(`SELECT t.id FROM support_tickets t JOIN ticket_assignment_email_settings settings ON settings.id=1
    JOIN users u ON u.id=t.claimed_by_user_id JOIN agencies a ON a.id=t.agency_id
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=t.agency_id AND ua.is_active=1
    WHERE t.claimed_by_user_id IS NOT NULL AND t.claimed_at>=settings.enabled_at AND t.status NOT IN ('closed','resolved','done')
      AND ${ticketMailVisibilitySql('t')}
      AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
      AND COALESCE(u.login_is_group_email,0)=0 AND COALESCE(u.sso_password_override,0)=0
      AND u.status IN ('ACTIVE','ACTIVE_EMPLOYEE') AND u.email LIKE '%@%'
      AND u.terminated_at IS NULL AND u.role NOT IN ('school_staff','client_guardian','guardian','client','athlete','assistant','kiosk')
      AND JSON_UNQUOTE(JSON_EXTRACT(a.feature_flags,'$.googleSsoEnabled'))='true'
      AND NOT EXISTS (SELECT 1 FROM ticket_assignment_email_deliveries d WHERE d.ticket_id=t.id AND d.assignee_user_id=t.claimed_by_user_id AND d.assignment_at=t.claimed_at)
    ORDER BY t.claimed_at,t.id LIMIT ${Math.max(1, Math.min(200, Number(limit) || 100))}`);
  const outcomes = [];
  for (const row of rows) {
    try { outcomes.push({ ticketId: row.id, ...await sendTicketAssignmentEmail({ ticketId: row.id }, { database }) }); }
    catch (error) { outcomes.push({ ticketId: row.id, status: 'review', code: error.code || 'assignment_email_failed' }); }
  }
  return outcomes;
}
