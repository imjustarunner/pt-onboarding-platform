import pool from '../config/database.js';

class OfficeLocationAgency {
  static async add({ officeLocationId, agencyId }) {
    await pool.execute(
      `INSERT IGNORE INTO office_location_agencies (office_location_id, agency_id)
       VALUES (?, ?)`,
      [officeLocationId, agencyId]
    );
    return true;
  }

  static async remove({ officeLocationId, agencyId }) {
    const [result] = await pool.execute(
      `DELETE FROM office_location_agencies WHERE office_location_id = ? AND agency_id = ?`,
      [officeLocationId, agencyId]
    );
    return result.affectedRows > 0;
  }

  static async listAgenciesForOffice(officeLocationId) {
    const [rows] = await pool.execute(
      `SELECT a.*
       FROM office_location_agencies ola
       JOIN agencies a ON a.id = ola.agency_id
       WHERE ola.office_location_id = ?
       ORDER BY a.name ASC`,
      [officeLocationId]
    );
    return rows || [];
  }

  static async userHasAccess({ officeLocationId, agencyIds }) {
    const ids = (agencyIds || [])
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!officeLocationId || ids.length === 0) return false;

    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT 1
       FROM office_location_agencies
       WHERE office_location_id = ?
         AND agency_id IN (${placeholders})
       LIMIT 1`,
      [officeLocationId, ...ids]
    );
    return (rows || []).length > 0;
  }

  static async listOfficeIdsForAgencies(agencyIds) {
    const ids = (agencyIds || [])
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT DISTINCT office_location_id
       FROM office_location_agencies
       WHERE agency_id IN (${placeholders})
       ORDER BY office_location_id ASC`,
      ids
    );
    return (rows || []).map((r) => r.office_location_id);
  }
}

export default OfficeLocationAgency;

