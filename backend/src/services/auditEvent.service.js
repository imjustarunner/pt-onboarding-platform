import UserActivityLog from '../models/UserActivityLog.model.js';

function normalizeIp(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  return s.split(',')[0].trim() || null;
}

function requestIp(req) {
  return normalizeIp(req?.headers?.['x-forwarded-for']) || normalizeIp(req?.ip) || null;
}

export async function logAuditEvent(req, { actionType, agencyId = null, metadata = null, userId = null } = {}) {
  if (!actionType) return;
  const uid = Number(userId || req?.user?.id || 0) || null;
  try {
    await UserActivityLog.logActivity({
      actionType: String(actionType).trim(),
      userId: uid,
      agencyId: agencyId ? Number(agencyId) : null,
      ipAddress: requestIp(req),
      userAgent: req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 255) : null,
      sessionId: req?.user?.sessionId || null,
      metadata: metadata || null
    });
  } catch (err) {
    // Best-effort logging; never throw, but surface the cause so a broken
    // audit pipeline is visible rather than silently swallowed (the original
    // symptom that left most action types missing from user_activity_log).
    console.warn('[auditEvent] logAuditEvent failed', {
      actionType,
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
      sqlMessage: err?.sqlMessage
    });
    if (
      Number(err?.errno) === 1265 &&
      String(err?.sqlMessage || err?.message || '').includes('action_type')
    ) {
      console.warn(
        '[auditEvent] user_activity_log.action_type rejected this value. ' +
          'Apply migration 738 (user_activity_log_action_type_varchar) on this database.'
      );
    }
  }
}

export default {
  logAuditEvent
};
