import {
  createAndSendDiscoveryInvite,
  getPublicDiscoveryPayload,
  selectDiscoveryOption,
  getDiscoveryVideoToken
} from '../services/discoverySession.service.js';
import DiscoverySession from '../models/DiscoverySession.model.js';
import { requirePractitionerCapability } from '../utils/practitionerAssistantAccess.js';

function parseOptions(body) {
  const raw = body?.options || body?.proposedOptions || [];
  if (!Array.isArray(raw)) return [];
  return raw;
}

export const createDiscoverySession = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || req.user?.agencyId || req.headers['x-agency-id'] || 0);
    const providerId = Number(req.body?.providerId || req.user?.id || 0);
    const clientId = Number(req.body?.clientId || 0);
    if (!agencyId || !providerId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId, providerId, and clientId are required' } });
    }
    await requirePractitionerCapability(req, agencyId, 'discovery');
    const options = parseOptions(req.body);
    if (options.length < 1) {
      return res.status(400).json({ error: { message: 'Provide at least one time option' } });
    }

    const result = await createAndSendDiscoveryInvite({
      agencyId,
      providerId,
      clientId,
      options,
      countdownMinutes: Number(req.body?.countdownMinutes || 15),
      notes: req.body?.notes || null,
      createdByUserId: req.user?.id || providerId,
      publicAppointmentRequestId: req.body?.publicAppointmentRequestId || null,
      sendEmail: req.body?.sendEmail !== false,
      clientEmailOverride: req.body?.clientEmail || null,
      clientNameOverride: req.body?.clientName || null
    });

    res.status(201).json({
      ok: true,
      discoverySession: result.session,
      joinUrl: result.joinUrl
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listDiscoverySessions = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.user?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    const rows = await DiscoverySession.listForAgency({
      agencyId,
      clientId: req.query.clientId ? Number(req.query.clientId) : null,
      status: req.query.status || null,
      limit: Number(req.query.limit || 50)
    });
    res.json({ ok: true, discoverySessions: rows });
  } catch (e) {
    next(e);
  }
};

export const getPublicDiscovery = async (req, res, next) => {
  try {
    const payload = await getPublicDiscoveryPayload(req.params.token);
    if (!payload) return res.status(404).json({ error: { message: 'Invite not found' } });
    if (payload.expired) return res.status(410).json({ error: { message: 'Invite expired' } });
    res.json({ ok: true, ...payload });
  } catch (e) {
    next(e);
  }
};

export const postPublicDiscoverySelect = async (req, res, next) => {
  try {
    const result = await selectDiscoveryOption({
      token: req.params.token,
      optionIndex: req.body?.optionIndex
    });
    res.json({
      ok: true,
      alreadyBooked: !!result.alreadyBooked,
      discoverySession: result.session,
      joinUrl: result.joinUrl || null
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getPublicDiscoveryVideoToken = async (req, res, next) => {
  try {
    const video = await getDiscoveryVideoToken({
      token: req.params.token,
      identityLabel: String(req.query.role || 'guest')
    });
    res.json({ ok: true, ...video });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
