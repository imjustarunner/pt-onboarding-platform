import User from '../models/User.model.js';
import Appointment from '../models/Appointment.model.js';
import {
  getPlatformSettings,
  putPlatformSettings,
  getTenantSettings,
  putTenantSettings,
  getClientPreferences,
  putClientPreferences,
  buildDeliveryPlan,
  scheduleSessionNotifications,
  processDueSessionNotifications,
  previewPushUpdate,
  queuePushUpdate,
  getPendingPushUpdate,
  patchPendingPushUpdate,
  diffAppointmentChanges
} from '../services/sessionNotification.service.js';
import { updateAppointment } from '../services/appointment.service.js';

async function assertAgencyAccess(req, agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return false;
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'superadmin') return true;
  try {
    const agencies = await User.getAgencies(req.user.id);
    return (agencies || []).some((a) => Number(a.id) === aid);
  } catch {
    return false;
  }
}

function isSuperAdmin(req) {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'super_admin' || r === 'superadmin';
}

function canManage(role) {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'superadmin', 'admin', 'agency_admin', 'backoffice_admin'].includes(r);
}

export const getPlatformSessionNotifications = async (req, res, next) => {
  try {
    if (!isSuperAdmin(req)) return res.status(403).json({ error: { message: 'Super admin only' } });
    const settings = await getPlatformSettings();
    res.json({ ok: true, settings });
  } catch (e) {
    next(e);
  }
};

export const putPlatformSessionNotifications = async (req, res, next) => {
  try {
    if (!isSuperAdmin(req)) return res.status(403).json({ error: { message: 'Super admin only' } });
    const settings = await putPlatformSettings(req.body || {}, req.user?.id || null);
    res.json({ ok: true, settings });
  } catch (e) {
    next(e);
  }
};

export const getTenantSessionNotifications = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const settings = await getTenantSettings(agencyId);
    res.json({ ok: true, settings });
  } catch (e) {
    next(e);
  }
};

export const putTenantSessionNotifications = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can update notification settings' } });
    }
    const settings = await putTenantSettings(agencyId, req.body || {}, req.user?.id || null);
    res.json({ ok: true, settings });
  } catch (e) {
    next(e);
  }
};

export const getClientSessionNotificationPrefs = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const clientId = parseInt(req.params.clientId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const preferences = await getClientPreferences(
      agencyId,
      clientId,
      req.query.guardianUserId || null
    );
    res.json({ ok: true, preferences });
  } catch (e) {
    next(e);
  }
};

export const putClientSessionNotificationPrefs = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const clientId = parseInt(req.params.clientId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const preferences = await putClientPreferences(
      agencyId,
      clientId,
      req.body || {},
      req.body?.guardianUserId || req.query.guardianUserId || null
    );
    res.json({ ok: true, preferences });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getAppointmentNotificationPlan = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const appt = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, appt.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const plan = await buildDeliveryPlan(id);
    res.json({ ok: true, plan });
  } catch (e) {
    next(e);
  }
};

export const rescheduleSessionNotifications = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const appt = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, appt.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const scheduled = await scheduleSessionNotifications(id, { replace: true });
    res.json({ ok: true, scheduled });
  } catch (e) {
    next(e);
  }
};

export const previewAppointmentPushUpdate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const appt = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, appt.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const preview = await previewPushUpdate(id, { channels: req.body?.channels || req.query.channels });
    const pending = await getPendingPushUpdate(id);
    res.json({ ok: true, preview, pending });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/**
 * Intentional provider push. Optionally applies patch first, diffs, then queues buffer.
 * Body: { changes?, patch?, channels?, messageOverride?, sendImmediately?, bufferMinutes? }
 */
export const pushAppointmentUpdate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await Appointment.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, existing.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    let changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
    if (req.body?.patch && typeof req.body.patch === 'object') {
      const before = { ...existing };
      const updated = await updateAppointment(id, req.body.patch, { actorUserId: req.user?.id || null });
      changes = diffAppointmentChanges(before, updated || existing, req.user?.id || null);
    }

    if (!changes.length) {
      return res.status(400).json({ error: { message: 'No notifyable changes. Pass changes[] or patch.' } });
    }

    const pending = await queuePushUpdate(id, {
      changes,
      channels: req.body?.channels || null,
      messageOverride: req.body?.messageOverride || null,
      sendImmediately: req.body?.sendImmediately === true,
      bufferMinutes: req.body?.bufferMinutes,
      actorUserId: req.user?.id || null
    });
    const preview = await previewPushUpdate(id, { channels: req.body?.channels });
    res.json({ ok: true, pending, preview, changes });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getPendingAppointmentUpdate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const appt = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, appt.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const pending = await getPendingPushUpdate(id);
    res.json({ ok: true, pending });
  } catch (e) {
    next(e);
  }
};

export const patchPendingAppointmentUpdate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const appt = await Appointment.findById(id);
    if (!appt) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, appt.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const result = await patchPendingPushUpdate(id, req.body || {});
    res.json({ ok: true, pending: result });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const runSessionNotificationCron = async (req, res, next) => {
  try {
    const secret = String(req.get('x-cron-secret') || req.body?.cronSecret || '').trim();
    const expected = String(process.env.CRON_SECRET || process.env.BOOKING_CRON_SECRET || '').trim();
    if (!expected || secret !== expected) {
      return res.status(401).json({ error: { message: 'Unauthorized cron request' } });
    }
    const result = await processDueSessionNotifications({
      limit: Number(req.body?.limit || req.query.limit || 50)
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
};
