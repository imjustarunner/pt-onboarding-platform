import pool from '../config/database.js';

/** Read recorded client choices; age or a missing parent email is not an opt-out. */
export async function guardianClientPrivacy({ clientId, guardianUserId }, db = pool) {
  const [[row]] = await db.execute(`SELECT
    EXISTS(SELECT 1 FROM client_portal_independence i WHERE i.client_id=? AND i.status IN ('requested','active')) AS independent_client,
    (SELECT e.action FROM guardian_clinical_access_events e WHERE e.client_id=? AND e.guardian_user_id=?
      AND e.action IN ('client_restriction_requested','grant_reviewed') ORDER BY e.id DESC LIMIT 1) AS latest_clinical_choice`,
  [Number(clientId), Number(clientId), Number(guardianUserId)]);
  return Number(row?.independent_client) === 1 || row?.latest_clinical_choice === 'client_restriction_requested';
}
