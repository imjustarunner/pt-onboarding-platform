import User from '../models/User.model.js';
import {
  summarizeProviders,
  createProviderActionLink,
  buildPdfForProvider,
  getLinkDetail,
  getPublicBundle,
  getLinkByToken,
  isLinkUsable,
  recordLinkOpen,
  recordLinkHeartbeat,
  recordClientCompleted,
  assertClientOnLink,
  listProviderActionClients
} from '../services/providerActionOutreach.service.js';
import {
  getDisposition,
  saveSpringUpdate,
  saveFallConfirmation
} from '../services/clientYearDisposition.service.js';
import Client from '../models/Client.model.js';
import { updateClientComplianceChecklist } from './client.controller.js';
import { setClientAssignedDay } from './schoolSoftSchedule.controller.js';
import { computeCurrentSchoolYearLabel } from '../utils/schoolYear.js';
import { currentSchoolYearLabelFromCalendar } from '../utils/schoolYearCalendar.js';

function agencyIdFrom(req) {
  const raw = req.body?.agencyId ?? req.query?.agencyId ?? req.headers['x-agency-id'];
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function isBackoffice(role) {
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(
    String(role || '').toLowerCase()
  );
}

async function assertAgency(req, agencyId) {
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return;
  const orgs = await User.getAgencies(req.user.id);
  if (!(orgs || []).some((o) => Number(o.id) === Number(agencyId))) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
}

function handleErr(err, res, next) {
  if (err?.status) {
    return res.status(err.status).json({ error: { message: err.message, code: err.code } });
  }
  return next(err);
}

export async function listProviderActionSummaries(req, res, next) {
  try {
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const agencyId = agencyIdFrom(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await assertAgency(req, agencyId);
    const providers = await summarizeProviders({
      agencyId,
      scope: String(req.query.scope || 'school')
    });
    res.json({ agencyId, providers });
  } catch (err) {
    handleErr(err, res, next);
  }
}

export async function createProviderActionLinkHandler(req, res, next) {
  try {
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const agencyId = agencyIdFrom(req);
    const providerUserId = Number(req.params.providerUserId || req.body?.providerUserId || 0);
    if (!agencyId || !providerUserId) {
      return res.status(400).json({ error: { message: 'agencyId and providerUserId are required' } });
    }
    await assertAgency(req, agencyId);
    const { link } = await createProviderActionLink({
      agencyId,
      providerUserId,
      createdByUserId: req.user.id,
      scope: String(req.body?.scope || req.query.scope || 'school')
    });
    const detail = await getLinkDetail({ agencyId, providerUserId });
    res.status(201).json({
      url: detail.latestLink?.url,
      expiresAt: link.expires_at,
      clientCount: link.client_count,
      latestLink: detail.latestLink
    });
  } catch (err) {
    handleErr(err, res, next);
  }
}

export async function downloadProviderActionPdf(req, res, next) {
  try {
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const agencyId = agencyIdFrom(req);
    const providerUserId = Number(req.params.providerUserId || 0);
    if (!agencyId || !providerUserId) {
      return res.status(400).json({ error: { message: 'agencyId and providerUserId are required' } });
    }
    await assertAgency(req, agencyId);
    const built = await buildPdfForProvider({
      agencyId,
      providerUserId,
      createdByUserId: req.user.id,
      scope: String(req.query.scope || req.body?.scope || 'school')
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${built.filename}"`);
    res.send(built.pdfBytes);
  } catch (err) {
    if (res.headersSent) return next(err);
    handleErr(err, res, next);
  }
}

export async function getProviderActionDetail(req, res, next) {
  try {
    if (!isBackoffice(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const agencyId = agencyIdFrom(req);
    const providerUserId = Number(req.params.providerUserId || 0);
    if (!agencyId || !providerUserId) {
      return res.status(400).json({ error: { message: 'agencyId and providerUserId are required' } });
    }
    await assertAgency(req, agencyId);
    const detail = await getLinkDetail({ agencyId, providerUserId });
    res.json(detail);
  } catch (err) {
    handleErr(err, res, next);
  }
}

async function preparePublic(req, res) {
  const link = await getLinkByToken(req.params.token);
  if (!link) {
    res.status(404).json({ error: { message: 'This link is invalid.' } });
    return null;
  }
  if (!isLinkUsable(link)) {
    res.status(410).json({
      error: { message: 'This link has expired. Ask your admin to send a new one.', code: 'expired' }
    });
    return null;
  }
  const user = await User.findById(link.provider_user_id);
  const role = String(user?.role || 'provider').toLowerCase();
  req.user = {
    id: Number(link.provider_user_id),
    role: ['intern', 'intern_plus'].includes(role) ? 'provider' : (user?.role || 'provider')
  };
  return { link, providerUserId: Number(link.provider_user_id) };
}

export async function getPublicProviderAction(req, res, next) {
  try {
    const data = await getPublicBundle(req.params.token);
    res.json(data);
  } catch (err) {
    handleErr(err, res, next);
  }
}

export async function openPublicProviderAction(req, res, next) {
  try {
    const ctx = await preparePublic(req, res);
    if (!ctx) return;
    await recordLinkOpen(ctx.link);
    const data = await getPublicBundle(req.params.token);
    res.json(data);
  } catch (err) {
    handleErr(err, res, next);
  }
}

export async function heartbeatPublicProviderAction(req, res, next) {
  try {
    const ctx = await preparePublic(req, res);
    if (!ctx) return;
    const fresh = await getLinkByToken(req.params.token);
    const result = await recordLinkHeartbeat(fresh || ctx.link);
    res.json(result);
  } catch (err) {
    handleErr(err, res, next);
  }
}

export async function getPublicYearDisposition(req, res, next) {
  try {
    const ctx = await preparePublic(req, res);
    if (!ctx) return;
    await assertClientOnLink(ctx.link, req.params.clientId);
    const year = String(req.query.schoolYear || '').trim() || computeCurrentSchoolYearLabel();
    const disposition = await getDisposition({
      clientId: Number(req.params.clientId),
      schoolYear: year
    });
    res.json({ clientId: Number(req.params.clientId), schoolYear: year, disposition });
  } catch (err) {
    handleErr(err, res, next);
  }
}

export async function putPublicSpringUpdate(req, res, next) {
  try {
    const ctx = await preparePublic(req, res);
    if (!ctx) return;
    await assertClientOnLink(ctx.link, req.params.clientId);
    const disp = await saveSpringUpdate({
      clientId: Number(req.params.clientId),
      agencyId: ctx.link.agency_id,
      schoolYear: req.body?.schoolYear || null,
      springOutcome: req.body?.springOutcome,
      summerPlan: req.body?.summerPlan || null,
      fallPlan: req.body?.fallPlan || null,
      actorUserId: ctx.providerUserId
    });
    await recordClientCompleted(ctx.link, {
      clientId: Number(req.params.clientId),
      actionKey: 'spring_update',
      outcome: req.body?.springOutcome || 'submitted'
    });
    res.json({ disposition: disp });
  } catch (err) {
    handleErr(err, res, next);
  }
}

export async function putPublicFallConfirmation(req, res, next) {
  try {
    const ctx = await preparePublic(req, res);
    if (!ctx) return;
    await assertClientOnLink(ctx.link, req.params.clientId);
    const disp = await saveFallConfirmation({
      clientId: Number(req.params.clientId),
      agencyId: ctx.link.agency_id,
      schoolYear: req.body?.schoolYear || currentSchoolYearLabelFromCalendar(),
      fallOutcome: req.body?.fallOutcome,
      privateComment: req.body?.privateComment || '',
      supportFollowUp: !!req.body?.supportFollowUp,
      removeFromAssignment: !!req.body?.removeFromAssignment,
      contactAttempts: req.body?.contactAttempts ?? null,
      otherReasonKey: req.body?.otherReasonKey || null,
      schoolVisibleNote: req.body?.schoolVisibleNote || null,
      recommendTerminate: req.body?.recommendTerminate,
      attestSawLastYear: !!req.body?.attestSawLastYear,
      serviceDays: Array.isArray(req.body?.serviceDays) ? req.body.serviceDays : null,
      actorUserId: ctx.providerUserId
    });
    await recordClientCompleted(ctx.link, {
      clientId: Number(req.params.clientId),
      actionKey: 'fall_confirmation',
      outcome: req.body?.fallOutcome || 'submitted'
    });
    res.json({ disposition: disp });
  } catch (err) {
    handleErr(err, res, next);
  }
}

export async function putPublicComplianceChecklist(req, res, next) {
  try {
    const ctx = await preparePublic(req, res);
    if (!ctx) return;
    await assertClientOnLink(ctx.link, req.params.clientId);
    req.params.id = req.params.clientId;
    const origJson = res.json.bind(res);
    res.json = (body) => {
      recordClientCompleted(ctx.link, {
        clientId: Number(req.params.clientId),
        actionKey: 'provider_intake',
        outcome: 'submitted'
      }).catch(() => {});
      return origJson(body);
    };
    return updateClientComplianceChecklist(req, res, next);
  } catch (err) {
    handleErr(err, res, next);
  }
}

export async function postPublicAssignedDay(req, res, next) {
  try {
    const ctx = await preparePublic(req, res);
    if (!ctx) return;
    await assertClientOnLink(ctx.link, req.params.clientId);
    const client = await Client.findById(req.params.clientId);
    req.params.schoolId = String(client?.organization_id || req.body?.schoolId || '');
    req.body = {
      ...(req.body || {}),
      providerUserId: ctx.providerUserId,
      assigned: req.body?.assigned !== false
    };
    return setClientAssignedDay(req, res, next);
  } catch (err) {
    handleErr(err, res, next);
  }
}

export async function listPublicClients(req, res, next) {
  try {
    const ctx = await preparePublic(req, res);
    if (!ctx) return;
    const clients = await listProviderActionClients({
      agencyId: ctx.link.agency_id,
      providerUserId: ctx.providerUserId,
      scope: 'school'
    });
    res.json({ clients });
  } catch (err) {
    handleErr(err, res, next);
  }
}
