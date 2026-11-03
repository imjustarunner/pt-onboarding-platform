const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ymd(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
}

function localToday(now, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone || 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = type => parts.find(part => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function parseContext(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

// This is a read-only view of reserved office hours. Do not materialize events or
// equate one recurring hour with the number of future appointment occurrences.
export async function loadOfficeWorkspaceAssignments(scope, db, { now = new Date() } = {}) {
  const [rows] = await db.execute(`SELECT s.id,s.weekday,s.hour,s.assigned_frequency,s.availability_mode,s.temporary_until_date,
    s.available_since_date,s.booking_agency_id,l.name,l.timezone,r.name AS room
    FROM office_standing_assignments s
    JOIN office_locations l ON l.id=s.office_location_id
    JOIN office_rooms r ON r.id=s.room_id AND r.location_id=l.id
    WHERE s.provider_id=? AND s.is_active=1 AND l.is_active=1 AND r.is_active=1
    AND (s.booking_agency_id=? OR (s.booking_agency_id IS NULL AND
      (l.agency_id=? OR EXISTS(SELECT 1 FROM office_location_agencies ola WHERE ola.office_location_id=l.id AND ola.agency_id=?))))
    ORDER BY l.name,s.weekday,s.hour,s.id`, [scope.providerUserId, scope.agencyId, scope.agencyId, scope.agencyId]);
  const assignments = rows.filter(row => {
    const today = localToday(now, row.timezone);
    return String(row.availability_mode).toUpperCase() !== 'TEMPORARY' || !row.temporary_until_date || ymd(row.temporary_until_date) >= today;
  });
  if (!assignments.length) return [];

  const ids = assignments.map(row => Number(row.id));
  const [plans] = await db.execute(`SELECT standing_assignment_id,booked_frequency,booking_start_date,active_until_date,session_context_json
    FROM office_booking_plans WHERE standing_assignment_id IN (${ids.map(() => '?').join(',')}) AND is_active=1`, ids);
  return assignments.map(row => {
    const today = localToday(now, row.timezone);
    const activePlans = plans.filter(plan => Number(plan.standing_assignment_id) === Number(row.id)
      && (!plan.active_until_date || ymd(plan.active_until_date) >= today));
    const clients = new Set();
    let incompleteClientContext = false;
    for (const plan of activePlans) {
      const context = parseContext(plan.session_context_json);
      const agencyId = Number(context.agencyId ?? context.agency_id);
      const clientId = Number(context.clientId ?? context.client_id);
      if (agencyId === Number(scope.agencyId) && Number.isSafeInteger(clientId) && clientId > 0) clients.add(clientId);
      else incompleteClientContext = true;
    }
    const hour = Number(row.hour);
    return {
      id: Number(row.id), kind: 'standing', name: row.name, room: row.room,
      type: row.assigned_frequency, frequency: row.assigned_frequency,
      availability: row.availability_mode, day: weekdays[Number(row.weekday)] || 'Day not recorded',
      startTime: Number.isInteger(hour) ? `${String(hour).padStart(2, '0')}:00` : null,
      endTime: Number.isInteger(hour) ? `${String(hour + 1).padStart(2, '0')}:00` : null,
      timezone: row.timezone || 'America/Denver', startAt: null, endAt: null,
      effectiveFromDate: ymd(row.available_since_date) || null,
      untilDate: ymd(row.temporary_until_date) || null,
      organizationConfirmed: Number(row.booking_agency_id) === Number(scope.agencyId),
      slotsTotal: 1,
      slotsAvailable: !activePlans.length && String(row.availability_mode).toUpperCase() === 'AVAILABLE' ? 1 : null,
      clients: incompleteClientContext ? null : clients.size,
      bookingPlanCount: activePlans.length,
      bookingFrequencies: [...new Set(activePlans.map(plan => plan.booked_frequency))],
      capacityDescription: 'One reserved one-hour block per recurrence. Client counts use current organization-linked recurring booking plans; an unlinked plan makes the count unavailable. Remaining capacity is shown only for an available block with no active booking plan. This does not count every future appointment or the full office caseload.'
    };
  });
}
