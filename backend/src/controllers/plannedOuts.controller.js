import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import PlannedOut from '../models/PlannedOut.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';

function roleOf(req) {
  return String(req.user?.role || '').toLowerCase();
}

function isManager(req) {
  return ['super_admin', 'admin', 'support'].includes(roleOf(req));
}

async function ensureAgencyAccess(req, agencyId) {
  const aid = parseInt(agencyId, 10);
  if (!aid) return { ok: false, status: 400, message: 'Invalid agencyId' };
  const agency = await Agency.findById(aid);
  if (!agency) return { ok: false, status: 404, message: 'Agency not found' };
  if (roleOf(req) !== 'super_admin') {
    const agencies = await User.getAgencies(req.user.id);
    const hasAccess = (agencies || []).some((a) => parseInt(a.id, 10) === aid);
    if (!hasAccess) return { ok: false, status: 403, message: 'Access denied' };
  }
  return { ok: true, agency, agencyId: aid };
}

function ymd(raw) {
  const s = String(raw || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function addDaysYmd(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function asMysqlDateTime(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const naive = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/);
  if (naive) return `${naive[1]} ${naive[2]}${naive[3] || ':00'}`;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildDescription(body) {
  const bits = [];
  const avail = String(body.availability || 'unavailable');
  bits.push(avail === 'available' ? 'Available' : 'Unavailable');
  const em = String(body.emergencies || 'none');
  if (em === 'okay') bits.push('Emergencies Okay');
  else if (em === 'redirect') {
    const name = String(body.emergenciesRedirectName || '').trim();
    bits.push(name ? `Emergencies to ${name}` : 'Emergencies redirected');
  } else bits.push('--');
  const contact = String(body.contactPreference || 'none');
  if (contact === 'call_only') bits.push('Call Only');
  else if (contact === 'email_only') bits.push('Email Only');
  else bits.push('--');
  if (body.details) bits.push(String(body.details).trim());
  return bits.join(' | ');
}

function buildTitle(userName, spanType) {
  const name = String(userName || 'Team member').trim() || 'Team member';
  if (spanType === 'all_day') return `${name} — Planned out (all day)`;
  if (spanType === 'half_day') return `${name} — Planned out (half day)`;
  return `${name} — Planned out`;
}

async function createScheduleBlockForOut({ req, agencyId, userId, payload, userName }) {
  const description = buildDescription(payload);
  const title = buildTitle(userName, payload.spanType);
  const allDay = payload.spanType === 'all_day' || !!payload.allDay;
  return ProviderScheduleEvent.create({
    agencyId,
    providerId: userId,
    kind: 'SCHEDULE_HOLD',
    title,
    description,
    reasonCode: 'PLANNED_OUT',
    isPrivate: false,
    allDay,
    startAt: allDay ? null : payload.startAt,
    endAt: allDay ? null : payload.endAt,
    startDate: allDay ? payload.startDate : null,
    endDate: allDay ? payload.endDate : null,
    createdByUserId: req.user.id
  });
}

function normalizePayload(body = {}) {
  const spanTypeRaw = String(body.spanType || body.span_type || 'hours').toLowerCase();
  const spanType = ['hours', 'half_day', 'all_day'].includes(spanTypeRaw) ? spanTypeRaw : 'hours';
  const allDay = spanType === 'all_day' || body.allDay === true;
  let startDate = ymd(body.startDate || body.start_date);
  let endDate = ymd(body.endDate || body.end_date);
  let startAt = asMysqlDateTime(body.startAt || body.start_at);
  let endAt = asMysqlDateTime(body.endAt || body.end_at);
  let halfDayPart = null;

  if (spanType === 'half_day') {
    halfDayPart = String(body.halfDayPart || body.half_day_part || 'am').toLowerCase() === 'pm' ? 'pm' : 'am';
    const day = startDate || ymd(body.date) || (startAt ? String(startAt).slice(0, 10) : null);
    if (!day) throw Object.assign(new Error('half-day planned out requires a date'), { status: 400 });
    startDate = day;
    endDate = addDaysYmd(day, 1);
    startAt = `${day} ${halfDayPart === 'am' ? '08:00:00' : '12:00:00'}`;
    endAt = `${day} ${halfDayPart === 'am' ? '12:00:00' : '17:00:00'}`;
  } else if (allDay || spanType === 'all_day') {
    if (!startDate) throw Object.assign(new Error('all-day planned out requires startDate'), { status: 400 });
    if (!endDate) endDate = addDaysYmd(startDate, 1);
    if (endDate <= startDate) endDate = addDaysYmd(startDate, 1);
    startAt = null;
    endAt = null;
  } else {
    if (!startAt || !endAt) {
      throw Object.assign(new Error('timed planned out requires startAt and endAt'), { status: 400 });
    }
    if (new Date(endAt) <= new Date(startAt)) {
      throw Object.assign(new Error('endAt must be after startAt'), { status: 400 });
    }
    startDate = String(startAt).slice(0, 10);
    endDate = String(endAt).slice(0, 10);
  }

  const availability = String(body.availability || 'unavailable').toLowerCase() === 'available'
    ? 'available'
    : 'unavailable';
  const emergenciesRaw = String(body.emergencies || 'none').toLowerCase();
  const emergencies = ['okay', 'redirect', 'none'].includes(emergenciesRaw) ? emergenciesRaw : 'none';
  const contactRaw = String(body.contactPreference || body.contact_preference || 'none').toLowerCase();
  const contactPreference = ['call_only', 'email_only', 'none'].includes(contactRaw) ? contactRaw : 'none';

  return {
    spanType: allDay ? 'all_day' : spanType,
    halfDayPart,
    allDay: allDay || spanType === 'all_day',
    startAt,
    endAt,
    startDate,
    endDate,
    availability,
    emergencies,
    emergenciesRedirectUserId: body.emergenciesRedirectUserId || body.emergencies_redirect_user_id || null,
    emergenciesRedirectName: String(body.emergenciesRedirectName || body.emergencies_redirect_name || '').trim() || null,
    contactPreference,
    details: String(body.details || '').trim() || null
  };
}

export const listPlannedOuts = async (req, res, next) => {
  try {
    if (!(await PlannedOut.tableExists())) {
      return res.status(503).json({ error: { message: 'Planned outs not available — run migration 1014' } });
    }
    const access = await ensureAgencyAccess(req, req.query.agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const upcomingOnly = String(req.query.upcomingOnly ?? '1') !== '0';
    const items = await PlannedOut.listForAgency({
      agencyId: access.agencyId,
      upcomingOnly,
      limit: Number(req.query.limit) || 100
    });
    return res.json({ plannedOuts: items });
  } catch (e) {
    return next(e);
  }
};

export const createPlannedOut = async (req, res, next) => {
  try {
    if (!(await PlannedOut.tableExists())) {
      return res.status(503).json({ error: { message: 'Planned outs not available — run migration 1014' } });
    }
    const access = await ensureAgencyAccess(req, req.body?.agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const targetUserId = Number(req.body?.userId || req.user.id);
    if (!targetUserId) {
      return res.status(400).json({ error: { message: 'userId is required' } });
    }
    if (targetUserId !== Number(req.user.id) && !isManager(req)) {
      return res.status(403).json({ error: { message: 'Only admins can submit planned outs for others' } });
    }

    let payload;
    try {
      payload = normalizePayload(req.body || {});
    } catch (err) {
      return res.status(err.status || 400).json({ error: { message: err.message } });
    }

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });
    const userName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email;

    if (payload.emergencies === 'redirect' && payload.emergenciesRedirectUserId) {
      const redirectUser = await User.findById(payload.emergenciesRedirectUserId);
      if (redirectUser) {
        payload.emergenciesRedirectName = [redirectUser.first_name, redirectUser.last_name]
          .filter(Boolean).join(' ').trim() || payload.emergenciesRedirectName;
      }
    }

    const event = await createScheduleBlockForOut({
      req,
      agencyId: access.agencyId,
      userId: targetUserId,
      payload,
      userName
    });

    const created = await PlannedOut.create({
      agencyId: access.agencyId,
      userId: targetUserId,
      submittedByUserId: req.user.id,
      status: 'pending',
      ...payload,
      scheduleEventId: event?.id || null
    });

    return res.status(201).json({ plannedOut: created });
  } catch (e) {
    return next(e);
  }
};

export const deletePlannedOut = async (req, res, next) => {
  try {
    if (!(await PlannedOut.tableExists())) {
      return res.status(503).json({ error: { message: 'Planned outs not available — run migration 1014' } });
    }
    const row = await PlannedOut.findById(req.params.id);
    if (!row) return res.status(404).json({ error: { message: 'Planned out not found' } });
    const access = await ensureAgencyAccess(req, row.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const isOwner = Number(row.user_id) === Number(req.user.id);
    if (!isOwner && !isManager(req)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (row.schedule_event_id) {
      await ProviderScheduleEvent.cancelByIds({
        eventIds: [row.schedule_event_id],
        updatedByUserId: req.user.id
      });
    }
    await PlannedOut.deleteById(row.id);
    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
};

export const reviewPlannedOut = async (req, res, next) => {
  try {
    if (!(await PlannedOut.tableExists())) {
      return res.status(503).json({ error: { message: 'Planned outs not available — run migration 1014' } });
    }
    if (!isManager(req)) {
      return res.status(403).json({ error: { message: 'Only admins can review planned outs' } });
    }
    const row = await PlannedOut.findById(req.params.id);
    if (!row) return res.status(404).json({ error: { message: 'Planned out not found' } });
    const access = await ensureAgencyAccess(req, row.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const action = String(req.body?.action || '').toLowerCase();
    const comment = String(req.body?.comment || req.body?.adminComment || '').trim() || null;
    if (!['approve', 'reject', 'revision'].includes(action)) {
      return res.status(400).json({ error: { message: 'action must be approve, reject, or revision' } });
    }
    if ((action === 'reject' || action === 'revision') && !comment) {
      return res.status(400).json({ error: { message: 'A comment is required for reject / revision' } });
    }

    if (action === 'reject' && row.schedule_event_id) {
      await ProviderScheduleEvent.cancelByIds({
        eventIds: [row.schedule_event_id],
        updatedByUserId: req.user.id
      });
    }

    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'revision';
    const updated = await PlannedOut.updateById(row.id, {
      status,
      adminComment: comment,
      reviewedByUserId: req.user.id,
      reviewedAt: asMysqlDateTime(new Date()),
      scheduleEventId: action === 'reject' ? null : row.schedule_event_id
    });
    return res.json({ plannedOut: updated });
  } catch (e) {
    return next(e);
  }
};

export const updatePlannedOut = async (req, res, next) => {
  try {
    if (!(await PlannedOut.tableExists())) {
      return res.status(503).json({ error: { message: 'Planned outs not available — run migration 1014' } });
    }
    const row = await PlannedOut.findById(req.params.id);
    if (!row) return res.status(404).json({ error: { message: 'Planned out not found' } });
    const access = await ensureAgencyAccess(req, row.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const isOwner = Number(row.user_id) === Number(req.user.id);
    if (!isOwner && !isManager(req)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!['pending', 'revision'].includes(String(row.status)) && !isManager(req)) {
      return res.status(400).json({ error: { message: 'Only pending or revision items can be edited' } });
    }

    let payload;
    try {
      payload = normalizePayload({
        spanType: req.body?.spanType || row.span_type,
        halfDayPart: req.body?.halfDayPart ?? row.half_day_part,
        allDay: req.body?.allDay ?? row.all_day,
        startAt: req.body?.startAt ?? row.start_at,
        endAt: req.body?.endAt ?? row.end_at,
        startDate: req.body?.startDate ?? row.start_date,
        endDate: req.body?.endDate ?? row.end_date,
        availability: req.body?.availability ?? row.availability,
        emergencies: req.body?.emergencies ?? row.emergencies,
        emergenciesRedirectUserId: req.body?.emergenciesRedirectUserId ?? row.emergencies_redirect_user_id,
        emergenciesRedirectName: req.body?.emergenciesRedirectName ?? row.emergencies_redirect_name,
        contactPreference: req.body?.contactPreference ?? row.contact_preference,
        details: req.body?.details !== undefined ? req.body.details : row.details
      });
    } catch (err) {
      return res.status(err.status || 400).json({ error: { message: err.message } });
    }

    if (row.schedule_event_id) {
      await ProviderScheduleEvent.cancelByIds({
        eventIds: [row.schedule_event_id],
        updatedByUserId: req.user.id
      });
    }
    const user = await User.findById(row.user_id);
    const userName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.email;
    const event = await createScheduleBlockForOut({
      req,
      agencyId: access.agencyId,
      userId: row.user_id,
      payload,
      userName
    });

    const updated = await PlannedOut.updateById(row.id, {
      ...payload,
      status: 'pending',
      adminComment: null,
      scheduleEventId: event?.id || null,
      reviewedByUserId: null,
      reviewedAt: null
    });
    return res.json({ plannedOut: updated });
  } catch (e) {
    return next(e);
  }
};
