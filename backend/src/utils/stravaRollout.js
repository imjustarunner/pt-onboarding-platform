/**
 * Optional allowlist before Strava is enabled for all users.
 * Set STRAVA_ROLLOUT_ALLOWED_EMAILS to a comma-separated list (case-insensitive).
 * - If the variable is unset, all users may use Strava (legacy behavior).
 * - If set to an empty string or a list with no tokens, no one may use Strava.
 * To enable everyone after a pilot: remove STRAVA_ROLLOUT_ALLOWED_EMAILS from the environment.
 */
export function isStravaRolloutEnabledForEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  const raw = process.env.STRAVA_ROLLOUT_ALLOWED_EMAILS;
  if (raw === undefined) return true;
  const list = String(raw)
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;
  return list.includes(e);
}
