import crypto from 'node:crypto';
import pool from '../config/database.js';
import { appendSecurityEvidence, mirrorSecurityEvidence } from '../services/securityEvidence.service.js';
import { csvCell, networkEvidence, sessionReference, cleanIp } from '../utils/securityEvidence.js';

// Cross-organization evidence must never be exposed merely because the actor
// currently belongs to an administrator's agency. IT superadmins investigate it.
export async function requireEvidenceInvestigator(req, res, next) {
  try {
    if (req.user?.role !== 'super_admin' || req.user.demoMode || (req.user.effectiveRole && req.user.effectiveRole !== 'super_admin')) return res.status(403).json({ error: { message: 'Platform security administrator access required.' } });
    const [rows] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (rows[0]?.role !== 'super_admin') return res.status(403).json({ error: { message: 'Platform security administrator access required.' } });
    next();
  } catch (e) { next(e); }
}

export function evidenceFilters(query, now = Date.now()) {
  const end = query.end ? Date.parse(query.end) : now;
  const start = query.start ? Date.parse(query.start) : end - 7 * 86400000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 31 * 86400000) throw Object.assign(new Error('Choose a valid time range of no more than 31 days.'), { status: 400 });
  const sql = ['e.occurred_at >= ?', 'e.occurred_at < ?'];
  const params = [new Date(start), new Date(end)];
  // Terminal response evidence wins over a delayed append from work already in
  // flight. A late link-preparation row must not turn a completed request into
  // a false "missing completion" result.
  const supersedes = "((newer.phase='completed' AND e.phase<>'completed') OR (newer.id>e.id AND (e.phase<>'completed' OR newer.phase='completed')))";
  if (query.snapshot !== undefined) {
    if (!/^\d{1,20}$/.test(String(query.snapshot))) throw Object.assign(new Error('Invalid evidence snapshot.'), { status: 400 });
    sql.push('e.id <= ?'); params.push(String(query.snapshot));
    sql.push(`NOT EXISTS (SELECT 1 FROM security_evidence newer WHERE newer.request_id = e.request_id AND ${supersedes} AND newer.id <= ?)`); params.push(String(query.snapshot));
  } else sql.push(`NOT EXISTS (SELECT 1 FROM security_evidence newer WHERE newer.request_id = e.request_id AND ${supersedes})`);
  for (const [key, column, pattern] of [
    ['userId', 'user_id', /^\d{1,10}$/], ['ip', 'client_ip', /^[a-fA-F0-9:.]{2,45}$/],
    ['session', 'session_ref', /^[a-f0-9]{64}$/], ['request', 'request_id', /^[a-f0-9-]{36}$/],
    ['email', 'actor_email', /^[^\s@]{1,128}@[^\s@]{1,126}$/]
  ]) {
    if (!query[key]) continue;
    if (!pattern.test(String(query[key]))) throw Object.assign(new Error(`Invalid ${key} filter.`), { status: 400 });
    if (key === 'ip' && !cleanIp(query[key])) throw Object.assign(new Error('Invalid IP filter.'), { status: 400 });
    sql.push(`e.${column} = ?`); params.push(key === 'ip' ? cleanIp(query[key]) : String(query[key]));
  }
  if (query.kind === 'downloads') sql.push("(e.action IN ('file_response','file_metadata','download_link_issued') OR EXISTS (SELECT 1 FROM security_evidence grant_event WHERE grant_event.request_id=e.request_id AND grant_event.action='file_link_prepared' AND grant_event.id<=e.id))");
  if (query.kind === 'denied') sql.push("e.outcome = 'denied'");
  if (query.kind === 'incomplete') sql.push("e.phase <> 'completed' AND e.occurred_at < UTC_TIMESTAMP(3) - INTERVAL 2 MINUTE");
  if (query.kind === 'changes') sql.push("e.method IN ('POST','PUT','PATCH','DELETE')");
  if (query.before) {
    if (!/^\d{1,20}$/.test(String(query.before))) throw Object.assign(new Error('Invalid page cursor.'), { status: 400 });
    sql.push('e.id < ?'); params.push(String(query.before));
  }
  return { where: sql.join(' AND '), params, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

const read = async (query, limit) => {
  let snapshot = query.snapshot;
  if (snapshot === undefined) { const [rows] = await pool.execute('SELECT COALESCE(MAX(id),0) snapshot FROM security_evidence'); snapshot = String(rows[0]?.snapshot || 0); }
  const filters = evidenceFilters({ ...query, snapshot });
  const [rows] = await pool.execute(`SELECT e.* FROM security_evidence e WHERE ${filters.where} ORDER BY e.id DESC LIMIT ${limit + 1}`, filters.params);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit, snapshot, range: { start: filters.start, end: filters.end } };
};

export async function listEvidence(req, res, next) {
  try {
    const result = await read(req.query, 100);
    const [coverage] = await pool.execute('SELECT MIN(occurred_at) first_event, MAX(occurred_at) last_event FROM security_evidence');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ...result, nextCursor: result.hasMore ? String(result.items.at(-1).id) : null, coverage: coverage[0], proxyMode: process.env.AUDIT_PROXY_MODE || 'unverified', notice: 'This timeline records server activity, not the identity of a human. A file response does not prove a file was saved. Incomplete requests have no confirmed outcome. Earlier activity remains in the legacy audit tables.' });
  } catch (e) { next(e); }
}

export async function evidenceSignals(req, res, next) {
  try {
    // These are leads for an investigator, never an automatic claim of compromise.
    const [volume] = await pool.execute(`SELECT user_id, actor_email, client_ip, ip_source,
      FLOOR(UNIX_TIMESTAMP(occurred_at) / 900) window_id, COUNT(*) request_count,
      MIN(occurred_at) first_event, MAX(occurred_at) last_event
      FROM security_evidence WHERE occurred_at >= UTC_TIMESTAMP(3) - INTERVAL 24 HOUR
      AND phase = 'completed' AND action IN ('file_response','download_link_issued')
      AND outcome IN ('response_sent','issued') AND user_id IS NOT NULL
      GROUP BY user_id, actor_email, client_ip, ip_source, window_id HAVING COUNT(*) >= 25
      ORDER BY last_event DESC LIMIT 50`);
    const [incomplete] = await pool.execute(`SELECT COUNT(*) count FROM security_evidence e
      WHERE e.occurred_at >= UTC_TIMESTAMP(3) - INTERVAL 24 HOUR
      AND e.occurred_at < UTC_TIMESTAMP(3) - INTERVAL 2 MINUTE AND e.phase <> 'completed'
      AND NOT EXISTS (SELECT 1 FROM security_evidence done WHERE done.request_id=e.request_id AND done.phase='completed')
      AND NOT EXISTS (SELECT 1 FROM security_evidence newer WHERE newer.request_id=e.request_id AND newer.id>e.id)`);
    res.setHeader('Cache-Control','no-store');
    res.json({ highVolume: volume, incompleteRequests: Number(incomplete[0]?.count || 0), windowHours: 24, threshold: '25 successful file responses or link issuances in a fixed 15-minute window', interpretation: 'Review these leads with the account owner. Legitimate exports can trigger them; a quiet report does not clear an account.' });
  } catch (e) { next(e); }
}

export async function requestEvidence(req, res, next) {
  try {
    if (!/^[a-f0-9-]{36}$/.test(req.params.requestId)) return res.status(400).json({ error: { message: 'Invalid request ID.' } });
    const [items] = await pool.execute('SELECT * FROM security_evidence WHERE request_id = ? ORDER BY id', [req.params.requestId]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ items });
  } catch (e) { next(e); }
}

export async function exportEvidence(req, res, next) {
  try {
    const result = await read({ ...req.query, before: undefined }, 10000);
    if (result.hasMore) return res.status(422).json({ error: { message: 'More than 10,000 matching requests. Narrow the date range before exporting; no partial export was created.' } });
    // Preserve every stage for the matching requests, including identity changes
    // and incomplete attempts. A latest-row-only export loses incident evidence.
    let events = [];
    if (result.items.length) {
      const ids = result.items.map(row => row.request_id);
      [events] = await pool.execute(`SELECT * FROM security_evidence WHERE request_id IN (${ids.map(() => '?').join(',')}) AND id <= ? ORDER BY id LIMIT 100001`, [...ids, result.snapshot]);
      if (events.length > 100000) return res.status(422).json({ error: { message: 'More than 100,000 evidence stages. Narrow the date range; no partial export was created.' } });
    }
    const columns = ['event_id','request_id','occurred_at','user_id','actor_email','actor_role','session_ref','client_ip','ip_source','peer_ip','forwarded_ips','user_agent','method','route','action','outcome','phase','status_code','response_bytes','duration_ms','details','build_id'];
    const body = [columns.map(csvCell).join(','), ...events.map(row => columns.map(k => csvCell(row[k] instanceof Date ? row[k].toISOString() : typeof row[k] === 'object' && row[k] !== null ? JSON.stringify(row[k]) : row[k])).join(','))].join('\r\n');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="security-evidence.csv"');
    res.setHeader('X-Evidence-SHA256', crypto.createHash('sha256').update(body).digest('hex'));
    res.send(body);
  } catch (e) { next(e); }
}

export async function revokeUserSessions(req, res, next) {
  let connection;
  try {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0 || Number(req.body?.confirmUserId) !== userId) return res.status(400).json({ error: { message: 'Confirm the exact user ID to end their sessions.' } });
    if (userId === req.user.id) return res.status(400).json({ error: { message: 'Use another security administrator to revoke your own sessions.' } });
    const [users] = await pool.execute('SELECT id,email FROM users WHERE id = ?', [userId]);
    if (!users.length) return res.status(404).json({ error: { message: 'User not found.' } });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.execute(`INSERT INTO user_auth_revocations (user_id, reject_issued_before, revoked_at, revoked_by_user_id)
      VALUES (?, UNIX_TIMESTAMP() + 1, UTC_TIMESTAMP(3), ?)
      ON DUPLICATE KEY UPDATE reject_issued_before = VALUES(reject_issued_before), revoked_at = VALUES(revoked_at), revoked_by_user_id = VALUES(revoked_by_user_id)`, [userId, req.user.id]);
    const [result] = await connection.execute('UPDATE auth_session_security SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3)) WHERE user_id = ? AND revoked_at IS NULL', [userId]);
    await connection.execute('UPDATE quick_view_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL', [userId]);
    await connection.execute('UPDATE account_mfa_devices SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL', [userId]);
    await connection.execute('DELETE FROM account_mfa_sessions WHERE user_id = ?', [userId]);
    const event = { ...(req.evidenceContext || { requestId: crypto.randomUUID(), method: req.method, route: '/api/security-evidence/users/:userId/revoke', ...networkEvidence(req) }), phase: 'administrative_action', action: 'sessions_revoked', outcome: 'succeeded', userId: req.user.id, email: req.user.email, role: req.user.role, sessionRef: sessionReference(req.user.sessionId), details: { targetUserId: userId, revokedSessionRows: result.affectedRows } };
    const eventId = await appendSecurityEvidence(event, connection, { mirror: false });
    await connection.commit();
    mirrorSecurityEvidence(event, eventId);
    req.evidenceAction = 'sessions_revoked';
    res.json({ userId, email: users[0].email, revokedSessionRows: result.affectedRows, message: 'Existing app sign-ins have been revoked. The user can sign in again. This does not revoke Google sessions or download links already issued.' });
  } catch (e) { if (connection) await connection.rollback(); next(e); }
  finally { connection?.release(); }
}
