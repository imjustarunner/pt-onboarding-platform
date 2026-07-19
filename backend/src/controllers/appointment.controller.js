import Appointment from '../models/Appointment.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import User from '../models/User.model.js';
import {
  createAppointment,
  updateAppointment,
  cancelAppointment,
  getAppointmentBundle,
  linkProviderScheduleEvent
} from '../services/appointment.service.js';

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

function toMysqlDateTimeWall(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return s.slice(0, 19);
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const listAppointments = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const windowStart = String(req.query.windowStart || req.query.weekStart || '').slice(0, 10);
    const windowEnd = String(req.query.windowEnd || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(windowStart)) {
      return res.status(400).json({ error: { message: 'windowStart / weekStart must be YYYY-MM-DD' } });
    }
    const end = /^\d{4}-\d{2}-\d{2}$/.test(windowEnd)
      ? `${windowEnd} 00:00:00`
      : (() => {
          const d = new Date(`${windowStart}T00:00:00`);
          d.setDate(d.getDate() + 7);
          return d.toISOString().slice(0, 10) + ' 00:00:00';
        })();
    const rows = await Appointment.listForAgencyInWindow({
      agencyId,
      windowStart: `${windowStart} 00:00:00`,
      windowEnd: end,
      providerUserId: req.query.providerId ? Number(req.query.providerId) : null
    });
    res.json({ ok: true, appointments: rows });
  } catch (e) {
    next(e);
  }
};

export const getAppointment = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const bundle = await getAppointmentBundle(id);
    if (!bundle) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, bundle.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    res.json({ ok: true, appointment: bundle });
  } catch (e) {
    next(e);
  }
};

export const createAppointmentHandler = async (req, res, next) => {
  try {
    const agencyId = Number(req.body?.agencyId || 0);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const createPse = req.body?.createProviderScheduleEvent !== false;
    const providerUserId = Number(req.body?.providerUserId || req.user?.id || 0) || null;
    let notes = req.body?.notes || null;
    const quickNote = String(req.body?.quickNote || req.body?.quick_note || '').trim();
    if (quickNote) {
      try {
        const { maybeEncryptNotePayload } = await import('../services/clinicalNoteCrypto.service.js');
        const enc = maybeEncryptNotePayload(quickNote);
        notes = [notes, `Quick note (encrypted):\n${enc}`].filter(Boolean).join('\n\n');
      } catch {
        notes = [notes, `Quick note:\n${quickNote}`].filter(Boolean).join('\n\n');
      }
    }
    const appointment = await createAppointment({
      agencyId,
      parentAgencyId: req.body?.parentAgencyId || null,
      tenantServiceId: req.body?.tenantServiceId || null,
      providerUserId,
      startAt: req.body?.startAt,
      endAt: req.body?.endAt,
      modality: req.body?.modality || null,
      officeLocationId: req.body?.officeLocationId || null,
      roomId: req.body?.roomId || null,
      status: req.body?.status || 'confirmed',
      officeEventId: req.body?.officeEventId || null,
      officeBookingRequestId: req.body?.officeBookingRequestId || req.body?.office_booking_request_id || null,
      packageEntitlementId: req.body?.packageEntitlementId || req.body?.package_entitlement_id || null,
      source: req.body?.source || 'staff_grid',
      title: req.body?.title || null,
      notes,
      createdByUserId: req.user?.id || null,
      participants: Array.isArray(req.body?.participants) ? req.body.participants : [],
      billing: req.body?.billing || null
    });

    // Session adapter: create a calendar facet (PSE) for non-office bookings.
    if (createPse && !appointment.officeEventId && providerUserId) {
      try {
        const startAt = toMysqlDateTimeWall(appointment.startAt);
        const endAt = toMysqlDateTimeWall(appointment.endAt);
        const saved = await ProviderScheduleEvent.create({
          agencyId,
          providerId: providerUserId,
          kind: 'PERSONAL_EVENT',
          title: appointment.title || 'Session',
          description: appointment.notes || null,
          isPrivate: false,
          allDay: false,
          startAt,
          endAt,
          startDate: null,
          endDate: null,
          createdByUserId: req.user?.id || null
        });
        if (saved?.id) {
          await linkProviderScheduleEvent(appointment.id, saved.id);
          appointment.providerScheduleEventId = Number(saved.id);
        }
      } catch (pseErr) {
        console.warn('[createAppointment] PSE facet failed:', pseErr?.message || pseErr);
      }
    }

    const bundle = await getAppointmentBundle(appointment.id);
    res.status(201).json({ ok: true, appointment: bundle });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message, code: e.code } });
    next(e);
  }
};

export const updateAppointmentHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await Appointment.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, existing.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const bundle = await updateAppointment(id, req.body || {}, { actorUserId: req.user?.id || null });
    res.json({ ok: true, appointment: bundle });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const cancelAppointmentHandler = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await Appointment.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, existing.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const bundle = await cancelAppointment(id, {
      status: req.body?.status || null,
      actorUserId: req.user?.id || null,
      actorRole: req.body?.actorRole || req.user?.role || 'staff',
      notes: req.body?.notes ?? null,
      reason: req.body?.reason || req.body?.cancellationReason || null,
      clientId: req.body?.clientId || null,
      waive: req.body?.waive === true,
      waiverReason: req.body?.waiverReason || null
    });
    res.json({ ok: true, appointment: bundle });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({
        error: { message: e.message, code: e.code },
        evaluation: e.evaluation || null
      });
    }
    next(e);
  }
};
