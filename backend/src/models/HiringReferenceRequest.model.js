import crypto from 'crypto';
import pool from '../config/database.js';

function parseJsonMaybe(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
}

class HiringReferenceRequest {
  static mapRow(row) {
    if (!row) return null;
    return {
      ...row,
      responses_json: parseJsonMaybe(row.responses_json)
    };
  }

  static newOpenTrackToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  static async insertRow({
    hiringProfileId,
    agencyId,
    candidateUserId,
    referenceIndex,
    referenceName,
    referenceEmail,
    publicLinkToken,
    openTrackToken = null,
    tokenExpiresAt,
    status = 'sent',
    sentByUserId = null,
    intakeSubmissionId = null
  }) {
    const openTok = String(openTrackToken || '').trim() || this.newOpenTrackToken();
    const [result] = await pool.execute(
      `INSERT INTO hiring_reference_requests (
        hiring_profile_id, agency_id, candidate_user_id, reference_index,
        reference_name, reference_email, public_link_token, open_track_token, token_expires_at, status,
        sent_at, sent_by_user_id, intake_submission_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
      [
        hiringProfileId,
        agencyId,
        candidateUserId,
        referenceIndex,
        referenceName,
        referenceEmail,
        publicLinkToken,
        openTok,
        tokenExpiresAt,
        status,
        sentByUserId || null,
        intakeSubmissionId || null
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM hiring_reference_requests WHERE id = ?', [result.insertId]);
    return this.mapRow(rows[0]);
  }

  static async findByPublicLinkToken(token) {
    const t = String(token || '').trim().toLowerCase();
    if (!t) return null;
    const [rows] = await pool.execute('SELECT * FROM hiring_reference_requests WHERE public_link_token = ? LIMIT 1', [t]);
    return this.mapRow(rows[0] || null);
  }

  static async findByOpenTrackToken(token) {
    const t = String(token || '').trim().toLowerCase();
    if (!t) return null;
    const [rows] = await pool.execute('SELECT * FROM hiring_reference_requests WHERE open_track_token = ? LIMIT 1', [t]);
    return this.mapRow(rows[0] || null);
  }

  static async listByProfileAndAgency(hiringProfileId, agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM hiring_reference_requests
       WHERE hiring_profile_id = ? AND agency_id = ?
       ORDER BY reference_index ASC, id ASC`,
      [hiringProfileId, agencyId]
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  static async hasActiveSentForIndex(hiringProfileId, referenceIndex) {
    const [rows] = await pool.execute(
      `SELECT id FROM hiring_reference_requests
       WHERE hiring_profile_id = ?
         AND reference_index = ?
         AND (
           status = 'completed'
           OR (status = 'sent' AND token_expires_at > NOW())
         )
       LIMIT 1`,
      [hiringProfileId, referenceIndex]
    );
    return (rows || []).length > 0;
  }

  static async markCompleted(id, responsesJson) {
    await pool.execute(
      `UPDATE hiring_reference_requests
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP, responses_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'sent' LIMIT 1`,
      [JSON.stringify(responsesJson || {}), id]
    );
    const [rows] = await pool.execute('SELECT * FROM hiring_reference_requests WHERE id = ?', [id]);
    return this.mapRow(rows[0] || null);
  }

  static async markReminder3d(id) {
    await pool.execute(
      `UPDATE hiring_reference_requests SET reminder_3d_sent_at = CURRENT_TIMESTAMP WHERE id = ? AND reminder_3d_sent_at IS NULL`,
      [id]
    );
  }

  static async markReminder24h(id) {
    await pool.execute(
      `UPDATE hiring_reference_requests SET reminder_24h_sent_at = CURRENT_TIMESTAMP WHERE id = ? AND reminder_24h_sent_at IS NULL`,
      [id]
    );
  }

  static async expireStaleRows() {
    await pool.execute(
      `UPDATE hiring_reference_requests
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'sent' AND token_expires_at < NOW()`
    );
  }

  static async listPendingForReminders() {
    const [rows] = await pool.execute(
      `SELECT * FROM hiring_reference_requests
       WHERE status = 'sent'
         AND token_expires_at > NOW()
         AND (reminder_3d_sent_at IS NULL OR reminder_24h_sent_at IS NULL)`
    );
    return (rows || []).map((r) => this.mapRow(r));
  }

  /**
   * Sets email_opened_at the first time a valid open-track token is hit.
   * @returns {{ row: object|null, firstOpen: boolean }}
   */
  static async recordFirstEmailOpenByToken(rawToken) {
    const t = String(rawToken || '').trim().toLowerCase();
    if (!t) return { row: null, firstOpen: false };
    const [res] = await pool.execute(
      `UPDATE hiring_reference_requests
       SET email_opened_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE open_track_token = ? AND email_opened_at IS NULL`,
      [t]
    );
    const firstOpen = Number(res?.affectedRows || 0) > 0;
    const [rows] = await pool.execute('SELECT * FROM hiring_reference_requests WHERE open_track_token = ? LIMIT 1', [t]);
    const row = this.mapRow(rows[0] || null);
    return { row, firstOpen };
  }
}

export default HiringReferenceRequest;
