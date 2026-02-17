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
      actionType: String(actionType),
      userId: uid,
      agencyId: agencyId ? Number(agencyId) : null,
      ipAddress: requestIp(req),
      userAgent: req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 255) : null,
      sessionId: req?.user?.sessionId || null,
      metadata: metadata || null
    });
  } catch {
    // Best-effort logging only.
  }
}

export default {
  logAuditEvent
};
