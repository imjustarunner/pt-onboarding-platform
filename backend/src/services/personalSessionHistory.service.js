import crypto from 'node:crypto';
import pool from '../config/database.js';
import { networkEvidence, sessionReference } from '../utils/securityEvidence.js';
import { loadSessionPolicy } from './sessionSecurity.service.js';
import { sessionSecurityState } from '../utils/sessionSecurityPolicy.js';

export async function recordAccountSession(user, req) {
  if (!user?.id || !user.sessionId || !Number.isFinite(user.iat) || !Number.isFinite(user.exp)) return;
  const key = crypto.createHash('sha256').update(`${user.id}:${user.sessionId}`).digest('hex');
  const network = networkEvidence(req);
  await pool.execute(`INSERT INTO auth_session_security
    (session_key,user_id,last_activity_at,absolute_expires_at,session_ref,started_at,client_ip,ip_source,user_agent)
    VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
    session_ref=COALESCE(session_ref,VALUES(session_ref)),started_at=COALESCE(started_at,VALUES(started_at)),
    client_ip=COALESCE(client_ip,VALUES(client_ip)),ip_source=COALESCE(ip_source,VALUES(ip_source)),user_agent=COALESCE(user_agent,VALUES(user_agent))`,
  [key, user.id, new Date(user.iat * 1000), user.exp * 1000, sessionReference(user.sessionId), new Date(user.iat * 1000), network.clientIp, network.ipSource, String(req.headers?.['user-agent'] || '').slice(0, 512)]);
}

export async function personalSessions(user, page = 0) {
  const offset = Math.max(0, Math.min(100000, Math.floor(Number(page) || 0))) * 50;
  const policy = await loadSessionPolicy(user);
  const [rows] = await pool.execute(`SELECT * FROM (
    SELECT CONVERT(s.session_ref USING ascii) COLLATE ascii_bin session_ref,s.started_at,s.last_activity_at,s.locked_at,s.absolute_expires_at,s.revoked_at,
      CONVERT(s.end_reason USING utf8mb4) COLLATE utf8mb4_unicode_ci end_reason,
      CONVERT(s.client_ip USING utf8mb4) COLLATE utf8mb4_unicode_ci client_ip,
      CONVERT(s.ip_source USING utf8mb4) COLLATE utf8mb4_unicode_ci ip_source,
      CONVERT(s.user_agent USING utf8mb4) COLLATE utf8mb4_unicode_ci user_agent,0 legacy
      FROM auth_session_security s WHERE s.user_id=? AND s.session_ref IS NOT NULL
    UNION ALL
    SELECT CONVERT(SHA2(l.session_id,256) USING ascii) COLLATE ascii_bin,l.started_at,l.last_heartbeat_at,NULL,NULL,l.ended_at,
      CONVERT(l.end_reason USING utf8mb4) COLLATE utf8mb4_unicode_ci,
      CONVERT(l.ip_address USING utf8mb4) COLLATE utf8mb4_unicode_ci,'legacy_unverified',
      CONVERT(l.user_agent USING utf8mb4) COLLATE utf8mb4_unicode_ci,1
      FROM user_platform_sessions l WHERE l.user_id=?
      AND NOT EXISTS (SELECT 1 FROM auth_session_security s WHERE s.user_id=l.user_id AND s.session_ref=SHA2(l.session_id,256))
    ) history ORDER BY started_at DESC,session_ref DESC LIMIT 51 OFFSET ${offset}`, [user.id, user.id]);
  return { hasMore: rows.length > 50, items: rows.slice(0, 50).map(row => {
    const state = row.legacy ? { phase: row.revoked_at ? 'expired' : 'unknown' } : sessionSecurityState(row, policy);
    return { reference: row.session_ref, current: row.session_ref === sessionReference(user.sessionId),
      startedAt: row.started_at, lastActivityAt: row.last_activity_at,
      endedAt: row.revoked_at || (state.phase === 'expired' ? new Date(state.expiresAt) : null),
      endReason: row.revoked_at ? row.end_reason || 'Session revoked' : state.phase === 'expired' ? 'Session deadline passed' : null,
      endInferred: !row.revoked_at && state.phase === 'expired' || row.end_reason === 'Session timed out', phase: state.phase,
      clientIp: row.client_ip, ipSource: row.ip_source, browser: row.user_agent };
  }) };
}
