import pool from '../config/database.js';

class CompanyCarUsualPlace {
  static async listByAgency({ agencyId, limit = 50, search = null }) {
    const lim = Math.max(1, Math.min(100, Number(limit || 50)));
    const params = [agencyId];
    let where = 'agency_id = ?';
    if (search && String(search).trim()) {
      where += ' AND (name LIKE ? OR address LIKE ?)';
      const term = `%${String(search).trim()}%`;
      params.push(term, term);
    }
    params.push(lim);

    const [rows] = await pool.execute(
      `SELECT * FROM company_car_usual_places
       WHERE ${where}
       ORDER BY use_count DESC, last_used_at DESC
       LIMIT ?`,
      params
    );
    return rows || [];
  }

  static async upsertAndIncrement({ agencyId, name, address = null, defaultReason = null }) {
    const nameTrimmed = String(name || '').trim().slice(0, 255);
    if (!nameTrimmed) return null;

    const [existing] = await pool.execute(
      `SELECT id, use_count FROM company_car_usual_places
       WHERE agency_id = ? AND name = ?
       LIMIT 1`,
      [agencyId, nameTrimmed]
    );

    const addressVal = address ? String(address).trim().slice(0, 512) : null;
    const reasonVal = defaultReason ? String(defaultReason).trim().slice(0, 255) : null;

    if (existing?.length > 0) {
      const row = existing[0];
      try {
        await pool.execute(
          `UPDATE company_car_usual_places
           SET use_count = use_count + 1, last_used_at = NOW(),
               address = COALESCE(?, address),
               default_reason = COALESCE(?, default_reason),
               updated_at = NOW()
           WHERE id = ?`,
          [addressVal, reasonVal, row.id]
        );
      } catch (e) {
        if (e.message && /Unknown column 'default_reason'/.test(e.message)) {
          await pool.execute(
            `UPDATE company_car_usual_places
             SET use_count = use_count + 1, last_used_at = NOW(), address = COALESCE(?, address), updated_at = NOW()
             WHERE id = ?`,
            [addressVal, row.id]
          );
        } else throw e;
      }
      return row.id;
    }

    try {
      const [result] = await pool.execute(
        `INSERT INTO company_car_usual_places (agency_id, name, address, default_reason, use_count, last_used_at)
         VALUES (?, ?, ?, ?, 1, NOW())`,
        [agencyId, nameTrimmed, addressVal, reasonVal]
      );
      return result?.insertId || null;
    } catch (e) {
      if (e.message && /Unknown column 'default_reason'/.test(e.message)) {
        const [result] = await pool.execute(
          `INSERT INTO company_car_usual_places (agency_id, name, address, use_count, last_used_at)
           VALUES (?, ?, ?, 1, NOW())`,
          [agencyId, nameTrimmed, addressVal]
        );
        return result?.insertId || null;
      }
      throw e;
    }
  }

  static async upsertMany({ agencyId, names }) {
    const results = [];
    const arr = Array.isArray(names) ? names : [names];
    for (const n of arr) {
      const nameTrimmed = String(n || '').trim();
      if (nameTrimmed) {
        const id = await this.upsertAndIncrement({ agencyId, name: nameTrimmed });
        if (id) results.push({ name: nameTrimmed, id });
      }
    }
    return results;
  }
}

export default CompanyCarUsualPlace;
