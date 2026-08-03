import pool from '../config/database.js';

class Task {
  static toMySQLDateTime(dueDate) {
    if (!dueDate) return null;
    try {
      // If it's already in MySQL format (YYYY-MM-DD HH:MM:SS), use it as-is
      if (typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dueDate)) {
        return dueDate;
      }

      const date = new Date(dueDate);
      if (isNaN(date.getTime())) return null;

      // Format as MySQL DATETIME: YYYY-MM-DD HH:MM:SS
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (err) {
      return null;
    }
  }

  static async create(taskData) {
    const {
      taskType,
      title,
      description,
      assignedToUserId,
      assignedToRole,
      assignedToAgencyId,
      assignedByUserId,
      dueDate,
      referenceId,
      metadata,
      documentActionType,
      taskListId,
      urgency,
      isRecurring,
      recurringRule,
      typicalDayOfWeek,
      typicalTime,
      targetCount,
      isRequired,
      departmentId,
      sourceRefType,
      sourceRefId,
      linkedScheduleEventId
    } = taskData;

    console.log('Task.create: Creating task with data', {
      taskType,
      documentActionType: documentActionType ?? (taskType === 'document' ? 'signature' : null),
      title,
      assignedToUserId,
      assignedToRole,
      assignedToAgencyId,
      assignedByUserId,
      referenceId
    });

    const dueDateMySQL = this.toMySQLDateTime(dueDate);
    const urgencyVal = urgency && ['low', 'medium', 'high'].includes(urgency) ? urgency : 'medium';
    const typicalTimeVal = typicalTime != null ? String(typicalTime) : null; // e.g. "09:00" or "09:00:00"

    const targetCountVal = targetCount != null ? Math.max(0, parseInt(targetCount, 10) || 0) : null;
    const baseParams = [
      taskType,
      documentActionType ?? (taskType === 'document' ? 'signature' : null),
      title,
      description,
      assignedToUserId ?? null,
      assignedToRole ?? null,
      assignedToAgencyId ?? null,
      assignedByUserId ?? null,
      dueDateMySQL,
      referenceId ?? null,
      metadata ? JSON.stringify(metadata) : null,
      taskListId ?? null,
      urgencyVal,
      !!isRecurring,
      recurringRule ? JSON.stringify(recurringRule) : null,
      typicalDayOfWeek ?? null,
      typicalTimeVal,
      targetCountVal,
      isRequired ? 1 : 0
    ];
    let result;
    try {
      [result] = await pool.execute(
        `INSERT INTO tasks (
          task_type, document_action_type, title, description, assigned_to_user_id, 
          assigned_to_role, assigned_to_agency_id, assigned_by_user_id, 
          due_date, reference_id, metadata,
          task_list_id, urgency, is_recurring, recurring_rule, typical_day_of_week, typical_time,
          department_id, source_ref_type, source_ref_id, linked_schedule_event_id,
          target_count, is_required
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ...baseParams.slice(0, 17),
          departmentId != null ? parseInt(departmentId, 10) || null : null,
          sourceRefType ?? null,
          sourceRefId != null ? String(sourceRefId) : null,
          linkedScheduleEventId != null ? parseInt(linkedScheduleEventId, 10) || null : null,
          ...baseParams.slice(17)
        ]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') throw e;
      // Migration 1105 not applied yet — fall back to legacy columns.
      [result] = await pool.execute(
        `INSERT INTO tasks (
          task_type, document_action_type, title, description, assigned_to_user_id, 
          assigned_to_role, assigned_to_agency_id, assigned_by_user_id, 
          due_date, reference_id, metadata,
          task_list_id, urgency, is_recurring, recurring_rule, typical_day_of_week, typical_time, target_count, is_required
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        baseParams
      );
    }

    const insertId = result.insertId;
    if (!insertId) {
      console.error('Task.create: No insertId returned from database');
      throw new Error('Failed to create task: No ID returned');
    }

    console.log(`Task.create: Task inserted with ID ${insertId}, fetching created task...`);

    const createdTask = await this.findById(insertId);
    if (!createdTask) {
      console.error(`Task.create: Task with id ${insertId} not found after creation`);
      throw new Error(`Failed to retrieve created task with id ${insertId}`);
    }

    console.log(`Task.create: Successfully created task ${insertId}`, {
      id: createdTask.id,
      taskType: createdTask.task_type,
      assignedToUserId: createdTask.assigned_to_user_id,
      assignedToAgencyId: createdTask.assigned_to_agency_id,
      title: createdTask.title
    });

    return createdTask;
  }

  static async findById(id) {
    if (!id) {
      console.error('Task.findById called with null/undefined id');
      return null;
    }
    const [rows] = await pool.execute(
      'SELECT * FROM tasks WHERE id = ?',
      [parseInt(id)]
    );
    if (rows.length === 0) {
      console.warn(`Task.findById: No task found with id ${id}`);
    }
    return rows[0] || null;
  }

  static _appendHubFilters(query, params, filters = {}) {
    const view = String(filters.view || '').toLowerCase();
    const userId = filters.userId != null ? Number(filters.userId) : null;
    let q = query;
    const p = params;

    if (view === 'assigned' && userId) {
      q += ' AND t.assigned_to_user_id = ?';
      p.push(userId);
    } else if (view === 'mine' && userId) {
      q += ' AND t.assigned_by_user_id = ? AND (t.assigned_to_user_id IS NULL OR t.assigned_to_user_id != ?)';
      p.push(userId, userId);
    } else if (view === 'watchlist' && userId) {
      q += ` AND t.task_list_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM task_list_members tlm
          WHERE tlm.task_list_id = t.task_list_id AND tlm.user_id = ?
        )
        AND (t.assigned_to_user_id IS NULL OR t.assigned_to_user_id != ?)`;
      p.push(userId, userId);
    }

    if (filters.urgency && ['low', 'medium', 'high'].includes(filters.urgency)) {
      q += " AND COALESCE(t.urgency, 'medium') = ?";
      p.push(filters.urgency);
    }

    if (filters.departmentId) {
      const deptId = parseInt(filters.departmentId, 10);
      if (!Number.isNaN(deptId)) {
        q += ` AND (
          t.department_id = ?
          OR (
            t.department_id IS NULL
            AND t.assigned_to_user_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM user_department_assignments uda
              WHERE uda.user_id = t.assigned_to_user_id AND uda.department_id = ?
            )
          )
        )`;
        p.push(deptId, deptId);
      }
    }

    if (filters.q) {
      const needle = `%${String(filters.q).trim().slice(0, 120)}%`;
      q += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      p.push(needle, needle);
    }

    if (filters.due === 'overdue') {
      q += ` AND t.due_date IS NOT NULL AND t.due_date < NOW() AND t.status NOT IN ('completed', 'overridden')`;
    } else if (filters.due === 'today') {
      q += ` AND t.due_date IS NOT NULL AND DATE(t.due_date) = CURDATE()`;
    } else if (filters.due === 'week') {
      q += ` AND t.due_date IS NOT NULL AND t.due_date >= CURDATE() AND t.due_date < DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;
    }

    return { query: q, params: p };
  }

  static async findByUser(userId, filters = {}) {
    let query = `
      SELECT t.*,
        tl.name as task_list_name,
        ad.name as department_name,
        assignee.first_name as assignee_first_name,
        assignee.last_name as assignee_last_name,
        CASE 
          WHEN t.assigned_to_user_id = ? THEN 'direct'
          WHEN t.assigned_to_role IS NOT NULL THEN 'role'
          WHEN t.assigned_to_agency_id IS NOT NULL AND t.assigned_to_user_id IS NULL THEN 'agency'
          ELSE 'unknown'
        END as assignment_type
      FROM tasks t
      LEFT JOIN task_lists tl ON tl.id = t.task_list_id
      LEFT JOIN agency_departments ad ON ad.id = t.department_id
      LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
      WHERE (
        t.assigned_to_user_id = ?
        OR (t.assigned_to_role IS NOT NULL AND t.assigned_to_user_id IS NULL AND EXISTS (
          SELECT 1 FROM users u 
          JOIN user_agencies ua ON u.id = ua.user_id
          WHERE u.id = ? AND u.role = t.assigned_to_role
          AND (t.assigned_to_agency_id IS NULL OR ua.agency_id = t.assigned_to_agency_id)
        ))
        OR (t.assigned_to_agency_id IS NOT NULL AND t.assigned_to_user_id IS NULL AND EXISTS (
          SELECT 1 FROM user_agencies ua 
          WHERE ua.user_id = ? AND ua.agency_id = t.assigned_to_agency_id
        ))
        OR (t.task_list_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM task_list_members tlm
          WHERE tlm.task_list_id = t.task_list_id AND tlm.user_id = ?
        ))
      )
    `;
    let params = [userId, userId, userId, userId, userId];

    if (filters.taskType) {
      query += ' AND t.task_type = ?';
      params.push(filters.taskType);
    }

    if (filters.status) {
      query += ' AND t.status = ?';
      params.push(filters.status);
    }

    ({ query, params } = this._appendHubFilters(query, params, {
      ...filters,
      userId: parseInt(userId, 10)
    }));

    query += ` ORDER BY 
      CASE COALESCE(t.urgency, 'medium') WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      (t.due_date IS NULL), t.due_date ASC,
      t.created_at DESC`;

    if (filters.limit != null) {
      const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 50, 1), 200);
      const offset = Math.max(parseInt(filters.offset, 10) || 0, 0);
      query += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);
    }

    try {
      const [rows] = await pool.execute(query, params);
      return rows.map((row) => ({
        ...row,
        metadata: this.parseMetadata(row.metadata)
      }));
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      // Pre-1105 schema: retry without department / assignee joins.
      let legacyQuery = `
        SELECT t.*,
          tl.name as task_list_name,
          CASE 
            WHEN t.assigned_to_user_id = ? THEN 'direct'
            WHEN t.assigned_to_role IS NOT NULL THEN 'role'
            WHEN t.assigned_to_agency_id IS NOT NULL AND t.assigned_to_user_id IS NULL THEN 'agency'
            ELSE 'unknown'
          END as assignment_type
        FROM tasks t
        LEFT JOIN task_lists tl ON tl.id = t.task_list_id
        WHERE (
          t.assigned_to_user_id = ?
          OR (t.assigned_to_role IS NOT NULL AND t.assigned_to_user_id IS NULL AND EXISTS (
            SELECT 1 FROM users u 
            JOIN user_agencies ua ON u.id = ua.user_id
            WHERE u.id = ? AND u.role = t.assigned_to_role
            AND (t.assigned_to_agency_id IS NULL OR ua.agency_id = t.assigned_to_agency_id)
          ))
          OR (t.assigned_to_agency_id IS NOT NULL AND t.assigned_to_user_id IS NULL AND EXISTS (
            SELECT 1 FROM user_agencies ua 
            WHERE ua.user_id = ? AND ua.agency_id = t.assigned_to_agency_id
          ))
          OR (t.task_list_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM task_list_members tlm
            WHERE tlm.task_list_id = t.task_list_id AND tlm.user_id = ?
          ))
        )
      `;
      let legacyParams = [userId, userId, userId, userId, userId];
      if (filters.taskType) {
        legacyQuery += ' AND t.task_type = ?';
        legacyParams.push(filters.taskType);
      }
      if (filters.status) {
        legacyQuery += ' AND t.status = ?';
        legacyParams.push(filters.status);
      }
      legacyQuery += ` ORDER BY 
        CASE COALESCE(t.urgency, 'medium') WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        (t.due_date IS NULL), t.due_date ASC,
        t.created_at DESC`;
      const [rows] = await pool.execute(legacyQuery, legacyParams);
      return rows.map((row) => ({
        ...row,
        metadata: this.parseMetadata(row.metadata)
      }));
    }
  }

  /**
   * Hub listing: personal views or agency-wide (all) for admins/supervisors.
   */
  static async findForHub(userId, filters = {}) {
    const uid = parseInt(userId, 10);
    const view = String(filters.view || 'assigned').toLowerCase();
    const hubFilters = { ...filters, userId: uid };

    if (view === 'all' && filters.agencyId) {
      let query = `
        SELECT t.*,
          tl.name as task_list_name,
          ad.name as department_name,
          assignee.first_name as assignee_first_name,
          assignee.last_name as assignee_last_name,
          'agency' as assignment_type
        FROM tasks t
        LEFT JOIN task_lists tl ON tl.id = t.task_list_id
        LEFT JOIN agency_departments ad ON ad.id = t.department_id
        LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
        WHERE t.assigned_to_agency_id = ?
      `;
      let params = [parseInt(filters.agencyId, 10)];
      if (filters.taskType) {
        query += ' AND t.task_type = ?';
        params.push(filters.taskType);
      }
      if (filters.status) {
        query += ' AND t.status = ?';
        params.push(filters.status);
      }
      const filterOnly = { ...hubFilters, view: '' };
      delete filterOnly.limit;
      delete filterOnly.offset;
      ({ query, params } = this._appendHubFilters(query, params, filterOnly));
      query += ` ORDER BY
        CASE COALESCE(t.urgency, 'medium') WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        (t.due_date IS NULL), t.due_date ASC,
        t.created_at DESC`;
      if (filters.limit != null) {
        const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 50, 1), 200);
        const offset = Math.max(parseInt(filters.offset, 10) || 0, 0);
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
      }
      const [rows] = await pool.execute(query, params);
      return rows.map((row) => ({ ...row, metadata: this.parseMetadata(row.metadata) }));
    }

    return this.findByUser(uid, hubFilters);
  }

  static async getHubCounts(userId, { agencyId = null, canViewAll = false } = {}) {
    const uid = parseInt(userId, 10);
    const tasks = await this.findByUser(uid, {});
    const open = (t) => t.status !== 'completed' && t.status !== 'overridden';
    const overdue = (t) =>
      open(t) && t.due_date && new Date(t.due_date).getTime() < Date.now();

    const assigned = tasks.filter((t) => Number(t.assigned_to_user_id) === uid);
    const mine = tasks.filter(
      (t) => Number(t.assigned_by_user_id) === uid && Number(t.assigned_to_user_id) !== uid
    );
    const watchlist = tasks.filter(
      (t) =>
        t.task_list_id &&
        Number(t.assigned_to_user_id) !== uid &&
        open(t)
    );

    let allOpen = 0;
    let allOverdue = 0;
    if (canViewAll && agencyId) {
      const [rows] = await pool.execute(
        `SELECT
           SUM(CASE WHEN status NOT IN ('completed','overridden') THEN 1 ELSE 0 END) AS open_count,
           SUM(CASE WHEN status NOT IN ('completed','overridden') AND due_date IS NOT NULL AND due_date < NOW() THEN 1 ELSE 0 END) AS overdue_count
         FROM tasks WHERE assigned_to_agency_id = ?`,
        [parseInt(agencyId, 10)]
      );
      allOpen = Number(rows?.[0]?.open_count || 0);
      allOverdue = Number(rows?.[0]?.overdue_count || 0);
    }

    const pending = tasks.filter((t) => t.status === 'pending').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const overdueCount = tasks.filter(overdue).length;

    return {
      training: await this.getTrainingTaskCount(uid),
      document: await this.getDocumentTaskCount(uid),
      assigned: assigned.filter(open).length,
      mine: mine.filter(open).length,
      watchlist: watchlist.length,
      all: canViewAll ? allOpen : tasks.filter(open).length,
      pending,
      in_progress: inProgress,
      completed,
      overdue: overdueCount,
      open: tasks.filter(open).length,
      agency_overdue: allOverdue
    };
  }

  static async findByAgency(agencyId, filters = {}) {
    let query = 'SELECT * FROM tasks WHERE assigned_to_agency_id = ?';
    const params = [agencyId];

    if (filters.taskType) {
      query += ' AND task_type = ?';
      params.push(filters.taskType);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY due_date ASC, created_at DESC';

    const [rows] = await pool.execute(query, params);
    return rows.map(row => ({
      ...row,
      metadata: this.parseMetadata(row.metadata)
    }));
  }

  static async findByRole(role, agencyId = null, filters = {}) {
    let query = 'SELECT * FROM tasks WHERE assigned_to_role = ?';
    const params = [role];

    if (agencyId) {
      query += ' AND assigned_to_agency_id = ?';
      params.push(agencyId);
    }

    if (filters.taskType) {
      query += ' AND task_type = ?';
      params.push(filters.taskType);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY due_date ASC, created_at DESC';

    const [rows] = await pool.execute(query, params);
    return rows.map(row => ({
      ...row,
      metadata: this.parseMetadata(row.metadata)
    }));
  }

  static async markComplete(taskId, userId) {
    await pool.execute(
      'UPDATE tasks SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['completed', taskId]
    );
    return this.findById(taskId);
  }

  static async markIncomplete(taskId) {
    await pool.execute(
      'UPDATE tasks SET status = ?, completed_at = NULL WHERE id = ?',
      ['pending', taskId]
    );
    return this.findById(taskId);
  }

  static async override(taskId, userId) {
    await pool.execute(
      'UPDATE tasks SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['overridden', taskId]
    );
    return this.findById(taskId);
  }

  static async updateDueDate(taskId, dueDate) {
    const dueDateMySQL = this.toMySQLDateTime(dueDate);

    await pool.execute(
      'UPDATE tasks SET due_date = ? WHERE id = ?',
      [dueDateMySQL, taskId]
    );
    return this.findById(taskId);
  }

  static async updateCustomTask(taskId, {
    title,
    description,
    dueDate,
    taskListId,
    assignedToUserId,
    urgency,
    isRecurring,
    recurringRule,
    typicalDayOfWeek,
    typicalTime,
    targetCount,
    metadata
  }) {
    const parts = [];
    const params = [];
    if (title !== undefined) {
      parts.push('title = ?');
      params.push(title);
    }
    if (description !== undefined) {
      parts.push('description = ?');
      params.push(description);
    }
    if (dueDate !== undefined) {
      parts.push('due_date = ?');
      params.push(this.toMySQLDateTime(dueDate));
    }
    if (taskListId !== undefined) {
      parts.push('task_list_id = ?');
      params.push(taskListId ?? null);
    }
    if (assignedToUserId !== undefined) {
      parts.push('assigned_to_user_id = ?');
      params.push(assignedToUserId != null ? parseInt(assignedToUserId, 10) : null);
    }
    if (urgency !== undefined && ['low', 'medium', 'high'].includes(urgency)) {
      parts.push('urgency = ?');
      params.push(urgency);
    }
    if (isRecurring !== undefined) {
      parts.push('is_recurring = ?');
      params.push(!!isRecurring);
    }
    if (recurringRule !== undefined) {
      parts.push('recurring_rule = ?');
      params.push(recurringRule ? JSON.stringify(recurringRule) : null);
    }
    if (typicalDayOfWeek !== undefined) {
      parts.push('typical_day_of_week = ?');
      params.push(typicalDayOfWeek ?? null);
    }
    if (typicalTime !== undefined) {
      parts.push('typical_time = ?');
      params.push(typicalTime != null ? String(typicalTime) : null);
    }
    if (targetCount !== undefined) {
      parts.push('target_count = ?');
      params.push(targetCount != null ? Math.max(0, parseInt(targetCount, 10) || 0) : null);
    }
    if (metadata !== undefined && metadata !== null) {
      parts.push('metadata = ?');
      params.push(typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
    }
    if (parts.length === 0) return this.findById(taskId);
    params.push(parseInt(taskId, 10));
    await pool.execute(
      `UPDATE tasks SET ${parts.join(', ')} WHERE id = ?`,
      params
    );
    return this.findById(taskId);
  }

  static async findTrainingTrackTasksForUser({ userId, agencyId, trackId }) {
    const [rows] = await pool.execute(
      `
      SELECT id, reference_id, status, due_date
      FROM tasks
      WHERE task_type = 'training'
        AND assigned_to_user_id = ?
        AND assigned_to_agency_id = ?
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.trackId')) AS UNSIGNED) = ?
      `,
      [parseInt(userId), parseInt(agencyId), parseInt(trackId)]
    );
    return rows || [];
  }

  static async updateDueDateByIds(taskIds, dueDate, { onlyActive = true } = {}) {
    const ids = Array.isArray(taskIds) ? taskIds.filter(Boolean).map((x) => parseInt(x)) : [];
    if (ids.length === 0) return { updated: 0 };

    const dueDateMySQL = this.toMySQLDateTime(dueDate);
    const placeholders = ids.map(() => '?').join(',');
    const params = [dueDateMySQL, ...ids];

    let sql = `UPDATE tasks SET due_date = ? WHERE id IN (${placeholders})`;
    if (onlyActive) {
      sql += ` AND status IN ('pending', 'in_progress')`;
    }

    const [result] = await pool.execute(sql, params);
    return { updated: result?.affectedRows || 0 };
  }

  static async deleteById(taskId) {
    if (!taskId) return false;
    const [result] = await pool.execute('DELETE FROM tasks WHERE id = ?', [parseInt(taskId)]);
    return result.affectedRows > 0;
  }

  static async deleteByIds(taskIds) {
    const ids = Array.isArray(taskIds) ? taskIds.filter(Boolean).map((x) => parseInt(x)) : [];
    if (ids.length === 0) return { deleted: 0 };
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await pool.execute(`DELETE FROM tasks WHERE id IN (${placeholders})`, ids);
    return { deleted: Number(result.affectedRows || 0) };
  }

  static async updateStatus(taskId, status) {
    await pool.execute(
      'UPDATE tasks SET status = ? WHERE id = ?',
      [status, taskId]
    );
    return this.findById(taskId);
  }

  static async getTrainingTaskCount(userId) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE task_type = 'training' 
       AND status != 'completed' 
       AND status != 'overridden'
       AND (
         assigned_to_user_id = ?
         OR (assigned_to_role IS NOT NULL AND assigned_to_user_id IS NULL AND EXISTS (
           SELECT 1 FROM users u 
           JOIN user_agencies ua ON u.id = ua.user_id
           WHERE u.id = ? AND u.role = tasks.assigned_to_role
           AND (tasks.assigned_to_agency_id IS NULL OR ua.agency_id = tasks.assigned_to_agency_id)
         ))
         OR (assigned_to_agency_id IS NOT NULL AND assigned_to_user_id IS NULL AND EXISTS (
           SELECT 1 FROM user_agencies ua 
           WHERE ua.user_id = ? AND ua.agency_id = tasks.assigned_to_agency_id
         ))
       )`,
      [userId, userId, userId]
    );
    return rows[0].count;
  }

  static async getDocumentTaskCount(userId) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE task_type = 'document' 
       AND status != 'completed' 
       AND status != 'overridden'
       AND (
         assigned_to_user_id = ?
         OR (assigned_to_role IS NOT NULL AND assigned_to_user_id IS NULL AND EXISTS (
           SELECT 1 FROM users u 
           JOIN user_agencies ua ON u.id = ua.user_id
           WHERE u.id = ? AND u.role = tasks.assigned_to_role
           AND (tasks.assigned_to_agency_id IS NULL OR ua.agency_id = tasks.assigned_to_agency_id)
         ))
         OR (assigned_to_agency_id IS NOT NULL AND assigned_to_user_id IS NULL AND EXISTS (
           SELECT 1 FROM user_agencies ua 
           WHERE ua.user_id = ? AND ua.agency_id = tasks.assigned_to_agency_id
         ))
       )`,
      [userId, userId, userId]
    );
    return rows[0].count;
  }

  static async getAll(filters = {}) {
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (filters.taskType) {
      query += ' AND task_type = ?';
      params.push(filters.taskType);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.assignedToUserId) {
      query += ' AND assigned_to_user_id = ?';
      // Ensure it's an integer
      const userId = parseInt(filters.assignedToUserId);
      if (isNaN(userId)) {
        console.error('Task.getAll: Invalid assignedToUserId', filters.assignedToUserId);
        return [];
      }
      params.push(userId);
      console.log('Task.getAll: Filtering by assignedToUserId =', userId);
    }

    // Note: assignedToAgencyId filter is separate - if both userId and agencyId are provided,
    // we want tasks assigned to that user in that agency. But if only userId is provided,
    // we want all tasks for that user regardless of agency.
    if (filters.assignedToAgencyId) {
      query += ' AND assigned_to_agency_id = ?';
      // Ensure it's an integer
      const agencyId = parseInt(filters.assignedToAgencyId);
      if (isNaN(agencyId)) {
        console.error('Task.getAll: Invalid assignedToAgencyId', filters.assignedToAgencyId);
        return [];
      }
      params.push(agencyId);
    }

    query += ' ORDER BY due_date ASC, created_at DESC';

    console.log('Task.getAll: Executing query', query, 'with params', params);
    const [rows] = await pool.execute(query, params);
    console.log(`Task.getAll: Found ${rows.length} tasks`);
    
    // Log first few tasks for debugging
    if (rows.length > 0) {
      console.log('Task.getAll: Sample tasks:', rows.slice(0, 3).map(r => ({
        id: r.id,
        task_type: r.task_type,
        assigned_to_user_id: r.assigned_to_user_id,
        assigned_to_agency_id: r.assigned_to_agency_id,
        title: r.title
      })));
    }
    
    return rows.map(row => ({
      ...row,
      metadata: this.parseMetadata(row.metadata)
    }));
  }

  static parseMetadata(metadata) {
    if (!metadata) return null;
    if (typeof metadata === 'object') return metadata; // Already parsed
    if (typeof metadata === 'string') {
      try {
        return JSON.parse(metadata);
      } catch (e) {
        return null;
      }
    }
    return null;
  }
}

export default Task;

