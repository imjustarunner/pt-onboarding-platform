import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../models/IntakeSubmissionDocument.model.js', () => ({ default: { listSignedForClient: vi.fn() } }));
vi.mock('../../services/storage.service.js', () => ({ default: { getSignedUrl: vi.fn() } }));
vi.mock('../../services/auditEvent.service.js', () => ({ logAuditEvent: vi.fn() }));
import Client from '../../models/Client.model.js';
import User from '../../models/User.model.js';
import Documents from '../../models/IntakeSubmissionDocument.model.js';
import Storage from '../../services/storage.service.js';
import { logAuditEvent } from '../../services/auditEvent.service.js';
import { viewClientSignedSchoolRoi } from '../clientSchoolRoiAccess.controller.js';
let req, res, next;
beforeEach(() => {
  vi.resetAllMocks();
  req = { params: { id: '4', documentId: '9' }, user: { id: 8, role: 'support' } };
  res = { status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
  Client.findById.mockResolvedValue({ id: 4, agency_id: 2, client_type: 'school' });
  User.getAgencies.mockResolvedValue([{ id: 2 }]);
  Documents.listSignedForClient.mockResolvedValue([{ id: 9, client_id: 4, signed_at: '2026-11-08T05:21:49Z', signed_pdf_path: 'roi.pdf', audit_trail: { smartSchoolRoi: true } }]);
  Storage.getSignedUrl.mockResolvedValue('https://storage.example.test/scoped-roi');
});
it('lets authorized support view the stored signed ROI without issuing a signing request', async () => {
  await viewClientSignedSchoolRoi(req, res, next);
  expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({ url: 'https://storage.example.test/scoped-roi' });
  expect(Documents.listSignedForClient).toHaveBeenCalledWith(4);
  expect(logAuditEvent).toHaveBeenCalledWith(req, expect.objectContaining({ actionType: 'school_roi_document_viewed' }));
});
it.each(['school_staff', 'client_guardian', 'provider'])('does not expose the support document route to %s', async role => {
  req.user.role = role;await viewClientSignedSchoolRoi(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);expect(Storage.getSignedUrl).not.toHaveBeenCalled();
});
it('rejects another agency before reading its signed documents', async () => {
  User.getAgencies.mockResolvedValue([{ id: 3 }]);await viewClientSignedSchoolRoi(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);expect(Documents.listSignedForClient).not.toHaveBeenCalled();
});
it.each([
  { rows: [] }, { rows: [{ id: 9, signed_at: '2026-11-08', signed_pdf_path: 'clinical.pdf', document_template_name: 'Assessment' }] },
  { rows: [{ id: 9, signed_pdf_path: 'unsigned.pdf', audit_trail: { smartSchoolRoi: true } }] }
])('rejects missing, clinical and unsigned documents', async ({ rows }) => {
  Documents.listSignedForClient.mockResolvedValue(rows);await viewClientSignedSchoolRoi(req, res, next);
  expect(res.status).toHaveBeenCalledWith(404);expect(Storage.getSignedUrl).not.toHaveBeenCalled();
});
