import crypto from 'node:crypto';
import pool from '../config/database.js';
import { validateEvidenceProxyConfig } from '../utils/securityEvidence.js';

const pending = new Set();
export async function flushSecurityEvidence() {
  while (pending.size) await Promise.allSettled([...pending]);
}

export async function assertEvidenceStorage() {
  validateEvidenceProxyConfig();
  // Fixed labels and migration IDs only: diagnostics must never expose SQL values.
  const probes = [
    ['security_evidence', '1456', 'event_id, request_id, phase, ip_source, response_bytes, details'],
    ['account_email_challenges', '1463', 'challenge_id,session_key,recipient_hash,code_hash,expires_at,delivery_state,failed_attempts'],
    ['account_email_sessions', '1463', 'session_key,user_id,recipient_hash,verified_at'],
    ['user_auth_revocations', '1456', 'user_id, reject_issued_before'],
    ['privacy_reviewers', '1459', 'user_id,assigned_by,revoked_at'],
    ['activity_protection_state', '1459', 'user_id,kind,held_at'],
    ['activity_protection_usage', '1459', 'resource_ref,units,ticket_id'],
    ['activity_protection_alerts', '1459', 'request_id,reason,reviewed_at'],
    ['activity_protection_tickets', '1459', 'session_ref,allowed_units,used_units'],
    ['auth_attempt_windows', '1459', 'bucket_key,attempts,expires_at'],
    ['users', '667', 'failed_login_attempts,locked_until'],
    ['auth_session_security', '1452,1458', 'session_ref,started_at,client_ip,ip_source,user_agent,end_reason'],
    ['account_mfa', '1458', 'enabled_at,factor_version,pending_cipher'],
    ['account_mfa_devices', '1458', 'token_hash,expires_at,revoked_at'],
    ['account_mfa_sessions', '1458', 'session_key,verified_at']
  ];
  for (const [component, requiredMigration, columns] of probes) {
    try { await pool.execute(`SELECT ${columns} FROM ${component} LIMIT 0`); }
    catch (error) {
      throw Object.assign(new Error(`Security storage check failed: ${component}. Check database selection, permissions, and migration ${requiredMigration}.`), {
        code: error.code || 'SECURITY_STORAGE_UNAVAILABLE', component, requiredMigration
      });
    }
  }
  if (Buffer.from(process.env.MFA_ENCRYPTION_KEY_BASE64 || '', 'base64').length !== 32) {
    throw Object.assign(new Error('MFA_ENCRYPTION_KEY_BASE64 must be configured with a dedicated 32-byte secret before rollout'), {
      code: 'MFA_KEY_NOT_CONFIGURED', component: 'MFA_ENCRYPTION_KEY_BASE64'
    });
  }
  const [triggers] = await pool.execute(`SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING
    FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = 'security_evidence'`);
  for (const [name, action] of [['security_evidence_no_update', 'UPDATE'], ['security_evidence_no_delete', 'DELETE']]) {
    if (!triggers.some(trigger => trigger.TRIGGER_NAME === name && trigger.EVENT_MANIPULATION === action && trigger.ACTION_TIMING === 'BEFORE')) {
      throw Object.assign(new Error(`Required append-only evidence trigger is missing: ${name}`), {
        code: 'EVIDENCE_TRIGGER_MISSING', component: name, requiredMigration: '1456'
      });
    }
  }
}

export async function requireSecurityReadiness() {
  try { await assertEvidenceStorage(); }
  catch (error) {
    evidenceFailure(error, null, 'startup');
    throw error;
  }
}

export async function appendSecurityEvidence(event, db = pool, { mirror = true } = {}) {
  const id = crypto.randomUUID();
  const write = db.execute(`INSERT INTO security_evidence
    (occurred_at, event_id, request_id, phase, user_id, actor_email, actor_role, session_ref,
     method, route, client_ip, ip_source, peer_ip, forwarded_ips, user_agent,
     action, outcome, status_code, response_bytes, duration_ms, details, build_id)
    VALUES (UTC_TIMESTAMP(3), ${Array(21).fill('?').join(',')})`, [
    id, event.requestId, event.phase, event.userId || null, event.email || null, event.role || null, event.sessionRef || null,
    event.method, event.route, event.clientIp, event.ipSource, event.peerIp, JSON.stringify(event.forwardedIps || []), event.userAgent || null,
    event.action, event.outcome, event.statusCode ?? null, event.responseBytes ?? null, event.durationMs ?? null,
    JSON.stringify(event.details || {}), String(process.env.APP_BUILD_ID || process.env.K_REVISION || 'local').slice(0, 128)
  ]);
  pending.add(write);
  try { await write; } finally { pending.delete(write); }
  // A second, structured copy supports independently retained cloud log sinks.
  // Logging configuration/retention is an explicit deployment gate, not a claim
  // that application database rows alone are tamper-proof.
  if (mirror) mirrorSecurityEvidence(event, id);
  return id;
}

export function mirrorSecurityEvidence(event, id) {
  console.info(JSON.stringify({ severity: 'NOTICE', type: 'security_evidence', eventId: id, at: new Date().toISOString(), ...event }));
}

export function evidenceFailure(error, requestId, phase) {
  // SQL errors may contain bound values: log codes only.
  console.error(JSON.stringify({ severity: 'CRITICAL', type: 'security_evidence_failure', requestId, phase, code: error?.code || 'AUDIT_WRITE_FAILED',
    ...(phase === 'startup' && error?.component ? { component: error.component, requiredMigration: error.requiredMigration } : {}),
    ...(phase === 'received' ? { component: 'security_evidence', requiredMigration: '1456' } : {})
  }));
}
