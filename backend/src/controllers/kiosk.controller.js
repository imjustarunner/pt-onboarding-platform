import OfficeLocation from '../models/OfficeLocation.model.js';
import { listProvidersAtLocationOnDate } from '../services/officeProviderLocation.service.js';
import User from '../models/User.model.js';
import KioskModel from '../models/Kiosk.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OfficeEventCheckin from '../models/OfficeEventCheckin.model.js';
import OfficeQuestionnaireModule from '../models/OfficeQuestionnaireModule.model.js';
import OfficeQuestionnaireResponse from '../models/OfficeQuestionnaireResponse.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';
import pool from '../config/database.js';
import {
  buildKioskWaiverSectionDisplay,
  evaluateKioskGuardianWaiverGate,
  isClientAdultLockedForGuardian,
  recordKioskWaiverConfirmation,
  upsertGuardianWaiverSection
} from '../services/guardianWaivers.service.js';
import { isDobAdultLocked } from '../utils/guardianWaivers.utils.js';
import {
  recordSkillBuilderEventClockIn,
  recordSkillBuilderEventClockOut
} from '../services/skillBuildersEventKioskPunch.service.js';

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
          startAt: ev.start_at,
          bookedProviderId: ev.booked_provider_id || null
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
    const dateYmd = d.toISOString().slice(0, 10);

    const providers = await listProvidersAtLocationOnDate({
      locationId: parseInt(locationId),
      dateYmd
    });

    res.json(providers.sort((a, b) => a.displayName.localeCompare(b.displayName)));
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

// Public: guardian waiver completeness for kiosk (program site + optional company event override)
export const getKioskGuardianWaiverStatus = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const guardianUserId = parseInt(req.query.guardianUserId, 10);
    const clientId = parseInt(req.query.clientId, 10);
    const siteId = parseInt(req.query.siteId, 10);
    const companyEventId = req.query.companyEventId ? parseInt(req.query.companyEventId, 10) : null;
    if (!guardianUserId || !clientId || !siteId) {
      return res.status(400).json({ error: { message: 'guardianUserId, clientId, and siteId are required' } });
    }

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const ProgramSite = (await import('../models/ProgramSite.model.js')).default;
    const ClientGuardian = (await import('../models/ClientGuardian.model.js')).default;

    const site = await ProgramSite.findById(siteId);
    if (!site || site.office_location_id !== parseInt(locationId)) {
      return res.status(404).json({ error: { message: 'Site not found at this location' } });
    }

    const clients = await ClientGuardian.listClientsForGuardian({ guardianUserId });
    const hasClient = (clients || []).some((c) => parseInt(c.client_id, 10) === clientId);
    if (!hasClient) return res.status(403).json({ error: { message: 'Guardian is not linked to this client' } });

    const gate = await evaluateKioskGuardianWaiverGate({
      programSiteId: siteId,
      guardianUserId,
      clientId,
      companyEventId: companyEventId || null
    });

    const sectionDisplay = gate.enabled
      ? buildKioskWaiverSectionDisplay(gate.sections, gate.requiredKeys || [])
      : null;

    res.json({
      enabled: gate.enabled,
      complete: gate.complete,
      missing: gate.missing,
      requiredKeys: gate.requiredKeys,
      adultLocked: gate.adultLocked === true,
      sectionDisplay,
      sections: gate.sections || {}
    });
  } catch (e) {
    next(e);
  }
};

function formatKioskWaiverProfileRow(profile) {
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

/** Public: update one waiver section from kiosk (same rules as guardian portal). */
export const postKioskGuardianWaiverSection = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const {
      guardianUserId,
      clientId,
      siteId,
      sectionKey,
      payload,
      signatureData,
      consentAcknowledged,
      intentToSign,
      action,
      companyEventId
    } = req.body || {};

    const gid = parseInt(guardianUserId, 10);
    const cid = parseInt(clientId, 10);
    const sid = parseInt(siteId, 10);
    if (!gid || !cid || !sid) {
      return res.status(400).json({ error: { message: 'guardianUserId, clientId, and siteId are required' } });
    }

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const ProgramSite = (await import('../models/ProgramSite.model.js')).default;
    const ClientGuardian = (await import('../models/ClientGuardian.model.js')).default;

    const site = await ProgramSite.findById(sid);
    if (!site || site.office_location_id !== parseInt(locationId)) {
      return res.status(404).json({ error: { message: 'Site not found at this location' } });
    }

    if (await isClientAdultLockedForGuardian(cid)) {
      return res.status(403).json({
        error: { message: 'Not available for this client.', code: 'GUARDIAN_ADULT_CLIENT' }
      });
    }

    const clients = await ClientGuardian.listClientsForGuardian({ guardianUserId: gid });
    const hasClient = (clients || []).some((c) => parseInt(c.client_id, 10) === cid);
    if (!hasClient) return res.status(403).json({ error: { message: 'Guardian is not linked to this client' } });

    const gateCtx = await evaluateKioskGuardianWaiverGate({
      programSiteId: sid,
      guardianUserId: gid,
      clientId: cid,
      companyEventId: companyEventId ? parseInt(companyEventId, 10) : null
    });
    if (!gateCtx.enabled) {
      return res.status(403).json({ error: { message: 'Guardian waivers are not enabled for this program' } });
    }

    const act = String(action || 'update').toLowerCase();
    if (act !== 'create' && act !== 'update') {
      return res.status(400).json({ error: { message: 'action must be create or update' } });
    }

    const profile = await upsertGuardianWaiverSection({
      guardianUserId: gid,
      clientId: cid,
      sectionKey: String(sectionKey || '').trim(),
      payload,
      action: act,
      signatureData,
      consentAcknowledged,
      intentToSign,
      ipAddress: req.ip || req.headers['x-forwarded-for']?.split?.(',')?.[0]?.trim() || null,
      userAgent: req.headers['user-agent'] || null
    });

    const gateNext = await evaluateKioskGuardianWaiverGate({
      programSiteId: sid,
      guardianUserId: gid,
      clientId: cid,
      companyEventId: companyEventId ? parseInt(companyEventId, 10) : null
    });

    res.json({
      profile: formatKioskWaiverProfileRow(profile),
      gate: {
        complete: gateNext.complete,
        missing: gateNext.missing,
        requiredKeys: gateNext.requiredKeys,
        enabled: gateNext.enabled
      },
      sectionDisplay: gateNext.enabled
        ? buildKioskWaiverSectionDisplay(gateNext.sections, gateNext.requiredKeys || [])
        : null
    });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 400 && status < 500) {
      return res.status(status).json({ error: { message: e.message, code: e.code } });
    }
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
    res.json(
      out.map((c) => ({
        id: c.client_id,
        initials: c.initials,
        display_name: c.full_name || c.initials || `Client ${c.client_id}`,
        guardian_portal_locked: isDobAdultLocked(c.date_of_birth)
      }))
    );
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

    const isCheckIn = checkIn === true || checkIn === 'true' || checkIn === 1 || checkIn === '1';
    const companyEventId = req.body.companyEventId ? parseInt(req.body.companyEventId, 10) : null;

    let gate = { enabled: false, complete: true, requiredKeys: [], sections: {} };
    if (isCheckIn) {
      gate = await evaluateKioskGuardianWaiverGate({
        programSiteId: sid,
        guardianUserId: gid,
        clientId: cid,
        companyEventId: companyEventId || null
      });
      if (gate.enabled && !gate.complete) {
        return res.status(409).json({
          error: {
            message: 'Complete guardian waivers before check-in.',
            code: 'GUARDIAN_WAIVERS_INCOMPLETE',
            missing: gate.missing,
            requiredKeys: gate.requiredKeys
          }
        });
      }
    }

    const punchType = isCheckIn ? 'guardian_check_in' : 'guardian_check_out';
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

    if (isCheckIn && gate.enabled && gate.complete) {
      const [pr] = await pool.execute(
        'SELECT * FROM guardian_client_waiver_profiles WHERE guardian_user_id = ? AND client_id = ? LIMIT 1',
        [gid, cid]
      );
      if (pr[0]) {
        try {
          await recordKioskWaiverConfirmation({
            profileRow: pr[0],
            kioskLocationId: parseInt(locationId, 10),
            programSiteId: sid,
            guardianUserId: gid,
            clientId: cid,
            programTimePunchId: punch?.id || null,
            requiredKeys: gate.requiredKeys,
            sectionsSnapshot: gate.sections
          });
        } catch (err) {
          // Non-fatal: punch already recorded
          console.error('guardian waiver kiosk confirmation failed', err);
        }
      }
    }

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

async function assertSkillBuilderKioskLocationAgency(officeLocationId, agencyId) {
  const lid = parseInt(officeLocationId, 10);
  const aid = parseInt(agencyId, 10);
  if (!lid || !aid) return { error: { status: 400, message: 'agencyId required' } };
  const loc = await OfficeLocation.findById(lid);
  if (!loc || !loc.is_active) return { error: { status: 404, message: 'Location not found' } };
  const [r] = await pool.execute(
    `SELECT 1 AS ok FROM office_location_agencies WHERE office_location_id = ? AND agency_id = ? LIMIT 1`,
    [lid, aid]
  );
  if (!r?.[0]?.ok) {
    return { error: { status: 403, message: 'Agency is not linked to this office location' } };
  }
  return { ok: true, locationId: lid };
}

/** Public: Skill Builders integrated program events available at this office (by agency membership). */
export const listKioskSkillBuilderEvents = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const date = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const loc = await OfficeLocation.findById(parseInt(locationId, 10));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const [rows] = await pool.execute(
      `SELECT ce.id, ce.title, ce.starts_at, ce.ends_at,
              sg.agency_id, a.name AS agency_name, sg.name AS group_name
       FROM company_events ce
       INNER JOIN skills_groups sg ON sg.company_event_id = ce.id
       INNER JOIN office_location_agencies ola ON ola.agency_id = sg.agency_id AND ola.office_location_id = ?
       INNER JOIN agencies a ON a.id = sg.agency_id
       WHERE LOWER(COALESCE(ce.event_type, '')) = 'skills_group'
         AND ce.is_active = 1
         AND sg.start_date <= ? AND sg.end_date >= ?
       ORDER BY a.name ASC, ce.title ASC
       LIMIT 120`,
      [parseInt(locationId, 10), date, date]
    );
    const events = (rows || []).map((r) => ({
      id: Number(r.id),
      title: r.title,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      agencyId: Number(r.agency_id),
      agencyName: r.agency_name,
      groupName: r.group_name
    }));
    res.json({ date, events });
  } catch (e) {
    next(e);
  }
};

export const listKioskSkillBuilderEventRoster = async (req, res, next) => {
  try {
    const { locationId, eventId } = req.params;
    const agencyId = parseInt(req.query.agencyId, 10);
    const eid = parseInt(eventId, 10);
    if (!agencyId || !eid) return res.status(400).json({ error: { message: 'agencyId query and event id required' } });
    const a = await assertSkillBuilderKioskLocationAgency(locationId, agencyId);
    if (a.error) return res.status(a.error.status).json({ error: { message: a.error.message } });

    const [prov] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name
       FROM skills_group_providers sgp
       INNER JOIN users u ON u.id = sgp.provider_user_id
       INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id
       WHERE sg.company_event_id = ? AND sg.agency_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [eid, agencyId]
    );
    const [cli] = await pool.execute(
      `SELECT c.id, c.initials, c.identifier_code
       FROM skills_group_clients sgc
       INNER JOIN clients c ON c.id = sgc.client_id
       INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id
       WHERE sg.company_event_id = ? AND sg.agency_id = ?
       ORDER BY c.initials ASC, c.id ASC
       LIMIT 500`,
      [eid, agencyId]
    );
    res.json({
      providers: (prov || []).map((r) => ({
        id: Number(r.id),
        first_name: r.first_name,
        last_name: r.last_name,
        display_name: `${r.first_name || ''} ${r.last_name || ''}`.trim()
      })),
      clients: (cli || []).map((r) => ({
        id: Number(r.id),
        initials: r.initials,
        identifier_code: r.identifier_code
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const listKioskSkillBuilderEventSessions = async (req, res, next) => {
  try {
    const { locationId, eventId } = req.params;
    const agencyId = parseInt(req.query.agencyId, 10);
    const eid = parseInt(eventId, 10);
    if (!agencyId || !eid) return res.status(400).json({ error: { message: 'agencyId query and event id required' } });
    const a = await assertSkillBuilderKioskLocationAgency(locationId, agencyId);
    if (a.error) return res.status(a.error.status).json({ error: { message: a.error.message } });

    const fromY = String(req.query.from || '').trim().slice(0, 10);
    const toY = String(req.query.to || '').trim().slice(0, 10);
    let sql = `
      SELECT s.id, s.session_date, s.starts_at, s.ends_at, s.timezone,
             m.weekday, m.start_time, m.end_time
      FROM skill_builders_event_sessions s
      INNER JOIN skills_group_meetings m ON m.id = s.skills_group_meeting_id
      WHERE s.company_event_id = ?`;
    const params = [eid];
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromY)) {
      sql += ' AND s.session_date >= ?';
      params.push(fromY);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(toY)) {
      sql += ' AND s.session_date <= ?';
      params.push(toY);
    }
    sql += ' ORDER BY s.session_date ASC, m.start_time ASC, s.id ASC LIMIT 120';
    const [rows] = await pool.execute(sql, params);
    const sessions = (rows || []).map((r) => ({
      id: Number(r.id),
      sessionDate: r.session_date,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      timezone: r.timezone || 'UTC',
      weekday: r.weekday,
      startTime: String(r.start_time || '').slice(0, 8),
      endTime: String(r.end_time || '').slice(0, 8)
    }));
    res.json({ sessions });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Sessions table not migrated (584)' } });
    }
    next(e);
  }
};

export const listKioskAttachedSurveys = async (req, res, next) => {
  try {
    const { locationId, eventId } = req.params;
    const agencyId = parseInt(req.query.agencyId, 10);
    const sessionDateIdRaw = req.query.sessionDateId;
    const sessionDateId = sessionDateIdRaw == null || sessionDateIdRaw === ''
      ? null
      : parseInt(sessionDateIdRaw, 10);
    if (!agencyId || !Number.isFinite(parseInt(eventId, 10))) {
      return res.status(400).json({ error: { message: 'agencyId query and event id are required' } });
    }
    const a = await assertSkillBuilderKioskLocationAgency(locationId, agencyId);
    if (a.error) return res.status(a.error.status).json({ error: { message: a.error.message } });

    const [eventRows] = await pool.execute(
      'SELECT id FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1',
      [parseInt(eventId, 10), agencyId]
    );
    if (!eventRows?.length) return res.status(404).json({ error: { message: 'Event not found' } });

    const params = [parseInt(eventId, 10), agencyId];
    let sessionPredicate = 'AND (ces.session_date_id IS NULL';
    if (Number.isFinite(sessionDateId) && sessionDateId > 0) {
      sessionPredicate += ' OR ces.session_date_id = ?';
      params.push(sessionDateId);
    }
    sessionPredicate += ')';

    const [rows] = await pool.execute(
      `SELECT
         ces.id,
         ces.session_date_id,
         ces.survey_id,
         s.title,
         s.description,
         s.is_anonymous,
         s.is_scored,
         s.questions_json
       FROM company_event_session_surveys ces
       JOIN surveys s ON s.id = ces.survey_id
       WHERE ces.company_event_id = ?
         AND s.agency_id = ?
         ${sessionPredicate}
         AND s.is_active = 1
       ORDER BY ces.id ASC`,
      params
    );

    const surveys = (rows || []).map((r) => {
      let questions = r.questions_json;
      if (typeof questions === 'string') {
        try { questions = JSON.parse(questions); } catch { questions = []; }
      }
      return {
        attachmentId: Number(r.id),
        sessionDateId: r.session_date_id != null ? Number(r.session_date_id) : null,
        surveyId: Number(r.survey_id),
        title: String(r.title || ''),
        description: String(r.description || ''),
        isAnonymous: !!Number(r.is_anonymous),
        isScored: !!Number(r.is_scored),
        questions: Array.isArray(questions) ? questions : []
      };
    });

    res.json({ surveys });
  } catch (e) {
    next(e);
  }
};

export const kioskSkillBuilderEventClockIn = async (req, res, next) => {
  try {
    const { locationId, eventId } = req.params;
    const agencyId = parseInt(req.body?.agencyId, 10);
    const userId = parseInt(req.body?.userId, 10);
    const sessionRaw = req.body?.sessionId;
    const clientRaw = req.body?.clientId;
    const sessionIdParsed = parseInt(sessionRaw, 10);
    const clientIdParsed = parseInt(clientRaw, 10);
    const sessionId = Number.isFinite(sessionIdParsed) && sessionIdParsed > 0 ? sessionIdParsed : null;
    const clientId = Number.isFinite(clientIdParsed) && clientIdParsed > 0 ? clientIdParsed : null;
    const eid = parseInt(eventId, 10);
    if (!agencyId || !userId || !eid) {
      return res.status(400).json({ error: { message: 'agencyId, userId, and event id are required' } });
    }
    const a = await assertSkillBuilderKioskLocationAgency(locationId, agencyId);
    if (a.error) return res.status(a.error.status).json({ error: { message: a.error.message } });

    const result = await recordSkillBuilderEventClockIn(pool, {
      agencyId,
      eventId: eid,
      userId,
      sessionId,
      clientId,
      officeLocationId: a.locationId
    });
    if (result.error) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }
    res.status(201).json({ ok: true, punchId: result.punchId });
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' && String(e?.sqlMessage || '').includes('session_id')) {
      return res.status(503).json({ error: { message: 'Run migration 584 for session-scoped kiosk punches' } });
    }
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Kiosk punches table not migrated' } });
    }
    next(e);
  }
};

// ── Timezone helpers for office-local time ──────────────────────────────────
// All office_events are stored as local datetime strings (no UTC offset).
// These helpers let us compare them correctly against "now" in the office tz.

// mysql2 (with timezone:'+00:00') returns DATETIME columns as JS Date objects
// whose UTC components equal the original wall-clock value stored in MySQL
// (e.g. "2026-06-22 08:00:00" → Date with getUTCHours()===8).
// This helper extracts those UTC components back into a plain "YYYY-MM-DD HH:MM:SS"
// naive local string so the rest of the timezone comparison logic works correctly.
const _pad2 = (n) => String(n).padStart(2, '0');
function toNaiveStr(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 19);
  return `${d.getUTCFullYear()}-${_pad2(d.getUTCMonth() + 1)}-${_pad2(d.getUTCDate())} ${_pad2(d.getUTCHours())}:${_pad2(d.getUTCMinutes())}:${_pad2(d.getUTCSeconds())}`;
}

// Returns the YYYY-MM-DD date in the given IANA timezone
function localYmdInTz(dateLike, timeZone) {
  try {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return '';
  }
}

// Returns the "local-now" millisecond value for a given timezone so that
// naive DB strings (e.g. "2026-06-22 10:00:00") can be compared against it
// without needing a real UTC conversion.  Works by reading what time it is
// right now in the target timezone, then building a synthetic ms value that
// matches the same scale as `new Date(dbString).getTime()` when Node treats
// the DB string as local-server time.
//
// In practice: format the current UTC instant in the target timezone, then
// parse that local-time string back as if it were UTC (naively), giving a
// consistent "local epoch" for comparisons.
function localNowMs(tz) {
  const now = new Date();
  const localStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(now); // "2026-06-22 10:16:00"
  return new Date(localStr.replace(' ', 'T') + 'Z').getTime();
}

// Returns { startAt, endAt } as "YYYY-MM-DD HH:MM:SS" local strings for the
// current day in the given IANA timezone — suitable for MySQL DATETIME comparisons
// against event rows that are also stored as local strings.
function localTodayBounds(tz) {
  const now = new Date();
  const ymd = localYmdInTz(now, tz);
  if (!ymd) {
    // Fallback: use midnight/end-of-day in server local time
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    const e = new Date(now); e.setHours(23, 59, 59, 999);
    const fmt = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
    return { startAt: fmt(s), endAt: fmt(e) };
  }
  return { startAt: `${ymd} 00:00:00`, endAt: `${ymd} 23:59:59` };
}

// ─── Provider-First Welcome Kiosk ────────────────────────────────────────────

// Public: providers with BOOKED events today, sorted active-now → upcoming (done = omitted)
export const listProvidersToday = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const now = new Date();
    const tz = loc.timezone || 'America/Denver';
    const { startAt, endAt } = localTodayBounds(tz);
    const nowLocal = localNowMs(tz); // synthetic "local now" for DB string comparisons

    const [rows] = await pool.execute(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.credential,
         u.title,
         u.profile_photo_path,
         e.id AS event_id,
         e.start_at,
         e.end_at,
         r.name AS room_name,
         r.room_number,
         COALESCE(a_loc.name,       a_any.name)           AS agency_name,
         COALESCE(a_loc.color_palette, a_any.color_palette) AS agency_color_palette
       FROM office_events e
       JOIN users u ON u.id = e.booked_provider_id
         AND u.is_active = 1
         AND u.status = 'ACTIVE_EMPLOYEE'
         AND u.terminated_at IS NULL
       JOIN office_rooms r ON r.id = e.room_id
       JOIN office_locations ol ON ol.id = e.office_location_id
       -- Prefer agency matching this location
       LEFT JOIN user_agencies ua_loc
         ON ua_loc.user_id = u.id
         AND ua_loc.agency_id = ol.agency_id
         AND ua_loc.is_active = 1
       LEFT JOIN agencies a_loc ON a_loc.id = ua_loc.agency_id
       -- Fallback: any active agency for this provider
       LEFT JOIN (
         SELECT ua2.user_id,
                a2.name,
                a2.color_palette
         FROM user_agencies ua2
         JOIN agencies a2 ON a2.id = ua2.agency_id
         WHERE ua2.is_active = 1
       ) a_any ON a_any.user_id = u.id AND a_loc.id IS NULL
       WHERE e.office_location_id = ?
         AND (e.status = 'BOOKED' OR e.slot_state = 'ASSIGNED_BOOKED')
         AND e.booked_provider_id IS NOT NULL
         AND e.start_at < ?
         AND e.end_at > ?
       ORDER BY u.id, e.start_at ASC`,
      [parseInt(locationId), endAt, startAt]
    );

    // Group by provider; determine status from their events relative to now
    const providerMap = new Map();
    for (const row of (rows || [])) {
      const pid = row.id;
      if (!providerMap.has(pid)) {
        providerMap.set(pid, {
          id: pid,
          firstName: row.first_name,
          lastName: row.last_name,
          credential: row.credential || null,
          title: row.title || null,
          profilePhotoPath: row.profile_photo_path || null,
          agencyName: row.agency_name || null,
          agencyPrimaryColor: (() => {
            try {
              const palette = typeof row.agency_color_palette === 'string'
                ? JSON.parse(row.agency_color_palette)
                : row.agency_color_palette;
              return palette?.primary || null;
            } catch { return null; }
          })(),
          currentRoomName: null,
          currentRoomNumber: null,
          nextSlotAt: null,
          status: 'upcoming',
          events: []
        });
      }
      providerMap.get(pid).events.push({
        startAt: toNaiveStr(row.start_at),
        endAt: toNaiveStr(row.end_at),
        roomName: row.room_name,
        roomNumber: row.room_number
      });
    }

    const providers = [];
    for (const p of providerMap.values()) {
      // Compare naive local strings against local-now using consistent "naive UTC" parsing
      const toMs = (s) => new Date(s.replace(' ', 'T') + 'Z').getTime();
      const activeEvent = p.events.find((e) => toMs(e.startAt) <= nowLocal && toMs(e.endAt) > nowLocal);
      const futureEvents = p.events.filter((e) => toMs(e.startAt) > nowLocal);
      const allDone = p.events.every((e) => toMs(e.endAt) <= nowLocal);

      if (allDone) continue; // Provider's day is done; omit from kiosk

      if (activeEvent) {
        p.status = 'active_now';
        p.currentRoomName = activeEvent.roomName;
        p.currentRoomNumber = activeEvent.roomNumber;
      } else if (futureEvents.length > 0) {
        p.status = 'upcoming';
        p.nextSlotAt = futureEvents[0].startAt;
        p.currentRoomName = futureEvents[0].roomName;
        p.currentRoomNumber = futureEvents[0].roomNumber;
      }

      delete p.events;
      providers.push(p);
    }

    // Sort: active_now first, then upcoming by nextSlotAt
    providers.sort((a, b) => {
      if (a.status === b.status) {
        const ta = a.nextSlotAt ? new Date(a.nextSlotAt.replace(' ', 'T') + 'Z').getTime() : 0;
        const tb = b.nextSlotAt ? new Date(b.nextSlotAt.replace(' ', 'T') + 'Z').getTime() : 0;
        return ta - tb;
      }
      return a.status === 'active_now' ? -1 : 1;
    });

    res.json({ locationId: parseInt(locationId), locationName: loc.name, timezone: tz, providers });
  } catch (e) {
    console.error('[kiosk-debug] providers-today error:', e);
    next(e);
  }
};

// Public: a provider's BOOKED slots for today (no client info)
export const listProviderSlotsToday = async (req, res, next) => {
  try {
    const { locationId, providerId } = req.params;
    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const tz = loc.timezone || 'America/Denver';
    const { startAt, endAt } = localTodayBounds(tz);

    const [rows] = await pool.execute(
      `SELECT
         e.id AS event_id,
         e.start_at,
         e.end_at,
         r.name AS room_name,
         r.room_number,
         oec.id AS checkin_id
       FROM office_events e
       JOIN users u ON u.id = e.booked_provider_id
         AND u.is_active = 1
         AND u.status = 'ACTIVE_EMPLOYEE'
         AND u.terminated_at IS NULL
       JOIN office_rooms r ON r.id = e.room_id
       LEFT JOIN office_event_checkins oec ON oec.event_id = e.id
       WHERE e.office_location_id = ?
         AND e.booked_provider_id = ?
         AND (e.status = 'BOOKED' OR e.slot_state = 'ASSIGNED_BOOKED')
         AND e.start_at < ?
         AND e.end_at > ?
       ORDER BY e.start_at ASC`,
      [parseInt(locationId), parseInt(providerId), endAt, startAt]
    );

    const slots = (rows || []).map((r) => ({
      eventId: r.event_id,
      startAt: toNaiveStr(r.start_at),
      endAt: toNaiveStr(r.end_at),
      roomName: r.room_name,
      roomNumber: r.room_number,
      alreadyCheckedIn: r.checkin_id != null
    }));

    res.json({ locationId: parseInt(locationId), providerId: parseInt(providerId), timezone: tz, slots });
  } catch (e) {
    next(e);
  }
};

// ── Room availability helpers ────────────────────────────────────────────────

// Convert "fake-UTC" ms back to "YYYY-MM-DD HH:MM:SS" naive local string
function msToNaiveStr(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${_pad2(d.getUTCMonth() + 1)}-${_pad2(d.getUTCDate())} ${_pad2(d.getUTCHours())}:${_pad2(d.getUTCMinutes())}:${_pad2(d.getUTCSeconds())}`;
}

// Given sorted booked intervals (naive strings) and "now" string, return the
// next contiguous free window aligned to whole-hour clock blocks.
// - If free right now: start snaps DOWN to floor of current hour.
// - If becoming free later: start snaps UP to ceiling of the hour it ends.
// - End always snaps DOWN to nearest floor hour.
// Returns null if no window of ≥ 1 hour remains today.
function nextFreeWindow(bookedIntervals, nowStr, dayEndStr) {
  const toMs = (s) => new Date(s.replace(' ', 'T') + 'Z').getTime();
  const floorHour = (ms) => Math.floor(ms / 3600_000) * 3600_000;
  const ceilHour  = (ms) => Math.ceil(ms  / 3600_000) * 3600_000;

  const nowMs    = toMs(nowStr);
  const dayEndMs = toMs(dayEndStr);

  // Merge overlapping booked intervals that fall within today
  const sorted = [...bookedIntervals]
    .map((iv) => ({ s: toMs(iv.start), e: toMs(iv.end) }))
    .sort((a, b) => a.s - b.s);

  const merged = [];
  for (const iv of sorted) {
    if (merged.length && iv.s <= merged[merged.length - 1].e) {
      merged[merged.length - 1].e = Math.max(merged[merged.length - 1].e, iv.e);
    } else {
      merged.push({ s: iv.s, e: iv.e });
    }
  }

  // Advance cursor past any booking that covers nowMs
  let cursor = nowMs;
  let nextBookingStart = dayEndMs;
  for (const iv of merged) {
    if (iv.s > cursor) { nextBookingStart = iv.s; break; }
    if (iv.e > cursor) { cursor = iv.e; }
  }

  // Re-scan to find the next booking start after the resolved cursor
  nextBookingStart = dayEndMs;
  for (const iv of merged) {
    if (iv.s > cursor) { nextBookingStart = iv.s; break; }
  }

  // Snap start: floor if free now, ceiling if becoming free later
  const snappedStart = cursor === nowMs ? floorHour(cursor) : ceilHour(cursor);
  // Snap end: floor hour of the next booking (or EOD)
  const snappedEnd   = floorHour(nextBookingStart);

  const maxHours = Math.floor((snappedEnd - snappedStart) / 3600_000);
  if (maxHours < 1) return null;

  return {
    start: msToNaiveStr(snappedStart),
    end:   msToNaiveStr(snappedEnd),
    availableNow: cursor === nowMs
  };
}

// Public: rooms with remaining availability today, each with their next free window
export const listAvailableRooms = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const tz = loc.timezone || 'America/Denver';
    const nowStr = new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(new Date());
    const { endAt: dayEnd } = localTodayBounds(tz);

    // Fetch all active rooms + any booked events remaining today
    const [rows] = await pool.execute(
      `SELECT r.id, r.name, r.room_number, r.label, r.sort_order,
              e.id AS event_id,
              e.start_at AS booked_start,
              e.end_at   AS booked_end
       FROM office_rooms r
       LEFT JOIN office_events e
         ON e.room_id = r.id
         AND (e.status = 'BOOKED' OR e.slot_state = 'ASSIGNED_BOOKED')
         AND e.end_at   > ?
         AND e.start_at < ?
       WHERE r.location_id = ? AND r.is_active = TRUE
       ORDER BY r.sort_order ASC, r.name ASC, e.start_at ASC`,
      [nowStr, dayEnd, parseInt(locationId)]
    );

    // Group rows by room
    const roomMap = new Map();
    for (const row of (rows || [])) {
      if (!roomMap.has(row.id)) {
        roomMap.set(row.id, { id: row.id, name: row.name, roomNumber: row.room_number, bookedIntervals: [] });
      }
      if (row.event_id) {
        roomMap.get(row.id).bookedIntervals.push({
          start: toNaiveStr(row.booked_start),
          end:   toNaiveStr(row.booked_end)
        });
      }
    }

    const rooms = [];
    for (const room of roomMap.values()) {
      const win = nextFreeWindow(room.bookedIntervals, nowStr, dayEnd);
      if (!win) continue;

      const toMs  = (s) => new Date(s.replace(' ', 'T') + 'Z').getTime();
      const maxMs = toMs(win.end) - toMs(win.start);
      const maxHours = Math.floor(maxMs / 3600_000);
      if (maxHours < 1) continue;

      rooms.push({
        id: room.id,
        name: room.name,
        roomNumber: room.roomNumber,
        availableNow: win.availableNow,
        windowStart: win.start,
        windowEnd: win.end,
        maxHours
      });
    }

    // Sort: available now first, then by soonest window start
    rooms.sort((a, b) => {
      if (a.availableNow !== b.availableNow) return a.availableNow ? -1 : 1;
      return a.windowStart.localeCompare(b.windowStart);
    });

    res.json({ locationId: parseInt(locationId), timezone: tz, rooms });
  } catch (e) {
    next(e);
  }
};

// Public: enter PIN → reserve a room for a chosen number of hours within its free window
export const reserveRoomByPin = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { roomId, pin, windowStart, hours } = req.body || {};

    if (!roomId || !pin) {
      return res.status(400).json({ error: { message: 'roomId and pin are required' } });
    }

    const hoursNum = parseInt(hours, 10);
    if (!hoursNum || hoursNum < 1 || hoursNum > 12) {
      return res.status(400).json({ error: { message: 'hours must be between 1 and 12' } });
    }

    const normalizedPin = normalizePin(pin);
    if (!normalizedPin) {
      return res.status(400).json({ error: { message: 'PIN must be 4 digits' } });
    }

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) return res.status(404).json({ error: { message: 'Location not found' } });

    const room = await (await import('../models/OfficeRoom.model.js')).default.findById(parseInt(roomId));
    if (!room || Number(room.location_id) !== parseInt(locationId) || !room.is_active) {
      return res.status(404).json({ error: { message: 'Room not found at this location' } });
    }

    // Identify user by PIN hash
    const pinHash = KioskModel.hashPin(normalizedPin);
    const [userRows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name
       FROM users u
       JOIN user_preferences up ON up.user_id = u.id
       WHERE up.kiosk_pin_hash = ?
         AND u.is_active = TRUE
       LIMIT 1`,
      [pinHash]
    );
    const user = userRows?.[0] || null;
    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid PIN' } });
    }

    const tz = loc.timezone || 'America/Denver';
    // Use windowStart from client if valid, otherwise fall back to current local time
    const nowStr = new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(new Date());

    const startAtStr = (windowStart && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(windowStart))
      ? windowStart.slice(0, 16) + ':00'
      : nowStr.slice(0, 16) + ':00';

    // Calculate endAt = startAt + hoursNum
    const startMs = new Date(startAtStr.replace(' ', 'T') + 'Z').getTime();
    const endMs   = startMs + hoursNum * 3600_000;
    const endAtStr = msToNaiveStr(endMs);

    // Validate no conflict
    const [conflictRows] = await pool.execute(
      `SELECT 1 FROM office_events
       WHERE room_id = ? AND (status = 'BOOKED' OR slot_state = 'ASSIGNED_BOOKED')
         AND start_at < ? AND end_at > ?
       LIMIT 1`,
      [room.id, endAtStr, startAtStr]
    );
    if (conflictRows?.[0]) {
      return res.status(409).json({ error: { message: 'That room is no longer available for this time' } });
    }

    const ev = await OfficeEvent.createIfRoomOpen({
      officeLocationId: parseInt(locationId),
      roomId: room.id,
      startAt: startAtStr,
      endAt: endAtStr,
      status: 'BOOKED',
      assignedProviderId: null,
      bookedProviderId: user.id,
      source: 'KIOSK_PIN_RESERVE',
      createdByUserId: user.id,
      approvedByUserId: user.id
    });

    if (!ev) {
      return res.status(409).json({ error: { message: 'Could not reserve room — slot taken' } });
    }

    res.status(201).json({
      ok: true,
      event: {
        id: ev.id,
        roomId: room.id,
        roomName: room.name,
        roomNumber: room.room_number,
        startAt: startAtStr,
        endAt: endAtStr,
        hours: hoursNum,
        provider: { id: user.id, firstName: user.first_name, lastName: user.last_name }
      }
    });
  } catch (e) {
    next(e);
  }
};

// ─── Provider Questionnaire Management (authenticated) ────────────────────────

// Auth: list questionnaire rules set by this provider
export const listProviderQuestRules = async (req, res, next) => {
  try {
    const providerId = req.user.id;
    const { locationId } = req.query;

    let whereExtra = '';
    const params = [providerId];
    if (locationId) {
      whereExtra = ' AND osqr.office_location_id = ?';
      params.push(parseInt(locationId));
    }

    const [rows] = await pool.execute(
      `SELECT osqr.id, osqr.office_location_id, osqr.room_id, osqr.day_of_week,
              osqr.hour_start, osqr.hour_end, osqr.module_id, osqr.intake_link_id,
              osqr.is_active, osqr.created_at,
              m.title AS module_title,
              il.title AS intake_link_title,
              r.name AS room_name,
              ol.name AS location_name
       FROM office_slot_questionnaire_rules osqr
       LEFT JOIN modules m ON m.id = osqr.module_id
       LEFT JOIN intake_links il ON il.id = osqr.intake_link_id
       LEFT JOIN office_rooms r ON r.id = osqr.room_id
       LEFT JOIN office_locations ol ON ol.id = osqr.office_location_id
       WHERE osqr.provider_id = ?${whereExtra}
       ORDER BY ol.name, osqr.day_of_week, osqr.hour_start`,
      params
    );
    res.json({ rules: rows || [] });
  } catch (e) {
    next(e);
  }
};

// Auth: create a questionnaire rule for this provider
export const createProviderQuestRule = async (req, res, next) => {
  try {
    const providerId = req.user.id;
    const { officeLocationId, roomId = null, dayOfWeek = null, hourStart = null, hourEnd = null, moduleId = null, intakeLinkId = null } = req.body || {};

    if (!officeLocationId) return res.status(400).json({ error: { message: 'officeLocationId is required' } });
    if (!moduleId && !intakeLinkId) return res.status(400).json({ error: { message: 'moduleId or intakeLinkId is required' } });

    const OfficeSlotQuestionnaireRule = (await import('../models/OfficeSlotQuestionnaireRule.model.js')).default;

    const end = hourEnd != null ? parseInt(hourEnd) : (hourStart != null ? parseInt(hourStart) : null);
    const [result] = await pool.execute(
      `INSERT INTO office_slot_questionnaire_rules
         (office_location_id, provider_id, room_id, day_of_week, hour_start, hour_end, module_id, intake_link_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(officeLocationId),
        providerId,
        roomId ? parseInt(roomId) : null,
        dayOfWeek != null ? parseInt(dayOfWeek) : null,
        hourStart != null ? parseInt(hourStart) : null,
        end,
        moduleId ? parseInt(moduleId) : null,
        intakeLinkId ? parseInt(intakeLinkId) : null
      ]
    );
    const rule = await OfficeSlotQuestionnaireRule.findById(result.insertId);
    res.status(201).json({ ok: true, rule });
  } catch (e) {
    next(e);
  }
};

// Auth: delete a questionnaire rule (only if owned by this provider)
export const deleteProviderQuestRule = async (req, res, next) => {
  try {
    const providerId = req.user.id;
    const ruleId = parseInt(req.params.ruleId);
    if (!ruleId) return res.status(400).json({ error: { message: 'ruleId is required' } });

    const [result] = await pool.execute(
      'DELETE FROM office_slot_questionnaire_rules WHERE id = ? AND provider_id = ?',
      [ruleId, providerId]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ error: { message: 'Rule not found or not owned by you' } });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// Auth: list this provider's questionnaire responses with day-of-week × hour aggregation
export const listProviderQuestResponses = async (req, res, next) => {
  try {
    const providerId = req.user.id;
    const { locationId, moduleId, intakeLinkId, view = 'list', limit: limitRaw = 100, offset: offsetRaw = 0 } = req.query;

    const params = [providerId];
    const conditions = ['oqr.provider_id = ?'];
    if (locationId) { conditions.push('oqr.office_location_id = ?'); params.push(parseInt(locationId)); }
    if (moduleId) { conditions.push('oqr.module_id = ?'); params.push(parseInt(moduleId)); }
    if (intakeLinkId) { conditions.push('oqr.intake_link_id = ?'); params.push(parseInt(intakeLinkId)); }

    const where = conditions.join(' AND ');

    if (view === 'heatmap') {
      // Aggregate by day-of-week × hour for trend analysis
      const [rows] = await pool.execute(
        `SELECT DAYOFWEEK(e.start_at) AS day_of_week,
                HOUR(e.start_at) AS hour_of_day,
                COUNT(*) AS response_count,
                oqr.module_id,
                oqr.intake_link_id
         FROM office_questionnaire_responses oqr
         JOIN office_events e ON e.id = oqr.event_id
         WHERE ${where}
         GROUP BY DAYOFWEEK(e.start_at), HOUR(e.start_at), oqr.module_id, oqr.intake_link_id
         ORDER BY day_of_week, hour_of_day`,
        params
      );
      return res.json({ view: 'heatmap', rows: rows || [] });
    }

    // List view (paginated) — never includes client_id in output even if tagged
    const limit = Math.min(parseInt(limitRaw) || 50, 200);
    const offset = parseInt(offsetRaw) || 0;
    const listParams = [...params, limit, offset];

    const [rows] = await pool.execute(
      `SELECT oqr.id, oqr.office_location_id, oqr.room_id, oqr.event_id,
              oqr.module_id, oqr.intake_link_id, oqr.answers, oqr.created_at,
              oqr.client_id IS NOT NULL AS is_client_tagged,
              DAYOFWEEK(e.start_at) AS day_of_week,
              HOUR(e.start_at) AS hour_of_day,
              DATE(e.start_at) AS event_date,
              e.start_at, e.end_at,
              r.name AS room_name,
              m.title AS module_title,
              il.title AS intake_link_title
       FROM office_questionnaire_responses oqr
       JOIN office_events e ON e.id = oqr.event_id
       LEFT JOIN office_rooms r ON r.id = oqr.room_id
       LEFT JOIN modules m ON m.id = oqr.module_id
       LEFT JOIN intake_links il ON il.id = oqr.intake_link_id
       WHERE ${where}
       ORDER BY oqr.created_at DESC
       LIMIT ? OFFSET ?`,
      listParams
    );

    res.json({ view: 'list', responses: rows || [], limit, offset });
  } catch (e) {
    next(e);
  }
};

// Auth: tag a questionnaire response to a client on the provider's caseload
export const tagResponseToClient = async (req, res, next) => {
  try {
    const providerId = req.user.id;
    const responseId = parseInt(req.params.responseId);
    const clientId = req.body?.clientId ? parseInt(req.body.clientId) : null;

    if (!responseId) return res.status(400).json({ error: { message: 'responseId is required' } });

    // Verify the response belongs to this provider
    const [rows] = await pool.execute(
      'SELECT id, provider_id FROM office_questionnaire_responses WHERE id = ? LIMIT 1',
      [responseId]
    );
    const response = rows?.[0];
    if (!response) return res.status(404).json({ error: { message: 'Response not found' } });
    if (Number(response.provider_id) !== providerId) {
      return res.status(403).json({ error: { message: 'Not your response' } });
    }

    await pool.execute(
      'UPDATE office_questionnaire_responses SET client_id = ? WHERE id = ?',
      [clientId || null, responseId]
    );

    res.json({ ok: true, responseId, clientId: clientId || null });
  } catch (e) {
    next(e);
  }
};

export const kioskSkillBuilderEventClockOut = async (req, res, next) => {
  try {
    const { locationId, eventId } = req.params;
    const agencyId = parseInt(req.body?.agencyId, 10);
    const userId = parseInt(req.body?.userId, 10);
    const eid = parseInt(eventId, 10);
    if (!agencyId || !userId || !eid) {
      return res.status(400).json({ error: { message: 'agencyId, userId, and event id are required' } });
    }
    const a = await assertSkillBuilderKioskLocationAgency(locationId, agencyId);
    if (a.error) return res.status(a.error.status).json({ error: { message: a.error.message } });

    const result = await recordSkillBuilderEventClockOut(pool, { agencyId, eventId: eid, userId });
    if (result.error) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }
    res.status(201).json({
      ok: true,
      punchOutId: result.punchOutId,
      payrollTimeClaimId: result.payrollTimeClaimId,
      directHours: result.directHours,
      indirectHours: result.indirectHours,
      workedHours: result.workedHours
    });
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' && String(e?.sqlMessage || '').includes('session_id')) {
      return res.status(503).json({ error: { message: 'Run migration 584 for session-scoped kiosk punches' } });
    }
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Kiosk or payroll tables not migrated' } });
    }
    next(e);
  }
};
