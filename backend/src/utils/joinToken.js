import crypto from 'crypto';

/** URL-safe opaque token for public join links (not sequential / guessable). */
export function generateJoinToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export function isNumericJoinRef(ref) {
  return /^\d+$/.test(String(ref || '').trim());
}

export function joinUrlForSupervision(frontendUrl, tokenOrId) {
  const base = String(frontendUrl || '').replace(/\/$/, '');
  const key = String(tokenOrId || '').trim();
  if (!base || !key) return null;
  return `${base}/join/supervision/${encodeURIComponent(key)}`;
}

export function joinUrlForTeamMeeting(frontendUrl, tokenOrId) {
  const base = String(frontendUrl || '').replace(/\/$/, '');
  const key = String(tokenOrId || '').trim();
  if (!base || !key) return null;
  return `${base}/join/team-meeting/${encodeURIComponent(key)}`;
}
