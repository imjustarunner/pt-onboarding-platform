import pool from '../config/database.js';

class Acknowledgment {
  static async findByUserAndModule(userId, moduleId) {
    const [rows] = await pool.execute(
      'SELECT * FROM acknowledgments WHERE user_id = ? AND module_id = ?',
      [userId, moduleId]
    );
    return rows[0] || null;
  }

  static async findByUser(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM acknowledgments WHERE user_id = ? ORDER BY acknowledged_at DESC',
      [userId]
    );
    return rows;
  }

  static async create(acknowledgmentData) {
    const { userId, moduleId, ipAddress } = acknowledgmentData;
    const [result] = await pool.execute(
      'INSERT INTO acknowledgments (user_id, module_id, ip_address) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE acknowledged_at = CURRENT_TIMESTAMP, ip_address = ?',
      [userId, moduleId, ipAddress || null, ipAddress || null]
    );
    return this.findByUserAndModule(userId, moduleId);
  }

  static async hasAcknowledged(userId, moduleId) {
    const acknowledgment = await this.findByUserAndModule(userId, moduleId);
    return !!acknowledgment;
  }
}

export default Acknowledgment;

