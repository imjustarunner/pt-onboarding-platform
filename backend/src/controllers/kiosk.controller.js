import OfficeLocation from '../models/OfficeLocation.model.js';
import OfficeRoomAssignment from '../models/OfficeRoomAssignment.model.js';
import User from '../models/User.model.js';
import KioskModel from '../models/Kiosk.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OfficeEventCheckin from '../models/OfficeEventCheckin.model.js';
import OfficeQuestionnaireModule from '../models/OfficeQuestionnaireModule.model.js';
import OfficeQuestionnaireResponse from '../models/OfficeQuestionnaireResponse.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';

function normalizePin(pin) {
  const p = String(pin || '').trim();
  // Expect 4 digits like MMDD; allow any 4 digits
  return /^\d{4}$/.test(p) ? p : null;
}

function weekday3(dateObj) {
  return dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function hhmm(timeStr) {
  // "HH:MM" from Date
  return timeStr.replace(':', '');
}

function parseContentData(contentRow) {
  const data = contentRow?.content_data;
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

function normalizeIdArray(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => (x === null || x === undefined ? null : parseInt(x)))
    .filter((x) => Number.isInteger(x) && x > 0);
}

function buildSlotSignature({ dateObj, timeHHMM, pin }) {
  // Example: WED-1700-0512 (uses local weekday + HHMM + PIN)
  const day = weekday3(dateObj);
  const t = timeHHMM.replace(':', '');
  return `${day}-${t}-${pin}`;
}

function scorePHQ9(answers) {
  // answers: { q1..q9: 0..3 }
  let sum = 0;
  for (let i = 1; i <= 9; i++) {
    const v = Number(answers?.[`q${i}`]);
    if (!Number.isFinite(v) || v < 0 || v > 3) continue;
    sum += v;
  }
  return sum;
}

function scoreGAD7(answers) {
  let sum = 0;
  for (let i = 1; i <= 7; i++) {
    const v = Number(answers?.[`q${i}`]);
    if (!Number.isFinite(v) || v < 0 || v > 3) continue;
    sum += v;
  }
  return sum;
}

// Public: list booked events for a given office + date
export const listKioskEvents = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    // Kiosk can show booked + assigned_available + assigned_temporary occurrences (metadata-only).
    const events = await OfficeEvent.listForOfficeWindow({
      officeLocationId: parseInt(locationId),
      startAt: `${String(date).slice(0, 10)}T00:00:00.000Z`,
      endAt: `${String(date).slice(0, 10)}T23:59:59.999Z`
    });
    const out = (events || []).map((e) => {
      const first = String(e.booked_provider_first_name || e.provider_first_name || '').trim();
      const li = String(e.booked_provider_last_name || e.provider_last_name || '').trim().slice(0, 1);
      const initials = `${first.slice(0, 1)}${li}`.toUpperCase();
      return {
        id: e.id,
        roomId: e.room_id,
        roomName: e.room_name,
        startAt: e.start_at,
        endAt: e.end_at,
        providerId: e.booked_provider_id || e.assigned_provider_id || null,
        providerInitials: initials || null,
        slotState: e.slot_state || null,
        status: e.status
      };
    });

    res.json({ locationId: parseInt(locationId), date, events: out });
  } catch (e) {
    next(e);
  }
};

// Public: check in to a specific booked event
export const checkInToEvent = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const eventId = parseInt(req.body?.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      return res.status(400).json({ error: { message: 'eventId is required' } });
    }

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const ev = await OfficeEvent.findById(eventId);
    if (!ev || ev.office_location_id !== parseInt(locationId)) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }
    if (ev.status !== 'BOOKED' || !ev.booked_provider_id) {
      return res.status(400).json({ error: { message: 'Event is not a booked slot' } });
    }

    const checkin = await OfficeEventCheckin.create({
      eventId: ev.id,
      officeLocationId: ev.office_location_id,
      roomId: ev.room_id,
      providerId: ev.booked_provider_id
    });

    // Notify the booked provider
    try {
      const agencies = await User.getAgencies(ev.booked_provider_id);
      const agencyId = agencies?.[0]?.id || null;
      if (agencyId) {
        await createNotificationAndDispatch({
          type: 'kiosk_checkin',
          severity: 'info',
          title: 'Kiosk check-in',
          message: `A kiosk check-in was recorded for an office event (${ev.start_at}).`,
          userId: ev.booked_provider_id,
          agencyId,
          relatedEntityType: 'office_event_checkin',
          relatedEntityId: checkin?.id || null
        });
      }
    } catch {
      // ignore
    }

    res.status(201).json({ ok: true, eventId: ev.id, checkin });
  } catch (e) {
    next(e);
  }
};

// Public: list available questionnaires for an office
export const listKioskQuestionnaires = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const rows = await OfficeQuestionnaireModule.listForOffice({ officeLocationId: parseInt(locationId) });
    const out = (rows || []).map((r) => ({
      moduleId: r.module_id,
      title: r.module_title,
      description: r.module_description || null
    }));
    res.json(out);
  } catch (e) {
    next(e);
  }
};

// Public: fetch a kiosk-friendly form definition for a module (no user values)
export const getKioskQuestionnaireDefinition = async (req, res, next) => {
  try {
    const moduleId = parseInt(req.params.moduleId);
    if (!Number.isInteger(moduleId) || moduleId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid moduleId' } });
    }

    const content = await ModuleContent.findByModuleId(moduleId);
    const formPagesRaw = (content || []).filter((c) => c.content_type === 'form');

    const pages = formPagesRaw.map((row) => {
      const data = parseContentData(row) || {};
      return {
        contentId: row.id,
        orderIndex: row.order_index,
        categoryKey: data.categoryKey || null,
        title: data.title || null,
        fieldDefinitionIds: normalizeIdArray(data.fieldDefinitionIds),
        requireAll: data.requireAll === true
      };
    });

    const fieldDefinitionIds = Array.from(new Set(pages.flatMap((p) => p.fieldDefinitionIds)));
    if (fieldDefinitionIds.length === 0) {
      return res.json({ moduleId, pages, fields: [] });
    }
    const placeholders = fieldDefinitionIds.map(() => '?').join(',');
    const [fieldRows] = await (await import('../config/database.js')).default.execute(
      `SELECT * FROM user_info_field_definitions WHERE id IN (${placeholders})`,
      fieldDefinitionIds
    );

    const fieldDefMap = new Map((fieldRows || []).map((f) => [f.id, f]));
    const fields = fieldDefinitionIds
      .map((id) => fieldDefMap.get(id))
      .filter(Boolean)
      .map((f) => ({
        ...f,
        options: f.options ? (typeof f.options === 'string' ? JSON.parse(f.options) : f.options) : null,
        value: null
      }));

    res.json({ moduleId, pages, fields });
  } catch (e) {
    next(e);
  }
};

// Public: submit questionnaire answers tied to an event (metadata-only)
export const submitKioskQuestionnaire = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const eventId = parseInt(req.body?.eventId);
    const moduleId = parseInt(req.body?.moduleId);
    const answers = req.body?.answers || {};
    const typicalDayTime = req.body?.typicalDayTime === true || req.body?.typicalDayTime === 'true';

    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ error: { message: 'eventId is required' } });
    if (!Number.isInteger(moduleId) || moduleId <= 0) return res.status(400).json({ error: { message: 'moduleId is required' } });

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const ev = await OfficeEvent.findById(eventId);
    if (!ev || ev.office_location_id !== parseInt(locationId)) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }
    if (ev.status !== 'BOOKED' || !ev.booked_provider_id) {
      return res.status(400).json({ error: { message: 'Event is not a booked slot' } });
    }

    const start = new Date(ev.start_at);
    const weekday = start.getDay(); // 0..6
    const hour = start.getHours(); // 0..23
    const slotHistoryKey = `${ev.office_location_id}:${ev.room_id}:${weekday}:${hour}`;
    const appendToSlotHistory = typicalDayTime === true;

    const row = await OfficeQuestionnaireResponse.create({
      officeLocationId: ev.office_location_id,
      roomId: ev.room_id,
      eventId: ev.id,
      providerId: ev.booked_provider_id,
      moduleId,
      answers,
      typicalDayTime,
      appendToSlotHistory,
      slotHistoryKey: appendToSlotHistory ? slotHistoryKey : null
    });

    res.status(201).json({ ok: true, response: row });
  } catch (e) {
    next(e);
  }
};

// Public: list providers who have assignments for today at this location
export const listKioskProviders = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { date } = req.query; // YYYY-MM-DD

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const d = date ? new Date(`${date}T00:00:00`) : new Date();
    const startAt = new Date(d); startAt.setHours(0, 0, 0, 0);
    const endAt = new Date(d); endAt.setHours(23, 59, 59, 999);

    const assignments = await OfficeRoomAssignment.findAssignmentsForLocationWindow({
      locationId: parseInt(locationId),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString()
    });

    const uniqueProviders = new Map();
    for (const a of assignments) {
      uniqueProviders.set(a.assigned_user_id, {
        id: a.assigned_user_id,
        displayName: `${a.first_name} ${(a.last_name || '').slice(0, 1)}.`.trim()
      });
    }

    res.json(Array.from(uniqueProviders.values()).sort((a, b) => a.displayName.localeCompare(b.displayName)));
  } catch (e) {
    next(e);
  }
};

// Public: submit kiosk check-in + surveys (PHQ9/GAD7)
export const submitKioskSurvey = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { providerId, timeHHMM, pin, phq9, gad7 } = req.body;

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const pid = parseInt(providerId);
    if (!pid) return res.status(400).json({ error: { message: 'providerId is required' } });

    const provider = await User.findById(pid);
    if (!provider) return res.status(404).json({ error: { message: 'Provider not found' } });

    const normalizedPin = normalizePin(pin);
    if (!normalizedPin) return res.status(400).json({ error: { message: 'PIN must be 4 digits' } });

    const t = String(timeHHMM || '').trim();
    if (!/^\d{2}:\d{2}$/.test(t)) return res.status(400).json({ error: { message: 'timeHHMM must be HH:MM' } });

    const now = new Date();
    const checkinDate = now.toISOString().slice(0, 10);
    const checkinTime = `${t}:00`;

    const slotSig = buildSlotSignature({ dateObj: now, timeHHMM: t, pin: normalizedPin });
    const pinHash = KioskModel.hashPin(normalizedPin);

    const checkin = await KioskModel.createCheckin({
      locationId: parseInt(locationId),
      providerId: pid,
      slotSignature: slotSig,
      checkinDate,
      checkinTime,
      pinHash
    });

    const phq9Score = scorePHQ9(phq9 || {});
    const gad7Score = scoreGAD7(gad7 || {});

    const phq9Row = await KioskModel.createSurvey({
      locationId: parseInt(locationId),
      providerId: pid,
      surveyType: 'PHQ9',
      slotSignature: slotSig,
      surveyDate: checkinDate,
      pinHash,
      answers: phq9 || {},
      score: phq9Score
    });

    const gad7Row = await KioskModel.createSurvey({
      locationId: parseInt(locationId),
      providerId: pid,
      surveyType: 'GAD7',
      slotSignature: slotSig,
      surveyDate: checkinDate,
      pinHash,
      answers: gad7 || {},
      score: gad7Score
    });

    // Provider in-app notifications (kiosk alerts are default ON per plan)
    // Keep minimal: use generic notification types if available.
    try {
      const agencies = await User.getAgencies(pid);
      const agencyId = agencies?.[0]?.id || null;
      if (agencyId) {
        await createNotificationAndDispatch({
          type: 'kiosk_checkin',
          severity: 'info',
          title: 'Kiosk check-in',
          message: `A client checked in via kiosk (${slotSig}).`,
          userId: pid,
          agencyId,
          relatedEntityType: 'kiosk_checkin',
          relatedEntityId: checkin.id
        });
      }
    } catch {
      // ignore
    }

    res.status(201).json({
      ok: true,
      slotSignature: slotSig,
      checkin,
      surveys: { phq9: phq9Row, gad7: gad7Row }
    });
  } catch (e) {
    next(e);
  }
};

// Auth: list checkins for a location + date (staff/provider dashboards)
export const listCheckins = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    // Must belong to an agency assigned to this office unless super_admin
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const rows = await KioskModel.listCheckinsForLocationDate(parseInt(locationId), date);
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

// Auth: provider slot view (fetch longitudinal surveys by provider + slot + pin)
export const getSlotSurveys = async (req, res, next) => {
  try {
    const { providerId } = req.params;
    const { slotSignature, pin } = req.query;

    const pid = parseInt(providerId);
    if (!pid || !slotSignature || !pin) {
      return res.status(400).json({ error: { message: 'providerId, slotSignature, and pin are required' } });
    }

    const normalizedPin = normalizePin(pin);
    if (!normalizedPin) return res.status(400).json({ error: { message: 'PIN must be 4 digits' } });

    // Access: provider can view own; admins/support/cpa can view any.
    const canAdminView = ['admin', 'super_admin', 'support', 'clinical_practice_assistant'].includes(req.user.role);
    if (!canAdminView && req.user.id !== pid) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const pinHash = KioskModel.hashPin(normalizedPin);
    const surveys = await KioskModel.findSurveys({ providerId: pid, slotSignature: String(slotSignature), pinHash, limit: 200 });
    res.json(surveys);
  } catch (e) {
    next(e);
  }
};

