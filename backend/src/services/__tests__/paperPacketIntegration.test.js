import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { checkPaperPacketFile } from '../paperPacketScan.service.js';
import { completePaperPacketTask } from '../paperPacketTask.service.js';

const scope = { clientId: 4, documentId: 9, actorId: 8 };
function dependencies(latest) {
  const doc = { id: 9, client_id: 4, agency_id: 2, school_organization_id: 3, scan_status: 'clean' };
  return {
    clients: { findById: vi.fn(async () => ({ id: 4, agency_id: 2, organization_id: 3 })) },
    documents: { findSchoolPaperPacket: vi.fn(async () => doc) },
    read: vi.fn(async () => ({ doc, buffer: Buffer.from('synthetic') })),
    latest: vi.fn(async () => latest), schedule: vi.fn()
  };
}

it('reads a legacy clean packet again so its language, date and actual page hints become available', async () => {
  const deps = dependencies({ id: 11, phi_document_id: 9, status: 'applied' });
  await checkPaperPacketFile(scope, deps);
  expect(deps.schedule).toHaveBeenCalledWith({ clientId: 4, schoolOrganizationId: 3, phiDocumentId: 9, actorUserId: 8 });
});

it('does not repeat a completed source reading that already contains review metadata', async () => {
  const deps = dependencies({ id: 11, phi_document_id: 9, status: 'applied', raw_summary: { reviewHints: { locale: 'es' } } });
  await checkPaperPacketFile(scope, deps);
  expect(deps.schedule).not.toHaveBeenCalled();
});

it('rejects a different client source before reading any source bytes', async () => {
  const deps = dependencies(null);
  deps.documents.findSchoolPaperPacket.mockResolvedValue({ client_id: 40, agency_id: 2, school_organization_id: 3 });
  await expect(checkPaperPacketFile(scope, deps)).rejects.toHaveProperty('status', 404);
  expect(deps.read).not.toHaveBeenCalled();
});

it('completes a processed packet task independently of the later invitation preview and send', async () => {
  const db = { execute: vi.fn(async () => [{ affectedRows: 1 }]) };
  const state = { processedAt: '2026-11-16T16:00:00Z', documentId: 9, signatureSourceDocumentId: 9, guardian1ContactId: 20, invitations: {} };
  expect(await completePaperPacketTask({ clientId: 4, state }, db)).toBe(true);
  expect(db.execute.mock.calls[0][1]).toEqual([4, 9]);
  expect(await completePaperPacketTask({ clientId: 4, state: { ...state, signatureSourceDocumentId: 10 } }, db)).toBe(false);
});
