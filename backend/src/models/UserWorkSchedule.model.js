import db from '../config/database.js';

function normalizeDayOfWeek(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 6) return null;
  return n;
}

function normalizeTime(value) {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  const ss = m[3] != null ? Math.min(59, Math.max(0, parseInt(m[3], 10))) : 0;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

class UserWorkSchedule {
  static async findByUserId(userId, { agencyId = null } = {}) {
    const uid = Number(userId || 0);
    if (!uid) return null;
    const aid = agencyId == null || agencyId === '' ? null : Number(agencyId);
    let rows;
    if (aid == null || !Number.isFinite(aid) || aid <= 0) {
      [rows] = await db.execute(
        `SELECT * FROM user_work_schedules
         WHERE user_id = ? AND agency_id IS NULL
         LIMIT 1`,
        [uid]
      );
    } else {
      [rows] = await db.execute(
        `SELECT * FROM user_work_schedules
         WHERE user_id = ? AND agency_id = ?
         LIMIT 1`,
        [uid, aid]
      );
      if (!rows?.length) {
        [rows] = await db.execute(
          `SELECT * FROM user_work_schedules
           WHERE user_id = ? AND agency_id IS NULL
           LIMIT 1`,
          [uid]
        );
      }
    }
    return rows?.[0] || null;
  }

  static async listBlocks(scheduleId) {
    const sid = Number(scheduleId || 0);
    if (!sid) return [];
    const [rows] = await db.execute(
      `SELECT id, schedule_id, day_of_week, start_time, end_time
       FROM user_work_schedule_blocks
       WHERE schedule_id = ?
       ORDER BY day_of_week ASC, start_time ASC, id ASC`,
      [sid]
    );
    return rows || [];
  }

  static async getForUser(userId, { agencyId = null } = {}) {
    const schedule = await this.findByUserId(userId, { agencyId });
    if (!schedule) {
      return {
        schedule: null,
        blocks: [],
        timezone: 'America/New_York',
        isActive: false
      };
    }
    const blocks = await this.listBlocks(schedule.id);
    return {
      schedule,
      blocks,
      timezone: String(schedule.timezone || 'America/New_York'),
      isActive: Number(schedule.is_active) === 1
    };
  }

  /**
   * Replace weekly template for a user (personal default when agencyId null).
   */
  static async upsertForUser(userId, {
    agencyId = null,
    timezone = 'America/New_York',
    isActive = true,
    blocks = []
  } = {}) {
    const uid = Number(userId || 0);
    if (!uid) throw new Error('Invalid user id');
    const aid = agencyId == null || agencyId === '' ? null : Number(agencyId);
    const tz = String(timezone || 'America/New_York').trim().slice(0, 64) || 'America/New_York';
    const active = isActive === false || isActive === 0 || isActive === '0' ? 0 : 1;

    const normalizedBlocks = [];
    for (const row of Array.isArray(blocks) ? blocks : []) {
      const day = normalizeDayOfWeek(row?.dayOfWeek ?? row?.day_of_week);
      const startTime = normalizeTime(row?.startTime ?? row?.start_time);
      const endTime = normalizeTime(row?.endTime ?? row?.end_time);
      if (day == null || !startTime || !endTime) continue;
      if (startTime >= endTime) continue;
      normalizedBlocks.push({ dayOfWeek: day, startTime, endTime });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      let scheduleId = null;
      if (aid == null || !Number.isFinite(aid) || aid <= 0) {
        const [existing] = await conn.execute(
          `SELECT id FROM user_work_schedules WHERE user_id = ? AND agency_id IS NULL LIMIT 1`,
          [uid]
        );
        if (existing?.[0]?.id) {
          scheduleId = Number(existing[0].id);
          await conn.execute(
            `UPDATE user_work_schedules
             SET timezone = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [tz, active, scheduleId]
          );
        } else {
          const [ins] = await conn.execute(
            `INSERT INTO user_work_schedules (user_id, agency_id, timezone, is_active)
             VALUES (?, NULL, ?, ?)`,
            [uid, tz, active]
          );
          scheduleId = Number(ins.insertId);
        }
      } else {
        const [existing] = await conn.execute(
          `SELECT id FROM user_work_schedules WHERE user_id = ? AND agency_id = ? LIMIT 1`,
          [uid, aid]
        );
        if (existing?.[0]?.id) {
          scheduleId = Number(existing[0].id);
          await conn.execute(
            `UPDATE user_work_schedules
             SET timezone = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [tz, active, scheduleId]
          );
        } else {
          const [ins] = await conn.execute(
            `INSERT INTO user_work_schedules (user_id, agency_id, timezone, is_active)
             VALUES (?, ?, ?, ?)`,
            [uid, aid, tz, active]
          );
          scheduleId = Number(ins.insertId);
        }
      }

      await conn.execute(`DELETE FROM user_work_schedule_blocks WHERE schedule_id = ?`, [scheduleId]);
      for (const b of normalizedBlocks) {
        await conn.execute(
          `INSERT INTO user_work_schedule_blocks (schedule_id, day_of_week, start_time, end_time)
           VALUES (?, ?, ?, ?)`,
          [scheduleId, b.dayOfWeek, b.startTime, b.endTime]
        );
      }

      await conn.commit();
      return this.getForUser(uid, { agencyId: aid });
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * Whether `now` falls inside an active work-schedule block for the user.
   * Returns null when no active schedule/blocks (caller should not block).
   */
  static async isInsideWorkSchedule(userId, now = new Date()) {
    const data = await this.getForUser(userId);
    if (!data?.isActive || !data.blocks?.length) return null;

    let tz = data.timezone || 'America/New_York';
    let localDay;
    let localMinutes;
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      });
      const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
      const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      localDay = weekdayMap[parts.weekday];
      const hh = parseInt(parts.hour, 10);
      const mm = parseInt(parts.minute, 10);
      if (!Number.isFinite(localDay) || !Number.isFinite(hh) || !Number.isFinite(mm)) return null;
      localMinutes = hh * 60 + mm;
    } catch {
      // Fallback to server local time if timezone invalid
      localDay = now.getDay();
      localMinutes = now.getHours() * 60 + now.getMinutes();
    }

    const parseMinutes = (t) => {
      const s = String(t || '');
      const m = s.match(/^(\d{1,2}):(\d{2})/);
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };

    for (const b of data.blocks) {
      if (Number(b.day_of_week) !== localDay) continue;
      const start = parseMinutes(b.start_time);
      const end = parseMinutes(b.end_time);
      if (start == null || end == null) continue;
      if (localMinutes >= start && localMinutes < end) return true;
    }
    return false;
  }
}

export default UserWorkSchedule;
