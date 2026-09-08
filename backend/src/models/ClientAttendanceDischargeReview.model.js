import pool from '../config/database.js';

function mapRow(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    agencyId: Number(r.agency_id),
    clientId: Number(r.client_id),
    strikeId: Number(r.strike_id),
    appointmentId: r.appointment_id == null ? null : Number(r.appointment_id),
    status: String(r.status || 'pending_review'),
    providerRecommendedWaive: !!r.provider_recommended_waive,
    providerWaiveReason: r.provider_waive_reason || null,
    reviewDecisionReason: r.review_decision_reason || null,
    reviewComment: r.review_comment || null,
    reviewedByUserId: r.reviewed_by_user_id == null ? null : Number(r.reviewed_by_user_id),
    reviewedAt: r.reviewed_at || null,
    taskId: r.task_id == null ? null : Number(r.task_id),
    createdByUserId: r.created_by_user_id == null ? null : Number(r.created_by_user_id),
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
    // Joined extras when listed
    clientCode: r.client_code || r.identifier_code || null,
    clientFirstName: r.first_name || null,
    clientLastName: r.last_name || null,
    strikeNumberHint: r.strike_event_kind || null,
    struckAt: r.struck_at || null
  };
}

class ClientAttendanceDischargeReview {
  static async create({
    agencyId,
    clientId,
    strikeId,
    appointmentId = null,
    providerRecommendedWaive = false,
    providerWaiveReason = null,
    createdByUserId = null,
    taskId = null
  } = {}) {
    const [result] = await pool.execute(
      `INSERT INTO client_attendance_discharge_reviews
        (agency_id, client_id, strike_id, appointment_id, status,
         provider_recommended_waive, provider_waive_reason, created_by_user_id, task_id)
       VALUES (?, ?, ?, ?, 'pending_review', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         provider_recommended_waive = VALUES(provider_recommended_waive),
         provider_waive_reason = COALESCE(VALUES(provider_waive_reason), provider_waive_reason),
         updated_at = CURRENT_TIMESTAMP`,
      [
        Number(agencyId),
        Number(clientId),
        Number(strikeId),
        appointmentId ? Number(appointmentId) : null,
        providerRecommendedWaive ? 1 : 0,
        providerWaiveReason ? String(providerWaiveReason).slice(0, 255) : null,
        createdByUserId ? Number(createdByUserId) : null,
        taskId ? Number(taskId) : null
      ]
    );
    const id = result.insertId || null;
    if (id) {
      const [rows] = await pool.execute(
        `SELECT * FROM client_attendance_discharge_reviews WHERE id = ? LIMIT 1`,
        [id]
      );
      return mapRow(rows?.[0]);
    }
    const [rows] = await pool.execute(
      `SELECT * FROM client_attendance_discharge_reviews WHERE strike_id = ? LIMIT 1`,
      [Number(strikeId)]
    );
    return mapRow(rows?.[0]);
  }

  static async listPendingForAgency(agencyId, { includeResolved = false } = {}) {
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    const [rows] = await pool.execute(
      `SELECT r.*,
              c.identifier_code AS client_code,
              c.first_name, c.last_name,
              s.event_kind AS strike_event_kind,
              s.struck_at
       FROM client_attendance_discharge_reviews r
       INNER JOIN clients c ON c.id = r.client_id
       INNER JOIN client_medicaid_attendance_strikes s ON s.id = r.strike_id
       WHERE r.agency_id = ?
         AND (? = 1 OR r.status = 'pending_review')
       ORDER BY r.created_at DESC
       LIMIT 200`,
      [aid, includeResolved ? 1 : 0]
    );
    return (rows || []).map(mapRow);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT r.*, c.identifier_code AS client_code, c.first_name, c.last_name
       FROM client_attendance_discharge_reviews r
       LEFT JOIN clients c ON c.id = r.client_id
       WHERE r.id = ? LIMIT 1`,
      [Number(id)]
    );
    return mapRow(rows?.[0]);
  }

  static async decide(id, {
    status,
    reason = null,
    comment = null,
    reviewedByUserId = null
  } = {}) {
    const allowed = new Set([
      'continue_scheduling',
      'proceed_to_termination',
      'dismissed',
      'pending_review'
    ]);
    const next = String(status || '').toLowerCase();
    if (!allowed.has(next)) {
      throw Object.assign(new Error('Invalid review status'), { status: 400 });
    }
    await pool.execute(
      `UPDATE client_attendance_discharge_reviews
       SET status = ?,
           review_decision_reason = ?,
           review_comment = ?,
           reviewed_by_user_id = ?,
           reviewed_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [
        next,
        reason ? String(reason).slice(0, 255) : null,
        comment ? String(comment) : null,
        reviewedByUserId ? Number(reviewedByUserId) : null,
        Number(id)
      ]
    );
    return this.findById(id);
  }
}

export default ClientAttendanceDischargeReview;
