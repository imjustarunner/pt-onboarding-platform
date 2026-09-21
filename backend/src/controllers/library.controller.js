import { sanitizeDocumentHtml, validateDocumentBranding, resolveDocumentLetterhead, buildDocumentRender, documentError } from '../services/libraryDocument.service.js';
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

export const uploadLibraryFiles = uploadLibraryFile;

function isEditableLibraryType(resourceType) {
  return String(resourceType || '').toLowerCase() === 'branded_doc';
}

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
  if (out.resourceType === 'branded_doc') out.bodyHtml = sanitizeDocumentHtml(out.bodyHtml);
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
    const caps = await assertLibraryAccess(req, agencyId);
    const resource = await Library.findResource(req.params.id, agencyId, { userId: req.user.id });
    if (!resource || resource.archivedAt) {
      return res.status(404).json({ error: { message: 'Resource not found' } });
    }
    await Library.recordView(req.user.id, resource.id);
    res.json({ ...enrichResource(resource, req.user.id), canEdit: !resource.archivedAt && await Library.userCanEditResource(resource, req.user.id, caps) });
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

/**
 * Bulk upload: multipart files[] with relativePath[] (webkitRelativePath).
 * Creates nested folders under optional parent folderId, then file resources.
 */
export const uploadBatchResources = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ error: { message: 'At least one file is required' } });
    }

    const scope = resolveScope(req, caps);
    const parentFolderId = req.body.folderId ? Number(req.body.folderId) : null;
    const relativePaths = Array.isArray(req.body.relativePath)
      ? req.body.relativePath
      : (req.body.relativePath != null ? [req.body.relativePath] : []);

    const created = [];
    const folderCache = new Map();

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const rel = String(relativePaths[i] || file.originalname || '').replace(/\\/g, '/');
      const parts = rel.split('/').filter(Boolean);
      const fileName = parts.pop() || file.originalname;
      const folderParts = parts;

      let folderId = parentFolderId;
      if (folderParts.length) {
        const cacheKey = `${parentFolderId || 'root'}::${folderParts.join('/')}`;
        if (folderCache.has(cacheKey)) {
          folderId = folderCache.get(cacheKey);
        } else {
          const folder = await Library.findOrCreateFolderPath({
            agencyId,
            parentFolderId,
            pathParts: folderParts,
            ownerUserId: req.user.id,
            scope,
            createdBy: req.user.id
          });
          folderId = folder?.id != null ? Number(folder.id) : parentFolderId;
          folderCache.set(cacheKey, folderId);
        }
      }

      const saved = await StorageService.saveLibraryResource({
        agencyId,
        uploadedByUserId: req.user.id,
        fileBuffer: file.buffer,
        filename: fileName,
        contentType: file.mimetype
      });

      const name = String(fileName || 'Untitled').replace(/\.[^.]+$/, '').trim() || 'Untitled';
      const resource = await Library.createResource({
        agencyId,
        name,
        description: null,
        resourceType: 'file',
        fileType: inferFileTypeFromMime(file.mimetype, fileName),
        mimeType: file.mimetype,
        originalFilename: fileName,
        filePath: saved.path,
        fileSizeBytes: file.size,
        categoryId: req.body.categoryId || null,
        folderId,
        ownerUserId: req.user.id,
        scope,
        visibility: 'internal',
        featured: false,
        clientShareable: false,
        createdBy: req.user.id
      });
      created.push(enrichResource(resource, req.user.id));
    }

    res.status(201).json({ ok: true, count: created.length, resources: created });
  } catch (error) {
    next(error);
  }
};

export const suggestResourceMetadata = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);

    const {
      extractTextFromUploadBuffer,
      suggestLibraryMetadata
    } = await import('../services/librarySuggestMetadata.service.js');

    let textExcerpt = String(req.body.textExcerpt || '').trim();
    if (!textExcerpt && req.file?.buffer) {
      textExcerpt = await extractTextFromUploadBuffer({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        filename: req.file.originalname
      });
    }

    const suggestion = await suggestLibraryMetadata({
      agencyId,
      name: req.body.name || '',
      filename: req.file?.originalname || req.body.filename || '',
      mimeType: req.file?.mimetype || req.body.mimeType || '',
      textExcerpt,
      url: req.body.url || ''
    });

    res.json(suggestion);
  } catch (error) {
    next(error);
  }
};

export const createBrandedDoc = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    const name = String(req.body.name || '').trim();
    if (!name || name.length > 255) return res.status(400).json({ error: { message: 'Resource name must contain 1–255 characters' } });

    const bodyHtml = sanitizeDocumentHtml(req.body.bodyHtml || req.body.html || '<p></p>');
    const brandingMode = req.body.brandingMode || (req.body.letterheadTemplateId ? 'letterhead' : 'organization');
    await validateDocumentBranding({ agencyId, brandingMode, letterheadTemplateId: req.body.letterheadTemplateId });
    if (!bodyHtml) {
      return res.status(400).json({ error: { message: 'Document body is required' } });
    }

    const scope = resolveScope(req, caps);
    const resource = await Library.createResource({
      agencyId,
      name,
      description: req.body.description || null,
      resourceType: 'branded_doc',
      fileType: 'branded_doc',
      mimeType: 'text/html',
      bodyHtml,
      letterheadTemplateId: brandingMode === 'letterhead' ? Number(req.body.letterheadTemplateId) : null,
      brandingMode,
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

export const renderBrandedDocPdf = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const resource = await Library.findResource(req.params.id, agencyId, { userId: req.user.id });
    if (!resource || resource.archivedAt || resource.resourceType !== 'branded_doc') {
      return res.status(404).json({ error: { message: 'Branded document not found' } });
    }

    const letterhead = await resolveDocumentLetterhead(resource);
    const rendered = buildDocumentRender(resource, letterhead);
    const DocumentSigningService = (await import('../services/documentSigning.service.js')).default;
    const pdf = await DocumentSigningService.convertHTMLToPDF(rendered.html, rendered.options);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${String(resource.name || 'document').replace(/[^\w.-]+/g, '_')}.pdf"`
    );
    res.send(pdf);
  } catch (error) {
    next(error);
  }
};

export const listLetterheadsForLibrary = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const LetterheadTemplate = (await import('../models/LetterheadTemplate.model.js')).default;
    const list = await LetterheadTemplate.list({
      agencyId,
      organizationId: Number(req.query.organizationId) || null,
      includePlatform: true,
      includeInactive: false
    });
    res.json(
      (list || []).map((lh) => ({
        id: lh.id,
        name: lh.name,
        agencyId: lh.agency_id,
        isPlatform: !lh.agency_id
      }))
    );
  } catch (error) {
    next(error);
  }
};

// The preview uses the same renderer as the saved document, including page breaks.
export const previewLibraryDocument = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const document = { agencyId, organizationId: req.body.organizationId || null, name: String(req.body.name || 'Document'),
      bodyHtml: sanitizeDocumentHtml(req.body.bodyHtml), brandingMode: req.body.brandingMode || 'plain',
      letterheadTemplateId: req.body.letterheadTemplateId || null };
    const letterhead = await resolveDocumentLetterhead(document);
    const rendered = buildDocumentRender(document, letterhead);
    const DocumentSigningService = (await import('../services/documentSigning.service.js')).default;
    const pdf = await DocumentSigningService.convertHTMLToPDF(rendered.html, rendered.options);
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('application/pdf').send(pdf);
  } catch (error) { next(error); }
};

export const copyLibraryDocument = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const source = await Library.findResource(req.params.id, agencyId, { userId: req.user.id });
    if (!source || source.archivedAt || source.resourceType !== 'branded_doc') {
      return res.status(404).json({ error: { message: 'Document not found' } });
    }
    const brandingMode = req.body.brandingMode || source.brandingMode;
    const letterheadTemplateId = req.body.letterheadTemplateId !== undefined ? req.body.letterheadTemplateId : source.letterheadTemplateId;
    await validateDocumentBranding({ agencyId, organizationId: source.organizationId, brandingMode, letterheadTemplateId });
    const name = String(req.body.name || `${source.name} — My copy`).trim();
    if (!name || name.length > 255) throw documentError('Document name must contain 1–255 characters');
    const copy = await Library.createResource({ agencyId, organizationId: source.organizationId,
      name, description: source.description, resourceType: 'branded_doc', fileType: 'branded_doc', mimeType: 'text/html',
      bodyHtml: sanitizeDocumentHtml(req.body.bodyHtml ?? source.bodyHtml),
      brandingMode, letterheadTemplateId: brandingMode === 'letterhead' ? letterheadTemplateId : null,
      ownerUserId: req.user.id, sourceResourceId: source.id, scope: 'personal', visibility: 'internal',
      categoryId: source.categoryId, folderId: null, createdBy: req.user.id });
    res.status(201).json({ ...enrichResource(copy, req.user.id), canEdit: true });
  } catch (error) { next(error); }
};

export const exportLibraryDocumentWord = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const document = await Library.findResource(req.params.id, agencyId, { userId: req.user.id });
    if (!document || document.archivedAt || document.resourceType !== 'branded_doc') {
      return res.status(404).json({ error: { message: 'Document not found' } });
    }
    const letterhead = await resolveDocumentLetterhead(document);
    // Word does not support the PDF's fixed-position CSS watermark; an inline
    // image here would push the actual document onto later pages.
    const rendered = buildDocumentRender(document, letterhead, { includeWatermark: false });
    const HTMLtoDOCX = (await import('html-to-docx')).default;
    const buffer = await HTMLtoDOCX(rendered.html, letterhead.headerHtml || '<p></p>', {
      title: document.name, header: true, footer: true, pageNumber: true,
      orientation: letterhead.orientation,
      pageSize: letterhead.pageSize === 'a4' ? { width: 11906, height: 16838 } : { width: 12240, height: 15840 },
      margins: Object.fromEntries(Object.entries(rendered.options.margin).map(([key, value]) => [key, Math.round(parseFloat(value) * 1440)]))
    }, letterhead.footerHtml || '<p></p>');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `attachment; filename="${String(document.name).replace(/[^\w.-]+/g, '_')}.docx"`);
    res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').send(buffer);
  } catch (error) { next(error); }
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

    const documentEdit = ['bodyHtml', 'letterheadTemplateId', 'brandingMode', 'name'].some((key) => req.body[key] !== undefined);
    let brandingMode = req.body.brandingMode ?? existing.brandingMode;
    let letterheadTemplateId = req.body.letterheadTemplateId !== undefined ? req.body.letterheadTemplateId : existing.letterheadTemplateId;
    if (existing.resourceType === 'branded_doc' && documentEdit) {
      if (!Number.isSafeInteger(req.body.expectedVersion) || req.body.expectedVersion < 1) {
        return res.status(428).json({ error: { message: 'Reload the document before saving so its version can be checked.' } });
      }
      if (existing.archivedAt) throw documentError('Archived documents cannot be edited');
      if (req.body.name !== undefined && (!String(req.body.name).trim() || String(req.body.name).length > 255)) throw documentError('Document name must contain 1–255 characters');
      await validateDocumentBranding({ agencyId, organizationId: existing.organizationId, brandingMode, letterheadTemplateId });
      if (brandingMode !== 'letterhead') letterheadTemplateId = null;
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
      bodyHtml: req.body.bodyHtml !== undefined ? sanitizeDocumentHtml(req.body.bodyHtml) : undefined,
      brandingMode: documentEdit ? brandingMode : undefined,
      expectedVersion: existing.resourceType === 'branded_doc' && documentEdit ? req.body.expectedVersion : undefined,
      letterheadTemplateId: documentEdit ? letterheadTemplateId : undefined,
      audience: req.body.audience !== undefined ? parseAudience(req.body.audience) : undefined,
      tags: req.body.tags !== undefined ? parseTags(req.body.tags) : undefined,
      archived: req.body.archived,
      updatedBy: req.user.id,
      userId: req.user.id
    });
    res.json({ ...enrichResource(resource, req.user.id),
      // A later save can happen between our atomic UPDATE and the readback.
      // Return the version this request wrote, never the later writer's token.
      ...(existing.resourceType === 'branded_doc' && documentEdit ? { version: req.body.expectedVersion + 1 } : {}),
      canEdit: true });
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
    const resource = await Library.findResource(req.params.id, agencyId, { userId: req.user.id });
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
    const resource = await Library.findResource(req.params.resourceId, agencyId, { userId: req.user.id });
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
      Library.recentlyUpdated(agencyId, 12, req.user.id)
    ]);
    res.json({
      viewed: viewed.map((r) => enrichResource(r, req.user.id)),
      updated: updated.map((r) => enrichResource(r, req.user.id))
    });
  } catch (error) {
    next(error);
  }
};

async function resolveDistributeRecipients(agencyId, { emails, userIds, audience }) {
  const ids = new Set(
    (Array.isArray(userIds) ? userIds : String(userIds || '').split(','))
      .map((s) => Number(String(s).trim()))
      .filter((n) => n > 0)
  );

  const emailsRaw = emails;
  const emailList = Array.isArray(emailsRaw)
    ? emailsRaw
    : String(emailsRaw || '')
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
  if (emailList.length) {
    const placeholders = emailList.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND (LOWER(u.email) IN (${placeholders}) OR LOWER(COALESCE(u.work_email, '')) IN (${placeholders})
              OR LOWER(COALESCE(u.personal_email, '')) IN (${placeholders}))`,
      [agencyId, ...emailList, ...emailList, ...emailList]
    );
    for (const r of rows || []) ids.add(Number(r.id));
  }

  const aud = String(audience || '').toLowerCase();
  if (aud === 'providers') {
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND LOWER(COALESCE(u.role, '')) IN ('provider', 'provider_plus', 'clinician')`,
      [agencyId]
    );
    for (const r of rows || []) ids.add(Number(r.id));
  } else if (aud === 'staff') {
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND LOWER(COALESCE(u.role, '')) IN (
           'admin', 'super_admin', 'support', 'staff', 'provider', 'provider_plus',
           'supervisor', 'clinical_practice_assistant', 'intern', 'intern_plus', 'clinician'
         )`,
      [agencyId]
    );
    for (const r of rows || []) ids.add(Number(r.id));
  }

  const candidates = [...ids].filter(Number.isSafeInteger);
  if (!candidates.length) return [];
  // Explicit user IDs must belong to this agency, just like email/audience recipients.
  const [members] = await pool.execute(
    `SELECT DISTINCT user_id AS id FROM user_agencies WHERE agency_id = ? AND user_id IN (${candidates.map(() => '?').join(',')})`,
    [agencyId, ...candidates]
  );
  return members.map(row => Number(row.id));
}

export const listResourceShares = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    const resource = await Library.findResource(req.params.id, agencyId, { userId: req.user.id });
    if (!resource) return res.status(404).json({ error: { message: 'Resource not found' } });
    const isOwner = Number(resource.ownerUserId) === Number(req.user.id);
    if (!caps.canManageLibrary && !isOwner) {
      return res.status(403).json({ error: { message: 'Only the owner or library managers can view shares' } });
    }
    const shares = await Library.listResourceShares(resource.id, agencyId);
    res.json(shares);
  } catch (error) {
    next(error);
  }
};

export const setResourceShares = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    const resource = await Library.findResource(req.params.id, agencyId, { userId: req.user.id });
    if (!resource) return res.status(404).json({ error: { message: 'Resource not found' } });
    const isOwner = Number(resource.ownerUserId) === Number(req.user.id);
    if (!caps.canManageLibrary && !isOwner) {
      return res.status(403).json({ error: { message: 'Only the owner or library managers can manage shares' } });
    }
    const recipientIds = await resolveDistributeRecipients(agencyId, {
      emails: req.body.emails,
      userIds: req.body.userIds
    });
    const permission = String(req.body.permission || 'view').toLowerCase() === 'edit' ? 'edit' : 'view';
    const shares = await Library.setResourceShares(resource.id, agencyId, recipientIds, permission);
    res.json(shares);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /resources/:id/distribute
 * mode: view_only | collaborate | personal_copy
 */
export const distributeResource = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    const caps = await assertLibraryAccess(req, agencyId);
    const resource = await Library.findResource(req.params.id, agencyId, { userId: req.user.id });
    if (!resource || resource.archivedAt) {
      return res.status(404).json({ error: { message: 'Resource not found' } });
    }

    const isOwner = Number(resource.ownerUserId) === Number(req.user.id);
    if (!caps.canManageLibrary && !isOwner) {
      return res.status(403).json({
        error: { message: 'Only library managers or the resource owner can distribute this item' }
      });
    }

    const mode = String(req.body.mode || '').toLowerCase();
    if (!['view_only', 'collaborate', 'personal_copy'].includes(mode)) {
      return res.status(400).json({
        error: { message: 'mode must be view_only, collaborate, or personal_copy' }
      });
    }

    if ((mode === 'collaborate' || mode === 'personal_copy') && !isEditableLibraryType(resource.resourceType)) {
      return res.status(400).json({
        error: {
          message:
            'Personal copy and Collaborate are only available for branded documents created in the app. Uploaded files and links are view-only.'
        }
      });
    }

    const recipientIds = await resolveDistributeRecipients(agencyId, {
      emails: req.body.emails,
      userIds: req.body.userIds,
      audience: req.body.audience
    });
    if (!recipientIds.length) {
      return res.status(400).json({
        error: { message: 'No recipients found. Choose All Providers or enter coworker emails.' }
      });
    }

    const results = [];

    if (mode === 'view_only' || mode === 'collaborate') {
      const permission = mode === 'collaborate' ? 'edit' : 'view';
      for (const uid of recipientIds) {
        await Library.grantResourcePermission(resource.id, agencyId, uid, permission);
        await Library.logDistribution({
          agencyId,
          sourceResourceId: resource.id,
          mode,
          createdBy: req.user.id,
          recipientUserId: uid,
          createdResourceId: null
        });
        results.push({ userId: uid, permission, created: true });
      }
      return res.json({
        ok: true,
        mode,
        count: results.length,
        results,
        shares: await Library.listResourceShares(resource.id, agencyId)
      });
    }

    // personal_copy
    for (const uid of recipientIds) {
      const existing = await Library.findExistingPersonalCopy(resource.id, uid, agencyId);
      if (existing) {
        results.push({
          userId: uid,
          skipped: true,
          reason: 'already_has_copy',
          resourceId: existing.id
        });
        continue;
      }

      let filePath = null;
      let fileSizeBytes = resource.fileSizeBytes;
      if (resource.filePath) {
        try {
          const buf = await StorageService.readObjectBuffer(resource.filePath);
          const saved = await StorageService.saveLibraryResource({
            agencyId,
            uploadedByUserId: uid,
            fileBuffer: buf,
            filename: resource.originalFilename || resource.name || 'copy',
            contentType: resource.mimeType || 'application/octet-stream'
          });
          filePath = saved.path;
          fileSizeBytes = buf.length;
        } catch (err) {
          console.warn('[library] personal copy file clone failed:', err?.message || err);
          results.push({ userId: uid, error: 'file_copy_failed' });
          continue;
        }
      }

      const copy = await Library.createResource({
        agencyId,
        organizationId: resource.organizationId,
        name: resource.name,
        description: resource.description,
        resourceType: resource.resourceType,
        fileType: resource.fileType,
        mimeType: resource.mimeType,
        originalFilename: resource.originalFilename,
        filePath,
        externalUrl: resource.externalUrl,
        bodyHtml: sanitizeDocumentHtml(resource.bodyHtml),
        letterheadTemplateId: resource.letterheadTemplateId || null,
        brandingMode: resource.brandingMode,
        fileSizeBytes,
        categoryId: resource.categoryId,
        folderId: null,
        ownerUserId: uid,
        sourceResourceId: resource.id,
        scope: 'personal',
        visibility: 'internal',
        featured: false,
        clientShareable: false,
        createdBy: req.user.id,
        updatedBy: req.user.id
      });

      await Library.logDistribution({
        agencyId,
        sourceResourceId: resource.id,
        mode: 'personal_copy',
        createdBy: req.user.id,
        recipientUserId: uid,
        createdResourceId: copy.id
      });

      results.push({
        userId: uid,
        created: true,
        resourceId: copy.id
      });
    }

    res.status(201).json({
      ok: true,
      mode: 'personal_copy',
      count: results.filter((r) => r.created).length,
      skipped: results.filter((r) => r.skipped).length,
      results
    });
  } catch (error) {
    next(error);
  }
};

export const listMyCopies = async (req, res, next) => {
  try {
    const agencyId = resolveAgencyId(req);
    await assertLibraryAccess(req, agencyId);
    const copies = await Library.listMyCopies(agencyId, req.user.id, {
      limit: req.query.limit || 50
    });
    res.json(copies.map((r) => enrichResource(r, req.user.id)));
  } catch (error) {
    next(error);
  }
};
