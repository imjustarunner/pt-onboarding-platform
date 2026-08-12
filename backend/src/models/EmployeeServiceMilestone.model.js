import pool from '../config/database.js';

const MILESTONE_YEARS = [1, 2, 3, 4, 5, 10];
const STATUSES = new Set(['upcoming', 'owed', 'gift_sent', 'acknowledged']);

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addYears(dateStr, years) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function deriveStatus(milestoneDate, todayYmd) {
  if (!milestoneDate) return 'upcoming';
  return milestoneDate <= todayYmd ? 'owed' : 'upcoming';
}

class EmployeeServiceMilestone {
  static get milestoneYears() {
    return MILESTONE_YEARS;
  }

  static async listByAgency(agencyId, { status = null } = {}) {
    const id = Number(agencyId);
    if (!id) return [];
    const params = [id];
    let statusClause = '';
    if (status && STATUSES.has(String(status))) {
      statusClause = ' AND m.status = ?';
      params.push(String(status));
    }
    const [rows] = await pool.execute(
      `SELECT
         m.*,
         u.first_name,
         u.last_name,
         u.email,
         u.work_email,
         u.personal_email,
         u.provider_start_date,
         u.hired_at,
         a.first_name AS assigned_first_name,
         a.last_name AS assigned_last_name
       FROM employee_service_milestones m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN users a ON a.id = m.assigned_to_user_id
       WHERE m.agency_id = ?${statusClause}
       ORDER BY m.milestone_date ASC, u.last_name ASC, u.first_name ASC`,
      params
    );
    return rows || [];
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT m.* FROM employee_service_milestones m WHERE m.id = ? LIMIT 1`,
      [Number(id)]
    );
    return rows?.[0] || null;
  }

  static async update(id, { status, giftNotes, assignedToUserId } = {}) {
    const row = await this.findById(id);
    if (!row) return null;

    const nextStatus = status != null && STATUSES.has(String(status)) ? String(status) : row.status;
    const nextNotes = giftNotes !== undefined ? (giftNotes == null ? null : String(giftNotes)) : row.gift_notes;
    const nextAssignee =
      assignedToUserId !== undefined
        ? (assignedToUserId == null || assignedToUserId === '' ? null : Number(assignedToUserId))
        : row.assigned_to_user_id;

    await pool.execute(
      `UPDATE employee_service_milestones
       SET status = ?, gift_notes = ?, assigned_to_user_id = ?
       WHERE id = ?`,
      [nextStatus, nextNotes, nextAssignee, Number(id)]
    );
    return this.findById(id);
  }

  static async syncFromStartDates(agencyId) {
    const id = Number(agencyId);
    if (!id) return { created: 0, updated: 0, scanned: 0 };

    let users = [];
    try {
      const [rows] = await pool.execute(
        `SELECT u.id, u.provider_start_date, u.hired_at
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
         WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
           AND COALESCE(u.status, '') NOT IN ('ARCHIVED', 'TERMINATED')
           AND (
             u.provider_start_date IS NOT NULL
             OR u.hired_at IS NOT NULL
           )`,
        [id]
      );
      users = rows || [];
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [rows] = await pool.execute(
        `SELECT u.id, u.provider_start_date
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
         WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
           AND COALESCE(u.status, '') NOT IN ('ARCHIVED', 'TERMINATED')
           AND u.provider_start_date IS NOT NULL`,
        [id]
      );
      users = rows || [];
    }

    const todayYmd = new Date().toISOString().slice(0, 10);
    let created = 0;
    let updated = 0;

    for (const user of users || []) {
      const start = toDateOnly(user.provider_start_date) || toDateOnly(user.hired_at);
      if (!start) continue;

      for (const years of MILESTONE_YEARS) {
        const milestoneDate = addYears(start, years);
        if (!milestoneDate) continue;
        const status = deriveStatus(milestoneDate, todayYmd);

        const [result] = await pool.execute(
          `INSERT INTO employee_service_milestones
             (agency_id, user_id, milestone_years, milestone_date, status)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             milestone_date = VALUES(milestone_date),
             status = IF(
               employee_service_milestones.status IN ('gift_sent', 'acknowledged'),
               employee_service_milestones.status,
               VALUES(status)
             ),
             updated_at = CURRENT_TIMESTAMP`,
          [id, user.id, years, milestoneDate, status]
        );
        if (result.affectedRows === 1) created += 1;
        else if (result.affectedRows === 2) updated += 1;
      }
    }

    return { created, updated, scanned: (users || []).length };
  }
}

export default EmployeeServiceMilestone;
