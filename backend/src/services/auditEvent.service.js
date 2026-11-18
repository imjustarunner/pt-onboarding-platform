import UserActivityLog from '../models/UserActivityLog.model.js';

import { networkEvidence } from '../utils/securityEvidence.js';

export async function logAuditEvent(req, { actionType, agencyId = null, metadata = null, userId = null, targetType = null, targetId = null, required = false } = {}) {
  if (!actionType) return;
  const uid = Number(userId || req?.user?.id || 0) || null;
  try {
    const event = await UserActivityLog.logActivity({
      actionType: String(actionType).trim(),
      userId: uid,
      agencyId: agencyId ? Number(agencyId) : null,
      ipAddress: (req?.evidenceContext || networkEvidence(req || {})).clientIp,
      userAgent: req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 255) : null,
      sessionId: req?.user?.sessionId || null,
      metadata: targetType || targetId != null
        ? { ...metadata, targetType, targetId }
        : metadata || null
    });
    if (required && !event?.id) throw new Error('Audit event was not retained.');
    return event;
  } catch (err) {
    if (required) throw Object.assign(new Error('The download audit could not be recorded. No file was released. Please retry.'), { status: 503, code: 'DOWNLOAD_AUDIT_UNAVAILABLE' });
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
