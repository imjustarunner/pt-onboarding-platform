import pool from '../config/database.js';

class ProviderScheduleEventInviteGroup {
  static async replaceForEvent(eventId, groupIds = []) {
    const eid = Number(eventId || 0);
    if (!eid) return;
    const ids = Array.from(new Set((groupIds || []).map((n) => Number(n)).filter((n) => n > 0)));
    await pool.execute(`DELETE FROM provider_schedule_event_invite_groups WHERE event_id = ?`, [eid]);
    for (const gid of ids) {
      // eslint-disable-next-line no-await-in-loop
      await pool.execute(
        `INSERT IGNORE INTO provider_schedule_event_invite_groups (event_id, invite_group_id) VALUES (?, ?)`,
        [eid, gid]
      );
    }
  }

  static async listGroupIdsByEventIds(eventIds = []) {
    const ids = Array.from(new Set((eventIds || []).map((n) => Number(n)).filter((n) => n > 0)));
    const out = new Map();
    if (!ids.length) return out;
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT event_id, invite_group_id
       FROM provider_schedule_event_invite_groups
       WHERE event_id IN (${placeholders})
       ORDER BY event_id ASC, invite_group_id ASC`,
      ids
    );
    for (const r of rows || []) {
      const eid = Number(r.event_id || 0);
      const gid = Number(r.invite_group_id || 0);
      if (!eid || !gid) continue;
      if (!out.has(eid)) out.set(eid, []);
      out.get(eid).push(gid);
    }
    return out;
  }

  static async listFutureEventIdsForGroup(groupId) {
    const gid = Number(groupId || 0);
    if (!gid) return [];
    const [rows] = await pool.execute(
      `SELECT pse.id AS event_id
       FROM provider_schedule_event_invite_groups peg
       INNER JOIN provider_schedule_events pse ON pse.id = peg.event_id
       WHERE peg.invite_group_id = ?
         AND UPPER(COALESCE(pse.status, 'ACTIVE')) = 'ACTIVE'
         AND (
           (pse.start_at IS NOT NULL AND pse.start_at >= NOW())
           OR (pse.all_day = 1 AND pse.end_date >= CURDATE())
           OR (pse.start_at IS NULL AND pse.start_date IS NOT NULL AND pse.start_date >= CURDATE())
         )`,
      [gid]
    );
    return (rows || []).map((r) => Number(r.event_id || 0)).filter((n) => n > 0);
  }
}

export default ProviderScheduleEventInviteGroup;
