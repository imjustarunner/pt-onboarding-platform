export function quickViewDeepLink(query = {}, deliveryPath = '') {
  let params = query;
  if (deliveryPath) {
    // Only interpret known destinations; never navigate to a supplied URL.
    try { const url = new URL(deliveryPath, 'https://qv.invalid'); params = { ...Object.fromEntries(url.searchParams), ...query }; if (url.pathname === '/quick-view-join') params.join ||= params.type; } catch { /* ignore malformed path */ }
  }
  const out = {};
  for (const key of ['conversationId', 'threadId']) {
    if (/^[1-9]\d*$/.test(String(params[key] || ''))) out[key] = String(params[key]);
  }
  if (['supervision', 'team-meeting'].includes(params.join) && /^[a-zA-Z0-9_-]+$/.test(String(params.id || ''))) {
    out.join = params.join; out.id = String(params.id);
  }
  return out;
}
