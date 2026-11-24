import { queueClientClosureNote } from './clientClosureReview.service.js';
import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';
import { clientTerminationDetails } from './clientTerminationDetails.service.js';
import { assertExchangeResolvedBeforeArchive } from './clientExchangeTransfer.service.js';
import { enrollmentMailBrand, renderPortalEmail } from './portalEmailBranding.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { ENROLLMENT_FOLLOWUP_REASONS, enrollmentFollowupDraft } from '../../../frontend/src/constants/enrollmentFollowup.js';

const fail = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const parse = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
const validEmail = value => typeof value === 'string' && value.length <= 320 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
const defaults = { queueClientClosureNote, pool, Agency, Client, ClientGuardian, EmailSenderIdentity, getClientStatusIdByKey, clientTerminationDetails, assertExchangeResolvedBeforeArchive, sendEmailFromIdentity };

export async function enrollmentFollowupContext(client, overrides = {}) {
  const d = { ...defaults, ...overrides };
  const agency = await d.Agency.findById(client.agency_id);
  if (!agency) throw fail('The client’s agency was not found.', 404);
  const identities = await d.EmailSenderIdentity.list({ agencyId: client.agency_id, includePlatformDefaults: false, onlyActive: true });
  const sender = identities.find(identity => Number(identity.agency_id) === Number(client.agency_id) && /^schools@[^@]+$/i.test(identity.from_email || ''));
  if (!sender) throw fail('Configure the agency’s verified schools@ sender before sending a final follow-up.', 409);
  const school = client.organization_id && Number(client.organization_id) !== Number(client.agency_id) ? await d.Agency.findById(client.organization_id) : null;
  const schoolName = school?.organization_type === 'school' ? school.name : '';
  const agencyName = agency.official_name || agency.name;
  const guardians = await d.ClientGuardian.listForClient(client.id);
  const adaptive = parse(client.adaptive_intake_meta_json);
  const recipients = [...new Set([
    ...guardians.filter(guardian => Number(guardian.access_enabled) === 1).map(guardian => guardian.email),
    client.email, adaptive.respondent?.email
  ].filter(validEmail).map(email => email.trim().toLowerCase()))];
  const from = sender.from_email.trim().toLowerCase();
  const brand = { ...enrollmentMailBrand({ agency, domain: from.split('@')[1], school: true, clinicalOverride: false }), displayName: `${agencyName} Schools Team`, fromEmail: from, replyTo: from };
  return { agencyName, schoolName, recipients, from, replyTo: from, senderIdentityId: Number(sender.id), brand, ...enrollmentFollowupDraft({ agencyName, schoolName }) };
}

export function enrollmentFollowupPreview(context, text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 20000) throw fail('Enter an email message of 20,000 characters or fewer.');
  return renderPortalEmail({ brand: context.brand, text: text.trim() });
}

export async function sendEnrollmentFollowup({ client, actorUserId, body }, overrides = {}) {
  const d = { ...defaults, ...overrides };
  if (typeof body.request_key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.request_key)) throw fail('A valid send request is required. Reopen the form and try again.');
  const disposition = body.disposition || 'inactive';
  if (!['inactive', 'waitlist'].includes(disposition)) throw fail('Choose inactive or school waitlist.');
  const reasons = Array.isArray(body.reasons) ? [...new Set(body.reasons)].sort() : [];
  if (reasons.some(key => !ENROLLMENT_FOLLOWUP_REASONS.some(reason => reason.key === key))) throw fail('Choose a supported follow-up reason.');
  if (reasons.includes('school_waitlist') && disposition !== 'waitlist') throw fail('Choose school waitlist to keep this client waiting for a school provider.');
  const to = String(body.email?.to || '').trim().toLowerCase();
  const subject = body.email?.subject;
  const text = body.email?.text;
  if (!validEmail(to)) throw fail('Enter one valid recipient email address.');
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 200 || /[\r\n]/.test(subject)) throw fail('Enter a valid email subject of 200 characters or fewer.');
  const context = await enrollmentFollowupContext(client, d);
  const html = enrollmentFollowupPreview(context, text);
  const details = await d.clientTerminationDetails(body, client);
  const statusId = await d.getClientStatusIdByKey({ agencyId: client.agency_id, statusKey: disposition === 'inactive' ? 'inactive' : 'waitlist' });
  if (!statusId) throw fail('The requested client status is not configured for this agency.', 409);
  if(disposition==='inactive' && body.confirmClientClosure===true) Object.assign(details,{termination_note_required:body.termination_note_required,termination_note_provider_id:body.termination_note_provider_id || null,termination_note_not_required_reason:body.termination_note_not_required_reason || null});
  const reviewed = { to, subject: subject.trim(), text: text.trim(), reasons, disposition, details };
  const hash = createHash('sha256').update(JSON.stringify(reviewed)).digest('hex');
  const db = await d.pool.getConnection();
  const lockName = `enrollment_followup:${client.id}`;
  let locked = false;
  let action;
  let saved;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,0) AS acquired', [lockName]);
    locked = Number(lock?.acquired) === 1;
    if (!locked) throw fail('Another follow-up is being processed for this client. Please try again.', 409);
    const [[existing]] = await db.execute('SELECT * FROM client_enrollment_followups WHERE client_id=? AND request_key=?', [client.id, body.request_key]);
    action = existing;
    if (action && action.payload_hash !== hash) throw fail('This send request already contains a different reviewed email. Reopen the form to prepare another email.', 409, { followupSent: !!action.sent_at });
    if (action && ['awaiting_reply', 'reopened'].includes(action.state)) return { clientId: client.id, disposition, sent: true, communicationId: action.communication_id, alreadyCompleted: true };
    if (action && ['sending', 'delivery_unknown', 'held'].includes(action.state)) throw fail('This email needs a delivery review in Communications before another send. The client has not been made inactive.', 409, { deliveryReview: true });
    if (!action) {
      const [[pending]] = await db.execute("SELECT id FROM client_enrollment_followups WHERE client_id=? AND state IN ('sending','sent','delivery_unknown','held') LIMIT 1", [client.id]);
      if (pending) throw fail('An earlier follow-up needs to be completed or reviewed in Communications before sending another email.', 409);
      if (disposition === 'inactive') await d.assertExchangeResolvedBeforeArchive(db, client.id);
      if (disposition === 'waitlist' && client.provider_id) throw fail('Review the current provider assignment before moving this client to the school waitlist.', 409);
      const payload = { ...reviewed, before: { status: client.status, client_status_id: client.client_status_id, provider_id: client.provider_id } };
      const [insert] = await db.execute(`INSERT INTO client_enrollment_followups
        (client_id,agency_id,created_by_user_id,request_key,payload_hash,payload_json,disposition,recipient_email,reply_to_email)
        VALUES (?,?,?,?,?,?,?,?,?)`, [client.id, client.agency_id, actorUserId, body.request_key, hash, JSON.stringify(payload), disposition, to, context.replyTo]);
      action = { id: insert.insertId, state: 'prepared', payload_json: payload };
    }
    if (action.state !== 'sent') {
      await db.execute("UPDATE client_enrollment_followups SET state='sending' WHERE id=?", [action.id]);
      let receipt;
      try {
        receipt = await d.sendEmailFromIdentity({
          senderIdentityId: context.senderIdentityId, to, subject: reviewed.subject, text: reviewed.text, html,
          source: 'manual', generatedByUserId: actorUserId, clientId: client.id,
          schoolOrganizationId: client.organization_id, templateType: 'enrollment_final_followup',
          fromDisplayNameOverride: context.brand.displayName, replyToOverride: context.replyTo, portalEmailBrand: context.brand
        });
      } catch (error) {
        await db.execute("UPDATE client_enrollment_followups SET state='delivery_unknown',communication_id=? WHERE id=?", [error.communicationId || null, action.id]);
        throw fail('Email delivery was not confirmed. Review this message in Communications before sending again. The client has not been made inactive.', 409, { deliveryReview: true });
      }
      if (!receipt?.id || receipt.skipped || receipt.redirected || receipt.relay?.partial) {
        await db.execute("UPDATE client_enrollment_followups SET state='held',communication_id=? WHERE id=?", [receipt?.communicationId || null, action.id]);
        throw fail('The email was held, redirected, or not fully accepted. Review it in Communications. The client has not been made inactive.', 409, { deliveryReview: true });
      }
      action.communication_id = receipt.communicationId;
      action.state = 'sent';
      await db.execute(`UPDATE client_enrollment_followups SET state='sent',communication_id=?,internet_message_id=?,external_message_id=?,sent_at=CURRENT_TIMESTAMP WHERE id=?`,
        [receipt.communicationId || null, receipt.internetMessageId || null, receipt.id, action.id]);
    }
    await db.beginTransaction();
    try {
      const [[current]] = await db.execute('SELECT * FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [client.id, client.agency_id]);
      const before = parse(action.payload_json).before;
      if (!current || ['status', 'client_status_id', 'provider_id'].some(field => String(current[field] ?? '') !== String(before[field] ?? ''))) {
        throw fail('The email was sent, but the client’s status or assignment changed. Review the record before completing this action.', 409, { followupSent: true });
      }
      if(disposition==='inactive' && body.confirmClientClosure===true) await d.queueClientClosureNote(db,{client,actorUserId,providerId:details.termination_note_provider_id,review:{...details,terminationNote:body.closureExistingNoteId ? {id:body.closureExistingNoteId} : null}});
      const patch = disposition === 'inactive'
        ? { ...details, client_status_id: statusId, terminated_at: new Date(), terminated_by_user_id: actorUserId, roi_expires_at: null }
        : { client_status_id: statusId, status: 'PENDING_REVIEW' };
      saved = await d.Client.update(client.id, { ...patch, enrollment_followup_id: action.id }, actorUserId, { executor: db, hydrate: false, agencyId: client.agency_id });
      await db.execute(`INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,?,?,?,?,?)`,
        [client.id, actorUserId, 'client_status_id', current.client_status_id == null ? null : String(current.client_status_id), String(statusId),
          `Reviewed final follow-up sent from ${context.from}. ${disposition === 'inactive' ? 'Made inactive; a matched family reply will reopen this same enrollment.' : 'Kept on the school waitlist.'}\nReason: ${details.termination_reason || 'Not recorded'}\nLast provider: ${details.termination_last_provider_name || 'Not recorded'}\nTermination date: ${details.termination_effective_date || 'Not recorded'}`]);
      await db.execute("UPDATE client_enrollment_followups SET state='awaiting_reply',status_applied_at=CURRENT_TIMESTAMP WHERE id=?", [action.id]);
      await db.commit();
    } catch (error) { await db.rollback(); throw error; }
    if (saved?.terminationJobId) {
      try { await (await import('./clientScheduleTermination.service.js')).processClientScheduleTermination(saved.terminationJobId); }
      catch { /* Durable cleanup job will retry independently. */ }
    }
    return { clientId: client.id, disposition, sent: true, communicationId: action.communication_id };
  } catch (error) {
    if (action?.state === 'sent') error.followupSent = true;
    throw error;
  } finally {
    if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    db.release();
  }
}
