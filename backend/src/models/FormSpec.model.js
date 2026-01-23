import pool from '../config/database.js';
import crypto from 'crypto';

class FormSpec {
  static async upsert({ specKey, content, createdByUserId = null }) {
    const key = String(specKey || '').trim();
    if (!key) throw new Error('specKey is required');
    const body = String(content || '');
    const sha256 = crypto.createHash('sha256').update(body, 'utf8').digest('hex');

    await pool.execute(
      `INSERT INTO form_specs (spec_key, content, content_sha256, created_by_user_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         content = VALUES(content),
         content_sha256 = VALUES(content_sha256),
         created_by_user_id = VALUES(created_by_user_id)`,
      [key, body, sha256, createdByUserId]
    );

    return await this.findByKey(key);
  }

  static async findByKey(specKey) {
    const key = String(specKey || '').trim();
    if (!key) return null;
    const [rows] = await pool.execute('SELECT * FROM form_specs WHERE spec_key = ? LIMIT 1', [key]);
    return rows?.[0] || null;
  }
}

export default FormSpec;

