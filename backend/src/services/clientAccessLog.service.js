import pool from '../config/database.js';

function normalizeIp(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;

  // If proxy included multiple values, caller should already have picked first,
  // but defensively handle it here too.
  const first = s.split(',')[0].trim();

  // Strip IPv4-mapped IPv6 prefix.
  const unmapped = first.startsWith('::ffff:') ? first.slice('::ffff:'.length) : first;

  // Strip IPv4 ":port" suffix (common from some proxies).
  const m = unmapped.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (m) return m[1];

  return unmapped;
}

function bestEffortIp(req) {
  const xf = req.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return normalizeIp(xf);
  return normalizeIp(req.ip) || null;
}

export async function logClientAccess(req, clientId, action) {
  try {
    const cid = parseInt(clientId, 10);
    const uid = parseInt(req.user?.id, 10);
    if (!cid || !uid || !action) return;

    const role = req.user?.role ? String(req.user.role) : null;
    const route = req.originalUrl ? String(req.originalUrl).slice(0, 255) : null;
    const method = req.method ? String(req.method).slice(0, 16) : null;
    const ip = bestEffortIp(req);
    const ua = req.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 255) : null;

    await pool.execute(
      `INSERT INTO client_access_logs
        (client_id, user_id, user_role, action, route, method, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid, uid, role, String(action).slice(0, 64), route, method, ip, ua]
    );
  } catch {
    // Best-effort only (table may not exist yet).
  }
}

