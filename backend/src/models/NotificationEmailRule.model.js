import pool from '../config/database.js';

class NotificationEmailRule {
  static async create({
    agencyId = null,
    notificationType,
    trainingTrackId = null,
    senderIdentityId,
    isEnabled = true
  }) {
    const [result] = await pool.execute(
      `INSERT INTO notification_email_rules
       (agency_id, notification_type, training_track_id, sender_identity_id, is_enabled)
       VALUES (?, ?, ?, ?, ?)`,
      [agencyId, notificationType, trainingTrackId, senderIdentityId, isEnabled ? 1 : 0]
    );
    return this.findById(result.insertId);
  }

  static async update(id, updates = {}) {
    const fields = [];
    const values = [];

    if (updates.senderIdentityId !== undefined) {
      fields.push('sender_identity_id = ?');
      values.push(updates.senderIdentityId);
    }
    if (updates.isEnabled !== undefined) {
      fields.push('is_enabled = ?');
      values.push(updates.isEnabled ? 1 : 0);
    }

    if (!fields.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE notification_email_rules SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT r.*, e.identity_key, e.display_name, e.from_email, e.reply_to, e.agency_id AS identity_agency_id
       FROM notification_email_rules r
       INNER JOIN email_sender_identities e ON e.id = r.sender_identity_id
       WHERE r.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Resolve best matching rule with precedence:
   * 1) agency + track
   * 2) agency + no track
   * 3) platform + track
   * 4) platform + no track
   */
  static async resolveBest({ agencyId, notificationType, trainingTrackId = null }) {
    const a = agencyId ? Number(agencyId) : null;
    const t = trainingTrackId ? Number(trainingTrackId) : null;
    const type = String(notificationType || '').trim();
    if (!type) return null;

    const [rows] = await pool.execute(
      `SELECT r.*, e.identity_key, e.display_name, e.from_email, e.reply_to, e.agency_id AS identity_agency_id
       FROM notification_email_rules r
       INNER JOIN email_sender_identities e ON e.id = r.sender_identity_id
       WHERE r.is_enabled = TRUE
         AND e.is_active = TRUE
         AND r.notification_type = ?
         AND (
           (r.agency_id = ? AND r.training_track_id <=> ?) OR
           (r.agency_id = ? AND r.training_track_id IS NULL) OR
           (r.agency_id IS NULL AND r.training_track_id <=> ?) OR
           (r.agency_id IS NULL AND r.training_track_id IS NULL)
         )
       ORDER BY
         CASE
           WHEN r.agency_id = ? AND r.training_track_id <=> ? THEN 1
           WHEN r.agency_id = ? AND r.training_track_id IS NULL THEN 2
           WHEN r.agency_id IS NULL AND r.training_track_id <=> ? THEN 3
           ELSE 4
         END
       LIMIT 1`,
      [type, a, t, a, t, a, t, a, t, t]
    );
    return rows[0] || null;
  }
}

export default NotificationEmailRule;

