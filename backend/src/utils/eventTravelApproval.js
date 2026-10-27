import pool from '../config/database.js';

// Share the employee row lock with report submission, review, and attendance.
// A payroll approval calculated from an older review must not race a correction.
export async function withReviewedEventTravelClaim({ table, id, reviewedAt, dbPool = pool }, write) {
  if (!['payroll_time_claims', 'payroll_mileage_claims'].includes(table)) throw new Error('Invalid travel claim table');
  const db = await dbPool.getConnection();
  try {
    await db.beginTransaction();
    const [claims] = await db.execute(`SELECT user_id FROM ${table} WHERE id = ?`, [id]);
    if (!claims[0]) throw Object.assign(new Error('Claim not found'), { status: 404 });
    await db.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [claims[0].user_id]);
    const [reports] = await db.execute(`SELECT r.report_json, r.reviewed_at FROM company_event_travel_reports r
      JOIN ${table} c ON c.event_travel_report_id = r.id WHERE c.id = ? FOR UPDATE`, [id]);
    const raw = reports[0]?.report_json;
    const report = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!reports[0]?.reviewed_at || report?.reviewedAt !== reviewedAt) throw Object.assign(new Error('The travel report changed. Refresh and review it before approval.'), { status: 409 });
    const result = await write(db);
    await db.commit();
    return result;
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
