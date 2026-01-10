import pool from '../config/database.js';

class Task {
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
      documentActionType
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

    // Convert dueDate to MySQL DATETIME format if provided
    let dueDateMySQL = null;
    if (dueDate) {
      try {
        // If it's already in MySQL format (YYYY-MM-DD HH:MM:SS), use it as-is
        if (typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dueDate)) {
          dueDateMySQL = dueDate;
        } else {
          // Otherwise, parse as ISO 8601 or other format and convert to MySQL format
          const date = new Date(dueDate);
          if (isNaN(date.getTime())) {
            console.warn('Task.create: Invalid dueDate format, ignoring:', dueDate);
            dueDateMySQL = null;
          } else {
            // Format as MySQL DATETIME: YYYY-MM-DD HH:MM:SS
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            dueDateMySQL = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
          }
        }
      } catch (err) {
        console.warn('Task.create: Error converting dueDate, ignoring:', err);
        dueDateMySQL = null;
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO tasks (
        task_type, document_action_type, title, description, assigned_to_user_id, 
        assigned_to_role, assigned_to_agency_id, assigned_by_user_id, 
        due_date, reference_id, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
        metadata ? JSON.stringify(metadata) : null
      ]
    );

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

  static async findByUser(userId, filters = {}) {
    let query = `
      SELECT t.*, 
        CASE 
          WHEN t.assigned_to_user_id = ? THEN 'direct'
          WHEN t.assigned_to_role IS NOT NULL THEN 'role'
          WHEN t.assigned_to_agency_id IS NOT NULL AND t.assigned_to_user_id IS NULL THEN 'agency'
          ELSE 'unknown'
        END as assignment_type
      FROM tasks t
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
      )
    `;
    const params = [userId, userId, userId, userId];

    if (filters.taskType) {
      query += ' AND t.task_type = ?';
      params.push(filters.taskType);
    }

    if (filters.status) {
      query += ' AND t.status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY t.due_date ASC, t.created_at DESC';

    const [rows] = await pool.execute(query, params);
    return rows.map(row => ({
      ...row,
      metadata: this.parseMetadata(row.metadata)
    }));
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

  static async override(taskId, userId) {
    await pool.execute(
      'UPDATE tasks SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['overridden', taskId]
    );
    return this.findById(taskId);
  }

  static async updateDueDate(taskId, dueDate) {
    // Convert dueDate to MySQL DATETIME format if provided
    let dueDateMySQL = null;
    if (dueDate) {
      try {
        // If it's already in MySQL format (YYYY-MM-DD HH:MM:SS), use it as-is
        if (typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dueDate)) {
          dueDateMySQL = dueDate;
        } else {
          // Otherwise, parse and convert to MySQL format
          const date = new Date(dueDate);
          if (isNaN(date.getTime())) {
            throw new Error('Invalid dueDate format');
          }
          // Format as MySQL DATETIME: YYYY-MM-DD HH:MM:SS
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          dueDateMySQL = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }
      } catch (err) {
        throw new Error(`Invalid dueDate format: ${err.message}`);
      }
    }
    
    await pool.execute(
      'UPDATE tasks SET due_date = ? WHERE id = ?',
      [dueDateMySQL, taskId]
    );
    return this.findById(taskId);
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

