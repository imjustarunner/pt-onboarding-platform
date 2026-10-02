import pool from '../config/database.js';
import StorageService from './storage.service.js';
import { CLIENT_DOCUMENT_MAX_BYTES, CLIENT_DOCUMENT_MIME_TYPES, CLIENT_DOCUMENT_SIZE_MESSAGE } from '../utils/clientDocumentUpload.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

// Copy the stored email attachment inside storage; never download it to the
// staff member's browser. A ticket lock makes retries and double-clicks idempotent.
export async function fileTicketAttachment({ ticketId, attachmentId, clientId, user }) {
  if (!['admin', 'support', 'super_admin'].includes(user?.role)) throw fail(403, 'Only admin/support can add ticket files to client profiles.');
  if (![ticketId, attachmentId, clientId, user?.id].every(id => Number.isSafeInteger(id) && id > 0)) throw fail(400, 'Choose a ticket attachment and linked client.');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[ticket]] = await db.execute('SELECT id,agency_id,client_id FROM support_tickets WHERE id=? FOR UPDATE', [ticketId]);
    if (!ticket) throw fail(404, 'Ticket not found.');
    if (!ticket.client_id) throw fail(409, 'Link the ticket to a client before adding its files.');
    if (Number(ticket.client_id) !== clientId) throw fail(409, 'The linked client changed. Refresh the ticket before adding this file.');
    const [[client]] = await db.execute('SELECT id,agency_id,organization_id FROM clients WHERE id=?', [clientId]);
    if (!client) throw fail(404, 'Client not found.');
    if (!Number(ticket.agency_id) || Number(client.agency_id) !== Number(ticket.agency_id)) throw fail(403, 'The ticket and client must belong to the same agency.');
    if (user.role !== 'super_admin') {
      const [[membership]] = await db.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? LIMIT 1', [user.id, client.agency_id]);
      if (!membership) throw fail(403, 'Access denied to this client’s agency.');
    }
    const [[attachment]] = await db.execute('SELECT id,file_name,file_path,mime_type,file_size FROM support_ticket_attachments WHERE id=? AND ticket_id=?', [attachmentId, ticketId]);
    if (!attachment?.file_path) throw fail(404, 'Ticket attachment not found.');
    const originalMime = String(attachment.mime_type || '').toLowerCase();
    const mimeType = originalMime === 'application/x-pdf' || (['', 'application/octet-stream'].includes(originalMime) && /\.pdf$/i.test(attachment.file_name || '')) ? 'application/pdf' : originalMime;
    if (!CLIENT_DOCUMENT_MIME_TYPES.has(mimeType)) throw fail(400, 'Only PDF, JPG, and PNG files can be added to a client profile.');
    const storagePath = `phi-documents/${client.agency_id}/${clientId}/ticket-${ticketId}-attachment-${attachmentId}`;
    const [[existing]] = await db.execute('SELECT id,removed_at FROM client_phi_documents WHERE client_id=? AND storage_path=? LIMIT 1', [clientId, storagePath]);
    if (existing) {
      if (existing.removed_at) throw fail(409, 'This attachment was previously removed from the client profile. Contact an administrator before adding it again.');
      await db.commit();
      return { documentId: existing.id, clientId, alreadyAdded: true };
    }
    if (Number(attachment.file_size) > CLIENT_DOCUMENT_MAX_BYTES) throw fail(413, CLIENT_DOCUMENT_SIZE_MESSAGE);
    const bucket = await StorageService.getGCSBucket();
    const source = bucket.file(attachment.file_path);
    const [metadata] = await source.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isSafeInteger(size) || size <= 0) throw fail(400, 'The attachment is empty or unavailable.');
    if (size > CLIENT_DOCUMENT_MAX_BYTES) throw fail(413, CLIENT_DOCUMENT_SIZE_MESSAGE);
    const destination = bucket.file(storagePath);
    await source.copy(destination);
    await destination.setMetadata({ contentType: mimeType, metadata: { ticketId: String(ticketId), attachmentId: String(attachmentId), clientId: String(clientId), uploadedByUserId: String(user.id), source: 'ticket_attachment' } });
    const [insert] = await db.execute(
      'INSERT INTO client_phi_documents (client_id,agency_id,school_organization_id,storage_path,original_name,document_title,document_type,mime_type,uploaded_by_user_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [clientId, client.agency_id, client.organization_id || client.agency_id, storagePath, String(attachment.file_name || 'Ticket attachment').slice(0,255), String(attachment.file_name || 'Ticket attachment').slice(0,255), 'Registration packet', mimeType, user.id]
    );
    await db.execute(
      'INSERT INTO phi_document_audit_logs (document_id,client_id,action,actor_user_id,actor_label,metadata) VALUES (?,?,?,?,?,?)',
      [insert.insertId, clientId, 'uploaded', user.id, user.email || user.name || null, JSON.stringify({ source: 'ticket_attachment', ticketId, attachmentId })]
    );
    await db.execute("UPDATE clients SET document_status='UPLOADED' WHERE id=?", [clientId]);
    await db.commit();
    return { documentId: insert.insertId, clientId, alreadyAdded: false };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally { db.release(); }
}
