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
    const safeLimit = Math.max(1, Math.min(200, Number.parseInt(String(limit), 10) || 100));
    const safeOffset = Math.max(0, Number.parseInt(String(offset), 10) || 0);

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
    params.push(safeLimit, safeOffset);

    // Use query() (text protocol) here to avoid prepared-statement arg edge cases
    // seen in Cloud SQL for LIMIT/OFFSET dynamic statements.
    let rows = [];
    try {
      const [r] = await pool.query(
        `SELECT bf.*,
          u.email as user_email,
          u.first_name as user_first_name,
          u.last_name as user_last_name,
          u.preferred_name as user_preferred_name,
          a.name as agency_name,
          COALESCE(msg.message_count, 0) AS message_count,
          msg.last_message_at
         FROM beta_feedback bf
         LEFT JOIN users u ON bf.user_id = u.id
         LEFT JOIN agencies a ON bf.agency_id = a.id
         LEFT JOIN (
           SELECT beta_feedback_id, COUNT(*) AS message_count, MAX(created_at) AS last_message_at
           FROM beta_feedback_messages
           GROUP BY beta_feedback_id
         ) msg ON msg.beta_feedback_id = bf.id
         ${whereClause}
         ORDER BY CASE bf.status
           WHEN 'pending' THEN 1
           WHEN 'reviewed' THEN 2
           WHEN 'resolved' THEN 3
           ELSE 4
         END, bf.created_at DESC
         LIMIT ? OFFSET ?`,
        params
      );
      rows = r || [];
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (!missing) throw e;
      const [fallbackRows] = await pool.query(
        `SELECT bf.*,
          u.email as user_email,
          u.first_name as user_first_name,
          u.last_name as user_last_name,
          u.preferred_name as user_preferred_name,
          a.name as agency_name,
          0 AS message_count,
          NULL AS last_message_at
         FROM beta_feedback bf
         LEFT JOIN users u ON bf.user_id = u.id
         LEFT JOIN agencies a ON bf.agency_id = a.id
         ${whereClause}
         ORDER BY CASE bf.status
           WHEN 'pending' THEN 1
           WHEN 'reviewed' THEN 2
           WHEN 'resolved' THEN 3
           ELSE 4
         END, bf.created_at DESC
         LIMIT ? OFFSET ?`,
        params
      );
      rows = fallbackRows || [];
    }

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
    let rows = [];
    try {
      const [r] = await pool.execute(
        `SELECT bf.*,
          u.email as user_email,
          u.first_name as user_first_name,
          u.last_name as user_last_name,
          u.preferred_name as user_preferred_name,
          u.role as user_role,
          a.name as agency_name,
          a.slug as agency_slug,
          COALESCE(msg.message_count, 0) AS message_count,
          msg.last_message_at
         FROM beta_feedback bf
         LEFT JOIN users u ON bf.user_id = u.id
         LEFT JOIN agencies a ON bf.agency_id = a.id
         LEFT JOIN (
           SELECT beta_feedback_id, COUNT(*) AS message_count, MAX(created_at) AS last_message_at
           FROM beta_feedback_messages
           GROUP BY beta_feedback_id
         ) msg ON msg.beta_feedback_id = bf.id
         WHERE bf.id = ?`,
        [id]
      );
      rows = r || [];
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (!missing) throw e;
      const [r] = await pool.execute(
        `SELECT bf.*,
          u.email as user_email,
          u.first_name as user_first_name,
          u.last_name as user_last_name,
          u.preferred_name as user_preferred_name,
          u.role as user_role,
          a.name as agency_name,
          a.slug as agency_slug,
          0 AS message_count,
          NULL AS last_message_at
         FROM beta_feedback bf
         LEFT JOIN users u ON bf.user_id = u.id
         LEFT JOIN agencies a ON bf.agency_id = a.id
         WHERE bf.id = ?`,
        [id]
      );
      rows = r || [];
    }

    return rows[0] ?? null;
  }

  static async deleteById(id) {
    const [result] = await pool.execute(
      'DELETE FROM beta_feedback WHERE id = ? LIMIT 1',
      [id]
    );
    return Number(result?.affectedRows || 0) > 0;
  }

  static async findByIds(ids = []) {
    const list = Array.isArray(ids) ? ids.map((v) => Number.parseInt(String(v), 10)).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (!list.length) return [];
    const placeholders = list.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id, screenshot_path FROM beta_feedback WHERE id IN (${placeholders})`,
      list
    );
    return rows || [];
  }

  static async deleteManyByIds(ids = []) {
    const list = Array.isArray(ids) ? ids.map((v) => Number.parseInt(String(v), 10)).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (!list.length) return 0;
    const placeholders = list.map(() => '?').join(',');
    const [result] = await pool.execute(
      `DELETE FROM beta_feedback WHERE id IN (${placeholders})`,
      list
    );
    return Number(result?.affectedRows || 0);
  }

  static async findResolvedForDeletion(options = {}) {
    const { agencyId, dateFrom, dateTo } = options;
    const where = ["status = 'resolved'"];
    const params = [];
    if (agencyId != null) {
      where.push('(agency_id = ? OR agency_id IS NULL)');
      params.push(agencyId);
    }
    if (dateFrom) {
      where.push('created_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push('created_at <= ?');
      params.push(dateTo);
    }
    const [rows] = await pool.execute(
      `SELECT id, screenshot_path FROM beta_feedback WHERE ${where.join(' AND ')}`,
      params
    );
    return rows || [];
  }

  static async deleteResolved(options = {}) {
    const { agencyId, dateFrom, dateTo } = options;
    const where = ["status = 'resolved'"];
    const params = [];
    if (agencyId != null) {
      where.push('(agency_id = ? OR agency_id IS NULL)');
      params.push(agencyId);
    }
    if (dateFrom) {
      where.push('created_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push('created_at <= ?');
      params.push(dateTo);
    }
    const [result] = await pool.execute(
      `DELETE FROM beta_feedback WHERE ${where.join(' AND ')}`,
      params
    );
    return Number(result?.affectedRows || 0);
  }

  static async findMine(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    const safeLimit = Math.max(1, Math.min(100, Number.parseInt(String(limit), 10) || 50));
    const safeOffset = Math.max(0, Number.parseInt(String(offset), 10) || 0);
    try {
      const [rows] = await pool.execute(
        `SELECT bf.*,
          COALESCE(msg.message_count, 0) AS message_count,
          msg.last_message_at
         FROM beta_feedback bf
         LEFT JOIN (
           SELECT beta_feedback_id, COUNT(*) AS message_count, MAX(created_at) AS last_message_at
           FROM beta_feedback_messages
           GROUP BY beta_feedback_id
         ) msg ON msg.beta_feedback_id = bf.id
         WHERE bf.user_id = ?
         ORDER BY bf.created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, safeLimit, safeOffset]
      );
      return rows || [];
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (!missing) throw e;
      const [rows] = await pool.execute(
        `SELECT bf.*, 0 AS message_count, NULL AS last_message_at
         FROM beta_feedback bf
         WHERE bf.user_id = ?
         ORDER BY bf.created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, safeLimit, safeOffset]
      );
      return rows || [];
    }
  }

  static async findMessages(feedbackId) {
    try {
      const [rows] = await pool.execute(
        `SELECT m.*,
          u.email AS user_email,
          u.first_name AS user_first_name,
          u.last_name AS user_last_name,
          u.preferred_name AS user_preferred_name,
          u.role AS user_role
         FROM beta_feedback_messages m
         LEFT JOIN users u ON m.user_id = u.id
         WHERE m.beta_feedback_id = ?
         ORDER BY m.created_at ASC, m.id ASC`,
        [feedbackId]
      );
      return rows || [];
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
      if (missing) return [];
      throw e;
    }
  }

  static async createMessage({ feedbackId, userId, messageText }) {
    const [result] = await pool.execute(
      `INSERT INTO beta_feedback_messages (beta_feedback_id, user_id, message_text)
       VALUES (?, ?, ?)`,
      [feedbackId, userId, messageText]
    );
    return result?.insertId || null;
  }
}

export default BetaFeedback;
