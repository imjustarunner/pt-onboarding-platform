import pool from '../config/database.js';
import User from '../models/User.model.js';
import { passwordRecoveryRequiresSupport } from './passwordRecoveryPolicy.service.js';
import { clientPortalInviteUrl, intakeClientPortal } from './clientPortalContext.service.js';

// Called only for a new receipt. No separate recovery email is generated.
export async function enrollmentReceiptPortalAction({ submission, agency, to, enrollmentChannel, schoolOrganizationId }, { db = null, users = User } = {}) {
  if (!submission.guardian_user_id || !submission.client_id) return {};
  const portal = intakeClientPortal(agency, { channel: enrollmentChannel, school: !!schoolOrganizationId });
  const login = { portalLoginUrl: clientPortalInviteUrl({ portal, existingAccount: true }), needsPasswordSetup: false };
  // Different sibling submissions may finalize together; reuse the same valid
  // link instead of making the first receipt unusable when the next one sends.
  const lock = `enrollment-setup:${Number(submission.guardian_user_id)}`;
  const connection = db || await pool.getConnection();
  let locked = false;
  try {
    const [[claim]] = await connection.execute('SELECT GET_LOCK(?,10) AS acquired', [lock]);
    if (!Number(claim?.acquired)) throw new Error('Portal setup is busy. Retry the enrollment receipt.');
    locked = true;
    const [[guardian]] = await connection.execute(`SELECT u.id,u.email,u.role,u.status,u.is_active,u.is_archived,u.pending_access_locked,
      u.identity_product,u.password_hash,u.passwordless_token,u.passwordless_token_purpose,u.passwordless_token_expires_at
      FROM users u JOIN client_guardians cg ON cg.guardian_user_id=u.id JOIN clients c ON c.id=cg.client_id
      WHERE u.id=? AND c.id=? AND c.agency_id=? AND cg.access_enabled=1 LIMIT 1`,
    [submission.guardian_user_id, submission.client_id, agency.id]);
    if (!guardian || !['client_guardian','guardian','client'].includes(guardian.role)
      || String(guardian.email || '').trim().toLowerCase() !== String(to || '').trim().toLowerCase()) return {};
    if (guardian.password_hash || passwordRecoveryRequiresSupport(guardian) || guardian.identity_product !== 'full_suite') return login;
    const usable = guardian.passwordless_token && ['setup','reset'].includes(guardian.passwordless_token_purpose)
      && new Date(guardian.passwordless_token_expires_at).getTime() > Date.now();
    const token = usable ? guardian.passwordless_token : (await users.generatePasswordlessToken(guardian.id, 48, 'setup', connection)).token;
    return { portalLoginUrl: clientPortalInviteUrl({ portal, token, existingAccount: false }), needsPasswordSetup: true };
  } finally {
    try { if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lock]); }
    finally { if (!db) connection.release(); }
  }
}
