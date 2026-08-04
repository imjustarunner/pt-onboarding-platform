import pool from '../config/database.js';

class ScheduleBlockAssignment {
  static mapRow(r) {
    if (!r) return null;
    return {
      id: r.id,
      schedule_event_id: r.schedule_event_id,
      assignable_type: r.assignable_type,
      assignable_id: r.assignable_id,
      assigned_by_user_id: r.assigned_by_user_id,
      sort_order: r.sort_order,
      notes: r.notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      title: r.title || null,
      status: r.status || null,
      urgency: r.urgency || null
    };
  }

  static async listByEvent(scheduleEventId) {
    const eid = parseInt(scheduleEventId, 10);
    const [rows] = await pool.execute(
      `SELECT sba.*,
              CASE sba.assignable_type
                WHEN 'task' THEN t.title
                WHEN 'action_item' THEN tai.title
                WHEN 'task_list' THEN tl.name
              END AS title,
              CASE sba.assignable_type
                WHEN 'task' THEN t.status
                WHEN 'action_item' THEN tai.status
                ELSE NULL
              END AS status,
              CASE sba.assignable_type
                WHEN 'task' THEN t.urgency
                ELSE NULL
              END AS urgency
       FROM schedule_block_assignments sba
       LEFT JOIN tasks t ON sba.assignable_type = 'task' AND t.id = sba.assignable_id
       LEFT JOIN task_action_items tai ON sba.assignable_type = 'action_item' AND tai.id = sba.assignable_id
       LEFT JOIN task_lists tl ON sba.assignable_type = 'task_list' AND tl.id = sba.assignable_id
       WHERE sba.schedule_event_id = ?
       ORDER BY sba.sort_order ASC, sba.id ASC`,
      [eid]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async listEventsForUserDay(userId, dayYmd) {
    const [rows] = await pool.execute(
      `SELECT e.*
       FROM provider_schedule_events e
       WHERE e.provider_id = ?
         AND e.kind = 'SCHEDULE_HOLD'
         AND (e.status IS NULL OR e.status IN ('ACTIVE', 'scheduled', 'confirmed', 'held'))
         AND (
           (e.all_day = 1 AND e.start_date <= ? AND (e.end_date IS NULL OR e.end_date >= ?))
           OR (e.all_day = 0 AND DATE(e.start_at) = ?)
         )
       ORDER BY COALESCE(e.start_at, CONCAT(e.start_date, ' 00:00:00')) ASC`,
      [userId, dayYmd, dayYmd, dayYmd]
    );
    return rows || [];
  }

  static async add({ scheduleEventId, assignableType, assignableId, assignedByUserId, sortOrder = 0, notes = null }) {
    const type = String(assignableType || '');
    if (!['task', 'action_item', 'task_list'].includes(type)) {
      throw new Error('Invalid assignable_type');
    }
    await pool.execute(
      `INSERT INTO schedule_block_assignments
        (schedule_event_id, assignable_type, assignable_id, assigned_by_user_id, sort_order, notes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE notes = VALUES(notes), sort_order = VALUES(sort_order)`,
      [scheduleEventId, type, assignableId, assignedByUserId, sortOrder, notes]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM schedule_block_assignments
       WHERE schedule_event_id = ? AND assignable_type = ? AND assignable_id = ?`,
      [scheduleEventId, type, assignableId]
    );
    return this.mapRow(rows[0]);
  }

  static async remove(id) {
    const [result] = await pool.execute('DELETE FROM schedule_block_assignments WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async updateNotes(id, notes) {
    await pool.execute('UPDATE schedule_block_assignments SET notes = ? WHERE id = ?', [notes, id]);
    const [rows] = await pool.execute('SELECT * FROM schedule_block_assignments WHERE id = ?', [id]);
    return this.mapRow(rows[0]);
  }

  static async countByEvent(scheduleEventId) {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) AS c FROM schedule_block_assignments WHERE schedule_event_id = ?',
      [scheduleEventId]
    );
    return Number(rows?.[0]?.c || 0);
  }
}

export default ScheduleBlockAssignment;
