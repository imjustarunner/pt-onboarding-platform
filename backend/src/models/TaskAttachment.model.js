import pool from '../config/database.js';

class TaskAttachment {
  static async listByTaskId(taskId) {
    const [rows] = await pool.execute(
      `SELECT id, task_id, storage_path, filename, content_type, uploaded_by_user_id, created_at
       FROM task_attachments WHERE task_id = ? ORDER BY created_at ASC`,
      [parseInt(taskId, 10)]
    );
    return (rows || []).map((r) => ({
      ...r,
      url: r.storage_path?.startsWith('uploads/')
        ? `/uploads/${r.storage_path.substring('uploads/'.length)}`
        : `/uploads/${r.storage_path}`
    }));
  }

  static async create({ taskId, storagePath, filename, contentType, uploadedByUserId }) {
    const [result] = await pool.execute(
      `INSERT INTO task_attachments (task_id, storage_path, filename, content_type, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        parseInt(taskId, 10),
        String(storagePath || ''),
        String(filename || 'attachment'),
        contentType ? String(contentType).slice(0, 100) : null,
        parseInt(uploadedByUserId, 10)
      ]
    );
    const id = result?.insertId;
    if (!id) return null;
    const [rows] = await pool.execute('SELECT * FROM task_attachments WHERE id = ?', [id]);
    const r = rows[0];
    return r
      ? {
          ...r,
          url: r.storage_path?.startsWith('uploads/')
            ? `/uploads/${r.storage_path.substring('uploads/'.length)}`
            : `/uploads/${r.storage_path}`
        }
      : null;
  }

  static async deleteById(id, taskId) {
    const [result] = await pool.execute(
      'DELETE FROM task_attachments WHERE id = ? AND task_id = ?',
      [parseInt(id, 10), parseInt(taskId, 10)]
    );
    return result?.affectedRows > 0;
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM task_attachments WHERE id = ?', [parseInt(id, 10)]);
    return rows[0] || null;
  }
}

export default TaskAttachment;
