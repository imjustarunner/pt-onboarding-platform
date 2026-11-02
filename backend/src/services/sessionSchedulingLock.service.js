import pool from '../config/database.js';

// Booking and recipient preference changes share the same cross-instance lock.
export async function withSessionSchedulingLock(appointmentId, work, { db = pool } = {}) {
  const connection = await db.getConnection();
  const name = `session_schedule:${Number(appointmentId)}`;
  let acquired = false;
  try {
    const [[row]] = await connection.execute('SELECT GET_LOCK(?, 5) AS acquired', [name]);
    acquired = Number(row?.acquired) === 1;
    if (!acquired) throw Object.assign(new Error('Reminder scheduling is busy. Please retry.'), { status: 503 });
    return await work();
  } finally {
    try { if (acquired) await connection.execute('SELECT RELEASE_LOCK(?)', [name]); }
    finally { connection.release(); }
  }
}
