import pool from '../config/database.js';

class TwilioNumberRule {
  static async listByNumberId(numberId) {
    const [rows] = await pool.execute(
      `SELECT * FROM twilio_number_rules WHERE number_id = ? ORDER BY created_at DESC`,
      [numberId]
    );
    return rows;
  }

  static async getActiveRule(numberId, ruleType) {
    const [rows] = await pool.execute(
      `SELECT * FROM twilio_number_rules
       WHERE number_id = ? AND rule_type = ? AND enabled = TRUE
       ORDER BY updated_at DESC
       LIMIT 1`,
      [numberId, ruleType]
    );
    return rows[0] || null;
  }

  static async upsert({ numberId, ruleType, scheduleJson = null, autoReplyText = null, forwardToUserId = null, forwardToPhone = null, enabled = true }) {
    const [existing] = await pool.execute(
      `SELECT id FROM twilio_number_rules WHERE number_id = ? AND rule_type = ? LIMIT 1`,
      [numberId, ruleType]
    );
    if (existing?.[0]?.id) {
      await pool.execute(
        `UPDATE twilio_number_rules
         SET schedule_json = ?, auto_reply_text = ?, forward_to_user_id = ?, forward_to_phone = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          scheduleJson ? JSON.stringify(scheduleJson) : null,
          autoReplyText,
          forwardToUserId,
          forwardToPhone,
          enabled ? 1 : 0,
          existing[0].id
        ]
      );
      const [rows] = await pool.execute('SELECT * FROM twilio_number_rules WHERE id = ?', [existing[0].id]);
      return rows[0] || null;
    }
    const [result] = await pool.execute(
      `INSERT INTO twilio_number_rules
       (number_id, rule_type, schedule_json, auto_reply_text, forward_to_user_id, forward_to_phone, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        numberId,
        ruleType,
        scheduleJson ? JSON.stringify(scheduleJson) : null,
        autoReplyText,
        forwardToUserId,
        forwardToPhone,
        enabled ? 1 : 0
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM twilio_number_rules WHERE id = ?', [result.insertId]);
    return rows[0] || null;
  }
}

export default TwilioNumberRule;
