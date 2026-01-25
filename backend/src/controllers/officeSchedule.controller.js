import OfficeLocation from '../models/OfficeLocation.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import OfficeRoom from '../models/OfficeRoom.model.js';
import OfficeRoomRequest from '../models/OfficeRoomRequest.model.js';
import OfficeRoomAssignment from '../models/OfficeRoomAssignment.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OfficeStandingAssignment from '../models/OfficeStandingAssignment.model.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import User from '../models/User.model.js';
import UserComplianceDocument from '../models/UserComplianceDocument.model.js';
import OfficeScheduleMaterializer from '../services/officeScheduleMaterializer.service.js';
import GoogleCalendarService from '../services/googleCalendar.service.js';

const canManageSchedule = (role) =>
  role === 'clinical_practice_assistant' || role === 'admin' || role === 'super_admin' || role === 'support' || role === 'staff';

function formatClinicianName(firstName, lastName) {
  const li = (lastName || '').trim().slice(0, 1);
  const ln = li ? `${li}.` : '';
  return `${firstName || ''} ${ln}`.trim();
}

async function userHasBlockingExpiredCredential(userId) {
  // Model method is findByUser (not findByUserId)
  const docs = await UserComplianceDocument.findByUser(userId);
  const today = new Date(new Date().toISOString().slice(0, 10));
  return (docs || []).some((d) => {
    if (!d.is_blocking) return false;
    if (!d.expiration_date) return false;
    return new Date(d.expiration_date) < today;
  });
}

const startOfWeekISO = OfficeScheduleMaterializer.startOfWeekISO;
const addDays = OfficeScheduleMaterializer.addDays;

export const listLocations = async (req, res, next) => {
  try {
    // Compliance gate: blocking expired credential => no scheduling access
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    if (req.user.role === 'super_admin') {
      const rows = await OfficeLocation.listAll({ includeInactive: false });
      return res.json(rows || []);
    }

    const userAgencies = await User.getAgencies(req.user.id);
    const agencyIds = userAgencies.map((a) => a.id);
    if (agencyIds.length === 0) return res.json([]);

    const all = [];
    for (const agencyId of agencyIds) {
      const rows = await OfficeLocation.findByAgencyMembership(agencyId);
      all.push(...rows);
    }
    // De-dupe (multi-agency users will see shared offices)
    const byId = new Map();
    for (const r of all) byId.set(r.id, r);
    res.json(Array.from(byId.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
  } catch (e) {
    next(e);
  }
};

// Weekly room grid: Mon–Sun hourly 7am–9pm (end hour exclusive in UI)
export const getWeeklyGrid = async (req, res, next) => {
  try {
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    const { locationId } = req.params;
    const weekStartRaw = String(req.query.weekStart || new Date().toISOString().slice(0, 10)); // YYYY-MM-DD
    const weekStart = startOfWeekISO(weekStartRaw);
    if (!weekStart) {
      return res.status(400).json({ error: { message: 'weekStart must be YYYY-MM-DD' } });
    }

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const windowStart = new Date(`${weekStart}T00:00:00`).toISOString();
    const windowEnd = new Date(`${addDays(weekStart, 7)}T00:00:00`).toISOString();

    // Normalize slots for each room/day/hour
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const hours = Array.from({ length: 15 }, (_, i) => 7 + i); // 7..21

    const rooms = await OfficeRoom.findByLocation(parseInt(locationId));

    // Materialize office_events rows for assigned slots in this week (so kiosk has stable event IDs).
    await OfficeScheduleMaterializer.materializeWeek({
      officeLocationId: parseInt(locationId),
      weekStartRaw: weekStart,
      createdByUserId: req.user.id
    });

    const events = await OfficeEvent.listForOfficeWindow({ officeLocationId: parseInt(locationId), startAt: windowStart, endAt: windowEnd });
    // Legacy assignments (office_room_assignments) are treated as assigned_available for now.
    const assignments = await OfficeRoomAssignment.findAssignmentsForLocationWindow({
      locationId: parseInt(locationId),
      startAt: windowStart,
      endAt: windowEnd
    });

    // Index events by room+date+hour (hourly grid; pick state with highest precedence)
    const key = (roomId, date, hour) => `${roomId}:${date}:${hour}`;
    const eventBySlot = new Map();
    for (const e of events || []) {
      const s = new Date(e.start_at);
      const date = s.toISOString().slice(0, 10);
      const hour = s.getHours();
      const k = key(e.room_id, date, hour);
      // Precedence: assigned_booked over assigned_temporary over assigned_available
      const prev = eventBySlot.get(k);
      if (!prev) {
        eventBySlot.set(k, e);
      } else {
        const rank = (x) => {
          const st = x?.slot_state || null;
          if (st === 'ASSIGNED_BOOKED' || x?.status === 'BOOKED') return 3;
          if (st === 'ASSIGNED_TEMPORARY') return 2;
          if (st === 'ASSIGNED_AVAILABLE' || x?.status === 'RELEASED') return 1;
          return 0;
        };
        if (rank(e) > rank(prev)) eventBySlot.set(k, e);
      }
    }

    // Index assignments by room+date+hour (treat as "assigned" if overlapping the hour slot)
    const assignedBySlot = new Map();
    for (const a of assignments || []) {
      for (const date of days) {
        for (const hour of hours) {
          const slotStart = isoForDateHour(date, hour);
          const slotEnd = new Date(new Date(slotStart).getTime() + 60 * 60 * 1000).toISOString();
          const overlaps = a.start_at < slotEnd && (a.end_at === null || a.end_at > slotStart);
          if (!overlaps) continue;
          const k = key(a.room_id, date, hour);
          if (!assignedBySlot.has(k)) assignedBySlot.set(k, a);
        }
      }
    }

    const slots = [];
    for (const room of rooms) {
      for (const date of days) {
        for (const hour of hours) {
          const k = key(room.id, date, hour);
          const e = eventBySlot.get(k);
          if (e) {
            const st = e.slot_state || (e.status === 'BOOKED' ? 'ASSIGNED_BOOKED' : 'ASSIGNED_AVAILABLE');
            const state =
              st === 'ASSIGNED_BOOKED'
                ? 'assigned_booked'
                : st === 'ASSIGNED_TEMPORARY'
                  ? 'assigned_temporary'
                  : 'assigned_available';
            const first = String(e.booked_provider_first_name || '').trim();
            const li = String(e.booked_provider_last_name || '').trim().slice(0, 1);
            const initials = `${first.slice(0, 1)}${li}`.toUpperCase();
            slots.push({
              roomId: room.id,
              date,
              hour,
              state,
              eventId: e.id,
              standingAssignmentId: e.standing_assignment_id || null,
              bookingPlanId: e.booking_plan_id || null,
              providerId: e.assigned_provider_id || e.booked_provider_id || null,
              providerInitials: initials || null
            });
            continue;
          }
          const a = assignedBySlot.get(k);
          if (a) {
            const initials = `${String(a.first_name || '').slice(0, 1)}${String(a.last_name || '').slice(0, 1)}`.toUpperCase();
            slots.push({
              roomId: room.id,
              date,
              hour,
              state: 'assigned_available',
              eventId: null,
              providerId: a.assigned_user_id,
              providerInitials: initials || null
            });
            continue;
          }
          slots.push({ roomId: room.id, date, hour, state: 'open', eventId: null, providerId: null, providerInitials: null });
        }
      }
    }

    res.json({
      location: { id: loc.id, name: loc.name, timezone: loc.timezone },
      weekStart,
      days,
      hours,
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        roomNumber: r.room_number ?? null,
        label: r.label ?? null
      })),
      slots
    });
  } catch (e) {
    next(e);
  }
};

export const getLocation = async (req, res, next) => {
  try {
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    const { id } = req.params;
    const loc = await OfficeLocation.findById(parseInt(id));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    // Verify user belongs to an agency assigned to the office (unless super_admin)
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    res.json(loc);
  } catch (e) {
    next(e);
  }
};

export const listRooms = async (req, res, next) => {
  try {
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    const { locationId } = req.params;
    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const rooms = await OfficeRoom.findByLocation(parseInt(locationId));
    res.json(rooms);
  } catch (e) {
    next(e);
  }
};

export const getAvailability = async (req, res, next) => {
  try {
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    const { locationId } = req.params;
    const { startAt, endAt } = req.query;

    if (!startAt || !endAt) {
      return res.status(400).json({ error: { message: 'startAt and endAt are required (ISO datetime)' } });
    }

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const rooms = await OfficeRoom.findByLocation(parseInt(locationId));
    const assignments = await OfficeRoomAssignment.findAssignmentsForLocationWindow({
      locationId: parseInt(locationId),
      startAt,
      endAt
    });

    // pending requests = yellow (office-scoped; office may be shared across agencies)
    const pending = await OfficeRoomRequest.listPendingForLocation(parseInt(locationId));
    const pendingByRoom = new Map();
    for (const r of pending) {
      if (r.start_at < endAt && r.end_at > startAt) {
        pendingByRoom.set(r.room_id, true);
      }
    }

    const assignmentByRoom = new Map();
    for (const a of assignments) {
      // Only one display per room for now; pick first (any overlap implies occupied)
      if (!assignmentByRoom.has(a.room_id)) {
        assignmentByRoom.set(a.room_id, a);
      }
    }

    const status = rooms.map((room) => {
      const a = assignmentByRoom.get(room.id);
      if (a) {
        return {
          roomId: room.id,
          roomName: room.name,
          svgRoomId: room.svg_room_id,
          status: 'occupied', // red
          clinicianDisplayName: formatClinicianName(a.first_name, a.last_name)
        };
      }
      if (pendingByRoom.get(room.id)) {
        return {
          roomId: room.id,
          roomName: room.name,
          svgRoomId: room.svg_room_id,
          status: 'pending', // yellow
          clinicianDisplayName: null
        };
      }
      return {
        roomId: room.id,
        roomName: room.name,
        svgRoomId: room.svg_room_id,
        status: 'available', // green
        clinicianDisplayName: null
      };
    });

    res.json({
      location: {
        id: loc.id,
        name: loc.name,
        timezone: loc.timezone,
        svg_markup: loc.svg_markup
      },
      window: { startAt, endAt },
      rooms: status
    });
  } catch (e) {
    next(e);
  }
};

export const createBookingRequest = async (req, res, next) => {
  try {
    const { locationId, roomId, startAt, endAt, notes } = req.body;
    if (!locationId || !roomId || !startAt || !endAt) {
      return res.status(400).json({ error: { message: 'locationId, roomId, startAt, endAt are required' } });
    }

    // Compliance gate: blocking expired credential => cannot request
    const blocked = await userHasBlockingExpiredCredential(req.user.id);
    if (blocked) {
      return res.status(403).json({ error: { message: 'Scheduling is restricted due to an expired blocking credential' } });
    }

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    // Must belong to an agency assigned to the office (unless super_admin)
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const room = await OfficeRoom.findById(parseInt(roomId));
    if (!room || room.location_id !== loc.id) {
      return res.status(400).json({ error: { message: 'Invalid room for location' } });
    }

    const reqRow = await OfficeRoomRequest.create({
      userId: req.user.id,
      locationId: loc.id,
      roomId: room.id,
      requestType: 'ONE_TIME',
      startAt,
      endAt,
      notes: notes || null
    });

    res.status(201).json(reqRow);
  } catch (e) {
    next(e);
  }
};

export const listPendingRequests = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can view pending requests' } });
    }

    const userAgencies = await User.getAgencies(req.user.id);
    const agencyIds = userAgencies.map((a) => a.id);
    if (req.user.role === 'super_admin' && agencyIds.length === 0) {
      // super_admin without explicit agencies: allow none (avoid global blast by default)
      return res.json([]);
    }

    const { locationId } = req.query;
    const rows = await OfficeRoomRequest.listPendingForAgencies(agencyIds, {
      locationId: locationId ? parseInt(locationId) : null
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const approveRequest = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can approve requests' } });
    }

    const { id } = req.params;
    const reqRow = await OfficeRoomRequest.findById(parseInt(id));
    if (!reqRow) return res.status(404).json({ error: { message: 'Request not found' } });
    if (reqRow.status !== 'PENDING') {
      return res.status(400).json({ error: { message: 'Request is not pending' } });
    }

    // Verify approver has access to an agency assigned to the office (unless super_admin)
    const loc = await OfficeLocation.findById(reqRow.location_id);
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Create assignment, then mark request approved
    const assignment = await OfficeRoomAssignment.create({
      roomId: reqRow.room_id,
      assignedUserId: reqRow.user_id,
      assignmentType: reqRow.request_type || 'ONE_TIME',
      startAt: reqRow.start_at,
      endAt: reqRow.end_at,
      sourceRequestId: reqRow.id,
      createdByUserId: req.user.id
    });

    // Create corresponding BOOKED office event (hourly source of truth for kiosk).
    // Note: current request model supports arbitrary windows; MVP assumes hourly blocks.
    try {
      const ev = await OfficeEvent.create({
        officeLocationId: reqRow.location_id,
        roomId: reqRow.room_id,
        startAt: reqRow.start_at,
        endAt: reqRow.end_at,
        status: 'BOOKED',
        assignedProviderId: reqRow.user_id,
        bookedProviderId: reqRow.user_id,
        source: 'PROVIDER_REQUEST',
        recurrenceGroupId: null,
        notes: reqRow.notes || null,
        createdByUserId: req.user.id,
        approvedByUserId: req.user.id
      });
      // Best-effort: mirror to Google Calendar (provider + room resource).
      try {
        await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId: ev?.id });
      } catch {
        // ignore
      }
    } catch {
      // best-effort: do not block approval if events table isn't present yet
    }

    const updatedReq = await OfficeRoomRequest.markDecided({
      requestId: reqRow.id,
      status: 'APPROVED',
      decidedByUserId: req.user.id
    });

    res.json({ request: updatedReq, assignment });
  } catch (e) {
    next(e);
  }
};

export const denyRequest = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can deny requests' } });
    }

    const { id } = req.params;
    const reqRow = await OfficeRoomRequest.findById(parseInt(id));
    if (!reqRow) return res.status(404).json({ error: { message: 'Request not found' } });
    if (reqRow.status !== 'PENDING') {
      return res.status(400).json({ error: { message: 'Request is not pending' } });
    }

    const loc = await OfficeLocation.findById(reqRow.location_id);
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const updatedReq = await OfficeRoomRequest.markDecided({
      requestId: reqRow.id,
      status: 'DENIED',
      decidedByUserId: req.user.id
    });

    res.json({ request: updatedReq });
  } catch (e) {
    next(e);
  }
};

// Public read-only board (no login). Requires ?key=ACCESS_KEY.
export const publicBoard = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { key, startAt, endAt } = req.query;

    if (!key) {
      return res.status(403).json({ error: { message: 'Access key required' } });
    }

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc || !loc.is_active) {
      return res.status(404).json({ error: { message: 'Location not found' } });
    }
    if (loc.access_key !== key) {
      return res.status(403).json({ error: { message: 'Invalid access key' } });
    }

    const windowStart = startAt || new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
    const windowEnd = endAt || new Date().toISOString().slice(0, 10) + 'T23:59:59.000Z';

    const rooms = await OfficeRoom.findByLocation(parseInt(locationId));
    const assignments = await OfficeRoomAssignment.findAssignmentsForLocationWindow({
      locationId: parseInt(locationId),
      startAt: windowStart,
      endAt: windowEnd
    });

    const assignmentByRoom = new Map();
    for (const a of assignments) {
      if (!assignmentByRoom.has(a.room_id)) assignmentByRoom.set(a.room_id, a);
    }

    const pending = await OfficeRoomRequest.listPendingForLocation(parseInt(locationId));
    const pendingByRoom = new Map();
    for (const r of pending) {
      if (r.start_at < windowEnd && r.end_at > windowStart) pendingByRoom.set(r.room_id, true);
    }

    const status = rooms.map((room) => {
      const a = assignmentByRoom.get(room.id);
      if (a) {
        return {
          roomId: room.id,
          roomName: room.name,
          svgRoomId: room.svg_room_id,
          status: 'occupied',
          clinicianDisplayName: formatClinicianName(a.first_name, a.last_name)
        };
      }
      if (pendingByRoom.get(room.id)) {
        return { roomId: room.id, roomName: room.name, svgRoomId: room.svg_room_id, status: 'pending', clinicianDisplayName: null };
      }
      return { roomId: room.id, roomName: room.name, svgRoomId: room.svg_room_id, status: 'available', clinicianDisplayName: null };
    });

    res.json({
      location: { id: loc.id, name: loc.name, timezone: loc.timezone, svg_markup: loc.svg_markup },
      window: { startAt: windowStart, endAt: windowEnd },
      rooms: status
    });
  } catch (e) {
    next(e);
  }
};

// Admin utilities (create location/room + update svg)
export const createLocation = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can create locations' } });
    }

    const { agencyId, name, timezone, svgMarkup } = req.body;
    if (!agencyId || !name) return res.status(400).json({ error: { message: 'agencyId and name are required' } });

    // Must belong to agency unless super_admin
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = userAgencies.some((a) => a.id === parseInt(agencyId));
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const loc = await OfficeLocation.create({ agencyId: parseInt(agencyId), name, timezone, svgMarkup: svgMarkup || null });
    // Ensure join table contains the creating agency (best-effort; OfficeLocation.create also does this).
    try {
      await OfficeLocationAgency.add({ officeLocationId: loc.id, agencyId: parseInt(agencyId) });
    } catch {
      // ignore
    }
    res.status(201).json(loc);
  } catch (e) {
    next(e);
  }
};

export const updateLocation = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can update locations' } });
    }

    const { id } = req.params;
    const loc = await OfficeLocation.findById(parseInt(id));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const updated = await OfficeLocation.update(loc.id, {
      name: req.body.name,
      timezone: req.body.timezone,
      svg_markup: req.body.svgMarkup,
      is_active: req.body.isActive,
      street_address: req.body.streetAddress,
      city: req.body.city,
      state: req.body.state,
      postal_code: req.body.postalCode
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const createRoom = async (req, res, next) => {
  try {
    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only CPA/admin can create rooms' } });
    }

    const { locationId } = req.params;
    const { name, svgRoomId, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });

    const loc = await OfficeLocation.findById(parseInt(locationId));
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });

    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = await OfficeLocationAgency.userHasAccess({
        officeLocationId: loc.id,
        agencyIds: userAgencies.map((a) => a.id)
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const room = await OfficeRoom.create({
      locationId: loc.id,
      name,
      svgRoomId: svgRoomId || null,
      sortOrder: Number.isFinite(parseInt(sortOrder)) ? parseInt(sortOrder) : 0
    });
    res.status(201).json(room);
  } catch (e) {
    next(e);
  }
};

