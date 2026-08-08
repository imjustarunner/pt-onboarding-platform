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
      linkedScheduleEventId,
      workTypeId,
      workTypeIconKey,
      isPrivate,
      projectId
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
    const isPrivateVal = isPrivate ? 1 : 0;
    try {
      [result] = await pool.execute(
        `INSERT INTO tasks (
          task_type, document_action_type, title, description, assigned_to_user_id, 
          assigned_to_role, assigned_to_agency_id, assigned_by_user_id, 
          due_date, reference_id, metadata,
          task_list_id, project_id, urgency, is_recurring, recurring_rule, typical_day_of_week, typical_time,
          department_id, work_type_id, work_type_icon_key, source_ref_type, source_ref_id, linked_schedule_event_id,
          target_count, is_required, is_private
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ...baseParams.slice(0, 12),
          projectId != null ? parseInt(projectId, 10) || null : null,
          ...baseParams.slice(12, 17),
          departmentId != null ? parseInt(departmentId, 10) || null : null,
          workTypeId != null ? parseInt(workTypeId, 10) || null : null,
          workTypeIconKey != null ? String(workTypeIconKey) : null,
          sourceRefType ?? null,
          sourceRefId != null ? String(sourceRefId) : null,
          linkedScheduleEventId != null ? parseInt(linkedScheduleEventId, 10) || null : null,
          ...baseParams.slice(17),
          isPrivateVal
        ]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') throw e;
      // Migration 1115/1105/1120 not applied yet — fall back without newer columns.
      try {
        [result] = await pool.execute(
          `INSERT INTO tasks (
            task_type, document_action_type, title, description, assigned_to_user_id, 
            assigned_to_role, assigned_to_agency_id, assigned_by_user_id, 
            due_date, reference_id, metadata,
            task_list_id, urgency, is_recurring, recurring_rule, typical_day_of_week, typical_time,
            department_id, work_type_id, work_type_icon_key, source_ref_type, source_ref_id, linked_schedule_event_id,
            target_count, is_required
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ...baseParams.slice(0, 17),
            departmentId != null ? parseInt(departmentId, 10) || null : null,
            workTypeId != null ? parseInt(workTypeId, 10) || null : null,
            workTypeIconKey != null ? String(workTypeIconKey) : null,
            sourceRefType ?? null,
            sourceRefId != null ? String(sourceRefId) : null,
            linkedScheduleEventId != null ? parseInt(linkedScheduleEventId, 10) || null : null,
            ...baseParams.slice(17)
          ]
        );
      } catch (e2) {
        if (e2?.code !== 'ER_BAD_FIELD_ERROR' && e2?.code !== 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') throw e2;
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
        } catch (e3) {
          if (e3?.code !== 'ER_BAD_FIELD_ERROR' && e3?.code !== 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') throw e3;
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
      }
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
      q += ' AND t.assigned_by_user_id = ?';
      p.push(userId);
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

    if (filters.unassignedFromList) {
      q += ' AND t.task_list_id IS NULL';
    }
    if (filters.unassignedFromProject) {
      q += ' AND t.project_id IS NULL';
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

  /** Private tasks are only visible to owner (assignee / creator / collaborator). */
  static _privateVisibleSql(alias = 't') {
    return `(
      COALESCE(${alias}.is_private, 0) = 0
      OR ${alias}.assigned_to_user_id = ?
      OR ${alias}.assigned_by_user_id = ?
      OR EXISTS (
        SELECT 1 FROM task_collaborators tc
        WHERE tc.task_id = ${alias}.id AND tc.user_id = ?
      )
    )`;
  }

  /**
   * Shared WHERE for Team Tasks list + counts.
   * Includes list/project-affiliated tasks; excludes private unless viewer is owner.
   */
  static _buildTeamTasksWhere(uid, agencyId, filters = {}) {
    const aid = parseInt(agencyId, 10);
    let where = `
      WHERE ${this._privateVisibleSql('t')}
        AND (
          t.assigned_to_agency_id = ?
          OR (t.task_list_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM task_lists tl2 WHERE tl2.id = t.task_list_id AND tl2.agency_id = ?
          ))
          OR (t.project_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM task_projects tp2 WHERE tp2.id = t.project_id AND tp2.agency_id = ?
          ))
          OR (
            t.assigned_to_agency_id IS NULL
            AND t.assigned_to_user_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM user_agencies ua
              WHERE ua.user_id = t.assigned_to_user_id AND ua.agency_id = ?
            )
          )
        )
    `;
    const params = [uid, uid, uid, aid, aid, aid, aid];

    const hidden = Array.isArray(filters.hiddenAgencyIds)
      ? filters.hiddenAgencyIds.map((n) => parseInt(n, 10)).filter((n) => n > 0)
      : [];
    if (hidden.length) {
      where += ` AND (t.assigned_to_agency_id IS NULL OR t.assigned_to_agency_id NOT IN (${hidden.map(() => '?').join(',')}))`;
      params.push(...hidden);
    }
    if (filters.assignedToUserId) {
      const auid = parseInt(filters.assignedToUserId, 10);
      where += ` AND (
        t.assigned_to_user_id = ?
        OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = t.id AND tc.user_id = ?)
      )`;
      params.push(auid, auid);
    }
    if (filters.taskListId) {
      where += ' AND t.task_list_id = ?';
      params.push(parseInt(filters.taskListId, 10));
    } else if (filters.onSharedList === true) {
      where += ' AND t.task_list_id IS NOT NULL';
    } else if (filters.onSharedList === false) {
      where += ' AND t.task_list_id IS NULL';
    }
    if (filters.projectId) {
      where += ' AND t.project_id = ?';
      params.push(parseInt(filters.projectId, 10));
    }
    if (filters.agencyIdFilter && parseInt(filters.agencyIdFilter, 10) > 0) {
      // Additional tenant filter when browsing across agencies (superadmin)
      const fa = parseInt(filters.agencyIdFilter, 10);
      where += ` AND (
        t.assigned_to_agency_id = ?
        OR EXISTS (SELECT 1 FROM task_lists tl3 WHERE tl3.id = t.task_list_id AND tl3.agency_id = ?)
        OR EXISTS (SELECT 1 FROM task_projects tp3 WHERE tp3.id = t.project_id AND tp3.agency_id = ?)
      )`;
      params.push(fa, fa, fa);
    }
    return { where, params };
  }

  static async findByUser(userId, filters = {}) {
    const uid = parseInt(userId, 10);
    let query = `
      SELECT t.*,
        tl.name as task_list_name,
        tp.name as project_name,
        ad.name as department_name,
        assignee.first_name as assignee_first_name,
        assignee.last_name as assignee_last_name,
        assignee.profile_photo_path as assignee_profile_photo_path,
        CASE 
          WHEN t.assigned_to_user_id = ? THEN 'direct'
          WHEN t.assigned_to_role IS NOT NULL THEN 'role'
          WHEN t.assigned_to_agency_id IS NOT NULL AND t.assigned_to_user_id IS NULL THEN 'agency'
          ELSE 'unknown'
        END as assignment_type
      FROM tasks t
      LEFT JOIN task_lists tl ON tl.id = t.task_list_id
      LEFT JOIN task_projects tp ON tp.id = t.project_id
      LEFT JOIN agency_departments ad ON ad.id = t.department_id
      LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
      WHERE ${this._privateVisibleSql('t')}
        AND (
        t.assigned_to_user_id = ?
        OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = t.id AND tc.user_id = ?)
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
        OR t.assigned_by_user_id = ?
      )
    `;
    // CASE uid + privateVisible (3) + WHERE access (6) = 10
    let params = [uid, uid, uid, uid, uid, uid, uid, uid, uid, uid];

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
          OR t.assigned_by_user_id = ?
        )
      `;
      let legacyParams = [userId, userId, userId, userId, userId, userId];
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
      const { where, params: whereParams } = this._buildTeamTasksWhere(uid, filters.agencyId, filters);
      let query = `
        SELECT t.*,
          tl.name as task_list_name,
          tp.name as project_name,
          ad.name as department_name,
          assignee.first_name as assignee_first_name,
          assignee.last_name as assignee_last_name,
          assignee.profile_photo_path as assignee_profile_photo_path,
          'agency' as assignment_type
        FROM tasks t
        LEFT JOIN task_lists tl ON tl.id = t.task_list_id
        LEFT JOIN task_projects tp ON tp.id = t.project_id
        LEFT JOIN agency_departments ad ON ad.id = t.department_id
        LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
        ${where}
      `;
      let params = [...whereParams];

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
        const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 50, 1), 500);
        const offset = Math.max(parseInt(filters.offset, 10) || 0, 0);
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
      }
      try {
        const [rows] = await pool.execute(query, params);
        return rows.map((row) => ({ ...row, metadata: this.parseMetadata(row.metadata) }));
      } catch (e) {
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
        // Schema lag: retry without project/assignee privacy joins
        const aid = parseInt(filters.agencyId, 10);
        const [rows] = await pool.execute(
          `SELECT t.*, tl.name as task_list_name, ad.name as department_name,
                  assignee.first_name as assignee_first_name, assignee.last_name as assignee_last_name,
                  'agency' as assignment_type
           FROM tasks t
           LEFT JOIN task_lists tl ON tl.id = t.task_list_id
           LEFT JOIN agency_departments ad ON ad.id = t.department_id
           LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
           WHERE t.assigned_to_agency_id = ?
           ORDER BY (t.due_date IS NULL), t.due_date ASC
           LIMIT 500`,
          [aid]
        );
        return rows.map((row) => ({ ...row, metadata: this.parseMetadata(row.metadata) }));
      }
    }

    return this.findByUser(uid, hubFilters);
  }

  static async countTeamTasks(userId, { agencyId, hiddenAgencyIds = [], assignedToUserId, taskListId, projectId, agencyIdFilter } = {}) {
    const uid = parseInt(userId, 10);
    const { where, params } = this._buildTeamTasksWhere(uid, agencyId, {
      hiddenAgencyIds,
      assignedToUserId,
      taskListId,
      projectId,
      agencyIdFilter
    });
    try {
      const [rows] = await pool.execute(
        `SELECT
           SUM(CASE WHEN t.status NOT IN ('completed','overridden') THEN 1 ELSE 0 END) AS open_count,
           SUM(CASE WHEN t.status NOT IN ('completed','overridden') AND t.due_date IS NOT NULL AND t.due_date < NOW() THEN 1 ELSE 0 END) AS overdue_count,
           COUNT(*) AS total_count
         FROM tasks t
         ${where}`,
        params
      );
      return {
        open: Number(rows?.[0]?.open_count || 0),
        overdue: Number(rows?.[0]?.overdue_count || 0),
        total: Number(rows?.[0]?.total_count || 0)
      };
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      return { open: 0, overdue: 0, total: 0 };
    }
  }

  static async getHubCounts(userId, {
    agencyId = null,
    canViewAll = false,
    hiddenAgencyIds = [],
    assignedToUserId = null,
    taskListId = null,
    projectId = null,
    agencyIdFilter = null
  } = {}) {
    const uid = parseInt(userId, 10);
    const tasks = await this.findByUser(uid, {});
    const open = (t) => t.status !== 'completed' && t.status !== 'overridden';
    const overdue = (t) =>
      open(t) && t.due_date && new Date(t.due_date).getTime() < Date.now();

    const assigned = tasks.filter((t) => Number(t.assigned_to_user_id) === uid);
    const mine = tasks.filter((t) => Number(t.assigned_by_user_id) === uid);
    const watchlist = tasks.filter(
      (t) =>
        t.task_list_id &&
        Number(t.assigned_to_user_id) !== uid &&
        open(t)
    );

    let sharedLists = 0;
    try {
      const [listRows] = await pool.execute(
        `SELECT COUNT(DISTINCT tl.id) AS c
         FROM task_lists tl
         LEFT JOIN task_list_members tlm ON tlm.task_list_id = tl.id AND tlm.user_id = ?
         WHERE tlm.user_id IS NOT NULL OR tl.created_by_user_id = ?`,
        [uid, uid]
      );
      sharedLists = Number(listRows?.[0]?.c || 0);
    } catch {
      sharedLists = 0;
    }

    let projectsCount = 0;
    try {
      const [pRows] = await pool.execute(
        `SELECT COUNT(DISTINCT tp.id) AS c
         FROM task_projects tp
         LEFT JOIN task_project_members tpm ON tpm.project_id = tp.id AND tpm.user_id = ?
         WHERE (tpm.user_id IS NOT NULL OR tp.created_by_user_id = ?) AND tp.status != 'archived'`,
        [uid, uid]
      );
      projectsCount = Number(pRows?.[0]?.c || 0);
    } catch {
      projectsCount = 0;
    }

    let allOpen = 0;
    let allOverdue = 0;
    let allTotal = 0;
    if (canViewAll && agencyId) {
      const team = await this.countTeamTasks(uid, {
        agencyId,
        hiddenAgencyIds,
        assignedToUserId,
        taskListId,
        projectId,
        agencyIdFilter
      });
      allOpen = team.open;
      allOverdue = team.overdue;
      allTotal = team.total;
    } else if (canViewAll && !agencyId) {
      allOpen = tasks.filter(open).length;
      allTotal = tasks.length;
    }

    let actionItemsOpen = 0;
    try {
      const [aiRows] = await pool.execute(
        `SELECT COUNT(*) AS c FROM task_action_items
         WHERE (assignee_user_id = ? OR created_by_user_id = ?)
           AND status NOT IN ('completed', 'cancelled')
           AND (COALESCE(is_private, 0) = 0 OR assignee_user_id = ? OR created_by_user_id = ?)`,
        [uid, uid, uid, uid]
      );
      actionItemsOpen = Number(aiRows?.[0]?.c || 0);
    } catch {
      actionItemsOpen = tasks.filter((t) => t.task_type === 'meeting_action' && open(t)).length;
    }

    const pending = tasks.filter((t) => t.status === 'pending').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const overdueCount = tasks.filter(overdue).length;
    const personalOpen = tasks.filter(open).length;

    return {
      training: await this.getTrainingTaskCount(uid),
      document: await this.getDocumentTaskCount(uid),
      assigned: assigned.filter(open).length,
      mine: mine.filter(open).length,
      watchlist: watchlist.length,
      action_items: actionItemsOpen,
      shared_lists: sharedLists,
      projects: projectsCount,
      all: canViewAll ? allOpen : personalOpen,
      all_total: canViewAll ? allTotal : tasks.length,
      pending,
      in_progress: inProgress,
      completed,
      overdue: overdueCount,
      open: personalOpen,
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
    metadata,
    isPrivate,
    projectId,
    workTypeId
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
    if (workTypeId !== undefined) {
      parts.push('work_type_id = ?');
      params.push(workTypeId != null && workTypeId !== '' ? parseInt(workTypeId, 10) || null : null);
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
    if (isPrivate !== undefined) {
      parts.push('is_private = ?');
      params.push(isPrivate ? 1 : 0);
    }
    if (projectId !== undefined) {
      parts.push('project_id = ?');
      params.push(projectId != null ? parseInt(projectId, 10) || null : null);
    }
    if (parts.length === 0) return this.findById(taskId);
    params.push(parseInt(taskId, 10));
    try {
      await pool.execute(
        `UPDATE tasks SET ${parts.join(', ')} WHERE id = ?`,
        params
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR' || isPrivate === undefined) throw e;
      const idx = parts.indexOf('is_private = ?');
      if (idx >= 0) {
        parts.splice(idx, 1);
        params.splice(idx, 1);
      }
      if (parts.length === 0) return this.findById(taskId);
      await pool.execute(
        `UPDATE tasks SET ${parts.join(', ')} WHERE id = ?`,
        params
      );
    }
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

  /**
   * Cross-entity search candidates for hub fuzzy ranking.
   */
  static async searchHub(userId, q, { agencyId = null, canViewAll = false } = {}) {
    const uid = parseInt(userId, 10);
    const needle = `%${String(q || '').trim().slice(0, 120)}%`;
    if (!String(q || '').trim()) return [];

    const results = [];
    try {
      const personal = await this.findByUser(uid, { q: String(q).trim(), limit: 40 });
      for (const t of personal) {
        results.push({
          entity_type: 'task',
          entity_id: t.id,
          title: t.title,
          subtitle: t.task_list_name || t.project_name || t.task_type,
          view: Number(t.assigned_to_user_id) === uid
            ? 'assigned'
            : Number(t.assigned_by_user_id) === uid
              ? 'mine'
              : (t.task_list_id ? 'shared' : 'mine'),
          status: t.status,
          task: t
        });
      }
    } catch { /* ignore */ }

    if (canViewAll && agencyId) {
      try {
        const team = await this.findForHub(uid, {
          view: 'all',
          agencyId,
          q: String(q).trim(),
          limit: 40
        });
        for (const t of team) {
          if (results.some((r) => r.entity_type === 'task' && Number(r.entity_id) === Number(t.id))) continue;
          results.push({
            entity_type: 'task',
            entity_id: t.id,
            title: t.title,
            subtitle: t.task_list_name || t.project_name || 'Team',
            view: 'all',
            status: t.status,
            task: t
          });
        }
      } catch { /* ignore */ }
    }

    try {
      const [aiRows] = await pool.execute(
        `SELECT tai.*, e.title AS meeting_title
         FROM task_action_items tai
         LEFT JOIN provider_schedule_events e ON e.id = tai.meeting_event_id
         WHERE (tai.assignee_user_id = ? OR tai.created_by_user_id = ?)
           AND tai.status != 'cancelled'
           AND (COALESCE(tai.is_private, 0) = 0 OR tai.assignee_user_id = ? OR tai.created_by_user_id = ?)
           AND (tai.title LIKE ? OR tai.notes LIKE ?)
         ORDER BY tai.updated_at DESC
         LIMIT 30`,
        [uid, uid, uid, uid, needle, needle]
      );
      for (const a of aiRows || []) {
        results.push({
          entity_type: 'action_item',
          entity_id: a.id,
          title: a.title,
          subtitle: a.meeting_title || 'Action Item',
          view: 'action_items',
          status: a.status,
          action_item: a
        });
      }
    } catch { /* ignore */ }

    try {
      const [listRows] = await pool.execute(
        `SELECT tl.* FROM task_lists tl
         LEFT JOIN task_list_members tlm ON tlm.task_list_id = tl.id AND tlm.user_id = ?
         WHERE (tlm.user_id IS NOT NULL OR tl.created_by_user_id = ?)
           AND tl.name LIKE ?
         LIMIT 20`,
        [uid, uid, needle]
      );
      for (const l of listRows || []) {
        results.push({
          entity_type: 'shared_list',
          entity_id: l.id,
          title: l.name,
          subtitle: 'Shared List',
          view: 'shared',
          status: null
        });
      }
    } catch { /* ignore */ }

    if (canViewAll && agencyId) {
      try {
        const [teamLists] = await pool.execute(
          `SELECT tl.* FROM task_lists tl
           WHERE tl.agency_id = ? AND tl.name LIKE ?
           LIMIT 20`,
          [parseInt(agencyId, 10), needle]
        );
        for (const l of teamLists || []) {
          if (results.some((r) => r.entity_type === 'shared_list' && Number(r.entity_id) === Number(l.id))) continue;
          results.push({
            entity_type: 'shared_list',
            entity_id: l.id,
            title: l.name,
            subtitle: 'Team Shared List',
            view: 'all',
            team_mode: 'lists',
            status: null
          });
        }
      } catch { /* ignore */ }
    }

    try {
      const [projRows] = await pool.execute(
        `SELECT tp.* FROM task_projects tp
         LEFT JOIN task_project_members tpm ON tpm.project_id = tp.id AND tpm.user_id = ?
         WHERE (tpm.user_id IS NOT NULL OR tp.created_by_user_id = ? OR (? AND tp.agency_id = ?))
           AND tp.status != 'archived'
           AND (tp.name LIKE ? OR tp.description LIKE ?)
         LIMIT 20`,
        [uid, uid, canViewAll ? 1 : 0, agencyId ? parseInt(agencyId, 10) : 0, needle, needle]
      );
      for (const p of projRows || []) {
        results.push({
          entity_type: 'project',
          entity_id: p.id,
          title: p.name,
          subtitle: 'Project',
          view: 'projects',
          status: p.status
        });
      }
    } catch { /* ignore */ }

    return results;
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

