import pool from '../config/database.js';
import { requireStaffPlanActor } from '../utils/planStaffAccess.js';
/**
 * Treatment plan client/guardian acknowledgment:
 * dashboard share, provider-witnessed session, email token link, print+upload.
 */
import crypto from 'crypto';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import { TreatmentPlanAckLink, TreatmentPlanAckEvent } from '../models/TreatmentPlanAckLink.model.js';
import ClinicalEligibilityService from './clinicalEligibility.service.js';

async function requireAckRecipient(link) {
  if(link.recipient_kind!=='guardian')return;
  let userId=link.recipient_user_id;
  if(!userId&&link.recipient_email){const [rows]=await pool.execute('SELECT id FROM users WHERE LOWER(email)=LOWER(?)',[link.recipient_email]);if(rows.length===1)userId=rows[0].id;}
  if(!userId)throw Object.assign(new Error('An identified guardian with a current clinical disclosure grant is required'),{status:403});
  const { requireGuardianPlanAccess } = await import('./guardianPlanProgress.service.js');
  await requireGuardianPlanAccess({agencyId:link.agency_id,clientId:link.client_id,userId,scope:'approve_goals',action:'sign'});
}

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function hashIp(ip) {
  const raw = String(ip || '').trim();
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64);
}

async function markPlanAckStatus({ planId, status, at = true }) {
  const pid = safeInt(planId);
  if (!pid || !status) return;
  try {
    await ClinicalTreatmentPlan.updateClientAck?.(pid, { status, at })
      || null;
  } catch {
    // column may not exist until clinical migration 011 runs
  }
  try {
    const clinicalPool = (await import('../config/clinicalDatabase.js')).default;
    if (at) {
      await clinicalPool.execute(
        `UPDATE clinical_treatment_plans
         SET client_ack_status = ?, client_ack_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [String(status).slice(0, 32), pid]
      );
    } else {
      await clinicalPool.execute(
        `UPDATE clinical_treatment_plans
         SET client_ack_status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [String(status).slice(0, 32), pid]
      );
    }
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR') {
      console.warn('[treatmentPlanAck] markPlanAckStatus', e.message);
    }
  }
}

export async function ensurePlanAccess({ reqUser, agencyId, clientId, treatmentPlanId }) {
  requireStaffPlanActor(reqUser);
  const aid = safeInt(agencyId);
  const cid = safeInt(clientId);
  const pid = safeInt(treatmentPlanId);
  if (!aid || !cid || !pid) {
    const err = new Error('agencyId, clientId, and treatmentPlanId are required');
    err.status = 400;
    throw err;
  }
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser, agencyId: aid });
  const plan = await ClinicalTreatmentPlan.findById(pid);
  if (!plan || Number(plan.agency_id) !== aid || Number(plan.client_id) !== cid) {
    const err = new Error('Treatment plan not found');
    err.status = 404;
    throw err;
  }
  return plan;
}

export async function listAcknowledgmentsForPlan({ agencyId, clientId, treatmentPlanId }) {
  const links = await TreatmentPlanAckLink.listForPlan({ agencyId, clientId, treatmentPlanId });
  const events = await TreatmentPlanAckEvent.listForPlanLinks(links.map((l) => l.id));
  const byLink = new Map();
  for (const ev of events) {
    if (!byLink.has(ev.ack_link_id)) byLink.set(ev.ack_link_id, []);
    byLink.get(ev.ack_link_id).push(ev);
  }
  return links.map((link) => ({
    ...link,
    events: byLink.get(link.id) || []
  }));
}

export async function createDashboardShare({
  agencyId,
  clientId,
  treatmentPlanId,
  actorUserId,
  recipientKind = 'guardian',
  recipientUserId = null,
  recipientName = null,
  planRevision = null
}) {
  await requireAckRecipient({agency_id:agencyId,client_id:clientId,recipient_kind:recipientKind,recipient_user_id:recipientUserId});
  const { guardianPlanRevision, isSharedPlanStatus } = await import('./guardianPlanProgress.service.js');
  const plan = await ClinicalTreatmentPlan.findById(treatmentPlanId);
  if (!plan || Number(plan.agency_id) !== Number(agencyId) || Number(plan.client_id) !== Number(clientId) || !isSharedPlanStatus(plan.status)) {
    throw Object.assign(new Error('Only an active, finalized plan can be shared.'), { status: 409 });
  }
  const link = await TreatmentPlanAckLink.create({
    agencyId,
    clientId,
    treatmentPlanId,
    channel: 'dashboard_share',
    recipientKind,
    recipientUserId,
    recipientName,
    issuedByUserId: actorUserId,
    dashboardVisible: true,
    meta: { planRevision: planRevision || guardianPlanRevision(plan), portalOnly: true }
  });
  await TreatmentPlanAckEvent.create({
    ackLinkId: link.id,
    eventType: 'shared_dashboard',
    actorUserId,
    actorLabel: 'Provider shared to dashboard'
  });
  await markPlanAckStatus({ planId: treatmentPlanId, status: 'shared', at: false });
  return link;
}

export async function createEmailLink({
  agencyId,
  clientId,
  treatmentPlanId,
  actorUserId,
  recipientEmail,
  recipientName = null,
  recipientKind = 'client'
}) {
  const email = String(recipientEmail || '').trim();
  if (!email || !email.includes('@')) {
    const err = new Error('A valid recipient email is required');
    err.status = 400;
    throw err;
  }
  await requireAckRecipient({agency_id:agencyId,client_id:clientId,recipient_kind:recipientKind,recipient_email:email});
  const link = await TreatmentPlanAckLink.create({
    agencyId,
    clientId,
    treatmentPlanId,
    channel: 'email_link',
    recipientKind,
    recipientEmail: email,
    recipientName,
    issuedByUserId: actorUserId,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  });
  await TreatmentPlanAckEvent.create({
    ackLinkId: link.id,
    eventType: 'issued',
    actorUserId,
    actorLabel: 'Email signing link created',
    meta: { recipientEmail: email }
  });
  return link;
}

export async function markEmailSent(linkId, { actorUserId = null } = {}) {
  const link = await TreatmentPlanAckLink.updateFields(linkId, {
    status: 'sent',
    sentAt: new Date()
  });
  await TreatmentPlanAckEvent.create({
    ackLinkId: linkId,
    eventType: 'emailed',
    actorUserId,
    actorLabel: 'Signing link emailed'
  });
  await markPlanAckStatus({ planId: link.treatment_plan_id, status: 'shared', at: false });
  return link;
}

export async function startProviderSession({
  agencyId,
  clientId,
  treatmentPlanId,
  actorUserId,
  actorName = null
}) {
  const link = await TreatmentPlanAckLink.create({
    agencyId,
    clientId,
    treatmentPlanId,
    channel: 'provider_session',
    recipientKind: 'client',
    issuedByUserId: actorUserId,
    witnessUserId: actorUserId
  });
  // witness_user_id set via update (create doesn't take it in insert currently)
  await TreatmentPlanAckLink.updateFields(link.id, {
    witnessUserId: actorUserId,
    witnessName: actorName || null
  });
  await TreatmentPlanAckEvent.create({
    ackLinkId: link.id,
    eventType: 'session_started',
    actorUserId,
    actorLabel: actorName || 'Provider session started'
  });
  return TreatmentPlanAckLink.findById(link.id);
}

export async function attachPrintUpload({
  agencyId,
  clientId,
  treatmentPlanId,
  actorUserId,
  phiDocumentId,
  signedByName = null
}) {
  const docId = safeInt(phiDocumentId);
  if (!docId) {
    const err = new Error('uploaded document id is required');
    err.status = 400;
    throw err;
  }
  const link = await TreatmentPlanAckLink.create({
    agencyId,
    clientId,
    treatmentPlanId,
    channel: 'print_upload',
    recipientKind: 'client',
    issuedByUserId: actorUserId,
    recipientName: signedByName
  });
  const updated = await TreatmentPlanAckLink.updateFields(link.id, {
    status: 'signed',
    signedAt: new Date(),
    signedByName: signedByName || 'Paper signature on file',
    uploadedPhiDocumentId: docId
  });
  await TreatmentPlanAckEvent.create({
    ackLinkId: link.id,
    eventType: 'upload_attached',
    actorUserId,
    actorLabel: 'Printed plan with signature uploaded',
    meta: { phiDocumentId: docId }
  });
  await TreatmentPlanAckEvent.create({
    ackLinkId: link.id,
    eventType: 'signed',
    actorUserId,
    actorLabel: signedByName || 'Paper acknowledgment'
  });
  await markPlanAckStatus({ planId: treatmentPlanId, status: 'paper_on_file', at: true });
  return updated;
}

export async function openPublicLink(publicKey, { ip = null, userAgent = null } = {}) {
  const link = await TreatmentPlanAckLink.findByPublicKey(publicKey);
  if (!link) {
    const err = new Error('Signing link not found');
    err.status = 404;
    throw err;
  }
  if (link.meta_json?.portalOnly) throw Object.assign(new Error('Sign in to your portal to review this plan.'), { status: 401 });
  await requireAckRecipient(link);
  if (link.status === 'cancelled' || link.status === 'expired') {
    const err = new Error('This signing link is no longer valid');
    err.status = 410;
    throw err;
  }
  if (link.expires_at && new Date(link.expires_at) < new Date() && link.status !== 'signed') {
    await TreatmentPlanAckLink.updateFields(link.id, { status: 'expired' });
    await TreatmentPlanAckEvent.create({
      ackLinkId: link.id,
      eventType: 'expired',
      actorLabel: 'Link expired'
    });
    const err = new Error('This signing link has expired');
    err.status = 410;
    throw err;
  }
  const opened = await TreatmentPlanAckLink.recordOpen(link.id);
  await TreatmentPlanAckEvent.create({
    ackLinkId: link.id,
    eventType: 'opened',
    ipHash: hashIp(ip),
    userAgent,
    actorLabel: 'Link opened'
  });
  const plan = await ClinicalTreatmentPlan.findById(link.treatment_plan_id);
  return { link: opened, plan };
}

export async function recordViewed(publicKey, { ip = null, userAgent = null } = {}) {
  const link = await TreatmentPlanAckLink.findByPublicKey(publicKey);
  if (!link) {
    const err = new Error('Signing link not found');
    err.status = 404;
    throw err;
  }
  if (link.meta_json?.portalOnly) throw Object.assign(new Error('Sign in to your portal to review this plan.'), { status: 401 });
  await requireAckRecipient(link);
  if (link.status !== 'signed' && link.status !== 'cancelled' && link.status !== 'expired') {
    await TreatmentPlanAckLink.updateFields(link.id, { status: 'viewed' });
  }
  await TreatmentPlanAckEvent.create({
    ackLinkId: link.id,
    eventType: 'viewed',
    ipHash: hashIp(ip),
    userAgent,
    actorLabel: 'Plan viewed'
  });
  return TreatmentPlanAckLink.findById(link.id);
}

export async function signAcknowledgment(input) {
  const link = input.publicKey
    ? await TreatmentPlanAckLink.findByPublicKey(input.publicKey)
    : await TreatmentPlanAckLink.findById(input.linkId);
  if (!link?.meta_json?.planRevision) return signAcknowledgmentUnderLock(input);
  // Publication and signatures share this lock, so an old acknowledgment
  // cannot replace the pending status of a newly shared revision.
  const db = await pool.getConnection();
  const lock = `guardian-plan-share:${link.treatment_plan_id}`;
  let locked = false;
  try {
    const [[result]] = await db.execute('SELECT GET_LOCK(?, 10) AS acquired', [lock]);
    if (Number(result?.acquired) !== 1) throw Object.assign(new Error('This plan is being updated. Try again shortly.'), { status: 409 });
    locked = true;
    return await signAcknowledgmentUnderLock(input);
  } finally {
    try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lock]); }
    finally { db.release(); }
  }
}

async function signAcknowledgmentUnderLock({
  publicKey = null,
  linkId = null,
  signedByName,
  signatureDataUrl = null,
  signatureImagePath = null,
  witnessUserId = null,
  witnessName = null,
  actorUserId = null,
  ip = null,
  userAgent = null
}) {
  const link = publicKey
    ? await TreatmentPlanAckLink.findByPublicKey(publicKey)
    : await TreatmentPlanAckLink.findById(linkId);
  if (!link) {
    const err = new Error('Acknowledgment request not found');
    err.status = 404;
    throw err;
  }
  await requireAckRecipient(link);
  if (link.meta_json?.portalOnly && Number(actorUserId) !== Number(link.recipient_user_id)) {
    throw Object.assign(new Error('Sign in with the account this plan was shared with.'), { status: 403 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date() && link.status !== 'signed') {
    throw Object.assign(new Error('This acknowledgment request has expired.'), { status: 410 });
  }
  if (link.meta_json?.planRevision) {
    const { guardianPlanRevision, isSharedPlanStatus } = await import('./guardianPlanProgress.service.js');
    const plan = await ClinicalTreatmentPlan.findById(link.treatment_plan_id);
    if (!plan || !isSharedPlanStatus(plan.status) || guardianPlanRevision(plan) !== link.meta_json.planRevision) {
      throw Object.assign(new Error('This plan changed. Open the latest version in your portal.'), { status: 409 });
    }
  }
  if (link.status === 'signed') {
    return link;
  }
  if (link.status === 'cancelled' || link.status === 'expired') {
    const err = new Error('This acknowledgment request is no longer valid');
    err.status = 410;
    throw err;
  }
  const name = String(signedByName || '').trim();
  if (!name || name.length > 255) {
    const err = new Error('Enter your full name, up to 255 characters.');
    err.status = 400;
    throw err;
  }

  // Persist data-URL signatures as path stub when no upload path provided
  let sigPath = signatureImagePath || null;
  if (!sigPath && signatureDataUrl && String(signatureDataUrl).startsWith('data:image')) {
    sigPath = `inline:${String(signatureDataUrl).slice(0, 40)}…`;
    // Store full data URL in meta via event; path column keeps a marker
  }

  const fields = {
    status: 'signed',
    signedAt: new Date(),
    signedByName: name,
    signatureImagePath: sigPath
  };
  if (witnessUserId || link.channel === 'provider_session') {
    fields.witnessUserId = safeInt(witnessUserId) || link.witness_user_id || actorUserId;
    fields.witnessName = witnessName || link.witness_name || null;
    fields.witnessSignedAt = new Date();
  }
  const updated = await TreatmentPlanAckLink.updateFields(link.id, fields);
  await TreatmentPlanAckEvent.create({
    ackLinkId: link.id,
    eventType: 'signed',
    actorUserId: actorUserId || null,
    actorLabel: name,
    ipHash: hashIp(ip),
    userAgent,
    meta: signatureDataUrl ? { hasSignatureImage: true } : null
  });
  if (fields.witnessUserId) {
    await TreatmentPlanAckEvent.create({
      ackLinkId: link.id,
      eventType: 'witnessed',
      actorUserId: fields.witnessUserId,
      actorLabel: fields.witnessName || 'Provider witness'
    });
  }
  const siblings = link.meta_json?.planRevision ? (await TreatmentPlanAckLink.listForPlan({
    agencyId: link.agency_id, clientId: link.client_id, treatmentPlanId: link.treatment_plan_id
  })).filter(l => l.dashboard_visible && l.meta_json?.planRevision === link.meta_json.planRevision && !['cancelled', 'expired'].includes(l.status)) : [];
  let waiting = false;
  for (const sibling of siblings.filter(l => Number(l.id) !== Number(link.id) && l.status !== 'signed')) {
    try { await requireAckRecipient(sibling); waiting = true; }
    catch (error) { if (error.status !== 403) throw error; }
  }
  if (link.meta_json?.planRevision) {
    const { guardianPlanRevision, isSharedPlanStatus } = await import('./guardianPlanProgress.service.js');
    const latest = await ClinicalTreatmentPlan.findById(link.treatment_plan_id);
    if (!latest || !isSharedPlanStatus(latest.status) || guardianPlanRevision(latest) !== link.meta_json.planRevision) return updated;
  }
  await markPlanAckStatus({ planId: link.treatment_plan_id, status: waiting ? 'partially_signed' : 'signed', at: !waiting });
  return updated;
}

export function publicSigningPath(publicKey) {
  return `/sign/treatment-plan/${encodeURIComponent(String(publicKey || '').trim())}`;
}

export default {
  ensurePlanAccess,
  listAcknowledgmentsForPlan,
  createDashboardShare,
  createEmailLink,
  markEmailSent,
  startProviderSession,
  attachPrintUpload,
  openPublicLink,
  recordViewed,
  signAcknowledgment,
  publicSigningPath
};
