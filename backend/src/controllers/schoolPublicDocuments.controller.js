import pool from '../config/database.js';
import multer from 'multer';
import StorageService from '../services/storage.service.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { isSupervisorActor, supervisorHasSuperviseeInSchool } from '../utils/supervisorSchoolAccess.js';

// Configure multer for memory storage (files will be uploaded to GCS or local fallback)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const allowed = new Set([
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      // Common school uploads
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.ms-excel'
    ]);
    if (allowed.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Invalid file type. Allowed: PDF, JPG, PNG, DOCX, XLSX.'), false);
  }
});

const normalizeUrl = (v) => {
  const s = String(v || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    return u.toString();
  } catch {
    return '';
  }
};

async function resolveActiveAgencyIdForOrg(orgId) {
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
}

function roleCanUseAgencyAffiliation(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'support' || r === 'staff' || r === 'supervisor';
}

async function providerHasSchoolAccess({ providerUserId, schoolOrganizationId }) {
  const uid = parseInt(providerUserId, 10);
  const orgId = parseInt(schoolOrganizationId, 10);
  if (!uid || !orgId) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM provider_school_assignments psa
       WHERE psa.school_organization_id = ?
         AND psa.provider_user_id = ?
         AND psa.is_active = TRUE
       LIMIT 1`,
      [orgId, uid]
    );
    if (rows?.[0]) return true;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE') || msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_provider_assignments cpa
       WHERE cpa.organization_id = ?
         AND cpa.provider_user_id = ?
         AND cpa.is_active = TRUE
       LIMIT 1`,
      [orgId, uid]
    );
    return !!rows?.[0];
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE') || msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR');
    if (missing) return false;
    throw e;
  }
}

async function userHasOrgOrAffiliatedAgencyAccess({ userId, role, schoolOrganizationId }) {
  if (!userId) return false;
  const roleNorm = String(role || '').toLowerCase();
  const userOrgs = await User.getAgencies(userId);
  const hasDirect = (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(schoolOrganizationId, 10));
  if (hasDirect) return true;
  if (roleNorm === 'provider') {
    return await providerHasSchoolAccess({ providerUserId: userId, schoolOrganizationId });
  }
  if (await isSupervisorActor({ userId, role })) {
    const hasSuperviseeSchoolAccess = await supervisorHasSuperviseeInSchool(userId, schoolOrganizationId);
    if (hasSuperviseeSchoolAccess) return true;
  }
  if (!roleCanUseAgencyAffiliation(role)) return false;
  const activeAgencyId = await resolveActiveAgencyIdForOrg(schoolOrganizationId);
  if (!activeAgencyId) return false;
  return (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(activeAgencyId, 10));
}

async function assertSchoolPortalAccess(req, schoolId) {
  const sid = parseInt(String(schoolId || ''), 10);
  if (!sid) {
    const e = new Error('Invalid schoolId');
    e.statusCode = 400;
    throw e;
  }
  const userId = req.user?.id;
  const role = req.user?.role;

  const org = await Agency.findById(sid);
  if (!org) {
    const e = new Error('Organization not found');
    e.statusCode = 404;
    throw e;
  }
  const orgType = String(org.organization_type || 'agency').toLowerCase();
  const allowedTypes = ['school', 'program', 'learning'];
  if (!allowedTypes.includes(orgType)) {
    const e = new Error(`This endpoint is only available for organizations of type: ${allowedTypes.join(', ')}`);
    e.statusCode = 400;
    throw e;
  }

  if (String(role || '').toLowerCase() !== 'super_admin') {
    const ok = await userHasOrgOrAffiliatedAgencyAccess({ userId, role, schoolOrganizationId: sid });
    if (!ok) {
      const e = new Error('You do not have access to this school organization');
      e.statusCode = 403;
      throw e;
    }
  }
  return { sid, org };
}

async function ensureSupervisorReadOnlyWriteDenied(req) {
  if (await isSupervisorActor({ userId: req.user?.id, role: req.user?.role, user: req.user })) {
    const e = new Error('Supervisors have read-only access to school public documents');
    e.statusCode = 403;
    throw e;
  }
}

export const listSchoolPublicDocuments = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const { sid } = await assertSchoolPortalAccess(req, organizationId);

    try {
      const [rows] = await pool.execute(
        `SELECT id, school_organization_id, kind, title, category_key, file_path, link_url, mime_type, original_filename, uploaded_by_user_id, created_at, updated_at
         FROM school_public_documents
         WHERE school_organization_id = ?
         ORDER BY updated_at DESC, id DESC`,
        [sid]
      );
      res.json({ schoolOrganizationId: sid, documents: rows || [] });
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(400).json({ error: { message: 'Public documents are not enabled (missing school_public_documents table).' } });
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

export const createSchoolPublicDocument = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const { organizationId } = req.params;
      const { sid } = await assertSchoolPortalAccess(req, organizationId);
      await ensureSupervisorReadOnlyWriteDenied(req);

      const title = req.body?.title !== undefined ? String(req.body.title || '').trim() : '';
      const categoryKey = req.body?.categoryKey !== undefined ? String(req.body.categoryKey || '').trim() : '';
      const linkUrlRaw = req.body?.linkUrl !== undefined ? req.body.linkUrl : req.body?.link_url;
      const linkUrl = normalizeUrl(linkUrlRaw);

      const kind = linkUrl ? 'link' : 'file';

      if (kind === 'file' && !req.file) {
        return res.status(400).json({ error: { message: 'No file uploaded (or provide a valid linkUrl).' } });
      }
      if (kind === 'link' && !linkUrl) {
        return res.status(400).json({ error: { message: 'linkUrl must be a valid http(s) URL.' } });
      }

      const safeTitle =
        title ||
        (kind === 'file'
          ? (req.file?.originalname ? String(req.file.originalname).trim() : 'Document')
          : 'Link');

      let saved = null;
      if (kind === 'file') {
        saved = await StorageService.saveSchoolPublicDocument({
          schoolOrganizationId: sid,
          uploadedByUserId: req.user?.id || null,
          fileBuffer: req.file.buffer,
          filename: req.file.originalname || `upload-${Date.now()}`,
          contentType: req.file.mimetype
        });
      }

      try {
        const [result] = await pool.execute(
          `INSERT INTO school_public_documents
            (school_organization_id, kind, title, category_key, file_path, link_url, mime_type, original_filename, uploaded_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sid,
            kind,
            safeTitle || null,
            categoryKey || null,
            saved?.path || null,
            linkUrl || null,
            req.file?.mimetype || null,
            req.file?.originalname || null,
            req.user?.id || null
          ]
        );
        const id = Number(result?.insertId || 0);
        const [rows] = await pool.execute(
          `SELECT id, school_organization_id, kind, title, category_key, file_path, link_url, mime_type, original_filename, uploaded_by_user_id, created_at, updated_at
           FROM school_public_documents WHERE id = ? AND school_organization_id = ? LIMIT 1`,
          [id, sid]
        );
        res.status(201).json(rows?.[0] || null);
      } catch (e) {
        if (e?.code === 'ER_NO_SUCH_TABLE') {
          return res.status(400).json({ error: { message: 'Public documents are not enabled (missing school_public_documents table).' } });
        }
        // Roll back file if DB write fails
        try { if (saved?.path) await StorageService.deleteSchoolPublicDocument(saved.path); } catch { /* ignore */ }
        throw e;
      }
    } catch (e) {
      next(e);
    }
  }
];

export const updateSchoolPublicDocumentMeta = async (req, res, next) => {
  try {
    const { organizationId, documentId } = req.params;
    const { sid } = await assertSchoolPortalAccess(req, organizationId);
    await ensureSupervisorReadOnlyWriteDenied(req);
    const docId = parseInt(String(documentId || ''), 10);
    if (!docId) return res.status(400).json({ error: { message: 'Invalid documentId' } });

    const title = req.body?.title !== undefined ? String(req.body.title || '').trim() : undefined;
    const categoryKey = req.body?.categoryKey !== undefined ? String(req.body.categoryKey || '').trim() : undefined;
    const linkUrlRaw = req.body?.linkUrl !== undefined ? req.body.linkUrl : (req.body?.link_url !== undefined ? req.body.link_url : undefined);
    const linkUrl = linkUrlRaw === undefined ? undefined : normalizeUrl(linkUrlRaw);
    if (linkUrlRaw !== undefined && !linkUrl) {
      return res.status(400).json({ error: { message: 'linkUrl must be a valid http(s) URL.' } });
    }

    const updates = [];
    const values = [];
    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title || null);
    }
    if (categoryKey !== undefined) {
      updates.push('category_key = ?');
      values.push(categoryKey || null);
    }
    if (linkUrl !== undefined) {
      updates.push('link_url = ?');
      values.push(linkUrl || null);
      // If link_url is set, treat this as a link entry (best-effort).
      updates.push('kind = ?');
      values.push(linkUrl ? 'link' : 'file');
    }
    if (!updates.length) return res.json({ ok: true });

    try {
      await pool.execute(
        `UPDATE school_public_documents SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_organization_id = ?`,
        [...values, docId, sid]
      );
      const [rows] = await pool.execute(
        `SELECT id, school_organization_id, kind, title, category_key, file_path, link_url, mime_type, original_filename, uploaded_by_user_id, created_at, updated_at
         FROM school_public_documents WHERE id = ? AND school_organization_id = ? LIMIT 1`,
        [docId, sid]
      );
      if (!rows?.[0]) return res.status(404).json({ error: { message: 'Document not found' } });
      res.json(rows[0]);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(400).json({ error: { message: 'Public documents are not enabled (missing school_public_documents table).' } });
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

export const replaceSchoolPublicDocumentFile = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const { organizationId, documentId } = req.params;
      const { sid } = await assertSchoolPortalAccess(req, organizationId);
      await ensureSupervisorReadOnlyWriteDenied(req);
      const docId = parseInt(String(documentId || ''), 10);
      if (!docId) return res.status(400).json({ error: { message: 'Invalid documentId' } });

      if (!req.file) return res.status(400).json({ error: { message: 'No file uploaded' } });

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.execute(
          `SELECT id, kind, file_path FROM school_public_documents WHERE id = ? AND school_organization_id = ? FOR UPDATE`,
          [docId, sid]
        );
        const existing = rows?.[0] || null;
        if (!existing) {
          await conn.rollback();
          return res.status(404).json({ error: { message: 'Document not found' } });
        }
        if (String(existing.kind || '').toLowerCase() === 'link') {
          await conn.rollback();
          return res.status(400).json({ error: { message: 'Cannot replace file for a link item.' } });
        }

        const saved = await StorageService.saveSchoolPublicDocument({
          schoolOrganizationId: sid,
          uploadedByUserId: req.user?.id || null,
          fileBuffer: req.file.buffer,
          filename: req.file.originalname || `upload-${Date.now()}`,
          contentType: req.file.mimetype
        });

        await conn.execute(
          `UPDATE school_public_documents
           SET kind = 'file', file_path = ?, link_url = NULL, mime_type = ?, original_filename = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND school_organization_id = ?`,
          [saved.path, req.file.mimetype || null, req.file.originalname || null, docId, sid]
        );

        await conn.commit();

        // Best-effort delete old object AFTER commit.
        try { await StorageService.deleteSchoolPublicDocument(existing.file_path); } catch { /* ignore */ }

        const [out] = await pool.execute(
          `SELECT id, school_organization_id, kind, title, category_key, file_path, link_url, mime_type, original_filename, uploaded_by_user_id, created_at, updated_at
           FROM school_public_documents WHERE id = ? AND school_organization_id = ? LIMIT 1`,
          [docId, sid]
        );
        return res.json(out?.[0] || null);
      } catch (e) {
        try { await conn.rollback(); } catch { /* ignore */ }
        if (e?.code === 'ER_NO_SUCH_TABLE') {
          return res.status(400).json({ error: { message: 'Public documents are not enabled (missing school_public_documents table).' } });
        }
        throw e;
      } finally {
        conn.release();
      }
    } catch (e) {
      next(e);
    }
  }
];

export const deleteSchoolPublicDocument = async (req, res, next) => {
  try {
    const { organizationId, documentId } = req.params;
    const { sid } = await assertSchoolPortalAccess(req, organizationId);
    await ensureSupervisorReadOnlyWriteDenied(req);
    const docId = parseInt(String(documentId || ''), 10);
    if (!docId) return res.status(400).json({ error: { message: 'Invalid documentId' } });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT id, kind, file_path FROM school_public_documents WHERE id = ? AND school_organization_id = ? FOR UPDATE`,
        [docId, sid]
      );
      const existing = rows?.[0] || null;
      if (!existing) {
        await conn.rollback();
        return res.status(404).json({ error: { message: 'Document not found' } });
      }

      await conn.execute(`DELETE FROM school_public_documents WHERE id = ? AND school_organization_id = ?`, [docId, sid]);
      await conn.commit();

      if (String(existing.kind || '').toLowerCase() === 'file' && existing.file_path) {
        try { await StorageService.deleteSchoolPublicDocument(existing.file_path); } catch { /* ignore */ }
      }
      return res.json({ ok: true });
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(400).json({ error: { message: 'Public documents are not enabled (missing school_public_documents table).' } });
      }
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
};

