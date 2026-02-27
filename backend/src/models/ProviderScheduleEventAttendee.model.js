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
