import pool from '../config/database.js';

function bestEffortIp(req) {
  const xf = req.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0].trim();
  return req.ip || null;
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

