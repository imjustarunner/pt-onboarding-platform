import pool from '../config/database.js';

const VALID_TYPES = ['instagram', 'facebook', 'rss', 'link'];

/**
 * Normalize a DB row to camelCase and ensure types.
 */
function normalize(row) {
  if (!row) return null;
  return {
    id: row.id,
    agencyId: row.agency_id,
    organizationId: row.organization_id ?? null,
    programId: row.program_id ?? null,
    type: VALID_TYPES.includes(row.type) ? row.type : 'link',
    label: row.label ?? '',
    url: row.url ?? null,
    externalUrl: row.external_url ?? null,
    sortOrder: row.sort_order ?? 0,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

class SocialFeedLink {
  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM social_feed_links WHERE id = ? LIMIT 1',
      [id]
    );
    return normalize(rows[0] || null);
  }

  static async listByAgency(agencyId, options = {}) {
    const { activeOnly = false } = options;
    const [rows] = await pool.execute(
      `SELECT * FROM social_feed_links
       WHERE agency_id = ?
         AND (? = 0 OR is_active = 1)
       ORDER BY sort_order ASC, id ASC`,
      [agencyId, activeOnly ? 1 : 0]
    );
    return (rows || []).map(normalize);
  }

  /**
   * List feeds for dashboard: agency-level feeds plus optional org/program scoped.
   * Pass organizationId and/or programId to include those scoped feeds.
   */
  static async listForDashboard(agencyId, organizationId = null, programId = null) {
    const [rows] = await pool.execute(
      `SELECT * FROM social_feed_links
       WHERE agency_id = ? AND is_active = 1
         AND (organization_id IS NULL OR organization_id = ?)
         AND (program_id IS NULL OR program_id = ?)
       ORDER BY sort_order ASC, id ASC`,
      [agencyId, organizationId ?? null, programId ?? null]
    );
    return (rows || []).map(normalize);
  }

  static async create(data) {
    const {
      agencyId,
      organizationId = null,
      programId = null,
      type = 'link',
      label,
      url = null,
      externalUrl = null,
      sortOrder = 0,
      isActive = true
    } = data;

    const safeType = VALID_TYPES.includes(type) ? type : 'link';
    const [result] = await pool.execute(
      `INSERT INTO social_feed_links
       (agency_id, organization_id, program_id, type, label, url, external_url, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        organizationId ?? null,
        programId ?? null,
        safeType,
        label ?? '',
        url ?? null,
        externalUrl ?? null,
        sortOrder ?? 0,
        isActive ? 1 : 0
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, data) {
    const fields = [];
    const values = [];

    const map = {
      organizationId: 'organization_id',
      programId: 'program_id',
      type: 'type',
      label: 'label',
      url: 'url',
      externalUrl: 'external_url',
      sortOrder: 'sort_order',
      isActive: 'is_active'
    };

    for (const [key, col] of Object.entries(map)) {
      if (data[key] === undefined) continue;
      if (key === 'type' && !VALID_TYPES.includes(data[key])) continue;
      fields.push(`${col} = ?`);
      if (key === 'isActive') values.push(data[key] ? 1 : 0);
      else values.push(data[key] ?? null);
    }

    if (fields.length === 0) return this.findById(id);
    values.push(id);
    await pool.execute(
      `UPDATE social_feed_links SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute('DELETE FROM social_feed_links WHERE id = ?', [id]);
    return (result?.affectedRows ?? 0) > 0;
  }
}

export default SocialFeedLink;
