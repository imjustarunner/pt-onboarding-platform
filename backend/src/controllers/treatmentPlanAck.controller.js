import { validationResult } from 'express-validator';
import Client from '../models/Client.model.js';
import {
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
} from '../services/treatmentPlanAck.service.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';

function parseIntValue(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function appBaseUrl(req) {
  const env = String(process.env.APP_BASE_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (env) return env;
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host') || 'plottwisthq.com';
  return `${proto}://${host}`;
}

export const listTreatmentPlanAcks = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    const clientId = parseIntValue(req.params.clientId);
    const treatmentPlanId = parseIntValue(req.params.planId);
    const plan = await ensurePlanAccess({
      reqUser: req.user,
      agencyId,
      clientId,
      treatmentPlanId
    });
    const acknowledgments = await listAcknowledgmentsForPlan({
      agencyId,
      clientId,
      treatmentPlanId
    });
    return res.json({
      plan: {
        id: plan.id,
        title: plan.title,
        status: plan.status,
        client_ack_status: plan.client_ack_status || null,
        client_ack_at: plan.client_ack_at || null
      },
      acknowledgments
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const shareTreatmentPlanToDashboard = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.params.clientId);
    const treatmentPlanId = parseIntValue(req.params.planId);
    await ensurePlanAccess({ reqUser: req.user, agencyId, clientId, treatmentPlanId });
    const link = await createDashboardShare({
      agencyId,
      clientId,
      treatmentPlanId,
      actorUserId: req.user.id,
      recipientKind: req.body.recipientKind === 'client' ? 'client' : 'guardian',
      recipientUserId: parseIntValue(req.body.recipientUserId),
      recipientName: req.body.recipientName || null
    });
    return res.status(201).json({
      link,
      message: 'Treatment plan shared to the client/guardian dashboard for e-signature.'
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const emailTreatmentPlanAckLink = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.params.clientId);
    const treatmentPlanId = parseIntValue(req.params.planId);
    await ensurePlanAccess({ reqUser: req.user, agencyId, clientId, treatmentPlanId });
    const link = await createEmailLink({
      agencyId,
      clientId,
      treatmentPlanId,
      actorUserId: req.user.id,
      recipientEmail: req.body.email || req.body.recipientEmail,
      recipientName: req.body.recipientName || null,
      recipientKind: req.body.recipientKind === 'guardian' ? 'guardian' : 'client'
    });
    const url = `${appBaseUrl(req)}${publicSigningPath(link.public_key)}`;
    let emailed = false;
    let emailError = null;
    try {
      const { resolvePreferredSenderIdentityForAgency } = await import(
        '../services/emailSenderIdentityResolver.service.js'
      );
      let senderIdentityId = parseIntValue(req.body.senderIdentityId);
      if (!senderIdentityId) {
        const identity = await resolvePreferredSenderIdentityForAgency({ agencyId });
        senderIdentityId = identity?.id || null;
      }
      if (!senderIdentityId) {
        throw new Error('No email sender identity configured for this agency. Copy the signing link below.');
      }
      const client = await Client.findById(clientId);
      const clientLabel = client?.full_name || client?.initials || `Client ${clientId}`;
      await sendEmailFromIdentity({
        senderIdentityId,
        to: link.recipient_email,
        subject: 'Please review and sign the treatment plan',
        html: `
          <p>Hello${link.recipient_name ? ` ${link.recipient_name}` : ''},</p>
          <p>Please review and digitally sign the treatment plan for <strong>${clientLabel}</strong>.</p>
          <p><a href="${url}">Open treatment plan to sign</a></p>
          <p>This link expires in 14 days.</p>
        `,
        text: `Please review and sign the treatment plan: ${url}`,
        clientId,
        generatedByUserId: req.user?.id || null,
        source: 'auto',
        linkUrl: url
      });
      emailed = true;
      await markEmailSent(link.id, { actorUserId: req.user.id });
    } catch (mailErr) {
      emailError = mailErr?.message || 'Email send failed';
      console.warn('[emailTreatmentPlanAckLink]', emailError);
    }
    const TreatmentPlanAckLink = (await import('../models/TreatmentPlanAckLink.model.js')).default;
    return res.status(201).json({
      link: await TreatmentPlanAckLink.findById(link.id),
      signingUrl: url,
      emailed,
      emailError
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const startTreatmentPlanAckSession = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.params.clientId);
    const treatmentPlanId = parseIntValue(req.params.planId);
    await ensurePlanAccess({ reqUser: req.user, agencyId, clientId, treatmentPlanId });
    const actorName = [req.user.first_name, req.user.last_name].filter(Boolean).join(' ').trim()
      || req.user.email
      || 'Provider';
    const link = await startProviderSession({
      agencyId,
      clientId,
      treatmentPlanId,
      actorUserId: req.user.id,
      actorName
    });
    return res.status(201).json({
      link,
      message: 'In-person signing session started. Have the client sign with you as witness.'
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const completeTreatmentPlanAckSession = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.params.clientId);
    const treatmentPlanId = parseIntValue(req.params.planId);
    const linkId = parseIntValue(req.body.linkId || req.params.linkId);
    await ensurePlanAccess({ reqUser: req.user, agencyId, clientId, treatmentPlanId });
    const actorName = [req.user.first_name, req.user.last_name].filter(Boolean).join(' ').trim()
      || 'Provider';
    const link = await signAcknowledgment({
      linkId,
      signedByName: req.body.signedByName || req.body.clientName,
      signatureDataUrl: req.body.signatureDataUrl || req.body.signature,
      witnessUserId: req.user.id,
      witnessName: actorName,
      actorUserId: req.user.id,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    if (Number(link.treatment_plan_id) !== treatmentPlanId || Number(link.client_id) !== clientId) {
      return res.status(404).json({ error: { message: 'Acknowledgment session not found for this plan' } });
    }
    return res.json({ link, message: 'Treatment plan acknowledged with provider as witness.' });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const attachPrintedTreatmentPlanAck = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.params.clientId);
    const treatmentPlanId = parseIntValue(req.params.planId);
    await ensurePlanAccess({ reqUser: req.user, agencyId, clientId, treatmentPlanId });
    const link = await attachPrintUpload({
      agencyId,
      clientId,
      treatmentPlanId,
      actorUserId: req.user.id,
      phiDocumentId: req.body.phiDocumentId || req.body.documentId,
      signedByName: req.body.signedByName || null
    });
    return res.status(201).json({
      link,
      message: 'Printed signed treatment plan attached.'
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** Public: open email/dashboard token link */
export const getPublicTreatmentPlanAck = async (req, res, next) => {
  try {
    const { link, plan } = await openPublicLink(req.params.publicKey, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    // Scrub: only goals/objectives text for signing view — no internal ratings
    const safePlan = plan
      ? {
        id: plan.id,
        title: plan.title,
        status: plan.status,
        effective_date: plan.effective_date,
        diagnostic_justification: plan.diagnostic_justification,
        discharge_plan: plan.discharge_plan,
        goals: (plan.goals || []).map((g) => ({
          goal_index: g.goal_index,
          goal_text: g.goal_text,
          projected_completion: g.projected_completion,
          objectives: (g.objectives || []).map((o) => ({
            objective_index: o.objective_index,
            objective_text: o.objective_text,
            scale_current: o.scale_current,
            scale_target: o.scale_target,
            scale_direction: o.scale_direction,
            measurement_method: o.measurement_method
          }))
        }))
      }
      : null;
    return res.json({
      link: {
        id: link.id,
        status: link.status,
        channel: link.channel,
        recipient_name: link.recipient_name,
        recipient_kind: link.recipient_kind,
        signed_at: link.signed_at,
        signed_by_name: link.signed_by_name,
        expires_at: link.expires_at
      },
      plan: safePlan
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const viewPublicTreatmentPlanAck = async (req, res, next) => {
  try {
    const link = await recordViewed(req.params.publicKey, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    return res.json({ ok: true, status: link.status });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const signPublicTreatmentPlanAck = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }
    const link = await signAcknowledgment({
      publicKey: req.params.publicKey,
      signedByName: req.body.signedByName || req.body.name,
      signatureDataUrl: req.body.signatureDataUrl || req.body.signature,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    return res.json({
      link: {
        id: link.id,
        status: link.status,
        signed_at: link.signed_at,
        signed_by_name: link.signed_by_name
      },
      message: 'Thank you. Your acknowledgment has been recorded.'
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
