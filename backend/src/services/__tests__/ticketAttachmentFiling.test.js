import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), getConnection: vi.fn(), getGCSBucket: vi.fn(), copy: vi.fn(), getMetadata: vi.fn(), setMetadata: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: mocks.getConnection } }));
vi.mock('../storage.service.js', () => ({ default: { getGCSBucket: mocks.getGCSBucket } }));
import { fileTicketAttachment } from '../ticketAttachmentFiling.service.js';
let ticket, client, attachment, existing, member;
const args = () => ({ ticketId: 10, attachmentId: 20, clientId: 30, user: { id: 1, role: 'admin' } });
beforeEach(() => {
  vi.resetAllMocks();
  ticket = { id: 10, agency_id: 2, client_id: 30 };
  client = { id: 30, agency_id: 2, organization_id: 4 };
  attachment = { id: 20, file_path: 'uploads/ticket_attachments/ticket_10/synthetic.pdf', file_name: 'synthetic.pdf', mime_type: 'application/pdf', file_size: 16 * 1024 * 1024 };
  existing = null; member = true;
  mocks.getConnection.mockResolvedValue(mocks);
  mocks.getMetadata.mockResolvedValue([{ size: String(16 * 1024 * 1024) }]);
  mocks.getGCSBucket.mockResolvedValue({ file: vi.fn(path => ({ name: path, copy: mocks.copy, getMetadata: mocks.getMetadata, setMetadata: mocks.setMetadata })) });
  mocks.execute.mockImplementation(async sql => {
    if (sql.startsWith('SELECT id,agency_id,client_id')) return [[ticket]];
    if (sql.startsWith('SELECT id,agency_id,organization_id')) return [[client]];
    if (sql.startsWith('SELECT user_id')) return [member ? [{ user_id: 1 }] : []];
    if (sql.startsWith('SELECT id,file_name')) return [[attachment]];
    if (sql.startsWith('SELECT id,removed_at')) return [existing ? [existing] : []];
    return [{ insertId: 99 }];
  });
});
describe('filing ticket attachments on existing clients', () => {
  it('copies a 16 MB packet to protected storage and records the source and actor atomically', async () => {
    expect(await fileTicketAttachment(args())).toEqual({ documentId: 99, clientId: 30, alreadyAdded: false });
    expect(mocks.copy).toHaveBeenCalledWith(expect.objectContaining({ name: 'phi-documents/2/30/ticket-10-attachment-20' }));
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO phi_document_audit_logs'), [99, 30, 'uploaded', 1, null, JSON.stringify({ source: 'ticket_attachment', ticketId: 10, attachmentId: 20 })]);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });
  it('returns the existing document on retry without copying or inserting again', async () => {
    existing = { id: 75, removed_at: null };
    expect(await fileTicketAttachment(args())).toMatchObject({ documentId: 75, alreadyAdded: true });
    expect(mocks.getGCSBucket).not.toHaveBeenCalled();
    expect(mocks.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it.each(['provider', 'school_staff', 'client_guardian'])('rejects %s before reading or copying files', async role => {
    await expect(fileTicketAttachment({ ...args(), user: { id: 1, role } })).rejects.toMatchObject({ status: 403 });
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });
  it('rejects a different client than the one shown when the ticket was opened', async () => {
    ticket.client_id = 31;
    await expect(fileTicketAttachment(args())).rejects.toMatchObject({ status: 409 });
    expect(mocks.getGCSBucket).not.toHaveBeenCalled();
  });
  it('requires linking an existing client first', async () => {
    ticket.client_id = null;
    await expect(fileTicketAttachment(args())).rejects.toMatchObject({ status: 409 });
  });
  it('rejects cross-agency filing even for a superadmin', async () => {
    client.agency_id = 7;
    await expect(fileTicketAttachment({ ...args(), user: { id: 1, role: 'super_admin' } })).rejects.toMatchObject({ status: 403 });
    expect(mocks.copy).not.toHaveBeenCalled();
  });
  it('requires actual agency membership for an admin', async () => {
    member = false;
    await expect(fileTicketAttachment(args())).rejects.toMatchObject({ status: 403 });
  });
  it('scopes the attachment lookup to the authorized ticket', async () => {
    attachment = null;
    await expect(fileTicketAttachment(args())).rejects.toMatchObject({ status: 404 });
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('id=? AND ticket_id=?'), [20, 10]);
    expect(mocks.copy).not.toHaveBeenCalled();
  });
  it('rejects oversized actual storage objects even if the saved size is smaller', async () => {
    mocks.getMetadata.mockResolvedValue([{ size: String(26 * 1024 * 1024) }]);
    await expect(fileTicketAttachment(args())).rejects.toMatchObject({ status: 413 });
    expect(mocks.copy).not.toHaveBeenCalled();
  });
  it('does not mark the document added if its storage copy fails', async () => {
    mocks.copy.mockRejectedValue(new Error('Storage unavailable'));
    await expect(fileTicketAttachment(args())).rejects.toThrow('Storage unavailable');
    expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.rollback).toHaveBeenCalled();
    expect(mocks.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it('rolls back the document if the audit cannot be recorded', async () => {
    const execute = mocks.execute.getMockImplementation();
    mocks.execute.mockImplementation((sql, params) => sql.startsWith('INSERT INTO phi_document_audit_logs') ? Promise.reject(new Error('Audit unavailable')) : execute(sql, params));
    await expect(fileTicketAttachment(args())).rejects.toThrow('Audit unavailable');
    expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.rollback).toHaveBeenCalled();
  });
});
