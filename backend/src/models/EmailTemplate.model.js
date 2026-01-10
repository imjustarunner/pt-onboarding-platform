import pool from '../config/database.js';

class EmailTemplate {
  static async create(templateData) {
    const {
      name,
      type,
      subject,
      body,
      agencyId,
      platformBrandingId,
      createdByUserId
    } = templateData;

    const [result] = await pool.execute(
      `INSERT INTO email_templates 
       (name, type, subject, body, agency_id, platform_branding_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, type, subject, body, agencyId || null, platformBrandingId || null, createdByUserId || null]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM email_templates WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findByAgency(agencyId, templateType = null) {
    let query = 'SELECT * FROM email_templates WHERE agency_id = ?';
    const params = [agencyId];

    if (templateType) {
      query += ' AND type = ?';
      params.push(templateType);
    }

    query += ' ORDER BY type, created_at DESC';

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findPlatformDefaults(templateType = null) {
    let query = 'SELECT * FROM email_templates WHERE agency_id IS NULL AND platform_branding_id IS NOT NULL';
    const params = [];

    if (templateType) {
      query += ' AND type = ?';
      params.push(templateType);
    }

    query += ' ORDER BY type, created_at DESC';

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findByTypeAndAgency(templateType, agencyId) {
    // First try to find agency-specific template
    const [agencyRows] = await pool.execute(
      'SELECT * FROM email_templates WHERE type = ? AND agency_id = ? LIMIT 1',
      [templateType, agencyId]
    );

    if (agencyRows.length > 0) {
      return agencyRows[0];
    }

    // Fall back to platform default
    const [platformRows] = await pool.execute(
      'SELECT * FROM email_templates WHERE type = ? AND agency_id IS NULL AND platform_branding_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',
      [templateType]
    );

    return platformRows[0] || null;
  }

  static async findAll(filters = {}) {
    const { agencyId, platformOnly, templateType } = filters;
    let query = `
      SELECT 
        et.*,
        a.name as agency_name
      FROM email_templates et
      LEFT JOIN agencies a ON et.agency_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (platformOnly) {
      query += ' AND et.agency_id IS NULL AND et.platform_branding_id IS NOT NULL';
    } else if (agencyId !== undefined) {
      if (agencyId === null) {
        query += ' AND et.agency_id IS NULL';
      } else {
        query += ' AND et.agency_id = ?';
        params.push(agencyId);
      }
    }

    if (templateType) {
      query += ' AND et.type = ?';
      params.push(templateType);
    }

    query += ' ORDER BY et.agency_id IS NULL DESC, et.type, et.created_at DESC';

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async update(id, templateData) {
    const {
      name,
      type,
      subject,
      body,
      agencyId,
      platformBrandingId
    } = templateData;

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (type !== undefined) {
      updates.push('type = ?');
      params.push(type);
    }
    if (subject !== undefined) {
      updates.push('subject = ?');
      params.push(subject);
    }
    if (body !== undefined) {
      updates.push('body = ?');
      params.push(body);
    }
    if (agencyId !== undefined) {
      updates.push('agency_id = ?');
      params.push(agencyId);
    }
    if (platformBrandingId !== undefined) {
      updates.push('platform_branding_id = ?');
      params.push(platformBrandingId);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    params.push(id);
    await pool.execute(
      `UPDATE email_templates SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM email_templates WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default EmailTemplate;
