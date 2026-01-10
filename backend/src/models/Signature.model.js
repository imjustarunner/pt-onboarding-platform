import pool from '../config/database.js';

class Signature {
  static async findByUserAndModule(userId, moduleId) {
    const [rows] = await pool.execute(
      'SELECT * FROM signatures WHERE user_id = ? AND module_id = ?',
      [userId, moduleId]
    );
    return rows[0] || null;
  }

  static async createOrUpdate(signatureData) {
    const { userId, moduleId, signatureData: data } = signatureData;
    const existing = await this.findByUserAndModule(userId, moduleId);

    if (existing) {
      await pool.execute(
        'UPDATE signatures SET signature_data = ?, signed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND module_id = ?',
        [data, userId, moduleId]
      );
      return this.findByUserAndModule(userId, moduleId);
    } else {
      const [result] = await pool.execute(
        'INSERT INTO signatures (user_id, module_id, signature_data) VALUES (?, ?, ?)',
        [userId, moduleId, data]
      );
      return this.findByUserAndModule(userId, moduleId);
    }
  }
}

export default Signature;

