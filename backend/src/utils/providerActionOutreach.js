export const SECONDS_PER_CLIENT = 15;
export const LINK_TTL_HOURS = 24;

export function estimateSeconds(clientCount, secondsPerClient = SECONDS_PER_CLIENT) {
  const n = Math.max(0, Number(clientCount) || 0);
  const per = Math.max(1, Number(secondsPerClient) || SECONDS_PER_CLIENT);
  return n * per;
}

export function formatEstimateLabel(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 60) return `~ ${s}s`;
  const mins = Math.max(1, Math.round(s / 60));
  return `~ ${mins} min`;
}

export function formatActiveDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (mins < 60) return rem ? `${mins}m ${rem}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${hrs}h ${m}m` : `${hrs}h`;
}

export function pdfFilenameForProvider({ firstName, lastName } = {}) {
  const last = String(lastName || '').trim();
  const first = String(firstName || '').trim();
  const raw = [last, first].filter(Boolean).join('_') || 'provider';
  const safe = raw.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'provider';
  return `${safe}_client-action.pdf`;
}
