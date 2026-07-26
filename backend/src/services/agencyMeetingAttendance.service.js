import pool from '../config/database.js';
import { fetchMeetParticipantsForRecord } from './googleMeetTranscript.service.js';
import AgencyMeetingAttendanceRollup from '../models/AgencyMeetingAttendanceRollup.model.js';

async function syncCompensationClaimsSafe(eventId) {
  try {
    const { syncCompensationClaimsForEvent } = await import('./meetingCompensationClaims.service.js');
    return await syncCompensationClaimsForEvent({ eventId, allowScheduledFallback: true });
  } catch (e) {
    return { ok: false, error: e?.message || 'compensation_sync_failed' };
  }
}

/**
 * Sync attendance from Google Meet for a single TEAM_MEETING / HUDDLE event.
 * Matches participants by email to agency users and upserts rollups.
 * Also syncs Huddle / Admin Meeting / Town Hall compensation time claims.
 */
export async function syncAttendanceForEvent(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return { ok: false, reason: 'invalid_event_id', synced: 0 };

  const [rows] = await pool.execute(
    `SELECT pse.id, pse.agency_id, pse.provider_id, pse.kind, pse.meeting_subtype,
            pse.google_meet_link, pse.google_event_id, pse.start_at, u.email AS provider_email
     FROM provider_schedule_events pse
     JOIN users u ON u.id = pse.provider_id
     WHERE pse.id = ?
       AND UPPER(COALESCE(pse.kind, '')) IN ('TEAM_MEETING', 'HUDDLE')
       AND UPPER(COALESCE(pse.status, 'ACTIVE')) <> 'CANCELLED'
     LIMIT 1`,
    [eid]
  );
  const event = rows?.[0] || null;
  if (!event) return { ok: false, reason: 'event_not_found', synced: 0 };

  const meetLink = String(event.google_meet_link || '').trim();
  if (!meetLink) {
    const compensationClaims = await syncCompensationClaimsSafe(eid);
    return { ok: true, reason: 'no_meet_link', synced: 0, compensationClaims };
  }

  const hostEmail = String(event.provider_email || '').trim().toLowerCase();
  if (!hostEmail) {
    const compensationClaims = await syncCompensationClaimsSafe(eid);
    return { ok: false, reason: 'no_host_email', synced: 0, compensationClaims };
  }

  const result = await fetchMeetParticipantsForRecord({
    hostEmail,
    meetLink,
    googleEventId: event.google_event_id || null,
    sessionStartAt: event.start_at
  });

  if (!result.ok || !Array.isArray(result.participants)) {
    const compensationClaims = await syncCompensationClaimsSafe(eid);
    return {
      ok: false,
      reason: result.reason || 'fetch_failed',
      error: result.error,
      synced: 0,
      compensationClaims
    };
  }

  const agencyId = Number(event.agency_id || 0);
  if (!agencyId) {
    const compensationClaims = await syncCompensationClaimsSafe(eid);
    return { ok: false, reason: 'no_agency', synced: 0, compensationClaims };
  }

  const [userRows] = await pool.execute(
    `SELECT u.id, LOWER(TRIM(u.email)) AS email
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE u.email IS NOT NULL AND TRIM(u.email) <> ''`,
    [agencyId]
  );
  const emailToUserId = new Map((userRows || []).map((r) => [String(r.email || '').toLowerCase(), Number(r.id || 0)]));

  let synced = 0;
  // Platform video segments are authoritative for leave/rejoin accuracy.
  // Meet sync writes source='meet' segments only when the user has no platform segments.
  try {
    const {
      loadMeetingEvent,
      rebuildAttendanceRollupsFromSegments
    } = await import('./meetingAttendanceSegments.service.js');
    const meeting = await loadMeetingEvent(eid);
    const startAt = meeting?.start_at ? new Date(meeting.start_at) : null;
    const completedAt = meeting?.meeting_completed_at ? new Date(meeting.meeting_completed_at) : null;

    for (const p of result.participants) {
      const email = p?.email ? String(p.email).trim().toLowerCase() : null;
      if (!email) continue;
      const userId = emailToUserId.get(email);
      if (!userId) continue;

      const [plat] = await pool.execute(
        `SELECT 1 FROM provider_schedule_event_attendance_segments
         WHERE event_id = ? AND user_id = ? AND source = 'platform' LIMIT 1`,
        [eid, userId]
      );
      if (plat?.length) continue;

      let startMs = p?.earliestStartTime ? new Date(p.earliestStartTime).getTime() : NaN;
      let endMs = p?.latestEndTime ? new Date(p.latestEndTime).getTime() : NaN;
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        const totalSeconds = Math.max(0, Number(p.totalSeconds || 0));
        if (totalSeconds < 1) continue;
        endMs = Date.now();
        startMs = endMs - totalSeconds * 1000;
      }
      if (startAt && Number.isFinite(startAt.getTime()) && startMs < startAt.getTime()) {
        startMs = startAt.getTime();
      }
      if (completedAt && Number.isFinite(completedAt.getTime()) && endMs > completedAt.getTime()) {
        endMs = completedAt.getTime();
      }
      if (!(endMs > startMs)) continue;

      await pool.execute(
        `DELETE FROM provider_schedule_event_attendance_segments
         WHERE event_id = ? AND user_id = ? AND source = 'meet'`,
        [eid, userId]
      );
      const pad = (n) => String(n).padStart(2, '0');
      const toMysql = (ms) => {
        const d = new Date(ms);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      };
      await pool.execute(
        `INSERT INTO provider_schedule_event_attendance_segments
          (event_id, user_id, started_at, ended_at, source)
         VALUES (?, ?, ?, ?, 'meet')`,
        [eid, userId, toMysql(startMs), toMysql(endMs)]
      );
      synced += 1;
    }
    await rebuildAttendanceRollupsFromSegments(eid, { syncClaims: true });
  } catch (segErr) {
    // Fallback: direct rollup write (pre-migration).
    console.warn('[agencyMeetingAttendance] segment sync fallback', segErr?.message || segErr);
    for (const p of result.participants) {
      const email = p?.email ? String(p.email).trim().toLowerCase() : null;
      if (!email) continue;
      const userId = emailToUserId.get(email);
      if (!userId) continue;
      const totalSeconds = Math.max(0, Number(p.totalSeconds || 0));
      if (totalSeconds < 1) continue;
      await AgencyMeetingAttendanceRollup.upsert({
        eventId: eid,
        userId,
        totalSeconds,
        participantEmail: email
      });
      synced += 1;
    }
  }

  const compensationClaims = await syncCompensationClaimsSafe(eid);

  return {
    ok: true,
    synced,
    participantsTotal: result.participants.length,
    compensationClaims
  };
}

/**
 * Sync attendance for all TEAM_MEETING / HUDDLE events in a date range.
 */
export async function syncAttendanceForAgencyInWindow(agencyId, periodStart, periodEnd) {
  const aid = Number(agencyId || 0);
  const start = String(periodStart || '').slice(0, 10);
  const end = String(periodEnd || '').slice(0, 10);
  if (!aid || !start || !end) return { ok: false, reason: 'invalid_params', eventsProcessed: 0, totalSynced: 0 };

  const [rows] = await pool.execute(
    `SELECT id FROM provider_schedule_events
     WHERE agency_id = ?
       AND UPPER(COALESCE(kind, '')) IN ('TEAM_MEETING', 'HUDDLE')
       AND UPPER(COALESCE(status, 'ACTIVE')) <> 'CANCELLED'
       AND google_meet_link IS NOT NULL AND TRIM(google_meet_link) <> ''
       AND start_at >= ?
       AND start_at < DATE_ADD(?, INTERVAL 1 DAY)
     ORDER BY start_at ASC`,
    [aid, start, end]
  );

  let totalSynced = 0;
  const results = [];
  for (const r of rows || []) {
    const res = await syncAttendanceForEvent(r.id);
    results.push({ eventId: r.id, ...res });
    if (res.synced) totalSynced += res.synced;
  }

  // Also sync compensation claims for Admin/Town Hall/Huddle without Meet links (scheduled fallback).
  let compensation = null;
  try {
    const { syncCompensationClaimsForAgencyInWindow } = await import('./meetingCompensationClaims.service.js');
    compensation = await syncCompensationClaimsForAgencyInWindow(aid, start, end);
  } catch (e) {
    compensation = { ok: false, error: e?.message || 'compensation_sync_failed' };
  }

  return {
    ok: true,
    eventsProcessed: (rows || []).length,
    totalSynced,
    results,
    compensation
  };
}
