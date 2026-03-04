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
    notes = null,
    importBatchId = null
  }) {
    const miles = Number.isFinite(Number(milesOverride)) && Number(milesOverride) >= 0
      ? Math.round(Number(milesOverride) * 100) / 100
      : Math.max(0, Number(endOdometerMiles || 0) - Number(startOdometerMiles || 0));
    const destinationsJson = Array.isArray(destinations) && destinations.length > 0
      ? JSON.stringify(destinations.map((d) => String(d || '').trim()).filter(Boolean))
      : null;

    const baseParams = [
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
    ];

    try {
      const [result] = await pool.execute(
        `INSERT INTO company_car_trips
         (agency_id, company_car_id, user_id, drive_date, start_odometer_miles, end_odometer_miles, miles, destinations_json, reason_for_travel, notes, import_batch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...baseParams, importBatchId || null]
      );
      return this.findById(result.insertId);
    } catch (e) {
      if (e.message && /Unknown column 'import_batch_id'/.test(e.message)) {
        const [result] = await pool.execute(
          `INSERT INTO company_car_trips
           (agency_id, company_car_id, user_id, drive_date, start_odometer_miles, end_odometer_miles, miles, destinations_json, reason_for_travel, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          baseParams
        );
        return this.findById(result.insertId);
      }
      throw e;
    }
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

    const limInt = Math.floor(lim);
    const offInt = Math.floor(off);

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
       LIMIT ${limInt} OFFSET ${offInt}`,
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

  static async update({
    id,
    agencyId,
    companyCarId,
    userId,
    driveDate,
    startOdometerMiles,
    endOdometerMiles,
    miles: milesOverride,
    destinations,
    reasonForTravel,
    notes
  }) {
    const existing = await this.findById(id);
    if (!existing || existing.agency_id !== agencyId) return null;

    const updates = [];
    const values = [];

    if (companyCarId !== undefined) {
      updates.push('company_car_id = ?');
      values.push(companyCarId);
    }
    if (userId !== undefined) {
      updates.push('user_id = ?');
      values.push(userId);
    }
    if (driveDate !== undefined) {
      updates.push('drive_date = ?');
      values.push(driveDate);
    }
    if (startOdometerMiles !== undefined) {
      updates.push('start_odometer_miles = ?');
      values.push(Number(startOdometerMiles) || 0);
    }
    if (endOdometerMiles !== undefined) {
      updates.push('end_odometer_miles = ?');
      values.push(Number(endOdometerMiles) || 0);
    }
    if (milesOverride !== undefined && Number.isFinite(Number(milesOverride))) {
      updates.push('miles = ?');
      values.push(Math.round(Number(milesOverride) * 100) / 100);
    } else if (startOdometerMiles !== undefined || endOdometerMiles !== undefined) {
      const start = startOdometerMiles !== undefined ? Number(startOdometerMiles) || 0 : existing.start_odometer_miles;
      const end = endOdometerMiles !== undefined ? Number(endOdometerMiles) || 0 : existing.end_odometer_miles;
      updates.push('miles = ?');
      values.push(Math.max(0, end - start));
    }
    if (destinations !== undefined) {
      const destinationsJson = Array.isArray(destinations) && destinations.length > 0
        ? JSON.stringify(destinations.map((d) => String(d || '').trim()).filter(Boolean))
        : null;
      updates.push('destinations_json = ?');
      values.push(destinationsJson);
    }
    if (reasonForTravel !== undefined) {
      updates.push('reason_for_travel = ?');
      values.push(String(reasonForTravel || '').trim().slice(0, 255));
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes ? String(notes).trim().slice(0, 65535) : null);
    }

    if (updates.length === 0) return existing;
    values.push(id, agencyId);
    await pool.execute(
      `UPDATE company_car_trips SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`,
      values
    );
    return this.findById(id);
  }

  static async deleteById({ id, agencyId }) {
    const [result] = await pool.execute(
      `DELETE FROM company_car_trips WHERE id = ? AND agency_id = ? LIMIT 1`,
      [id, agencyId]
    );
    return (result?.affectedRows || 0) > 0;
  }

  static async deleteAllByAgency({ agencyId }) {
    const [result] = await pool.execute(
      `DELETE FROM company_car_trips WHERE agency_id = ?`,
      [agencyId]
    );
    return { deleted: result?.affectedRows || 0 };
  }

  static async recalculateMilesForAgency({ agencyId }) {
    const [result] = await pool.execute(
      `UPDATE company_car_trips
       SET miles = GREATEST(0, end_odometer_miles - start_odometer_miles)
       WHERE agency_id = ?
         AND (miles = 0 OR miles IS NULL)
         AND start_odometer_miles IS NOT NULL
         AND end_odometer_miles IS NOT NULL
         AND end_odometer_miles >= start_odometer_miles`,
      [agencyId]
    );
    return { updated: result?.affectedRows || 0 };
  }

  static async deleteByLastImportBatch({ agencyId }) {
    try {
      const [rows] = await pool.execute(
        `SELECT import_batch_id FROM company_car_trips
         WHERE agency_id = ? AND import_batch_id IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
        [agencyId]
      );
      const batchId = rows?.[0]?.import_batch_id;
      if (!batchId) return { deleted: 0 };
      const [result] = await pool.execute(
        `DELETE FROM company_car_trips WHERE agency_id = ? AND import_batch_id = ?`,
        [agencyId, batchId]
      );
      return { deleted: result?.affectedRows || 0 };
    } catch (e) {
      if (e.message && /Unknown column 'import_batch_id'/.test(e.message)) {
        return { deleted: 0 };
      }
      throw e;
    }
  }
}

export default CompanyCarTrip;
