/**
 * Unified launcher for registry activities.
 * standalone → window.open games-content URL
 * embedded → caller (ActivityHost) handles session invite
 */

function gamesStaticOrigin() {
  const api = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return String(api).replace(/\/api\/?$/, '');
}

export function resolveStandaloneUrl(activity) {
  const entry = activity?.entryUrl || activity?.manifest?.entryUrl;
  if (!entry) return null;
  if (/^https?:\/\//i.test(entry)) return entry;
  const origin = gamesStaticOrigin();
  return `${origin}${entry.startsWith('/') ? entry : `/${entry}`}`;
}

export function launchActivity(activity, { mode } = {}) {
  const launchMode = mode || activity?.launchMode || activity?.manifest?.launchMode || 'embedded';
  if (launchMode === 'standalone' || launchMode === 'both') {
    const url = resolveStandaloneUrl(activity);
    if (!url) {
      console.warn('[launchActivity] No entry URL for', activity?.id);
      return { ok: false, reason: 'missing_entry_url' };
    }
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    return { ok: !!win, mode: 'standalone', url };
  }
  return { ok: true, mode: 'embedded', activityId: activity.id };
}

export function isStandaloneLaunchable(activity) {
  const mode = activity?.launchMode || activity?.manifest?.launchMode;
  return (mode === 'standalone' || mode === 'both') && !!resolveStandaloneUrl(activity);
}

export function isEmbeddedLaunchable(activity) {
  const mode = activity?.launchMode || activity?.manifest?.launchMode || 'embedded';
  const status = activity?.status;
  if (!['live_current', 'current_pilot'].includes(status)) return false;
  return mode === 'embedded' || mode === 'both';
}
