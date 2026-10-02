import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
const state = vi.hoisted(() => ({ db: null, copy: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: () => state.db.getConnection(), execute: (...args) => state.db.execute(...args) } }));
vi.mock('../storage.service.js', () => ({ default: { getGCSBucket: async () => ({ file: () => ({ getMetadata: async () => [{ size: String(16 * 1024 * 1024) }], copy: state.copy, setMetadata: async () => {} }) }) } }));
import { fileTicketAttachment } from '../ticketAttachmentFiling.service.js';
vi.mock('../unifiedEmail/gmailClient.js', () => ({ getGmailClient: vi.fn() }));
import { listTicketAttachments } from '../unifiedEmail/ticketInboundAttachments.service.js';
const socket = process.env.EVIDENCE_TEST_SOCKET;
const args = { ticketId: 10, attachmentId: 20, clientId: 30, user: { id: 1, role: 'admin' } };
describe.skipIf(!socket)('ticket attachment filing transactions', () => {
  beforeAll(async () => {
    if (!/^\/private\/tmp\/pt-security-evidence-db\.[^/]+\/mysql\.sock$/.test(socket)) throw new Error('Use an isolated test socket');
    const db = await mysql.createConnection({ socketPath: socket, user: 'root' });
    await db.query('CREATE DATABASE ticket_attachment_filing_test'); await db.end();
    state.db = mysql.createPool({ socketPath: socket, user: 'root', database: 'ticket_attachment_filing_test', connectionLimit: 6 });
    for (const sql of [
      'CREATE TABLE support_tickets (id INT PRIMARY KEY,agency_id INT,client_id INT)',
      'CREATE TABLE clients (id INT PRIMARY KEY,agency_id INT,organization_id INT,document_status VARCHAR(30))',
      'CREATE TABLE user_agencies (user_id INT,agency_id INT)',
      'CREATE TABLE support_ticket_attachments (id INT PRIMARY KEY,ticket_id INT,file_name VARCHAR(255),file_path VARCHAR(500),mime_type VARCHAR(100),file_size INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
      'CREATE TABLE client_phi_documents (id INT PRIMARY KEY AUTO_INCREMENT,client_id INT,agency_id INT,school_organization_id INT,storage_path VARCHAR(500),original_name VARCHAR(255),document_title VARCHAR(255),document_type VARCHAR(80),mime_type VARCHAR(100),uploaded_by_user_id INT,removed_at DATETIME)',
      'CREATE TABLE phi_document_audit_logs (id INT PRIMARY KEY AUTO_INCREMENT,document_id INT,client_id INT,action VARCHAR(64),actor_user_id INT,actor_label VARCHAR(255),metadata JSON)'
    ]) await state.db.query(sql);
    await state.db.query('INSERT INTO support_tickets VALUES (10,2,30)');
    await state.db.query("INSERT INTO clients VALUES (30,2,4,'NONE')");
    await state.db.query('INSERT INTO user_agencies VALUES (1,2)');
    await state.db.query("INSERT INTO support_ticket_attachments (id,ticket_id,file_name,file_path,mime_type,file_size) VALUES (20,10,'synthetic.pdf','uploads/ticket_attachments/synthetic.pdf','application/pdf',16777216)");
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    await state.db.query('DELETE FROM phi_document_audit_logs');
    await state.db.query('DELETE FROM client_phi_documents');
  });
  afterAll(async () => { if (state.db) { await state.db.query('DROP DATABASE ticket_attachment_filing_test'); await state.db.end(); } });
  it('serializes simultaneous clicks into one stored document and one audit record', async () => {
    const results = await Promise.all([fileTicketAttachment(args), fileTicketAttachment(args), fileTicketAttachment(args)]);
    expect(new Set(results.map(r => r.documentId)).size).toBe(1);
    expect(results.filter(r => !r.alreadyAdded)).toHaveLength(1);
    expect(state.copy).toHaveBeenCalledTimes(1);
    const [[audit]] = await state.db.query('SELECT COUNT(*) n FROM phi_document_audit_logs'); expect(audit.n).toBe(1);
    const [[document]] = await state.db.query('SELECT * FROM client_phi_documents'); expect(document.uploaded_by_user_id).toBe(1); expect(document.school_organization_id).toBe(4);
    expect(await listTicketAttachments(10)).toEqual([expect.objectContaining({ id: 20, client_document_id: document.id, client_document_client_id: 30 })]);
  });
  it('does not associate a different ticket’s attachment with the client', async () => {
    await expect(fileTicketAttachment({ ...args, attachmentId: 21 })).rejects.toMatchObject({ status: 404 });
    const [[documents]] = await state.db.query('SELECT COUNT(*) n FROM client_phi_documents'); expect(documents.n).toBe(0);
    expect(state.copy).not.toHaveBeenCalled();
  });
});
