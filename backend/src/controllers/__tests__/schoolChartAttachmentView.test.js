import {beforeEach, expect, it, vi} from 'vitest';
const m = vi.hoisted(() => ({client: vi.fn(), agencies: vi.fn(), document: vi.fn(), list: vi.fn(), execute: vi.fn(), read: vi.fn(), decrypt: vi.fn(), audit: vi.fn()}));
vi.mock('../../models/Client.model.js', () => ({default: {findById: m.client}}));
vi.mock('../../models/User.model.js', () => ({default: {getAgencies: m.agencies}}));
vi.mock('../../models/ClientPhiDocument.model.js', () => ({default: {findById: m.document}}));
vi.mock('../../config/database.js', () => ({default: {execute: m.execute}}));
vi.mock('../../services/schoolChartAttachment.service.js', () => ({schoolChartAttachments: m.list, handleSchoolChartAttachment: vi.fn()}));
vi.mock('../../services/storage.service.js', () => ({default: {readObject: m.read, sanitizeFilename: name => name}}));
vi.mock('../../services/documentEncryption.service.js', () => ({default: {decryptPhiDocumentBuffer: m.decrypt}}));
vi.mock('../../models/PhiDocumentAuditLog.model.js', () => ({default: {create: m.audit}}));
vi.mock('../../services/medicalArchiveUpload.service.js', () => ({withMedicalArchiveUpload: vi.fn()}));
vi.mock('../../services/safetyPlans/access.js', () => ({clientAccess: vi.fn()}));
vi.mock('../../middleware/clientDocumentUpload.middleware.js', () => ({receiveClientDocument: vi.fn()}));
vi.mock('../../services/clientChartArtifacts.service.js', () => ({assembleClientChartArtifacts: vi.fn(), renderChartArtifactView: vi.fn()}));
import {viewSchoolChartAttachment} from '../schoolChartAttachment.controller.js';
const request = () => ({user: {id: 1434, role: 'support'}, params: {docId: '4364'}, headers: {}, ip: '192.0.2.4'});
const response = () => ({status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn(), send: vi.fn()});
beforeEach(() => {
  vi.clearAllMocks();
  m.client.mockResolvedValue({id: 2449, agency_id: 450, organization_id: 451});
  m.agencies.mockResolvedValue([{id: 450, is_active: 1}]);
  m.document.mockResolvedValue({id: 4364, client_id: 2449, agency_id: 450, school_organization_id: 451, mime_type: 'application/pdf', is_encrypted: 1, storage_path: 'phi-documents/private-fixture', original_name: 'QA-ATTACHMENT-1110.pdf'});
  m.list.mockResolvedValue([{id: 4364}]);
  m.execute.mockResolvedValue([[], []]); m.audit.mockResolvedValue(1);
  m.read.mockResolvedValue(Buffer.from('encrypted fake source'));
  m.decrypt.mockResolvedValue(Buffer.from('%PDF-1.7\nFictional test source'));
});
it('uses the real encrypted reader and both existing view audits for an authorized school-origin Support file', async () => {
  const req = request(), res = response(), next = vi.fn();
  await viewSchoolChartAttachment(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(m.list).toHaveBeenCalledWith({clientId: 2449, agencyId: 450, schoolId: 451});
  expect(m.read).toHaveBeenCalledWith('phi-documents/private-fixture'); expect(m.decrypt).toHaveBeenCalledOnce();
  expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
  expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline; filename="QA-ATTACHMENT-1110.pdf"');
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(res.send).toHaveBeenCalledWith(Buffer.from('%PDF-1.7\nFictional test source'));
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO phi_access_logs'), [1434, 2449, 4364, 'view', '192.0.2.4', null]);
  expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({documentId: 4364, clientId: 2449, action: 'viewed', actorUserId: 1434}));
});
it('does not read or decrypt a foreign-agency file', async () => {
  m.agencies.mockResolvedValue([{id: 999, is_active: 1}]); const next = vi.fn();
  await viewSchoolChartAttachment(request(), response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status: 403}));
  expect(m.read).not.toHaveBeenCalled(); expect(m.decrypt).not.toHaveBeenCalled();
});
it('does not read an unclassified clinical or other-school source through the operational route', async () => {
  m.list.mockResolvedValue([{id: 9999}]); const next = vi.fn();
  await viewSchoolChartAttachment(request(), response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status: 404}));
  expect(m.read).not.toHaveBeenCalled(); expect(m.decrypt).not.toHaveBeenCalled();
});
it('retains the reader removal guard if the source is removed between classification and reading', async () => {
  const doc = await m.document(); m.document.mockResolvedValueOnce(doc).mockResolvedValueOnce({...doc, removed_at: new Date()});
  const res = response(); await viewSchoolChartAttachment(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(410); expect(m.read).not.toHaveBeenCalled();
});
