import pool from '../config/database.js';

class BrandingTemplate {
  static async create(templateData) {
    const {
      name,
      description,
      scope,
      agencyId,
      createdByUserId,
      isShared,
      templateData: templateDataJson
    } = templateData;

    const [result] = await pool.execute(
      `INSERT INTO branding_templates 
       (name, description, scope, agency_id, created_by_user_id, is_shared, template_data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        scope,
        agencyId || null,
        createdByUserId,
        isShared || false,
        JSON.stringify(templateDataJson)
      ]
    );

    return this.findById(result.insertId);
  }

  static async findAll(filters = {}) {
    const { scope, agencyId, isShared, includeShared } = filters;
    let query = 'SELECT * FROM branding_templates WHERE 1=1';
    const params = [];

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

    if (isShared !== undefined) {
      query += ' AND is_shared = ?';
      params.push(isShared);
    }

    // Include shared platform templates for agencies
    if (includeShared && scope === 'agency') {
      query = `SELECT * FROM branding_templates 
               WHERE (scope = 'agency' AND agency_id = ?) 
               OR (scope = 'platform' AND is_shared = TRUE)
               ORDER BY scope DESC, created_at DESC`;
      params.push(agencyId);
    } else {
      query += ' ORDER BY created_at DESC';
    }

    const [rows] = await pool.execute(query, params);
    
    // Parse JSON template_data
    return rows.map(row => ({
      ...row,
      template_data: typeof row.template_data === 'string' 
        ? JSON.parse(row.template_data) 
        : row.template_data
    }));
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM branding_templates WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      ...row,
      template_data: typeof row.template_data === 'string' 
        ? JSON.parse(row.template_data) 
        : row.template_data
    };
  }

  static async update(id, templateData) {
    const {
      name,
      description,
      scope,
      agencyId,
      isShared,
      templateData: templateDataJson
    } = templateData;

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (scope !== undefined) {
      updates.push('scope = ?');
      params.push(scope);
    }
    if (agencyId !== undefined) {
      updates.push('agency_id = ?');
      params.push(agencyId);
    }
    if (isShared !== undefined) {
      updates.push('is_shared = ?');
      params.push(isShared);
    }
    if (templateDataJson !== undefined) {
      updates.push('template_data = ?');
      params.push(JSON.stringify(templateDataJson));
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    params.push(id);
    await pool.execute(
      `UPDATE branding_templates SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM branding_templates WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async getScheduledTemplates(scope, agencyId, date) {
    const query = `
      SELECT bt.*, bts.id as schedule_id, bts.start_date, bts.end_date
      FROM branding_templates bt
      JOIN branding_template_schedules bts ON bt.id = bts.template_id
      WHERE bts.scope = ?
        AND bts.is_active = TRUE
        AND ? BETWEEN bts.start_date AND bts.end_date
        AND (bts.agency_id = ? OR (bts.agency_id IS NULL AND ? IS NULL))
      ORDER BY bts.start_date DESC
      LIMIT 1
    `;

    const [rows] = await pool.execute(query, [scope, date, agencyId, agencyId]);
    
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      ...row,
      template_data: typeof row.template_data === 'string' 
        ? JSON.parse(row.template_data) 
        : row.template_data
    };
  }
}

export default BrandingTemplate;
