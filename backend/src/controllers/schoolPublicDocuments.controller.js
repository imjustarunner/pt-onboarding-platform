import pool from '../config/database.js';
import multer from 'multer';
import StorageService from '../services/storage.service.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { isSupervisorActor, supervisorHasSuperviseeInSchool } from '../utils/supervisorSchoolAccess.js';
import {
  buildVirtualPrintablePacketDocument,
  isSchoolPrintablePacketEnabled,
  isHogwartsPacketHubOrg,
  normalizePrintablePacketLocale
} from '../constants/schoolPrintablePacket.js';
import {
  buildSchoolPrintablePacketContext,
  buildSchoolPrintablePacketHtml,
  getSchoolPrintablePacketAvailability,
  getSchoolPacketTemplateForOrganization,
  saveSchoolPacketTemplateForOrganization
} from '../services/schoolPrintablePacket.service.js';
import {
  getOrCreateSchoolPrintablePacketPdf,
  warmSchoolPrintablePacketCache,
  invalidateAgencyPrintablePacketCaches
} from '../services/schoolPrintablePacketCache.service.js';

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
  return (
    r === 'admin' ||
    r === 'support' ||
    r === 'staff' ||
    r === 'supervisor' ||
    r === 'provider_plus' ||
    r === 'clinical_practice_assistant'
  );
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
    if (rows?.[0]) return true;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE') || msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }

  // 3. Any (inactive) provider_school_assignments row — schedule confirmed for a prior year.
  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM provider_school_assignments psa
       WHERE psa.school_organization_id = ?
         AND psa.provider_user_id = ?
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

async function userHasOrgOrAffiliatedAgencyAccess({ userId, role, user = null, schoolOrganizationId }) {
  if (!userId) return false;
  const roleNorm = String(role || '').toLowerCase();
  const userOrgs = await User.getAgencies(userId);
  const hasDirect = (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(schoolOrganizationId, 10));
  if (hasDirect) return true;
  const hasSupervisorCapability = await isSupervisorActor({ userId, role, user });
  if (roleNorm === 'provider') {
    const hasProviderAccess = await providerHasSchoolAccess({ providerUserId: userId, schoolOrganizationId });
    if (hasProviderAccess) return true;
    if (!hasSupervisorCapability) return false;
  }
  if (hasSupervisorCapability) {
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
    const ok = await userHasOrgOrAffiliatedAgencyAccess({
      userId,
      role,
      user: req.user,
      schoolOrganizationId: sid
    });
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
    const { sid, org } = await assertSchoolPortalAccess(req, organizationId);

    try {
      const [rows] = await pool.execute(
        `SELECT id, school_organization_id, kind, title, category_key, school_year, file_path, link_url, mime_type, original_filename, uploaded_by_user_id, created_at, updated_at
         FROM school_public_documents
         WHERE school_organization_id = ?
         ORDER BY updated_at DESC, id DESC`,
        [sid]
      );
      const documents = Array.isArray(rows) ? [...rows] : [];
      const packetHubEnabled = isHogwartsPacketHubOrg(org);
      // Hogwarts pilot: the smart printable packet is surfaced via the dedicated
      // "Printable Packets" section (EN + ES) instead of this generic Library,
      // so it isn't shown twice.
      if (isSchoolPrintablePacketEnabled(org) && !packetHubEnabled) {
        let templateVersion = null;
        let templateUpdatedAt = null;
        try {
          const availability = await getSchoolPrintablePacketAvailability(sid);
          if (availability?.available) {
            templateVersion = availability.version;
            templateUpdatedAt = availability.updatedAt || null;
          }
        } catch {
          // ignore — still show the virtual doc with the default label
        }
        documents.unshift(buildVirtualPrintablePacketDocument({
          schoolOrganizationId: sid,
          org,
          templateVersion,
          updatedAt: templateUpdatedAt
        }));
      }
      res.json({ schoolOrganizationId: sid, documents, packetHubEnabled });
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
      const schoolYear = req.body?.schoolYear !== undefined ? (String(req.body.schoolYear || '').trim() || null) : null;
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
            (school_organization_id, kind, title, category_key, school_year, file_path, link_url, mime_type, original_filename, uploaded_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sid,
            kind,
            safeTitle || null,
            categoryKey || null,
            schoolYear || null,
            saved?.path || null,
            linkUrl || null,
            req.file?.mimetype || null,
            req.file?.originalname || null,
            req.user?.id || null
          ]
        );
        const id = Number(result?.insertId || 0);
        const [rows] = await pool.execute(
          `SELECT id, school_organization_id, kind, title, category_key, school_year, file_path, link_url, mime_type, original_filename, uploaded_by_user_id, created_at, updated_at
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
    const schoolYearPatch = req.body?.schoolYear !== undefined ? (String(req.body.schoolYear || '').trim() || null) : undefined;
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
    if (schoolYearPatch !== undefined) {
      updates.push('school_year = ?');
      values.push(schoolYearPatch);
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
        `SELECT id, school_organization_id, kind, title, category_key, school_year, file_path, link_url, mime_type, original_filename, uploaded_by_user_id, created_at, updated_at
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

export const getSchoolPrintablePacketAvailabilityHandler = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    await assertSchoolPortalAccess(req, organizationId);
    const availability = await getSchoolPrintablePacketAvailability(organizationId);
    warmSchoolPrintablePacketCache(organizationId);
    res.json(availability);
  } catch (e) {
    next(e);
  }
};

export async function sendSchoolPrintablePacketPdf(res, organizationId, locale) {
  const loc = normalizePrintablePacketLocale(locale);
  const packetContext = await buildSchoolPrintablePacketContext({ organizationId, locale: loc });
  const pdfBytes = await getOrCreateSchoolPrintablePacketPdf(organizationId, loc);
  const schoolSlug = String(
    packetContext?.organization?.slug || packetContext?.organization?.portal_url || 'school'
  ).replace(/[^a-z0-9-]+/gi, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${schoolSlug}-referral-packet-v${packetContext.version}.pdf"`
  );
  return res.send(Buffer.from(pdfBytes));
}

export const renderSchoolPrintablePacket = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    await assertSchoolPortalAccess(req, organizationId);
    const format = String(req.query?.format || 'pdf').trim().toLowerCase();
    const locale = String(req.query?.locale || 'en').trim();

    if (format === 'html') {
      const packetContext = await buildSchoolPrintablePacketContext({ organizationId, locale });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(buildSchoolPrintablePacketHtml(packetContext));
    }

    return sendSchoolPrintablePacketPdf(res, organizationId, locale);
  } catch (e) {
    if (e?.statusCode) {
      return res.status(e.statusCode).json({ error: { message: e.message } });
    }
    next(e);
  }
};

function assertPacketTemplateEditorRole(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'super_admin' && role !== 'admin') {
    const err = new Error('Only agency admins can edit the printable packet template');
    err.statusCode = 403;
    throw err;
  }
}

export const getSchoolPrintablePacketTemplate = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    await assertSchoolPortalAccess(req, organizationId);
    assertPacketTemplateEditorRole(req);
    const locale = String(req.query?.locale || req.query?.lang || 'en').trim();
    const template = await getSchoolPacketTemplateForOrganization(organizationId, { locale });
    res.json(template);
  } catch (e) {
    if (e?.statusCode || e?.status) {
      return res.status(e.statusCode || e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

export const updateSchoolPrintablePacketTemplate = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    await assertSchoolPortalAccess(req, organizationId);
    assertPacketTemplateEditorRole(req);
    const htmlContent = req.body?.html_content ?? req.body?.htmlContent;
    if (htmlContent === undefined || htmlContent === null) {
      return res.status(400).json({ error: { message: 'html_content is required' } });
    }
    const locale = String(req.body?.locale || req.query?.locale || req.query?.lang || 'en').trim();
    const saved = await saveSchoolPacketTemplateForOrganization({
      organizationId,
      htmlContent,
      actorUserId: req.user?.id || null,
      locale
    });
    await invalidateAgencyPrintablePacketCaches(saved?.agencyId);
    warmSchoolPrintablePacketCache(organizationId);
    res.json(saved);
  } catch (e) {
    if (e?.statusCode || e?.status) {
      return res.status(e.statusCode || e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

export const listSchoolPrintablePacketTemplateVersions = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    await assertSchoolPortalAccess(req, organizationId);
    assertPacketTemplateEditorRole(req);
    const locale = String(req.query?.locale || 'en').trim();
    const AgencySchool = (await import('../models/AgencySchool.model.js')).default;
    const SchoolPacketTemplate = (await import('../models/SchoolPacketTemplate.model.js')).default;
    const agencyId = await AgencySchool.getActiveAgencyIdForSchool(organizationId);
    if (!agencyId) return res.status(400).json({ error: { message: 'No parent agency for this school' } });
    const versions = await SchoolPacketTemplate.listVersions(agencyId, locale);
    const current = await SchoolPacketTemplate.findByAgencyId(agencyId, locale);
    res.json({ agencyId, locale, currentVersion: current?.version ?? null, versions });
  } catch (e) {
    if (e?.statusCode || e?.status) {
      return res.status(e.statusCode || e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

export const getSchoolPrintablePacketTemplateVersion = async (req, res, next) => {
  try {
    const { organizationId, version } = req.params;
    await assertSchoolPortalAccess(req, organizationId);
    assertPacketTemplateEditorRole(req);
    const locale = String(req.query?.locale || 'en').trim();
    const AgencySchool = (await import('../models/AgencySchool.model.js')).default;
    const SchoolPacketTemplate = (await import('../models/SchoolPacketTemplate.model.js')).default;
    const agencyId = await AgencySchool.getActiveAgencyIdForSchool(organizationId);
    if (!agencyId) return res.status(400).json({ error: { message: 'No parent agency for this school' } });
    const row = await SchoolPacketTemplate.getVersion(agencyId, locale, version);
    if (!row) return res.status(404).json({ error: { message: 'Version not found' } });
    res.json({ version: row });
  } catch (e) {
    if (e?.statusCode || e?.status) {
      return res.status(e.statusCode || e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

/**
 * GET /school-portal/:organizationId/printable-packet/org-version-history
 * Returns per-school content-version rows (newest first).
 * Each row includes the version_label, content_hash, change_reason, storage_path, created_at.
 * Admin / super_admin only.
 */
/**
 * GET /school-portal/:organizationId/printable-packet/version/:versionLabel/pdf
 * Streams the stored PDF for a specific packet version (admin/super_admin only).
 */
export const getSchoolPacketVersionPdf = async (req, res, next) => {
  try {
    const { organizationId, versionLabel } = req.params;
    await assertSchoolPortalAccess(req, organizationId);
    assertPacketTemplateEditorRole(req);
    const locale = String(req.query?.locale || 'en').trim();
    const { findSchoolPacketVersionByLabel } = await import('../services/schoolPrintablePacketCache.service.js');
    const version = await findSchoolPacketVersionByLabel(Number(organizationId), locale, versionLabel);
    if (!version) {
      return res.status(404).json({ error: { message: `Packet version ${versionLabel} not found.` } });
    }
    if (!version.storage_path) {
      return res.status(404).json({ error: { message: `No stored PDF for version ${versionLabel}. Please regenerate the packet.` } });
    }
    // Proxy the GCS object to the client.
    const { streamGcsObject } = await import('../utils/gcsStream.js').catch(() => null) || {};
    if (streamGcsObject) {
      return await streamGcsObject(res, version.storage_path, {
        contentType: 'application/pdf',
        filename: `school-packet-${versionLabel}.pdf`
      });
    }
    // Fallback: redirect to the GCS public/signed URL if direct streaming isn't available.
    const { getSignedDownloadUrl } = await import('../services/gcs.service.js');
    const url = await getSignedDownloadUrl(version.storage_path);
    if (!url) return res.status(404).json({ error: { message: 'Could not generate download URL for this version.' } });
    res.json({ url, versionLabel, storagePath: version.storage_path });
  } catch (e) {
    if (e?.statusCode || e?.status) {
      return res.status(e.statusCode || e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};


/**
 * GET /school-portal/:organizationId/printable-packet/org-version-history
 * Lists the per-school version history (admin/super_admin only).
 */
export const listSchoolPacketOrgVersionHistory = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    await assertSchoolPortalAccess(req, organizationId);
    assertPacketTemplateEditorRole(req);
    const locale = String(req.query?.locale || 'en').trim();
    const { listSchoolPacketVersionHistory } = await import('../services/schoolPrintablePacketCache.service.js');
    const versions = await listSchoolPacketVersionHistory(Number(organizationId), locale);
    res.json({ organizationId: Number(organizationId), locale, versions });
  } catch (e) {
    if (e?.statusCode || e?.status) {
      return res.status(e.statusCode || e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

