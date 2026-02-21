import pool from '../config/database.js';

const STATUSES = ['pending', 'discussed', 'completed'];

class MeetingAgendaItem {
  static async findByAgendaId(agendaId) {
    const [rows] = await pool.execute(
      `SELECT * FROM meeting_agenda_items
       WHERE meeting_agenda_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [parseInt(agendaId, 10)]
    );
    return rows || [];
  }

  static async create({ meetingAgendaId, taskId, title, notes, sortOrder, createdByUserId }) {
    const titleStr = String(title || '').trim();
    if (!titleStr) return null;

    const [result] = await pool.execute(
      `INSERT INTO meeting_agenda_items
        (meeting_agenda_id, task_id, title, notes, sort_order, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        parseInt(meetingAgendaId, 10),
        taskId ? parseInt(taskId, 10) : null,
        titleStr,
        notes ? String(notes).trim() || null : null,
        Number(sortOrder) || 0,
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM meeting_agenda_items WHERE id = ?',
      [parseInt(id, 10)]
    );
    return rows?.[0] || null;
  }

  static async updateStatus(id, status) {
    if (!STATUSES.includes(status)) return null;
    const [result] = await pool.execute(
      'UPDATE meeting_agenda_items SET status = ? WHERE id = ?',
      [status, parseInt(id, 10)]
    );
    return result.affectedRows > 0 ? this.findById(id) : null;
  }

  static async update(id, { title, notes, sortOrder, status }) {
    const item = await this.findById(id);
    if (!item) return null;

    const updates = [];
    const params = [];

    if (title !== undefined) {
      const t = String(title || '').trim();
      if (!t) return null;
      updates.push('title = ?');
      params.push(t);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes ? String(notes).trim() || null : null);
    }
    if (sortOrder !== undefined) {
      updates.push('sort_order = ?');
      params.push(Number(sortOrder) || 0);
    }
    if (status !== undefined && STATUSES.includes(status)) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) return item;

    params.push(parseInt(id, 10));
    await pool.execute(
      `UPDATE meeting_agenda_items SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM meeting_agenda_items WHERE id = ?',
      [parseInt(id, 10)]
    );
    return result.affectedRows > 0;
  }

  static async bulkCreate(agendaId, items, createdByUserId) {
    if (!Array.isArray(items) || !items.length) return [];
    const created = [];
    let sortOrder = 0;
    for (const it of items) {
      const title = it.title || (it.task_title) || '';
      const taskId = it.task_id ? parseInt(it.task_id, 10) : null;
      const row = await this.create({
        meetingAgendaId: agendaId,
        taskId: taskId || null,
        title,
        notes: it.notes || null,
        sortOrder: it.sort_order ?? sortOrder,
        createdByUserId
      });
      if (row) created.push(row);
      sortOrder++;
    }
    return created;
  }
}

export default MeetingAgendaItem;
