import pool from '../config/database.js';

class ProviderScheduleEventAttendee {
  static async upsertForEvent(eventId, userIds = []) {
    const eid = Number(eventId || 0);
    if (!eid) return;
    const ids = Array.from(new Set((userIds || []).map((u) => Number(u)).filter((n) => n > 0)));
    if (!ids.length) return;

    for (const uid of ids) {
      await pool.execute(
        `INSERT INTO provider_schedule_event_attendees (event_id, user_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE event_id = event_id`,
        [eid, uid]
      );
    }
  }

  static async replaceForEvent(eventId, userIds = []) {
    const eid = Number(eventId || 0);
    if (!eid) return;
    const ids = Array.from(new Set((userIds || []).map((u) => Number(u)).filter((n) => n > 0)));
    await pool.execute(`DELETE FROM provider_schedule_event_attendees WHERE event_id = ?`, [eid]);
    if (ids.length) await this.upsertForEvent(eid, ids);
  }

  static async listUserIdsByEventIds(eventIds = []) {
    const ids = Array.from(new Set((eventIds || []).map((n) => Number(n)).filter((n) => n > 0)));
    if (!ids.length) return new Map();
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT event_id, user_id
       FROM provider_schedule_event_attendees
       WHERE event_id IN (${placeholders})
       ORDER BY event_id ASC, user_id ASC`,
      ids
    );
    const out = new Map();
    for (const r of rows || []) {
      const eid = Number(r.event_id || 0);
      const uid = Number(r.user_id || 0);
      if (!eid || !uid) continue;
      if (!out.has(eid)) out.set(eid, []);
      out.get(eid).push(uid);
    }
    return out;
  }

  static async listByEventId(eventId) {
    const eid = Number(eventId || 0);
    if (!eid) return [];
    const [rows] = await pool.execute(
      `SELECT psea.*, u.email, u.first_name, u.last_name
       FROM provider_schedule_event_attendees psea
       JOIN users u ON u.id = psea.user_id
       WHERE psea.event_id = ?
       ORDER BY u.last_name, u.first_name`,
      [eid]
    );
    return rows || [];
  }

  static async listUserIdsByEventId(eventId) {
    const list = await this.listByEventId(eventId);
    return list.map((r) => Number(r.user_id || 0)).filter(Boolean);
  }
}

export default ProviderScheduleEventAttendee;
