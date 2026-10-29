import pool from '../config/database.js';
import { requiresHireActivation, HIRE_ACTIVATION_MESSAGE } from '../utils/hirePortalToken.js';
import { assertAccountEnabled } from '../utils/accountAccess.js';

/** Also check existing sessions, so an old login cannot bypass activation. */
export async function assertHireStaffAccess(claims) {
  if (!claims?.id || claims.type === 'approved_employee') return;
  const [[user]] = await pool.execute(
    'SELECT status, is_active, is_archived, login_is_group_email, passwordless_token_purpose FROM users WHERE id = ? LIMIT 1',
    [claims.id]
  );
  assertAccountEnabled(user);
  if (claims.demoMode === true) return;
  if (requiresHireActivation(user)) throw Object.assign(new Error(HIRE_ACTIVATION_MESSAGE), {
    code: 'HIRE_ACTIVATION_REQUIRED', status: 403
  });
}
