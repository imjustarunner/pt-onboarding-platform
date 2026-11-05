import pool from '../config/database.js';

// Chart rows name the screen or file that was opened. They never store message
// text, document contents, passwords, or query strings.
export function portalChartAction(route, method, evidenceAction) {
  const path = String(route || '');
  const writing = !['GET', 'HEAD'].includes(String(method || 'GET').toUpperCase());
  if (evidenceAction === 'login') return 'portal_sign_in';
  if (path.includes('/auth/')) return null;
  if (path.includes('download') || ['file_response', 'download_link_issued', 'file_link_prepared'].includes(evidenceAction)) return 'portal_document_opened';
  if (path.includes('intake-documents') || path.includes('enrollment-copies') || path.includes('shared-files') || path.includes('program-documents')) {
    return /\/(?:intake-documents|enrollment-copies|shared-files|program-documents)\/:/.test(path) ? 'portal_document_opened' : 'portal_documents_opened';
  }
  if (path.includes('/messages')) return writing ? 'portal_message_sent' : (path.includes('/messages/') ? 'portal_message_opened' : 'portal_messages_opened');
  if (path.includes('/emails')) return writing ? 'portal_email_sent' : (path.includes('/emails/') ? 'portal_email_opened' : 'portal_emails_opened');
  if (path.includes('appointments')) return 'portal_appointments_opened';
  if (path.includes('daily-notes') || path.includes('/details')) return writing ? 'portal_record_updated' : 'portal_record_opened';
  if (path.includes('balances')) return 'portal_balances_opened';
  if (path.includes('/clients/')) return writing ? 'portal_record_updated' : 'portal_record_opened';
  return null;
}

export function clientIdFromEvidence(event) {
  const route = String(event?.route || '');
  const details = event?.details && typeof event.details === 'object' ? event.details : {};
  const clientId = Number(details.clientId);
  if (/\/clients\/:clientId\b/.test(route) && Number.isInteger(clientId) && clientId > 0) return clientId;
  const id = Number(details.id);
  if (/\/clients\/:id\b/.test(route) && Number.isInteger(id) && id > 0) return id;
  return null;
}

export async function projectPortalChartAccess(event, { db = pool } = {}) {
  if (event?.phase !== 'completed' || !['succeeded', 'issued', 'response_sent'].includes(event.outcome)) return;
  const userId = Number(event.userId);
  const role = String(event.role || '');
  if (!userId || !['client', 'client_guardian'].includes(role)) return;
  const action = portalChartAction(event.route, event.method, event.action);
  if (!action) return;
  const route = String(event.route || '').slice(0, 255);
  const method = String(event.method || '').slice(0, 16);
  const ip = event.clientIp ? String(event.clientIp).slice(0, 64) : null;
  const ua = event.userAgent ? String(event.userAgent).slice(0, 255) : null;
  const write = (clientId, chartAction) => db.execute(
    `INSERT INTO client_access_logs
      (client_id, user_id, user_role, action, route, method, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [clientId, userId, role.slice(0, 64), chartAction, route, method, ip, ua]
  );
  if (action === 'portal_sign_in') {
    const [rows] = await db.execute(
      'SELECT client_id FROM client_guardians WHERE guardian_user_id=? AND access_enabled=1',
      [userId]
    );
    for (const row of rows) await write(Number(row.client_id), 'portal_sign_in');
    return;
  }
  const clientId = clientIdFromEvidence(event);
  if (clientId) await write(clientId, action);
}
