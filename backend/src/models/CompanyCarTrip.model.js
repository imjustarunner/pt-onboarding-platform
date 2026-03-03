import pool from '../config/database.js';

class CompanyCarTrip {
  static async create({
    agencyId,
    companyCarId,
    userId,
    driveDate,
    startOdometerMiles,
    endOdometerMiles,
    miles: milesOverride = null,
    destinations = [],
    reasonForTravel,
    notes = null
  }) {
    const miles = Number.isFinite(Number(milesOverride)) && Number(milesOverride) >= 0
      ? Math.round(Number(milesOverride) * 100) / 100
      : Math.max(0, Number(endOdometerMiles || 0) - Number(startOdometerMiles || 0));
    const destinationsJson = Array.isArray(destinations) && destinations.length > 0
      ? JSON.stringify(destinations.map((d) => String(d || '').trim()).filter(Boolean))
      : null;

    const [result] = await pool.execute(
      `INSERT INTO company_car_trips
       (agency_id, company_car_id, user_id, drive_date, start_odometer_miles, end_odometer_miles, miles, destinations_json, reason_for_travel, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        companyCarId,
        userId,
        driveDate,
        Number(startOdometerMiles) || 0,
        Number(endOdometerMiles) || 0,
        miles,
        destinationsJson,
        String(reasonForTravel || '').trim().slice(0, 255),
        notes ? String(notes).trim().slice(0, 65535) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT t.*,
              u.first_name AS user_first_name,
              u.last_name AS user_last_name,
              u.email AS user_email,
              c.name AS company_car_name
       FROM company_car_trips t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN company_cars c ON c.id = t.company_car_id
       WHERE t.id = ?
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  }

  static async list({ agencyId, companyCarId = null, userId = null, fromDate = null, toDate = null, limit = 200, offset = 0 }) {
    const lim = Math.max(1, Math.min(500, Number(limit || 200)));
    const off = Math.max(0, Number(offset || 0));
    const params = [agencyId];
    const conditions = ['t.agency_id = ?'];

    if (companyCarId) {
      conditions.push('t.company_car_id = ?');
      params.push(companyCarId);
    }
    if (userId) {
      conditions.push('t.user_id = ?');
      params.push(userId);
    }
    if (fromDate) {
      conditions.push('t.drive_date >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push('t.drive_date <= ?');
      params.push(toDate);
    }

    params.push(lim, off);

    const [rows] = await pool.execute(
      `SELECT t.*,
              u.first_name AS user_first_name,
              u.last_name AS user_last_name,
              u.email AS user_email,
              c.name AS company_car_name
       FROM company_car_trips t
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN company_cars c ON c.id = t.company_car_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.drive_date DESC, t.id DESC
       LIMIT ? OFFSET ?`,
      params
    );
    return rows || [];
  }

  static async getTotalMiles({ agencyId, companyCarId = null, userId = null, fromDate = null, toDate = null }) {
    const params = [agencyId];
    const conditions = ['agency_id = ?'];
    if (companyCarId) {
      conditions.push('company_car_id = ?');
      params.push(companyCarId);
    }
    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    }
    if (fromDate) {
      conditions.push('drive_date >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push('drive_date <= ?');
      params.push(toDate);
    }

    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(miles), 0) AS total_miles
       FROM company_car_trips
       WHERE ${conditions.join(' AND ')}`,
      params
    );
    return Number(rows?.[0]?.total_miles || 0);
  }

  static async deleteById({ id, agencyId }) {
    const [result] = await pool.execute(
      `DELETE FROM company_car_trips WHERE id = ? AND agency_id = ? LIMIT 1`,
      [id, agencyId]
    );
    return (result?.affectedRows || 0) > 0;
  }
}

export default CompanyCarTrip;
