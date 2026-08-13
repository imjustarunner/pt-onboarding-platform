/**
 * Role-based client Status Actions: agency intake, spring/fall dispositions, confirm services.
 */
import Client from '../models/Client.model.js';
import User from '../models/User.model.js';
import { getAgencyIntake, saveAgencyIntake } from '../services/clientAgencyIntake.service.js';
import {
  getDisposition,
  saveSpringUpdate,
  saveFallConfirmation,
  saveAgencyClearance,
  noteRoiFollowup
} from '../services/clientYearDisposition.service.js';
import { markClientBeingSeen } from '../services/clientLifecycleStatus.service.js';
import { computeCurrentSchoolYearLabel } from '../utils/schoolYear.js';
import { currentSchoolYearLabelFromCalendar } from '../utils/schoolYearCalendar.js';

async function loadClientOr404(id) {
  const client = await Client.findById(id, { includeSensitive: true });
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  return client;
}

async function assertAgencyAccess(req, client) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  const userAgencies = await User.getAgencies(req.user.id);
  const ids = (userAgencies || []).map((a) => Number(a.id));
  if (!ids.includes(Number(client.agency_id))) {
    const err = new Error('You do not have access to this client');
    err.status = 403;
    throw err;
  }
  return true;
}

function isAgencyRole(role) {
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant'].includes(
    String(role || '').toLowerCase()
  );
}

function isProviderRole(role) {
  return ['provider', 'provider_plus', 'intern', 'intern_plus'].includes(
    String(role || '').toLowerCase()
  );
}

export async function getClientAgencyIntake(req, res, next) {
  try {
    const client = await loadClientOr404(req.params.id);
    await assertAgencyAccess(req, client);
    if (!isAgencyRole(req.user.role)) {
      return res.status(403).json({ error: { message: 'Agency access required' } });
    }
    const data = await getAgencyIntake(client.id);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function putClientAgencyIntake(req, res, next) {
  try {
    const client = await loadClientOr404(req.params.id);
    await assertAgencyAccess(req, client);
    if (!isAgencyRole(req.user.role)) {
      return res.status(403).json({ error: { message: 'Agency access required' } });
    }
    const data = await saveAgencyIntake({
      clientId: client.id,
      payload: req.body || {},
      actorUserId: req.user.id
    });
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function getClientYearDisposition(req, res, next) {
  try {
    const client = await loadClientOr404(req.params.id);
    await assertAgencyAccess(req, client);
    const year =
      String(req.query.schoolYear || '').trim()
      || computeCurrentSchoolYearLabel();
    const disp = await getDisposition({ clientId: client.id, schoolYear: year });
    res.json({ clientId: client.id, schoolYear: year, disposition: disp });
  } catch (e) {
    next(e);
  }
}

export async function putClientSpringUpdate(req, res, next) {
  try {
    const client = await loadClientOr404(req.params.id);
    await assertAgencyAccess(req, client);
    if (!isProviderRole(req.user.role) && !isAgencyRole(req.user.role)) {
      return res.status(403).json({ error: { message: 'Provider or agency access required' } });
    }
    const disp = await saveSpringUpdate({
      clientId: client.id,
      agencyId: client.agency_id,
      schoolYear: req.body?.schoolYear || null,
      springOutcome: req.body?.springOutcome,
      summerPlan: req.body?.summerPlan || null,
      fallPlan: req.body?.fallPlan || null,
      actorUserId: req.user.id
    });
    res.json({ disposition: disp });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function putClientFallConfirmation(req, res, next) {
  try {
    const client = await loadClientOr404(req.params.id);
    await assertAgencyAccess(req, client);
    if (!isProviderRole(req.user.role) && !isAgencyRole(req.user.role)) {
      return res.status(403).json({ error: { message: 'Provider or agency access required' } });
    }
    const disp = await saveFallConfirmation({
      clientId: client.id,
      agencyId: client.agency_id,
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
      actorUserId: req.user.id
    });
    res.json({ disposition: disp });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function putClientAgencyClearance(req, res, next) {
  try {
    const client = await loadClientOr404(req.params.id);
    await assertAgencyAccess(req, client);
    if (!isAgencyRole(req.user.role)) {
      return res.status(403).json({ error: { message: 'Agency access required' } });
    }
    const disp = await saveAgencyClearance({
      clientId: client.id,
      agencyId: client.agency_id,
      schoolYear: req.body?.schoolYear || currentSchoolYearLabelFromCalendar(),
      clearance: req.body?.clearance || req.body || {},
      actorUserId: req.user.id
    });
    res.json({ disposition: disp });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function putClientRoiFollowup(req, res, next) {
  try {
    const client = await loadClientOr404(req.params.id);
    await assertAgencyAccess(req, client);
    if (!isAgencyRole(req.user.role)) {
      return res.status(403).json({ error: { message: 'Agency access required' } });
    }
    const disp = await noteRoiFollowup({
      clientId: client.id,
      agencyId: client.agency_id,
      schoolYear: req.body?.schoolYear || currentSchoolYearLabelFromCalendar(),
      actorUserId: req.user.id
    });
    res.json({ disposition: disp });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function postConfirmServicesStarted(req, res, next) {
  try {
    const client = await loadClientOr404(req.params.id);
    await assertAgencyAccess(req, client);
    if (!isProviderRole(req.user.role) && !isAgencyRole(req.user.role)) {
      return res.status(403).json({ error: { message: 'Provider or agency access required' } });
    }
    const serviceDate = req.body?.serviceDate || req.body?.services_started_at || null;
    const result = await markClientBeingSeen({
      clientId: client.id,
      actorUserId: req.user.id,
      serviceDate
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
}
