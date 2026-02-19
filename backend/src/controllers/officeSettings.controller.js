import OfficeLocation from '../models/OfficeLocation.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import OfficeRoom from '../models/OfficeRoom.model.js';
import OfficeRoomType from '../models/OfficeRoomType.model.js';
import OfficeRoomTypeLink from '../models/OfficeRoomTypeLink.model.js';
import OfficeQuestionnaireModule from '../models/OfficeQuestionnaireModule.model.js';
import OfficeSlotQuestionnaireRule from '../models/OfficeSlotQuestionnaireRule.model.js';
import KioskAgencyAssignment from '../models/KioskAgencyAssignment.model.js';
import Module from '../models/Module.model.js';
import GoogleCalendarService from '../services/googleCalendar.service.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';

const canManageOfficeSettingsRole = (role) =>
  role === 'admin' || role === 'super_admin' || role === 'support' || role === 'clinical_practice_assistant' || role === 'provider_plus' || role === 'staff';

const hasSkillBuilderCoordinatorAccess = (userLike) =>
  userLike?.has_skill_builder_coordinator_access === true ||
  userLike?.has_skill_builder_coordinator_access === 1 ||
  userLike?.has_skill_builder_coordinator_access === '1';

async function canManageOfficeSettings(req) {
  if (canManageOfficeSettingsRole(req.user?.role)) return true;
  if (hasSkillBuilderCoordinatorAccess(req.user)) return true;
  try {
    const [rows] = await pool.execute(
      `SELECT has_skill_builder_coordinator_access
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [Number(req.user?.id || 0)]
    );
    return hasSkillBuilderCoordinatorAccess(rows?.[0] || null);
  } catch {
    return false;
  }
}

async function requireOfficeAccess(req, officeLocationId) {
  if (req.user.role === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user.id);
  return await OfficeLocationAgency.userHasAccess({ officeLocationId, agencyIds: agencies.map((a) => a.id) });
}

export const listOffices = async (req, res, next) => {
  try {
    if (req.user.role === 'super_admin') {
      const rows = await OfficeLocation.listAll({ includeInactive: false });
      return res.json(rows || []);
    }

    const agencies = await User.getAgencies(req.user.id);
    const agencyIds = agencies.map((a) => a.id);
    if (agencyIds.length === 0 && req.user.role !== 'super_admin') return res.json([]);

    const all = [];
    for (const agencyId of agencyIds) {
      const rows = await OfficeLocation.findByAgencyMembership(agencyId, { includeInactive: false });
      all.push(...rows);
    }
    const byId = new Map();
    for (const r of all) byId.set(r.id, r);
    res.json(Array.from(byId.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
  } catch (e) {
    next(e);
  }
};

export const createOffice = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const { agencyId, name, timezone, svgUrl } = req.body || {};
    let aid = parseInt(agencyId, 10);
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });

    // For non-super-admins, default to first member agency if agencyId is omitted.
    const agencies = await User.getAgencies(req.user.id);
    if (!aid && req.user.role !== 'super_admin') {
      aid = Number(agencies?.[0]?.id || 0) || 0;
    }
    if (!aid) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Must belong to agency unless super_admin
    if (req.user.role !== 'super_admin') {
      const ok = agencies.some((a) => a.id === aid);
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const loc = await OfficeLocation.create({
      agencyId: aid,
      name: String(name).trim(),
      timezone: timezone || 'America/New_York',
      svgMarkup: null
    });
    // Store svg_url if provided (best-effort; column may not exist yet if migration not applied)
    if (svgUrl) {
      try {
        await OfficeLocation.update(loc.id, { svg_url: String(svgUrl).trim() });
      } catch {
        // ignore
      }
    }
    // Auto-assign creating agency (OfficeLocation.create already does best-effort too)
    await OfficeLocationAgency.add({ officeLocationId: loc.id, agencyId: aid });

    res.status(201).json(loc);
  } catch (e) {
    next(e);
  }
};

export const getOffice = async (req, res, next) => {
  try {
    const officeId = parseInt(req.params.officeId, 10);
    if (!officeId) return res.status(400).json({ error: { message: 'Invalid officeId' } });

    const loc = await OfficeLocation.findById(officeId);
    if (!loc) return res.status(404).json({ error: { message: 'Office not found' } });

    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const agencies = await OfficeLocationAgency.listAgenciesForOffice(officeId);
    res.json({ ...loc, agencies });
  } catch (e) {
    next(e);
  }
};

export const updateOffice = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const officeId = parseInt(req.params.officeId, 10);
    if (!officeId) return res.status(400).json({ error: { message: 'Invalid officeId' } });

    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const updated = await OfficeLocation.update(officeId, {
      name: req.body?.name,
      timezone: req.body?.timezone,
      svg_url: req.body?.svgUrl,
      street_address: req.body?.streetAddress,
      city: req.body?.city,
      state: req.body?.state,
      postal_code: req.body?.postalCode,
      is_active: req.body?.isActive
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const archiveOffice = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    if (!officeId) return res.status(400).json({ error: { message: 'Invalid officeId' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const loc = await OfficeLocation.findById(officeId);
    if (!loc) return res.status(404).json({ error: { message: 'Office location not found' } });

    const updated = await OfficeLocation.update(officeId, { is_active: false });
    res.json({ ok: true, office: updated });
  } catch (e) {
    next(e);
  }
};

export const restoreOffice = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    if (!officeId) return res.status(400).json({ error: { message: 'Invalid officeId' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const loc = await OfficeLocation.findById(officeId);
    if (!loc) return res.status(404).json({ error: { message: 'Office location not found' } });

    const updated = await OfficeLocation.update(officeId, { is_active: true });
    res.json({ ok: true, office: updated });
  } catch (e) {
    next(e);
  }
};

export const listArchivedOffices = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });

    let rows;
    if (req.user.role === 'super_admin') {
      rows = await OfficeLocation.listAll({ includeInactive: true });
    } else {
      const agencies = await User.getAgencies(req.user.id);
      const agencyIds = agencies.map((a) => a.id);
      const all = [];
      for (const agencyId of agencyIds) {
        const officeRows = await OfficeLocation.findByAgencyMembership(agencyId, { includeInactive: true });
        all.push(...officeRows);
      }
      const byId = new Map();
      for (const r of all) byId.set(r.id, r);
      rows = Array.from(byId.values());
    }

    const archived = (rows || [])
      .filter((r) => r && (r.is_active === 0 || r.is_active === false))
      .map((r) => ({
        ...r,
        archived_at: r.updated_at || r.created_at || null,
        archived_by_user_id: null,
        archived_by_user_name: null
      }));
    res.json(archived);
  } catch (e) {
    next(e);
  }
};

export const deleteOffice = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    if (!officeId) return res.status(400).json({ error: { message: 'Invalid officeId' } });

    const loc = await OfficeLocation.findById(officeId);
    if (!loc) return res.status(404).json({ error: { message: 'Office location not found' } });
    if (loc.is_active === 1 || loc.is_active === true) {
      return res.status(400).json({ error: { message: 'Office location must be archived before it can be permanently deleted' } });
    }

    // Cascades via FK: rooms, events, assignments, join table, etc.
    await pool.execute('DELETE FROM office_locations WHERE id = ?', [officeId]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const addOfficeAgency = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can attach agencies to a building' } });
    }
    const officeId = parseInt(req.params.officeId, 10);
    const agencyId = parseInt(req.body?.agencyId, 10);
    if (!officeId || !agencyId) return res.status(400).json({ error: { message: 'officeId and agencyId are required' } });

    // Must already have office access to assign
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    await OfficeLocationAgency.add({ officeLocationId: officeId, agencyId });
    const agencies = await OfficeLocationAgency.listAgenciesForOffice(officeId);
    res.json({ ok: true, agencies });
  } catch (e) {
    next(e);
  }
};

export const removeOfficeAgency = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can detach agencies from a building' } });
    }
    const officeId = parseInt(req.params.officeId, 10);
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!officeId || !agencyId) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    await OfficeLocationAgency.remove({ officeLocationId: officeId, agencyId });
    const agencies = await OfficeLocationAgency.listAgenciesForOffice(officeId);
    res.json({ ok: true, agencies });
  } catch (e) {
    next(e);
  }
};

export const listRoomTypes = async (req, res, next) => {
  try {
    const officeId = parseInt(req.params.officeId, 10);
    if (!officeId) return res.status(400).json({ error: { message: 'Invalid officeId' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    const rows = await OfficeRoomType.listByOffice(officeId);
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const createRoomType = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    const name = String(req.body?.name || '').trim();
    const sortOrder = parseInt(req.body?.sortOrder || 0, 10);
    if (!officeId || !name) return res.status(400).json({ error: { message: 'name is required' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    const row = await OfficeRoomType.create({ officeLocationId: officeId, name, sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0 });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
};

export const listRooms = async (req, res, next) => {
  try {
    const officeId = parseInt(req.params.officeId, 10);
    if (!officeId) return res.status(400).json({ error: { message: 'Invalid officeId' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    const rooms = await OfficeRoom.findByLocation(officeId);
    // Attach room type ids
    const out = [];
    for (const r of rooms) {
      const typeIds = await OfficeRoomTypeLink.listRoomTypeIds(r.id);
      out.push({ ...r, roomTypeIds: typeIds });
    }
    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const createRoom = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    if (!officeId) return res.status(400).json({ error: { message: 'Invalid officeId' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const roomNumber = req.body?.roomNumber === null || req.body?.roomNumber === undefined ? null : parseInt(req.body.roomNumber, 10);
    const label = req.body?.label ? String(req.body.label).trim() : null;
    const svgRoomId = req.body?.svgRoomId ? String(req.body.svgRoomId).trim() : null;
    const googleResourceEmail = req.body?.googleResourceEmail ? String(req.body.googleResourceEmail).trim() : null;
    const sortOrder = parseInt(req.body?.sortOrder || 0, 10);
    const roomTypeIds = Array.isArray(req.body?.roomTypeIds) ? req.body.roomTypeIds : [];

    const name = label || (Number.isFinite(roomNumber) ? `Room ${roomNumber}` : 'Room');
    const room = await OfficeRoom.create({
      locationId: officeId,
      roomNumber: Number.isFinite(roomNumber) ? roomNumber : null,
      label,
      name,
      svgRoomId,
      googleResourceEmail,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0
    });
    await OfficeRoomTypeLink.setRoomTypes(room.id, roomTypeIds);
    res.status(201).json({ ...room, roomTypeIds: await OfficeRoomTypeLink.listRoomTypeIds(room.id) });
  } catch (e) {
    next(e);
  }
};

export const updateRoom = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    const roomId = parseInt(req.params.roomId, 10);
    if (!officeId || !roomId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const roomNumber = req.body?.roomNumber === null || req.body?.roomNumber === undefined ? undefined : parseInt(req.body.roomNumber, 10);
    const label = req.body?.label === undefined ? undefined : (req.body?.label ? String(req.body.label).trim() : null);
    const svgRoomId = req.body?.svgRoomId === undefined ? undefined : (req.body?.svgRoomId ? String(req.body.svgRoomId).trim() : null);
    const googleResourceEmail =
      req.body?.googleResourceEmail === undefined ? undefined : (req.body?.googleResourceEmail ? String(req.body.googleResourceEmail).trim() : null);
    const sortOrder = req.body?.sortOrder === undefined ? undefined : parseInt(req.body.sortOrder, 10);
    const roomTypeIds = req.body?.roomTypeIds;

    const patch = {};
    if (roomNumber !== undefined) patch.room_number = Number.isFinite(roomNumber) ? roomNumber : null;
    if (label !== undefined) patch.label = label;
    if (svgRoomId !== undefined) patch.svg_room_id = svgRoomId;
    if (googleResourceEmail !== undefined) patch.google_resource_email = googleResourceEmail;
    if (sortOrder !== undefined) patch.sort_order = Number.isFinite(sortOrder) ? sortOrder : 0;

    // Keep name aligned when label changes (best effort; don’t overwrite if explicitly provided)
    if (req.body?.name !== undefined) patch.name = req.body?.name;
    else if (label !== undefined) patch.name = label || patch.name;

    const updated = await OfficeRoom.update(roomId, patch);
    if (Array.isArray(roomTypeIds)) {
      await OfficeRoomTypeLink.setRoomTypes(roomId, roomTypeIds);
    }
    res.json({ ...updated, roomTypeIds: await OfficeRoomTypeLink.listRoomTypeIds(roomId) });
  } catch (e) {
    next(e);
  }
};

export const deleteRoom = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    const roomId = parseInt(req.params.roomId, 10);
    if (!officeId || !roomId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const room = await OfficeRoom.findById(roomId);
    if (!room || Number(room.location_id) !== Number(officeId)) {
      return res.status(404).json({ error: { message: 'Room not found for this office' } });
    }
    await OfficeRoom.update(roomId, { is_active: false });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const testGoogleSync = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    if (!officeId) return res.status(400).json({ error: { message: 'Invalid officeId' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const mode = String(req.body?.mode || 'dry_run').toLowerCase(); // dry_run | live
    const limit = Math.max(1, Math.min(10, parseInt(req.body?.limit || 3, 10) || 3));

    // Find upcoming booked occurrences for this building (next 4 weeks) to test against.
    const [rows] = await pool.execute(
      `SELECT id
       FROM office_events
       WHERE office_location_id = ?
         AND slot_state = 'ASSIGNED_BOOKED'
         AND start_at >= NOW()
         AND start_at <= DATE_ADD(NOW(), INTERVAL 28 DAY)
       ORDER BY start_at ASC
       LIMIT ?`,
      [officeId, limit]
    );
    const eventIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);

    const results = [];
    for (const officeEventId of eventIds) {
      if (mode === 'live') {
        const r = await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId });
        results.push({ officeEventId, ...r });
      } else {
        const r = await GoogleCalendarService.dryRunBookedOfficeEvent({ officeEventId });
        results.push({ officeEventId, ...r });
      }
    }

    res.json({
      ok: true,
      officeId,
      mode,
      configured: GoogleCalendarService.isConfigured(),
      candidates: eventIds.length,
      results
    });
  } catch (e) {
    next(e);
  }
};

export const searchModules = async (req, res, next) => {
  try {
    // Leverage existing module listing; caller can filter client-side
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const rows = await Module.findAll(includeInactive, { includeArchived: false, agencyId: null, isShared: true });
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const listOfficeQuestionnaires = async (req, res, next) => {
  try {
    const officeId = parseInt(req.params.officeId, 10);
    if (!officeId) return res.status(400).json({ error: { message: 'Invalid officeId' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    const rows = await OfficeQuestionnaireModule.listForOffice({ officeLocationId: officeId });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const upsertOfficeQuestionnaire = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    const moduleId = parseInt(req.body?.moduleId, 10);
    const agencyId = req.body?.agencyId === null || req.body?.agencyId === undefined ? null : parseInt(req.body.agencyId, 10);
    const isActive = req.body?.isActive === undefined ? true : (req.body?.isActive === true || req.body?.isActive === 'true' || req.body?.isActive === 1 || req.body?.isActive === '1');
    if (!officeId || !moduleId) return res.status(400).json({ error: { message: 'moduleId is required' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    await OfficeQuestionnaireModule.upsert({ officeLocationId: officeId, moduleId, agencyId, isActive });
    const rows = await OfficeQuestionnaireModule.listForOffice({ officeLocationId: officeId });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const removeOfficeQuestionnaire = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    const moduleId = parseInt(req.params.moduleId, 10);
    if (!officeId || !moduleId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    await OfficeQuestionnaireModule.remove({ officeLocationId: officeId, moduleId, agencyId: null });
    const rows = await OfficeQuestionnaireModule.listForOffice({ officeLocationId: officeId });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

// Slot questionnaire rules: assign questionnaires to specific room/day/hour
export const listSlotQuestionnaireRules = async (req, res, next) => {
  try {
    const officeId = parseInt(req.params.officeId, 10);
    if (!officeId) return res.status(400).json({ error: { message: 'Invalid officeId' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    const rows = await OfficeSlotQuestionnaireRule.listForOffice(officeId);
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const createSlotQuestionnaireRule = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    const { roomId, dayOfWeek, hourStart, hourEnd, moduleId, intakeLinkId } = req.body || {};
    const moduleIdNum = moduleId != null && moduleId !== '' ? parseInt(moduleId, 10) : null;
    const intakeLinkIdNum = intakeLinkId != null && intakeLinkId !== '' ? parseInt(intakeLinkId, 10) : null;
    if (!officeId) return res.status(400).json({ error: { message: 'officeId is required' } });
    if (!moduleIdNum && !intakeLinkIdNum) return res.status(400).json({ error: { message: 'moduleId or intakeLinkId is required' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const roomIdVal = roomId === '' || roomId === null || roomId === undefined ? null : parseInt(roomId, 10);
    const dayVal = dayOfWeek === '' || dayOfWeek === null || dayOfWeek === undefined ? null : parseInt(dayOfWeek, 10);
    const hourStartVal = hourStart === '' || hourStart === null || hourStart === undefined ? null : parseInt(hourStart, 10);
    const hourEndVal = hourEnd === '' || hourEnd === null || hourEnd === undefined ? null : parseInt(hourEnd, 10);

    await OfficeSlotQuestionnaireRule.create({
      officeLocationId: officeId,
      roomId: roomIdVal,
      dayOfWeek: dayVal,
      hourStart: hourStartVal,
      hourEnd: hourEndVal,
      moduleId: moduleIdNum,
      intakeLinkId: intakeLinkIdNum
    });
    const rows = await OfficeSlotQuestionnaireRule.listForOffice(officeId);
    res.status(201).json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const listKioskUsers = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const [rows] = await pool.execute(
      `SELECT id, first_name, last_name, email, status
       FROM users WHERE LOWER(role) = 'kiosk' AND status = 'active'
       ORDER BY last_name, first_name`
    );
    res.json((rows || []).map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email })));
  } catch (e) {
    next(e);
  }
};

export const listKioskAssignments = async (req, res, next) => {
  try {
    const officeId = parseInt(req.params.officeId, 10);
    if (!officeId) return res.status(400).json({ error: { message: 'Invalid officeId' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    const rows = await KioskAgencyAssignment.listByOffice(officeId);
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const createKioskAssignment = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    const { kioskUserId, agencyId, programId, validFrom, validUntil, allowedDays, settingsJson } = req.body || {};
    const kuid = parseInt(kioskUserId, 10);
    const aid = parseInt(agencyId, 10);
    if (!officeId || !kuid || !aid) return res.status(400).json({ error: { message: 'kioskUserId and agencyId are required' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const pid = programId ? parseInt(programId, 10) : null;
    let allowedDaysJson = null;
    if (allowedDays != null && allowedDays !== '') {
      try {
        allowedDaysJson = Array.isArray(allowedDays) ? allowedDays : JSON.parse(String(allowedDays));
      } catch {
        // ignore invalid JSON
      }
    }
    const id = await KioskAgencyAssignment.create({
      kioskUserId: kuid,
      agencyId: aid,
      officeLocationId: officeId,
      programId: pid,
      settingsJson: settingsJson || null,
      validFrom: validFrom || null,
      validUntil: validUntil || null,
      allowedDaysJson
    });
    const rows = await KioskAgencyAssignment.listByOffice(officeId);
    res.status(201).json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const deleteKioskAssignment = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    const assignmentId = parseInt(req.params.assignmentId, 10);
    if (!officeId || !assignmentId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const [rows] = await pool.execute(
      'SELECT id FROM kiosk_agency_assignments WHERE id = ? AND office_location_id = ?',
      [assignmentId, officeId]
    );
    if (!rows?.length) return res.status(404).json({ error: { message: 'Assignment not found' } });
    await pool.execute('UPDATE kiosk_agency_assignments SET is_active = FALSE WHERE id = ?', [assignmentId]);
    const list = await KioskAgencyAssignment.listByOffice(officeId);
    res.json(list || []);
  } catch (e) {
    next(e);
  }
};

export const deleteSlotQuestionnaireRule = async (req, res, next) => {
  try {
    if (!(await canManageOfficeSettings(req))) return res.status(403).json({ error: { message: 'Access denied' } });
    const officeId = parseInt(req.params.officeId, 10);
    const ruleId = parseInt(req.params.ruleId, 10);
    if (!officeId || !ruleId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    const ok = await requireOfficeAccess(req, officeId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const rule = await OfficeSlotQuestionnaireRule.findById(ruleId);
    if (!rule || rule.office_location_id !== officeId) {
      return res.status(404).json({ error: { message: 'Rule not found' } });
    }
    await OfficeSlotQuestionnaireRule.delete(ruleId);
    const rows = await OfficeSlotQuestionnaireRule.listForOffice(officeId);
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

