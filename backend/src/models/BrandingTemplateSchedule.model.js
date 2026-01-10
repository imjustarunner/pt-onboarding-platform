import pool from '../config/database.js';

class BrandingTemplateSchedule {
  static async create(scheduleData) {
    const {
      templateId,
      scope,
      agencyId,
      startDate,
      endDate,
      isActive,
      createdByUserId
    } = scheduleData;

    const [result] = await pool.execute(
      `INSERT INTO branding_template_schedules 
       (template_id, scope, agency_id, start_date, end_date, is_active, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        templateId,
        scope,
        agencyId || null,
        startDate,
        endDate,
        isActive !== undefined ? isActive : true,
        createdByUserId
      ]
    );

    return this.findById(result.insertId);
  }

  static async findAll(filters = {}) {
    const { templateId, scope, agencyId, isActive } = filters;
    let query = 'SELECT * FROM branding_template_schedules WHERE 1=1';
    const params = [];

    if (templateId) {
      query += ' AND template_id = ?';
      params.push(templateId);
    }

    if (scope) {
      query += ' AND scope = ?';
      params.push(scope);
    }

    if (agencyId !== undefined) {
      if (agencyId === null) {
        query += ' AND agency_id IS NULL';
      } else {
        query += ' AND agency_id = ?';
        params.push(agencyId);
      }
    }

    if (isActive !== undefined) {
      query += ' AND is_active = ?';
      params.push(isActive);
    }

    query += ' ORDER BY start_date ASC, created_at DESC';

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM branding_template_schedules WHERE id = ?',
      [id]
    );

    return rows.length > 0 ? rows[0] : null;
  }

  static async findActiveSchedules(scope, agencyId, date) {
    const query = `
      SELECT * FROM branding_template_schedules
      WHERE scope = ?
        AND is_active = TRUE
        AND ? BETWEEN start_date AND end_date
        AND (agency_id = ? OR (agency_id IS NULL AND ? IS NULL))
      ORDER BY start_date DESC
    `;

    const [rows] = await pool.execute(query, [scope, date, agencyId, agencyId]);
    return rows;
  }

  static async update(id, scheduleData) {
    const {
      templateId,
      scope,
      agencyId,
      startDate,
      endDate,
      isActive
    } = scheduleData;

    const updates = [];
    const params = [];

    if (templateId !== undefined) {
      updates.push('template_id = ?');
      params.push(templateId);
    }
    if (scope !== undefined) {
      updates.push('scope = ?');
      params.push(scope);
    }
    if (agencyId !== undefined) {
      updates.push('agency_id = ?');
      params.push(agencyId);
    }
    if (startDate !== undefined) {
      updates.push('start_date = ?');
      params.push(startDate);
    }
    if (endDate !== undefined) {
      updates.push('end_date = ?');
      params.push(endDate);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    params.push(id);
    await pool.execute(
      `UPDATE branding_template_schedules SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM branding_template_schedules WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async findOverlappingSchedules(scope, agencyId, startDate, endDate, excludeScheduleId = null) {
    let query = `
      SELECT * FROM branding_template_schedules
      WHERE scope = ?
        AND is_active = TRUE
        AND (agency_id = ? OR (agency_id IS NULL AND ? IS NULL))
        AND (
          (start_date <= ? AND end_date >= ?)
          OR (start_date <= ? AND end_date >= ?)
          OR (start_date >= ? AND end_date <= ?)
        )
    `;
    const params = [scope, agencyId, agencyId, startDate, startDate, endDate, endDate, startDate, endDate];

    if (excludeScheduleId) {
      query += ' AND id != ?';
      params.push(excludeScheduleId);
    }

    query += ' ORDER BY start_date ASC';

    const [rows] = await pool.execute(query, params);
    return rows;
  }
}

export default BrandingTemplateSchedule;
