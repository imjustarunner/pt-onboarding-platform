import pool from '../config/database.js';

class CompanyCar {
  static async create({ agencyId, name, isActive = true }) {
    const [result] = await pool.execute(
      `INSERT INTO company_cars (agency_id, name, is_active)
       VALUES (?, ?, ?)`,
      [agencyId, String(name || '').trim().slice(0, 255), isActive ? 1 : 0]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM company_cars WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows?.[0];
    if (!row) return null;
    return this._addPhotoUrl(row);
  }

  static async listByAgency({ agencyId, activeOnly = true }) {
    const params = [agencyId];
    let where = 'agency_id = ?';
    if (activeOnly) {
      where += ' AND is_active = 1';
    }
    const [rows] = await pool.execute(
      `SELECT * FROM company_cars WHERE ${where} ORDER BY name ASC`,
      params
    );
    return (rows || []).map((r) => this._addPhotoUrl(r));
  }

  static _addPhotoUrl(row) {
    if (!row) return row;
    const p = row.photo_path;
    return { ...row, photoUrl: p || null };
  }

  static async update({ id, agencyId, name, isActive, photoPath }) {
    const updates = [];
    const values = [];
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(String(name || '').trim().slice(0, 255));
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }
    if (photoPath !== undefined) {
      updates.push('photo_path = ?');
      values.push(photoPath ? String(photoPath).slice(0, 512) : null);
    }
    if (updates.length === 0) return this.findById(id);
    values.push(id, agencyId);
    await pool.execute(
      `UPDATE company_cars SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`,
      values
    );
    return this.findById(id);
  }
}

export default CompanyCar;
