import { randomBytes, randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import StorageService from './storage.service.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { requireCredentialingAccess, canAccessCredentialing } from './credentialingAccess.service.js';
import { ingestSupportTicketEmail } from './supportTicketEmailInbound.service.js';
import { decryptTicketMessageRow } from '../utils/supportTicketCrypto.js';
import { listTicketAttachments, getTicketAttachmentRow, readTicketAttachmentBuffer } from './unifiedEmail/ticketInboundAttachments.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const deps = { database: pool, storage: StorageService, authorize: requireCredentialingAccess };

export async function credentialingSubject(user, agencyId, kind, recordId, d = deps) {
  if (!positive(agencyId) || !positive(recordId) || !['payer', 'provider', 'group', 'provider_profile'].includes(kind))
    throw fail(400, 'Choose a valid credentialing record.');
  await d.authorize(user, Number(agencyId));
  const sources = {
    provider_profile: `SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.is_active=1 WHERE ua.agency_id=? AND u.id=? AND u.role IN ('provider','provider_plus','admin','super_admin','clinical_practice_assistant')`,
    payer: 'SELECT p.id,p.name FROM insurance_credentialing_definitions p WHERE p.agency_id=? AND p.id=?',
    provider: `SELECT c.id,c.user_id,c.welcome_letter_path,c.contract_path,p.id AS payerDefinitionId,p.name FROM user_insurance_credentialing c
      JOIN insurance_credentialing_definitions p ON p.id=c.insurance_credentialing_definition_id WHERE p.agency_id=? AND c.id=?`,
    group: `SELECT c.id,c.welcome_letter_path,c.contract_path,p.id AS payerDefinitionId,p.name FROM agency_group_npi_payer_credentialing c
      JOIN agency_group_npis g ON g.id=c.agency_group_npi_id
      JOIN insurance_credentialing_definitions p ON p.id=c.insurance_credentialing_definition_id AND p.agency_id=g.agency_id WHERE g.agency_id=? AND c.id=?`
  };
  const [[record]] = await d.database.execute(sources[kind], [Number(agencyId), Number(recordId)]);
  if (!record) throw fail(404, 'Credentialing record not found in this agency.');
  return record;
}

export async function readExistingCredentialDocument(user, agencyId, kind, recordId, type, d = deps) {
  if (!['provider', 'group'].includes(kind) || !['welcome_letter', 'contract'].includes(type)) throw fail(400, 'Choose a credential document.');
  const row = await credentialingSubject(user, agencyId, kind, recordId, d), path = row[`${type}_path`];
  if (!path) throw fail(404, 'Credential document not found.');
  await audit(d.database, user, agencyId, kind, recordId, { action: 'document.viewed', documentType: type });
  const fileName = path.split('/').pop(), extension = fileName.split('.').pop().toLowerCase();
  const mimeType = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[extension] || 'application/octet-stream';
  return { buffer: await d.storage.readObjectBuffer(path), mimeType, fileName };
}

export async function listPayerDocuments(user, agencyId, payerId, d = deps) {
  await credentialingSubject(user, agencyId, 'payer', payerId, d);
  const [items] = await d.database.execute(`SELECT id,document_type AS documentType,title,file_name AS fileName,
    mime_type AS mimeType,file_size AS fileSize,created_at AS createdAt FROM credentialing_payer_documents
    WHERE agency_id=? AND insurance_definition_id=? ORDER BY id DESC`, [agencyId, payerId]);
  return { items };
}

const fileTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export async function savePayerDocument(user, agencyId, payerId, input, file, d = deps) {
  await credentialingSubject(user, agencyId, 'payer', payerId, d);
  const title = String(input.title || '').trim();
  if (!title || title.length > 200 || !['fee_schedule', 'contract', 'welcome_letter', 'other'].includes(input.documentType))
    throw fail(400, 'Enter a document title and type.');
  if (!file?.buffer?.length || file.buffer.length > 12 * 1024 * 1024 || !fileTypes.has(file.mimetype))
    throw fail(400, 'Upload a PDF or image up to 12 MB.');
  // Encrypt before writing; no public plaintext object or signed storage URL exists.
  const encrypted = encryptChatText(file.buffer.toString('base64'));
  const stored = await d.storage.saveComplianceDocument(Buffer.from(JSON.stringify(encrypted)), `payer-document-${agencyId}-${randomUUID()}.enc`, 'application/octet-stream');
  let db;
  try {
    db = await d.database.getConnection();
    await db.beginTransaction();
    const [saved] = await db.execute(`INSERT INTO credentialing_payer_documents
      (agency_id,insurance_definition_id,document_type,title,file_name,mime_type,file_size,storage_path,uploaded_by_user_id)
      VALUES (?,?,?,?,?,?,?,?,?)`, [agencyId, payerId, input.documentType, title, String(file.originalname || 'document').replace(/[\r\n/\\]/g, '_').slice(0, 255), file.mimetype, file.buffer.length, stored.relativePath, user.id]);
    await audit(db, user, agencyId, 'payer', payerId, { action: 'document.uploaded', documentId: saved.insertId, documentType: input.documentType });
    await db.commit();
    return { id: saved.insertId };
  } catch (error) {
    if (db) await db.rollback();
    await d.storage.deleteLifecycleChecklistAttachment(stored.relativePath).catch(() => {});
    throw error;
  } finally { db?.release(); }
}

export async function readPayerDocument(user, agencyId, payerId, documentId, d = deps) {
  await credentialingSubject(user, agencyId, 'payer', payerId, d);
  const [[document]] = await d.database.execute(`SELECT * FROM credentialing_payer_documents
    WHERE id=? AND agency_id=? AND insurance_definition_id=?`, [documentId, agencyId, payerId]);
  if (!document) throw fail(404, 'Payer document not found.');
  await audit(d.database, user, agencyId, 'payer', payerId, { action: 'document.viewed', documentId: Number(documentId) });
  const bytes = await d.storage.readObjectBuffer(document.storage_path);
  const buffer = Buffer.from(decryptChatText(JSON.parse(bytes.toString('utf8'))), 'base64');
  return { buffer, mimeType: document.mime_type, fileName: document.file_name };
}

async function audit(db, user, agencyId, kind, recordId, changes) {
  await db.execute(`INSERT INTO credentialing_workflow_events
    (agency_id,subject_type,record_id,actor_user_id,before_json,after_json) VALUES (?,?,?,?,NULL,?)`,
  [agencyId, kind, recordId, user.id, JSON.stringify(changes)]);
}

export async function listCredentialingReminders(user, agencyId, kind, recordId, d = deps) {
  await credentialingSubject(user, agencyId, kind, recordId, d);
  const [items] = await d.database.execute(`SELECT id,title,remind_at AS remindAt,status,delivered_at AS deliveredAt
    FROM credentialing_reminders WHERE agency_id=? AND subject_type=? AND record_id=? ORDER BY remind_at,id`, [agencyId, kind, recordId]);
  return { items };
}
export async function createCredentialingReminder(user, agencyId, kind, recordId, input, d = deps) {
  await credentialingSubject(user, agencyId, kind, recordId, d);
  const title = String(input.title || '').trim(), when = String(input.remindAt || '');
  if (!title || title.length > 200 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?Z$/.test(when) || !Number.isFinite(Date.parse(when)))
    throw fail(400, 'Enter a reminder title and a valid UTC date and time.');
  const date = new Date(when);
  if (date.toISOString().slice(0,16) !== when.slice(0,16)) throw fail(400, 'Choose a real calendar date and time.');
  if (date <= new Date()) throw fail(400, 'Choose a future reminder time.');
  const db = await d.database.getConnection();
  try {
    await db.beginTransaction();
    const [result] = await db.execute(`INSERT INTO credentialing_reminders
      (agency_id,subject_type,record_id,title,remind_at,created_by_user_id) VALUES (?,?,?,?,?,?)`, [agencyId, kind, recordId, title, date, user.id]);
    await audit(db, user, agencyId, kind, recordId, { action: 'reminder.created', reminderId: result.insertId, remindAt: date.toISOString() });
    await db.commit(); return { id: result.insertId };
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
export async function finishCredentialingReminder(user, agencyId, kind, recordId, reminderId, status, d = deps) {
  await credentialingSubject(user, agencyId, kind, recordId, d);
  if (!['completed', 'cancelled'].includes(status)) throw fail(400, 'Choose completed or cancelled.');
  const db = await d.database.getConnection();
  try {
    await db.beginTransaction();
    const [result] = await db.execute(`UPDATE credentialing_reminders SET status=?,completed_at=UTC_TIMESTAMP()
      WHERE id=? AND agency_id=? AND subject_type=? AND record_id=? AND status IN ('pending','delivered')`, [status, reminderId, agencyId, kind, recordId]);
    if (!result.affectedRows) throw fail(409, 'This reminder is no longer open.');
    await audit(db, user, agencyId, kind, recordId, { action: `reminder.${status}`, reminderId: Number(reminderId) });
    await db.commit(); return { saved: true };
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}

export async function credentialingTeam(agencyId, db = pool) {
  // Product permissions and canonical grants both refer to the same owning agency.
  const [users] = await db.execute(`SELECT DISTINCT u.id,u.role,EXISTS (
      SELECT 1 FROM auricwell_accounts a JOIN auricwell_memberships m ON m.account_id=a.id
      JOIN auricwell_practices p ON p.id=m.practice_id WHERE a.canonical_user_id=u.id AND a.status='active'
      AND m.status='active' AND m.actor_type='staff' AND p.agency_id=ua.agency_id AND p.status IN ('setup','active')
      AND (JSON_CONTAINS(m.permissions,'"admin"') OR JSON_CONTAINS(m.permissions,'"credentialing"'))
    ) AS productCredentialing FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING','EHR_ONLY')
      AND u.role IN ('super_admin','admin','staff','support','provider','provider_plus','supervisor','clinical_practice_assistant','billing')`, [agencyId]);
  const permitted = [];
  for (const user of users) if (Number(user.productCredentialing) === 1 || await canAccessCredentialing(user, agencyId)) permitted.push(user);
  return permitted;
}
export async function notifyCredentialingTeam(db, { agencyId, type, title, kind, recordId }) {
  const users = await credentialingTeam(agencyId, db);
  for (const user of users) await db.execute(`INSERT INTO notifications
    (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_source)
    VALUES (?,'info',?,?,?, ?,?,?,'system')`, [type, title, 'Open credentialing to review this item.', user.id, agencyId, `credentialing_${kind}`, recordId]);
  return users.length;
}
export async function processCredentialingReminders({ database = pool, now = new Date() } = {}) {
  const db = await database.getConnection();
  let delivered = 0;
  try {
    await db.beginTransaction();
    const [items] = await db.execute(`SELECT * FROM credentialing_reminders WHERE status='pending' AND remind_at<=?
      ORDER BY remind_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`, [now]);
    for (const item of items) {
      const count = await notifyCredentialingTeam(db, { agencyId: item.agency_id, type: 'credentialing_reminder', title: item.title, kind: item.subject_type, recordId: item.record_id });
      if (!count) continue; // No recipient is a retryable condition, never a successful delivery.
      await db.execute("UPDATE credentialing_reminders SET status='delivered',delivered_at=? WHERE id=?", [now, item.id]);
      delivered++;
    }
    await db.commit(); return { delivered };
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}

export async function credentialingCaseEmail(user, agencyId, credentialId, create = false, d = deps) {
  await credentialingSubject(user, agencyId, 'provider', credentialId, d);
  const [existing] = await d.database.execute('SELECT id,email_address AS emailAddress FROM credentialing_case_emails WHERE agency_id=? AND credential_id=?', [agencyId, credentialId]);
  if (existing.length || !create) return { mailbox: existing[0] || null };
  const [[identity]] = await d.database.execute(`SELECT e.id,e.from_email FROM email_sender_identities e
    JOIN email_inbound_routes r ON r.sender_identity_id=e.id AND r.is_active=1 AND LOWER(r.email_address)=LOWER(e.from_email)
    WHERE e.agency_id=? AND e.identity_key='app' AND e.is_active=1 ORDER BY e.id LIMIT 1`, [agencyId]);
  if (!identity || !/^[^+\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.from_email))
    throw fail(409, 'Configure this practice’s receiving app email route before creating a credentialing address.');
  const [local, domain] = identity.from_email.toLowerCase().split('@');
  const address = `${local}+cred-${randomBytes(16).toString('hex')}@${domain}`;
  if (address.length > 254) throw fail(409, 'The configured app email address is too long.');
  const db = await d.database.getConnection();
  try {
    await db.beginTransaction();
    const [saved] = await db.execute(`INSERT IGNORE INTO credentialing_case_emails
      (agency_id,credential_id,sender_identity_id,email_address,created_by_user_id) VALUES (?,?,?,?,?)`, [agencyId, credentialId, identity.id, address, user.id]);
    if (saved.affectedRows) await audit(db, user, agencyId, 'provider', credentialId, { action: 'email.created', emailAddress: address });
    const [[mailbox]] = await db.execute('SELECT id,email_address AS emailAddress FROM credentialing_case_emails WHERE agency_id=? AND credential_id=?', [agencyId, credentialId]);
    await db.commit(); return { mailbox };
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}

export async function credentialingCaseTickets(user, agencyId, credentialId, d = deps) {
  await credentialingSubject(user, agencyId, 'provider', credentialId, d);
  const [items] = await d.database.execute(`SELECT t.id,t.subject,t.status,t.updated_at AS updatedAt FROM credentialing_email_tickets l
    JOIN credentialing_case_emails e ON e.id=l.case_email_id JOIN support_tickets t ON t.id=l.ticket_id AND t.agency_id=e.agency_id
    WHERE e.agency_id=? AND e.credential_id=? ORDER BY t.id DESC LIMIT 100`, [agencyId, credentialId]);
  return { items };
}

async function caseTicket(user, agencyId, credentialId, ticketId, d) {
  await credentialingSubject(user, agencyId, 'provider', credentialId, d);
  const [[ticket]] = await d.database.execute(`SELECT t.id,t.subject,t.status FROM credentialing_email_tickets l
    JOIN credentialing_case_emails e ON e.id=l.case_email_id JOIN support_tickets t ON t.id=l.ticket_id AND t.agency_id=e.agency_id
    WHERE e.agency_id=? AND e.credential_id=? AND t.id=?`, [agencyId, credentialId, ticketId]);
  if (!ticket) throw fail(404, 'Credentialing ticket not found in this case.');
  return ticket;
}
export async function readCredentialingCaseTicket(user, agencyId, credentialId, ticketId, d = deps) {
  const ticket = await caseTicket(user, agencyId, credentialId, ticketId, d);
  await audit(d.database, user, agencyId, 'provider', credentialId, { action: 'email.viewed', ticketId: Number(ticketId) });
  const [rows] = await d.database.execute(`SELECT * FROM support_ticket_messages WHERE ticket_id=? AND COALESCE(is_deleted,0)=0 ORDER BY id LIMIT 500`, [ticketId]);
  const attachments = await listTicketAttachments(ticketId, d.database);
  return { ticket, messages: rows.map(decryptTicketMessageRow).map(m => ({ id: m.id, body: m.body, created_at: m.created_at })),
    attachments: attachments.map(a => ({ id: a.id, file_name: a.file_name, mime_type: a.mime_type, file_size: a.file_size })) };
}
export async function readCredentialingCaseAttachment(user, agencyId, credentialId, ticketId, attachmentId, d = deps) {
  await caseTicket(user, agencyId, credentialId, ticketId, d);
  const row = await getTicketAttachmentRow(ticketId, attachmentId);
  if (!row) throw fail(404, 'Credentialing email attachment not found.');
  await audit(d.database, user, agencyId, 'provider', credentialId, { action: 'email.attachment.viewed', ticketId: Number(ticketId), attachmentId: Number(attachmentId) });
  return { buffer: await readTicketAttachmentBuffer(row), fileName: row.file_name, mimeType: row.mime_type };
}

// Exact recipient routing only. Subject, sender and payer names never choose a case.
export async function ingestCredentialingEmail(input, d = {}) {
  const database = d.database || pool;
  const addresses = [...new Set((input.addresses || []).map(a => String(a).trim().toLowerCase()).filter(a => /\+cred-[a-f0-9]{32}@/.test(a)))];
  if (!addresses.length) return { ingested: false };
  const [cases] = await database.execute(`SELECT DISTINCT c.* FROM credentialing_case_emails c
    JOIN email_sender_identities e ON e.id=c.sender_identity_id AND e.agency_id=c.agency_id AND e.is_active=1
    JOIN email_inbound_routes r ON r.sender_identity_id=e.id AND r.is_active=1 AND LOWER(r.email_address)=LOWER(e.from_email)
    JOIN user_insurance_credentialing uic ON uic.id=c.credential_id
    JOIN insurance_credentialing_definitions p ON p.id=uic.insurance_credentialing_definition_id AND p.agency_id=c.agency_id
    WHERE c.email_address IN (${addresses.map(() => '?').join(',')})`, addresses);
  if (cases.length !== 1) throw fail(409, 'Credentialing email has an unknown or ambiguous case address.');
  const target = cases[0];
  const result = await (d.ingest || ingestSupportTicketEmail)({ ...input, agencyId: target.agency_id, schoolOrganizationId: target.agency_id,
    recipients: [target.email_address], topic: 'credentialing', credentialingCaseEmailId: target.id,
    generateDraft: false, staffCopy: false, createdByUserId: null });
  return { ingested: true, ...result };
}

export async function acknowledgeCredentialingNotifications(user, agencyId, kind, recordId, d = deps) {
  await credentialingSubject(user, agencyId, kind, recordId, d);
  await d.database.execute(`UPDATE notifications SET is_read=1,read_at=UTC_TIMESTAMP() WHERE user_id=? AND agency_id=?
    AND type IN ('credentialing_reminder','credentialing_email') AND related_entity_type=? AND related_entity_id=?`, [user.id,agencyId,`credentialing_${kind}`,recordId]);
  return { saved: true };
}
