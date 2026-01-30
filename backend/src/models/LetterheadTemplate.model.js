import pool from '../config/database.js';

class LetterheadTemplate {
  static async create(data) {
    const {
      name,
      agencyId,
      organizationId,
      templateType,
      filePath,
      headerHtml,
      footerHtml,
      cssContent,
      pageSize,
      orientation,
      marginTop,
      marginRight,
      marginBottom,
      marginLeft,
      headerHeight,
      footerHeight,
      createdByUserId
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO letterhead_templates (
        name,
        agency_id,
        organization_id,
        template_type,
        file_path,
        header_html,
        footer_html,
        css_content,
        page_size,
        orientation,
        margin_top,
        margin_right,
        margin_bottom,
        margin_left,
        header_height,
        footer_height,
        created_by_user_id,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        name,
        agencyId ?? null,
        organizationId ?? null,
        templateType || 'html',
        filePath ?? null,
        headerHtml ?? null,
        footerHtml ?? null,
        cssContent ?? null,
        pageSize || 'letter',
        orientation || 'portrait',
        marginTop ?? 72,
        marginRight ?? 72,
        marginBottom ?? 72,
        marginLeft ?? 72,
        headerHeight ?? 96,
        footerHeight ?? 72,
        createdByUserId
      ]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM letterhead_templates WHERE id = ? LIMIT 1', [id]);
    return rows?.[0] || null;
  }

  static async list({ agencyId = null, organizationId = null, includePlatform = true, includeInactive = false } = {}) {
    const where = [];
    const params = [];

    if (!includeInactive) {
      where.push('is_active = TRUE');
    }

    // Scope logic:
    // - If agencyId provided, return agency-scoped plus (optionally) platform-scoped
    // - If not provided, return platform-scoped only
    if (agencyId) {
      if (includePlatform) {
        where.push('(agency_id = ? OR agency_id IS NULL)');
        params.push(parseInt(agencyId, 10));
      } else {
        where.push('agency_id = ?');
        params.push(parseInt(agencyId, 10));
      }
    } else {
      where.push('agency_id IS NULL');
    }

    // Organization logic: when an org is selected, include org-specific and non-org-specific
    if (organizationId) {
      where.push('(organization_id = ? OR organization_id IS NULL)');
      params.push(parseInt(organizationId, 10));
    } else {
      // if no org selected, only include generic letterheads
      where.push('organization_id IS NULL');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT *
       FROM letterhead_templates
       ${whereSql}
       ORDER BY agency_id IS NULL ASC, organization_id IS NULL ASC, name ASC, id DESC`,
      params
    );
    return rows || [];
  }

  static async update(id, patch) {
    const existing = await this.findById(id);
    if (!existing) return null;

    const allowed = {
      name: 'name',
      agencyId: 'agency_id',
      organizationId: 'organization_id',
      templateType: 'template_type',
      filePath: 'file_path',
      headerHtml: 'header_html',
      footerHtml: 'footer_html',
      cssContent: 'css_content',
      pageSize: 'page_size',
      orientation: 'orientation',
      marginTop: 'margin_top',
      marginRight: 'margin_right',
      marginBottom: 'margin_bottom',
      marginLeft: 'margin_left',
      headerHeight: 'header_height',
      footerHeight: 'footer_height',
      isActive: 'is_active'
    };

    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(allowed)) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        sets.push(`${column} = ?`);
        params.push(patch[key] === undefined ? null : patch[key]);
      }
    }

    if (!sets.length) return existing;

    params.push(parseInt(id, 10));
    await pool.execute(`UPDATE letterhead_templates SET ${sets.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  static async setActive(id, isActive) {
    await pool.execute('UPDATE letterhead_templates SET is_active = ? WHERE id = ?', [!!isActive, parseInt(id, 10)]);
    return this.findById(id);
  }
}

export default LetterheadTemplate;

