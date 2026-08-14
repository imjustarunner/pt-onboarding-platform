export const SECONDS_PER_CLIENT = 15;
export const LINK_TTL_HOURS = 24;
export const ACTION_TOKEN_BYTES = 16;
export const ACTION_TOKEN_MIN_PREFIX = 16;

/** Shared labels for the school client action packet (PDF, link page, admin panel). */
export const PROVIDER_ACTION_PACKET = {
  title: 'School client action packet',
  kicker: 'Confirm fall status & complete client steps',
  panelTitle: 'Send school client action packet',
  panelHint: 'PDF + 24h secure link',
  panelIntro:
    'Download a branded PDF or copy a secure link for each provider. They confirm fall status, finish new-client intake, and complete other quick steps — about 15 seconds per client, no Google sign-in. Links expire in 24 hours.',
  ctaLabel: 'Open my clients',
  ctaHint: 'Secure link · opens in your phone browser',
  filenameSuffix: 'school-client-actions'
};

export function providerActionDocumentTitle(agencyName, firstName) {
  const agency = String(agencyName || 'ITSCO').trim();
  const who = String(firstName || 'provider').trim();
  return `${agency} — school client actions for ${who}`;
}

/** Strip copy/paste junk (spaces, newlines, wrapping hyphens) from a token or pasted URL. */
export function normalizeActionToken(raw) {
  const s = String(raw || '').trim();
  const fromUrl = s.match(/\/(?:client-action|ca)\/([a-fA-F0-9]+)/i);
  const candidate = fromUrl ? fromUrl[1] : s;
  return candidate.replace(/[^a-fA-F0-9]/g, '');
}

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
  return `${safe}_${PROVIDER_ACTION_PACKET.filenameSuffix}.pdf`;
}
