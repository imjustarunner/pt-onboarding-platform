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

// Auth (kiosk role): get kiosk context (agencies, locations, programs, settings)
export const getKioskContext = async (req, res, next) => {
  try {
    const KioskAgencyAssignment = (await import('../models/KioskAgencyAssignment.model.js')).default;
    const context = await KioskAgencyAssignment.getContextForKiosk(req.user.id);
    if (!context) {
      return res.status(404).json({ error: { message: 'No kiosk assignments found' } });
    }
    res.json(context);
  } catch (e) {
    next(e);
  }
};

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

    // Notify the booked provider with time and room
    try {
      const agencies = await User.getAgencies(ev.booked_provider_id);
      const agencyId = agencies?.[0]?.id || null;
      if (agencyId) {
        const start = new Date(ev.start_at);
        const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        let roomName = null;
        if (ev.room_id) {
          const [roomRows] = await (await import('../config/database.js')).default.execute(
            'SELECT name FROM office_rooms WHERE id = ?',
            [ev.room_id]
          );
          roomName = roomRows?.[0]?.name || null;
        }
        const roomPart = roomName ? ` in ${roomName}` : '';
        const message = `Your ${timeStr} appointment has checked in${roomPart}.`;
        await createNotificationAndDispatch({
          type: 'kiosk_checkin',
          severity: 'info',
          title: 'Client checked in',
          message,
          userId: ev.booked_provider_id,
          agencyId,
          relatedEntityType: 'office_event_checkin',
          relatedEntityId: checkin?.id || null,
          actorSource: 'Kiosk'
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

// Public: list available questionnaires for an office (optionally filtered by event/slot rules)
export const listKioskQuestionnaires = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const eventId = parseInt(req.query.eventId, 10);
    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    let out = [];
    if (Number.isInteger(eventId) && eventId > 0) {
      const ev = await OfficeEvent.findById(eventId);
      if (ev && ev.office_location_id === parseInt(locationId)) {
        const OfficeSlotQuestionnaireRule = (await import('../models/OfficeSlotQuestionnaireRule.model.js')).default;
        const slotRules = await OfficeSlotQuestionnaireRule.findForEvent({
          officeLocationId: parseInt(locationId),
          roomId: ev.room_id,
          startAt: ev.start_at
        });
        if (slotRules?.length > 0) {
          out = slotRules.map((r) => {
            if (r.intake_link_id) {
              return {
                intakeLinkId: r.intake_link_id,
                title: r.intake_link_title || `Intake ${r.intake_link_id}`,
                description: null,
                source: 'intake_link'
              };
            }
            return {
              moduleId: r.module_id,
              title: r.module_title,
              description: r.module_description || null,
              source: 'module'
            };
          });
        }
      }
    }
    if (out.length === 0) {
      const rows = await OfficeQuestionnaireModule.listForOffice({ officeLocationId: parseInt(locationId) });
      out = (rows || []).map((r) => ({
        moduleId: r.module_id,
        title: r.module_title,
        description: r.module_description || null,
        source: 'module'
      }));
    }
    res.json(out);
  } catch (e) {
    next(e);
  }
};

// Public: fetch intake link fields as kiosk-friendly form definition
export const getKioskIntakeLinkDefinition = async (req, res, next) => {
  try {
    const intakeLinkId = parseInt(req.params.intakeLinkId);
    if (!Number.isInteger(intakeLinkId) || intakeLinkId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid intakeLinkId' } });
    }

    const IntakeLink = (await import('../models/IntakeLink.model.js')).default;
    const link = await IntakeLink.findById(intakeLinkId);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const intakeFields = Array.isArray(link.intake_fields) ? link.intake_fields : [];
    const fields = intakeFields
      .filter((f) => (f.scope || 'client') === 'client')
      .map((f, idx) => ({
        id: f.field_key || `intake_${idx}`,
        field_label: f.label || f.field_key || `Field ${idx + 1}`,
        field_type: f.type || 'text',
        options: f.options || null,
        value: null
      }));

    res.json({ intakeLinkId, pages: [], fields });
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
    const moduleId = req.body?.moduleId != null ? parseInt(req.body.moduleId, 10) : null;
    const intakeLinkId = req.body?.intakeLinkId != null ? parseInt(req.body.intakeLinkId, 10) : null;
    const answers = req.body?.answers || {};
    const typicalDayTime = req.body?.typicalDayTime === true || req.body?.typicalDayTime === 'true';

    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ error: { message: 'eventId is required' } });
    if (!moduleId && !intakeLinkId) return res.status(400).json({ error: { message: 'moduleId or intakeLinkId is required' } });

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
      moduleId: moduleId || null,
      intakeLinkId: intakeLinkId || null,
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
          relatedEntityId: checkin.id,
          actorSource: 'Kiosk'
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

// Public: list program sites at this kiosk location (for clock-in/guardian check-in)
export const listKioskProgramSites = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const ProgramSite = (await import('../models/ProgramSite.model.js')).default;
    const sites = await ProgramSite.findByOfficeLocation(parseInt(locationId));
    res.json(sites || []);
  } catch (e) {
    next(e);
  }
};

// Public: list program staff for a site (for clock-in staff selection)
// When slotDate is provided (default today), returns staff scheduled for that date first; falls back to all program staff.
export const listKioskProgramStaff = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const siteId = parseInt(req.query.siteId, 10);
    const slotDate = String(req.query.slotDate || req.query.slot_date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    if (!siteId) return res.status(400).json({ error: { message: 'siteId is required' } });

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const ProgramSite = (await import('../models/ProgramSite.model.js')).default;
    const ProgramStaffAssignment = (await import('../models/ProgramStaffAssignment.model.js')).default;
    const ProgramShiftSignup = (await import('../models/ProgramShiftSignup.model.js')).default;

    const site = await ProgramSite.findById(siteId);
    if (!site || site.office_location_id !== parseInt(locationId)) {
      return res.status(404).json({ error: { message: 'Site not found at this location' } });
    }

    const scheduled = await ProgramShiftSignup.findBySiteAndDate(siteId, slotDate);
    const scheduledIds = new Set((scheduled || []).map((s) => Number(s.user_id)).filter(Boolean));

    const allStaff = await ProgramStaffAssignment.findByProgram(site.program_id, { includeInactive: false });
    const toItem = (s) => ({
      id: s.user_id,
      first_name: s.first_name,
      last_name: s.last_name,
      display_name: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
      scheduled_today: scheduledIds.has(Number(s.user_id))
    });

    const scheduledStaff = (scheduled || []).map((s) => toItem({
      user_id: s.user_id,
      first_name: s.first_name,
      last_name: s.last_name
    }));
    const otherStaff = (allStaff || []).filter((s) => !scheduledIds.has(Number(s.user_id))).map(toItem);
    const out = [...scheduledStaff, ...otherStaff];
    res.json(out);
  } catch (e) {
    next(e);
  }
};

// Public: clock in
export const kioskClockIn = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { userId, programId, siteId } = req.body;

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const uid = parseInt(userId, 10);
    const pid = parseInt(programId, 10);
    const sid = parseInt(siteId, 10);
    if (!uid || !pid || !sid) return res.status(400).json({ error: { message: 'userId, programId, siteId are required' } });

    const ProgramSite = (await import('../models/ProgramSite.model.js')).default;
    const ProgramStaffAssignment = (await import('../models/ProgramStaffAssignment.model.js')).default;
    const ProgramTimePunch = (await import('../models/ProgramTimePunch.model.js')).default;

    const site = await ProgramSite.findById(sid);
    if (!site || site.program_id !== pid || site.office_location_id !== parseInt(locationId)) {
      return res.status(400).json({ error: { message: 'Invalid site for this location' } });
    }

    const [staffRows] = await (await import('../config/database.js')).default.execute(
      'SELECT 1 FROM program_staff_assignments WHERE program_id = ? AND user_id = ? AND is_active = TRUE',
      [pid, uid]
    );
    if (!staffRows?.length) return res.status(400).json({ error: { message: 'User is not staff for this program' } });

    const now = new Date();
    const punch = await ProgramTimePunch.create({
      programId: pid,
      programSiteId: sid,
      userId: uid,
      punchType: 'clock_in',
      punchedAt: now,
      kioskLocationId: parseInt(locationId)
    });
    res.status(201).json(punch);
  } catch (e) {
    next(e);
  }
};

// Public: list guardians for program sites at this location (for guardian check-in)
export const listKioskGuardians = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const siteId = parseInt(req.query.siteId, 10);
    if (!siteId) return res.status(400).json({ error: { message: 'siteId is required' } });

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const ProgramSite = (await import('../models/ProgramSite.model.js')).default;
    const site = await ProgramSite.findById(siteId);
    if (!site || site.office_location_id !== parseInt(locationId)) {
      return res.status(404).json({ error: { message: 'Site not found at this location' } });
    }

    const [rows] = await (await import('../config/database.js')).default.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name,
              CONCAT(u.first_name, ' ', u.last_name) as display_name
       FROM client_guardians cg
       JOIN users u ON u.id = cg.guardian_user_id
       JOIN clients c ON c.id = cg.client_id
       WHERE cg.access_enabled = 1 AND c.agency_id = (SELECT agency_id FROM programs WHERE id = ?)
       ORDER BY u.last_name, u.first_name`,
      [site.program_id]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

// Public: list clients for a guardian at a site
export const listKioskGuardianClients = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const guardianUserId = parseInt(req.query.guardianUserId, 10);
    const siteId = parseInt(req.query.siteId, 10);
    if (!guardianUserId || !siteId) return res.status(400).json({ error: { message: 'guardianUserId and siteId are required' } });

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const ProgramSite = (await import('../models/ProgramSite.model.js')).default;
    const ClientGuardian = (await import('../models/ClientGuardian.model.js')).default;

    const site = await ProgramSite.findById(siteId);
    if (!site || site.office_location_id !== parseInt(locationId)) {
      return res.status(404).json({ error: { message: 'Site not found at this location' } });
    }

    const [progRows] = await (await import('../config/database.js')).default.execute(
      'SELECT agency_id FROM programs WHERE id = ?',
      [site.program_id]
    );
    const programAgencyId = progRows?.[0]?.agency_id;
    const clients = await ClientGuardian.listClientsForGuardian({ guardianUserId });
    const out = (clients || []).filter((c) => parseInt(c.agency_id, 10) === parseInt(programAgencyId, 10));
    res.json(out.map((c) => ({ id: c.client_id, initials: c.initials, display_name: c.initials || `Client ${c.client_id}` })));
  } catch (e) {
    next(e);
  }
};

// Public: guardian check-in/out
export const kioskGuardianCheckin = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { guardianUserId, clientId, siteId, checkIn } = req.body;

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const gid = parseInt(guardianUserId, 10);
    const cid = parseInt(clientId, 10);
    const sid = parseInt(siteId, 10);
    if (!gid || !cid || !sid) return res.status(400).json({ error: { message: 'guardianUserId, clientId, siteId are required' } });

    const ProgramSite = (await import('../models/ProgramSite.model.js')).default;
    const ProgramTimePunch = (await import('../models/ProgramTimePunch.model.js')).default;
    const ClientGuardian = (await import('../models/ClientGuardian.model.js')).default;

    const site = await ProgramSite.findById(sid);
    if (!site || site.program_id === undefined) {
      const [srows] = await (await import('../config/database.js')).default.execute(
        'SELECT program_id FROM program_sites WHERE id = ?',
        [sid]
      );
      if (!srows?.[0]) return res.status(404).json({ error: { message: 'Site not found' } });
      site.program_id = srows[0].program_id;
    }
    if (site.office_location_id !== parseInt(locationId)) {
      return res.status(400).json({ error: { message: 'Invalid site for this location' } });
    }

    const clients = await ClientGuardian.listClientsForGuardian({ guardianUserId: gid });
    const hasClient = (clients || []).some((c) => parseInt(c.client_id, 10) === cid);
    if (!hasClient) return res.status(403).json({ error: { message: 'Guardian is not linked to this client' } });

    const punchType = checkIn ? 'guardian_check_in' : 'guardian_check_out';
    const now = new Date();
    const punch = await ProgramTimePunch.create({
      programId: site.program_id,
      programSiteId: sid,
      guardianUserId: gid,
      punchType,
      punchedAt: now,
      kioskLocationId: parseInt(locationId),
      clientId: cid
    });
    res.status(201).json(punch);
  } catch (e) {
    next(e);
  }
};

// Public: identify staff by PIN at a site (for clock in/out)
export const identifyByPin = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { siteId, pin } = req.body;

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const sid = parseInt(siteId, 10);
    if (!sid) return res.status(400).json({ error: { message: 'siteId is required' } });

    const normalizedPin = normalizePin(pin);
    if (!normalizedPin) return res.status(400).json({ error: { message: 'PIN must be 4 digits' } });

    const ProgramSite = (await import('../models/ProgramSite.model.js')).default;
    const site = await ProgramSite.findById(sid);
    if (!site || site.office_location_id !== parseInt(locationId)) {
      return res.status(404).json({ error: { message: 'Site not found at this location' } });
    }

    const pinHash = KioskModel.hashPin(normalizedPin);
    const [rows] = await (await import('../config/database.js')).default.execute(
      `SELECT u.id, u.first_name, u.last_name
       FROM users u
       JOIN user_preferences up ON up.user_id = u.id AND up.kiosk_pin_hash = ?
       JOIN program_staff_assignments psa ON psa.user_id = u.id AND psa.program_id = ? AND psa.is_active = TRUE
       WHERE u.status = 'active'`,
      [pinHash, site.program_id]
    );

    if (!rows?.length) {
      return res.status(404).json({ error: { message: 'No staff found with this PIN at this site' } });
    }
    if (rows.length > 1) {
      return res.status(400).json({ error: { message: 'Multiple staff share this PIN. Please tap your name instead.' } });
    }

    const user = rows[0];
    res.json({
      userId: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      display_name: `${user.first_name || ''} ${user.last_name || ''}`.trim()
    });
  } catch (e) {
    next(e);
  }
};

// Public: clock out (computes direct/indirect hours)
export const kioskClockOut = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { userId, programId, siteId } = req.body;

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const uid = parseInt(userId, 10);
    const pid = parseInt(programId, 10);
    const sid = parseInt(siteId, 10);
    if (!uid || !pid || !sid) return res.status(400).json({ error: { message: 'userId, programId, siteId are required' } });

    const ProgramSite = (await import('../models/ProgramSite.model.js')).default;
    const ProgramSettings = (await import('../models/ProgramSettings.model.js')).default;
    const ProgramTimePunch = (await import('../models/ProgramTimePunch.model.js')).default;

    const site = await ProgramSite.findById(sid);
    if (!site || site.program_id !== pid || site.office_location_id !== parseInt(locationId)) {
      return res.status(400).json({ error: { message: 'Invalid site for this location' } });
    }

    const lastClockIn = await ProgramTimePunch.findLastClockIn(uid, pid, sid);
    if (!lastClockIn) return res.status(400).json({ error: { message: 'No clock-in found. Clock in first.' } });

    const settings = await ProgramSettings.findByProgramId(pid);
    const defaultDirect = Number(settings?.default_direct_hours ?? 3) || 3;

    const now = new Date();
    const start = new Date(lastClockIn.punched_at);
    const totalHours = (now - start) / (1000 * 60 * 60);
    const directHours = Math.min(totalHours, defaultDirect);
    const indirectHours = Math.max(0, totalHours - directHours);

    const punch = await ProgramTimePunch.create({
      programId: pid,
      programSiteId: sid,
      userId: uid,
      punchType: 'clock_out',
      punchedAt: now,
      kioskLocationId: parseInt(locationId),
      directHours: Math.round(directHours * 100) / 100,
      indirectHours: Math.round(indirectHours * 100) / 100
    });
    res.status(201).json(punch);
  } catch (e) {
    next(e);
  }
};

