import pool from '../config/database.js';

// Keep access to the supervisee's history after an assignment ends.
export async function hasClinicalSupervisionHistory(userId) {
  const [[row]] = await pool.execute(`SELECT
    (EXISTS(SELECT 1 FROM supervisor_assignments WHERE supervisee_id=?) OR
     EXISTS(SELECT 1 FROM supervision_sessions WHERE supervisee_user_id=?) OR
     EXISTS(SELECT 1 FROM supervision_session_attendees WHERE user_id=?) OR
     EXISTS(SELECT 1 FROM user_agencies WHERE user_id=? AND
       (supervision_start_date IS NOT NULL OR supervision_start_individual_hours>0 OR supervision_start_group_hours>0))) AS has_history`,
  [userId,userId,userId,userId]);
  return !!Number(row?.has_history);
}
