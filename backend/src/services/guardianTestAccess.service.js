import pool from '../config/database.js';
export const isGuardianTestEmail = email => /^guardian-test-[a-z0-9-]+@example\.(?:com|invalid)$/i.test(String(email || ''));
export const isGuardianTestAccount = user => user?.role === 'client_guardian'
  && Number(user.is_demo) === 1 && isGuardianTestEmail(user.email);
export async function isGuardianTestAccountId(userId, db = pool) {
  const [[user]] = await db.execute('SELECT email,role,is_demo FROM users WHERE id=?', [userId]);
  return isGuardianTestAccount(user);
}
// Fictional portal fixtures can display balances and cards, but must never reach
// a live payment gateway or financial outreach, even after their login expires.
export async function requireLiveGuardianBilling(userId, db = pool) {
  if (await isGuardianTestAccountId(userId, db)) throw Object.assign(
    new Error('This is a test guardian account. Live card setup, payments and billing notices are disabled.'),
    { status: 409, statusCode: 409, code: 'GUARDIAN_TEST_BILLING_DISABLED' }
  );
}
export function guardianTestAccessAllowed(user, now = Date.now()) {
  return user?.role === 'client_guardian' && Number(user.is_demo) === 1 && Number(user.is_active) === 1
    && Number.isFinite(new Date(user.status_expires_at).getTime()) && new Date(user.status_expires_at).getTime() > now;
}
export async function requireUnexpiredGuardianTestAccess(req,res,next) {
  if (req.user?.role !== 'client_guardian' && !isGuardianTestEmail(req.user?.email)) return next();
  try {
    const [[user]] = await pool.execute('SELECT email,role,is_demo,is_active,status_expires_at FROM users WHERE id=?',[req.user.id]);
    if (!isGuardianTestAccount(user) && !isGuardianTestEmail(req.user?.email)) return next();
    if (!guardianTestAccessAllowed(user)) return res.status(401).json({error:{code:'GUARDIAN_TEST_EXPIRED',message:'This guardian test access has expired. Ask for a new test link.'}});
    next();
  } catch (error) { next(error); }
}
