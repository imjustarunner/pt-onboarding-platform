import pool from '../config/database.js';

function normStr(v) {
  return String(v ?? '').trim();
}

function toBool(v) {
  return v === true || v === 1 || v === '1' || String(v || '').toLowerCase() === 'true';
}

class UserExternalCalendar {
  static normalizeLabel(label) {
    const s = normStr(label);
    if (!s) return '';
    return s.slice(0, 128);
  }

  static normalizeIcsUrl(url) {
    const s = normStr(url);
    if (!s) return '';
    return s.slice(0, 1024);
  }

  static async listForUser({ userId, includeFeeds = true, activeOnly = false }) {
    const uid = Number(userId || 0);
    if (!uid) return [];

    const where = activeOnly ? 'AND c.is_active = TRUE' : '';
    const [calRows] = await pool.execute(
      `SELECT c.id, c.user_id, c.label, c.is_active, c.created_by_user_id, c.created_at, c.updated_at
       FROM user_external_calendars c
       WHERE c.user_id = ? ${where}
       ORDER BY c.label ASC, c.id ASC`,
      [uid]
    );

    const calendars = (calRows || []).map((c) => ({
      id: Number(c.id),
      userId: Number(c.user_id),
      label: c.label,
      isActive: toBool(c.is_active),
      createdByUserId: c.created_by_user_id === null ? null : Number(c.created_by_user_id),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      feeds: []
    }));

    if (!includeFeeds || calendars.length === 0) return calendars;

    const ids = calendars.map((c) => Number(c.id)).filter((n) => Number.isInteger(n) && n > 0);
    const placeholders = ids.map(() => '?').join(',');
    const feedWhere = activeOnly ? 'AND f.is_active = TRUE' : '';
    const [feedRows] = await pool.execute(
      `SELECT f.id, f.calendar_id, f.ics_url, f.is_active, f.created_at, f.updated_at
       FROM user_external_calendar_feeds f
       WHERE f.calendar_id IN (${placeholders}) ${feedWhere}
       ORDER BY f.calendar_id ASC, f.id ASC`,
      ids
    );

    const byId = new Map(calendars.map((c) => [Number(c.id), c]));
    for (const f of feedRows || []) {
      const cal = byId.get(Number(f.calendar_id));
      if (!cal) continue;
      cal.feeds.push({
        id: Number(f.id),
        calendarId: Number(f.calendar_id),
        icsUrl: f.ics_url,
        isActive: toBool(f.is_active),
        createdAt: f.created_at,
        updatedAt: f.updated_at
      });
    }

    return calendars;
  }

  static async createCalendar({ userId, label, createdByUserId = null }) {
    const uid = Number(userId || 0);
    if (!uid) throw new Error('Invalid userId');
    const lab = this.normalizeLabel(label);
    if (!lab) throw new Error('label is required');

    try {
      const [r] = await pool.execute(
        `INSERT INTO user_external_calendars (user_id, label, is_active, created_by_user_id)
         VALUES (?, ?, TRUE, ?)`,
        [uid, lab, createdByUserId ? Number(createdByUserId) : null]
      );
      const id = Number(r?.insertId || 0);
      const [rows] = await pool.execute(
        `SELECT id, user_id, label, is_active, created_by_user_id, created_at, updated_at
         FROM user_external_calendars
         WHERE id = ?
         LIMIT 1`,
        [id]
      );
      const c = rows?.[0] || null;
      if (!c) return null;
      return {
        id: Number(c.id),
        userId: Number(c.user_id),
        label: c.label,
        isActive: toBool(c.is_active),
        createdByUserId: c.created_by_user_id === null ? null : Number(c.created_by_user_id),
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        feeds: []
      };
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') {
        const err = new Error('Calendar label already exists for this user');
        err.statusCode = 409;
        throw err;
      }
      throw e;
    }
  }

  static async addFeed({ userId, calendarId, icsUrl }) {
    const uid = Number(userId || 0);
    const cid = Number(calendarId || 0);
    if (!uid) throw new Error('Invalid userId');
    if (!cid) throw new Error('Invalid calendarId');
    const url = this.normalizeIcsUrl(icsUrl);
    if (!url) throw new Error('icsUrl is required');

    // Ensure calendar belongs to user
    const [rows] = await pool.execute(
      `SELECT id FROM user_external_calendars WHERE id = ? AND user_id = ? LIMIT 1`,
      [cid, uid]
    );
    if (!rows?.[0]) {
      const err = new Error('Calendar not found');
      err.statusCode = 404;
      throw err;
    }

    try {
      const [r] = await pool.execute(
        `INSERT INTO user_external_calendar_feeds (calendar_id, ics_url, is_active)
         VALUES (?, ?, TRUE)`,
        [cid, url]
      );
      const id = Number(r?.insertId || 0);
      const [frows] = await pool.execute(
        `SELECT id, calendar_id, ics_url, is_active, created_at, updated_at
         FROM user_external_calendar_feeds
         WHERE id = ?
         LIMIT 1`,
        [id]
      );
      const f = frows?.[0] || null;
      if (!f) return null;
      return {
        id: Number(f.id),
        calendarId: Number(f.calendar_id),
        icsUrl: f.ics_url,
        isActive: toBool(f.is_active),
        createdAt: f.created_at,
        updatedAt: f.updated_at
      };
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') {
        const err = new Error('ICS URL already exists on this calendar');
        err.statusCode = 409;
        throw err;
      }
      throw e;
    }
  }

  static async setCalendarActive({ userId, calendarId, isActive }) {
    const uid = Number(userId || 0);
    const cid = Number(calendarId || 0);
    if (!uid) throw new Error('Invalid userId');
    if (!cid) throw new Error('Invalid calendarId');

    const [r] = await pool.execute(
      `UPDATE user_external_calendars
       SET is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [toBool(isActive) ? 1 : 0, cid, uid]
    );
    return Number(r?.affectedRows || 0) > 0;
  }

  static async setCalendarLabel({ userId, calendarId, label }) {
    const uid = Number(userId || 0);
    const cid = Number(calendarId || 0);
    if (!uid) throw new Error('Invalid userId');
    if (!cid) throw new Error('Invalid calendarId');
    const lab = this.normalizeLabel(label);
    if (!lab) throw new Error('label is required');

    try {
      const [r] = await pool.execute(
        `UPDATE user_external_calendars
         SET label = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [lab, cid, uid]
      );
      return Number(r?.affectedRows || 0) > 0;
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') {
        const err = new Error('Calendar label already exists for this user');
        err.statusCode = 409;
        throw err;
      }
      throw e;
    }
  }

  static async setFeedActive({ userId, calendarId, feedId, isActive }) {
    const uid = Number(userId || 0);
    const cid = Number(calendarId || 0);
    const fid = Number(feedId || 0);
    if (!uid) throw new Error('Invalid userId');
    if (!cid) throw new Error('Invalid calendarId');
    if (!fid) throw new Error('Invalid feedId');

    const [r] = await pool.execute(
      `UPDATE user_external_calendar_feeds f
       JOIN user_external_calendars c ON c.id = f.calendar_id
       SET f.is_active = ?, f.updated_at = CURRENT_TIMESTAMP
       WHERE f.id = ? AND f.calendar_id = ? AND c.user_id = ?`,
      [toBool(isActive) ? 1 : 0, fid, cid, uid]
    );
    return Number(r?.affectedRows || 0) > 0;
  }

  static async listAvailableCalendars({ userId }) {
    const uid = Number(userId || 0);
    if (!uid) return [];
    const [rows] = await pool.execute(
      `SELECT id, label
       FROM user_external_calendars
       WHERE user_id = ? AND is_active = TRUE
       ORDER BY label ASC, id ASC`,
      [uid]
    );
    return (rows || []).map((r) => ({ id: Number(r.id), label: r.label }));
  }

  static async listFeedsForCalendars({ userId, calendarIds, activeOnly = true }) {
    const uid = Number(userId || 0);
    const ids = Array.isArray(calendarIds) ? calendarIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (!uid || ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(',');
    const whereActive = activeOnly ? 'AND f.is_active = TRUE AND c.is_active = TRUE' : '';
    const [rows] = await pool.execute(
      `SELECT c.id AS calendar_id, c.label, f.id AS feed_id, f.ics_url
       FROM user_external_calendars c
       JOIN user_external_calendar_feeds f ON f.calendar_id = c.id
       WHERE c.user_id = ?
         AND c.id IN (${placeholders})
         ${whereActive}
       ORDER BY c.label ASC, f.id ASC`,
      [uid, ...ids]
    );

    return (rows || []).map((r) => ({
      calendarId: Number(r.calendar_id),
      calendarLabel: r.label,
      feedId: Number(r.feed_id),
      icsUrl: r.ics_url
    }));
  }
}

export default UserExternalCalendar;

