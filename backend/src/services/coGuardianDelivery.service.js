import crypto from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import { emailCoGuardianInvite, invitePublicUrl, insertGuardianAccessTicket } from './coGuardianInvite.service.js';
import { sendEnrollmentPortalEmail } from './enrollmentPortalEmail.service.js';
import { buildPublicPortalLoginUrl } from '../utils/publicPortalUrl.js';

const failed = status => ['failed', 'bounced', 'undelivered', 'not_sent'].includes(status);
const json = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
const fail = (status, message) => { throw Object.assign(new Error(message), { status, statusCode: status }); };
export function inviteDeliveryState(result) {
  return result?.sent ? 'sent' : result?.queued ? 'pending' : 'failed';
}

export async function deliverCoGuardianInvite({ inviteId, enrollmentChannel = null, ...message }) {
  // Persist before transmission, including exceptions and approval-held messages.
  const [insert] = await pool.execute(
    'INSERT INTO co_guardian_invite_deliveries (invite_id, recipient_email, enrollment_channel) VALUES (?, ?, ?)',
    [inviteId, message.to, enrollmentChannel]);
  const delivery = await emailCoGuardianInvite({ ...message, enrollmentChannel });
  const state = inviteDeliveryState(delivery);
  await pool.execute(`UPDATE co_guardian_invite_deliveries SET delivery_status=?, communication_id=?, internet_message_id=?, failure_kind=? WHERE id=?`,
    [state, delivery.communicationId || null, delivery.internetMessageId || null, state === 'failed' ? 'send_failed' : null, insert.insertId]);
  // The durable worker retries the parent notice if email is temporarily unavailable.
  if (state === 'failed') await notifyInvitationFailure(insert.insertId).catch(() => {});
  return { ...delivery, deliveryStatus: state };
}

export async function listGuardianInvitations({ userId, agencyId }) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) <= 0) fail(400, 'Select an agency.');
  const [rows] = await pool.execute(`SELECT i.id, i.invited_email AS email, i.status,
      COALESCE(d.delivery_status, 'not_requested') AS deliveryStatus, d.failure_kind AS failureKind
    FROM co_guardian_invites i LEFT JOIN co_guardian_invite_deliveries d ON d.id=(
      SELECT MAX(latest.id) FROM co_guardian_invite_deliveries latest WHERE latest.invite_id=i.id)
    WHERE i.invited_by_user_id=? AND i.agency_id=? AND i.status IN ('pending','expired')
      AND EXISTS (SELECT 1 FROM co_guardian_invite_clients ic JOIN client_guardians cg ON cg.client_id=ic.client_id
        WHERE ic.invite_id=i.id AND cg.guardian_user_id=? AND cg.access_enabled=1)
    ORDER BY i.id DESC LIMIT 30`, [userId, agencyId, userId]);
  return rows;
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
  const recipient = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || recipient.length > 254) fail(400, 'Enter a valid email address for the other parent or guardian.');
  const db = await pool.getConnection(), lock = `guardian-invite:${Number(inviteId)}`;
  let locked = false;
  try {
    const [locks] = await db.execute('SELECT GET_LOCK(?,0) AS acquired', [lock]);
    if (!Number(locks[0]?.acquired)) fail(409, 'This invitation is being updated. Please try again shortly.');
    locked = true;
    await db.beginTransaction();
    const [rows] = await db.execute('SELECT * FROM co_guardian_invites WHERE id=? FOR UPDATE', [inviteId]);
    const invite = rows[0];
    const clients = await assertInvitationOwner({ invite, userId, agencyId, db });
    if (invite.source === 'school') fail(409, 'School invitations are managed by your support team. Please send them the corrected address.');
    const [attempts] = await db.execute('SELECT * FROM co_guardian_invite_deliveries WHERE invite_id=? ORDER BY id DESC LIMIT 1', [inviteId]);
    const last = attempts[0];
    if (last && Date.now() - new Date(last.created_at).getTime() < 60000) fail(429, 'Wait a minute before resending.');
    const [counts] = await db.execute('SELECT COUNT(*) AS n FROM co_guardian_invite_deliveries WHERE invite_id=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 DAY)', [inviteId]);
    if (Number(counts[0].n) >= 5) fail(429, 'Please contact support for help with this invitation.');
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
    await db.execute(`UPDATE co_guardian_invites SET invited_email=?, token_hash=?, expires_at=DATE_ADD(NOW(),INTERVAL 21 DAY), status='pending' WHERE id=?`,
      [recipient, crypto.createHash('sha256').update(token).digest('hex'), inviteId]);
    await db.commit();
    const agency = await Agency.findById(agencyId);
    const delivery = await deliverCoGuardianInvite({ inviteId, agency, to: recipient, firstName: invite.invited_first_name,
      inviteUrl: invitePublicUrl({ agency, token, publicKey: invite.public_key, serviceType: last?.enrollment_channel || 'counseling' }), clientId: clients[0].id,
      enrollmentChannel: last?.enrollment_channel || null });
    return { deliveryStatus: delivery.deliveryStatus, email: recipient };
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
}
