import { beforeEach, describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn(), store: vi.fn(), queue: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks }));
vi.mock('../storage.service.js', () => ({ default: { saveAdminDoc: mocks.store } }));
vi.mock('../peopleOperationsSubmissionNotifications.service.js', () => ({ queuePeopleOperationsSubmission: mocks.queue }));
import { buildSignedReceipt, savePrehireSignedReceipt } from '../prehireSignedReceipt.service.js';
const signatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
describe('retained signature receipt', () => {
  it('keeps all original PDF pages and appends a signed receipt', async () => {
    const source = await PDFDocument.create(); source.addPage(); source.addPage();
    const bytes = await buildSignedReceipt({ title: 'Policy', body: 'Acknowledged policy text', signerName: 'Elena', signatureData, source: await source.save() });
    const copy = await PDFDocument.load(bytes); expect(copy.getPageCount()).toBe(3);
    expect(copy.catalog.has(copy.context.obj('Names'))).toBe(true);
  });
  it('rejects a missing signature before claiming a document was signed', async () => {
    await expect(buildSignedReceipt({ title: 'Policy', body: 'Text', signerName: 'Elena', signatureData: '' })).rejects.toThrow('valid signature');
  });
});

describe('signed pre-hire file retention', () => {
  const db = { execute: mocks.execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  const payload = { userId: 3, agencyId: 2, itemKey: 'background_check', title: 'Background authorization',
    docType: 'background_check_authorization', body: 'Masked receipt', signerName: 'Elena Example', signatureData };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConnection.mockResolvedValue(db);
    mocks.store.mockResolvedValue({ relativePath: 'private/receipt.pdf' });
    mocks.execute.mockImplementation(async sql => {
      if (sql.includes('FROM users')) return [[{ status: 'PREHIRE_OPEN' }]];
      if (sql.includes('INSERT INTO user_admin_docs')) return [{ insertId: 44 }];
      return [[]];
    });
  });
  it('links the PDF and writes the authorization using the same transaction', async () => {
    const beforeRetain = vi.fn();
    expect(await savePrehireSignedReceipt({ ...payload, beforeRetain })).toBe(44);
    expect(beforeRetain).toHaveBeenCalledWith(db);
    expect(mocks.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO hiring_prehire_checklist_items'))[1].at(-1)).toBe(44);
    expect(mocks.queue).toHaveBeenCalledWith({ agencyId: 2, userId: 3, kind: 'receipt', id: 44 }, db);
    expect(db.commit).toHaveBeenCalledTimes(1);
  });
  it('rolls back both records if the authorization cannot be saved', async () => {
    await expect(savePrehireSignedReceipt({ ...payload, beforeRetain: async () => { throw new Error('Unable to save authorization'); } })).rejects.toThrow('Unable to save authorization');
    expect(db.rollback).toHaveBeenCalled();
    expect(db.commit).not.toHaveBeenCalled();
    expect(mocks.queue).not.toHaveBeenCalled();
  });
});
