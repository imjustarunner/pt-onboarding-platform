import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { canReceiveGuardianConsentRequest } from './schoolRoiGuardianConsent.service.js';

/** Prepare all recipient-specific requests before any delivery. Unique keys make retries reuse them. */
export async function prepareGuardianConsentUpdates({ request, items, primaryGuardianUserId, db = pool, loadGuardians = id => ClientGuardian.listForClient(id) }) {
  const documents = items.filter(item => item.item_type === 'document');
  if (!documents.length) return null;
  const ids = documents.map(item => Number(item.reference_key)).filter(Boolean);
  if (!ids.length) return null;
  const [templates] = await db.execute(`SELECT id FROM document_templates WHERE id IN (${ids.map(() => '?').join(',')})
    AND (agency_id = ? OR agency_id IS NULL) AND document_type IN ('disclosure', 'school_roi', 'smart_school_roi')`, [...ids, request.agency_id]);
  const consentIds = new Set((templates || []).map(row => Number(row.id)));
  if (!consentIds.size) return null;
  const guardians = (await loadGuardians(request.client_id)).filter(canReceiveGuardianConsentRequest);
  if (!guardians.some(row => Number(row.guardian_user_id) === Number(primaryGuardianUserId))) throw Object.assign(new Error('Review the currently authorized portal contacts before sending.'), { status: 409 });
  const root = Number(request.guardian_request_group_id || request.id);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM client_update_requests WHERE id = ? FOR UPDATE', [root]);
    await connection.execute('UPDATE client_update_requests SET guardian_request_group_id = ?, guardian_user_id = COALESCE(guardian_user_id, ?) WHERE id = ?', [root, primaryGuardianUserId, root]);
    const prepared = [];
    for (const guardian of guardians) {
      const uid = Number(guardian.guardian_user_id);
      let [rows] = await connection.execute('SELECT * FROM client_update_requests WHERE guardian_request_group_id = ? AND guardian_user_id = ? LIMIT 1', [root, uid]);
      let recipientRequest = rows?.[0];
      if (!recipientRequest) {
        const [insert] = await connection.execute(`INSERT INTO client_update_requests
          (agency_id, client_id, status, created_by_user_id, guardian_user_id, guardian_request_group_id)
          VALUES (?, ?, 'draft', ?, ?, ?)`, [request.agency_id, request.client_id, request.created_by_user_id || null, uid, root]);
        recipientRequest = { id: insert.insertId, status: 'draft' };
        for (const item of documents.filter(item => consentIds.has(Number(item.reference_key)))) {
          await connection.execute('INSERT INTO client_update_items (request_id, item_type, reference_key, title) VALUES (?, ?, ?, ?)', [recipientRequest.id, 'document', item.reference_key, item.title]);
        }
      }
      prepared.push({ requestId: Number(recipientRequest.id), status: recipientRequest.status, guardianUserId: uid, email: guardian.email, name: [guardian.first_name, guardian.last_name].filter(Boolean).join(' ') });
    }
    await connection.commit();
    return prepared;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
