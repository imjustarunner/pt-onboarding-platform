import pool from '../config/database.js';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SET = new Set(DAY_ORDER);

function normDay(day) {
  const s = String(day || '').trim();
  if (!s) return '';
  const cap = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  // Handle common variants
  if (cap === 'Mon') return 'Monday';
  if (cap === 'Tue' || cap === 'Tues') return 'Tuesday';
  if (cap === 'Wed') return 'Wednesday';
  if (cap === 'Thu' || cap === 'Thur' || cap === 'Thurs') return 'Thursday';
  if (cap === 'Fri') return 'Friday';
  if (cap === 'Sat') return 'Saturday';
  if (cap === 'Sun') return 'Sunday';
  return cap;
}

function normTimeHHMM(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return '';
  const hh = String(Math.max(0, Math.min(23, parseInt(m[1], 10)))).padStart(2, '0');
  const mm = String(Math.max(0, Math.min(59, parseInt(m[2], 10)))).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

function normSessionType(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s === 'INTAKE') return 'INTAKE';
  if (s === 'BOTH') return 'BOTH';
  return 'REGULAR';
}

function normFrequency(v) {
  const s = String(v || '').trim().toUpperCase();
  if (s === 'BIWEEKLY') return 'BIWEEKLY';
  if (s === 'EITHER') return 'EITHER';
  return 'WEEKLY';
}

class ProviderVirtualWorkingHours {
  static normalizeRows(rows) {
    const out = [];
    for (const r of rows || []) {
      const day = normDay(r?.dayOfWeek || r?.day_of_week);
      if (!DAY_SET.has(day)) continue;
      const startTime = normTimeHHMM(r?.startTime || r?.start_time);
      const endTime = normTimeHHMM(r?.endTime || r?.end_time);
      if (!startTime || !endTime) continue;
      if (endTime <= startTime) continue;
      const sessionType = normSessionType(r?.sessionType || r?.session_type);
      const frequency = normFrequency(r?.frequency);
      out.push({ dayOfWeek: day, startTime, endTime, sessionType, frequency });
    }
    // stable sort
    out.sort((a, b) => {
      const da = DAY_ORDER.indexOf(a.dayOfWeek);
      const db = DAY_ORDER.indexOf(b.dayOfWeek);
      if (da !== db) return da - db;
      return String(a.startTime).localeCompare(String(b.startTime));
    });
    return out;
  }

  static async listForProvider({ agencyId, providerId }) {
    const aid = Number(agencyId || 0);
    const pid = Number(providerId || 0);
    if (!aid || !pid) return [];
    let rows = [];
    try {
      const [r] = await pool.execute(
        `SELECT day_of_week, start_time, end_time, session_type, frequency
         FROM provider_virtual_working_hours
         WHERE agency_id = ? AND provider_id = ?
         ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time ASC`,
        [aid, pid]
      );
      rows = r || [];
    } catch (e) {
      // Backward compatibility if migration hasn't been applied yet.
      if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      const [r] = await pool.execute(
        `SELECT day_of_week, start_time, end_time
         FROM provider_virtual_working_hours
         WHERE agency_id = ? AND provider_id = ?
         ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time ASC`,
        [aid, pid]
      );
      rows = r || [];
    }
    return (rows || []).map((r) => ({
      dayOfWeek: r.day_of_week,
      startTime: String(r.start_time || '').slice(0, 5),
      endTime: String(r.end_time || '').slice(0, 5),
      sessionType: normSessionType(r.session_type),
      frequency: normFrequency(r.frequency)
    }));
  }

  static async replaceForProvider({ agencyId, providerId, rows }) {
    const aid = Number(agencyId || 0);
    const pid = Number(providerId || 0);
    if (!aid || !pid) throw new Error('Invalid agencyId/providerId');
    const normalized = this.normalizeRows(rows);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `DELETE FROM provider_virtual_working_hours WHERE agency_id = ? AND provider_id = ?`,
        [aid, pid]
      );
      for (const r of normalized) {
        try {
          await conn.execute(
            `INSERT INTO provider_virtual_working_hours (agency_id, provider_id, day_of_week, start_time, end_time, session_type, frequency)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [aid, pid, r.dayOfWeek, r.startTime, r.endTime, normSessionType(r.sessionType), normFrequency(r.frequency)]
          );
        } catch (e) {
          // Backward compatibility if migration hasn't been applied yet.
          if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
          await conn.execute(
            `INSERT INTO provider_virtual_working_hours (agency_id, provider_id, day_of_week, start_time, end_time)
             VALUES (?, ?, ?, ?, ?)`,
            [aid, pid, r.dayOfWeek, r.startTime, r.endTime]
          );
        }
      }
      await conn.commit();
      return normalized.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startTime: String(r.startTime).slice(0, 5),
        endTime: String(r.endTime).slice(0, 5),
        sessionType: normSessionType(r.sessionType),
        frequency: normFrequency(r.frequency)
      }));
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  }
}

export default ProviderVirtualWorkingHours;

