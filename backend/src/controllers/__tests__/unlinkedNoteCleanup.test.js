import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('express-validator', () => ({ validationResult: vi.fn(() => ({ isEmpty: () => true })) }));
vi.mock('../../services/unlinkedNoteCleanup.service.js', () => ({ default: { preview: vi.fn(), remove: vi.fn() } }));
vi.mock('../../utils/securityEvidence.js', () => ({ networkEvidence: () => ({ clientIp: '127.0.0.1' }) }));
import { validationResult } from 'express-validator';
import cleanup from '../../services/unlinkedNoteCleanup.service.js';
import { previewUnlinkedNoteCleanup, deleteUnlinkedNoteCleanup } from '../unlinkedNoteCleanup.controller.js';

let req, res, next;
beforeEach(() => {
  vi.clearAllMocks();
  validationResult.mockReturnValue({ isEmpty: () => true });
  req = { user: { id: 501, role: 'super_admin', sessionId: 'actual-session' }, headers: { 'user-agent': 'test browser' }, body: { confirmation: 'DELETE UNLINKED', items: [{ kind: 'draft', id: 1, version: 'a'.repeat(64) }] } };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
});
it('blocks preview identities on both endpoints', async () => {
  req.auricwellPreview = { agencyId: 7 };
  await previewUnlinkedNoteCleanup(req, res, next);
  await deleteUnlinkedNoteCleanup(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(cleanup.preview).not.toHaveBeenCalled();
  expect(cleanup.remove).not.toHaveBeenCalled();
});
it('requires explicit confirmation and validated selections', async () => {
  req.body.confirmation = '';
  await deleteUnlinkedNoteCleanup(req, res, next);
  req.body.confirmation = 'DELETE UNLINKED';
  validationResult.mockReturnValue({ isEmpty: () => false });
  await deleteUnlinkedNoteCleanup(req, res, next);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(cleanup.remove).not.toHaveBeenCalled();
});
it('uses the authenticated actor and network evidence, ignoring a body userId', async () => {
  req.body.userId = 999;
  await deleteUnlinkedNoteCleanup(req, res, next);
  expect(cleanup.remove).toHaveBeenCalledWith(req.user, req.body.items, {
    ipAddress: '127.0.0.1', userAgent: 'test browser', sessionId: 'actual-session'
  });
});
it('forwards access and conflict errors without returning success', async () => {
  const conflict = Object.assign(new Error('Changed'), { status: 409 });
  cleanup.remove.mockRejectedValueOnce(conflict);
  await deleteUnlinkedNoteCleanup(req, res, next);
  expect(next).toHaveBeenCalledWith(conflict);
  expect(res.json).not.toHaveBeenCalled();
});
