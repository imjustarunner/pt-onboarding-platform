import Client from '../models/Client.model.js';
import User from '../models/User.model.js';
import {
  getClientOnboardingChecklist,
  updateClientOnboardingDocs,
  markPaperPacketSignatureReceived,
  acknowledgeRoiStaffOnboarding,
  updateOnboardingRoiExpiration,
  completeStaffOnboarding,
  listOnboardingQueue,
  listProviderOnboardingQueue,
  isAssignedProvider
} from '../services/clientOnboardingChecklist.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

async function requireClientAccess(req, clientId) {
  const client = await Client.findById(clientId, { includeSensitive: true });
  if (!client) return { ok: false, status: 404, message: 'Client not found' };
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return { ok: true, client };
  const orgs = await User.getAgencies(req.user.id);
  const ids = (orgs || []).map((o) => Number(o.id));
  if (ids.includes(Number(client.agency_id)) || ids.includes(Number(client.organization_id))) {
    return { ok: true, client };
  }
  if (['provider', 'provider_plus', 'intern'].includes(role)) {
    const assigned = await isAssignedProvider(req.user.id, clientId);
    if (assigned) return { ok: true, client };
  }
  return { ok: false, status: 403, message: 'Access denied' };
}

function isProviderRole(role) {
  return ['provider', 'provider_plus', 'intern', 'supervisor'].includes(String(role || '').toLowerCase());
}

function isBackoffice(role) {
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(
    String(role || '').toLowerCase()
  );
}

/**
 * GET /api/clients/:id/onboarding-checklist
 */
export const getOnboardingChecklist = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    const access = await requireClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const checklist = await getClientOnboardingChecklist(clientId);
    res.json(checklist);
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /api/clients/:id/onboarding-docs
 * Deprecated: documents now use the real packet checklist via document-status.
 */
export const putOnboardingDocs = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const access = await requireClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const checklist = await updateClientOnboardingDocs({
      clientId,
      items: req.body?.items,
      roiExpiresAt: req.body?.roi_expires_at,
      actorUserId: req.user?.id || null
    });
    res.json(checklist);
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/clients/:id/onboarding/mark-packet-signature
 * Marks all paper-packet signature checklist items received (everything except ROI).
 */
export const postMarkPacketSignature = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const access = await requireClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    try {
      const checklist = await markPaperPacketSignatureReceived({
        clientId,
        actorUserId: req.user?.id || null
      });
      await logAuditEvent(req, {
        actionType: 'client_paper_packet_signature_received',
        agencyId: access.client.agency_id || null,
        metadata: { clientId, excludes: 'roi' }
      });
      res.json(checklist);
    } catch (err) {
      if (err?.status) return res.status(err.status).json({ error: { message: err.message } });
      throw err;
    }
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/clients/:id/onboarding/acknowledge-roi-staff
 * Staff confirms ROI permissions were reviewed against the signed form.
 */
export const postAcknowledgeRoiStaff = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const access = await requireClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    try {
      const checklist = await acknowledgeRoiStaffOnboarding({
        clientId,
        roiExpiresAt: req.body?.roi_expires_at,
        actorUserId: req.user?.id || null
      });
      await logAuditEvent(req, {
        actionType: 'client_roi_staff_onboarding_acknowledged',
        agencyId: access.client.agency_id || null,
        metadata: { clientId }
      });
      res.json(checklist);
    } catch (err) {
      if (err?.status) return res.status(err.status).json({ error: { message: err.message } });
      throw err;
    }
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/clients/:id/onboarding/complete-staff
 */
export const postCompleteStaffOnboarding = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const access = await requireClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    try {
      const checklist = await completeStaffOnboarding({
        clientId,
        actorUserId: req.user?.id || null
      });
      await logAuditEvent(req, {
        actionType: 'client_staff_onboarding_completed',
        agencyId: access.client.agency_id || null,
        metadata: { clientId, phase: checklist.phase }
      });
      res.json({ ok: true, checklist });
    } catch (err) {
      if (err?.status) return res.status(err.status).json({ error: { message: err.message } });
      throw err;
    }
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /api/clients/:id/onboarding/roi-expiration
 */
export const putOnboardingRoiExpiration = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const access = await requireClientAccess(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    try {
      const checklist = await updateOnboardingRoiExpiration({
        clientId,
        roiExpiresAt: req.body?.roi_expires_at,
        actorUserId: req.user?.id || null
      });
      await logAuditEvent(req, {
        actionType: 'client_onboarding_roi_expiration_updated',
        agencyId: access.client.agency_id || null,
        metadata: {
          clientId,
          roiExpiresAt: req.body?.roi_expires_at || null,
          roiEffectiveDate: req.body?.roi_effective_date || null,
          roiTermMonths: req.body?.roi_term_months ?? null
        }
      });
      res.json(checklist);
    } catch (err) {
      if (err?.status) return res.status(err.status).json({ error: { message: err.message } });
      throw err;
    }
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/clients/provider-onboarding-queue?agencyId=
 */
export const getProviderOnboardingQueue = async (req, res, next) => {
  try {
    if (!isProviderRole(req.user?.role) && !isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Provider access required' } });
    }
    const agencyId = Number(req.query.agencyId || req.user?.agency_id || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const providerUserId = Number(req.query.providerUserId || req.user?.id || 0);
    if (!providerUserId) return res.status(400).json({ error: { message: 'providerUserId is required' } });
    const role = String(req.user?.role || '').toLowerCase();
    if (isProviderRole(role) && Number(req.user?.id) !== providerUserId) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!isProviderRole(role) && role !== 'super_admin') {
      const orgs = await User.getAgencies(req.user.id);
      if (!(orgs || []).some((o) => Number(o.id) === agencyId)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    const rows = await listProviderOnboardingQueue({
      agencyId,
      providerUserId,
      limit: Number(req.query.limit) || 100
    });
    res.json({ agency_id: agencyId, provider_user_id: providerUserId, clients: rows });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/clients/onboarding-queue?agencyId=&scope=school|office|all
 */
export const getOnboardingQueue = async (req, res, next) => {
  try {
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const agencyId = Number(req.query.agencyId || req.user?.agency_id || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'super_admin') {
      const orgs = await User.getAgencies(req.user.id);
      if (!(orgs || []).some((o) => Number(o.id) === agencyId)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    const scope = String(req.query.scope || 'all').toLowerCase();
    const rows = await listOnboardingQueue({ agencyId, scope, limit: Number(req.query.limit) || 100 });
    res.json({ agency_id: agencyId, scope, clients: rows });
  } catch (e) {
    next(e);
  }
};
