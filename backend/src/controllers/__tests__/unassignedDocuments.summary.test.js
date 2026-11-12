import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ count: vi.fn(), list: vi.fn(), user: vi.fn() }));
vi.mock('../../models/IntakeSubmissionDocument.model.js', () => ({ default: { countUnassigned: mocks.count, listUnassigned: mocks.list } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: mocks.user } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: {} }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: {} }));
vi.mock('../../models/ClientPhiDocument.model.js', () => ({ default: {} }));
vi.mock('../../models/Client.model.js', () => ({ default: {} }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: {} }));
vi.mock('../../models/PhiDocumentAuditLog.model.js', () => ({ default: {} }));
vi.mock('../../services/storage.service.js', () => ({ default: {} }));
vi.mock('../../config/database.js', () => ({ default: {} }));
import { listUnassignedDocuments } from '../unassignedDocuments.controller.js';

beforeEach(() => { vi.resetAllMocks(); mocks.count.mockResolvedValue(137); });

it.each([
  ['super_admin', false, false], ['admin', false, true], ['admin', true, false]
])('returns only a count with the existing medical-records rules for %s (release access=%s)', async (role, access, excludeMedicalRecords) => {
  mocks.user.mockResolvedValue({ has_medical_records_release_access: access });
  const res = { json: vi.fn() }, next = vi.fn();
  await listUnassignedDocuments({ user: { id: 7, role }, query: { agencyId: '2', summary: '1' } }, res, next);
  expect(mocks.count).toHaveBeenCalledWith({ agencyId: 2, excludeMedicalRecords });
  expect(mocks.list).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({ count: 137 });
  expect(next).not.toHaveBeenCalled();
});

it('preserves the full list response for callers that do not request a summary', async () => {
  const rows = [{ id: 4 }]; mocks.list.mockResolvedValue(rows);
  const res = { json: vi.fn() };
  await listUnassignedDocuments({ user: { id: 7, role: 'super_admin' }, query: { agencyId: '2' } }, res, vi.fn());
  expect(mocks.count).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(rows);
});
