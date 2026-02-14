import pool from '../config/database.js';

class ProgramSiteShiftSlot {
  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM program_site_shift_slots WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findBySite(programSiteId, { includeInactive = false } = {}) {
    const where = includeInactive ? 'program_site_id = ?' : 'program_site_id = ? AND is_active = TRUE';
    const [rows] = await pool.execute(
      `SELECT * FROM program_site_shift_slots WHERE ${where} ORDER BY weekday, start_time`,
      [programSiteId]
    );
    return rows;
  }

  static async create({ programSiteId, weekday, startTime, endTime, slotType = 'scheduled' }) {
    const [result] = await pool.execute(
      `INSERT INTO program_site_shift_slots (program_site_id, weekday, start_time, end_time, slot_type)
       VALUES (?, ?, ?, ?, ?)`,
      [programSiteId, weekday, startTime, endTime, slotType]
    );
    return this.findById(result.insertId);
  }

  static async update(id, updates = {}) {
    const allowed = ['weekday', 'start_time', 'end_time', 'slot_type', 'is_active'];
    const fields = [];
    const values = [];
    for (const k of allowed) {
      if (k in updates) {
        const col = k.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        fields.push(`${col} = ?`);
        values.push(updates[k]);
      }
    }
    if (fields.length === 0) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE program_site_shift_slots SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async remove(id) {
    await pool.execute('DELETE FROM program_site_shift_slots WHERE id = ?', [id]);
  }
}

export default ProgramSiteShiftSlot;
