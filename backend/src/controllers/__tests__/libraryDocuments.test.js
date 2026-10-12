import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/Library.model.js', () => ({ default: { setFolderShares: vi.fn(), findResource: vi.fn(), createResource: vi.fn(), userCanEditResource: vi.fn(), updateResource: vi.fn(), recordView: vi.fn(), findExistingPersonalCopy: vi.fn(), logDistribution: vi.fn(), grantResourcePermission: vi.fn(), listResourceShares: vi.fn(), findFolder: vi.fn(), createFolder: vi.fn(), updateFolder: vi.fn(), findOrCreateFolderPath: vi.fn(), ensureDefaultCategories: vi.fn(), listResources: vi.fn() } }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../services/storage.service.js', () => ({ default: { getGCSBucket: vi.fn(), readObject: vi.fn(), writeObject: vi.fn(), deleteObject: vi.fn(), saveLibraryResource: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../utils/meDashboardTenantScope.js', () => ({ pickDashboardContextAgencyId: () => 2, hasTenantAccess: vi.fn() }));
vi.mock('../../utils/capabilities.js', () => ({ getUserCapabilities: vi.fn() }));
vi.mock('../../services/libraryDocument.service.js', () => ({ sanitizeDocumentHtml: value => String(value || ''), validateDocumentBranding: vi.fn(), resolveDocumentLetterhead: vi.fn(), buildDocumentRender: vi.fn(), documentError: (message, status = 400) => Object.assign(new Error(message), { status }) }));
vi.mock('../../services/libraryGooglePreview.service.js',()=>({loadLibraryGooglePreview:vi.fn()}));
import {loadLibraryGooglePreview} from '../../services/libraryGooglePreview.service.js';
import { getLibraryFileContent, setFolderShares, getLibraryPdfContent, saveLibraryPdfFilledCopy, previewGoogleResource, copyLibraryDocument, distributeResource, getResource, updateResource, updateFolder, createFolder, uploadResource, uploadBatchResources, addLinkResource, listResources } from '../library.controller.js';
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
  Library.findFolder.mockResolvedValue({ id: 30, agencyId: 2, scope: 'personal', ownerUserId: 7 });
  Library.createFolder.mockImplementation(async data => ({ ...data, id: 31 }));
  Library.findOrCreateFolderPath.mockResolvedValue({ id: 32 });
  Library.listResources.mockResolvedValue([]);
  StorageService.saveLibraryResource.mockResolvedValue({ path: 'uploads/library/agency_2/guide.pdf' });
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

describe('employee files and folder destinations', () => {
  const personalFolder = { id: 30, agencyId: 2, scope: 'personal', ownerUserId: 7 };
  const file = { originalname: 'Guide.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-file'), size: 9 };
  const operations = [
    { name: 'new nested folder', action: createFolder, setup: () => { req.body = { name: 'My notes', parentFolderId: 30 }; } },
    { name: 'file upload', action: uploadResource, setup: () => { req.body = { folderId: 30 }; req.file = file; } },
    { name: 'folder upload', action: uploadBatchResources, setup: () => { req.body = { folderId: 30, relativePath: ['Resources/Guide.pdf'] }; req.files = [file]; } },
    { name: 'video link', action: addLinkResource, setup: () => { req.body = { folderId: 30, name: 'Using a guide', url: 'https://youtu.be/dQw4w9WgXcQ', linkKind: 'video' }; } }
  ];
  it('creates a personal folder nested in the employee’s own folder with authenticated ownership', async () => {
    req.body = { name: '  Session resources  ', parentFolderId: 30, ownerUserId: 999, agencyId: 3 };
    await createFolder(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(Library.findFolder).toHaveBeenCalledWith(30, 2, { userId: 7 });
    expect(Library.createFolder).toHaveBeenCalledWith(expect.objectContaining({ name: 'Session resources', parentFolderId: 30, agencyId: 2, ownerUserId: 7, createdBy: 7, scope: 'personal' }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
  it('keeps employee uploads personal, unfeatured and owned by the authenticated employee', async () => {
    req.body = { folderId: 30, ownerUserId: 999, featured: 'true' }; req.file = file;
    await uploadResource(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(StorageService.saveLibraryResource).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, uploadedByUserId: 7, fileBuffer: file.buffer }));
    expect(Library.createResource).toHaveBeenCalledWith(expect.objectContaining({ scope: 'personal', ownerUserId: 7, folderId: 30, featured: false, fileType: 'pdf' }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ isMine: true }));
  });
  it('preserves nested folder paths and reuses folders for files in the same uploaded directory', async () => {
    req.body = { folderId: 30, relativePath: ['My documents/Training/Guide.pdf', 'My documents/Training/Notes.txt'], ownerUserId: 999 };
    req.files = [file, { ...file, originalname: 'Notes.txt', mimetype: 'text/plain' }];
    await uploadBatchResources(req, res, next);
    expect(next).not.toHaveBeenCalled(); expect(Library.findOrCreateFolderPath).toHaveBeenCalledTimes(1);
    expect(Library.findOrCreateFolderPath).toHaveBeenCalledWith({ agencyId: 2, parentFolderId: 30, pathParts: ['My documents', 'Training'], ownerUserId: 7, scope: 'personal', createdBy: 7 });
    expect(Library.createResource).toHaveBeenCalledTimes(2);
    for (const [data] of Library.createResource.mock.calls) expect(data).toMatchObject({ folderId: 32, scope: 'personal', ownerUserId: 7, clientShareable: false });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ count: 2 }));
  });
  describe.each(operations)('$name', ({ action, setup }) => {
    it.each([
      ['another person’s shared folder', { ...personalFolder, ownerUserId: 8 }, 403],
      ['an organization folder', { ...personalFolder, scope: 'organization' }, 403],
      ['a hidden or other-agency folder', null, 404],
      ['an archived folder', { ...personalFolder, archivedAt: '2026-10-11' }, 404]
    ])('rejects writing into %s before saving any files or rows', async (label, folder, status) => {
      setup(); Library.findFolder.mockResolvedValue(folder); await action(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status }));
      expect(StorageService.saveLibraryResource).not.toHaveBeenCalled(); expect(Library.createResource).not.toHaveBeenCalled();
      expect(Library.createFolder).not.toHaveBeenCalled(); expect(Library.findOrCreateFolderPath).not.toHaveBeenCalled();
    });
    it('rejects scope mismatch even for a manager who owns the personal folder', async () => {
      setup(); req.body.scope = 'organization'; getUserCapabilities.mockReturnValue({ canViewLibrary: true, canManageLibrary: true });
      await action(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: expect.stringContaining('same access') }));
      expect(Library.createResource).not.toHaveBeenCalled(); expect(Library.createFolder).not.toHaveBeenCalled();
    });
    it('checks tenant membership before checking the folder or saving files', async () => {
      setup(); User.getAgencies.mockResolvedValue([{ id: 3 }]); await action(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 })); expect(Library.findFolder).not.toHaveBeenCalled();
      expect(StorageService.saveLibraryResource).not.toHaveBeenCalled(); expect(Library.createResource).not.toHaveBeenCalled(); expect(Library.createFolder).not.toHaveBeenCalled();
    });
  });
  it('does not let an employee make organization-wide uploads', async () => {
    req.body = { scope: 'organization' }; req.file = file; await uploadResource(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 })); expect(StorageService.saveLibraryResource).not.toHaveBeenCalled();
  });
  it('filters My files by the authenticated user, ignoring caller-supplied owner IDs', async () => {
    req.query = { agencyId: 2, mine: '1', userId: 999, ownerUserId: 999, limit: 20 }; await listResources(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(Library.listResources).toHaveBeenCalledWith(2, expect.objectContaining({ userId: 7, mineOnly: true, limit: 20 }));
  });
  it('applies personal ownership in the database before pagination alongside the existing access checks', async () => {
    const { default: RealLibrary } = await vi.importActual('../../models/Library.model.js'); pool.execute.mockResolvedValue([[]]);
    await RealLibrary.listResources(2, { userId: 7, mineOnly: true, limit: 20, offset: 10 });
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toMatch(/WHERE r\.agency_id = \? AND r\.archived_at IS NULL AND r\.scope = 'personal' AND r\.owner_user_id = \?/);
    expect(sql).toContain('library_permissions'); expect(sql).toContain('LIMIT 20 OFFSET 10'); expect(params).toEqual([2, '7', 2, 7, 7, '7']);
  });
});

describe('video files in the library', () => {
  it('saves a hosted video as a personal library item with a trusted preview', async () => {
    req.body = { name: 'Practice walkthrough', url: 'https://youtu.be/dQw4w9WgXcQ', linkKind: 'video' }; await addLinkResource(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(Library.createResource).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'link', fileType: 'video', externalUrl: req.body.url, scope: 'personal', ownerUserId: 7 }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ fileType: 'video', videoProvider: 'YouTube', videoEmbedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', isMine: true, isGoogleWorkspace: false }));
  });
  it('recognizes existing video provider links without changing their stored rows', async () => {
    Library.findResource.mockResolvedValue({ ...original, resourceType: 'link', fileType: 'link', externalUrl: 'https://vimeo.com/12345678' }); await getResource(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ fileType: 'video', videoProvider: 'Vimeo', videoEmbedUrl: 'https://player.vimeo.com/video/12345678' })); expect(Library.updateResource).not.toHaveBeenCalled();
  });
  it('keeps Drive videos distinct from Google documents without fetching their contents', async () => {
    req.body = { name: 'Private walkthrough', url: 'https://drive.google.com/file/d/Abc-123/view', linkKind: 'video' }; await addLinkResource(req, res, next);
    expect(Library.createResource).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'link', fileType: 'video' }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ isGoogleWorkspace: false, videoProvider: 'Google Drive', videoEmbedUrl: 'https://drive.google.com/file/d/Abc-123/preview' }));
    expect(StorageService.saveLibraryResource).not.toHaveBeenCalled(); expect(loadLibraryGooglePreview).not.toHaveBeenCalled();
  });
  it('retains other hosted videos as external-only files without an arbitrary iframe', async () => {
    req.body = { name: 'Hosted recording', url: 'https://training.example.org/video.mp4', linkKind: 'video' }; await addLinkResource(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ fileType: 'video', videoProvider: 'training.example.org', videoEmbedUrl: null }));
  });
  it.each(['javascript:alert(1)', 'file:///tmp/movie.mp4', 'invalid'])('rejects invalid video URLs: %s', async url => {
    req.body = { name: 'Video', url, linkKind: 'video' }; await addLinkResource(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400); expect(Library.createResource).not.toHaveBeenCalled();
  });
});

describe('moving employee files and folders', () => {
  const sourceFolder = { id: 10, agencyId: 2, ownerUserId: 7, scope: 'personal' };
  beforeEach(() => {
    Library.findResource.mockResolvedValue({ ...original, scope: 'personal', ownerUserId: 7, resourceType: 'file' });
    Library.userCanEditResource.mockResolvedValue(true);
    Library.findFolder.mockImplementation(async id => Number(id) === 10 ? sourceFolder : { id: Number(id), agencyId: 2, ownerUserId: 7, scope: 'personal' });
  });
  it.each([
    ['resource', updateResource, 'folderId'], ['folder', updateFolder, 'parentFolderId']
  ])('allows moving an owned %s to another owned folder or to the root', async (label, action, field) => {
    req.body = { [field]: 30 }; await action(req, res, next); expect(next).not.toHaveBeenCalled();
    expect(Library[label === 'resource' ? 'updateResource' : 'updateFolder']).toHaveBeenCalledWith('10', 2, expect.objectContaining({ [field]: 30 }));
    req.body = { [field]: null }; await action(req, res, next); expect(next).not.toHaveBeenCalled();
    expect(Library[label === 'resource' ? 'updateResource' : 'updateFolder']).toHaveBeenLastCalledWith('10', 2, expect.objectContaining({ [field]: null }));
  });
  it.each([
    ['resource', updateResource, 'folderId'], ['folder', updateFolder, 'parentFolderId']
  ])('denies moving an owned %s into another user’s shared folder', async (label, action, field) => {
    req.body = { [field]: 30 };
    Library.findFolder.mockImplementation(async id => Number(id) === 10 ? sourceFolder : { id: 30, agencyId: 2, ownerUserId: 8, scope: 'personal' });
    await action(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 })); expect(Library.updateResource).not.toHaveBeenCalled(); expect(Library.updateFolder).not.toHaveBeenCalled();
  });
  it.each([
    ['self', 10, []],
    ['descendant', 30, [{ id: 30, parentFolderId: 31 }, { id: 31, parentFolderId: 10 }]],
    ['existing cycle', 30, [{ id: 30, parentFolderId: 31 }, { id: 31, parentFolderId: 30 }]]
  ])('rejects a folder move creating a cycle through %s', async (label, parentFolderId, parents) => {
    const folders = new Map([[10, sourceFolder], ...parents.map(folder => [folder.id, { ...sourceFolder, ...folder }])]);
    Library.findFolder.mockImplementation(async id => folders.get(Number(id))); req.body = { parentFolderId };
    await updateFolder(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: expect.stringContaining('subfolders') })); expect(Library.updateFolder).not.toHaveBeenCalled();
  });
});

it.each(['providers', 'staff'])('prevents a provider owner from bulk distributing to %s', async audience => {
  req.user.id = 1; req.body = { mode: 'view_only', audience };
  await distributeResource(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(pool.execute).not.toHaveBeenCalled();
  expect(Library.grantResourcePermission).not.toHaveBeenCalled();
});
it('allows library managers to distribute to an agency audience', async () => {
  req.userCapabilities = { canViewLibrary: true, canManageLibrary: true };
  req.body = { mode: 'view_only', audience: 'providers' };
  pool.execute.mockResolvedValue([[{ id: 8 }]]);
  await distributeResource(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(Library.grantResourcePermission).toHaveBeenCalledWith(10, 2, 8, 'view');
});
it('filters folder-share IDs through current agency membership', async () => {
  req.body = { userIds: [8, 999], permission: 'view' };
  pool.execute.mockResolvedValue([[{ id: 8 }]]);
  await setFolderShares(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(Library.setFolderShares).toHaveBeenCalledWith(30, 2, [8], 'view');
});
it('hides storage paths for private audio files', async () => {
  Library.findResource.mockResolvedValue({ ...original, resourceType: 'file', fileType: 'audio', filePath: 'phi-documents/library/agency_2/audio.mp3' });
  await getResource(req, res, next);
  const output = res.json.mock.calls[0][0];
  expect(output.privateFile).toBe(true); expect(output.fileUrl).toBeNull(); expect(output.filePath).toBeUndefined(); expect(output.privatePdf).toBe(false);
});
it('blocks private file storage reads for inaccessible, archived and other-agency resources', async () => {
  Library.findResource.mockResolvedValue(null); await getLibraryFileContent(req, res, next); expect(res.status).toHaveBeenCalledWith(404);
  Library.findResource.mockResolvedValue({ ...original, resourceType: 'file', archivedAt: '2026-01-01', filePath: 'phi-documents/library/agency_2/a.mp3' });
  await getLibraryFileContent(req, res, next);
  User.getAgencies.mockResolvedValue([{id:3}]); await getLibraryFileContent(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403})); expect(StorageService.getGCSBucket).not.toHaveBeenCalled();
});
it('streams authorized private audio with download and no-store headers', async () => {
  const { Writable, Readable } = await import('node:stream');
  const chunks = [];
  const response = new Writable({ write(chunk, encoding, callback) { chunks.push(chunk); callback(); } });
  response.set = vi.fn();
  Library.findResource.mockResolvedValue({ ...original, resourceType: 'file', mimeType: 'audio/mpeg', originalFilename: 'Recording.mp3', filePath: 'phi-documents/library/agency_2/a.mp3' });
  const object = { getMetadata: vi.fn().mockResolvedValue([{size:'5'}]), createReadStream: vi.fn(() => Readable.from([Buffer.from('audio')])) };
  StorageService.getGCSBucket.mockResolvedValue({file: vi.fn(() => object)});
  await getLibraryFileContent(req, response, next);
  expect(next).not.toHaveBeenCalled(); expect(Buffer.concat(chunks).toString()).toBe('audio');
  expect(response.set).toHaveBeenCalledWith(expect.objectContaining({'Cache-Control':'private, no-store','Content-Type':'audio/mpeg','Content-Disposition':"attachment; filename*=UTF-8''Recording.mp3"}));
});
