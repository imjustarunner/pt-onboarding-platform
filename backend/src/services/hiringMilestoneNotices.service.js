import pool from '../config/database.js';
import { applicantAdminConfiguration } from './applicantAdminNotices.service.js';
import { referenceEmailFrame } from './hiringReferenceEmail.service.js';
import { peopleOperationsFromDisplayName } from './publicJobDescription.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { notificationTransportReceipt } from '../utils/notificationTransportReceipt.js';

export const HIRING_MILESTONE_TEMPLATE = 'hiring_milestone_group';
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const address = value => String(value || '').trim().toLowerCase();
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fail = message => Object.assign(new Error(message), { status: 403 });

// Both library employment contracts and generated offers use canonical saved
// signatures. Ordinary acknowledgments and later amendments are excluded.
const signedOffer = `FROM tasks t
 JOIN users u ON u.id=t.assigned_to_user_id
 JOIN agencies a ON a.id=t.assigned_to_agency_id
 JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=a.id AND ua.is_active=1
 LEFT JOIN hire_journeys j ON j.user_id=u.id AND j.agency_id=a.id
 LEFT JOIN plotline_companies p ON p.agency_id=a.id
 JOIN (SELECT task_id,user_id,MIN(signed_at) AS signed_at FROM signed_documents
       WHERE signed_pdf_path IS NOT NULL AND signed_pdf_path<>'' AND pdf_hash IS NOT NULL AND pdf_hash<>'' GROUP BY task_id,user_id) s
   ON s.task_id=t.id AND s.user_id=u.id
 WHERE t.task_type='document' AND t.document_action_type='signature' AND t.status='completed'
 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL
 AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','TERMINATED_PENDING')
 AND (JSON_EXTRACT(t.metadata,'$.employmentContract')=true OR EXISTS
   (SELECT 1 FROM contract_generations g WHERE g.task_id=t.id AND g.agency_id=a.id AND g.candidate_user_id=u.id))
 AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.metadata,'$.source')),'')<>'provider_update'`;
const fields = `SELECT t.id AS task_id,u.id AS candidate_user_id,a.id AS agency_id,
 u.first_name,u.last_name,a.name,a.slug,a.custom_domain,a.feature_flags,a.logo_path,a.color_palette,
 s.signed_at,j.prehire_completed_at,p.is_qa AS plotline_is_qa`;

export async function discoverHiringMilestones(db = pool) {
 // Recover from worker restarts without replaying pre-rollout offers. Unique
 // department keys make repeated observation safe.
 for (const type of ['offer_signed', 'prehire_complete']) {
  const time = type === 'offer_signed' ? 's.signed_at' : 'j.prehire_completed_at';
  const key = type === 'offer_signed' ? "CONCAT('offer:',t.id)" : "CONCAT('prehire:',u.id,':',j.prehire_completed_at)";
  for (const department of ['people_operations', 'admin']) {
   await db.execute(`INSERT IGNORE INTO hiring_milestone_group_notices
    (agency_id,candidate_user_id,task_id,event_type,event_key,department)
    SELECT a.id,u.id,t.id,?,${key},? ${signedOffer}
    AND ${time} >= (SELECT started_at FROM hiring_milestone_rollout WHERE id=1)
    AND JSON_EXTRACT(a.feature_flags,'$.peopleOperationsSubmissionNotificationsEnabled')=true
    AND ${time} > STR_TO_DATE(LEFT(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(a.feature_flags,
      '$.peopleOperationsSubmissionReview.reviewedAt')),'T',' '),19),'%Y-%m-%d %H:%i:%s')
    AND NOT EXISTS (SELECT 1 FROM hiring_milestone_group_notices n WHERE n.agency_id=a.id
      AND n.event_key=${key} AND n.department=?)
    ORDER BY ${time},t.id LIMIT 100`, [type, department, department]);
  }
 }
}

export async function hiringMilestoneSource(event, db = pool) {
 const key = event.event_type === 'prehire_complete' ? "CONCAT('prehire:',u.id,':',j.prehire_completed_at)" : "CONCAT('offer:',t.id)";
 const [[row]] = await db.execute(`${fields} ${signedOffer} AND a.id=? AND u.id=? AND t.id=? AND ${key}=?`,
  [event.agency_id, event.candidate_user_id, event.task_id, event.event_key]);
 if (!row || !['offer_signed', 'prehire_complete'].includes(event.event_type)) return null;
 if (event.event_type === 'prehire_complete' && !row.prehire_completed_at) return null;
 return { ...row, submitted_at: event.event_type === 'prehire_complete' ? row.prehire_completed_at : row.signed_at };
}

export async function hiringMilestoneConfiguration(row, department, db = pool) {
 const config = await applicantAdminConfiguration(row, db);
 if (!['people_operations', 'admin'].includes(department)) throw fail('Unknown hiring notification department.');
 return { ...config, to: department === 'admin' ? config.to : address(config.identity.from_email) };
}

export function hiringMilestoneContent(row, type) {
 const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Your candidate';
 const complete = type === 'prehire_complete';
 const heading = complete ? 'Pre-hire is complete!' : 'Your offer has been signed!';
 const message = complete
  ? `Congratulations! ${name} has signed their employment contract and completed pre-hire. Their submitted materials are ready for People Operations review.`
  : `Congratulations! ${name} has signed their employment contract.${row.prehire_completed_at ? ' They have also completed pre-hire.' : ' Their remaining pre-hire requirements must still be completed and submitted.'}`;
 const url = buildPublicAppUrl(row, `admin/hiring/people/${row.candidate_user_id}/packages`);
 const text = `${message}\n\nReview ${name} in the hiring workspace: ${url}\n\nPeople Operations · ${row.name}`;
 return { subject: `${complete ? 'Pre-hire completed' : 'Offer signed'} — ${name}`, text,
  html: referenceEmailFrame({ agency: row, heading, marketing: false,
   body: `<p>${escape(message)}</p><p style="margin:24px 0"><a href="${escape(url)}" style="display:inline-block;background:#143e33;color:#ffffff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Review candidate</a></p><p>Thank you for helping welcome ${escape(name)} to ${escape(row.name)}.</p>` }) };
}

const defaults = {
 db: pool, discover: discoverHiringMilestones, source: hiringMilestoneSource, configuration: hiringMilestoneConfiguration,
 communication: async input => (await import('../models/UserCommunication.model.js')).default.create(input),
 updateCommunication: async (...args) => (await import('../models/UserCommunication.model.js')).default.updateDeliveryStatus(...args),
 send: async input => (await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity(input)
};

export function createHiringMilestoneWorker(overrides = {}) {
 const d = { ...defaults, ...overrides };
 return async () => {
  await d.discover(d.db);
  const [events] = await d.db.execute("SELECT * FROM hiring_milestone_group_notices WHERE status='pending' ORDER BY id LIMIT 100");
  for (const event of events) {
   const [claim] = await d.db.execute("UPDATE hiring_milestone_group_notices SET status='sending' WHERE id=? AND status='pending'", [event.id]);
   if (!claim.affectedRows) continue;
   let record, status = 'held', reason = null;
   try {
    const row = await d.source(event, d.db);
    if (!row) throw fail('The signed employment contract is no longer available in this company.');
    const { identity, to, replyTo } = await d.configuration(row, event.department, d.db);
    // Two configured departments can share one mailbox. Keep only one delivery.
    const [[duplicate]] = await d.db.execute(`SELECT id FROM hiring_milestone_group_notices
     WHERE agency_id=? AND event_key=? AND recipient_address=? AND id<>? AND status IN ('sending','sent','pending_approval','held') LIMIT 1`,
    [event.agency_id, event.event_key, to, event.id]);
    if (duplicate) {
     await d.db.execute("UPDATE hiring_milestone_group_notices SET status='skipped',review_reason='Departments share the same mailbox' WHERE id=?", [event.id]);
     continue;
    }
    const content = hiringMilestoneContent(row, event.event_type);
    record = await d.communication({ agencyId: event.agency_id, userId: null, channel: 'email',
     templateType: HIRING_MILESTONE_TEMPLATE, subject: content.subject, body: content.text,
     recipientAddress: to, generatedByUserId: event.candidate_user_id, deliveryStatus: 'pending',
     metadata: { hiringMilestoneNoticeId: event.id, taskId: event.task_id } });
    await d.db.execute('UPDATE hiring_milestone_group_notices SET communication_id=?,sender_identity_id=?,recipient_address=? WHERE id=?', [record.id, identity.id, to, event.id]);
    const result = await d.send({ ...content, agencyId: event.agency_id, senderIdentityId: identity.id, to,
     replyToOverride: replyTo, fromDisplayNameOverride: peopleOperationsFromDisplayName(row), source: 'auto',
     templateType: HIRING_MILESTONE_TEMPLATE, existingCommunicationId: record.id, preloggedReceipt: true,
     generatedByUserId: event.candidate_user_id });
    status = notificationTransportReceipt(result, event.agency_id, { qaAgencyVerified: Number(row.plotline_is_qa) === 1 }).accepted ? 'sent'
     : result?.pendingApproval ? 'pending_approval' : result?.skipped ? 'skipped' : 'held';
    if (status === 'held') reason = result?.reason || 'Delivery needs staff review.';
   } catch (error) { reason = String(error.message || 'Delivery needs staff review.').slice(0, 255); }
   if (record && ['held', 'skipped'].includes(status)) await d.updateCommunication(record.id, status === 'held' ? 'flagged' : 'skipped', null, null, reason);
   await d.db.execute('UPDATE hiring_milestone_group_notices SET status=?,review_reason=? WHERE id=?', [status, reason, event.id]);
  }
 };
}

export async function assertHiringMilestoneNotice(input, overrides = {}) {
 if (input.templateType !== HIRING_MILESTONE_TEMPLATE) return;
 const d = { ...defaults, ...overrides };
 const [[event]] = await d.db.execute('SELECT * FROM hiring_milestone_group_notices WHERE communication_id=?', [input.existingCommunicationId || 0]);
 const [[record]] = await d.db.execute('SELECT * FROM user_communications WHERE id=?', [input.existingCommunicationId || 0]);
 if (!event || !record || !['sending', 'pending_approval'].includes(event.status) || ['sent', 'delivered'].includes(record.delivery_status)) throw fail('A saved pending milestone notice is required.');
 const row = await d.source(event, d.db);
 const config = row ? await d.configuration(row, event.department, d.db) : null;
 if (!config || Number(input.agencyId) !== Number(event.agency_id) || Number(record.agency_id) !== Number(event.agency_id)
  || Number(input.senderIdentityId) !== Number(config.identity.id) || Number(event.sender_identity_id) !== Number(config.identity.id)
  || address(input.to) !== config.to || address(record.recipient_address) !== config.to || address(event.recipient_address) !== config.to
  || record.template_type !== HIRING_MILESTONE_TEMPLATE || record.channel !== 'email' || record.client_id || record.user_id
  || Number(record.generated_by_user_id) !== Number(event.candidate_user_id)
  || Number(parse(record.metadata).hiringMilestoneNoticeId) !== Number(event.id) || input.cc?.length || input.bcc?.length
  || parse(record.metadata).cc?.length || parse(record.metadata).bcc?.length) {
  throw fail('The hiring milestone, agency mailbox or sender changed. Review this notice before delivery.');
 }
}

export async function runHiringMilestoneNotices(db = pool) {
 return createHiringMilestoneWorker({ db })();
}
