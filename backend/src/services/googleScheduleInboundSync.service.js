/**
 * Inbound Google Calendar → app schedule sync.
 *
 * When a Google-linked provider_schedule_event or supervision_session is moved
 * (or cancelled) in Google Calendar, update our DB so My Schedule matches.
 * Does NOT push changes back to Google (avoids sync loops).
 */
import User from '../models/User.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import GoogleCalendarService from './googleCalendar.service.js';
import { toMysqlUtcDateTime } from '../utils/officeEventDateTime.util.js';

const MEETING_KINDS = new Set(['TEAM_MEETING', 'HUDDLE']);

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Normalize to `YYYY-MM-DD HH:MM` for minute-level compare. */
function minuteKey(value) {
  const s = String(value || '').trim().replace('T', ' ');
  if (!s) return '';
  return s.slice(0, 16);
}

function ymdKey(value) {
  return String(value || '').trim().slice(0, 10);
}

/** RFC3339 / Date → MySQL UTC DATETIME (for Google-synced PSE rows). */
function googleTimedToMysqlUtc(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null; // all-day date
  return toMysqlUtcDateTime(raw);
}

/**
 * RFC3339 → wall `YYYY-MM-DD HH:MM:SS` (digits as Google shows them).
 * Used for supervision_sessions which store wall clock, not UTC.
 */
function googleTimedToMysqlWall(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!m) return null;
  return `${m[1]} ${m[2]}:${m[3]}:${pad2(Number(m[4] || 0))}`;
}

function isGoogleAllDay(startAt, endAt) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(startAt || '').trim())
    && /^\d{4}-\d{2}-\d{2}$/.test(String(endAt || '').trim());
}

function inWindow(startMysql, endMysql, windowStart, windowEnd) {
  const s = minuteKey(startMysql);
  const e = minuteKey(endMysql);
  const ws = minuteKey(windowStart);
  const we = minuteKey(windowEnd);
  if (!s || !e || !ws || !we) return true;
  return s < we && e > ws;
}

async function mapLimit(items, limit, fn) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i;
      i += 1;
      // eslint-disable-next-line no-await-in-loop
      out[idx] = await fn(list[idx], idx);
    }
  }
  const n = Math.max(1, Math.min(Number(limit) || 1, list.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * Reconcile Google-linked app rows against live Google Calendar data.
 *
 * @param {object} opts
 * @param {number} opts.viewedProviderId - calendar owner being loaded
 * @param {string} opts.viewedProviderEmail - their Workspace email (for listEvents host)
 * @param {Array} opts.scheduleEvents - mapped schedule-summary events
 * @param {Array} opts.supervisionSessions - mapped supervision sessions
 * @param {Array} opts.googleEvents - from GoogleCalendarService.listEvents
 * @param {string} [opts.windowStart]
 * @param {string} [opts.windowEnd]
 * @param {number|null} [opts.actorUserId]
 * @returns {Promise<{ scheduleEvents: Array, supervisionSessions: Array, updatedCount: number, cancelledCount: number }>}
 */
export async function reconcileGoogleLinkedSchedule({
  viewedProviderId,
  viewedProviderEmail,
  scheduleEvents = [],
  supervisionSessions = [],
  googleEvents = [],
  windowStart = null,
  windowEnd = null,
  actorUserId = null
} = {}) {
  if (!GoogleCalendarService.isConfigured()) {
    return { scheduleEvents, supervisionSessions, updatedCount: 0, cancelledCount: 0 };
  }

  const googleById = new Map();
  for (const ev of googleEvents || []) {
    const id = String(ev?.id || '').trim();
    if (id) googleById.set(id, ev);
  }

  const hostEmailCache = new Map();
  async function emailForHost(hostUserId) {
    const hid = Number(hostUserId || 0);
    if (!hid) return '';
    if (hid === Number(viewedProviderId || 0)) {
      return String(viewedProviderEmail || '').trim().toLowerCase();
    }
    if (hostEmailCache.has(hid)) return hostEmailCache.get(hid);
    const user = await User.findById(hid);
    const email = String(user?.email || '').trim().toLowerCase();
    hostEmailCache.set(hid, email);
    return email;
  }

  async function resolveGoogleEvent(googleEventId, hostEmail) {
    const gid = String(googleEventId || '').trim();
    if (!gid) return null;
    if (googleById.has(gid)) {
      const cached = googleById.get(gid);
      return {
        id: gid,
        startAt: cached.startAt,
        endAt: cached.endAt,
        status: String(cached.status || 'confirmed').toLowerCase(),
        allDay: isGoogleAllDay(cached.startAt, cached.endAt)
      };
    }
    const subject = String(hostEmail || '').trim().toLowerCase();
    if (!subject) return null;
    const r = await GoogleCalendarService.getEvent({
      subjectEmail: subject,
      eventId: gid
    });
    if (!r?.ok || !r.event) {
      if (r?.reason === 'event_not_found') {
        return { id: gid, status: 'cancelled', startAt: null, endAt: null, allDay: false };
      }
      return null;
    }
    return {
      id: gid,
      startAt: r.event.startAt,
      endAt: r.event.endAt,
      status: String(r.event.status || 'confirmed').toLowerCase(),
      allDay: !!r.event.allDay || isGoogleAllDay(r.event.startAt, r.event.endAt)
    };
  }

  let updatedCount = 0;
  let cancelledCount = 0;
  let rematerialize = false;
  const nextSchedule = Array.isArray(scheduleEvents) ? [...scheduleEvents] : [];
  const nextSupervision = Array.isArray(supervisionSessions) ? [...supervisionSessions] : [];

  // Update Google-linked rows that moved INTO this week (DB still has old times outside the window).
  // Caller rematerializes the week payload from DB after we return rematerialize=true.
  try {
    const listedIds = Array.from(googleById.keys());
    if (listedIds.length && Number(viewedProviderId || 0) > 0) {
      const known = new Set(
        nextSchedule.map((ev) => String(ev?.googleEventId || ev?.google_event_id || '').trim()).filter(Boolean)
      );
      const missingIds = listedIds.filter((id) => !known.has(id));
      if (missingIds.length) {
        const extras = await ProviderScheduleEvent.listByGoogleEventIds({
          providerId: viewedProviderId,
          googleEventIds: missingIds
        });
        await mapLimit(extras || [], 5, async (row) => {
          const gid = String(row?.google_event_id || '').trim();
          if (!gid) return;
          const g = googleById.get(gid);
          if (!g?.startAt || !g?.endAt) return;
          const hostId = Number(row.provider_id || viewedProviderId);
          if (isGoogleAllDay(g.startAt, g.endAt)) {
            const startDate = ymdKey(g.startAt);
            const endDate = ymdKey(g.endAt);
            if (!startDate || !endDate) return;
            if (ymdKey(row.start_date) === startDate && ymdKey(row.end_date) === endDate) return;
            await ProviderScheduleEvent.updateForProvider({
              eventId: Number(row.id),
              providerId: hostId,
              allDay: true,
              startAt: null,
              endAt: null,
              startDate,
              endDate,
              updatedByUserId: actorUserId
            });
            updatedCount += 1;
            rematerialize = true;
            return;
          }
          const nextStartUtc = googleTimedToMysqlUtc(g.startAt);
          const nextEndUtc = googleTimedToMysqlUtc(g.endAt);
          if (!nextStartUtc || !nextEndUtc) return;
          if (minuteKey(row.start_at) === minuteKey(nextStartUtc)
            && minuteKey(row.end_at) === minuteKey(nextEndUtc)) return;
          await ProviderScheduleEvent.updateForProvider({
            eventId: Number(row.id),
            providerId: hostId,
            allDay: false,
            startAt: nextStartUtc,
            endAt: nextEndUtc,
            startDate: null,
            endDate: null,
            updatedByUserId: actorUserId
          });
          updatedCount += 1;
          rematerialize = true;
        });
      }
    }
  } catch (e) {
    console.warn('[googleInboundSync] listByGoogleEventIds failed', e?.message || e);
  }

  // --- provider_schedule_events ---
  const scheduleTargets = nextSchedule
    .map((ev, idx) => ({ ev, idx }))
    .filter(({ ev }) => {
      const gid = String(ev?.googleEventId || ev?.google_event_id || '').trim();
      const status = String(ev?.status || 'ACTIVE').toUpperCase();
      return gid && status !== 'CANCELLED';
    });

  await mapLimit(scheduleTargets, 5, async ({ ev, idx }) => {
    const gid = String(ev.googleEventId || ev.google_event_id || '').trim();
    const hostId = Number(ev.providerId || viewedProviderId || 0);
    const hostEmail = await emailForHost(hostId);
    const g = await resolveGoogleEvent(gid, hostEmail);
    if (!g) return;

    if (g.status === 'cancelled') {
      try {
        await ProviderScheduleEvent.cancelByIds({
          eventIds: [Number(ev.id)],
          updatedByUserId: actorUserId
        });
        cancelledCount += 1;
        rematerialize = true;
        nextSchedule[idx] = {
          ...ev,
          status: 'CANCELLED',
          isCancelled: true,
          canEdit: false
        };
      } catch (e) {
        console.warn('[googleInboundSync] cancel schedule event failed', ev.id, e?.message || e);
      }
      return;
    }

    if (!g.startAt || !g.endAt) return;

    if (g.allDay) {
      const startDate = ymdKey(g.startAt);
      const endDate = ymdKey(g.endAt);
      if (!startDate || !endDate) return;
      const curStart = ymdKey(ev.startDate);
      const curEnd = ymdKey(ev.endDate);
      if (curStart === startDate && curEnd === endDate && ev.allDay) return;
      try {
        await ProviderScheduleEvent.updateForProvider({
          eventId: Number(ev.id),
          providerId: hostId || Number(viewedProviderId),
          allDay: true,
          startAt: null,
          endAt: null,
          startDate,
          endDate,
          updatedByUserId: actorUserId
        });
        updatedCount += 1;
        rematerialize = true;
        nextSchedule[idx] = {
          ...ev,
          allDay: true,
          startAt: null,
          endAt: null,
          startDate,
          endDate
        };
      } catch (e) {
        console.warn('[googleInboundSync] update all-day schedule event failed', ev.id, e?.message || e);
      }
      return;
    }

    const nextStartUtc = googleTimedToMysqlUtc(g.startAt);
    const nextEndUtc = googleTimedToMysqlUtc(g.endAt);
    if (!nextStartUtc || !nextEndUtc) return;

    // App rows with google_event_id are stored as UTC instants (summary may return ISO Z).
    const curStartKey = minuteKey(toMysqlUtcDateTime(ev.startAt));
    const curEndKey = minuteKey(toMysqlUtcDateTime(ev.endAt));
    const nextStartKey = minuteKey(nextStartUtc);
    const nextEndKey = minuteKey(nextEndUtc);
    if (curStartKey === nextStartKey && curEndKey === nextEndKey) return;

    try {
      await ProviderScheduleEvent.updateForProvider({
        eventId: Number(ev.id),
        providerId: hostId || Number(viewedProviderId),
        allDay: false,
        startAt: nextStartUtc,
        endAt: nextEndUtc,
        startDate: null,
        endDate: null,
        updatedByUserId: actorUserId
      });
      updatedCount += 1;
      rematerialize = true;
      const startIso = toMysqlUtcDateTime(nextStartUtc)
        ? new Date(`${String(nextStartUtc).replace(' ', 'T')}Z`).toISOString()
        : null;
      const endIso = toMysqlUtcDateTime(nextEndUtc)
        ? new Date(`${String(nextEndUtc).replace(' ', 'T')}Z`).toISOString()
        : null;
      const stillInWindow = inWindow(nextStartUtc, nextEndUtc, windowStart, windowEnd);
      nextSchedule[idx] = {
        ...ev,
        allDay: false,
        startAt: startIso,
        endAt: endIso,
        startDate: null,
        endDate: null,
        _inboundMovedOutOfWindow: !stillInWindow
      };
    } catch (e) {
      console.warn('[googleInboundSync] update schedule event failed', ev.id, e?.message || e);
    }
  });

  // Drop cancelled / moved-out-of-window from the visible week payload.
  const filteredSchedule = nextSchedule.filter((ev) => {
    if (!ev) return false;
    if (ev._inboundMovedOutOfWindow) return false;
    if (String(ev.status || '').toUpperCase() === 'CANCELLED') return false;
    return true;
  }).map((ev) => {
    if (!ev || ev._inboundMovedOutOfWindow === undefined) return ev;
    const { _inboundMovedOutOfWindow, ...rest } = ev;
    return rest;
  });

  // --- supervision_sessions (wall-clock storage) ---
  const supvTargets = nextSupervision
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => {
      const gid = String(s?.googleEventId || s?.google_event_id || '').trim();
      const status = String(s?.status || '').toUpperCase();
      return gid && status !== 'CANCELLED';
    });

  await mapLimit(supvTargets, 5, async ({ s, idx }) => {
    const gid = String(s.googleEventId || s.google_event_id || '').trim();
    const hostId = Number(s.supervisorUserId || s.supervisor_user_id || viewedProviderId || 0);
    const hostEmail = await emailForHost(hostId);
    const g = await resolveGoogleEvent(gid, hostEmail);
    if (!g) return;

    if (g.status === 'cancelled') {
      try {
        await SupervisionSession.cancel(Number(s.id));
        cancelledCount += 1;
        rematerialize = true;
        nextSupervision[idx] = { ...s, status: 'CANCELLED' };
      } catch (e) {
        console.warn('[googleInboundSync] cancel supervision failed', s.id, e?.message || e);
      }
      return;
    }

    if (!g.startAt || !g.endAt || g.allDay) return;

    const nextStartWall = googleTimedToMysqlWall(g.startAt);
    const nextEndWall = googleTimedToMysqlWall(g.endAt);
    if (!nextStartWall || !nextEndWall) return;

    const curStart = minuteKey(s.startAt || s.startWall);
    const curEnd = minuteKey(s.endAt || s.endWall);
    if (curStart === minuteKey(nextStartWall) && curEnd === minuteKey(nextEndWall)) return;

    try {
      await SupervisionSession.updateById(Number(s.id), {
        startAt: nextStartWall,
        endAt: nextEndWall
      });
      updatedCount += 1;
      rematerialize = true;
      const wallStartIso = nextStartWall.replace(' ', 'T');
      const wallEndIso = nextEndWall.replace(' ', 'T');
      const stillInWindow = inWindow(nextStartWall, nextEndWall, windowStart, windowEnd);
      nextSupervision[idx] = {
        ...s,
        startAt: wallStartIso,
        endAt: wallEndIso,
        startWall: wallStartIso,
        endWall: wallEndIso,
        _inboundMovedOutOfWindow: !stillInWindow
      };
    } catch (e) {
      console.warn('[googleInboundSync] update supervision failed', s.id, e?.message || e);
    }
  });

  const filteredSupervision = nextSupervision.filter((s) => {
    if (!s) return false;
    if (s._inboundMovedOutOfWindow) return false;
    if (String(s.status || '').toUpperCase() === 'CANCELLED') return false;
    return true;
  }).map((s) => {
    if (!s || s._inboundMovedOutOfWindow === undefined) return s;
    const { _inboundMovedOutOfWindow, ...rest } = s;
    return rest;
  });

  if (updatedCount || cancelledCount) {
    console.info('[googleInboundSync] reconciled', {
      viewedProviderId,
      updatedCount,
      cancelledCount
    });
  }

  return {
    scheduleEvents: filteredSchedule,
    supervisionSessions: filteredSupervision,
    updatedCount,
    cancelledCount,
    rematerialize
  };
}

export default {
  reconcileGoogleLinkedSchedule,
  MEETING_KINDS
};
