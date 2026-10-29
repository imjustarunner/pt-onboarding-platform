import { renewInvitedGuardianDraft } from './coGuardianDraftRenewal.js';
import crypto from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import { emailCoGuardianInvite, invitePublicUrl, insertGuardianAccessTicket } from './coGuardianInvite.service.js';
import { sendEnrollmentPortalEmail } from './enrollmentPortalEmail.service.js';
import { buildPublicPortalLoginUrl } from '../utils/publicPortalUrl.js';
import { isDobAdultLocked } from '../utils/guardianWaivers.utils.js';
import { guardianReminderDue, guardianReminderNextDate } from './coGuardianReminderPolicy.js';
import { validateQaIntakeGuardian } from './qaIntakeIdentity.service.js';

const failed = status => ['failed', 'bounced', 'undelivered', 'not_sent'].includes(status);
const json = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
const fail = (status, message) => { throw Object.assign(new Error(message), { status, statusCode: status }); };
export function inviteDeliveryState(result) {
  return result?.sent ? 'sent' : result?.queued ? 'pending' : 'failed';
}

export async function deliverCoGuardianInvite({ inviteId, enrollmentChannel = null, automaticReminder = false, ...message }) {
  // Persist before transmission, including exceptions and approval-held messages.
  const [insert] = await pool.execute(
    'INSERT INTO co_guardian_invite_deliveries (invite_id, recipient_email, enrollment_channel, delivery_kind, automatic_reminder) VALUES (?, ?, ?, ?, ?)',
    [inviteId, message.to, enrollmentChannel, message.reminder ? 'reminder' : 'invitation', automaticReminder ? 1 : 0]);
  let delivery;
  try {
    delivery = await emailCoGuardianInvite({ ...message, inviteId, enrollmentChannel });
  } catch (error) {
    // Keep failures before transport (for example sender/context lookup) visible
    // to the parent and follow-up worker instead of leaving "sending" forever.
    delivery = { sent: false, queued: false, communicationId: error?.communicationId || null };
  }
  const state = inviteDeliveryState(delivery);
  await pool.execute(`UPDATE co_guardian_invite_deliveries SET delivery_status=?, communication_id=?, internet_message_id=?, failure_kind=? WHERE id=?`,
    [state, delivery.communicationId || null, delivery.internetMessageId || null, state === 'failed' ? 'send_failed' : null, insert.insertId]);
  // The durable worker retries the parent notice if email is temporarily unavailable.
  if (state === 'failed') await notifyInvitationFailure(insert.insertId).catch(() => {});
  if (['sent','pending'].includes(state) && !automaticReminder) {
    // Explicit successful sends opt into two reminders. Correcting the address
    // starts a new recipient's schedule; resends to the same person do not reset it.
    await pool.execute(`INSERT INTO co_guardian_invite_reminders
      (invite_id,recipient_email,first_sent_at,next_due_at,state) VALUES (?,?,NOW(),IF(?='active',DATE_ADD(NOW(),INTERVAL 2 DAY),NULL),?)
      ON DUPLICATE KEY UPDATE
        first_sent_at=IF(recipient_email<>VALUES(recipient_email),NOW(),first_sent_at),
        next_due_at=IF(recipient_email<>VALUES(recipient_email),VALUES(next_due_at),next_due_at),
        reminders_attempted=IF(recipient_email<>VALUES(recipient_email),0,reminders_attempted),
        state=IF(recipient_email<>VALUES(recipient_email),VALUES(state),state),recipient_email=VALUES(recipient_email)`, [inviteId, message.to, state==='sent'?'active':'awaiting', state==='sent'?'active':'awaiting']);
  }
  if (automaticReminder && state !== 'sent') {
    await pool.execute("UPDATE co_guardian_invite_reminders SET state='held',next_due_at=NULL WHERE invite_id=?", [inviteId]);
  }
  return { ...delivery, deliveryStatus: state };
}

export async function listGuardianInvitations({ userId, agencyId, clientId = null }) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) <= 0) fail(400, 'Select an agency.');
  const [rows] = await pool.execute(`SELECT i.id, i.invited_email AS email, i.status, i.created_at AS invitedAt, i.expires_at AS expiresAt,
      i.invited_by_user_id AS invitedByUserId, i.source,
      i.accepted_at AS completedAt, (i.accepted_user_id IS NOT NULL) AS accountConnected,
      c.id AS clientId,c.agency_id AS clientAgencyId, c.guardian_portal_enabled AS portalEnabled, c.date_of_birth AS dateOfBirth,
      cg.access_enabled AS accessEnabled, cg.permissions_json AS permissions,
      d.created_at AS lastSentAt,
      (SELECT COUNT(*) FROM co_guardian_invite_deliveries history WHERE history.invite_id=i.id) AS deliveryAttempts,
      COALESCE(d.delivery_status, 'not_requested') AS deliveryStatus, d.failure_kind AS failureKind,
      CASE WHEN r.state='active' AND i.status='pending' AND d.delivery_status IN ('sent','delivered')
        THEN GREATEST(r.next_due_at,DATE_ADD(d.created_at,INTERVAL 2 DAY)) ELSE NULL END AS nextReminderAt
    FROM co_guardian_invites i LEFT JOIN co_guardian_invite_deliveries d ON d.id=(
      SELECT MAX(latest.id) FROM co_guardian_invite_deliveries latest WHERE latest.invite_id=i.id)
    JOIN co_guardian_invite_clients ic ON ic.invite_id=i.id JOIN clients c ON c.id=ic.client_id
    LEFT JOIN co_guardian_invite_reminders r ON r.invite_id=i.id
    LEFT JOIN client_guardians cg ON cg.client_id=c.id AND cg.guardian_user_id=?
    WHERE i.agency_id=? AND i.status IN ('pending','expired','accepted')
      AND EXISTS (SELECT 1 FROM co_guardian_invite_clients visible JOIN client_guardians linked ON linked.client_id=visible.client_id
        WHERE visible.invite_id=i.id AND linked.guardian_user_id=? AND linked.access_enabled=1)
    ORDER BY i.id DESC`, [userId, agencyId, userId]);
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.id)) grouped.set(row.id, []);
    grouped.get(row.id).push(row);
  }
  const canSee = row => {
    let permissions;
    try { permissions = json(row.permissions); } catch { return false; }
    return Number(row.clientAgencyId) === Number(agencyId) && Number(row.portalEnabled) === 1
      && Number(row.accessEnabled) === 1 && permissions && typeof permissions === 'object' && !Array.isArray(permissions)
      && !permissions.noView && !permissions.noViewOtherGuardian && !isDobAdultLocked(row.dateOfBirth);
  };
  const visible = [...grouped.values()].filter(group => group.some(row=>canSee(row)&&(!clientId||Number(row.clientId)===Number(clientId)))).slice(0,30);
  const histories = new Map();
  if (visible.length) {
    const [attempts] = await pool.execute(`SELECT invite_id AS inviteId,id,delivery_kind AS kind,delivery_status AS status,created_at AS occurredAt
      FROM co_guardian_invite_deliveries WHERE invite_id IN (${visible.map(()=>'?').join(',')}) ORDER BY id DESC`, visible.map(group=>group[0].id));
    for (const attempt of attempts) {
      if (!histories.has(attempt.inviteId)) histories.set(attempt.inviteId,[]);
      histories.get(attempt.inviteId).push({id:attempt.id,kind:attempt.kind,status:attempt.status,occurredAt:attempt.occurredAt});
    }
  }
  return visible.map(group => {
    const row = group[0], owner = Number(row.invitedByUserId) === Number(userId);
    // A linked guardian may see progress of a staff-created invitation, but
    // receives no other guardian's address, answers, or management authority.
    return { id: row.id, email: owner ? row.email : `${String(row.email || '').slice(0, 1)}•••@•••`,
      status: row.status, invitedAt: row.invitedAt, expiresAt: row.expiresAt,
      completedAt: row.completedAt, accountConnected: row.accountConnected,
      lastSentAt: row.lastSentAt, deliveryAttempts: row.deliveryAttempts,
      deliveryStatus: row.deliveryStatus, failureKind: row.failureKind,
      nextReminderAt:row.nextReminderAt||null,history:histories.get(row.id)||[],
      canManage: owner && group.every(canSee) };
  });
}

export async function assertInvitationOwner({ invite, userId, agencyId, db = pool }) {
  if (!invite || Number(invite.invited_by_user_id) !== Number(userId) || Number(invite.agency_id) !== Number(agencyId)) fail(404, 'Invitation not found.');
  if (!['pending', 'expired'].includes(invite.status)) fail(409, 'This invitation has already been used. Contact your support team to change access.');
  const [clients] = await db.execute(`SELECT c.id, c.agency_id, c.date_of_birth, cg.access_enabled, cg.permissions_json
    FROM co_guardian_invite_clients ic JOIN clients c ON c.id=ic.client_id
    LEFT JOIN client_guardians cg ON cg.client_id=c.id AND cg.guardian_user_id=? WHERE ic.invite_id=?`, [userId, invite.id]);
  if (!clients.length || clients.some(c => Number(c.agency_id) !== Number(agencyId) || Number(c.access_enabled) !== 1 || json(c.permissions_json).noView || json(c.permissions_json).noViewOtherGuardian)) fail(403, 'Your current guardian access does not permit this invitation. Contact your support team.');
  // Adult client access must be reviewed by the care team, even if an old invite exists.
  const today = new Date();
  if (clients.some(c => c.date_of_birth && new Date(new Date(c.date_of_birth).getFullYear()+18, new Date(c.date_of_birth).getMonth(), new Date(c.date_of_birth).getDate()) <= today)) fail(403, 'Contact your support team to update an adult client’s invitation.');
  return clients;
}

export async function resendGuardianInvitation({ userId, agencyId, inviteId, email }) {
  return rotateAndSendInvitation({ userId, agencyId, inviteId, email });
}

/** Explicit staff reminder to the already-confirmed address. Does not alter the
 * original inviter, guardian permissions, recipient identity, or completed forms. */
export async function sendStaffGuardianInvitationReminder({ actorUserId, agencyId, inviteId }) {
  const actor = await User.findById(actorUserId);
  if (!actor || !['super_admin', 'admin', 'agency_admin', 'clinical_practice_assistant'].includes(actor.role)) {
    fail(403, 'An authorized agency administrator must send this reminder.');
  }
  if (actor.role !== 'super_admin') {
    const [members] = await pool.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=?', [actorUserId, agencyId]);
    if (!members.length) fail(403, 'This administrator does not have access to the agency.');
  }
  return rotateAndSendInvitation({ userId: actorUserId, agencyId, inviteId, staffReminder: true });
}

async function rotateAndSendInvitation({ userId, agencyId, inviteId, email, staffReminder = false, automaticReminder = false }) {
  const db = await pool.getConnection(), lock = `guardian-invite:${Number(inviteId)}`;
  let locked = false;
  try {
    const [locks] = await db.execute('SELECT GET_LOCK(?,0) AS acquired', [lock]);
    if (!Number(locks[0]?.acquired)) fail(409, 'This invitation is being updated. Please try again shortly.');
    locked = true;
    await db.beginTransaction();
    const [rows] = await db.execute('SELECT * FROM co_guardian_invites WHERE id=? FOR UPDATE', [inviteId]);
    const invite = rows[0];
    let clients;
    if (staffReminder || automaticReminder) {
      if (!invite || Number(invite.agency_id) !== Number(agencyId)) fail(404, 'Invitation not found.');
      if (!['pending', 'expired'].includes(invite.status)) fail(409, 'This invitation has already been used or revoked.');
      [clients] = await db.execute('SELECT c.id, c.agency_id FROM co_guardian_invite_clients ic JOIN clients c ON c.id=ic.client_id WHERE ic.invite_id=?', [inviteId]);
      if (!clients.length || clients.some(client => Number(client.agency_id) !== Number(agencyId))) fail(409, 'The invitation does not have a valid dependent in this agency.');
      // A reminder must land on the published enrollment packet, not activate a
      // guardian through the older contact-only invitation screen.
      if (!invite.public_key) fail(409, 'Attach a published enrollment packet before sending this reminder.');
      const [packets] = await db.execute('SELECT id, is_active, create_guardian, master_channel, scope_type, organization_id FROM intake_links WHERE public_key=?', [invite.public_key]);
      if (Number(packets[0]?.is_active) !== 1 || Number(packets[0]?.create_guardian) !== 1) fail(409, 'The enrollment packet must be active and provision guardian accounts.');
      if (packets[0].scope_type === 'agency' && Number(packets[0].organization_id) !== Number(agencyId)) fail(409, 'The enrollment packet belongs to a different agency.');
      invite.enrollment_channel = packets[0].master_channel || null;
    } else {
      clients = await assertInvitationOwner({ invite, userId, agencyId, db });
    }
    const recipient = String(staffReminder || automaticReminder ? invite.invited_email : email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || recipient.length > 254) fail(400, 'Enter a valid email address for the other parent or guardian.');
    await validateQaIntakeGuardian({agencyId,email:recipient},db);
    const [attempts] = await db.execute('SELECT * FROM co_guardian_invite_deliveries WHERE invite_id=? ORDER BY id DESC LIMIT 1', [inviteId]);
    const last = attempts[0];
    if (automaticReminder) {
      const [[schedule]] = await db.execute('SELECT * FROM co_guardian_invite_reminders WHERE invite_id=? FOR UPDATE', [inviteId]);
      if (!guardianReminderDue({schedule,invite,lastDelivery:last})) { await db.rollback(); return {skipped:true}; }
      const requester=invite.invited_by_user_id?await User.findById(invite.invited_by_user_id):null;
      if (!requester || requester.is_active===0) fail(403,'The original invitation requester is no longer active.');
      if (['client_guardian','guardian','client'].includes(requester.role)) {
        await assertInvitationOwner({invite,userId:requester.id,agencyId,db});
      } else if (['admin','agency_admin','clinical_practice_assistant','super_admin'].includes(requester.role)) {
        const [membership]=await db.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[requester.id,agencyId]);
        if (!membership.length) fail(403,'The original requester no longer belongs to this agency.');
      } else fail(403,'The original requester cannot manage this invitation.');
      const attempted = Number(schedule.reminders_attempted) + 1;
      const nextDue = guardianReminderNextDate(schedule.first_sent_at, attempted);
      // Consume the attempt before external transport. A crash must not duplicate
      // a reminder; unsuccessful/uncertain sends require review instead of retries.
      await db.execute('UPDATE co_guardian_invite_reminders SET reminders_attempted=?,next_due_at=?,state=? WHERE invite_id=?',
        [attempted,nextDue,attempted>=2?'complete':'active',inviteId]);
    }
    if (last && Date.now() - new Date(last.created_at).getTime() < 60000) fail(429, 'Wait a minute before resending.');
    const [counts] = await db.execute('SELECT COUNT(*) AS n FROM co_guardian_invite_deliveries WHERE invite_id=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 DAY)', [inviteId]);
    if (Number(counts[0].n) >= 5) fail(429, 'Please contact support for help with this invitation.');
    const [[prior]] = await db.execute(`SELECT COUNT(*) AS n FROM co_guardian_invite_deliveries
      WHERE invite_id=? AND LOWER(recipient_email)=? AND delivery_status IN ('sent','delivered')`, [inviteId,recipient]);
    const isReminder = Number(prior?.n || 0) > 0;
    // Revoke only an unaccepted, restricted relationship created by this invite.
    // Never remove a pre-existing guardian relationship or change their account email.
    if (recipient !== invite.invited_email) {
      await db.execute(`UPDATE client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
        JOIN co_guardian_invite_clients ic ON ic.client_id=cg.client_id
        SET cg.access_enabled=0 WHERE ic.invite_id=? AND LOWER(u.email)=?
        AND JSON_EXTRACT(cg.permissions_json,'$.coGuardianInviteRestricted')=true
        AND JSON_EXTRACT(cg.permissions_json,'$.coGuardianInviteId')=?`, [inviteId, invite.invited_email.toLowerCase(), Number(inviteId)]);
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 21 * 86400000);
    await db.execute(`UPDATE co_guardian_invites SET invited_email=?, token_hash=?, expires_at=?, status='pending' WHERE id=?`,
      [recipient, crypto.createHash('sha256').update(token).digest('hex'), expiresAt, inviteId]);
    const resumeToken = await renewInvitedGuardianDraft(db, { invite, recipient, expiresAt });
    await db.commit();
    const agency = await Agency.findById(agencyId);
    const inviteUrl = new URL(invitePublicUrl({ agency, token, publicKey: invite.public_key, serviceType: last?.enrollment_channel || invite.enrollment_channel || 'counseling' }));
    if (resumeToken) inviteUrl.searchParams.set('session', resumeToken);
    const delivery = await deliverCoGuardianInvite({ inviteId, agency, to: recipient, firstName: invite.invited_first_name,
      inviteUrl: inviteUrl.toString(), clientId: clients[0].id,
      enrollmentChannel: last?.enrollment_channel || invite.enrollment_channel || null, school: invite.source === 'school', reminder: isReminder, automaticReminder });
    return { deliveryStatus: delivery.deliveryStatus, email: recipient, communicationId: delivery.communicationId || null };
  } catch (error) { await db.rollback(); throw error; }
  finally { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lock]); db.release(); }
}

export async function notifyInvitationFailure(deliveryId) {
  const db = await pool.getConnection(), lock = `guardian-notice:${deliveryId}`;
  let locked = false;
  try {
    const [locks] = await db.execute('SELECT GET_LOCK(?,0) AS acquired', [lock]);
    if (!Number(locks[0]?.acquired)) return;
    locked = true;
    const [rows] = await db.execute(`SELECT d.*, i.agency_id, i.invited_by_user_id, i.source FROM co_guardian_invite_deliveries d
      JOIN co_guardian_invites i ON i.id=d.invite_id WHERE d.id=? AND i.status='pending'
      AND d.id=(SELECT MAX(x.id) FROM co_guardian_invite_deliveries x WHERE x.invite_id=i.id)`, [deliveryId]);
    const row = rows[0];
    if (!row || !failed(row.delivery_status) || ['sent','pending'].includes(row.parent_notice_status)) return;
    if (row.parent_notice_attempted_at && Date.now()-new Date(row.parent_notice_attempted_at).getTime()<86400000) return;
    const agency = await Agency.findById(row.agency_id);
    const user = row.invited_by_user_id ? await User.findById(row.invited_by_user_id) : null;
    let delivery = null;
    await db.execute('UPDATE co_guardian_invite_deliveries SET parent_notice_attempted_at=NOW() WHERE id=?', [deliveryId]);
    if (user?.email && ['client_guardian','guardian'].includes(user.role)) {
      try {
        delivery = await sendEnrollmentPortalEmail({ agencyId: row.agency_id, schoolEnrollment: row.source === 'school', enrollmentChannel: row.enrollment_channel,
          to: user.email, userId: user.id, templateType: 'co_guardian_invite_failed', source: 'co_guardian_invite_failed',
          subject: `${agency.official_name || agency.name}: guardian invitation needs attention`,
          text: [
            'We could not deliver the invitation to the other parent or guardian.',
            row.failure_kind === 'mailbox_rejected' ? 'The receiving email service rejected the message. Please check the address you entered; this does not always mean it was typed incorrectly.' : 'Our system could not send the invitation. This may be a delivery or system issue; it does not necessarily mean the address is wrong.',
            'Sign in to your portal and open Guardian invitations to review the address, correct it if needed, and resend. You are responsible for providing the correct contact information.',
            'Your enrollment is saved. The other guardian’s enrollment is still outstanding. If the address is correct or you need help, reply to your support team.',
            buildPublicPortalLoginUrl(agency)
          ].join('\n\n') });
      } catch { /* Persist the failure and create a care-team task below. */ }
    }
    const status = inviteDeliveryState(delivery);
    await db.execute('UPDATE co_guardian_invite_deliveries SET parent_notice_status=?, parent_notice_communication_id=? WHERE id=?', [status, delivery?.communicationId || null, deliveryId]);
    if (status === 'failed' && !row.staff_ticket_created_at) {
      await insertGuardianAccessTicket({ agencyId: row.agency_id, fallbackUserId: row.invited_by_user_id,
        subject: 'Guardian invitation failed — contact the submitting parent',
        question: `Invitation ${row.invite_id}, delivery attempt ${row.id}, could not be delivered. The submitting parent could not be notified by email. Review the guardian invitation and contact the submitting parent to confirm the other guardian’s email. Do not resend to an unconfirmed address.` });
      await db.execute('UPDATE co_guardian_invite_deliveries SET staff_ticket_created_at=NOW() WHERE id=?', [deliveryId]);
    }
  } finally { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lock]); db.release(); }
}

export async function runGuardianInvitationDeliveryTick() {
  // Reconcile approval-queued mail, provider failures and failed parent notices.
  await pool.execute(`UPDATE co_guardian_invite_deliveries d JOIN user_communications c ON c.id=d.communication_id
    SET d.delivery_status=CASE WHEN c.delivery_status IN ('failed','bounced','undelivered','skipped','cancelled') THEN 'failed' ELSE c.delivery_status END,
      d.failure_kind=CASE WHEN c.delivery_status='bounced' THEN 'mailbox_rejected' WHEN c.delivery_status IN ('failed','undelivered','skipped','cancelled') THEN 'send_failed' ELSE d.failure_kind END,
      d.internet_message_id=COALESCE(d.internet_message_id,JSON_UNQUOTE(JSON_EXTRACT(c.metadata,'$.internetMessageId')))
    WHERE d.delivery_status IN ('sending','pending','sent') AND c.delivery_status IN ('sent','delivered','failed','bounced','undelivered','skipped','cancelled')`);
  await pool.execute(`UPDATE co_guardian_invite_deliveries d JOIN user_communications c ON c.id=d.parent_notice_communication_id
    SET d.parent_notice_status=CASE WHEN c.delivery_status IN ('sent','delivered') THEN 'sent' ELSE 'failed' END
    WHERE d.parent_notice_status='pending' AND c.delivery_status IN ('sent','delivered','failed','bounced','undelivered','skipped','cancelled')`);
  const [rows] = await pool.execute(`SELECT d.id FROM co_guardian_invite_deliveries d JOIN co_guardian_invites i ON i.id=d.invite_id
    WHERE d.delivery_status IN ('failed','bounced','undelivered') AND i.status='pending'
    AND d.id=(SELECT MAX(x.id) FROM co_guardian_invite_deliveries x WHERE x.invite_id=i.id)
    AND (d.parent_notice_status IS NULL OR d.parent_notice_status='failed') AND d.created_at>DATE_SUB(NOW(),INTERVAL 30 DAY)
    AND (d.parent_notice_attempted_at IS NULL OR d.parent_notice_attempted_at<DATE_SUB(NOW(),INTERVAL 1 DAY))
    ORDER BY d.id LIMIT 100`);
  for (const row of rows) await notifyInvitationFailure(row.id);
  await runGuardianInvitationReminders();
}

export async function runGuardianInvitationReminders() {
  // Approval-held invitations start their clock when transmission succeeds.
  await pool.execute(`UPDATE co_guardian_invite_reminders r JOIN co_guardian_invites i ON i.id=r.invite_id
    JOIN co_guardian_invite_deliveries d ON d.id=(SELECT MAX(x.id) FROM co_guardian_invite_deliveries x WHERE x.invite_id=i.id)
    SET r.state='active',r.first_sent_at=NOW(),r.next_due_at=DATE_ADD(NOW(),INTERVAL 2 DAY)
    WHERE r.state='awaiting' AND i.status='pending' AND d.delivery_status IN ('sent','delivered')
      AND LOWER(d.recipient_email)=LOWER(r.recipient_email)`);
  await pool.execute(`UPDATE co_guardian_invite_reminders r JOIN co_guardian_invites i ON i.id=r.invite_id
    SET r.state='stopped',r.next_due_at=NULL WHERE r.state='active'
    AND (i.status<>'pending' OR i.expires_at<=NOW() OR LOWER(i.invited_email) COLLATE utf8mb4_unicode_ci<>LOWER(r.recipient_email) COLLATE utf8mb4_unicode_ci)`);
  const [due] = await pool.execute(`SELECT r.invite_id,i.agency_id FROM co_guardian_invite_reminders r
    JOIN co_guardian_invites i ON i.id=r.invite_id WHERE r.state='active' AND r.next_due_at<=NOW()
    AND r.reminders_attempted<2 AND i.status='pending' AND i.expires_at>NOW() ORDER BY r.next_due_at LIMIT 50`);
  for (const row of due) {
    try { await rotateAndSendInvitation({agencyId:row.agency_id,inviteId:row.invite_id,automaticReminder:true}); }
    catch (error) {
      if (error.status !== 409 && error.status !== 429) {
        await pool.execute("UPDATE co_guardian_invite_reminders SET state='held',next_due_at=NULL WHERE invite_id=?", [row.invite_id]);
      }
    }
  }
}
