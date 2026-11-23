import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { faxPdf } from './auricwell/faxPolicy.js';
import { notifyreRequest } from './auricwell/sessionTransports.js';
import { faxReferralRoutes, classifyFaxReferral } from './faxReferralPolicy.js';
import DocumentEncryptionService from './documentEncryption.service.js';
import { readFax } from './faxExtraction.service.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status, safe: true });
const aad = row => `inbound-fax:${row.agency_id}:${row.id}`;
const maxAttempts = 5;

export async function enqueueFaxReferral(event, agencySlug) {
  const [[agency]] = await pool.execute(`SELECT id FROM agencies WHERE LOWER(slug) = ? AND organization_type = 'agency'
    AND is_active = 1 AND COALESCE(is_archived,0) = 0`, [agencySlug]);
  if (!agency) throw fail('Fax intake agency is unavailable.');
  await pool.execute(`INSERT INTO fax_referral_inbox (id, agency_id, receiving_number, carrier_receipt)
    VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`, [randomUUID(), agency.id, event.to, event.carrierId]);
  return { accepted: true };
}

async function createTicket(db, row) {
  const [ticket] = await db.execute(`INSERT INTO support_tickets
    (agency_id, school_organization_id, created_by_user_id, created_by_source_key, source_channel, target_scope, subject, question, status)
    VALUES (?, ?, NULL, 'fax_referral', 'fax', 'tenant', 'Incoming fax referral',
      'Review the original fax in Intake to confirm the client and the referring organization.', 'open')`, [row.agency_id, row.agency_id]);
  return ticket.insertId;
}

async function transaction(action) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const result = await action(db);
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

async function processReceipt(row, { transport, ocr }) {
  const token = randomUUID();
  const [claim] = await pool.execute(`UPDATE fax_referral_inbox
    SET lease_token = ?, retry_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)
    WHERE id = ? AND state = 'pending' AND retry_at <= UTC_TIMESTAMP()`, [token, row.id]);
  if (!claim.affectedRows) return;

  try {
    const result = await transport(process.env.NOTIFYRE_API_TOKEN,
      `/fax/received/${encodeURIComponent(row.carrier_receipt)}/download`);
    const pdf = await faxPdf(result?.Base64Str ?? result?.base64Str);
    const buffer = Buffer.from(pdf.base64, 'base64');
    let state = 'review', reason = 'scan_needs_review';
    try {
      const { pages } = await ocr(buffer);
      state = classifyFaxReferral(pages);
      reason = state === 'review' ? 'purpose_unclear' : null;
    } catch (error) {
      // A readable PDF can go to private review if OCR cannot interpret it.
      // Transient OCR/service failures use the same bounded retry as download.
      if (!error.safe) throw error;
    }
    const { encryptedBuffer, ...metadata } = await DocumentEncryptionService.encryptBuffer(buffer, { aad: aad(row) });
    await transaction(async db => {
      const [[current]] = await db.execute('SELECT state, lease_token FROM fax_referral_inbox WHERE id = ? FOR UPDATE', [row.id]);
      if (current?.state !== 'pending' || current.lease_token !== token) return;
      const ticketId = state === 'referral' ? await createTicket(db, row) : null;
      await db.execute(`UPDATE fax_referral_inbox
        SET state = ?, reason = ?, ticket_id = ?, payload_encrypted = ?, encryption_metadata = ?, lease_token = NULL
        WHERE id = ?`, [state, reason, ticketId, encryptedBuffer, JSON.stringify(metadata), row.id]);
    });
  } catch {
    const attempts = Number(row.attempts) + 1;
    await pool.execute(`UPDATE fax_referral_inbox SET attempts = ?, state = ?, reason = 'processing_failed',
      lease_token = NULL, retry_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
      WHERE id = ? AND state = 'pending' AND lease_token = ?`,
    [attempts, attempts >= maxAttempts ? 'review' : 'pending', Math.min(30, 2 ** attempts), row.id, token]);
  }
}

export async function runFaxReferralInbox({ transport = notifyreRequest, ocr = readFax } = {}) {
  const routes = faxReferralRoutes();
  if (!routes.size) return;
  const [rows] = await pool.execute(`SELECT f.id, f.agency_id, f.receiving_number, f.carrier_receipt, f.attempts, LOWER(a.slug) AS agency_slug
    FROM fax_referral_inbox f JOIN agencies a ON a.id = f.agency_id
    WHERE f.state = 'pending' AND f.retry_at <= UTC_TIMESTAMP() AND a.is_active = 1 AND COALESCE(a.is_archived,0) = 0
      AND f.receiving_number IN (${[...routes].map(() => '?').join(',')})
    ORDER BY retry_at LIMIT 5`, [...routes.keys()]);
  for (const row of rows) {
    if (row.agency_slug === routes.get(row.receiving_number)) await processReceipt(row, { transport, ocr });
  }
}

export async function listFaxReferralReview(agencyId) {
  const [rows] = await pool.execute(`SELECT id, state, reason, received_at, (payload_encrypted IS NOT NULL) AS has_document
    FROM fax_referral_inbox WHERE agency_id = ? AND state IN ('pending','review','filtered') ORDER BY received_at DESC LIMIT 100`, [agencyId]);
  return rows;
}

export async function getFaxReferral(agencyId, { id, ticketId, document = false, db = pool, lock = false }) {
  const fields = 'id, agency_id, state, reason, ticket_id, client_id, referral_entry_id, phi_document_id, (payload_encrypted IS NOT NULL) AS has_document';
  const [[row]] = await db.execute(`SELECT ${fields}${document ? ', payload_encrypted, encryption_metadata' : ''}
    FROM fax_referral_inbox WHERE agency_id = ? AND ${ticketId ? 'ticket_id' : 'id'} = ? ${lock ? 'FOR UPDATE' : ''}`, [agencyId, ticketId || id]);
  if (!row) throw fail('Fax not found.', 404);
  return row;
}

export async function readFaxReferralDocument(row) {
  if (!row.payload_encrypted) throw fail('The original fax is not available in the inbox.');
  const metadata = typeof row.encryption_metadata === 'string' ? JSON.parse(row.encryption_metadata) : row.encryption_metadata;
  return DocumentEncryptionService.decryptBuffer({ ...metadata, encryptedBuffer: row.payload_encrypted, aad: aad(row) });
}

export async function reviewFaxReferral({ agencyId, id, userId, action }) {
  if (!['referral', 'filtered', 'retry'].includes(action)) throw fail('Choose a fax review action.', 400);
  return transaction(async db => {
    const row = await getFaxReferral(agencyId, { id, db, lock: true });
    if (!['review','filtered'].includes(row.state)) throw fail('This fax has already been routed.');
    if (action === 'referral' && !row.has_document) throw fail('The original fax is needed before opening a ticket.');
    const state = action === 'retry' ? 'pending' : action;
    const ticketId = state === 'referral' ? await createTicket(db, row) : null;
    await db.execute(`UPDATE fax_referral_inbox SET state = ?, reason = NULL, ticket_id = ?, attempts = 0,
      retry_at = UTC_TIMESTAMP(), reviewed_by_user_id = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?`, [state, ticketId, userId, id]);
    return { state, ticketId };
  });
}

export async function recordFaxReferralLink(db, row, { clientId, entryId, documentId, userId }) {
  const [ticket] = await db.execute(`UPDATE support_tickets SET client_id = ?
    WHERE id = ? AND agency_id = ? AND (client_id IS NULL OR client_id = ?)`, [clientId, row.ticket_id, row.agency_id, clientId]);
  if (!ticket.affectedRows) throw fail('This ticket is already connected to a different client.');
  await db.execute(`UPDATE fax_referral_inbox SET state = 'linked', client_id = ?, referral_entry_id = ?, phi_document_id = ?,
    reviewed_by_user_id = ?, reviewed_at = UTC_TIMESTAMP(), payload_encrypted = NULL, encryption_metadata = NULL WHERE id = ?`,
  [clientId, entryId, documentId, userId, row.id]);
}
