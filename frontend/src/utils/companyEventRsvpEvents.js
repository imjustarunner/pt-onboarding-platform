const NAME = 'company-event-rsvp-changed';
const CHANNEL = 'pt-company-event-rsvp';
let channel;

function normalize(value) {
  const eventId = Number(value?.eventId);
  const response = String(value?.response || '').toLowerCase();
  if (!Number.isSafeInteger(eventId) || eventId <= 0 || !['yes', 'no', 'maybe'].includes(response)) return null;
  const agencyId = Number(value?.agencyId);
  return { eventId, agencyId: Number.isSafeInteger(agencyId) && agencyId > 0 ? agencyId : null, response };
}
function dispatch(detail) {
  if (typeof window === 'undefined' || !detail) return;
  window.dispatchEvent(new CustomEvent(NAME, { detail }));
  window.dispatchEvent(new CustomEvent('pt-schedule-refresh', { detail: { ...detail, reason: NAME } }));
}
function getChannel() {
  if (channel || typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return channel;
  try {
    channel = new window.BroadcastChannel(CHANNEL);
    channel.addEventListener('message', event => dispatch(normalize(event.data)));
  } catch { /* Same-window updates and refresh-on-focus remain available. */ }
  return channel;
}

// These messages invalidate visible state; each page still loads authorized
// event data from the server. They do not grant access or record an RSVP.
export function notifyCompanyEventRsvpChanged(value) {
  const detail = normalize(value);
  if (!detail) return;
  dispatch(detail);
  try { getChannel()?.postMessage(detail); } catch { /* Local updates were delivered. */ }
}
export function onCompanyEventRsvpChanged(listener) {
  if (typeof window === 'undefined') return () => {};
  const handler = event => { const detail = normalize(event.detail); if (detail) listener(detail); };
  getChannel();
  window.addEventListener(NAME, handler);
  return () => window.removeEventListener(NAME, handler);
}
