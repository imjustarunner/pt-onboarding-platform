export const sessionStorageKey = (userId, sessionId) => `pt:session-security:${userId}:${sessionId || 'cookie'}`;

export function localSessionState(session, receivedAt = Date.now()) {
  if (!session || !Number.isFinite(session.serverNow) || !Number.isFinite(session.expiresAt)) return null;
  const offset = receivedAt - session.serverNow;
  return { ...session, lastActivityAt: session.lastActivityAt + offset, lockAt: session.lockAt + offset, expiresAt: session.expiresAt + offset };
}

export function phaseAt(session, now = Date.now()) {
  if (!session || session.phase === 'expired' || now >= session.expiresAt) return 'expired';
  if (session.phase === 'timedown' || now >= session.lockAt) return 'timedown';
  return 'active';
}

export function isNewerSession(incoming, current) {
  if (!current) return true;
  const nextVersion = incoming.activityVersion ?? incoming.lastActivityAt;
  const currentVersion = current.activityVersion ?? current.lastActivityAt;
  return nextVersion > currentVersion || (nextVersion === currentVersion && incoming.serverNow >= current.serverNow);
}
