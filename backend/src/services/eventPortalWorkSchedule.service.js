import pool from '../config/database.js';

function parsePositiveInt(raw) {
  const value = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function toDateOnlyString(input) {
  if (input == null || input === '') return null;
  if (input instanceof Date && Number.isFinite(input.getTime())) {
    return input.toISOString().slice(0, 10);
  }
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function formatHm(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function availabilityLabel(row) {
  const primary = String(row?.availability || '').toLowerCase();
  const parts = [];
  if (primary === 'slot') parts.push('Available for a slot');
  else if (primary === 'waitlist') parts.push('Waitlist');
  else if (primary === 'oncall') parts.push('On-call');
  else if (primary === 'available') parts.push('Available');
  else return null;

  if (row?.waitlistWilling && primary !== 'waitlist') parts.push('also waitlist');
  if (row?.oncallWilling && primary !== 'oncall') parts.push('also on-call');
  return parts.join(' · ');
}

function assignmentStatusLabel(status) {
  const s = String(status || 'draft').toLowerCase();
  if (s === 'finalized') return 'Confirmed';
  if (s === 'tentative') return 'Tentative';
  if (s === 'draft') return 'Draft assignment';
  return s;
}

async function loadProgramEventAvailability({ eventId, userId }) {
  try {
    const [rows] = await pool.execute(
      `SELECT fade.entry_date,
              fade.availability,
              fade.waitlist_willing,
              fade.oncall_willing,
              fade.comment,
              cesd.id AS session_date_id,
              cesd.starts_at,
              cesd.ends_at,
              cesd.timezone
       FROM facilitator_availability_date_entries fade
       LEFT JOIN company_event_session_dates cesd
         ON cesd.company_event_id = fade.company_event_id
        AND cesd.session_date = fade.entry_date
       WHERE fade.company_event_id = ? AND fade.user_id = ?
         AND fade.availability IN ('slot', 'waitlist', 'oncall', 'available')
       ORDER BY fade.entry_date ASC, cesd.id ASC`,
      [eventId, userId]
    );
    return (rows || []).map((r) => ({
      sessionDate: toDateOnlyString(r.entry_date),
      sessionDateId: r.session_date_id ? Number(r.session_date_id) : null,
      availability: String(r.availability || ''),
      availabilityLabel: availabilityLabel({
        availability: r.availability,
        waitlistWilling: r.waitlist_willing === 1 || r.waitlist_willing === true,
        oncallWilling: r.oncall_willing === 1 || r.oncall_willing === true
      }),
      waitlistWilling: !!(r.waitlist_willing === 1 || r.waitlist_willing === true),
      oncallWilling: !!(r.oncall_willing === 1 || r.oncall_willing === true),
      comment: r.comment ? String(r.comment).trim() : null,
      startsAt: r.starts_at || null,
      endsAt: r.ends_at || null,
      timezone: r.timezone ? String(r.timezone).trim() : null
    })).filter((r) => r.sessionDate && r.availabilityLabel);
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

async function loadProgramEventBookings({ eventId, agencyId, userId }) {
  const bookings = [];
  try {
    const [rows] = await pool.execute(
      `SELECT cesd.id AS session_date_id,
              cesd.session_date,
              cesd.starts_at,
              cesd.ends_at,
              cesd.timezone,
              cesp.assignment_status,
              cesp.assigned_at
       FROM company_event_session_providers cesp
       INNER JOIN company_event_session_dates cesd ON cesd.id = cesp.session_date_id
       WHERE cesp.company_event_id = ? AND cesp.agency_id = ? AND cesp.provider_user_id = ?
       ORDER BY cesd.session_date ASC, cesd.id ASC`,
      [eventId, agencyId, userId]
    );
    for (const r of rows || []) {
      bookings.push({
        kind: 'session',
        sessionDate: toDateOnlyString(r.session_date),
        sessionDateId: Number(r.session_date_id),
        startsAt: r.starts_at || null,
        endsAt: r.ends_at || null,
        timezone: r.timezone ? String(r.timezone).trim() : null,
        assignmentStatus: String(r.assignment_status || 'draft'),
        assignmentStatusLabel: assignmentStatusLabel(r.assignment_status),
        assignedAt: r.assigned_at || null
      });
    }
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  if (!bookings.length) {
    try {
      const [epa] = await pool.execute(
        `SELECT assigned_at, virtual_access_role
         FROM company_event_provider_assignments
         WHERE company_event_id = ? AND provider_user_id = ?
         LIMIT 1`,
        [eventId, userId]
      );
      if (epa?.[0]) {
        bookings.push({
          kind: 'event',
          sessionDate: null,
          sessionDateId: null,
          startsAt: null,
          endsAt: null,
          timezone: null,
          assignmentStatus: 'assigned',
          assignmentStatusLabel: 'Assigned to event',
          assignedAt: epa[0].assigned_at || null,
          virtualAccessRole: epa[0].virtual_access_role || null
        });
      }
    } catch {
      // optional table
    }
  }

  return bookings;
}

async function loadSkillsGroupWeeklyPattern({ eventId, agencyId, userId }) {
  try {
    const [rows] = await pool.execute(
      `SELECT sg.name AS skills_group_name,
              m.weekday,
              m.start_time,
              m.end_time
       FROM skills_group_providers sgp
       INNER JOIN skills_groups sg ON sg.id = sgp.skills_group_id AND sg.agency_id = ?
       INNER JOIN skills_group_meetings m ON m.skills_group_id = sg.id
       WHERE sg.company_event_id = ? AND sgp.provider_user_id = ?
       ORDER BY FIELD(m.weekday,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), m.start_time ASC`,
      [agencyId, eventId, userId]
    );
    return (rows || []).map((r) => ({
      skillsGroupName: r.skills_group_name || '',
      weekday: r.weekday || '',
      startTime: formatHm(r.start_time),
      endTime: formatHm(r.end_time)
    }));
  } catch {
    return [];
  }
}

async function loadSkillsGroupSessionBookings({ eventId, userId }) {
  try {
    const [rows] = await pool.execute(
      `SELECT s.id AS session_id,
              s.session_date,
              s.weekday,
              s.start_time,
              s.end_time,
              s.location_label,
              sg.name AS skills_group_name
       FROM skill_builders_event_sessions s
       INNER JOIN skills_groups sg ON sg.company_event_id = s.company_event_id
       INNER JOIN skill_builders_event_session_providers p
         ON p.session_id = s.id AND p.provider_user_id = ?
       WHERE s.company_event_id = ?
       ORDER BY s.session_date ASC, s.id ASC
       LIMIT 500`,
      [userId, eventId]
    );
    return (rows || []).map((r) => ({
      kind: 'session',
      sessionId: Number(r.session_id),
      sessionDate: toDateOnlyString(r.session_date),
      weekday: r.weekday || '',
      startTime: formatHm(r.start_time),
      endTime: formatHm(r.end_time),
      locationLabel: r.location_label ? String(r.location_label).trim() : null,
      skillsGroupName: r.skills_group_name || '',
      assignmentStatus: 'assigned',
      assignmentStatusLabel: 'Scheduled'
    }));
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

/** Event-portal work schedule for one provider on one company event. */
export async function fetchMyEventPortalWorkSchedule({ agencyId, eventId, userId }) {
  const aid = parsePositiveInt(agencyId);
  const eid = parsePositiveInt(eventId);
  const uid = parsePositiveInt(userId);
  if (!aid || !eid || !uid) {
    return { error: { status: 400, message: 'agencyId, eventId, and userId are required' } };
  }

  const [evRows] = await pool.execute(
    `SELECT ce.id, ce.title, ce.event_type, sg.id AS skills_group_id
     FROM company_events ce
     LEFT JOIN skills_groups sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
     WHERE ce.id = ? AND ce.agency_id = ?
     LIMIT 1`,
    [eid, aid]
  );
  const ev = evRows?.[0];
  if (!ev) return { error: { status: 404, message: 'Event not found' } };

  const isSkillsGroupEvent = String(ev.event_type || '').trim().toLowerCase() === 'skills_group'
    || !!ev.skills_group_id;

  if (isSkillsGroupEvent) {
    const [weeklyPattern, availability, bookings] = await Promise.all([
      loadSkillsGroupWeeklyPattern({ eventId: eid, agencyId: aid, userId: uid }),
      loadProgramEventAvailability({ eventId: eid, userId: uid }),
      loadSkillsGroupSessionBookings({ eventId: eid, userId: uid })
    ]);
    return {
      ok: true,
      eventId: eid,
      eventTitle: ev.title || '',
      mode: 'skills_group',
      weeklyPattern,
      availability,
      bookings
    };
  }

  const [availability, bookings] = await Promise.all([
    loadProgramEventAvailability({ eventId: eid, userId: uid }),
    loadProgramEventBookings({ eventId: eid, agencyId: aid, userId: uid })
  ]);

  return {
    ok: true,
    eventId: eid,
    eventTitle: ev.title || '',
    mode: 'program_event',
    weeklyPattern: [],
    availability,
    bookings
  };
}
