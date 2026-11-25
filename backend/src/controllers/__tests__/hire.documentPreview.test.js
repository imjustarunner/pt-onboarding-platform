import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), agencies: vi.fn(), template: vi.fn(), authored: vi.fn(), read: vi.fn(), pdf: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: m.agencies } }));
vi.mock('../../models/DocumentTemplate.model.js', () => ({ default: { findById: m.template } }));
vi.mock('../../services/prehireAuthoredDocument.service.js', () => ({ renderPrehireAuthoredDocument: m.authored }));
vi.mock('../../services/storage.service.js', () => ({ default: { readObject: m.read, readTemplate: m.read } }));
vi.mock('../../services/documentSigning.service.js', () => ({ default: { convertHTMLToPDF: m.pdf, applyPacketBrandChromeToHtml: async html => ({ html, pdfOptions: {} }) } }));
import { previewHireDocument } from '../hireDocumentPreview.controller.js';
const request = (query = {}) => ({ user: { id: 9, role: 'admin' }, query: { agencyId: 2, jobId: 3, documentId: 'identogo', ...query } });
let res, next;
beforeEach(() => {
  vi.clearAllMocks(); m.agencies.mockResolvedValue([{ id: 2 }]);
  m.execute.mockImplementation(async sql => sql.includes('FROM agencies') ? [[{ prehire_settings: { default_prehire_docs: [] } }]] : [[{ prehire_config_json: { documents: [{ id: 'identogo', kind: 'company_document', title: 'Identogo', bodyHtml: '<p>Fingerprint instructions</p>' }] } }]]);
  m.authored.mockResolvedValue(Buffer.from('job-pdf')); m.read.mockResolvedValue(Buffer.from('template-pdf')); m.pdf.mockResolvedValue(Buffer.from('html-pdf'));
  res = { set: vi.fn().mockReturnThis(), send: vi.fn() }; next = vi.fn();
});
it('previews the authored job document without requiring a library template or creating an assignment', async () => {
  await previewHireDocument(request(), res, next);
  expect(next).not.toHaveBeenCalled(); expect(m.template).not.toHaveBeenCalled();
  expect(m.authored).toHaveBeenCalledWith(expect.objectContaining({ id: 'identogo', bodyHtml: '<p>Fingerprint instructions</p>' }), 2);
  expect(res.send).toHaveBeenCalledWith(Buffer.from('job-pdf'));
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' }));
});
it('checks agency membership before reading any content', async () => {
  m.agencies.mockResolvedValue([{ id: 5 }]); await previewHireDocument(request(), res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 })); expect(m.execute).not.toHaveBeenCalled();
});
it('rejects a job not belonging to the selected agency', async () => {
  m.execute.mockResolvedValue([[]]); await previewHireDocument(request(), res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 })); expect(m.read).not.toHaveBeenCalled();
});
it('does not read a caller-supplied file path or document body', async () => {
  await previewHireDocument(request({ documentId: 'not-configured', filePath: 'private.pdf', bodyHtml: '<p>Injected</p>' }), res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 })); expect(m.authored).not.toHaveBeenCalled(); expect(m.read).not.toHaveBeenCalled();
});
it('previews a reusable signature template but rejects a template from another agency', async () => {
  m.template.mockResolvedValue({ agency_id: 2, template_type: 'pdf', file_path: 'templates/sign.pdf' });
  await previewHireDocument(request({ documentId: undefined, templateId: 12 }), res, next);
  expect(m.read).toHaveBeenCalledWith('sign.pdf');
  m.template.mockResolvedValue({ agency_id: 5, template_type: 'pdf', file_path: 'private.pdf' });
  m.read.mockClear(); await previewHireDocument(request({ documentId: undefined, templateId: 12 }), res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 })); expect(m.read).not.toHaveBeenCalled();
});
