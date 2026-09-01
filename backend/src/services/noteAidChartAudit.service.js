import { logClientAccess } from './clientAccessLog.service.js';
import { logAuditEvent } from './auditEvent.service.js';

/**
 * Record Note Aid / chart documentation events on the client audit trail
 * (client_access_logs) and the platform activity log.
 */
export async function logNoteAidChartEvent(req, {
  clientId = null,
  agencyId = null,
  action,
  metadata = null
} = {}) {
  const act = String(action || '').trim();
  if (!act) return;
  if (clientId) {
    await logClientAccess(req, clientId, act);
  }
  await logAuditEvent(req, {
    actionType: act,
    agencyId: agencyId || null,
    metadata: {
      clientId: clientId ? Number(clientId) : null,
      ...(metadata && typeof metadata === 'object' ? metadata : {})
    }
  });
}

export default { logNoteAidChartEvent };
