/**
 * Apply an approved provider school-day move: leave fromDay, land on toDay,
 * unassign caseload from the vacated day (keep provider, clear weekday).
 */
import { syncSchoolPortalDayProvider } from './schoolPortalDaySync.service.js';
import { demoteClientWhenUnscheduled } from './clientLifecycleStatus.service.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function truthy(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

async function ensureProviderAssignmentWithoutDay(connection, {
  clientId,
  schoolId,
  providerUserId,
  actorUserId
}) {
  const [remaining] = await connection.execute(
    `SELECT id
     FROM client_provider_assignments
     WHERE client_id = ? AND organization_id = ? AND provider_user_id = ?
       AND is_active = TRUE AND service_day IS NOT NULL
     LIMIT 1`,
    [clientId, schoolId, providerUserId]
  );
  if (remaining?.length) return;

  const [nullRows] = await connection.execute(
    `SELECT id, is_active
     FROM client_provider_assignments
     WHERE client_id = ? AND organization_id = ? AND provider_user_id = ?
       AND service_day IS NULL
     ORDER BY is_active DESC, id DESC
     LIMIT 1
     FOR UPDATE`,
    [clientId, schoolId, providerUserId]
  );
  const nullRow = nullRows?.[0] || null;
  if (nullRow?.id) {
    if (!truthy(nullRow.is_active)) {
      await connection.execute(
        `UPDATE client_provider_assignments
         SET is_active = TRUE, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [actorUserId, nullRow.id]
      );
    }
  } else {
    await connection.execute(
      `INSERT INTO client_provider_assignments
        (client_id, organization_id, provider_user_id, service_day, is_active, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, NULL, TRUE, ?, ?)`,
      [clientId, schoolId, providerUserId, actorUserId, actorUserId]
    );
  }

  try {
    await connection.execute(
      `UPDATE clients
       SET provider_id = ?, service_day = NULL, updated_by_user_id = ?, last_activity_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [providerUserId, actorUserId, clientId]
    );
  } catch {
    // ignore legacy column drift
  }
}

async function unassignClientsFromProviderDay(connection, {
  schoolId,
  providerUserId,
  fromDay,
  actorUserId
}) {
  const clientIds = [];
  let rows = [];
  try {
    const [found] = await connection.execute(
      `SELECT id, client_id
       FROM client_provider_assignments
       WHERE organization_id = ? AND provider_user_id = ?
         AND is_active = TRUE AND service_day = ?
       FOR UPDATE`,
      [schoolId, providerUserId, fromDay]
    );
    rows = found || [];
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes("doesn't exist") && !msg.includes('ER_NO_SUCH_TABLE')) throw e;
    rows = [];
  }

  try {
    await connection.execute(
      `UPDATE soft_schedule_slots
       SET client_id = NULL, updated_by_user_id = ?
       WHERE school_organization_id = ? AND weekday = ? AND provider_user_id = ?`,
      [actorUserId, schoolId, fromDay, providerUserId]
    );
  } catch {
    // ignore if soft schedule table missing
  }

  for (const row of rows) {
    const clientId = Number(row.client_id);
    if (clientId) clientIds.push(clientId);

    const [remainingWeekdays] = await connection.execute(
      `SELECT id
       FROM client_provider_assignments
       WHERE client_id = ? AND organization_id = ? AND provider_user_id = ?
         AND is_active = TRUE AND service_day IS NOT NULL AND id <> ?
       LIMIT 1`,
      [clientId, schoolId, providerUserId, row.id]
    );

    if (remainingWeekdays?.length) {
      await connection.execute(
        `UPDATE client_provider_assignments
         SET is_active = FALSE, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [actorUserId, row.id]
      );
    } else {
      await connection.execute(
        `UPDATE client_provider_assignments
         SET service_day = NULL, is_active = TRUE, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [actorUserId, row.id]
      );
      await ensureProviderAssignmentWithoutDay(connection, {
        clientId,
        schoolId,
        providerUserId,
        actorUserId
      });
    }
  }

  return [...new Set(clientIds)];
}

/**
 * Move provider school assignment from fromDay → toDay and unassign clients on fromDay.
 * Caller owns the transaction (connection).
 */
export async function applyProviderSchoolDayMove(connection, {
  schoolId,
  providerUserId,
  fromDay,
  toDay,
  slotsTotal,
  startTime,
  endTime,
  actorUserId
}) {
  const from = WEEKDAYS.includes(String(fromDay)) ? String(fromDay) : null;
  const to = WEEKDAYS.includes(String(toDay)) ? String(toDay) : null;
  if (!from || !to || from === to) {
    return { ok: false, message: 'fromDay and toDay must be different weekdays' };
  }

  const [fromRows] = await connection.execute(
    `SELECT id, slots_total, start_time, end_time
     FROM provider_school_assignments
     WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ?
     LIMIT 1
     FOR UPDATE`,
    [providerUserId, schoolId, from]
  );
  const fromRow = fromRows?.[0] || null;
  if (!fromRow) {
    return { ok: false, message: `No existing school assignment found for ${from}` };
  }

  const nextSlotsTotal =
    Number.isFinite(Number(slotsTotal)) && Number(slotsTotal) >= 0
      ? Number(slotsTotal)
      : Number(fromRow.slots_total ?? 0);
  const nextStart = startTime || fromRow.start_time || null;
  const nextEnd = endTime || fromRow.end_time || null;

  const unassignedClientIds = await unassignClientsFromProviderDay(connection, {
    schoolId,
    providerUserId,
    fromDay: from,
    actorUserId
  });

  await connection.execute(
    `UPDATE provider_school_assignments
     SET is_active = FALSE, slots_available = slots_total, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [fromRow.id]
  );
  await syncSchoolPortalDayProvider({
    executor: connection,
    schoolId,
    providerUserId,
    weekday: from,
    isActive: false,
    actorUserId
  });

  const [toRows] = await connection.execute(
    `SELECT id, slots_total, slots_available
     FROM provider_school_assignments
     WHERE provider_user_id = ? AND school_organization_id = ? AND day_of_week = ?
     LIMIT 1
     FOR UPDATE`,
    [providerUserId, schoolId, to]
  );

  let assignmentId = null;
  if (!toRows?.[0]) {
    const [ins] = await connection.execute(
      `INSERT INTO provider_school_assignments
        (provider_user_id, school_organization_id, day_of_week, slots_total, slots_available, start_time, end_time, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [providerUserId, schoolId, to, nextSlotsTotal, nextSlotsTotal, nextStart, nextEnd]
    );
    assignmentId = ins.insertId;
  } else {
    assignmentId = toRows[0].id;
    const oldTotal = parseInt(toRows[0].slots_total ?? 0, 10);
    const oldAvail = parseInt(toRows[0].slots_available ?? 0, 10);
    const used = Math.max(0, oldTotal - oldAvail);
    const mergedTotal = nextSlotsTotal || oldTotal;
    const nextAvail = Math.max(0, mergedTotal - used);
    await connection.execute(
      `UPDATE provider_school_assignments
       SET slots_total = ?, slots_available = ?, start_time = ?, end_time = ?, is_active = TRUE
       WHERE id = ?`,
      [mergedTotal, nextAvail, nextStart, nextEnd, assignmentId]
    );
  }

  await syncSchoolPortalDayProvider({
    executor: connection,
    schoolId,
    providerUserId,
    weekday: to,
    isActive: true,
    actorUserId
  });

  return { ok: true, assignmentId, unassignedClientIds };
}

export async function demoteUnassignedClientsAfterDayMove({ clientIds, actorUserId }) {
  const ids = [...new Set((clientIds || []).map((n) => Number(n)).filter((n) => n > 0))];
  for (const clientId of ids) {
    try {
      await demoteClientWhenUnscheduled({ clientId, actorUserId });
    } catch {
      // best-effort lifecycle
    }
  }
}
