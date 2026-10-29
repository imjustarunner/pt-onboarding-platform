import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { assertHireStaffAccess } from './hireStaffAccess.service.js';

// Product authentication is separate from the shared clinical person ID. Do
// not infer permission from a JWT role, matching email, or a clinical identity.
export async function fullSuiteIdentityAllowed(userId, db = pool) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) return false;
  try {
    const [[row]] = await db.execute('SELECT identity_product,status FROM users WHERE id=?', [Number(userId)]);
    return row?.identity_product === 'full_suite' && row.status !== 'EHR_ONLY';
  } catch (error) {
    // Backward-compatible deployment before migration 1511: no EHR-only user
    // can be created without this column. Database failures never allow access.
    if (error.code === 'ER_BAD_FIELD_ERROR' && String(error.message).includes('identity_product')) {
      const [[row]] = await db.execute('SELECT status FROM users WHERE id=?', [Number(userId)]);
      return !!row && row.status !== 'EHR_ONLY';
    }
    throw error;
  }
}
export async function assertFullSuiteIdentity(userId, db = pool) {
  if (!(await fullSuiteIdentityAllowed(userId, db)))
    throw Object.assign(new Error('Use the sign-in for your account product.'), { status: 403, code: 'PRODUCT_SESSION_MISMATCH' });
}
export async function assertFullSuitePrincipal(claims, db = pool) {
  if (claims?.product && claims.product !== 'full_suite')
    throw Object.assign(new Error('This session cannot access the full suite.'), { status: 403, code: 'PRODUCT_SESSION_MISMATCH' });
  if (claims?.id != null) await assertFullSuiteIdentity(claims.id, db);
}
export async function signFullSuiteToken(claims, secret, options) {
  await assertFullSuitePrincipal(claims);
  await assertHireStaffAccess(claims);
  return jwt.sign(claims, secret, options);
}
