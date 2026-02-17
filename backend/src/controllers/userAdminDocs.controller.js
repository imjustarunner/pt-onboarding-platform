import UserAdminDoc from '../models/UserAdminDoc.model.js';
import UserAdminDocAccess from '../models/UserAdminDocAccess.model.js';
import User from '../models/User.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import StorageService from '../services/storage.service.js';

const BACKOFFICE_ROLES = new Set(['admin', 'super_admin', 'support']);
const DEFAULT_SIGNED_URL_MINUTES = 10;
const DEFAULT_GRANT_DAYS = 7;
const MIGRATION_HINT = 'Database tables for Admin Documentation are missing. Run database/migrations/248_user_admin_documentation.sql';
const SOFT_DELETE_MIGRATION_HINT = 'Admin Documentation soft-delete columns are missing. Run database/migrations/441_user_admin_docs_soft_delete_audit.sql';
const LEGAL_HOLD_MIGRATION_HINT = 'Admin Documentation legal hold columns are missing. Run database/migrations/442_user_admin_docs_legal_hold.sql';

function isBackoffice(role) {
  return BACKOFFICE_ROLES.has(String(role || '').toLowerCase());
}

function parseIntParam(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function handleMissingAdminDocsTables(error, res) {
  const code = error?.code || error?.errno;
  const msg = String(error?.sqlMessage || error?.message || '');
  if (code === 'ER_NO_SUCH_TABLE' || msg.includes('ER_NO_SUCH_TABLE') || msg.includes("user_admin_docs")) {
    res.status(500).json({ error: { message: MIGRATION_HINT } });
    return true;
  }
  return false;
}

function handleAdminDocsSchemaDrift(error, res) {
  const code = error?.code || error?.errno;
  const msg = String(error?.sqlMessage || error?.message || '').toLowerCase();
  if (code === 'ER_BAD_FIELD_ERROR' || msg.includes('unknown column')) {
    if (msg.includes('is_deleted') || msg.includes('deleted_at') || msg.includes('deleted_by_user_id')) {
      res.status(500).json({ error: { message: SOFT_DELETE_MIGRATION_HINT } });
      return true;
    }
    if (msg.includes('is_legal_hold') || msg.includes('legal_hold_')) {
      res.status(500).json({ error: { message: LEGAL_HOLD_MIGRATION_HINT } });
      return true;
    }
  }
  return false;
}

async function ensureMetadataAccess(req, targetUserId) {
  if (!req.user?.id) {
    const err = new Error('Unauthenticated');
    err.status = 401;
    throw err;
  }

  if (isBackoffice(req.user.role)) return true;

  const requestingUser = await User.findById(req.user.id);
  if (!requestingUser) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }

  const hasStaffAccess = requestingUser.role === 'staff' ||
    requestingUser.has_staff_access === true ||
    requestingUser.has_staff_access === 1 ||
    requestingUser.has_staff_access === '1';

  if (hasStaffAccess) return true;

  // Supervisor + CPA access is mediated through supervisorHasAccess().
  const hasSupervisorStyleAccess = await User.supervisorHasAccess(req.user.id, targetUserId, null);
  if (hasSupervisorStyleAccess) return true;

  const err = new Error('Access denied');
  err.status = 403;
  throw err;
}

async function canViewDocContent(req, docRow) {
  if (!docRow) return false;
  if (isBackoffice(req.user.role)) return true;
  if (docRow.created_by_user_id === req.user.id) return true;

  const grants = await UserAdminDocAccess.listActiveGrantsForGrantee({
    userId: docRow.user_id,
    granteeUserId: req.user.id
  });

  const hasProviderGrant = grants.some((g) => g.doc_id === null);
  const hasDocGrant = grants.some((g) => Number(g.doc_id) === Number(docRow.id));
  return hasProviderGrant || hasDocGrant;
}

function canDeleteDoc(req, docRow) {
  if (!docRow || !req.user?.id) return false;
  if (docRow.is_deleted) return false;
  if (docRow.is_legal_hold) return false;
  if (isBackoffice(req.user.role)) return true;
  return Number(docRow.created_by_user_id) === Number(req.user.id);
}

async function resolveAuditAgencyId(targetUserId, actorUserId) {
  const targetAgencies = await User.getAgencies(targetUserId);
  const targetAgencyId = targetAgencies?.[0]?.id ? Number(targetAgencies[0].id) : null;
  if (targetAgencyId) return targetAgencyId;
  const actorAgencies = await User.getAgencies(actorUserId);
  const actorAgencyId = actorAgencies?.[0]?.id ? Number(actorAgencies[0].id) : null;
  return actorAgencyId || null;
}

async function logAdminDocAudit(req, { actionType, targetUserId, docId, metadata = {} }) {
  try {
    if (!req?.user?.id || !targetUserId) return;
    const agencyId = await resolveAuditAgencyId(targetUserId, req.user.id);
    if (!agencyId) return;
    await AdminAuditLog.logAction({
      actionType,
      actorUserId: req.user.id,
      targetUserId,
      agencyId,
      metadata: {
        ...metadata,
        docId
      }
    });
  } catch (err) {
    // Best effort: never block primary workflow on audit logging failures.
    console.error('[userAdminDocs] Failed to write admin audit log:', err?.message || err);
  }
}

export const listUserAdminDocs = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    await ensureMetadataAccess(req, userId);

    const includeDeleted = String(req.query?.includeDeleted || '').toLowerCase() === 'true' && isBackoffice(req.user.role);
    const docs = await UserAdminDoc.findByUser(userId, { includeDeleted });
    const grants = await UserAdminDocAccess.listActiveGrantsForGrantee({ userId, granteeUserId: req.user.id });
    const latestRequests = await UserAdminDocAccess.findLatestRequestsForRequester({ userId, requestedByUserId: req.user.id });

    const providerGrant = grants.find((g) => g.doc_id === null) || null;
    const grantByDocId = new Map(grants.filter((g) => g.doc_id !== null).map((g) => [Number(g.doc_id), g]));

    const reqByDocKey = new Map(latestRequests.map((r) => [Number(r.doc_id || 0), r]));
    const providerRequest = reqByDocKey.get(0) || null;

    const out = (docs || []).map((d) => {
      const createdByName = [d.created_by_first_name, d.created_by_last_name].filter(Boolean).join(' ')
        || d.created_by_email
        || `User ${d.created_by_user_id}`;

      const hasNote = !!(d.note_text && String(d.note_text).trim().length > 0);
      const hasFile = !!(d.storage_path && String(d.storage_path).trim().length > 0);

      const isCreator = Number(d.created_by_user_id) === Number(req.user.id);
      const g = providerGrant || grantByDocId.get(Number(d.id)) || null;
      const canView = d.is_deleted ? isBackoffice(req.user.role) : (isBackoffice(req.user.role) || isCreator || !!g);
      const canDelete = canDeleteDoc(req, d);
      const deletedByName = [d.deleted_by_first_name, d.deleted_by_last_name].filter(Boolean).join(' ')
        || d.deleted_by_email
        || (d.deleted_by_user_id ? `User ${d.deleted_by_user_id}` : null);
      const legalHoldSetByName = [d.legal_hold_set_by_first_name, d.legal_hold_set_by_last_name].filter(Boolean).join(' ')
        || d.legal_hold_set_by_email
        || (d.legal_hold_set_by_user_id ? `User ${d.legal_hold_set_by_user_id}` : null);
      const legalHoldReleasedByName = [d.legal_hold_released_by_first_name, d.legal_hold_released_by_last_name].filter(Boolean).join(' ')
        || d.legal_hold_released_by_email
        || (d.legal_hold_released_by_user_id ? `User ${d.legal_hold_released_by_user_id}` : null);

      const r = reqByDocKey.get(Number(d.id)) || providerRequest || null;

      return {
        id: d.id,
        userId: d.user_id,
        title: d.title,
        docType: d.doc_type,
        createdAt: d.created_at,
        createdByUserId: d.created_by_user_id,
        createdByName,
        hasNote,
        hasFile,
        canView,
        canDelete,
        isDeleted: !!d.is_deleted,
        deletedAt: d.deleted_at || null,
        deletedByUserId: d.deleted_by_user_id || null,
        deletedByName,
        isLegalHold: !!d.is_legal_hold,
        legalHoldReason: d.legal_hold_reason || null,
        legalHoldSetAt: d.legal_hold_set_at || null,
        legalHoldSetByUserId: d.legal_hold_set_by_user_id || null,
        legalHoldSetByName,
        legalHoldReleasedAt: d.legal_hold_released_at || null,
        legalHoldReleasedByUserId: d.legal_hold_released_by_user_id || null,
        legalHoldReleasedByName,
        accessExpiresAt: g?.expires_at || null,
        myLatestRequest: r ? { id: r.id, docId: r.doc_id, status: r.status, requestedAt: r.requested_at } : null
      };
    });

    res.json(out);
  } catch (error) {
    if (handleMissingAdminDocsTables(error, res)) return;
    if (handleAdminDocsSchemaDrift(error, res)) return;
    next(error);
  }
};

export const createUserAdminDocNote = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid userId' } });
    await ensureMetadataAccess(req, userId);

    const title = String(req.body?.title || '').trim();
    const docType = req.body?.docType !== undefined ? String(req.body.docType || '').trim() : null;
    const noteText = String(req.body?.noteText || '').trim();

    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    if (!noteText) return res.status(400).json({ error: { message: 'noteText is required' } });

    const created = await UserAdminDoc.create({
      userId,
      title,
      docType: docType || null,
      noteText,
      storagePath: null,
      originalName: null,
      mimeType: null,
      createdByUserId: req.user.id
    });

    res.status(201).json(created);
  } catch (error) {
    if (handleMissingAdminDocsTables(error, res)) return;
    next(error);
  }
};

export const createUserAdminDocUpload = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid userId' } });
    await ensureMetadataAccess(req, userId);

    const title = String(req.body?.title || '').trim();
    const docType = req.body?.docType !== undefined ? String(req.body.docType || '').trim() : null;
    const noteText = req.body?.noteText !== undefined ? String(req.body.noteText || '').trim() : null;

    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    if (!req.file) return res.status(400).json({ error: { message: 'file upload is required' } });

    const fileBuffer = req.file.buffer;
    const originalName = req.file.originalname || 'document';
    const mimeType = req.file.mimetype || 'application/octet-stream';

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeExt = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
    const filename = `admin-doc-${userId}-${uniqueSuffix}${safeExt}`;

    const storageResult = await StorageService.saveAdminDoc(fileBuffer, filename, mimeType);

    const created = await UserAdminDoc.create({
      userId,
      title,
      docType: docType || null,
      noteText: noteText || null,
      storagePath: storageResult.relativePath,
      originalName,
      mimeType,
      createdByUserId: req.user.id
    });

    res.status(201).json(created);
  } catch (error) {
    if (handleMissingAdminDocsTables(error, res)) return;
    next(error);
  }
};

export const viewUserAdminDoc = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    const docId = parseIntParam(req.params.docId);
    if (!userId || !docId) return res.status(400).json({ error: { message: 'Invalid userId or docId' } });

    await ensureMetadataAccess(req, userId);

    const doc = await UserAdminDoc.findById(docId);
    if (!doc || Number(doc.user_id) !== Number(userId)) {
      return res.status(404).json({ error: { message: 'Admin documentation not found' } });
    }

    const ok = await canViewDocContent(req, doc);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    await UserAdminDocAccess.logOpen({
      docId: doc.id,
      viewerUserId: req.user.id,
      ip: req.ip || null,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 255) || null
    });

    const hasFile = !!doc.storage_path;
    const hasNote = !!(doc.note_text && String(doc.note_text).trim().length > 0);

    if (hasFile) {
      const url = await StorageService.getSignedUrl(doc.storage_path, DEFAULT_SIGNED_URL_MINUTES);
      return res.json({
        type: 'file',
        url,
        expiresInMinutes: DEFAULT_SIGNED_URL_MINUTES,
        originalName: doc.original_name || null,
        mimeType: doc.mime_type || null,
        hasNote
      });
    }

    if (hasNote) {
      return res.json({
        type: 'note',
        noteText: doc.note_text
      });
    }

    return res.status(404).json({ error: { message: 'No content found for this entry' } });
  } catch (error) {
    next(error);
  }
};

export const deleteUserAdminDoc = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    const docId = parseIntParam(req.params.docId);
    if (!userId || !docId) return res.status(400).json({ error: { message: 'Invalid userId or docId' } });

    await ensureMetadataAccess(req, userId);

    const doc = await UserAdminDoc.findById(docId);
    if (!doc || Number(doc.user_id) !== Number(userId)) {
      return res.status(404).json({ error: { message: 'Admin documentation not found' } });
    }

    if (!canDeleteDoc(req, doc)) {
      return res.status(403).json({ error: { message: 'Delete access denied' } });
    }

    const deleted = await UserAdminDoc.softDeleteById(doc.id, req.user.id);
    if (!deleted) {
      return res.status(400).json({ error: { message: 'Admin documentation was already deleted' } });
    }

    await logAdminDocAudit(req, {
      actionType: 'admin_doc_deleted',
      targetUserId: userId,
      docId: doc.id,
      metadata: {
        title: doc.title || null,
        hadFile: !!doc.storage_path,
        hadNote: !!(doc.note_text && String(doc.note_text).trim().length > 0)
      }
    });

    return res.json({ success: true });
  } catch (error) {
    if (handleMissingAdminDocsTables(error, res)) return;
    if (handleAdminDocsSchemaDrift(error, res)) return;
    next(error);
  }
};

export const restoreUserAdminDoc = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    const docId = parseIntParam(req.params.docId);
    if (!userId || !docId) return res.status(400).json({ error: { message: 'Invalid userId or docId' } });
    if (!isBackoffice(req.user.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    await ensureMetadataAccess(req, userId);

    const doc = await UserAdminDoc.findById(docId);
    if (!doc || Number(doc.user_id) !== Number(userId)) {
      return res.status(404).json({ error: { message: 'Admin documentation not found' } });
    }
    if (!doc.is_deleted) {
      return res.status(400).json({ error: { message: 'Admin documentation is not deleted' } });
    }

    const restored = await UserAdminDoc.restoreById(doc.id);
    if (!restored) {
      return res.status(400).json({ error: { message: 'Admin documentation could not be restored' } });
    }

    await logAdminDocAudit(req, {
      actionType: 'admin_doc_restored',
      targetUserId: userId,
      docId: doc.id,
      metadata: { title: doc.title || null }
    });

    return res.json({ success: true });
  } catch (error) {
    if (handleMissingAdminDocsTables(error, res)) return;
    if (handleAdminDocsSchemaDrift(error, res)) return;
    next(error);
  }
};

export const setUserAdminDocLegalHold = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    const docId = parseIntParam(req.params.docId);
    if (!userId || !docId) return res.status(400).json({ error: { message: 'Invalid userId or docId' } });
    if (!isBackoffice(req.user.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    await ensureMetadataAccess(req, userId);

    const doc = await UserAdminDoc.findById(docId);
    if (!doc || Number(doc.user_id) !== Number(userId)) {
      return res.status(404).json({ error: { message: 'Admin documentation not found' } });
    }

    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: { message: 'Legal hold reason is required' } });
    }

    await UserAdminDoc.setLegalHoldById(doc.id, { reason, actorUserId: req.user.id });
    await logAdminDocAudit(req, {
      actionType: 'admin_doc_legal_hold_set',
      targetUserId: userId,
      docId: doc.id,
      metadata: {
        title: doc.title || null,
        reason
      }
    });

    return res.json({ success: true });
  } catch (error) {
    if (handleMissingAdminDocsTables(error, res)) return;
    if (handleAdminDocsSchemaDrift(error, res)) return;
    next(error);
  }
};

export const releaseUserAdminDocLegalHold = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    const docId = parseIntParam(req.params.docId);
    if (!userId || !docId) return res.status(400).json({ error: { message: 'Invalid userId or docId' } });
    if (!isBackoffice(req.user.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    await ensureMetadataAccess(req, userId);

    const doc = await UserAdminDoc.findById(docId);
    if (!doc || Number(doc.user_id) !== Number(userId)) {
      return res.status(404).json({ error: { message: 'Admin documentation not found' } });
    }
    if (!doc.is_legal_hold) {
      return res.status(400).json({ error: { message: 'Legal hold is not active for this entry' } });
    }

    const released = await UserAdminDoc.releaseLegalHoldById(doc.id, req.user.id);
    if (!released) {
      return res.status(400).json({ error: { message: 'Legal hold could not be released' } });
    }

    await logAdminDocAudit(req, {
      actionType: 'admin_doc_legal_hold_released',
      targetUserId: userId,
      docId: doc.id,
      metadata: {
        title: doc.title || null
      }
    });

    return res.json({ success: true });
  } catch (error) {
    if (handleMissingAdminDocsTables(error, res)) return;
    if (handleAdminDocsSchemaDrift(error, res)) return;
    next(error);
  }
};

export const createAdminDocAccessRequest = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    await ensureMetadataAccess(req, userId);

    const bodyDocId = req.body?.docId !== undefined && req.body?.docId !== null && req.body?.docId !== ''
      ? parseIntParam(req.body.docId)
      : null;
    const scope = String(req.body?.scope || '').trim().toLowerCase(); // optional: 'provider'
    const reason = req.body?.reason !== undefined ? String(req.body.reason || '').trim() : null;

    const docId = scope === 'provider' ? null : (bodyDocId || null);

    if (docId) {
      const doc = await UserAdminDoc.findById(docId);
      if (!doc || Number(doc.user_id) !== Number(userId)) {
        return res.status(404).json({ error: { message: 'Admin documentation not found' } });
      }
      const ok = await canViewDocContent(req, doc);
      if (ok) return res.json({ status: 'already_has_access' });
    } else {
      // provider-scope: if already has a provider-scope grant, no request needed
      if (isBackoffice(req.user.role)) return res.json({ status: 'already_has_access' });
      const grants = await UserAdminDocAccess.listActiveGrantsForGrantee({ userId, granteeUserId: req.user.id });
      if (grants.some((g) => g.doc_id === null)) return res.json({ status: 'already_has_access' });
    }

    const pending = await UserAdminDocAccess.findPendingRequest({ userId, docId, requestedByUserId: req.user.id });
    if (pending) return res.json({ status: 'pending', request: pending });

    const created = await UserAdminDocAccess.createRequest({
      userId,
      docId,
      requestedByUserId: req.user.id,
      reason: reason || null
    });

    res.status(201).json({ status: 'pending', request: created });
  } catch (error) {
    next(error);
  }
};

export const listAdminDocAccessRequests = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    await ensureMetadataAccess(req, userId);

    const includeAll = isBackoffice(req.user.role);
    const rows = await UserAdminDocAccess.listRequestsForUser({
      userId,
      includeAll,
      requestedByUserId: req.user.id
    });

    res.json(rows || []);
  } catch (error) {
    next(error);
  }
};

export const approveAdminDocAccessRequest = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    const requestId = parseIntParam(req.params.requestId);
    if (!userId || !requestId) return res.status(400).json({ error: { message: 'Invalid userId or requestId' } });

    if (!isBackoffice(req.user.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const request = await UserAdminDocAccess.findRequestById(requestId);
    if (!request || Number(request.user_id) !== Number(userId)) {
      return res.status(404).json({ error: { message: 'Request not found' } });
    }
    if (String(request.status || '').toLowerCase() !== 'pending') {
      return res.status(400).json({ error: { message: `Request is ${request.status}` } });
    }

    // Determine expiry
    let expiresAt = null;
    const rawExpiresAt = req.body?.expiresAt;
    if (rawExpiresAt) {
      const d = new Date(rawExpiresAt);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: { message: 'Invalid expiresAt' } });
      }
      expiresAt = d;
    } else {
      expiresAt = new Date(Date.now() + (DEFAULT_GRANT_DAYS * 24 * 60 * 60 * 1000));
    }

    const approved = await UserAdminDocAccess.approveRequest({ requestId, reviewedByUserId: req.user.id });
    const grant = await UserAdminDocAccess.createGrant({
      userId,
      docId: approved.doc_id || null,
      granteeUserId: approved.requested_by_user_id,
      grantedByUserId: req.user.id,
      expiresAt
    });

    res.json({ request: approved, grant });
  } catch (error) {
    next(error);
  }
};

export const denyAdminDocAccessRequest = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    const requestId = parseIntParam(req.params.requestId);
    if (!userId || !requestId) return res.status(400).json({ error: { message: 'Invalid userId or requestId' } });

    if (!isBackoffice(req.user.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const request = await UserAdminDocAccess.findRequestById(requestId);
    if (!request || Number(request.user_id) !== Number(userId)) {
      return res.status(404).json({ error: { message: 'Request not found' } });
    }
    if (String(request.status || '').toLowerCase() !== 'pending') {
      return res.status(400).json({ error: { message: `Request is ${request.status}` } });
    }

    const denied = await UserAdminDocAccess.denyRequest({ requestId, reviewedByUserId: req.user.id });
    res.json({ request: denied });
  } catch (error) {
    next(error);
  }
};

export const listAdminDocAccessGrants = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid userId' } });
    if (!isBackoffice(req.user.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const rows = await UserAdminDocAccess.listGrantsForUser({ userId });
    res.json(rows || []);
  } catch (error) {
    next(error);
  }
};

export const revokeAdminDocAccessGrant = async (req, res, next) => {
  try {
    const userId = parseIntParam(req.params.userId);
    const grantId = parseIntParam(req.params.grantId);
    if (!userId || !grantId) return res.status(400).json({ error: { message: 'Invalid userId or grantId' } });
    if (!isBackoffice(req.user.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    // Best-effort: ensure it belongs to this user
    const grants = await UserAdminDocAccess.listGrantsForUser({ userId });
    const target = (grants || []).find((g) => Number(g.id) === Number(grantId));
    if (!target) return res.status(404).json({ error: { message: 'Grant not found' } });

    const updated = await UserAdminDocAccess.revokeGrant({ grantId, revokedByUserId: req.user.id });
    res.json({ grant: updated });
  } catch (error) {
    next(error);
  }
};

