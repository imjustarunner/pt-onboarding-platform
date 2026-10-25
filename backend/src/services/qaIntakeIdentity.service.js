import pool from '../config/database.js';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';

const fail = message => { throw Object.assign(new Error(message), {status:400}); };
export async function validateQaIntakeGuardian({agencyId,email}, db=pool) {
  if (Number(agencyId)!==450) return false;
  const [[agency]]=await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=?',[450]);
  if (!isAuricwellQaAgency(agency)) fail('The QA organization is not configured for synthetic intake.');
  const address=String(email||'').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._+-]*@example\.com$/.test(address)) {
    fail('Use a unique @example.com account for each QA family. testing@itsco.health receives redirected mail and must not be used as a guardian login.');
  }
  const [users]=await db.execute(`SELECT u.id,u.role,ua.agency_id FROM users u
    LEFT JOIN user_agencies ua ON ua.user_id=u.id WHERE LOWER(u.email)=?`,[address]);
  if (users.some(u=>!['client_guardian','client','guardian'].includes(u.role) || (u.agency_id!=null && Number(u.agency_id)!==450))) {
    fail('That account is not an isolated QA family. Choose a new @example.com identity.');
  }
  return true;
}

export async function markQaIntakeGuardian({agencyId,userId,email},db=pool) {
  if (!await validateQaIntakeGuardian({agencyId,email},db)) return;
  // Membership is created by the normal enrollment flow before this marker.
  await db.execute(`UPDATE users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=450 AND ua.is_active=1
    SET u.is_demo=1 WHERE u.id=? AND LOWER(u.email)=? AND u.role IN ('client_guardian','client','guardian')`,[userId,String(email).trim().toLowerCase()]);
}
