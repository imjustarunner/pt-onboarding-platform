import pool from '../config/database.js';

class OfficeStandingAssignment {
  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM office_standing_assignments WHERE id = ? LIMIT 1`, [id]);
    return rows?.[0] || null;
  }

  static async listByOffice(officeLocationId) {
    const [rows] = await pool.execute(
      `SELECT
         a.*,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name
       FROM office_standing_assignments a
       JOIN users u ON a.provider_id = u.id
       WHERE a.office_location_id = ?
         AND a.is_active = TRUE`,
      [officeLocationId]
    );
    return rows || [];
  }

  static async update(id, updates = {}) {
    const allowed = [
      'availability_mode',
      'temporary_until_date',
      'available_since_date',
      'last_two_week_confirmed_at',
      'last_six_week_checked_at',
      'is_active'
    ];
    const fields = [];
    const values = [];
    for (const k of allowed) {
      if (k in updates) {
        fields.push(`${k} = ?`);
        values.push(updates[k]);
      }
    }
    if (fields.length === 0) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE office_standing_assignments SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default OfficeStandingAssignment;

