import pool from '../config/database.js';

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

class EmployeeEvaluationCycle {
  static mapRow(row) {
    if (!row) return null;
    return {
      ...row,
      template_snapshot_json: parseJson(row.template_snapshot_json, []),
      final_snapshot_json: parseJson(row.final_snapshot_json, null)
    };
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM employee_evaluation_cycles WHERE id = ? LIMIT 1`,
      [id]
    );
    return this.mapRow(rows?.[0]);
  }

  static async findByEventId(scheduleEventId) {
    const [rows] = await pool.execute(
      `SELECT * FROM employee_evaluation_cycles WHERE schedule_event_id = ? LIMIT 1`,
      [scheduleEventId]
    );
    return this.mapRow(rows?.[0]);
  }

  static async findByEmployeePeriod({ agencyId, employeeUserId, periodYear, periodHalf }) {
    const [rows] = await pool.execute(
      `SELECT * FROM employee_evaluation_cycles
       WHERE agency_id = ? AND employee_user_id = ? AND period_year = ? AND period_half = ?
       LIMIT 1`,
      [agencyId, employeeUserId, periodYear, periodHalf]
    );
    return this.mapRow(rows?.[0]);
  }

  static async listForEmployee({ agencyId, employeeUserId }) {
    const [rows] = await pool.execute(
      `SELECT * FROM employee_evaluation_cycles
       WHERE agency_id = ? AND employee_user_id = ?
       ORDER BY period_year DESC, period_half DESC, id DESC`,
      [agencyId, employeeUserId]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async create(data) {
    const [result] = await pool.execute(
      `INSERT INTO employee_evaluation_cycles
        (agency_id, employee_user_id, initiated_by_user_id, period_year, period_half, status,
         schedule_event_id, job_description_id, job_title_snapshot, template_snapshot_json,
         due_at, assigned_task_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.agencyId,
        data.employeeUserId,
        data.initiatedByUserId || null,
        data.periodYear,
        data.periodHalf,
        data.status || 'scheduled',
        data.scheduleEventId || null,
        data.jobDescriptionId || null,
        data.jobTitleSnapshot || null,
        JSON.stringify(data.templateSnapshot || []),
        data.dueAt || null,
        data.assignedTaskId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, patch = {}) {
    const sets = [];
    const params = [];
    const map = {
      status: 'status',
      scheduleEventId: 'schedule_event_id',
      assignedTaskId: 'assigned_task_id',
      submittedAt: 'submitted_at',
      reviewedAt: 'reviewed_at',
      closedAt: 'closed_at',
      adminComments: 'admin_comments',
      finalSnapshotJson: 'final_snapshot_json',
      dueAt: 'due_at'
    };
    for (const [key, col] of Object.entries(map)) {
      if (patch[key] === undefined) continue;
      sets.push(`${col} = ?`);
      const val = patch[key];
      params.push(
        key === 'finalSnapshotJson' && val != null && typeof val !== 'string'
          ? JSON.stringify(val)
          : val
      );
    }
    if (!sets.length) return this.findById(id);
    params.push(id);
    await pool.execute(
      `UPDATE employee_evaluation_cycles SET ${sets.join(', ')} WHERE id = ? LIMIT 1`,
      params
    );
    return this.findById(id);
  }
}

export default EmployeeEvaluationCycle;
