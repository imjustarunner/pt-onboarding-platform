import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/Library.model.js', () => ({ default: { findResource: vi.fn(), createResource: vi.fn(), userCanEditResource: vi.fn(), updateResource: vi.fn(), recordView: vi.fn(), findExistingPersonalCopy: vi.fn(), logDistribution: vi.fn(), grantResourcePermission: vi.fn(), listResourceShares: vi.fn() } }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../services/storage.service.js', () => ({ default: { readObject: vi.fn(), writeObject: vi.fn(), deleteObject: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../utils/meDashboardTenantScope.js', () => ({ pickDashboardContextAgencyId: () => 2, hasTenantAccess: vi.fn() }));
vi.mock('../../utils/capabilities.js', () => ({ getUserCapabilities: vi.fn() }));
vi.mock('../../services/libraryDocument.service.js', () => ({ sanitizeDocumentHtml: value => String(value || ''), validateDocumentBranding: vi.fn(), resolveDocumentLetterhead: vi.fn(), buildDocumentRender: vi.fn(), documentError: (message, status = 400) => Object.assign(new Error(message), { status }) }));
vi.mock('../../services/libraryGooglePreview.service.js',()=>({loadLibraryGooglePreview:vi.fn()}));
import {loadLibraryGooglePreview} from '../../services/libraryGooglePreview.service.js';
import { getLibraryPdfContent, saveLibraryPdfFilledCopy, previewGoogleResource, copyLibraryDocument, distributeResource, getResource, updateResource } from '../library.controller.js';
import Library from '../../models/Library.model.js';
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import StorageService from '../../services/storage.service.js';
import { PDFDocument } from 'pdf-lib';
import { getUserCapabilities } from '../../utils/capabilities.js';
const original = { id: 10, agencyId: 2, ownerUserId: 1, scope: 'organization', name: 'Safety plan', bodyHtml: '<p>Blank responses</p>', resourceType: 'branded_doc', brandingMode: 'organization', letterheadTemplateId: null, version: 4 };
let req, res, next;
beforeEach(() => {
  vi.resetAllMocks();
  req = { params: { id: '10' }, user: { id: 7, role: 'provider' }, query: { agencyId: 2 }, body: {} };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn(),set:vi.fn(),type:vi.fn().mockReturnThis(),send:vi.fn() }; next = vi.fn();
  User.getAgencies.mockResolvedValue([{ id: 2 }]); getUserCapabilities.mockReturnValue({ canViewLibrary: true, canManageLibrary: false });
  Library.findResource.mockResolvedValue({ ...original }); Library.createResource.mockImplementation(async data => ({ ...data, id: 20, version: 1 }));
});
describe('library document API', () => {
  it.each(['provider', 'provider_plus', 'clinical_practice_assistant', 'staff', 'support', 'admin', 'super_admin'])
    ('keeps the database-backed library permission for an active %s with a status-less session', async (role) => {
      const { getUserCapabilities: realCapabilities } = await vi.importActual('../../utils/capabilities.js');
      req.user = { id: 7, role };
      req.userCapabilities = realCapabilities({ id: 7, role, status: 'ACTIVE_EMPLOYEE' });
      getUserCapabilities.mockReturnValue({ canViewLibrary: false, canAccessPlatform: false });
      Library.findResource.mockResolvedValue({ ...original });
      await getResource(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }));
      expect(getUserCapabilities).not.toHaveBeenCalled();
    });
  it('honors a denied server capability instead of re-granting from the session role', async () => {
    req.userCapabilities = { canViewLibrary: false, canAccessPlatform: false };
    await getResource(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(Library.findResource).not.toHaveBeenCalled();
  });

  it('allows a viewer to create an independently owned personal template copy', async () => {
    await copyLibraryDocument(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(Library.createResource).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: 7, sourceResourceId: 10, scope: 'personal', folderId: null, bodyHtml: original.bodyHtml, brandingMode: 'organization' }));
    expect(Library.updateResource).not.toHaveBeenCalled(); expect(Library.grantResourcePermission).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 20, canEdit: true }));
  });
  it('never copies a source the viewer cannot access', async () => {
    Library.findResource.mockResolvedValue(null); await copyLibraryDocument(req, res, next);
    expect(Library.findResource).toHaveBeenCalledWith('10', 2, { userId: 7 }); expect(res.status).toHaveBeenCalledWith(404); expect(Library.createResource).not.toHaveBeenCalled();
  });
  it('enforces agency membership before reading a source', async () => {
    User.getAgencies.mockResolvedValue([]); await copyLibraryDocument(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 })); expect(Library.findResource).not.toHaveBeenCalled();
  });
  it('reports edit permissions for directly shared personal documents', async () => {
    Library.findResource.mockResolvedValue({ ...original, scope: 'personal' }); Library.userCanEditResource.mockResolvedValue(true);
    await getResource(req, res, next); expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ canEdit: true }));
  });
  it('denies view-only edits and requires a version for editable documents', async () => {
    req.body = { bodyHtml: '<p>changed</p>' };
    Library.userCanEditResource.mockResolvedValue(false); await updateResource(req, res, next); expect(res.status).toHaveBeenCalledWith(403);
    Library.userCanEditResource.mockResolvedValue(true); await updateResource(req, res, next); expect(res.status).toHaveBeenCalledWith(428); expect(Library.updateResource).not.toHaveBeenCalled();
  });
  it('returns the version actually written even if another write wins the readback race', async () => {
    req.body = { bodyHtml: '<p>changed</p>', expectedVersion: 4 }; Library.userCanEditResource.mockResolvedValue(true);
    Library.updateResource.mockResolvedValue({ ...original, version: 6 });
    await updateResource(req, res, next); expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ version: 5 }));
  });
  it('distributes separate copies only to agency members, skipping existing copies', async () => {
    req.user.id = 1; req.body = { mode: 'personal_copy', userIds: [7, 8, 999] };
    pool.execute.mockResolvedValue([[{ id: 7 }, { id: 8 }]]);
    Library.findExistingPersonalCopy.mockImplementation(async (id, userId) => userId === 8 ? { id: 88 } : null);
    await distributeResource(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('user_agencies'), [2, 7, 8, 999]);
    expect(Library.createResource).toHaveBeenCalledTimes(1); expect(Library.createResource).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: 7, sourceResourceId: 10, scope: 'personal', brandingMode: 'organization' }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 1, skipped: 1 }));
  });
});

it('serves a private portal preview only after checking tenant and resource visibility',async()=>{
 loadLibraryGooglePreview.mockResolvedValue({buffer:Buffer.from('%PDF-example'),mimeType:'application/pdf',filename:'Guide.pdf'});
 await previewGoogleResource(req,res,next);
 expect(Library.findResource).toHaveBeenCalledWith('10',2,{userId:7});
 expect(loadLibraryGooglePreview).toHaveBeenCalledWith(expect.objectContaining({id:10}));
 expect(res.set).toHaveBeenCalledWith(expect.objectContaining({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}));expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
});
it('never accesses Google for a hidden, archived, or other-agency resource',async()=>{
 Library.findResource.mockResolvedValue(null);await previewGoogleResource(req,res,next);expect(res.status).toHaveBeenCalledWith(404);expect(loadLibraryGooglePreview).not.toHaveBeenCalled();
 Library.findResource.mockResolvedValue({...original,archivedAt:'2026-01-01'});await previewGoogleResource(req,res,next);expect(loadLibraryGooglePreview).not.toHaveBeenCalled();
 User.getAgencies.mockResolvedValue([]);await previewGoogleResource(req,res,next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(loadLibraryGooglePreview).not.toHaveBeenCalled();
});


describe('private PDF library workspace', () => {
  beforeEach(async () => {
    const pdf = await PDFDocument.create(); pdf.addPage([612, 792]);
    StorageService.readObject.mockResolvedValue(Buffer.from(await pdf.save()));
    Library.findResource.mockResolvedValue({ ...original, resourceType: 'file', fileType: 'pdf', filePath: 'uploads/library/agency_2/source.pdf' });
  });
  it.each(['admin', 'support', 'provider'])('blocks %s from another agency before reading the file', async role => {
    req.user.role = role; User.getAgencies.mockResolvedValue([{ id: 3 }]);
    await getLibraryPdfContent(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 })); expect(StorageService.readObject).not.toHaveBeenCalled();
  });
  it('allows platform superadmin only through the explicit resource access check', async () => {
    req.user.role = 'super_admin'; Library.findResource.mockResolvedValue(null);
    await getLibraryPdfContent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404); expect(StorageService.readObject).not.toHaveBeenCalled();
  });
  it('returns PDF bytes with private no-store headers after checking per-resource visibility', async () => {
    await getLibraryPdfContent(req, res, next);
    expect(Library.findResource).toHaveBeenCalledWith('10', 2, { userId: 7 });
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }));
    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
  });
  it('saves a new personal copy under a blocked public prefix, without changing the source or exposing its storage key', async () => {
    req.body = { name: 'My filled form', expectedVersion: 4, entries: [{ kind: 'text', page: 1, x: 40, y: 40, width: 200, height: 30, fontSize: 12, text: 'Sample answer' }], scope: 'organization', ownerUserId: 999 };
    await saveLibraryPdfFilledCopy(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(StorageService.writeObject).toHaveBeenCalledWith(expect.stringMatching(/^phi-documents\/library\/agency_2\/user_7\/.*\.pdf$/), expect.any(Buffer), 'application/pdf', expect.any(Object));
    expect(Library.createResource).toHaveBeenCalledWith(expect.objectContaining({ scope: 'personal', ownerUserId: 7, sourceResourceId: 10, folderId: null, visibility: 'internal', clientShareable: false }));
    expect(Library.updateResource).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ privatePdf: true, fileUrl: null }));
    expect(res.json.mock.calls[0][0].filePath).toBeUndefined();
    const restored = await PDFDocument.load(StorageService.writeObject.mock.calls[0][1]); expect(restored.getPageCount()).toBe(1);
  });
  it('rejects a stale source and cleans up a new file when the database write fails', async () => {
    req.body = { expectedVersion: 3 };
    await saveLibraryPdfFilledCopy(req, res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 })); expect(StorageService.writeObject).not.toHaveBeenCalled();
    next.mockClear(); req.body.expectedVersion = 4; Library.createResource.mockRejectedValue(new Error('Database unavailable'));
    await saveLibraryPdfFilledCopy(req, res, next);
    expect(StorageService.deleteObject).toHaveBeenCalledWith(StorageService.writeObject.mock.calls[0][0]);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Database unavailable' }));
  });
});
