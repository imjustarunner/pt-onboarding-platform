import { validationResult } from 'express-validator';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import AgencyTrainingKbDocument from '../models/AgencyTrainingKbDocument.model.js';
import ActivityLogService from '../services/activityLog.service.js';
import {
  uploadTrainingKbDocument,
  deleteTrainingKbDocument,
  getTrainingKbGcsPrefix,
  linkGoogleDocToTrainingKb,
  refreshTrainingKbGoogleDoc
} from '../services/trainingKnowledgeBase.service.js';
import {
  generateModuleDraft,
  applyModuleDraft
} from '../services/trainingModuleDraft.service.js';

function parseFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
}

function isTruthyFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function isAdminLike(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
}

async function requireUserHasAgencyAccess(req, res, agencyId) {
  const roleNorm = String(req.user?.role || '').toLowerCase();
  if (roleNorm === 'super_admin') return true;

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: { message: 'Not authenticated' } });
    return false;
  }

  const agencies = await User.getAgencies(userId);
  const ids = (agencies || []).map((a) => Number(a?.id)).filter((n) => Number.isFinite(n));
  if (!ids.includes(Number(agencyId))) {
    res.status(403).json({ error: { message: 'You do not have access to this agency' } });
    return false;
  }
  return true;
}

async function requireTrainingAiBuilderEnabled(req, res, agencyId) {
  try {
    const agency = await Agency.findById(agencyId);
    if (!agency) {
      res.status(404).json({ error: { message: 'Agency not found' } });
      return false;
    }
    const flags = parseFlags(agency?.feature_flags);
    if (!isTruthyFlag(flags?.trainingAiBuilderEnabled)) {
      res.status(403).json({ error: { message: 'Training AI Builder is disabled for this organization' } });
      return false;
    }
    return true;
  } catch {
    res.status(403).json({ error: { message: 'Training AI Builder is disabled for this organization' } });
    return false;
  }
}

function parseAgencyId(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeFolder(raw) {
  const f = String(raw || 'handbook').trim().toLowerCase();
  return f === 'policies' ? 'policies' : 'handbook';
}

export const listTrainingKbDocuments = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.query?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireTrainingAiBuilderEnabled(req, res, agencyId))) return;
    if (!isAdminLike(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const folder = req.query?.folder ? normalizeFolder(req.query.folder) : null;
    const docs = await AgencyTrainingKbDocument.findByAgencyId(agencyId, { folder });
    res.json({
      documents: docs.map((d) => ({
        id: d.id,
        agencyId: d.agency_id,
        folder: d.folder,
        fileName: d.file_name,
        gcsPath: d.gcs_path,
        contentType: d.content_type,
        sizeBytes: d.size_bytes,
        sourceUrl: d.source_url || null,
        sourceKind: d.source_kind || null,
        lastSyncedAt: d.last_synced_at || null,
        uploadedByUserId: d.uploaded_by_user_id,
        uploadedByName: [d.uploaded_by_first_name, d.uploaded_by_last_name].filter(Boolean).join(' ').trim() || null,
        createdAt: d.created_at
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const linkTrainingKbGoogleDocHandler = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseAgencyId(req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireTrainingAiBuilderEnabled(req, res, agencyId))) return;
    if (!isAdminLike(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const docUrl = String(req.body?.docUrl || req.body?.url || '').trim();
    if (!docUrl) return res.status(400).json({ error: { message: 'Google Doc URL is required' } });

    const folder = normalizeFolder(req.body?.folder);
    const displayName = String(req.body?.displayName || '').trim() || null;

    const row = await linkGoogleDocToTrainingKb({
      agencyId,
      folder,
      docUrl,
      uploadedByUserId: req.user?.id,
      displayName
    });

    res.status(201).json({
      document: {
        id: row.id,
        agencyId: row.agency_id,
        folder: row.folder,
        fileName: row.file_name,
        sourceUrl: row.source_url || null,
        sourceKind: row.source_kind || null,
        lastSyncedAt: row.last_synced_at || null,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at
      }
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const refreshTrainingKbDocumentHandler = async (req, res, next) => {
  try {
    const docId = parseAgencyId(req.params?.id);
    if (!docId) return res.status(400).json({ error: { message: 'Invalid document id' } });

    const doc = await AgencyTrainingKbDocument.findById(docId);
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });

    if (!(await requireUserHasAgencyAccess(req, res, doc.agency_id))) return;
    if (!(await requireTrainingAiBuilderEnabled(req, res, doc.agency_id))) return;
    if (!isAdminLike(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const row = await refreshTrainingKbGoogleDoc(doc, { uploadedByUserId: req.user?.id });
    res.json({
      document: {
        id: row.id,
        agencyId: row.agency_id,
        folder: row.folder,
        fileName: row.file_name,
        sourceUrl: row.source_url || null,
        sourceKind: row.source_kind || null,
        lastSyncedAt: row.last_synced_at || null,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at
      }
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const uploadTrainingKbDocumentHandler = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseAgencyId(req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireTrainingAiBuilderEnabled(req, res, agencyId))) return;
    if (!isAdminLike(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    if (!req.file?.buffer) return res.status(400).json({ error: { message: 'file is required' } });
    const mime = String(req.file.mimetype || '').toLowerCase();
    if (mime && mime !== 'application/pdf' && mime !== 'text/plain') {
      return res.status(400).json({ error: { message: 'Only PDF or TXT files are allowed' } });
    }

    const folder = normalizeFolder(req.body?.folder);
    const row = await uploadTrainingKbDocument({
      agencyId,
      folder,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      uploadedByUserId: req.user?.id
    });

    res.status(201).json({
      document: {
        id: row.id,
        agencyId: row.agency_id,
        folder: row.folder,
        fileName: row.file_name,
        gcsPath: row.gcs_path,
        createdAt: row.created_at
      },
      prefix: getTrainingKbGcsPrefix(agencyId, folder)
    });
  } catch (e) {
    next(e);
  }
};

export const deleteTrainingKbDocumentHandler = async (req, res, next) => {
  try {
    const docId = parseAgencyId(req.params?.id);
    if (!docId) return res.status(400).json({ error: { message: 'Invalid document id' } });

    const doc = await AgencyTrainingKbDocument.findById(docId);
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });

    if (!(await requireUserHasAgencyAccess(req, res, doc.agency_id))) return;
    if (!(await requireTrainingAiBuilderEnabled(req, res, doc.agency_id))) return;
    if (!isAdminLike(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    await deleteTrainingKbDocument(doc);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const generateModuleDraftHandler = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const agencyId = parseAgencyId(req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireTrainingAiBuilderEnabled(req, res, agencyId))) return;

    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: { message: 'title is required' } });

    const files = Array.isArray(req.files) ? req.files : req.file ? [req.file] : [];
    if (!files.length && !String(req.body?.notes || '').trim()) {
      const kbDocs = await AgencyTrainingKbDocument.findByAgencyId(agencyId);
      if (!kbDocs.length) {
        return res.status(400).json({
          error: { message: 'Upload at least one source file, add notes, or upload handbook documents to the training KB first' }
        });
      }
    }

    let audienceRoles = req.body?.audienceRoles;
    if (typeof audienceRoles === 'string') {
      try {
        audienceRoles = JSON.parse(audienceRoles);
      } catch {
        audienceRoles = audienceRoles.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    const started = Date.now();
    const result = await generateModuleDraft({
      agencyId,
      title,
      description: String(req.body?.description || '').trim(),
      learningObjectives: String(req.body?.learningObjectives || '').trim(),
      audienceRoles,
      templateId: String(req.body?.templateId || 'rich-text-quiz').trim(),
      notes: String(req.body?.notes || '').trim(),
      files,
      actorUserId: req.user?.id
    });

    try {
      ActivityLogService.logActivity(
        {
          actionType: 'training_module_draft_generated',
          userId: req.user?.id ?? null,
          agencyId,
          metadata: {
            generationRequestId: result.generationRequestId,
            model: result.model,
            pageCount: result.draft?.pages?.length || 0,
            latencyMs: result.latencyMs,
            totalMs: Date.now() - started
          }
        },
        req
      );
    } catch {
      // ignore
    }

    res.json({
      draft: result.draft,
      generationRequestId: result.generationRequestId,
      model: result.model
    });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message || 'Generation failed' } });
    }
    next(e);
  }
};

export const applyModuleDraftHandler = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    if (!isAdminLike(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const agencyId = parseAgencyId(req.body?.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireTrainingAiBuilderEnabled(req, res, agencyId))) return;

    const draft = req.body?.draft;
    if (!draft || typeof draft !== 'object') {
      return res.status(400).json({ error: { message: 'draft is required' } });
    }

    const trainingFocusId = req.body?.trainingFocusId
      ? parseAgencyId(req.body.trainingFocusId)
      : null;
    const trackOrderIndex = Number.parseInt(req.body?.trackOrderIndex, 10);
    const generationRequestId = req.body?.generationRequestId
      ? Number.parseInt(req.body.generationRequestId, 10)
      : null;

    const result = await applyModuleDraft({
      agencyId,
      draft,
      generationRequestId: Number.isInteger(generationRequestId) ? generationRequestId : null,
      trainingFocusId: Number.isInteger(trainingFocusId) ? trainingFocusId : null,
      trackOrderIndex: Number.isInteger(trackOrderIndex) ? trackOrderIndex : 0,
      createdByUserId: req.user?.id
    });

    try {
      ActivityLogService.logActivity(
        {
          actionType: 'training_module_draft_applied',
          userId: req.user?.id ?? null,
          agencyId,
          metadata: {
            moduleId: result.moduleId,
            generationRequestId: generationRequestId || null,
            trainingFocusId: trainingFocusId || null
          }
        },
        req
      );
    } catch {
      // ignore
    }

    res.status(201).json({ moduleId: result.moduleId, module: result.module });
  } catch (e) {
    next(e);
  }
};
