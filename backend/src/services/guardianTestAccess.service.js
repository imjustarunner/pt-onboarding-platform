import pool from '../config/database.js';
export const isGuardianTestEmail = email => /^guardian-test-[a-z0-9-]+@example\.invalid$/i.test(String(email || ''));
export function guardianTestAccessAllowed(user, now = Date.now()) {
  return user?.role === 'client_guardian' && Number(user.is_demo) === 1 && Number(user.is_active) === 1
    && Number.isFinite(new Date(user.status_expires_at).getTime()) && new Date(user.status_expires_at).getTime() > now;
}
export async function requireUnexpiredGuardianTestAccess(req,res,next) {
  if (!isGuardianTestEmail(req.user?.email)) return next();
  try {
    const [[user]] = await pool.execute('SELECT role,is_demo,is_active,status_expires_at FROM users WHERE id=?',[req.user.id]);
    if (!guardianTestAccessAllowed(user)) return res.status(401).json({error:{code:'GUARDIAN_TEST_EXPIRED',message:'This guardian test access has expired. Ask for a new test link.'}});
    next();
  } catch (error) { next(error); }
}
