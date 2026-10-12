import { createHash } from 'node:crypto';

// A dismissal belongs to one verified login, including Google/cookie logins.
// Return a noncredential fingerprint rather than exposing session identifiers.
export function withToastLoginSession(rows, req) {
  const sessionId = req.user?.sessionId || req.authClaims?.sessionId;
  const key = sessionId && req.user?.id
    ? createHash('sha256').update(JSON.stringify(['office-toasts', req.user.id, sessionId])).digest('hex')
    : null;
  return rows.map(row => ({ ...row, login_session_key: key }));
}
