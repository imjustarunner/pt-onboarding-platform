import pool from '../config/database.js';

class MomentumSticky {
  static async listByUserId(userId, { includeHidden = false } = {}) {
    const [rows] = await pool.execute(
      `SELECT id, user_id, title, is_pinned, position_x, position_y, is_collapsed, sort_order, color, is_hidden, created_at, updated_at
       FROM momentum_stickies
       WHERE user_id = ? ${includeHidden ? '' : 'AND (is_hidden = 0 OR is_hidden IS NULL)'}
       ORDER BY is_pinned DESC, sort_order ASC, created_at ASC`,
      [userId]
    );
    const stickies = rows.map((r) => this._rowToSticky(r));
    for (const s of stickies) {
      s.entries = await this.getEntries(s.id);
    }
    return stickies;
  }

  static async getEntries(stickyId) {
    const [rows] = await pool.execute(
      `SELECT id, momentum_sticky_id, text, is_checked, is_expanded, sort_order, created_at, updated_at
       FROM momentum_sticky_entries
       WHERE momentum_sticky_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
      [stickyId]
    );
    return rows.map((r) => ({
      id: r.id,
      momentum_sticky_id: r.momentum_sticky_id,
      text: r.text,
      is_checked: !!r.is_checked,
      is_expanded: r.is_expanded !== 0 && r.is_expanded !== false,
      sort_order: r.sort_order,
      created_at: r.created_at,
      updated_at: r.updated_at
    }));
  }

  static async findById(id, userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM momentum_stickies WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!rows.length) return null;
    const sticky = this._rowToSticky(rows[0]);
    sticky.entries = await this.getEntries(sticky.id);
    return sticky;
  }

  static async create({ userId, title, isPinned = false, positionX = 0, positionY = 0, isCollapsed = false, sortOrder = 0, color = 'yellow', isHidden = false }) {
    const [result] = await pool.execute(
      `INSERT INTO momentum_stickies (user_id, title, is_pinned, position_x, position_y, is_collapsed, sort_order, color, is_hidden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, title, isPinned ? 1 : 0, positionX, positionY, isCollapsed ? 1 : 0, sortOrder, color || 'yellow', isHidden ? 1 : 0]
    );
    return this.findById(result.insertId, userId);
  }

  static async update(id, userId, { title, isPinned, positionX, positionY, isCollapsed, sortOrder, color, isHidden }) {
    const sticky = await this.findById(id, userId);
    if (!sticky) return null;
    const updates = [];
    const values = [];
    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (isPinned !== undefined) { updates.push('is_pinned = ?'); values.push(isPinned ? 1 : 0); }
    if (positionX !== undefined && Number.isFinite(Number(positionX))) { updates.push('position_x = ?'); values.push(Math.floor(Number(positionX))); }
    if (positionY !== undefined && Number.isFinite(Number(positionY))) { updates.push('position_y = ?'); values.push(Math.floor(Number(positionY))); }
    if (isCollapsed !== undefined) { updates.push('is_collapsed = ?'); values.push(isCollapsed ? 1 : 0); }
    if (sortOrder !== undefined) { updates.push('sort_order = ?'); values.push(sortOrder); }
    if (color !== undefined) { updates.push('color = ?'); values.push(color || 'yellow'); }
    if (isHidden !== undefined) { updates.push('is_hidden = ?'); values.push(isHidden ? 1 : 0); }
    if (updates.length === 0) return sticky;
    values.push(id, userId);
    await pool.execute(
      `UPDATE momentum_stickies SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
    return this.findById(id, userId);
  }

  static async updatePosition(id, userId, { positionX, positionY, isCollapsed }) {
    return this.update(id, userId, { positionX, positionY, isCollapsed });
  }

  static async delete(id, userId) {
    const [result] = await pool.execute(
      'DELETE FROM momentum_stickies WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    return result.affectedRows > 0;
  }

  static async addEntry(stickyId, userId, { text, isChecked = false, isExpanded = true, sortOrder = 0 }) {
    const sticky = await this.findById(stickyId, userId);
    if (!sticky) return null;
    const [result] = await pool.execute(
      `INSERT INTO momentum_sticky_entries (momentum_sticky_id, text, is_checked, is_expanded, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [stickyId, text || '', isChecked ? 1 : 0, isExpanded ? 1 : 0, sortOrder]
    );
    const entries = await this.getEntries(stickyId);
    return entries.find((e) => e.id === result.insertId) || entries[entries.length - 1];
  }

  static async updateEntry(entryId, stickyId, userId, { text, isChecked, isExpanded, sortOrder }) {
    const sticky = await this.findById(stickyId, userId);
    if (!sticky) return null;
    const updates = [];
    const values = [];
    if (text !== undefined) { updates.push('text = ?'); values.push(text); }
    if (isChecked !== undefined) { updates.push('is_checked = ?'); values.push(isChecked ? 1 : 0); }
    if (isExpanded !== undefined) { updates.push('is_expanded = ?'); values.push(isExpanded ? 1 : 0); }
    if (sortOrder !== undefined) { updates.push('sort_order = ?'); values.push(sortOrder); }
    if (updates.length === 0) return sticky.entries.find((e) => e.id === parseInt(entryId, 10));
    values.push(entryId, stickyId);
    await pool.execute(
      `UPDATE momentum_sticky_entries SET ${updates.join(', ')} WHERE id = ? AND momentum_sticky_id = ?`,
      values
    );
    const entries = await this.getEntries(stickyId);
    return entries.find((e) => e.id === parseInt(entryId, 10));
  }

  static async deleteEntry(entryId, stickyId, userId) {
    const sticky = await this.findById(stickyId, userId);
    if (!sticky) return false;
    const [result] = await pool.execute(
      'DELETE FROM momentum_sticky_entries WHERE id = ? AND momentum_sticky_id = ?',
      [entryId, stickyId]
    );
    return result.affectedRows > 0;
  }

  static _rowToSticky(r) {
    return {
      id: r.id,
      user_id: r.user_id,
      title: r.title,
      is_pinned: !!r.is_pinned,
      position_x: r.position_x ?? 0,
      position_y: r.position_y ?? 0,
      is_collapsed: !!r.is_collapsed,
      sort_order: r.sort_order ?? 0,
      color: r.color || 'yellow',
      is_hidden: !!(r.is_hidden),
      created_at: r.created_at,
      updated_at: r.updated_at,
      entries: []
    };
  }
}

export default MomentumSticky;
