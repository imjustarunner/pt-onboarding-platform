import pool from '../config/database.js';
import { fetchMeetParticipantsForRecord } from './googleMeetTranscript.service.js';
import AgencyMeetingAttendanceRollup from '../models/AgencyMeetingAttendanceRollup.model.js';

/**
 * Sync attendance from Google Meet for a single TEAM_MEETING event.
 * Matches participants by email to agency users and upserts rollups.
 */
export async function syncAttendanceForEvent(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return { ok: false, reason: 'invalid_event_id', synced: 0 };

  const [rows] = await pool.execute(
    `SELECT pse.id, pse.agency_id, pse.provider_id, pse.google_meet_link, pse.google_event_id, pse.start_at, u.email AS provider_email
     FROM provider_schedule_events pse
     JOIN users u ON u.id = pse.provider_id
     WHERE pse.id = ?
       AND UPPER(COALESCE(pse.kind, '')) = 'TEAM_MEETING'
       AND UPPER(COALESCE(pse.status, 'ACTIVE')) <> 'CANCELLED'
     LIMIT 1`,
    [eid]
  );
  const event = rows?.[0] || null;
  if (!event) return { ok: false, reason: 'event_not_found', synced: 0 };

  const meetLink = String(event.google_meet_link || '').trim();
  if (!meetLink) return { ok: false, reason: 'no_meet_link', synced: 0 };

  const hostEmail = String(event.provider_email || '').trim().toLowerCase();
  if (!hostEmail) return { ok: false, reason: 'no_host_email', synced: 0 };

  const result = await fetchMeetParticipantsForRecord({
    hostEmail,
    meetLink,
    googleEventId: event.google_event_id || null,
    sessionStartAt: event.start_at
  });

  if (!result.ok || !Array.isArray(result.participants)) {
    return {
      ok: false,
      reason: result.reason || 'fetch_failed',
      error: result.error,
      synced: 0
    };
  }

  const agencyId = Number(event.agency_id || 0);
  if (!agencyId) return { ok: false, reason: 'no_agency', synced: 0 };

  const [userRows] = await pool.execute(
    `SELECT u.id, LOWER(TRIM(u.email)) AS email
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE u.email IS NOT NULL AND TRIM(u.email) <> ''`,
    [agencyId]
  );
  const emailToUserId = new Map((userRows || []).map((r) => [String(r.email || '').toLowerCase(), Number(r.id || 0)]));

  let synced = 0;
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

  return { ok: true, synced, participantsTotal: result.participants.length };
}

/**
 * Sync attendance for all TEAM_MEETING events in a date range.
 */
export async function syncAttendanceForAgencyInWindow(agencyId, periodStart, periodEnd) {
  const aid = Number(agencyId || 0);
  const start = String(periodStart || '').slice(0, 10);
  const end = String(periodEnd || '').slice(0, 10);
  if (!aid || !start || !end) return { ok: false, reason: 'invalid_params', eventsProcessed: 0, totalSynced: 0 };

  const [rows] = await pool.execute(
    `SELECT id FROM provider_schedule_events
     WHERE agency_id = ?
       AND UPPER(COALESCE(kind, '')) = 'TEAM_MEETING'
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

  return {
    ok: true,
    eventsProcessed: (rows || []).length,
    totalSynced,
    results
  };
}
