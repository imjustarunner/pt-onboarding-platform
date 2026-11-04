// Opt-in only. An unconfigured pilot must fail closed, never silently switch senders.
export const relayError = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
export const normalizeRelayAddress = value => String(value || '').trim().toLowerCase();
const list = value => String(value || '').split(',').map(normalizeRelayAddress).filter(Boolean);

export function relaySelected(address, env = process.env) {
  const mode = String(env.WORKSPACE_EMAIL_RELAY_MODE || 'off').trim();
  if (mode === 'off') return false;
  if (!['pilot', 'domains'].includes(mode)) throw relayError('EMAIL_RELAY_CONFIG', 'Invalid Workspace relay mode.');
  const from = normalizeRelayAddress(address);
  return mode === 'pilot'
    ? list(env.WORKSPACE_EMAIL_RELAY_SENDERS).includes(from)
    : list(env.WORKSPACE_EMAIL_RELAY_DOMAINS).includes(from.split('@')[1]);
}

export function relayConfiguration(env = process.env) {
  const domains = list(env.WORKSPACE_EMAIL_RELAY_DOMAINS);
  if (!domains.length || domains.some(d => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(d))) {
    throw relayError('EMAIL_RELAY_CONFIG', 'Configure the verified Workspace relay domains.');
  }
  let url;
  try { url = new URL(env.WORKSPACE_EMAIL_RELAY_URL); } catch { /* rejected below */ }
  if (!url || url.protocol !== 'https:' || !url.hostname.endsWith('.run.app') || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw relayError('EMAIL_RELAY_CONFIG', 'Configure the private Cloud Run Workspace relay URL.');
  }
  if (env.WORKSPACE_EMAIL_RELAY_ADMIN_CONFIRMED !== 'true') {
    throw relayError('EMAIL_RELAY_CONFIG', 'Workspace administrator relay setup and outbound IP verification are required.');
  }
  return { domains, url: url.origin };
}
