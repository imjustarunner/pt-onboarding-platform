const keyFor = id => `supervision-personal-access:${Number(id)}`;
const memory = new Map();

export function saveSupervisionAccess(access) {
  if (!Number(access?.sessionId) || !access?.token || !Number(access.expiresAt)) throw new Error('Invalid supervision invitation response.');
  memory.set(Number(access.sessionId), access);
  try { sessionStorage.setItem(keyFor(access.sessionId), JSON.stringify(access)); } catch { /* This tab can still join. */ }
}

export function supervisionAccessFor(sessionId) {
  const id = Number(sessionId);
  let access = memory.get(id);
  if (!access) {
    try { access = JSON.parse(sessionStorage.getItem(keyFor(id)) || 'null'); } catch { return null; }
  }
  if (!access?.token || Number(access.sessionId) !== id || Number(access.expiresAt) <= Date.now()) {
    memory.delete(id);
    try { sessionStorage.removeItem(keyFor(id)); } catch { /* storage unavailable */ }
    return null;
  }
  return access;
}

export function attachSupervisionAccess(config) {
  // Only relative session API calls receive this credential, never external URLs.
  const match = /^\/supervision\/sessions\/(\d+)(?:\/|$)/.exec(String(config.url || ''));
  let sessionId = match?.[1];
  const url = String(config.url || '');
  if (url === '/meeting-agendas') {
    const input = String(config.method || 'get').toLowerCase() === 'get' ? config.params : config.data;
    if (input?.meetingType === 'supervision_session') sessionId = input.meetingId;
  } else if (/^\/meeting-agendas\/\d+\/items(?:\/\d+|\/bulk)?$/.test(url) || /^\/supervision\/presentation-slides\/\d+$/.test(url)) {
    sessionId = /\/join\/supervision\/(\d+)\/?$/.exec(window.location.pathname)?.[1];
  }
  const access = sessionId && supervisionAccessFor(sessionId);
  if (access) {
    config.headers ||= {};
    config.headers['X-Supervision-Access'] = access.token;
    config.skipAuthRedirect = true;
  }
  return config;
}
