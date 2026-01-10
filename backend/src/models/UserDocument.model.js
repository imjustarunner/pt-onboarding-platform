import pool from '../config/database.js';

class UserDocument {
  static async create(userDocumentData) {
    const {
      documentTemplateId,
      userId,
      taskId,
      personalizedContent,
      personalizedFilePath,
      generatedAt
    } = userDocumentData;

    const [result] = await pool.execute(
      `INSERT INTO user_documents (
        document_template_id, user_id, task_id,
        personalized_content, personalized_file_path, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        documentTemplateId,
        userId,
        taskId,
        personalizedContent || null,
        personalizedFilePath || null,
        generatedAt || new Date()
      ]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_documents WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findByUser(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_documents WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }

  static async findByTask(taskId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_documents WHERE task_id = ?',
      [taskId]
    );
    return rows[0] || null;
  }

  static async findByTemplate(templateId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_documents WHERE document_template_id = ? ORDER BY created_at DESC',
      [templateId]
    );
    return rows;
  }

  static async findByUserAndTemplate(userId, templateId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_documents WHERE user_id = ? AND document_template_id = ? ORDER BY created_at DESC',
      [userId, templateId]
    );
    return rows;
  }

  static async update(id, updateData) {
    const updates = [];
    const values = [];

    if (updateData.personalizedContent !== undefined) {
      updates.push('personalized_content = ?');
      values.push(updateData.personalizedContent);
    }
    if (updateData.personalizedFilePath !== undefined) {
      updates.push('personalized_file_path = ?');
      values.push(updateData.personalizedFilePath);
    }
    if (updateData.generatedAt !== undefined) {
      updates.push('generated_at = ?');
      values.push(updateData.generatedAt);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    await pool.execute(
      `UPDATE user_documents SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM user_documents WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default UserDocument;

