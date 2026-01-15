import pool from '../config/database.js';
import MessageLog from './MessageLog.model.js';

class MessageAutoReplyThrottle {
  static async getLastSentAt(userId, clientPhone) {
    const phone = MessageLog.normalizePhone(clientPhone);
    if (!phone) return null;
    const [rows] = await pool.execute(
      'SELECT last_sent_at FROM message_auto_reply_throttle WHERE user_id = ? AND client_phone = ?',
      [userId, phone]
    );
    return rows[0]?.last_sent_at || null;
  }

  static async upsertNow(userId, clientPhone) {
    const phone = MessageLog.normalizePhone(clientPhone);
    if (!phone) return null;
    await pool.execute(
      `INSERT INTO message_auto_reply_throttle (user_id, client_phone, last_sent_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_sent_at = NOW()`,
      [userId, phone]
    );
    return true;
  }
}

export default MessageAutoReplyThrottle;

