import pool from '../config/database.js';

const VALID_STATUSES = ['pending', 'reviewed', 'resolved'];

class BetaFeedback {
  static async create(data) {
    const {
      userId,
      agencyId,
      organizationId,
      routePath,
      routeName,
      description,
      screenshotPath,
      userAgent,
      viewportWidth,
      viewportHeight
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO beta_feedback (
        user_id, agency_id, organization_id, route_path, route_name,
        description, screenshot_path, user_agent, viewport_width, viewport_height
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        agencyId ?? null,
        organizationId ?? null,
        routePath ?? null,
        routeName ?? null,
        description ?? null,
        screenshotPath ?? null,
        userAgent ?? null,
        viewportWidth ?? null,
        viewportHeight ?? null
      ]
    );

    return result.insertId;
  }

  static async updateScreenshotPath(id, screenshotPath) {
    await pool.execute(
      'UPDATE beta_feedback SET screenshot_path = ? WHERE id = ?',
      [screenshotPath, id]
    );
  }

  static async updateStatus(id, status, reviewedByUserId) {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    await pool.execute(
      'UPDATE beta_feedback SET status = ?, reviewed_at = NOW(), reviewed_by_user_id = ? WHERE id = ?',
      [status, reviewedByUserId ?? null, id]
    );
  }

  static async countPending() {
    const [rows] = await pool.execute(
      "SELECT COUNT(*) as count FROM beta_feedback WHERE status = 'pending'"
    );
    return rows[0]?.count ?? 0;
  }

  static async findAll(options = {}) {
    const { limit = 100, offset = 0, agencyId, userId, since, dateFrom, dateTo, status } = options;

    let where = [];
    const params = [];

    if (agencyId != null) {
      where.push('(bf.agency_id = ? OR bf.agency_id IS NULL)');
      params.push(agencyId);
    }
    if (userId != null) {
      where.push('bf.user_id = ?');
      params.push(userId);
    }
    if (since) {
      where.push('bf.created_at >= ?');
      params.push(since);
    }
    if (dateFrom) {
      where.push('bf.created_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push('bf.created_at <= ?');
      params.push(dateTo);
    }
    if (status && VALID_STATUSES.includes(status)) {
      where.push('bf.status = ?');
      params.push(status);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);

    const [rows] = await pool.execute(
      `SELECT bf.*,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.preferred_name as user_preferred_name,
        a.name as agency_name
       FROM beta_feedback bf
       LEFT JOIN users u ON bf.user_id = u.id
       LEFT JOIN agencies a ON bf.agency_id = a.id
       ${whereClause}
       ORDER BY bf.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    return rows;
  }

  static async count(options = {}) {
    const { agencyId, userId, since, dateFrom, dateTo, status } = options;

    let where = [];
    const params = [];

    if (agencyId != null) {
      where.push('(agency_id = ? OR agency_id IS NULL)');
      params.push(agencyId);
    }
    if (userId != null) {
      where.push('user_id = ?');
      params.push(userId);
    }
    if (since) {
      where.push('created_at >= ?');
      params.push(since);
    }
    if (dateFrom) {
      where.push('created_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push('created_at <= ?');
      params.push(dateTo);
    }
    if (status && VALID_STATUSES.includes(status)) {
      where.push('status = ?');
      params.push(status);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.execute(
      `SELECT COUNT(*) as total FROM beta_feedback ${whereClause}`,
      params
    );

    return rows[0]?.total ?? 0;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT bf.*,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.preferred_name as user_preferred_name,
        u.role as user_role,
        a.name as agency_name,
        a.slug as agency_slug
       FROM beta_feedback bf
       LEFT JOIN users u ON bf.user_id = u.id
       LEFT JOIN agencies a ON bf.agency_id = a.id
       WHERE bf.id = ?`,
      [id]
    );

    return rows[0] ?? null;
  }
}

export default BetaFeedback;
