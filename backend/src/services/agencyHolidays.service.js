import pool from '../config/database.js';

function normalizeHolidayName(v) {
  const s = String(v || '').trim();
  return s.slice(0, 128);
}

function normalizeYmd(v) {
  const s = String(v || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export async function listAgencyHolidays({ agencyId }) {
  const [rows] = await pool.execute(
    `SELECT id, agency_id, holiday_date, name, created_at, updated_at
     FROM agency_holidays
     WHERE agency_id = ?
     ORDER BY holiday_date ASC, id ASC`,
    [agencyId]
  );
  return rows || [];
}

export async function findAgencyHolidayById({ id }) {
  const [rows] = await pool.execute(
    `SELECT id, agency_id, holiday_date, name, created_at, updated_at
     FROM agency_holidays
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows?.[0] || null;
}

export async function createAgencyHoliday({ agencyId, holidayDate, name }) {
  const ymd = normalizeYmd(holidayDate);
  if (!ymd) {
    const e = new Error('holidayDate must be YYYY-MM-DD');
    e.status = 400;
    throw e;
  }
  const nm = normalizeHolidayName(name);
  if (!nm) {
    const e = new Error('name is required');
    e.status = 400;
    throw e;
  }

  // Idempotent: upsert by (agency_id, holiday_date)
  await pool.execute(
    `INSERT INTO agency_holidays (agency_id, holiday_date, name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       updated_at = CURRENT_TIMESTAMP`,
    [agencyId, ymd, nm]
  );

  // Return the row
  const [rows] = await pool.execute(
    `SELECT id, agency_id, holiday_date, name, created_at, updated_at
     FROM agency_holidays
     WHERE agency_id = ?
       AND holiday_date = ?
     LIMIT 1`,
    [agencyId, ymd]
  );
  return rows?.[0] || null;
}

export async function deleteAgencyHolidayById({ id }) {
  const [result] = await pool.execute(
    `DELETE FROM agency_holidays
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return result?.affectedRows || 0;
}

