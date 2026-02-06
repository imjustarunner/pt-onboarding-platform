import pool from '../config/database.js';
import ProviderAvailabilityService from '../services/providerAvailability.service.js';
import PublicAppointmentRequest from '../models/PublicAppointmentRequest.model.js';
import { checkPublicAvailabilityGate } from '../services/publicAvailabilityGate.service.js';

function parseIntSafe(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function isValidYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').slice(0, 10));
}

async function requireAgencyPublicKey(req, res, agencyId) {
  const gate = await checkPublicAvailabilityGate(agencyId);
  if (!gate.ok) {
    res.status(gate.status).json({ error: { message: gate.message } });
    return null;
  }

  const key = String(req.query?.key || '').trim();
  if (!key) {
    res.status(403).json({ error: { message: 'Access key required' } });
    return null;
  }
  const [rows] = await pool.execute(
    `SELECT id, public_availability_access_key
     FROM agencies
     WHERE id = ?
     LIMIT 1`,
    [Number(agencyId)]
  );
  const a = rows?.[0] || null;
  if (!a) {
    res.status(404).json({ error: { message: 'Agency not found' } });
    return null;
  }
  if (String(a.public_availability_access_key || '').trim() !== key) {
    res.status(403).json({ error: { message: 'Invalid access key' } });
    return null;
  }
  return a;
}

async function requireProviderInAgency(req, res, { agencyId, providerId }) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.role, u.is_active, u.is_archived, u.status
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE u.id = ?
     LIMIT 1`,
    [Number(agencyId), Number(providerId)]
  );
  const u = rows?.[0] || null;
  if (!u) {
    res.status(404).json({ error: { message: 'Provider not found' } });
    return null;
  }
  // Best-effort: exclude archived/inactive users.
  const archived = u.is_archived === true || u.is_archived === 1 || String(u.status || '').toUpperCase() === 'ARCHIVED';
  const inactive = u.is_active === false || u.is_active === 0;
  if (archived || inactive) {
    res.status(404).json({ error: { message: 'Provider not found' } });
    return null;
  }
  return {
    id: Number(u.id),
    firstName: u.first_name || '',
    lastName: u.last_name || '',
    displayName: `${u.first_name || ''} ${u.last_name || ''}`.trim()
  };
}

export const getPublicProviderAvailability = async (req, res, next) => {
  try {
    const agencyId = parseIntSafe(req.params.agencyId);
    const providerId = parseIntSafe(req.params.providerId);
    if (!agencyId || !providerId) return res.status(400).json({ error: { message: 'Invalid agencyId/providerId' } });

    const okAgency = await requireAgencyPublicKey(req, res, agencyId);
    if (!okAgency) return;

    const provider = await requireProviderInAgency(req, res, { agencyId, providerId });
    if (!provider) return;

    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const weekStart = isValidYmd(weekStartRaw) ? weekStartRaw : new Date().toISOString().slice(0, 10);

    const includeGoogleBusy = String(req.query.includeGoogleBusy ?? 'true').toLowerCase() !== 'false';
    const intakeOnly =
      String(req.query.sessionType || '').trim().toUpperCase() === 'INTAKE' ||
      String(req.query.intakeOnly ?? 'true').trim().toLowerCase() !== 'false';

    const result = await ProviderAvailabilityService.computeWeekAvailability({
      agencyId,
      providerId,
      weekStartYmd: weekStart,
      includeGoogleBusy,
      externalCalendarIds: [],
      slotMinutes: 60,
      intakeOnly
    });

    res.json({
      ok: true,
      agencyId,
      provider,
      weekStart: result.weekStart,
      weekEnd: result.weekEnd,
      timeZone: result.timeZone,
      slotMinutes: result.slotMinutes,
      virtualSlots: result.virtualSlots,
      inPersonSlots: result.inPersonSlots
    });
  } catch (e) {
    next(e);
  }
};

export const createPublicAppointmentRequest = async (req, res, next) => {
  try {
    const agencyId = parseIntSafe(req.params.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });

    const okAgency = await requireAgencyPublicKey(req, res, agencyId);
    if (!okAgency) return;

    const providerId = parseIntSafe(req.body?.providerId);
    const modality = String(req.body?.modality || '').trim().toUpperCase();
    const startAt = String(req.body?.startAt || '').trim();
    const endAt = String(req.body?.endAt || '').trim();
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    const phone = req.body?.phone ?? null;
    const notes = req.body?.notes ?? null;

    if (!providerId) return res.status(400).json({ error: { message: 'providerId is required' } });
    if (modality !== 'VIRTUAL' && modality !== 'IN_PERSON') {
      return res.status(400).json({ error: { message: 'modality must be VIRTUAL or IN_PERSON' } });
    }
    if (!startAt || !endAt) return res.status(400).json({ error: { message: 'startAt and endAt are required' } });
    if (!name || !email) return res.status(400).json({ error: { message: 'name and email are required' } });

    const provider = await requireProviderInAgency(req, res, { agencyId, providerId });
    if (!provider) return;

    // Validate requested slot exists in computed availability (fresh).
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: { message: 'Invalid startAt/endAt' } });
    }
    const diffMin = Math.round((end.getTime() - start.getTime()) / 60000);
    if (diffMin !== 60) {
      return res.status(400).json({ error: { message: 'Requested appointment must be 60 minutes' } });
    }

    const weekStart = start.toISOString().slice(0, 10);
    const availability = await ProviderAvailabilityService.computeWeekAvailability({
      agencyId,
      providerId,
      weekStartYmd: weekStart,
      includeGoogleBusy: true,
      externalCalendarIds: [],
      slotMinutes: 60,
      intakeOnly: true
    });

    const list = modality === 'VIRTUAL' ? availability.virtualSlots : availability.inPersonSlots;
    const wantedKey = `${start.toISOString()}|${end.toISOString()}`;
    const ok = (list || []).some((s) => `${s.startAt}|${s.endAt}` === wantedKey);
    if (!ok) {
      return res.status(409).json({ error: { message: 'Requested time is no longer available' } });
    }

    const created = await PublicAppointmentRequest.create({
      agencyId,
      providerId,
      modality,
      requestedStartAt: start.toISOString().slice(0, 19).replace('T', ' '),
      requestedEndAt: end.toISOString().slice(0, 19).replace('T', ' '),
      clientName: name,
      clientEmail: email,
      clientPhone: phone,
      notes
    });

    res.status(201).json({
      ok: true,
      request: {
        id: created?.id ?? null,
        agencyId,
        providerId,
        modality,
        requestedStartAt: created?.requested_start_at ?? null,
        requestedEndAt: created?.requested_end_at ?? null,
        status: created?.status ?? 'PENDING'
      }
    });
  } catch (e) {
    next(e);
  }
};

