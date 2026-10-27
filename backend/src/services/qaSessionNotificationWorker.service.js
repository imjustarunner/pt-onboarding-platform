import pool from '../config/database.js';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';
import { processDueSessionNotifications } from './sessionNotification.service.js';

// Deliberately bounded to the synthetic tenant. A production rollout is separate.
export async function runQaSessionNotificationTick() {
  const [[agency]] = await pool.execute('SELECT id,slug,feature_flags,is_active,is_archived FROM agencies WHERE id=450');
  if (!isAuricwellQaAgency(agency) || Number(agency.is_active) !== 1 || Number(agency.is_archived) === 1) return { skipped: true };
  const connection = await pool.getConnection();
  let acquired = false;
  try {
    const [[lock]] = await connection.execute("SELECT GET_LOCK('qa_session_notifications:450', 0) AS acquired");
    acquired = Number(lock?.acquired) === 1;
    if (!acquired) return { skipped: true, reason: 'another_worker' };
    return await processDueSessionNotifications({ agencyId: 450, limit: 50 });
  } finally {
    try { if (acquired) await connection.execute("SELECT RELEASE_LOCK('qa_session_notifications:450')"); }
    finally { connection.release(); }
  }
}
