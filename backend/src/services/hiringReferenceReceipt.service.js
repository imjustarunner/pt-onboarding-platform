import pool from '../config/database.js';
import { peopleOperationsNotificationRecipients, singlePeopleOperationsMailbox } from './peopleOperationsSubmissionNotifications.service.js';
import { readAgencyAccess } from './agencyAccessProfiles.service.js';
import { applyAgencyAccess } from '../utils/agencyAccessPolicy.js';
import { getUserCapabilities } from '../utils/capabilities.js';
import { usesPasswordLogin } from '../utils/passwordLogin.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { resolveHiringReferenceSenderIdentity, resolveHiringReferenceReplyTo } from './hiringReferenceIdentity.service.js';
import { notificationTransportReceipt } from '../utils/notificationTransportReceipt.js';
import { referenceEmailFrame } from './hiringReferenceEmail.service.js';

export const REFERENCE_RECEIPT_TYPE = 'hiring_reference_received';
const json = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const address = value => String(value || '').trim().toLowerCase();
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const denied = () => Object.assign(new Error('Reference receipt recipient no longer has the required hiring access or delivery channel.'), { code: 'REFERENCE_RECEIPT_ACCESS', status: 403 });

export function referenceReceiptRoute(user, agency) {
  const sso = json(agency.feature_flags).googleSsoEnabled === true && !usesPasswordLogin(user);
  if (!sso) return { channel: 'in_app', to: null };
  // A personal address must never become an SSO fallback destination.
  const to = [user.work_email, user.email].map(address).find(email => singlePeopleOperationsMailbox(email) && email !== address(user.personal_email));
  return { channel: 'email', to: to || null };
}

async function source(event, db) {
  const table = event.source_kind === 'online' ? 'hiring_reference_requests' : event.source_kind === 'phone' ? 'hiring_reference_contacts' : null;
  if (!table) return null;
  const [rows] = await db.execute(`SELECT r.reference_index, ${event.source_kind === 'online' ? 'r.reference_name' : 'NULL AS reference_name'},
    u.first_name,u.last_name,h.references_json,a.id,a.name,a.slug,a.custom_domain,a.feature_flags,
    p.agency_id AS plotline_agency_id,p.is_qa AS plotline_is_qa FROM ${table} r
    JOIN users u ON u.id=r.candidate_user_id JOIN hiring_profiles h ON h.id=r.hiring_profile_id
    JOIN agencies a ON a.id=r.agency_id LEFT JOIN plotline_companies p ON p.agency_id=a.id
    WHERE r.id=? AND r.agency_id=? AND r.candidate_user_id=? AND h.candidate_user_id=r.candidate_user_id
    AND ${event.source_kind === 'online' ? "r.status='completed'" : "r.contact_method='phone' AND r.outcome='completed'"}
    AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`, [event.source_id, event.agency_id, event.candidate_user_id]);
  const row = rows[0];
  if (!row) return null;
  const references = json(row.references_json);
  row.reference_name ||= references?.[row.reference_index]?.name || 'A reference';
  return row;
}

export async function referenceReceiptRecipient(userId, agencyId, db = pool) {
  const [[user]] = await db.execute(`SELECT id,role,email,work_email,personal_email,sso_password_override,login_is_group_email,is_demo
    FROM users WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0 AND terminated_at IS NULL
    AND COALESCE(is_assistant_account,0)=0 AND UPPER(status) IN ('ACTIVE','ACTIVE_EMPLOYEE')`, [userId]);
  if (!user) return null;
  const access = await readAgencyAccess(userId, agencyId, db);
  return access && getUserCapabilities(applyAgencyAccess(user, access)).canManageHiring === true ? user : null;
}

export function referenceReceiptContent(event, row) {
  const candidate = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Applicant';
  const query = new URLSearchParams({ agencyId: String(event.agency_id), candidateId: String(event.candidate_user_id),
    tab: 'references', referenceIndex: String(row.reference_index),
    [event.source_kind === 'online' ? 'referenceRequestId' : 'referenceContactId']: String(event.source_id) });
  const url = buildPublicAppUrl(row, `admin/hiring/applicants?${query}`,
    row.plotline_agency_id ? { platformBaseUrl: 'https://plotlinepo.com' } : {});
  const subject = `Reference received for ${candidate}`;
  const message = `${row.reference_name} completed a reference for ${candidate}${event.source_kind === 'phone' ? ' by phone with People Operations' : ''}.`;
  return { subject, message, url, text: `${message}\n\nOpen reference: ${url}\n\nSign in with your authorized hiring account to review the confidential answers.\n\nPlotline — A People Operations Platform`,
    html: referenceEmailFrame({ agency: row, heading: subject,
      body: `<p>${escape(message)}</p><p>Sign in with your authorized hiring account to review the confidential answers.</p><p><a href="${escape(url)}" style="display:inline-block;padding:14px 22px;background:#143e33;color:white;border-radius:8px;text-decoration:none;font-weight:bold">Open reference</a></p>` }) };
}

const defaults = {
  db: pool, source, recipient: referenceReceiptRecipient, recipients: peopleOperationsNotificationRecipients,
  identity: resolveHiringReferenceSenderIdentity, replyTo: resolveHiringReferenceReplyTo,
  notify: async input => (await import('../models/Notification.model.js')).default.create(input),
  communication: async input => (await import('../models/UserCommunication.model.js')).default.create(input),
  send: async input => (await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity(input)
};

/** A durable claim stops duplicate sends across replicas and repeated submits.
 * Ambiguous transport outcomes stay held for review, never automatically resent. */
export function createReferenceReceiptWorker(overrides = {}) {
  const d = { ...defaults, ...overrides };
  return async function run(scope = {}) {
    const scoped = Number(scope.agencyId) > 0 && ['online','phone'].includes(scope.sourceKind) && Number(scope.sourceId) > 0;
    const values = scoped ? [Number(scope.agencyId), scope.sourceKind, Number(scope.sourceId)] : [];
    const [events] = await d.db.execute(`SELECT * FROM hiring_reference_receipt_events WHERE initialized=0${scoped ? ' AND agency_id=? AND source_kind=? AND source_id=?' : ''} ORDER BY id LIMIT 100`, values);
    for (const event of events) {
      if (await d.source(event, d.db)) for (const user of await d.recipients(event.agency_id, d.db)) {
        await d.db.execute('INSERT IGNORE INTO hiring_reference_receipt_notices(event_id,recipient_user_id) VALUES(?,?)', [event.id, user.id]);
      }
      await d.db.execute('UPDATE hiring_reference_receipt_events SET initialized=1 WHERE id=?', [event.id]);
    }
    const [pending] = await d.db.execute(`SELECT n.id AS notice_id,n.recipient_user_id,e.* FROM hiring_reference_receipt_notices n
      JOIN hiring_reference_receipt_events e ON e.id=n.event_id WHERE n.status='pending'${scoped ? ' AND e.agency_id=? AND e.source_kind=? AND e.source_id=?' : ''} ORDER BY n.id LIMIT 200`, values);
    for (const event of pending) {
      const [claim] = await d.db.execute("UPDATE hiring_reference_receipt_notices SET status='sending' WHERE id=? AND status='pending'", [event.notice_id]);
      if (!claim.affectedRows) continue;
      let status = 'skipped', channel = null, reason = null, notificationId = null, communicationId = null;
      try {
        const row = await d.source(event, d.db), user = row && await d.recipient(event.recipient_user_id, event.agency_id, d.db);
        if (!row || !user) throw denied();
        const route = referenceReceiptRoute(user, row), content = referenceReceiptContent(event, row);
        channel = route.channel;
        if (channel === 'in_app') {
          const notice = await d.notify({ type: REFERENCE_RECEIPT_TYPE, severity: 'info', title: content.subject, message: content.message,
            userId: user.id, agencyId: event.agency_id, relatedEntityType: 'hiring_candidate', relatedEntityId: event.candidate_user_id,
            audienceJson: { referenceIndex: row.reference_index, [event.source_kind === 'online' ? 'referenceRequestId' : 'referenceContactId']: event.source_id }, actorSource: 'Plotline reference receipt' });
          notificationId = notice.id; status = 'sent';
        } else {
          if (!route.to) throw new Error('An SSO work email is required. No other channel was substituted.');
          const identity = await d.identity(event.agency_id);
          if (!identity?.id || Number(identity.agency_id) !== Number(event.agency_id)) throw new Error('Configure the company reference sender.');
          const replyTo = await d.replyTo(event.agency_id, identity);
          if (!replyTo) throw new Error('Configure the company People Operations reply address.');
          const record = await d.communication({ agencyId: event.agency_id, userId: user.id, channel: 'email', templateType: REFERENCE_RECEIPT_TYPE,
            subject: content.subject, body: content.text, recipientAddress: route.to, generatedByUserId: null, deliveryStatus: 'pending', metadata: { referenceReceiptNoticeId: event.notice_id } });
          communicationId = record.id;
          await d.db.execute('UPDATE hiring_reference_receipt_notices SET channel=?,communication_id=? WHERE id=?', [channel, communicationId, event.notice_id]);
          const result = await d.send({ ...content, to: route.to, userId: user.id, senderIdentityId: identity.id, replyToOverride: replyTo,
            source: 'auto', templateType: REFERENCE_RECEIPT_TYPE, existingCommunicationId: communicationId, preloggedReceipt: true });
          status = notificationTransportReceipt(result, event.agency_id, { qaAgencyVerified: Number(row.plotline_is_qa) === 1 }).accepted ? 'sent' : result?.pendingApproval ? 'pending_approval' : result?.skipped ? 'skipped' : 'held';
          if (status === 'held') reason = 'Delivery needs review before retrying.';
        }
      } catch (error) { status = error.code === 'REFERENCE_RECEIPT_ACCESS' ? 'skipped' : 'held'; reason = String(error.message).slice(0, 255); }
      await d.db.execute(`UPDATE hiring_reference_receipt_notices SET status=?,channel=?,review_reason=?,notification_id=?,communication_id=? WHERE id=?`,
        [status, channel, reason, notificationId, communicationId, event.notice_id]);
    }
  };
}
export const runReferenceReceiptNotifications = createReferenceReceiptWorker();

/** Runs for both immediate delivery and later email approval. Never trust a
 * stored recipient address or old permission grant when a queued email leaves. */
export async function assertReferenceReceiptRecipient({ templateType, agencyId, senderIdentityId, userId, to, cc, bcc, existingCommunicationId }, overrides = {}) {
  if (templateType !== REFERENCE_RECEIPT_TYPE) return;
  const d = { ...defaults, ...overrides };
  const [[event]] = await d.db.execute(`SELECT n.id AS notice_id,n.recipient_user_id,n.channel,e.* FROM hiring_reference_receipt_notices n
    JOIN hiring_reference_receipt_events e ON e.id=n.event_id WHERE n.communication_id=? AND e.agency_id=? AND n.status IN ('sending','pending_approval')`, [existingCommunicationId || 0, agencyId]);
  const row = event && await d.source(event, d.db), user = row && await d.recipient(event.recipient_user_id, agencyId, d.db);
  const identity = user && await d.identity(agencyId), route = user && referenceReceiptRoute(user, row);
  if (!user || (userId && Number(userId) !== Number(user.id)) || !identity || Number(identity.agency_id) !== Number(agencyId)
    || Number(identity.id) !== Number(senderIdentityId) || route.channel !== 'email' || !route.to || address(to) !== route.to || cc?.length || bcc?.length) throw denied();
}
