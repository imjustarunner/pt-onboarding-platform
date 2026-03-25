import {
  getGuardianWaiverProfileForGuardian,
  listWaiverAuditForClient,
  upsertGuardianWaiverSection
} from '../services/guardianWaivers.service.js';
import { GUARDIAN_WAIVER_SECTION_KEYS } from '../utils/guardianWaivers.utils.js';

function clientIp(req) {
  return req.ip || req.headers['x-forwarded-for']?.split?.(',')?.[0]?.trim() || null;
}

function formatProfileRow(profile) {
  if (!profile) return null;
  let sections = profile.sections_json;
  if (typeof sections === 'string') {
    try {
      sections = JSON.parse(sections);
    } catch {
      sections = {};
    }
  }
  if (!sections || typeof sections !== 'object') sections = {};
  return { id: profile.id, sections, updatedAt: profile.updated_at };
}

export const getMyClientWaiverProfile = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
    const data = await getGuardianWaiverProfileForGuardian({
      guardianUserId: req.user.id,
      clientId
    });
    res.json(data);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: { message: e.message, code: e.code } });
    }
    next(e);
  }
};

export const putMyClientWaiverSection = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    const sectionKey = String(req.params.sectionKey || '').trim();
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
    const {
      payload,
      signatureData,
      consentAcknowledged,
      intentToSign
    } = req.body || {};

    const profile = await upsertGuardianWaiverSection({
      guardianUserId: req.user.id,
      clientId,
      sectionKey,
      payload,
      action: 'update',
      signatureData,
      consentAcknowledged,
      intentToSign,
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'] || null
    });
    res.json({ profile: formatProfileRow(profile) });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: { message: e.message, code: e.code } });
    }
    next(e);
  }
};

export const postMyClientWaiverSectionCreate = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    const sectionKey = String(req.params.sectionKey || '').trim();
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
    const { payload, signatureData, consentAcknowledged, intentToSign } = req.body || {};

    const profile = await upsertGuardianWaiverSection({
      guardianUserId: req.user.id,
      clientId,
      sectionKey,
      payload,
      action: 'create',
      signatureData,
      consentAcknowledged,
      intentToSign,
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'] || null
    });
    res.status(201).json({ profile: formatProfileRow(profile) });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: { message: e.message, code: e.code } });
    }
    next(e);
  }
};

export const postMyClientWaiverSectionRevoke = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    const sectionKey = String(req.params.sectionKey || '').trim();
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
    const { signatureData, consentAcknowledged, intentToSign } = req.body || {};

    const profile = await upsertGuardianWaiverSection({
      guardianUserId: req.user.id,
      clientId,
      sectionKey,
      payload: null,
      action: 'revoke',
      signatureData,
      consentAcknowledged,
      intentToSign,
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'] || null
    });
    res.json({ profile: formatProfileRow(profile) });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: { message: e.message, code: e.code } });
    }
    next(e);
  }
};

/** Admin / backoffice: audit trail for a client (all guardians). */
export const getClientGuardianWaiverAudit = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Client id is required' } });

    const { profiles, history } = await listWaiverAuditForClient(clientId);
    const safeHistory = (history || []).map((h) => ({
      ...h,
      signature_data: h.signature_data ? `${String(h.signature_data).slice(0, 48)}…` : null
    }));
    res.json({
      sectionKeys: GUARDIAN_WAIVER_SECTION_KEYS,
      profiles,
      history: safeHistory
    });
  } catch (e) {
    next(e);
  }
};
