import pool from '../config/database.js';

const USER_NAME_SQL = `TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))`;

class PlannedOut {
  static async tableExists() {
    try {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planned_outs'`
      );
      return Number(rows?.[0]?.cnt || 0) > 0;
    } catch {
      return false;
    }
  }

  static mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      agency_id: row.agency_id,
      user_id: row.user_id,
      submitted_by_user_id: row.submitted_by_user_id,
      status: row.status,
      span_type: row.span_type,
      half_day_part: row.half_day_part,
      all_day: !!row.all_day,
      start_at: row.start_at,
      end_at: row.end_at,
      start_date: row.start_date,
      end_date: row.end_date,
      availability: row.availability,
      emergencies: row.emergencies,
      emergencies_redirect_user_id: row.emergencies_redirect_user_id,
      emergencies_redirect_name: row.emergencies_redirect_name,
      contact_preference: row.contact_preference,
      details: row.details,
      admin_comment: row.admin_comment,
      schedule_event_id: row.schedule_event_id,
      reviewed_by_user_id: row.reviewed_by_user_id,
      reviewed_at: row.reviewed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user_name: row.user_name || null,
      user_first_name: row.user_first_name || null,
      user_last_name: row.user_last_name || null,
      profile_photo_url: row.profile_photo_url || row.profile_photo_path || null
    };
  }

  static async create(data) {
    const [result] = await pool.execute(
      `INSERT INTO planned_outs
        (agency_id, user_id, submitted_by_user_id, status, span_type, half_day_part,
         all_day, start_at, end_at, start_date, end_date,
         availability, emergencies, emergencies_redirect_user_id, emergencies_redirect_name,
         contact_preference, details, schedule_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(data.agencyId),
        Number(data.userId),
        data.submittedByUserId ? Number(data.submittedByUserId) : null,
        data.status || 'pending',
        data.spanType || 'hours',
        data.halfDayPart || null,
        data.allDay ? 1 : 0,
        data.startAt || null,
        data.endAt || null,
        data.startDate || null,
        data.endDate || null,
        data.availability || 'unavailable',
        data.emergencies || 'none',
        data.emergenciesRedirectUserId ? Number(data.emergenciesRedirectUserId) : null,
        data.emergenciesRedirectName || null,
        data.contactPreference || 'none',
        data.details || null,
        data.scheduleEventId ? Number(data.scheduleEventId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const eid = Number(id || 0);
    if (!eid) return null;
    const [rows] = await pool.execute(
      `SELECT po.*,
              ${USER_NAME_SQL} AS user_name,
              u.first_name AS user_first_name,
              u.last_name AS user_last_name,
              u.profile_photo_path AS profile_photo_url
       FROM planned_outs po
       JOIN users u ON u.id = po.user_id
       WHERE po.id = ?
       LIMIT 1`,
      [eid]
    );
    return this.mapRow(rows?.[0]);
  }

  static async listForAgency({
    agencyId,
    upcomingOnly = true,
    includeStatuses = ['pending', 'approved', 'revision'],
    limit = 100
  } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const statuses = (Array.isArray(includeStatuses) ? includeStatuses : [])
      .map((s) => String(s || '').toLowerCase())
      .filter((s) => ['pending', 'approved', 'rejected', 'revision'].includes(s));
    const statusList = statuses.length ? statuses : ['pending', 'approved', 'revision'];
    const placeholders = statusList.map(() => '?').join(', ');
    const lim = Math.min(200, Math.max(1, Number(limit) || 100));
    const params = [aid, ...statusList];
    let upcomingSql = '';
    if (upcomingOnly) {
      upcomingSql = ` AND (
        (po.all_day = 1 AND po.end_date > CURDATE())
        OR (po.all_day = 0 AND po.end_at >= NOW())
        OR (po.all_day = 1 AND po.end_date IS NULL AND po.start_date >= CURDATE())
        OR (po.all_day = 0 AND po.end_at IS NULL AND po.start_at >= NOW())
      )`;
    }
    const [rows] = await pool.execute(
      `SELECT po.*,
              ${USER_NAME_SQL} AS user_name,
              u.first_name AS user_first_name,
              u.last_name AS user_last_name,
              u.profile_photo_path AS profile_photo_url
       FROM planned_outs po
       JOIN users u ON u.id = po.user_id
       WHERE po.agency_id = ?
         AND po.status IN (${placeholders})
         ${upcomingSql}
       ORDER BY COALESCE(po.start_at, CAST(po.start_date AS DATETIME)) ASC, po.id ASC
       LIMIT ${lim}`,
      params
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async updateById(id, patch = {}) {
    const eid = Number(id || 0);
    if (!eid) return null;
    const fields = [];
    const values = [];
    const set = (col, val) => {
      fields.push(`${col} = ?`);
      values.push(val);
    };
    if (patch.status != null) set('status', patch.status);
    if (patch.spanType != null) set('span_type', patch.spanType);
    if (patch.halfDayPart !== undefined) set('half_day_part', patch.halfDayPart);
    if (patch.allDay != null) set('all_day', patch.allDay ? 1 : 0);
    if (patch.startAt !== undefined) set('start_at', patch.startAt);
    if (patch.endAt !== undefined) set('end_at', patch.endAt);
    if (patch.startDate !== undefined) set('start_date', patch.startDate);
    if (patch.endDate !== undefined) set('end_date', patch.endDate);
    if (patch.availability != null) set('availability', patch.availability);
    if (patch.emergencies != null) set('emergencies', patch.emergencies);
    if (patch.emergenciesRedirectUserId !== undefined) {
      set('emergencies_redirect_user_id', patch.emergenciesRedirectUserId);
    }
    if (patch.emergenciesRedirectName !== undefined) {
      set('emergencies_redirect_name', patch.emergenciesRedirectName);
    }
    if (patch.contactPreference != null) set('contact_preference', patch.contactPreference);
    if (patch.details !== undefined) set('details', patch.details);
    if (patch.adminComment !== undefined) set('admin_comment', patch.adminComment);
    if (patch.scheduleEventId !== undefined) set('schedule_event_id', patch.scheduleEventId);
    if (patch.reviewedByUserId !== undefined) set('reviewed_by_user_id', patch.reviewedByUserId);
    if (patch.reviewedAt !== undefined) set('reviewed_at', patch.reviewedAt);
    if (!fields.length) return this.findById(eid);
    values.push(eid);
    await pool.execute(`UPDATE planned_outs SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(eid);
  }

  static async deleteById(id) {
    const eid = Number(id || 0);
    if (!eid) return false;
    const [result] = await pool.execute(`DELETE FROM planned_outs WHERE id = ?`, [eid]);
    return Number(result?.affectedRows || 0) > 0;
  }
}

export default PlannedOut;
