import pool from '../config/database.js';

/**
 * Per-date attendance status for event participants (planned absence, late
 * arrival with time, or removed-from-future). Read by the day kiosk so staff
 * know what to expect for a given session date.
 */

const VALID_STATUSES = new Set(['planned_absence', 'late', 'removed']);

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim());
}

function normalizeDbDateToYmd(input) {
  if (!input) return '';
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) return '';
    return input.toISOString().slice(0, 10);
  }
  const raw = String(input).trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function mapStatusRow(r) {
  return {
    id: Number(r.id),
    clientId: Number(r.client_id),
    sessionDate: normalizeDbDateToYmd(r.session_date),
    status: r.status,
    expectedArrivalTime: r.expected_arrival_time || null,
    note: r.note || null,
    setByUserId: r.set_by_user_id ? Number(r.set_by_user_id) : null,
    setByName: r.set_by_name || null,
    updatedAt: r.updated_at || null
  };
}

/** List statuses for an event, optionally scoped to a single session date. */
export async function listCompanyEventDateStatuses({ companyEventId, sessionDate = null }) {
  const eid = parsePositiveInt(companyEventId);
  if (!eid) return [];
  const params = [eid];
  let sql = `
    SELECT s.id, s.client_id, s.session_date, s.status, s.expected_arrival_time,
           s.note, s.set_by_user_id, s.updated_at,
           TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS set_by_name
    FROM company_event_client_date_status s
    LEFT JOIN users u ON u.id = s.set_by_user_id
    WHERE s.company_event_id = ?`;
  if (isYmd(sessionDate)) {
    sql += ' AND s.session_date = ?';
    params.push(String(sessionDate).trim());
  }
  sql += ' ORDER BY s.session_date ASC, s.client_id ASC';
  try {
    const [rows] = await pool.execute(sql, params);
    return (rows || []).map(mapStatusRow);
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

/** Map of clientId -> status for a single kiosk day. Used by kiosk context. */
export async function loadCompanyEventDateStatusMap({ companyEventId, sessionDate }) {
  const map = new Map();
  if (!isYmd(sessionDate)) return map;
  const rows = await listCompanyEventDateStatuses({ companyEventId, sessionDate });
  for (const r of rows) map.set(Number(r.clientId), r);
  return map;
}

/** Future (>= the given date) materialized session dates for an event. */
async function listFutureSessionDates(companyEventId, fromYmd) {
  const eid = parsePositiveInt(companyEventId);
  if (!eid || !isYmd(fromYmd)) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT session_date
       FROM company_event_session_dates
       WHERE company_event_id = ? AND session_date >= ?
       ORDER BY session_date ASC`,
      [eid, String(fromYmd)]
    );
    return (rows || []).map((r) => normalizeDbDateToYmd(r.session_date)).filter(isYmd);
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

async function upsertOneStatus(conn, {
  companyEventId, agencyId, clientId, sessionDate, status, expectedArrivalTime, note, setByUserId
}) {
  await conn.execute(
    `INSERT INTO company_event_client_date_status
       (company_event_id, agency_id, client_id, session_date, status, expected_arrival_time, note, set_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       expected_arrival_time = VALUES(expected_arrival_time),
       note = VALUES(note),
       set_by_user_id = VALUES(set_by_user_id),
       updated_at = CURRENT_TIMESTAMP`,
    [companyEventId, agencyId, clientId, sessionDate, status, expectedArrivalTime, note, setByUserId]
  );
}

async function deleteStatusRange(conn, { companyEventId, clientId, fromYmd, onlyStatus = null }) {
  const params = [companyEventId, clientId, fromYmd];
  let sql = `DELETE FROM company_event_client_date_status
             WHERE company_event_id = ? AND client_id = ? AND session_date >= ?`;
  if (onlyStatus) {
    sql += ' AND status = ?';
    params.push(onlyStatus);
  }
  await conn.execute(sql, params);
}

/**
 * Set / clear a client's status for a session date.
 * - status null/empty clears the row for that date.
 * - applyToFuture writes/clears for the date AND all later session dates
 *   (used by the "remove from future dates" button, status='removed').
 */
export async function setCompanyEventClientDateStatus({
  companyEventId,
  agencyId,
  clientId,
  sessionDate,
  status,
  expectedArrivalTime = null,
  note = null,
  applyToFuture = false,
  setByUserId = null
}) {
  const eid = parsePositiveInt(companyEventId);
  const aid = parsePositiveInt(agencyId);
  const cid = parsePositiveInt(clientId);
  if (!eid || !aid || !cid) {
    throw Object.assign(new Error('companyEventId, agencyId, and clientId are required'), { status: 400 });
  }
  if (!isYmd(sessionDate)) {
    throw Object.assign(new Error('A valid sessionDate (YYYY-MM-DD) is required'), { status: 400 });
  }
  const normalizedStatus = status ? String(status).trim().toLowerCase() : null;
  if (normalizedStatus && !VALID_STATUSES.has(normalizedStatus)) {
    throw Object.assign(new Error('status must be planned_absence, late, removed, or null'), { status: 400 });
  }
  const time = normalizedStatus === 'late' ? (String(expectedArrivalTime || '').trim().slice(0, 20) || null) : null;
  const cleanNote = String(note || '').trim().slice(0, 500) || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const targetDates = applyToFuture
      ? await (async () => {
          const future = await listFutureSessionDates(eid, sessionDate);
          // Always include the chosen date even if it isn't materialized yet.
          return future.length ? [...new Set([sessionDate, ...future])] : [sessionDate];
        })()
      : [sessionDate];

    if (!normalizedStatus) {
      // Clear: when applyToFuture, only clear forward; otherwise just this date.
      if (applyToFuture) {
        await deleteStatusRange(conn, { companyEventId: eid, clientId: cid, fromYmd: sessionDate });
      } else {
        await conn.execute(
          `DELETE FROM company_event_client_date_status
           WHERE company_event_id = ? AND client_id = ? AND session_date = ?`,
          [eid, cid, sessionDate]
        );
      }
    } else {
      for (const d of targetDates) {
        // eslint-disable-next-line no-await-in-loop
        await upsertOneStatus(conn, {
          companyEventId: eid,
          agencyId: aid,
          clientId: cid,
          sessionDate: d,
          status: normalizedStatus,
          expectedArrivalTime: time,
          note: cleanNote,
          setByUserId: parsePositiveInt(setByUserId)
        });
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => null);
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      throw Object.assign(new Error('Attendance status table not migrated. Run migration 829.'), { status: 503 });
    }
    throw err;
  } finally {
    conn.release();
  }

  return listCompanyEventDateStatuses({ companyEventId: eid, sessionDate });
}

/**
 * Record a family's checkout attendance intent for upcoming session dates.
 * entries: [{ sessionDate, attending }]. For each:
 *   - attending === false -> upsert a planned_absence (note = reason)
 *   - attending === true  -> clear any planned_absence for that date
 * Only touches planned_absence rows so it never clobbers a staff-set
 * 'removed' or 'late' status.
 */
export async function recordKioskAttendanceIntent({
  companyEventId,
  agencyId,
  clientId,
  entries,
  reason = null,
  setByUserId = null
}) {
  const eid = parsePositiveInt(companyEventId);
  const aid = parsePositiveInt(agencyId);
  const cid = parsePositiveInt(clientId);
  if (!eid || !aid || !cid) {
    throw Object.assign(new Error('companyEventId, agencyId, and clientId are required'), { status: 400 });
  }
  const rows = Array.isArray(entries) ? entries : [];
  const cleanReason = String(reason || '').trim().slice(0, 500) || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const entry of rows) {
      const date = String(entry?.sessionDate || '').trim();
      if (!isYmd(date)) continue;
      if (entry?.attending === false) {
        // eslint-disable-next-line no-await-in-loop
        await upsertOneStatus(conn, {
          companyEventId: eid,
          agencyId: aid,
          clientId: cid,
          sessionDate: date,
          status: 'planned_absence',
          expectedArrivalTime: null,
          note: cleanReason,
          setByUserId: parsePositiveInt(setByUserId)
        });
      } else {
        // Confirmed attending — clear a prior planned_absence for that date only.
        // eslint-disable-next-line no-await-in-loop
        await conn.execute(
          `DELETE FROM company_event_client_date_status
           WHERE company_event_id = ? AND client_id = ? AND session_date = ? AND status = 'planned_absence'`,
          [eid, cid, date]
        );
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => null);
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      throw Object.assign(new Error('Attendance status table not migrated. Run migration 829.'), { status: 503 });
    }
    throw err;
  } finally {
    conn.release();
  }

  return true;
}
