import pool from '../config/database.js';

class DocumentAcknowledgment {
  static async create(acknowledgmentData) {
    const {
      taskId,
      userId,
      ipAddress,
      userAgent
    } = acknowledgmentData;

    const [result] = await pool.execute(
      `INSERT INTO document_acknowledgments (
        task_id, user_id, ip_address, user_agent
      ) VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        acknowledged_at = CURRENT_TIMESTAMP,
        ip_address = VALUES(ip_address),
        user_agent = VALUES(user_agent)`,
      [
        taskId,
        userId,
        ipAddress || null,
        userAgent || null
      ]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM document_acknowledgments WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findByTask(taskId) {
    const [rows] = await pool.execute(
      'SELECT * FROM document_acknowledgments WHERE task_id = ? ORDER BY acknowledged_at DESC',
      [taskId]
    );
    return rows;
  }

  static async findByUser(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM document_acknowledgments WHERE user_id = ? ORDER BY acknowledged_at DESC',
      [userId]
    );
    return rows;
  }

  static async findByTaskAndUser(taskId, userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM document_acknowledgments WHERE task_id = ? AND user_id = ?',
      [taskId, userId]
    );
    return rows[0] || null;
  }
}

export default DocumentAcknowledgment;

