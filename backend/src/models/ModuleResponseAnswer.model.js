import pool from '../config/database.js';

class ModuleResponseAnswer {
  static async findByUserAndModule(userId, moduleId) {
    const [rows] = await pool.execute(
      `SELECT mra.*, mc.content_data, mc.content_type, mc.order_index
       FROM module_response_answers mra
       JOIN module_content mc ON mra.content_id = mc.id
       WHERE mra.user_id = ? AND mra.module_id = ?
       ORDER BY mc.order_index ASC`,
      [userId, moduleId]
    );
    return rows;
  }

  static async findByUserAndContent(userId, contentId) {
    const [rows] = await pool.execute(
      'SELECT * FROM module_response_answers WHERE user_id = ? AND content_id = ?',
      [userId, contentId]
    );
    return rows[0] || null;
  }

  static async createOrUpdate(userId, moduleId, contentId, responseText) {
    const existing = await this.findByUserAndContent(userId, contentId);
    
    if (existing) {
      await pool.execute(
        'UPDATE module_response_answers SET response_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [responseText, existing.id]
      );
      return this.findByUserAndContent(userId, contentId);
    } else {
      const [result] = await pool.execute(
        'INSERT INTO module_response_answers (user_id, module_id, content_id, response_text) VALUES (?, ?, ?, ?)',
        [userId, moduleId, contentId, responseText]
      );
      return this.findById(result.insertId);
    }
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM module_response_answers WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findByUser(userId) {
    const [rows] = await pool.execute(
      `SELECT mra.*, mc.content_data, mc.content_type, mc.order_index, m.title as module_title
       FROM module_response_answers mra
       JOIN module_content mc ON mra.content_id = mc.id
       JOIN modules m ON mra.module_id = m.id
       WHERE mra.user_id = ?
       ORDER BY m.title, mc.order_index ASC`,
      [userId]
    );
    return rows;
  }
}

export default ModuleResponseAnswer;

