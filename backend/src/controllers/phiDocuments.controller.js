import Client from '../models/Client.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import ReferralPacketDraft from '../models/ReferralPacketDraft.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import ClientSchoolStaffRoiAccess from '../models/ClientSchoolStaffRoiAccess.model.js';
import {
  schoolStaffCanOpenFromState,
  schoolStaffHidesReferralPackets,
  schoolStaffOwnDocumentsOnly
} from '../utils/schoolStaffRoiLabels.js';
import StorageService from '../services/storage.service.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';
import multer from 'multer';
import DocumentEncryptionService from '../services/documentEncryption.service.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import { decryptIntakeSubmissionRows } from '../services/intakeResponsesEncryption.service.js';
import IntakeLink from '../models/IntakeLink.model.js';
import {
  assembleClientChartArtifacts,
  renderChartArtifactView
} from '../services/clientChartArtifacts.service.js';

function parseJsonMaybe(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isClinicalSummaryPhiDoc(doc) {
  const title = String(doc?.document_title || '').toLowerCase();
  const type = String(doc?.document_type || '').toLowerCase();
  return title.includes('clinical') || type.includes('clinical');
}

function clinicalSummaryLooksEmpty(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  return /no clinical responses captured/i.test(raw);
}

async function rebuildClinicalSummaryFromSubmission({ doc, intakeData = null, link = null }) {
  const submissionId = Number(doc?.intake_submission_id || 0);
  const clientId = Number(doc?.client_id || 0);
  if (!submissionId) return null;

  let submissionRow = null;
  if (!intakeData || !link) {
    const [rows] = await pool.execute(
      `SELECT id, intake_link_id, intake_data, payload_encrypted, payload_iv_b64,
              payload_auth_tag_b64, payload_key_id, client_id
       FROM intake_submissions
       WHERE id = ?
       LIMIT 1`,
      [submissionId]
    );
    decryptIntakeSubmissionRows(rows);
    submissionRow = rows?.[0] || null;
  }

  const resolvedIntakeData = intakeData || parseJsonMaybe(submissionRow?.intake_data);
  if (!resolvedIntakeData) return null;

  let resolvedLink = link;
  const linkId = Number(submissionRow?.intake_link_id || link?.id || 0);
  if (!resolvedLink && linkId) {
    resolvedLink = await IntakeLink.findById(linkId);
  }
  if (!resolvedLink) return null;

  let clientIndex = 0;
  if (clientId) {
    try {
      const [iscRows] = await pool.execute(
        `SELECT client_id FROM intake_submission_clients WHERE intake_submission_id = ? ORDER BY id ASC`,
        [submissionId]
      );
      const ids = (iscRows || []).map((row) => Number(row?.client_id || 0));
      const idx = ids.indexOf(clientId);
      if (idx >= 0) clientIndex = idx;
    } catch {
      // older DBs may not have the join table
    }
  }

  const { buildClinicalSummaryText } = await import('./publicIntake.controller.js');
  const rebuilt = buildClinicalSummaryText({
    link: resolvedLink,
    intakeData: resolvedIntakeData,
    clientIndex
  });
  return String(rebuilt || '').trim() || null;
}

async function resolveClinicalSummaryText({ doc, storedText, intakeData = null, link = null }) {
  if (!isClinicalSummaryPhiDoc(doc)) return storedText;
  try {
    const rebuilt = await rebuildClinicalSummaryFromSubmission({ doc, intakeData, link });
    if (!rebuilt) return storedText;
    if (clinicalSummaryLooksEmpty(storedText) || rebuilt.length > String(storedText || '').length) {
      return rebuilt;
    }
  } catch (err) {
    console.warn('[phiDocuments] clinical summary rebuild failed:', err?.message);
  }
  return storedText;
}

// Upload (authenticated): PDF/JPG/PNG up to 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only PDF, JPG, and PNG files are allowed.'), false);
  }
});

async function providerHasAssignedClientAccess({ requestingUserId, client }) {
  const uid = Number(requestingUserId || 0);
  const cid = Number(client?.id || 0);
  if (!uid || !cid) return false;

  try {
    const [rows] = await pool.execute(
      `SELECT 1
       FROM client_provider_assignments
       WHERE client_id = ?
         AND provider_user_id = ?
         AND is_active = TRUE
       LIMIT 1`,
      [cid, uid]
    );
    if (rows?.[0]) return true;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
    if (!missing) throw e;
  }

  return Number(client?.provider_id || 0) === uid;
}

async function userCanAccessClient({ requestingUserId, requestingUserRole, client, requireDocumentAccess = false }) {
  const normalizedRole = String(requestingUserRole || '').toLowerCase();
  if (normalizedRole === 'super_admin') return true;
  if (normalizedRole === 'client_guardian') {
    const linkedClients = await ClientGuardian.listClientsForGuardian({ guardianUserId: requestingUserId });
    return (linkedClients || []).some((entry) => Number(entry?.client_id) === Number(client?.id));
  }
  if (normalizedRole === 'school_staff') {
    return ClientSchoolStaffRoiAccess.schoolStaffHasActiveRoiAccess({
      clientId: client?.id,
      schoolOrganizationId: client?.organization_id || client?.school_organization_id,
      schoolStaffUserId: requestingUserId,
      requireDocumentAccess
    });
  }
  if (normalizedRole === 'provider' || normalizedRole === 'provider_plus') {
    return providerHasAssignedClientAccess({ requestingUserId, client });
  }
  const userAgencies = await User.getAgencies(requestingUserId);
  const userAgencyIds = userAgencies.map(a => a.id);
  return userAgencyIds.includes(client.agency_id) || userAgencyIds.includes(client.organization_id);
}

async function resolveSchoolStaffAccessStateForClient({ requestingUserId, requestingUserRole, client }) {
  const normalizedRole = String(requestingUserRole || '').toLowerCase();
  if (normalizedRole !== 'school_staff') return 'none';
  const schoolOrgId = client?.organization_id || client?.school_organization_id;
  const user = await User.findById(requestingUserId);
  const emails = [user?.email, user?.work_email, user?.username, user?.personal_email]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => v.includes('@'));
  if (schoolOrgId && emails.length) {
    try {
      const placeholders = emails.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT 1
         FROM school_contacts
         WHERE school_organization_id = ?
           AND LOWER(TRIM(email)) IN (${placeholders})
           AND is_scheduler = 1
         LIMIT 1`,
        [schoolOrgId, ...emails]
      );
      if (rows?.[0]) return 'limited';
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
  }
  return ClientSchoolStaffRoiAccess.resolveSchoolStaffClientAccessState({
    clientId: client?.id,
    schoolOrganizationId: schoolOrgId,
    schoolStaffUserId: requestingUserId
  });
}

function isSchoolStaffOwnDocumentScope({ requestingUserRole, schoolStaffAccessState }) {
  return String(requestingUserRole || '').toLowerCase() === 'school_staff'
    && schoolStaffOwnDocumentsOnly(schoolStaffAccessState);
}

function schoolStaffMayUsePhi(state) {
  return schoolStaffCanOpenFromState(state);
}

function isReferralPacketPhiDocument(doc) {
  if (!doc) return false;
  if (doc.referral_draft_id || doc.intake_submission_id) return true;
  const type = String(doc.document_type || '').toLowerCase();
  if (type.includes('referral') || type.includes('packet')) return true;
  const path = String(doc.storage_path || '').toLowerCase();
  if (path.includes('referrals_quarantine') || path.includes('intake-packet') || path.includes('intake_packet')) {
    return true;
  }
  const name = `${doc.original_name || ''} ${doc.document_title || ''}`.toLowerCase();
  return name.includes('referral packet')
    || name.includes('school roi')
    || name.includes('signed roi')
    || name.includes('paquete de referencia');
}

function filterPhiDocsForSchoolStaff(docs, { userId, state }) {
  const list = Array.isArray(docs) ? docs : [];
  if (String(state || '').toLowerCase() === 'roi_docs') return list;
  const uid = Number(userId || 0);
  const own = list.filter((doc) => Number(doc?.uploaded_by_user_id || 0) === uid);
  if (schoolStaffHidesReferralPackets(state)) {
    return own.filter((doc) => !isReferralPacketPhiDocument(doc));
  }
  return own;
}

function schoolStaffMayOpenPhiDocument(doc, { userId, state }) {
  if (String(state || '').toLowerCase() === 'roi_docs') return true;
  if (!schoolStaffMayUsePhi(state)) return false;
  if (Number(doc?.uploaded_by_user_id || 0) !== Number(userId || 0)) return false;
  if (schoolStaffHidesReferralPackets(state) && isReferralPacketPhiDocument(doc)) return false;
  return true;
}

export const uploadClientPhiDocument = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const clientId = parseInt(req.params.clientId, 10);
      if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
      if (!req.file) return res.status(400).json({ error: { message: 'No file uploaded' } });

      const client = await Client.findById(clientId, { includeSensitive: true });
      if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

      const schoolStaffAccessState = await resolveSchoolStaffAccessStateForClient({
        requestingUserId: req.user.id,
        requestingUserRole: req.user.role,
        client
      });
      const isSchoolStaff = String(req.user?.role || '').toLowerCase() === 'school_staff';
      const allowed = isSchoolStaff
        ? schoolStaffMayUsePhi(schoolStaffAccessState)
        : await userCanAccessClient({
            requestingUserId: req.user.id,
            requestingUserRole: req.user.role,
            client,
            requireDocumentAccess: true
          });
      if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

      const sanitizedFilename = StorageService.sanitizeFilename(req.file.originalname);
      const documentTitle = req.body?.documentTitle ? String(req.body.documentTitle).trim().slice(0, 255) : null;
      const documentType = req.body?.documentType ? String(req.body.documentType).trim().slice(0, 80) : null;
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const orgId = client.organization_id || client.school_organization_id || null;
      const fileName = `phi-documents/${orgId || 'unknown-org'}/${clientId}/${timestamp}-${randomId}-${sanitizedFilename}`;

      const bucket = await StorageService.getGCSBucket();
      const file = bucket.file(fileName);
      await file.save(req.file.buffer, {
        contentType: req.file.mimetype,
        metadata: {
          clientId: String(clientId),
          agencyId: String(client.agency_id),
          organizationId: String(orgId || ''),
          uploadedByUserId: String(req.user.id),
          uploadType: 'client_documentation',
          uploadedAt: new Date().toISOString()
        }
      });

      let phiDoc = null;
      try {
        phiDoc = await ClientPhiDocument.create({
          clientId,
          agencyId: client.agency_id,
          schoolOrganizationId: orgId || client.organization_id,
          storagePath: fileName,
          originalName: req.file.originalname || null,
          documentTitle,
          documentType,
          mimeType: req.file.mimetype || null,
          uploadedByUserId: req.user.id
        });
        try {
          const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
          await PhiDocumentAuditLog.create({
            documentId: phiDoc.id,
            clientId,
            action: 'uploaded',
            actorUserId: req.user.id,
            actorLabel: req.user?.email || req.user?.name || null,
            ipAddress: ip,
            metadata: { source: 'manual_upload' }
          });
        } catch {
          // best-effort logging
        }
      } catch (e) {
        if (e.code === 'ER_NO_SUCH_TABLE') {
          return res.status(503).json({ error: { message: 'PHI documents feature not available (migration not run yet).' } });
        }
        throw e;
      }

      // Best-effort: set legacy document_status flag so older UI reflects upload.
      try {
        await pool.execute(`UPDATE clients SET document_status = 'UPLOADED' WHERE id = ?`, [clientId]);
      } catch {
        // ignore
      }

      res.status(201).json({ document: phiDoc });
    } catch (e) {
      next(e);
    }
  }
];

export const listClientPhiDocuments = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const schoolStaffAccessState = await resolveSchoolStaffAccessStateForClient({
      requestingUserId: req.user.id,
      requestingUserRole: req.user.role,
      client
    });
    const limitedScope = isSchoolStaffOwnDocumentScope({
      requestingUserRole: req.user.role,
      schoolStaffAccessState
    });
    const isSchoolStaff = String(req.user?.role || '').toLowerCase() === 'school_staff';
    const allowed = isSchoolStaff
      ? schoolStaffMayUsePhi(schoolStaffAccessState)
      : await userCanAccessClient({
          requestingUserId: req.user.id,
          requestingUserRole: req.user.role,
          client,
          requireDocumentAccess: true
        });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    let docs = [];
    try {
      docs = await ClientPhiDocument.findByClientId(clientId);
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        return res.json([]);
      }
      throw e;
    }

    if (isSchoolStaff) {
      docs = filterPhiDocsForSchoolStaff(docs, {
        userId: req.user?.id,
        state: schoolStaffAccessState
      });
    } else if (limitedScope) {
      docs = (docs || []).filter((doc) => Number(doc?.uploaded_by_user_id || 0) === Number(req.user?.id || 0));
    }
    res.json(docs);
  } catch (e) {
    next(e);
  }
};

async function assertPhiClientAccess(req, clientId) {
  const client = await Client.findById(clientId, { includeSensitive: true });
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  const schoolStaffAccessState = await resolveSchoolStaffAccessStateForClient({
    requestingUserId: req.user.id,
    requestingUserRole: req.user.role,
    client
  });
  const isSchoolStaff = String(req.user?.role || '').toLowerCase() === 'school_staff';
  const allowed = isSchoolStaff
    ? schoolStaffMayUsePhi(schoolStaffAccessState)
    : await userCanAccessClient({
      requestingUserId: req.user.id,
      requestingUserRole: req.user.role,
      client,
      requireDocumentAccess: true
    });
  if (!allowed) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  return { client, isSchoolStaff, schoolStaffAccessState };
}

export const listClientChartArtifacts = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
    const { client } = await assertPhiClientAccess(req, clientId);
    const payload = await assembleClientChartArtifacts({ clientId, client });
    res.json(payload);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const viewClientChartArtifact = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    const viewKey = decodeURIComponent(String(req.params.viewKey || '')).trim();
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
    if (!viewKey) return res.status(400).json({ error: { message: 'viewKey is required' } });
    const { client } = await assertPhiClientAccess(req, clientId);
    const result = await renderChartArtifactView({ client, viewKey });
    if (result?.delegatePhiId) {
      req.params.docId = String(result.delegatePhiId);
      return viewPhiDocument(req, res, next);
    }
    if (result?.notFound) {
      return res.status(404).json({ error: { message: 'Document not found' } });
    }
    try {
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
      const userAgent = req.headers['user-agent'] || null;
      await pool.execute(
        `INSERT INTO phi_access_logs (user_id, client_id, document_id, action, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, clientId, null, 'view', ip, userAgent ? String(userAgent).slice(0, 512) : null]
      );
    } catch {
      // best-effort
    }
    if (result?.html) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(result.html);
    }
    if (result?.url) {
      return res.json({ url: result.url });
    }
    if (result?.packet) {
      return res.json({ packet: result.packet });
    }
    return res.status(404).json({ error: { message: 'Document not found' } });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listClientIntakeResponses = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const schoolStaffAccessState = await resolveSchoolStaffAccessStateForClient({
      requestingUserId: req.user.id,
      requestingUserRole: req.user.role,
      client
    });
    const isSchoolStaff = String(req.user?.role || '').toLowerCase() === 'school_staff';
    const allowed = isSchoolStaff
      ? String(schoolStaffAccessState || '').toLowerCase() === 'roi_docs'
      : await userCanAccessClient({
          requestingUserId: req.user.id,
          requestingUserRole: req.user.role,
          client,
          requireDocumentAccess: true
        });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    let rows = [];
    try {
      const [result] = await pool.execute(
        `SELECT
           s.id,
           s.intake_link_id,
           s.status,
           s.signer_name,
           s.signer_email,
           s.submitted_at,
           s.created_at,
           s.updated_at,
           s.intake_data,
           s.payload_encrypted,
           s.payload_iv_b64,
           s.payload_auth_tag_b64,
           s.payload_key_id,
           l.title AS intake_link_title,
           l.form_type,
           l.scope_type
         FROM intake_submissions s
         LEFT JOIN intake_links l ON l.id = s.intake_link_id
         LEFT JOIN intake_submission_clients isc ON isc.intake_submission_id = s.id
         WHERE (s.client_id = ? OR isc.client_id = ?)
           AND (s.intake_data IS NOT NULL OR s.payload_encrypted IS NOT NULL)
         GROUP BY
           s.id, s.intake_link_id, s.status, s.signer_name, s.signer_email,
           s.submitted_at, s.created_at, s.updated_at, s.intake_data,
           s.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id,
           l.title, l.form_type, l.scope_type
         ORDER BY COALESCE(s.submitted_at, s.updated_at, s.created_at) DESC
         LIMIT 20`,
        [clientId, clientId]
      );
      rows = result || [];
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      const [fallbackRows] = await pool.execute(
        `SELECT
           s.id,
           s.intake_link_id,
           s.status,
           s.signer_name,
           s.signer_email,
           s.submitted_at,
           s.created_at,
           s.updated_at,
           s.intake_data,
           s.payload_encrypted,
           s.payload_iv_b64,
           s.payload_auth_tag_b64,
           s.payload_key_id,
           l.title AS intake_link_title,
           l.form_type,
           l.scope_type
         FROM intake_submissions s
         LEFT JOIN intake_links l ON l.id = s.intake_link_id
         WHERE s.client_id = ?
           AND (s.intake_data IS NOT NULL OR s.payload_encrypted IS NOT NULL)
         ORDER BY COALESCE(s.submitted_at, s.updated_at, s.created_at) DESC
         LIMIT 20`,
        [clientId]
      );
      rows = fallbackRows || [];
    }
    decryptIntakeSubmissionRows(rows);

    const submissionIds = Array.from(
      new Set((rows || []).map((row) => Number(row?.id || 0)).filter((id) => Number.isFinite(id) && id > 0))
    );
    const textDocsBySubmissionId = new Map();
    if (submissionIds.length) {
      const placeholders = submissionIds.map(() => '?').join(', ');
      try {
        const [docRows] = await pool.execute(
          `SELECT
             id,
             intake_submission_id,
             document_title,
             document_type,
             storage_path,
             mime_type,
             removed_at
           FROM client_phi_documents
           WHERE client_id = ?
             AND intake_submission_id IN (${placeholders})
             AND LOWER(COALESCE(mime_type, '')) LIKE 'text/plain%'
           ORDER BY id DESC`,
          [clientId, ...submissionIds]
        );
        for (const doc of docRows || []) {
          const sid = Number(doc?.intake_submission_id || 0);
          if (!sid) continue;
          if (!textDocsBySubmissionId.has(sid)) textDocsBySubmissionId.set(sid, []);
          textDocsBySubmissionId.get(sid).push(doc);
        }
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }

    const readDocText = async (doc) => {
      if (!doc?.storage_path) return null;
      if (doc?.removed_at) return null;
      try {
        const buffer = await StorageService.readObject(doc.storage_path);
        return buffer?.toString('utf8') || null;
      } catch {
        return null;
      }
    };

    const submissions = await Promise.all((rows || []).map(async (row) => {
      let intakeData = null;
      try {
        intakeData = row?.intake_data
          ? (typeof row.intake_data === 'string' ? JSON.parse(row.intake_data) : row.intake_data)
          : null;
      } catch {
        intakeData = null;
      }

      const submissionId = Number(row?.id || 0) || null;
      const docs = submissionId ? (textDocsBySubmissionId.get(submissionId) || []) : [];
      const intakeResponsesDoc = docs.find((doc) => {
        const title = String(doc?.document_title || '').toLowerCase();
        const type = String(doc?.document_type || '').toLowerCase();
        return title.includes('intake response') || type.includes('intake response');
      }) || null;
      const clinicalSummaryDoc = docs.find((doc) => {
        const title = String(doc?.document_title || '').toLowerCase();
        const type = String(doc?.document_type || '').toLowerCase();
        return title.includes('clinical') || type.includes('clinical');
      }) || null;

      const intakeResponsesText = intakeResponsesDoc ? await readDocText(intakeResponsesDoc) : null;
      const storedClinicalSummaryText = clinicalSummaryDoc ? await readDocText(clinicalSummaryDoc) : null;
      const clinicalSummaryText = await resolveClinicalSummaryText({
        doc: clinicalSummaryDoc
          ? { ...clinicalSummaryDoc, client_id: clientId }
          : { intake_submission_id: submissionId, client_id: clientId, document_title: 'Clinical Intake Summary' },
        storedText: storedClinicalSummaryText,
        intakeData,
        link: row.intake_link_id ? await IntakeLink.findById(row.intake_link_id) : null
      });

      return {
        submissionId,
        intakeLinkId: row.intake_link_id,
        status: row.status || null,
        signerName: row.signer_name || null,
        signerEmail: row.signer_email || null,
        submittedAt: row.submitted_at || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        intakeLink: {
          title: row.intake_link_title || null,
          formType: row.form_type || null,
          scopeType: row.scope_type || null
        },
        intakeData,
        derivedDocuments: {
          intakeResponsesText,
          clinicalSummaryText,
          intakeResponsesDocumentId: intakeResponsesDoc?.id || null,
          clinicalSummaryDocumentId: clinicalSummaryDoc?.id || null
        }
      };
    }));

    res.json({ submissions });
  } catch (e) {
    next(e);
  }
};

/**
 * Referral packet uploads create PHI rows with client_id NULL until the draft is submitted.
 * Allow view for the uploader (school staff on that org) or agency operations roles.
 */
async function canUserAccessReferralDraftPhiDocument({ doc, user }) {
  const uid = Number(user?.id || 0);
  if (!uid) return false;
  const draftId = Number(doc?.referral_draft_id ?? 0);
  if (!draftId) return false;
  const draft = await ReferralPacketDraft.findById(draftId);
  if (!draft) return false;
  if (Number(draft.phi_document_id || 0) !== Number(doc.id || 0)) return false;

  const role = String(user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;

  const userAgencies = await User.getAgencies(uid);
  const agencyIds = new Set(userAgencies.map((a) => Number(a.id)));

  const schoolOrgId = Number(doc.school_organization_id || draft.organization_id || 0);
  const therapyAgencyId = Number(doc.agency_id || draft.agency_id || 0);
  const inSchool = schoolOrgId > 0 && agencyIds.has(schoolOrgId);
  const inTherapy = therapyAgencyId > 0 && agencyIds.has(therapyAgencyId);

  const uploaderId = Number(doc.uploaded_by_user_id || draft.uploaded_by_user_id || 0);
  if (uploaderId === uid && inSchool) return true;

  if (
    ['admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus', 'supervisor'].includes(role) &&
    (inTherapy || inSchool)
  ) {
    return true;
  }

  return false;
}

export const viewPhiDocument = async (req, res, next) => {
  try {
    const docId = parseInt(req.params.docId, 10);
    if (!docId) return res.status(400).json({ error: { message: 'docId is required' } });

    let doc = null;
    try {
      doc = await ClientPhiDocument.findById(docId);
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'PHI documents feature not available (migration not run yet).' } });
      }
      throw e;
    }
    if (!doc) return res.status(404).json({ error: { message: 'PHI document not found' } });
    if (doc.removed_at) {
      return res.status(410).json({ error: { message: 'Document has been removed from the system.' } });
    }

    const clientId = doc.client_id != null ? Number(doc.client_id) : 0;
    if (clientId) {
      const client = await Client.findById(clientId, { includeSensitive: true });
      if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

      const schoolStaffAccessState = await resolveSchoolStaffAccessStateForClient({
        requestingUserId: req.user.id,
        requestingUserRole: req.user.role,
        client
      });
      const limitedScope = isSchoolStaffOwnDocumentScope({
        requestingUserRole: req.user.role,
        schoolStaffAccessState
      });
      const isSchoolStaff = String(req.user?.role || '').toLowerCase() === 'school_staff';
      const allowed = isSchoolStaff
        ? schoolStaffMayUsePhi(schoolStaffAccessState)
        : await userCanAccessClient({
            requestingUserId: req.user.id,
            requestingUserRole: req.user.role,
            client,
            requireDocumentAccess: true
          });
      if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });
      if (isSchoolStaff && !schoolStaffMayOpenPhiDocument(doc, {
        userId: req.user.id,
        state: schoolStaffAccessState
      })) {
        return res.status(403).json({
          error: {
            message: schoolStaffHidesReferralPackets(schoolStaffAccessState)
              ? 'ROI (Speak) does not include referral documents, including packets you uploaded.'
              : 'This ROI level only allows documents you uploaded'
          }
        });
      }
      if (!isSchoolStaff && limitedScope && Number(doc?.uploaded_by_user_id || 0) !== Number(req.user?.id || 0)) {
        return res.status(403).json({ error: { message: 'This ROI level only allows documents you uploaded' } });
      }
    } else if (doc.referral_draft_id) {
      const ok = await canUserAccessReferralDraftPhiDocument({ doc, user: req.user });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    } else {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    // Log access (best-effort)
    try {
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
      const userAgent = req.headers['user-agent'] || null;
      await pool.execute(
        `INSERT INTO phi_access_logs (user_id, client_id, document_id, action, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, doc.client_id, doc.id, 'view', ip, userAgent ? String(userAgent).slice(0, 512) : null]
      );
    } catch {
      // ignore
    }

    const isPlainText = String(doc.mime_type || '').toLowerCase().includes('text/plain');
    const escapeHtml = (value) =>
      String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    if (doc.is_encrypted) {
      const encryptedBuffer = await StorageService.readObject(doc.storage_path);
      const decryptedBuffer = await DocumentEncryptionService.decryptReferralPacketBuffer({
        encryptedBuffer,
        encryptionKeyId: doc.encryption_key_id,
        encryptionWrappedKeyB64: doc.encryption_wrapped_key,
        encryptionIvB64: doc.encryption_iv,
        encryptionAuthTagB64: doc.encryption_auth_tag,
        organizationId: doc.school_organization_id,
        originalName: doc.original_name || '',
        sanitizeFilename: (name) => StorageService.sanitizeFilename(name)
      });

      const safeName = StorageService.sanitizeFilename(doc.original_name || `document-${doc.id}`);
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
      res.setHeader('Cache-Control', 'no-store');
      try {
        const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
        await PhiDocumentAuditLog.create({
          documentId: doc.id,
          clientId: doc.client_id,
          action: 'downloaded',
          actorUserId: req.user.id,
          actorLabel: req.user?.email || req.user?.name || null,
          ipAddress: ip
        });
      } catch {
        // best-effort logging
      }
      return res.send(decryptedBuffer);
    }

    if (isPlainText) {
      const buffer = await StorageService.readObject(doc.storage_path);
      const storedText = buffer?.toString('utf8') || '';
      const text = await resolveClinicalSummaryText({ doc, storedText }) || storedText;
      const safeName = StorageService.sanitizeFilename(doc.original_name || `document-${doc.id}`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${safeName}.html"`);
      res.setHeader('Cache-Control', 'no-store');
      try {
        const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
        await PhiDocumentAuditLog.create({
          documentId: doc.id,
          clientId: doc.client_id,
          action: 'downloaded',
          actorUserId: req.user.id,
          actorLabel: req.user?.email || req.user?.name || null,
          ipAddress: ip
        });
      } catch {
        // best-effort logging
      }
      const isClinicalSummary = String(doc.document_type || doc.document_title || '').toLowerCase().includes('clinical');
      const forceDark = String(req.query?.theme || '').toLowerCase() === 'dark';
      const lines = text.split('\n');
      const body = lines
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return '<div class="spacer"></div>';
          if (/^-{2,}$/.test(trimmed)) return '';
          if (!trimmed.includes(':')) {
            return `<h2>${escapeHtml(trimmed)}</h2>`;
          }
          const idx = trimmed.indexOf(':');
          const label = trimmed.slice(0, idx).trim();
          const value = trimmed.slice(idx + 1).trim();
          const copyButton = isClinicalSummary
            ? ''
            : `<button class="copy-btn" type="button" data-copy="${escapeHtml(value)}">Copy</button>`;
          return `
            <div class="row">
              ${copyButton}
              <div class="label">${escapeHtml(label)}</div>
              <div class="value">${escapeHtml(value)}</div>
            </div>
          `;
        })
        .join('');
      const copyAllButton = isClinicalSummary
        ? '<button class="copy-all" type="button" data-copy-all>Copy All</button>'
        : '';
      const html = `
            <html class="${forceDark ? 'dark' : ''}">
          <head>
            <meta charset="utf-8" />
            <meta name="color-scheme" content="${forceDark ? 'dark' : 'light dark'}" />
            <title>${escapeHtml(doc.document_title || doc.original_name || 'Document')}</title>
            <style>
              :root { color-scheme: light dark; }
              body { background: #fff; color: #111; font-family: Arial, sans-serif; margin: 24px; }
              h1 { margin-bottom: 16px; color: #1f3a60; }
              h2 { margin: 14px 0 6px; font-size: 14px; color: #1f3a60; }
              .row { display: flex; gap: 10px; margin-bottom: 6px; align-items: flex-start; }
              .label { font-weight: 700; min-width: 220px; }
              .value { flex: 1; }
              .copy-btn {
                background: #eef2f6;
                border: 1px solid #c9d2dc;
                border-radius: 6px;
                padding: 2px 8px;
                font-size: 12px;
                cursor: pointer;
              }
              .copy-btn:active { transform: translateY(1px); }
              .copy-all {
                background: #1f3a60;
                color: #fff;
                border: 1px solid #1f3a60;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 12px;
                cursor: pointer;
                margin-bottom: 12px;
              }
              .spacer { height: 8px; }
              html.dark body { background: #121418; color: #e8eaed; }
              html.dark h1, html.dark h2 { color: #c5d4ea; }
              html.dark .copy-btn { background: #1e2430; border-color: #3a4354; color: #e8eaed; }
              html.dark .copy-all { background: #3a4c6b; border-color: #3a4c6b; }
              @media (prefers-color-scheme: dark) {
                body { background: #121418; color: #e8eaed; }
                h1, h2 { color: #c5d4ea; }
                .copy-btn { background: #1e2430; border-color: #3a4354; color: #e8eaed; }
                .copy-all { background: #3a4c6b; border-color: #3a4c6b; }
              }
            </style>
          </head>
          <body>
            <h1>${escapeHtml(doc.document_title || doc.original_name || 'Document')}</h1>
            ${copyAllButton}
            ${body}
            <script>
              const copyText = async (text) => {
                if (!text) return;
                try {
                  await navigator.clipboard.writeText(text);
                } catch {
                  const textarea = document.createElement('textarea');
                  textarea.value = text;
                  textarea.style.position = 'fixed';
                  textarea.style.opacity = '0';
                  document.body.appendChild(textarea);
                  textarea.focus();
                  textarea.select();
                  document.execCommand('copy');
                  document.body.removeChild(textarea);
                }
              };
              document.querySelectorAll('[data-copy]').forEach((btn) => {
                btn.addEventListener('click', () => copyText(btn.getAttribute('data-copy')));
              });
              const copyAllBtn = document.querySelector('[data-copy-all]');
              if (copyAllBtn) {
                const rawText = ${JSON.stringify(text)};
                copyAllBtn.addEventListener('click', () => copyText(rawText.trim()));
              }
            </script>
          </body>
        </html>
      `;
      return res.send(html);
    }

    // Return a signed URL for the underlying object (do not expose via /uploads without auth)
    const url = await StorageService.getSignedUrl(doc.storage_path, 15);
    try {
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
      await PhiDocumentAuditLog.create({
        documentId: doc.id,
        clientId: doc.client_id,
        action: 'downloaded',
        actorUserId: req.user.id,
        actorLabel: req.user?.email || req.user?.name || null,
        ipAddress: ip
      });
    } catch {
      // best-effort logging
    }
    res.json({ url });
  } catch (e) {
    next(e);
  }
};

export const listClientPhiDocumentAudit = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const schoolStaffAccessState = await resolveSchoolStaffAccessStateForClient({
      requestingUserId: req.user.id,
      requestingUserRole: req.user.role,
      client
    });
    const limitedScope = isSchoolStaffOwnDocumentScope({
      requestingUserRole: req.user.role,
      schoolStaffAccessState
    });
    const isSchoolStaff = String(req.user?.role || '').toLowerCase() === 'school_staff';
    const allowed = isSchoolStaff
      ? schoolStaffMayUsePhi(schoolStaffAccessState)
      : await userCanAccessClient({
          requestingUserId: req.user.id,
          requestingUserRole: req.user.role,
          client,
          requireDocumentAccess: true
        });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    let docs = [];
    try {
      docs = await ClientPhiDocument.findByClientId(clientId);
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        return res.json({ documents: [] });
      }
      throw e;
    }

    let logs = [];
    try {
      logs = await PhiDocumentAuditLog.listByClientId(clientId);
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        logs = [];
      } else {
        throw e;
      }
    }
    const logsByDoc = new Map();
    for (const log of logs) {
      if (!logsByDoc.has(log.document_id)) logsByDoc.set(log.document_id, []);
      logsByDoc.get(log.document_id).push(log);
    }

    const visibleDocs = isSchoolStaff
      ? filterPhiDocsForSchoolStaff(docs, { userId: req.user?.id, state: schoolStaffAccessState })
      : (limitedScope
        ? (docs || []).filter((doc) => Number(doc?.uploaded_by_user_id || 0) === Number(req.user?.id || 0))
        : (docs || []));
    const statements = visibleDocs.map(doc => {
      const docLogs = logsByDoc.get(doc.id) || [];
      const uploaded = docLogs.find(l => l.action === 'uploaded') || null;
      const downloaded = docLogs.find(l => l.action === 'downloaded') || null;
      const exported = docLogs.find(l => l.action === 'exported_to_ehr') || null;
      const removed = docLogs.find(l => l.action === 'removed') || null;
      return {
        documentId: doc.id,
        originalName: doc.original_name || null,
        documentTitle: doc.document_title || null,
        documentType: doc.document_type || null,
        uploadedAt: uploaded?.created_at || doc.uploaded_at || null,
        uploadedBy: uploaded?.actor_label || null,
        downloadedAt: downloaded?.created_at || null,
        downloadedBy: downloaded?.actor_label || null,
        exportedToEhrAt: doc.exported_to_ehr_at || exported?.created_at || null,
        exportedToEhrBy: exported?.actor_label || null,
        removedAt: doc.removed_at || removed?.created_at || null,
        removedBy: removed?.actor_label || null,
        removedReason: doc.removed_reason || removed?.metadata?.reason || null
      };
    });

    res.json({ documents: statements });
  } catch (e) {
    next(e);
  }
};

export const markPhiDocumentExported = async (req, res, next) => {
  try {
    const docId = parseInt(req.params.docId, 10);
    if (!docId) return res.status(400).json({ error: { message: 'docId is required' } });

    const doc = await ClientPhiDocument.findById(docId);
    if (!doc) return res.status(404).json({ error: { message: 'PHI document not found' } });
    if (doc.removed_at) {
      return res.status(410).json({ error: { message: 'Document has been removed from the system.' } });
    }

    const client = await Client.findById(doc.client_id, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({
      requestingUserId: req.user.id,
      requestingUserRole: req.user.role,
      client,
      requireDocumentAccess: true
    });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const exportedAt = new Date();
    const removedReason = 'Exported to Therapy Notes';
    const updated = await ClientPhiDocument.updateLifecycleById({
      id: doc.id,
      exportedToEhrAt: exportedAt,
      exportedToEhrByUserId: req.user.id,
      removedAt: exportedAt,
      removedByUserId: req.user.id,
      removedReason
    });

    try {
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
      await PhiDocumentAuditLog.create({
        documentId: doc.id,
        clientId: doc.client_id,
        action: 'exported_to_ehr',
        actorUserId: req.user.id,
        actorLabel: req.user?.email || req.user?.name || null,
        ipAddress: ip
      });
      await PhiDocumentAuditLog.create({
        documentId: doc.id,
        clientId: doc.client_id,
        action: 'removed',
        actorUserId: req.user.id,
        actorLabel: req.user?.email || req.user?.name || null,
        ipAddress: ip,
        metadata: { reason: removedReason }
      });
    } catch {
      // best-effort logging
    }

    try {
      await StorageService.deleteObject(doc.storage_path);
    } catch {
      // best-effort delete
    }

    res.json({ document: updated });
  } catch (e) {
    next(e);
  }
};

export const removePhiDocument = async (req, res, next) => {
  try {
    const docId = parseInt(req.params.docId, 10);
    if (!docId) return res.status(400).json({ error: { message: 'docId is required' } });

    const doc = await ClientPhiDocument.findById(docId);
    if (!doc) return res.status(404).json({ error: { message: 'PHI document not found' } });
    if (doc.removed_at) {
      return res.json({ document: doc });
    }

    const client = await Client.findById(doc.client_id, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({
      requestingUserId: req.user.id,
      requestingUserRole: req.user.role,
      client,
      requireDocumentAccess: true
    });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const removedAt = new Date();
    const reason = String(req.body?.reason || '').trim().slice(0, 255) || 'Shipped to Therapy Notes';
    const updated = await ClientPhiDocument.updateLifecycleById({
      id: doc.id,
      removedAt,
      removedByUserId: req.user.id,
      removedReason: reason
    });

    try {
      await StorageService.deleteObject(doc.storage_path);
    } catch {
      // best-effort delete
    }

    try {
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
      await PhiDocumentAuditLog.create({
        documentId: doc.id,
        clientId: doc.client_id,
        action: 'removed',
        actorUserId: req.user.id,
        actorLabel: req.user?.email || req.user?.name || null,
        ipAddress: ip,
        metadata: { reason: updated.removed_reason || null }
      });
    } catch {
      // best-effort logging
    }

    res.json({ document: updated });
  } catch (e) {
    next(e);
  }
};

