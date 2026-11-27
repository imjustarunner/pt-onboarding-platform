import pool from '../config/database.js';

const archiveAdmins = new Set(['super_admin', 'superadmin', 'admin', 'agency_admin', 'backoffice_admin']);
export const canSeeDeletedCalendarItems = role => archiveAdmins.has(String(role || '').toLowerCase());
const isCanceled = status => /^(?:late_)?cancel(?:ed|led)(?:_|$)/i.test(String(status || ''));
const canceledSql = '^(late_)?cancel(l)?ed(_|$)';
const fail = (message, status) => Object.assign(new Error(message), { status });

const sources = {
  appointment: {
    table: 'appointments',
    joins: 'LEFT JOIN provider_schedule_events p ON p.id=a.provider_schedule_event_id LEFT JOIN office_events o ON o.id=a.office_event_id',
    provider: 'a.provider_user_id',
    series: "CASE WHEN a.source LIKE 'reserved!_office!_session:%' ESCAPE '!' THEN a.source WHEN p.recurrence_series_id IS NOT NULL THEN CONCAT('provider:',p.recurrence_series_id) WHEN o.booking_plan_id IS NOT NULL THEN CONCAT('office:',o.booking_plan_id) END"
  },
  provider_event: { table: 'provider_schedule_events', provider: 'a.provider_id', series: 'a.recurrence_series_id' },
  supervision: { table: 'supervision_sessions', provider: 'a.supervisor_user_id', series: 'a.recurrence_series_id', legacyArchive: 'a.calendar_deleted_at' },
  office_event: {
    table: 'office_events',
    joins: 'LEFT JOIN office_standing_assignments sa ON sa.id=a.standing_assignment_id',
    provider: 'COALESCE(a.booked_provider_id,a.assigned_provider_id)',
    agency: "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(a.session_context_json,'$.agencyId')),sa.booking_agency_id)",
    series: 'CAST(a.booking_plan_id AS CHAR)'
  }
};

export async function archiveCanceledCalendarItem({ providerId, type, id, actor, authorize, authorizeAppointment }, db = pool) {
  const source = Object.hasOwn(sources, type) ? sources[type] : null;
  if (!source || !Number.isSafeInteger(id) || id < 1) throw fail('Invalid calendar item.', 400);
  if (providerId !== Number(actor.id) && !canSeeDeletedCalendarItems(actor.role)) throw fail('Calendar management access required.', 403);
  const [[row]] = await db.execute(`SELECT a.*, ${source.provider} AS owner_id,
    ${source.agency || 'a.agency_id'} AS item_agency
    FROM ${source.table} a ${type === 'office_event' ? source.joins : ''} WHERE a.id=?`, [id]);
  const agencyId = Number(row?.item_agency);
  if (!row || providerId !== Number(row.owner_id) || !agencyId) throw fail('Calendar item not found.', 404);
  await authorize(actor, providerId, [agencyId]);
  if (type === 'appointment') await authorizeAppointment(actor, { id, agencyId, providerUserId: providerId });
  if (!isCanceled(row.status)) throw fail('Cancel this item before deleting it from the calendar.', 409);
  try {
    const [recorded] = await db.execute(`INSERT INTO calendar_cancellation_archives (resource_type,resource_id,agency_id,archived_by_user_id)
      SELECT ?,a.id,?,? FROM ${source.table} a WHERE a.id=? AND ${source.provider}=? AND LOWER(a.status) REGEXP ?`,
    [type, agencyId, actor.id, id, providerId, canceledSql]);
    if (recorded.affectedRows === 1) return { archived: true, agencyId, newlyArchived: true };
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
  }
  const [[existing]] = await db.execute('SELECT 1 FROM calendar_cancellation_archives WHERE resource_type=? AND resource_id=? AND agency_id=?', [type, id, agencyId]);
  if (!existing) throw fail('This calendar item changed. Refresh the schedule and try again.', 409);
  return { archived: true, agencyId, newlyArchived: false };
}

function calendarResource(row, type) {
  // A freed standing room can remain bookable after its old session is canceled.
  if (type === 'office_event' && !isCanceled(row.status)) return null;
  const appointmentId = Number(row.appointmentId);
  if (appointmentId > 0) return isCanceled(row.appointmentStatus) || row.isCancelled ? ['appointment', appointmentId] : null;
  const id = Number(row.id);
  if (id > 0 && (isCanceled(row.status) || (type === 'supervision' && row.calendarPreviouslyDeleted))) return [type, id];
  return null;
}

async function listCancellationStates(type, ids, db) {
  const source = sources[type];
  const agency = source.agency || 'a.agency_id';
  const fields = `a.id,a.start_at,${agency} AS agency_id,${source.provider} AS provider_id,${source.series} AS series_id`;
  const from = `FROM ${source.table} a ${source.joins || ''}`;
  const [rows] = await db.execute(`SELECT anchor.id,anchor.archived_at,anchor.provider_id,anchor.agency_id,
      CASE WHEN anchor.series_id IS NULL THEN 0 ELSE EXISTS (
        SELECT 1 ${from} WHERE LOWER(a.status) REGEXP ?
          AND ${source.provider}=anchor.provider_id AND ${agency}=anchor.agency_id
          AND ${source.series}=anchor.series_id
          AND (a.start_at<anchor.start_at OR (a.start_at=anchor.start_at AND a.id<anchor.id))
      ) END AS hidden_repeat
    FROM (SELECT ${fields}, COALESCE(ar.archived_at,${source.legacyArchive || 'NULL'}) AS archived_at
      ${from} LEFT JOIN calendar_cancellation_archives ar
        ON ar.resource_type=? AND ar.resource_id=a.id AND ar.agency_id=${agency}
      WHERE a.id IN (${ids.map(() => '?').join(',')})
        AND (LOWER(a.status) REGEXP ?${source.legacyArchive ? ` OR ${source.legacyArchive} IS NOT NULL` : ''})
    ) anchor`, [canceledSql, type, ...ids, canceledSql]);
  return rows;
}

export async function applyCalendarCancellationVisibility(groups, { showDeleted, canArchive, providerId, allowedAgencies = null }, db = pool) {
  const idsByType = new Map();
  for (const [type, rows] of Object.entries(groups)) for (const row of rows) {
    const resource = calendarResource(row, type);
    if (!resource) continue;
    const [resourceType, id] = resource;
    if (!idsByType.has(resourceType)) idsByType.set(resourceType, new Set());
    idsByType.get(resourceType).add(id);
  }
  const byKey = new Map();
  await Promise.all([...idsByType].map(async ([type, ids]) => {
    // A database undergoing an upgrade may be ahead of or behind the calendar code.
    let states;
    try { states = await listCancellationStates(type, [...ids], db); }
    catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE' && error.message.includes('calendar_cancellation_archives')) return;
      throw error;
    }
    for (const state of states) byKey.set(`${type}:${state.id}`, state);
  }));
  return Object.fromEntries(Object.entries(groups).map(([type, rows]) => [type, rows.flatMap(row => {
    const resource = calendarResource(row, type);
    const state = resource && byKey.get(resource.join(':'));
    if (!state) return [row];
    const allowed = !allowedAgencies || allowedAgencies.includes(Number(state.agency_id));
    if ((state.archived_at || Number(state.hidden_repeat)) && (!showDeleted || !allowed)) return [];
    return [{ ...row, calendarCancellation: {
      type: resource[0], id: resource[1], archived: !!state.archived_at, hiddenRepeat: !!Number(state.hidden_repeat),
      canArchive: canArchive && allowed && !state.archived_at && Number(state.provider_id) === Number(providerId)
    } }];
  })]));
}
