import multer from 'multer';
import Library from '../models/Library.model.js';
import StorageService from '../services/storage.service.js';
import pool from '../config/database.js';
import {
  isGoogleWorkspaceUrl,
  detectGoogleFileType,
  googlePreviewUrl,
  inferFileTypeFromMime,
  parseAudience,
  parseTags
} from '../services/library.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import {
  pickDashboardContextAgencyId,
  hasTenantAccess
} from '../utils/meDashboardTenantScope.js';
import { getUserCapabilities } from '../utils/capabilities.js';

const FILE_MAX = 40 * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain'
]);

export const uploadLibraryFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_MAX },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const okExt = /\.(pdf|docx?|xlsx?|csv|pptx?|jpe?g|png|gif|webp|txt)$/i.test(name);
    if (ALLOWED_MIMES.has(file.mimetype) || okExt) cb(null, true);
    else cb(new Error('Unsupported file type'), false);
  }
});

function resolveAgencyId(req) {
  const fromQuery = Number.parseInt(String(req.query?.agencyId || ''), 10);
  if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;
  const fromBody = Number.parseInt(String(req.body?.agencyId || ''), 10);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody;
  return pickDashboardContextAgencyId(req);
}

async function assertLibraryAccess(req, agencyId, { manage = false } = {}) {
  if (!agencyId) {
    const err = new Error('Agency context is required');
    err.status = 400;
    throw err;
  }
  const ok = await hasTenantAccess(req, agencyId);
  if (!ok) {
    const err = new Error('You do not have access to this organization');
    err.status = 403;
    throw err;
  }
  const caps = getUserCapabilities(req.user, { effectiveRole: req.user?.effectiveRole });
  if (!caps.canViewLibrary && !caps.canAccessPlatform) {
    const err = new Error('Library access denied');
    err.status = 403;
    throw err;
  }
  if (manage && !caps.canManageLibrary) {
    const err = new Error('You do not have permission to manage Library resources');
    err.status = 403;
    throw err;
  }
  return caps;
}

function resolveScope(req, caps) {
  const raw = String(req.body?.scope || req.query?.scope || '').toLowerCase();
  if (raw === 'personal') return 'personal';
  if (raw === 'organization' || raw === 'org') {
    if (!caps.canManageLibrary) {
      const err = new Error('Only admins can add organization-wide Library resources');
      err.status = 403;
      throw err;
    }
    return 'organization';
  }
  // Default: admins → organization; everyone else → personal
  return caps.canManageLibrary ? 'organization' : 'personal';
}

function enrichResource(resource, viewerUserId = null) {
  if (!resource) return null;
  const out = { ...resource };
  if (out.filePath) {
    out.fileUrl = publicUploadsUrlFromStoredPath(out.filePath);
  }
  if (out.externalUrl && isGoogleWorkspaceUrl(out.externalUrl)) {
    out.previewUrl = googlePreviewUrl(out.externalUrl);
    out.isGoogleWorkspace = true;
  } else {
    out.isGoogleWorkspace = false;
    out.previewUrl = out.fileUrl || null;
  }
  if (out.isMine == null && viewerUserId != null) {
    out.isMine =
      out.scope === 'personal' && Number(out.ownerUserId) === Number(viewerUserId);
  }
  return out;
}

export const getHome = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const categories = await Library.ensureDefaultCategories(agencyId);
    const userId = req.user.id;
    const [featured, recentlyUpdated, recentlyViewed, favorites, folders] = await Promise.all([
      Library.listResources(agencyId, { featured: true, userId, limit: 8 }),
      Library.recentlyUpdated(agencyId, 8, userId),
      Library.recentlyViewed(agencyId, userId, 8),
      Library.listResources(agencyId, { favoritesOnly: true, userId, limit: 12 }),
      Library.listFolders(agencyId, { userId })
    ]);
    res.json({
      categories,
      folders: folders.map((f) => f),
      featured: featured.map((r) => enrichResource(r, userId)),
      recentlyUpdated: recentlyUpdated.map((r) => enrichResource(r, userId)),
      recentlyViewed: recentlyViewed.map((r) => enrichResource(r, userId)),
      favorites: favorites.map((r) => enrichResource(r, userId))
    });
  } catch (error) {
    next(error);
  }
};

export const listCategories = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const categories = await Library.ensureDefaultCategories(agencyId);
    res.json(categories);
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId, { manage: true });
    const cat = await Library.updateCategory(req.params.id, agencyId, {
      name: req.body.name,
      description: req.body.description,
      sortOrder: req.body.sortOrder,
      archived: req.body.archived
    });
    if (!cat) return res.status(404).json({ error: { message: 'Category not found' } });
    res.json(cat);
  } catch (error) {
    next(error);
  }
};

export const listFolders = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const parent =
      req.query.parentFolderId === 'null' || req.query.parentFolderId === ''
        ? null
        : req.query.parentFolderId != null
          ? Number(req.query.parentFolderId)
          : undefined;
    const folders = await Library.listFolders(agencyId, {
      parentFolderId: parent,
      includeArchived: req.query.includeArchived === '1',
      userId: req.user.id
    });
    res.json(folders);
  } catch (error) {
    next(error);
  }
};

export const createFolder = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: { message: 'Folder name is required' } });
    const scope = resolveScope(req, caps);
    const folder = await Library.createFolder({
      agencyId,
      name,
      description: req.body.description || null,
      parentFolderId: req.body.parentFolderId ?? null,
      ownerUserId: req.user.id,
      scope,
      createdBy: req.user.id
    });
    res.status(201).json(folder);
  } catch (error) {
    next(error);
  }
};

export const updateFolder = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    const folder = await Library.findFolder(req.params.id, agencyId, { userId: req.user.id });
    if (!folder) return res.status(404).json({ error: { message: 'Folder not found' } });
    const isOwner = Number(folder.ownerUserId) === Number(req.user.id);
    if (!caps.canManageLibrary && !isOwner) {
      return res.status(403).json({ error: { message: 'You can only edit folders you own' } });
    }
    const updated = await Library.updateFolder(req.params.id, agencyId, {
      name: req.body.name,
      description: req.body.description,
      parentFolderId: req.body.parentFolderId,
      archived: req.body.archived
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const listFolderShares = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    const folder = await Library.findFolder(req.params.id, agencyId, { userId: req.user.id });
    if (!folder) return res.status(404).json({ error: { message: 'Folder not found' } });
    const isOwner = Number(folder.ownerUserId) === Number(req.user.id);
    if (!caps.canManageLibrary && !isOwner) {
      return res.status(403).json({ error: { message: 'Only the folder owner can manage sharing' } });
    }
    const shares = await Library.listFolderShares(folder.id, agencyId);
    res.json(shares);
  } catch (error) {
    next(error);
  }
};

export const setFolderShares = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    const folder = await Library.findFolder(req.params.id, agencyId, { userId: req.user.id });
    if (!folder) return res.status(404).json({ error: { message: 'Folder not found' } });
    const isOwner = Number(folder.ownerUserId) === Number(req.user.id);
    if (!caps.canManageLibrary && !isOwner) {
      return res.status(403).json({ error: { message: 'Only the folder owner can manage sharing' } });
    }
    let userIds = Array.isArray(req.body.userIds)
      ? req.body.userIds
      : String(req.body.userIds || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

    // Also accept emails (comma-separated or array) and resolve to agency members
    const emailsRaw = req.body.emails;
    const emails = Array.isArray(emailsRaw)
      ? emailsRaw
      : String(emailsRaw || '')
          .split(/[,;\s]+/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
    if (emails.length) {
      const placeholders = emails.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT DISTINCT u.id
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?
           AND (LOWER(u.email) IN (${placeholders}) OR LOWER(COALESCE(u.work_email, '')) IN (${placeholders}))`,
        [agencyId, ...emails, ...emails]
      );
      userIds = [...userIds, ...(rows || []).map((r) => r.id)];
    }

    const shares = await Library.setFolderShares(
      folder.id,
      agencyId,
      userIds,
      req.body.permission || 'view'
    );
    res.json(shares);
  } catch (error) {
    next(error);
  }
};

export const listTags = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const tags = await Library.listTags(agencyId);
    res.json(tags);
  } catch (error) {
    next(error);
  }
};

export const createTag = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId, { manage: true });
    const tag = await Library.findOrCreateTag(agencyId, req.body.name);
    if (!tag) return res.status(400).json({ error: { message: 'Tag name is required' } });
    res.status(201).json(tag);
  } catch (error) {
    next(error);
  }
};

export const listResources = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    await Library.ensureDefaultCategories(agencyId);
    const folderId =
      req.query.folderId === 'null' || req.query.folderId === 'root'
        ? null
        : req.query.folderId === 'all' || req.query.folderId == null
          ? undefined
          : Number(req.query.folderId);

    const items = await Library.listResources(agencyId, {
      q: req.query.q || null,
      categoryId: req.query.categoryId || null,
      folderId,
      resourceType: req.query.resourceType || null,
      tag: req.query.tag || null,
      featured: req.query.featured,
      includeArchived: req.query.includeArchived === '1',
      sort: req.query.sort || 'updated',
      userId: req.user.id,
      favoritesOnly: req.query.favorites === '1',
      limit: req.query.limit,
      offset: req.query.offset
    });
    res.json(items.map((r) => enrichResource(r, req.user.id)));
  } catch (error) {
    next(error);
  }
};

export const getResource = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const resource = await Library.findResource(req.params.id, agencyId, { userId: req.user.id });
    if (!resource || resource.archivedAt) {
      return res.status(404).json({ error: { message: 'Resource not found' } });
    }
    // Enforce personal visibility
    if (
      resource.scope === 'personal' &&
      Number(resource.ownerUserId) !== Number(req.user.id)
    ) {
      const shares = resource.folderId
        ? await Library.listFolderShares(resource.folderId, agencyId)
        : [];
      const shared = shares.some((s) => Number(s.userId) === Number(req.user.id));
      if (!shared) {
        return res.status(404).json({ error: { message: 'Resource not found' } });
      }
    }
    await Library.recordView(req.user.id, resource.id);
    res.json(enrichResource(resource, req.user.id));
  } catch (error) {
    next(error);
  }
};

export const uploadResource = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    if (!req.file) {
      return res.status(400).json({ error: { message: 'File is required' } });
    }
    const scope = resolveScope(req, caps);
    const name = String(req.body.name || req.file.originalname || 'Untitled').replace(/\.[^.]+$/, '').trim();
    const saved = await StorageService.saveLibraryResource({
      agencyId,
      uploadedByUserId: req.user.id,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const resource = await Library.createResource({
      agencyId,
      name: name || 'Untitled',
      description: req.body.description || null,
      resourceType: 'file',
      fileType: inferFileTypeFromMime(req.file.mimetype, req.file.originalname),
      mimeType: req.file.mimetype,
      originalFilename: req.file.originalname,
      filePath: saved.path,
      fileSizeBytes: req.file.size,
      categoryId: req.body.categoryId || null,
      folderId: req.body.folderId || null,
      ownerUserId: req.user.id,
      scope,
      visibility: req.body.visibility || 'internal',
      audience: parseAudience(req.body.audience),
      featured:
        scope === 'organization' &&
        (req.body.featured === '1' || req.body.featured === true || req.body.featured === 'true'),
      clientShareable:
        req.body.clientShareable === '1' ||
        req.body.clientShareable === true ||
        req.body.clientShareable === 'true',
      tags: parseTags(req.body.tags),
      createdBy: req.user.id
    });

    res.status(201).json(enrichResource(resource, req.user.id));
  } catch (error) {
    next(error);
  }
};

export const addLinkResource = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    const url = String(req.body.url || req.body.externalUrl || '').trim();
    const name = String(req.body.name || '').trim();
    if (!url) return res.status(400).json({ error: { message: 'URL is required' } });
    if (!name) return res.status(400).json({ error: { message: 'Resource name is required' } });

    let parsed;
    try {
      parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
    } catch {
      return res.status(400).json({ error: { message: 'Invalid URL' } });
    }

    const isGoogle = isGoogleWorkspaceUrl(url);
    if (isGoogle && !googlePreviewUrl(url)) {
      return res.status(400).json({
        error: {
          message:
            'Could not parse this Google link. Paste a Docs, Sheets, Slides, or Drive file share URL.'
        }
      });
    }

    const scope = resolveScope(req, caps);
    const resource = await Library.createResource({
      agencyId,
      name,
      description: req.body.description || null,
      resourceType: isGoogle ? 'google_doc' : 'link',
      fileType: isGoogle ? detectGoogleFileType(url) : 'link',
      externalUrl: url,
      categoryId: req.body.categoryId || null,
      folderId: req.body.folderId || null,
      ownerUserId: req.user.id,
      scope,
      visibility: req.body.visibility || 'internal',
      audience: parseAudience(req.body.audience),
      featured: scope === 'organization' && !!req.body.featured,
      clientShareable: !!req.body.clientShareable,
      tags: parseTags(req.body.tags),
      createdBy: req.user.id
    });

    res.status(201).json(enrichResource(resource, req.user.id));
  } catch (error) {
    next(error);
  }
};

export const updateResource = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    const existing = await Library.findResource(req.params.id, agencyId, { userId: req.user.id });
    if (!existing) return res.status(404).json({ error: { message: 'Resource not found' } });
    const canEdit = await Library.userCanEditResource(existing, req.user.id, caps);
    if (!canEdit) {
      return res.status(403).json({ error: { message: 'You can only edit resources you own' } });
    }

    const resource = await Library.updateResource(req.params.id, agencyId, {
      name: req.body.name,
      description: req.body.description,
      categoryId: req.body.categoryId,
      folderId: req.body.folderId,
      visibility: req.body.visibility,
      featured: req.body.featured,
      clientShareable: req.body.clientShareable,
      status: req.body.status,
      reviewDate: req.body.reviewDate,
      externalUrl: req.body.externalUrl ?? req.body.url,
      audience: req.body.audience !== undefined ? parseAudience(req.body.audience) : undefined,
      tags: req.body.tags !== undefined ? parseTags(req.body.tags) : undefined,
      archived: req.body.archived,
      updatedBy: req.user.id,
      userId: req.user.id
    });
    res.json(enrichResource(resource, req.user.id));
  } catch (error) {
    next(error);
  }
};

export const archiveResource = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    const existing = await Library.findResource(req.params.id, agencyId, { userId: req.user.id });
    if (!existing) return res.status(404).json({ error: { message: 'Resource not found' } });
    const canEdit = await Library.userCanEditResource(existing, req.user.id, caps);
    if (!canEdit) {
      return res.status(403).json({ error: { message: 'You can only archive resources you own' } });
    }
    const resource = await Library.updateResource(req.params.id, agencyId, {
      archived: true,
      updatedBy: req.user.id,
      userId: req.user.id
    });
    res.json(enrichResource(resource, req.user.id));
  } catch (error) {
    next(error);
  }
};

export const deleteResource = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId, { manage: true });
    const deleted = await Library.deleteResource(req.params.id, agencyId);
    if (!deleted) return res.status(404).json({ error: { message: 'Resource not found' } });
    if (deleted.filePath) {
      try {
        await StorageService.deleteLibraryResource(deleted.filePath);
      } catch {
        // best-effort
      }
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const downloadResource = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const resource = await Library.findResource(req.params.id, agencyId);
    if (!resource || resource.archivedAt) {
      return res.status(404).json({ error: { message: 'Resource not found' } });
    }
    await Library.recordView(req.user.id, resource.id);
    if (resource.externalUrl) {
      return res.json({
        url: resource.externalUrl,
        previewUrl: isGoogleWorkspaceUrl(resource.externalUrl)
          ? googlePreviewUrl(resource.externalUrl)
          : null,
        kind: resource.resourceType
      });
    }
    if (!resource.filePath) {
      return res.status(404).json({ error: { message: 'No file available' } });
    }
    res.json({
      url: publicUploadsUrlFromStoredPath(resource.filePath),
      kind: 'file',
      filename: resource.originalFilename || resource.name
    });
  } catch (error) {
    next(error);
  }
};

export const listFavorites = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const items = await Library.listResources(agencyId, {
      favoritesOnly: true,
      userId: req.user.id,
      limit: 100
    });
    res.json(items.map((r) => enrichResource(r, req.user.id)));
  } catch (error) {
    next(error);
  }
};

export const addFavorite = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const resource = await Library.findResource(req.params.resourceId, agencyId);
    if (!resource) return res.status(404).json({ error: { message: 'Resource not found' } });
    await Library.addFavorite(req.user.id, resource.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const removeFavorite = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    await Library.removeFavorite(req.user.id, req.params.resourceId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const getRecent = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const [viewed, updated] = await Promise.all([
      Library.recentlyViewed(agencyId, req.user.id, 12),
      Library.recentlyUpdated(agencyId, 12)
    ]);
    res.json({
      viewed: viewed.map((r) => enrichResource(r, req.user.id)),
      updated: updated.map((r) => enrichResource(r, req.user.id))
    });
  } catch (error) {
    next(error);
  }
};
