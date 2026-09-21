import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/Library.model.js', () => ({ default: { findResource: vi.fn(), createResource: vi.fn(), userCanEditResource: vi.fn(), updateResource: vi.fn(), recordView: vi.fn(), findExistingPersonalCopy: vi.fn(), logDistribution: vi.fn(), grantResourcePermission: vi.fn(), listResourceShares: vi.fn() } }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../services/storage.service.js', () => ({ default: {} }));
vi.mock('../../utils/meDashboardTenantScope.js', () => ({ pickDashboardContextAgencyId: () => 2, hasTenantAccess: vi.fn() }));
vi.mock('../../utils/capabilities.js', () => ({ getUserCapabilities: vi.fn() }));
vi.mock('../../services/libraryDocument.service.js', () => ({ sanitizeDocumentHtml: value => String(value || ''), validateDocumentBranding: vi.fn(), resolveDocumentLetterhead: vi.fn(), buildDocumentRender: vi.fn(), documentError: (message, status = 400) => Object.assign(new Error(message), { status }) }));
import { copyLibraryDocument, distributeResource, getResource, updateResource } from '../library.controller.js';
import Library from '../../models/Library.model.js';
import pool from '../../config/database.js';
import { hasTenantAccess } from '../../utils/meDashboardTenantScope.js';
import { getUserCapabilities } from '../../utils/capabilities.js';
const original = { id: 10, agencyId: 2, ownerUserId: 1, scope: 'organization', name: 'Safety plan', bodyHtml: '<p>Blank responses</p>', resourceType: 'branded_doc', brandingMode: 'organization', letterheadTemplateId: null, version: 4 };
let req, res, next;
beforeEach(() => {
  vi.resetAllMocks();
  req = { params: { id: '10' }, user: { id: 7, role: 'provider' }, query: { agencyId: 2 }, body: {} };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
  hasTenantAccess.mockResolvedValue(true); getUserCapabilities.mockReturnValue({ canViewLibrary: true, canManageLibrary: false });
  Library.findResource.mockResolvedValue({ ...original }); Library.createResource.mockImplementation(async data => ({ ...data, id: 20, version: 1 }));
});
describe('library document API', () => {
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
    hasTenantAccess.mockResolvedValue(false); await copyLibraryDocument(req, res, next);
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
