import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { encryptBillingSecret, decryptBillingSecret } from './billingEncryption.service.js';

const digest = value => createHash('sha256').update(String(value)).digest('hex');
const date = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const timestamp = value => value instanceof Date ? value.toISOString() : String(value || '');
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const parseJson = value => typeof value === 'string' ? JSON.parse(value) : value;
const utcTime = value => value instanceof Date ? value.getTime()
  : new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(String(value || '')) ? `${String(value).replace(' ', 'T')}Z` : value).getTime();
const isStale = row => Date.now() - utcTime(row.updated_at || row.created_at) > 15 * 60_000;

function displayDelivery(row) {
  if (!row) return { status: 'not_sent' };
  const stale = isStale(row);
  const status = row.status === 'sending' && stale ? 'delivery_unknown'
    : row.status === 'preparing' && stale ? 'failed' : row.status;
  return {
    id: Number(row.id), status, trigger: row.trigger_type, mailbox: row.recipient_email || null,
    filename: row.attachment_filename || null, sentAt: row.sent_at || null,
    communicationId: Number(row.communication_id) || null,
    requestedAt: row.created_at || null, errorCode: row.status === 'preparing' && stale ? 'PAYROLL_REPORT_PREPARATION_INTERRUPTED' : row.error_code || null
  };
}

export function createPayrollReportEmail({ db = pool, send = null, encrypt = encryptBillingSecret, decrypt = decryptBillingSecret } = {}) {
  async function payrollMailbox(agencyId) {
    const [rows] = await db.execute(`SELECT i.from_email, i.sender_identity_id
      FROM communication_inboxes i
      JOIN email_sender_identities e ON e.id=i.sender_identity_id AND e.agency_id=i.agency_id
        AND e.is_active=1 AND e.identity_key='payroll' AND LOWER(e.from_email)=LOWER(i.from_email)
      WHERE i.agency_id=? AND i.identity_key='payroll' AND i.kind='shared' AND i.is_active=1`, [agencyId]);
    if (rows.length !== 1 || !rows[0].sender_identity_id || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(rows[0].from_email || '')) {
      throw fail(409, 'PAYROLL_MAILBOX_UNAVAILABLE', 'Configure one active Payroll mailbox and matching sender identity for this agency.');
    }
    return rows[0];
  }

  async function periodFor(agencyId, payrollPeriodId) {
    const [[period]] = await db.execute(`SELECT p.id,p.agency_id,p.status,p.period_start,p.period_end,p.posted_at,p.ran_at,a.name agency_name
      FROM payroll_periods p JOIN agencies a ON a.id=p.agency_id WHERE p.id=? AND p.agency_id=?`, [payrollPeriodId, agencyId]);
    if (!period) throw fail(404, 'PAYROLL_PERIOD_NOT_FOUND', 'Pay period not found.');
    return period;
  }

  async function refreshedDelivery(row) {
    if (row?.status === 'preparing' && isStale(row)) {
      // Invalidate the lease itself, so a stalled process cannot start transport
      // after the status screen offers a replacement request.
      const [expired] = await db.execute("UPDATE payroll_report_email_deliveries SET status='failed',error_code='PAYROLL_REPORT_PREPARATION_INTERRUPTED' WHERE id=? AND status='preparing'", [row.id]);
      if (Number(expired.affectedRows)) row = { ...row, status: 'failed', error_code: 'PAYROLL_REPORT_PREPARATION_INTERRUPTED' };
    }
    if (!row?.communication_id || !['pending_approval', 'sending', 'delivery_unknown'].includes(row.status)) return row;
    const [[comm]] = await db.execute(`SELECT id,agency_id,recipient_address,delivery_status,external_message_id,
      sent_at,delivered_at,opened_at,metadata FROM user_communications WHERE id=? AND agency_id=?`, [row.communication_id, row.agency_id]);
    if (!comm) return row.status === 'pending_approval'
      ? { ...row, status: 'failed', error_code: 'PAYROLL_REPORT_APPROVAL_RECORD_UNAVAILABLE' } : row;
    let metadata = {};
    try { metadata = parseJson(comm.metadata) || {}; } catch { /* A receipt can still establish delivery. */ }
    if (comm.external_message_id || comm.sent_at || comm.delivered_at || comm.opened_at) {
      const redirected = !!metadata.testInboxRedirect || !!metadata.testInboxRedirected;
      return { ...row, status: redirected ? 'redirected' : 'sent', error_code: redirected ? 'EMAIL_REDIRECTED' : null,
        message_id: comm.external_message_id || row.message_id, sent_at: comm.sent_at || comm.delivered_at || comm.opened_at || row.sent_at };
    }
    if (row.status === 'pending_approval' && ['cancelled', 'canceled'].includes(comm.delivery_status)) {
      return { ...row, status: 'blocked', error_code: 'EMAIL_APPROVAL_CANCELED' };
    }
    if (row.status === 'pending_approval' && comm.delivery_status === 'failed') {
      return { ...row, status: 'delivery_unknown', error_code: 'PAYROLL_REPORT_DELIVERY_UNCONFIRMED' };
    }
    return row;
  }

  async function retryAttachments({ communication, actorUserId, senderIdentityId }) {
    const agencyId = Number(communication?.agency_id);
    const [[actor]] = await db.execute('SELECT id,role FROM users WHERE id=? AND COALESCE(is_active,1)=1 AND COALESCE(is_archived,0)=0', [actorUserId]);
    if (!actor) throw fail(403, 'PAYROLL_ACCESS_REQUIRED', 'Active payroll staff access is required.');
    if (actor.role !== 'super_admin') {
      const [[membership]] = await db.execute('SELECT has_payroll_access FROM user_agencies WHERE user_id=? AND agency_id=? AND COALESCE(is_active,1)=1', [actorUserId, agencyId]);
      if (!Number(membership?.has_payroll_access)) throw fail(403, 'PAYROLL_ACCESS_REQUIRED', 'Payroll access is required for this report.');
    }
    const [[delivery]] = await db.execute(`SELECT * FROM payroll_report_email_deliveries
      WHERE communication_id=? AND agency_id=? ORDER BY id DESC LIMIT 1`, [communication.id, agencyId]);
    if (!delivery?.attachment_payload_enc) throw fail(409, 'PAYROLL_REPORT_ATTACHMENT_UNAVAILABLE', 'The linked payroll report attachment is unavailable. Send a new report from Payroll.');
    const route = await payrollMailbox(agencyId);
    if (Number(senderIdentityId) !== Number(delivery.sender_identity_id) || Number(route.sender_identity_id) !== Number(senderIdentityId)
      || String(communication.recipient_address || '').trim().toLowerCase() !== String(delivery.recipient_email || '').trim().toLowerCase()
      || String(route.from_email).trim().toLowerCase() !== String(delivery.recipient_email || '').trim().toLowerCase()) {
      throw fail(409, 'PAYROLL_REPORT_ROUTE_CHANGED', 'Use this agency’s original Payroll sender and recipient for the queued report.');
    }
    let snapshot;
    try { snapshot = JSON.parse(decrypt(parseJson(delivery.attachment_payload_enc))); }
    catch { throw fail(409, 'PAYROLL_REPORT_ATTACHMENT_UNAVAILABLE', 'The linked payroll report attachment could not be read.'); }
    const period = await periodFor(agencyId, delivery.payroll_period_id);
    if (!['posted', 'finalized'].includes(String(period.status).toLowerCase()) || snapshot.postedAt !== timestamp(period.posted_at)
      || snapshot.ranAt !== timestamp(period.ran_at)) throw fail(409, 'PAYROLL_REPORT_POST_CHANGED', 'This payroll posting changed. Send its current report from Payroll.');
    if (snapshot.deliveryId !== Number(delivery.id) || snapshot.agencyId !== agencyId || snapshot.payrollPeriodId !== Number(delivery.payroll_period_id)
      || snapshot.filename !== delivery.attachment_filename || typeof snapshot.csv !== 'string' || digest(snapshot.csv) !== delivery.attachment_sha256) {
      throw fail(409, 'PAYROLL_REPORT_ATTACHMENT_UNAVAILABLE', 'The linked payroll report attachment failed its integrity check.');
    }
    return [{ filename: snapshot.filename, contentType: 'text/csv; charset=utf-8', contentBase64: Buffer.from(snapshot.csv, 'utf8').toString('base64') }];
  }

  async function status({ agencyId, payrollPeriodId }) {
    let route = null;
    try { route = await payrollMailbox(agencyId); } catch { /* Configuration is shown with delivery status. */ }
    try {
      const [[row]] = await db.execute(`SELECT * FROM payroll_report_email_deliveries
        WHERE agency_id=? AND payroll_period_id=? ORDER BY id DESC LIMIT 1`, [agencyId, payrollPeriodId]);
      return { ...displayDelivery(await refreshedDelivery(row)), configured: !!route, mailbox: row?.recipient_email || route?.from_email || null };
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') return { status: 'unavailable', configured: !!route, mailbox: route?.from_email || null, errorCode: 'PAYROLL_REPORT_EMAIL_UNAVAILABLE' };
      throw error;
    }
  }

  async function deliver({ agencyId, payrollPeriodId, actorUserId, trigger = 'post', idempotencyKey = null, buildAttachment }) {
    const period = await periodFor(agencyId, payrollPeriodId);
    if (!['posted', 'finalized'].includes(String(period.status || '').toLowerCase())) {
      throw fail(409, 'PAYROLL_MUST_BE_POSTED', 'Post payroll before emailing its reconciliation report.');
    }
    if (trigger !== 'post' && trigger !== 'manual') throw fail(400, 'INVALID_PAYROLL_REPORT_TRIGGER', 'Invalid report request.');
    if (trigger === 'manual' && !/^[A-Za-z0-9_-]{8,96}$/.test(String(idempotencyKey || ''))) {
      throw fail(400, 'PAYROLL_REPORT_REQUEST_KEY_REQUIRED', 'A unique report request key is required.');
    }
    const key = trigger === 'post'
      ? `post:${digest(`${period.id}|${timestamp(period.posted_at)}|${timestamp(period.ran_at)}`)}`
      : `manual:${idempotencyKey}`;
    if (trigger === 'manual') {
      let latest;
      try {
        [[latest]] = await db.execute(`SELECT * FROM payroll_report_email_deliveries
          WHERE agency_id=? AND payroll_period_id=? ORDER BY id DESC LIMIT 1`, [agencyId, payrollPeriodId]);
      } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') throw fail(503, 'PAYROLL_REPORT_EMAIL_UNAVAILABLE', 'Payroll was posted, but report email delivery is not available yet.');
        throw error;
      }
      const current = await refreshedDelivery(latest);
      if (current?.status === 'pending_approval') return { ...displayDelivery(current), reused: true };
      if (latest?.status === 'preparing' && isStale(latest)) {
        // Revoke a crashed preparation before a replacement can proceed. Its
        // original process must win the preparing→sending CAS before transport.
        await db.execute("UPDATE payroll_report_email_deliveries SET status='failed',error_code='PAYROLL_REPORT_PREPARATION_INTERRUPTED' WHERE id=? AND status='preparing'", [latest.id]);
      } else if (['preparing', 'sending'].includes(current?.status) && !isStale(current)) {
        throw fail(409, 'PAYROLL_REPORT_IN_PROGRESS', 'The payroll report is still being prepared or sent. Refresh before retrying.');
      }
    }
    let claim;
    try {
      [claim] = await db.execute(`INSERT IGNORE INTO payroll_report_email_deliveries
        (agency_id,payroll_period_id,delivery_key,trigger_type,requested_by_user_id,status)
        VALUES (?,?,?,?,?,'preparing')`, [agencyId, payrollPeriodId, key, trigger, actorUserId || null]);
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') throw fail(503, 'PAYROLL_REPORT_EMAIL_UNAVAILABLE', 'Payroll was posted, but report email delivery is not available yet.');
      throw error;
    }
    if (!Number(claim.affectedRows)) {
      const [[existing]] = await db.execute(`SELECT * FROM payroll_report_email_deliveries
        WHERE agency_id=? AND payroll_period_id=? AND delivery_key=?`, [agencyId, payrollPeriodId, key]);
      return { ...displayDelivery(await refreshedDelivery(existing)), reused: true };
    }
    const deliveryId = Number(claim.insertId);
    let transportStarted = false;
    try {
      const route = await payrollMailbox(agencyId);
      const attachment = await buildAttachment();
      if (!attachment?.filename || typeof attachment.csv !== 'string' || !attachment.csv.trim()) {
        throw fail(409, 'PAYROLL_REPORT_EMPTY', 'The reconciliation report could not be prepared.');
      }
      const hash = digest(attachment.csv);
      const encrypted = JSON.stringify(encrypt(JSON.stringify({ deliveryId, agencyId: Number(agencyId), payrollPeriodId: Number(payrollPeriodId),
        filename: attachment.filename, csv: attachment.csv, postedAt: timestamp(period.posted_at), ranAt: timestamp(period.ran_at) })));
      const [started] = await db.execute(`UPDATE payroll_report_email_deliveries SET sender_identity_id=?,recipient_email=?,
        attachment_filename=?,attachment_sha256=?,attachment_payload_enc=?,status='sending' WHERE id=? AND status='preparing'`,
      [route.sender_identity_id, route.from_email, attachment.filename, hash, encrypted, deliveryId]);
      if (!Number(started.affectedRows)) return { id: deliveryId, status: 'failed', errorCode: 'PAYROLL_REPORT_PREPARATION_INTERRUPTED' };
      transportStarted = true;
      const options = {
        senderIdentityId: Number(route.sender_identity_id), to: route.from_email,
        subject: `${period.agency_name} payroll reconciliation: ${date(period.period_start)} to ${date(period.period_end)}`,
        text: `Payroll for ${date(period.period_start)} through ${date(period.period_end)} has been posted.\n\nThe payroll reconciliation CSV is attached for your records.`,
        attachments: [{ filename: attachment.filename, contentType: 'text/csv; charset=utf-8', contentBase64: Buffer.from(attachment.csv, 'utf8').toString('base64') }],
        source: trigger === 'manual' ? 'manual' : 'auto', templateType: 'payroll_posted_reconciliation',
        generatedByUserId: actorUserId || null,
        internetMessageIdOverride: `<payroll-report-${deliveryId}-${hash.slice(0, 12)}@${route.from_email.split('@')[1]}>`
      };
      const result = send ? await send(options) : await (await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity(options);
      const sent = !!result?.id && !result.queued && !result.pendingApproval && !result.skipped && !result.blocked && !result.redirected;
      const awaitingApproval = !!(result?.pendingApproval || result?.queued) && !!Number(result?.communicationId);
      const deliveryStatus = sent ? 'sent' : awaitingApproval ? 'pending_approval'
        : result?.skipped || result?.blocked ? 'blocked' : result?.redirected ? 'redirected' : 'delivery_unknown';
      const errorCode = sent ? null : awaitingApproval ? 'EMAIL_APPROVAL_REQUIRED'
        : result?.redirected ? 'EMAIL_REDIRECTED' : result?.skipped || result?.blocked ? 'EMAIL_DELIVERY_BLOCKED' : 'PAYROLL_REPORT_DELIVERY_UNCONFIRMED';
      await db.execute(`UPDATE payroll_report_email_deliveries SET status=?,communication_id=?,message_id=?,error_code=?,
        sent_at=CASE WHEN ?='sent' THEN CURRENT_TIMESTAMP(3) ELSE NULL END WHERE id=?`,
      [deliveryStatus, result?.communicationId || null, result?.internetMessageId || result?.id || null, errorCode, deliveryStatus, deliveryId]);
      return { id: deliveryId, status: deliveryStatus, mailbox: route.from_email, filename: attachment.filename, errorCode };
    } catch (error) {
      const deliveryStatus = transportStarted ? 'delivery_unknown' : 'failed';
      const errorCode = transportStarted ? 'PAYROLL_REPORT_DELIVERY_UNCONFIRMED'
        : ['PAYROLL_MAILBOX_UNAVAILABLE', 'PAYROLL_REPORT_EMPTY'].includes(error.code) ? error.code : 'PAYROLL_REPORT_PREPARATION_FAILED';
      await db.execute('UPDATE payroll_report_email_deliveries SET status=?,error_code=?,communication_id=COALESCE(?,communication_id) WHERE id=?', [deliveryStatus, errorCode, error.communicationId || null, deliveryId]).catch(() => {});
      return { id: deliveryId, status: deliveryStatus, errorCode };
    }
  }

  return { status, deliver, retryAttachments };
}

export default createPayrollReportEmail();
