import pool from '../config/database.js';

function mapRow(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    agencyId: Number(r.agency_id),
    clientId: Number(r.client_id),
    appointmentId: r.appointment_id == null ? null : Number(r.appointment_id),
    struckAt: r.struck_at || null,
    expiresAt: r.expires_at || null,
    eventKind: String(r.event_kind || ''),
    terminationRecommendation: !!r.termination_recommendation,
    terminationRecommendationWaived: !!r.termination_recommendation_waived,
    terminationWaiverReason: r.termination_waiver_reason || null,
    terminationWaiverComment: r.termination_waiver_comment || null,
    terminationWaivedByUserId: r.termination_waived_by_user_id == null
      ? null
      : Number(r.termination_waived_by_user_id),
    terminationWaivedAt: r.termination_waived_at || null,
    createdByUserId: r.created_by_user_id == null ? null : Number(r.created_by_user_id),
    createdAt: r.created_at || null
  };
}

class ClientMedicaidAttendanceStrike {
  static async countActive({ agencyId, clientId, asOf = new Date() } = {}) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return 0;
    const at = asOf instanceof Date ? asOf : new Date(asOf);
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS c
       FROM client_medicaid_attendance_strikes
       WHERE agency_id = ? AND client_id = ? AND expires_at > ?`,
      [aid, cid, at]
    );
    return Number(rows?.[0]?.c || 0);
  }

  static async listActive({ agencyId, clientId, asOf = new Date() } = {}) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return [];
    const at = asOf instanceof Date ? asOf : new Date(asOf);
    const [rows] = await pool.execute(
      `SELECT *
       FROM client_medicaid_attendance_strikes
       WHERE agency_id = ? AND client_id = ? AND expires_at > ?
       ORDER BY struck_at ASC`,
      [aid, cid, at]
    );
    return (rows || []).map(mapRow);
  }

  static async findByAppointmentId(appointmentId) {
    const id = Number(appointmentId || 0);
    if (!id) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM client_medicaid_attendance_strikes WHERE appointment_id = ? LIMIT 1`,
      [id]
    );
    return mapRow(rows?.[0]);
  }

  static async create({
    agencyId,
    clientId,
    appointmentId = null,
    struckAt = new Date(),
    eventKind,
    terminationRecommendation = false,
    createdByUserId = null
  } = {}) {
    const struck = struckAt instanceof Date ? struckAt : new Date(struckAt);
    const expires = new Date(struck.getTime());
    expires.setUTCFullYear(expires.getUTCFullYear() + 1);
    const toMysql = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    };
    const [result] = await pool.execute(
      `INSERT INTO client_medicaid_attendance_strikes
        (agency_id, client_id, appointment_id, struck_at, expires_at, event_kind,
         termination_recommendation, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(agencyId),
        Number(clientId),
        appointmentId ? Number(appointmentId) : null,
        toMysql(struck),
        toMysql(expires),
        String(eventKind || 'no_show'),
        terminationRecommendation ? 1 : 0,
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM client_medicaid_attendance_strikes WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return mapRow(rows?.[0]);
  }

  static async waiveTerminationRecommendation(id, {
    reason = null,
    comment = null,
    waivedByUserId = null,
    /** When true, expire the third strike so active count returns to 2. */
    keepAsTwoStrikes = true
  } = {}) {
    const sid = Number(id || 0);
    if (!sid) return null;
    await pool.execute(
      `UPDATE client_medicaid_attendance_strikes
       SET termination_recommendation_waived = 1,
           termination_waiver_reason = ?,
           termination_waiver_comment = ?,
           termination_waived_by_user_id = ?,
           termination_waived_at = UTC_TIMESTAMP(),
           expires_at = IF(?, UTC_TIMESTAMP(), expires_at)
       WHERE id = ?`,
      [
        reason ? String(reason).slice(0, 255) : null,
        comment ? String(comment) : null,
        waivedByUserId ? Number(waivedByUserId) : null,
        keepAsTwoStrikes ? 1 : 0,
        sid
      ]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM client_medicaid_attendance_strikes WHERE id = ? LIMIT 1`,
      [sid]
    );
    return mapRow(rows?.[0]);
  }
}

export default ClientMedicaidAttendanceStrike;
