import pool from '../config/database.js';

class TaskActionItem {
  static mapRow(r) {
    if (!r) return null;
    return {
      id: r.id,
      parent_task_id: r.parent_task_id,
      meeting_event_id: r.meeting_event_id,
      meeting_action_key: r.meeting_action_key,
      title: r.title,
      notes: r.notes,
      assignee_user_id: r.assignee_user_id,
      created_by_user_id: r.created_by_user_id,
      agency_id: r.agency_id,
      status: r.status,
      completed_at: r.completed_at,
      hub_task_id: r.hub_task_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
      assignee_first_name: r.assignee_first_name || null,
      assignee_last_name: r.assignee_last_name || null,
      creator_first_name: r.creator_first_name || null,
      creator_last_name: r.creator_last_name || null,
      meeting_title: r.meeting_title || null,
      task_list_id: r.task_list_id ?? null,
      project_id: r.project_id ?? null,
      is_private: r.is_private != null ? !!Number(r.is_private) : false,
      task_list_name: r.task_list_name || null,
      project_name: r.project_name || null
    };
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT tai.*,
              a.first_name AS assignee_first_name, a.last_name AS assignee_last_name,
              c.first_name AS creator_first_name, c.last_name AS creator_last_name,
              e.title AS meeting_title
       FROM task_action_items tai
       LEFT JOIN users a ON a.id = tai.assignee_user_id
       LEFT JOIN users c ON c.id = tai.created_by_user_id
       LEFT JOIN provider_schedule_events e ON e.id = tai.meeting_event_id
       WHERE tai.id = ?`,
      [parseInt(id, 10)]
    );
    return this.mapRow(rows[0]);
  }

  static async listForUser(userId, { agencyId = null, status = null } = {}) {
    const uid = parseInt(userId, 10);
    let query = `
      SELECT tai.*,
             a.first_name AS assignee_first_name, a.last_name AS assignee_last_name,
             c.first_name AS creator_first_name, c.last_name AS creator_last_name,
             e.title AS meeting_title,
             tl.name AS task_list_name,
             tp.name AS project_name
      FROM task_action_items tai
      LEFT JOIN users a ON a.id = tai.assignee_user_id
      LEFT JOIN users c ON c.id = tai.created_by_user_id
      LEFT JOIN provider_schedule_events e ON e.id = tai.meeting_event_id
      LEFT JOIN task_lists tl ON tl.id = tai.task_list_id
      LEFT JOIN task_projects tp ON tp.id = tai.project_id
      WHERE (tai.assignee_user_id = ? OR tai.created_by_user_id = ?
        OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.action_item_id = tai.id AND ta.user_id = ?))
        AND tai.status != 'cancelled'
        AND (COALESCE(tai.is_private, 0) = 0 OR tai.assignee_user_id = ? OR tai.created_by_user_id = ?
          OR EXISTS (SELECT 1 FROM task_assignees ta2 WHERE ta2.action_item_id = tai.id AND ta2.user_id = ?))
    `;
    const params = [uid, uid, uid, uid, uid, uid];
    if (agencyId) {
      query += ' AND (tai.agency_id = ? OR tai.agency_id IS NULL)';
      params.push(parseInt(agencyId, 10));
    }
    if (status) {
      query += ' AND tai.status = ?';
      params.push(status);
    }
    query += ' ORDER BY (tai.status = \'completed\'), tai.updated_at DESC';
    try {
      const [rows] = await pool.execute(query, params);
      return (rows || []).map((r) => this.mapRow(r));
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [rows] = await pool.execute(
        `SELECT tai.*, a.first_name AS assignee_first_name, a.last_name AS assignee_last_name,
                c.first_name AS creator_first_name, c.last_name AS creator_last_name, e.title AS meeting_title
         FROM task_action_items tai
         LEFT JOIN users a ON a.id = tai.assignee_user_id
         LEFT JOIN users c ON c.id = tai.created_by_user_id
         LEFT JOIN provider_schedule_events e ON e.id = tai.meeting_event_id
         WHERE (tai.assignee_user_id = ? OR tai.created_by_user_id = ?) AND tai.status != 'cancelled'
         ORDER BY (tai.status = 'completed'), tai.updated_at DESC`,
        [uid, uid]
      );
      return (rows || []).map((r) => this.mapRow(r));
    }
  }

  static async create({
    parentTaskId = null,
    meetingEventId = null,
    meetingActionKey = null,
    title,
    notes = null,
    assigneeUserId = null,
    createdByUserId,
    agencyId = null,
    hubTaskId = null,
    taskListId = null,
    projectId = null,
    isPrivate = false
  }) {
    try {
      const [result] = await pool.execute(
        `INSERT INTO task_action_items
          (parent_task_id, meeting_event_id, meeting_action_key, title, notes,
           assignee_user_id, created_by_user_id, agency_id, hub_task_id,
           task_list_id, project_id, is_private)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parentTaskId,
          meetingEventId,
          meetingActionKey,
          String(title || '').trim(),
          notes,
          assigneeUserId,
          createdByUserId,
          agencyId,
          hubTaskId,
          taskListId,
          projectId,
          isPrivate ? 1 : 0
        ]
      );
      return this.findById(result.insertId);
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [result] = await pool.execute(
        `INSERT INTO task_action_items
          (parent_task_id, meeting_event_id, meeting_action_key, title, notes,
           assignee_user_id, created_by_user_id, agency_id, hub_task_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parentTaskId,
          meetingEventId,
          meetingActionKey,
          String(title || '').trim(),
          notes,
          assigneeUserId,
          createdByUserId,
          agencyId,
          hubTaskId
        ]
      );
      return this.findById(result.insertId);
    }
  }

  static async upsertFromMeeting({
    meetingEventId,
    meetingActionKey,
    title,
    notes,
    assigneeUserId,
    createdByUserId,
    agencyId,
    done,
    hubTaskId
  }) {
    const [existing] = await pool.execute(
      `SELECT id FROM task_action_items WHERE meeting_event_id = ? AND meeting_action_key = ?`,
      [meetingEventId, String(meetingActionKey)]
    );
    if (existing[0]?.id) {
      await pool.execute(
        `UPDATE task_action_items SET
           title = ?, notes = ?, assignee_user_id = ?, agency_id = ?,
           status = ?, completed_at = ?, hub_task_id = COALESCE(?, hub_task_id)
         WHERE id = ?`,
        [
          String(title || '').trim(),
          notes || null,
          assigneeUserId || null,
          agencyId || null,
          done ? 'completed' : 'pending',
          done ? new Date() : null,
          hubTaskId || null,
          existing[0].id
        ]
      );
      return this.findById(existing[0].id);
    }
    const item = await this.create({
      meetingEventId,
      meetingActionKey: String(meetingActionKey),
      title,
      notes,
      assigneeUserId,
      createdByUserId,
      agencyId,
      hubTaskId
    });
    if (done) {
      await this.complete(item.id);
      return this.findById(item.id);
    }
    return item;
  }

  static async update(id, updates = {}) {
    const fields = [];
    const params = [];
    if (updates.title !== undefined) { fields.push('title = ?'); params.push(String(updates.title).trim()); }
    if (updates.notes !== undefined) { fields.push('notes = ?'); params.push(updates.notes); }
    if (updates.assigneeUserId !== undefined) { fields.push('assignee_user_id = ?'); params.push(updates.assigneeUserId); }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      params.push(updates.status);
      if (updates.status === 'completed') {
        fields.push('completed_at = COALESCE(completed_at, NOW())');
      } else if (updates.status === 'pending' || updates.status === 'in_progress') {
        fields.push('completed_at = NULL');
      }
    }
    if (updates.hubTaskId !== undefined) { fields.push('hub_task_id = ?'); params.push(updates.hubTaskId); }
    if (updates.taskListId !== undefined) { fields.push('task_list_id = ?'); params.push(updates.taskListId); }
    if (updates.projectId !== undefined) { fields.push('project_id = ?'); params.push(updates.projectId); }
    if (updates.isPrivate !== undefined) { fields.push('is_private = ?'); params.push(updates.isPrivate ? 1 : 0); }
    if (!fields.length) return this.findById(id);
    params.push(id);
    await pool.execute(`UPDATE task_action_items SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  static async complete(id) {
    return this.update(id, { status: 'completed' });
  }

  static async reopen(id) {
    return this.update(id, { status: 'pending' });
  }

  static async countOpenForUser(userId) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS c FROM task_action_items
       WHERE assignee_user_id = ? AND status NOT IN ('completed', 'cancelled')`,
      [userId]
    );
    return Number(rows?.[0]?.c || 0);
  }
}

export default TaskActionItem;
