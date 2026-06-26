import pool from '../config/database.js';

class UserLifecycleScopedItem {
  static async scope(userId, itemKey, source = 'package', sourceId = null) {
    const uid = Number(userId);
    const key = String(itemKey || '').trim();
    if (!Number.isInteger(uid) || uid <= 0 || !key) return false;

    await pool.execute(
      `INSERT IGNORE INTO user_lifecycle_scoped_items (user_id, item_key, source, source_id)
       VALUES (?, ?, ?, ?)`,
      [uid, key, source, sourceId != null ? Number(sourceId) : null]
    );
    return true;
  }

  static async scopeMany(userId, itemKeys, source = 'package', sourceId = null) {
    const keys = [...new Set((itemKeys || []).map((k) => String(k || '').trim()).filter(Boolean))];
    for (const key of keys) {
      await this.scope(userId, key, source, sourceId);
    }
    return keys.length;
  }

  static async findKeysByUser(userId) {
    const uid = Number(userId);
    if (!Number.isInteger(uid) || uid <= 0) return new Set();

    const [rows] = await pool.execute(
      'SELECT item_key FROM user_lifecycle_scoped_items WHERE user_id = ?',
      [uid]
    );
    return new Set((rows || []).map((r) => r.item_key));
  }

  /** Returns scope audit rows — useful for debugging why an item was ever scoped. */
  static async findDetailsByUser(userId) {
    const uid = Number(userId);
    if (!Number.isInteger(uid) || uid <= 0) return [];

    const [rows] = await pool.execute(
      `SELECT item_key, source, source_id, created_at
       FROM user_lifecycle_scoped_items
       WHERE user_id = ?
       ORDER BY created_at ASC`,
      [uid]
    );
    return rows || [];
  }
}

export default UserLifecycleScopedItem;
