/**
 * lifecycle.controller.js
 *
 * Handles HR Lifecycle tab operations:
 *   GET    /users/:id/lifecycle            Full lifecycle payload
 *   PATCH  /users/:id/lifecycle/dates      Update milestone dates
 *   PATCH  /users/:id/lifecycle/separation Update separation info
 *   POST   /users/:id/lifecycle/checklist/:definitionId/toggle  Check/uncheck item
 *   POST   /users/:id/lifecycle/checklist/:definitionId/not-applicable  Mark not needed / restore
 *   POST   /users/:id/lifecycle/checklist/:definitionId/attachment  Upload retroactive doc
 *   GET    /users/:id/lifecycle/checklist/:definitionId/attachment  Download attachment
 *   DELETE /users/:id/lifecycle/checklist/:definitionId/attachment  Remove attachment
 *   POST   /users/:id/lifecycle/sync       Re-run auto-sync
 */
import multer from 'multer';
import path from 'path';
import { getLifecycleData, saveMilestoneDates } from '../services/lifecycle.service.js';
import { syncLifecycleItems } from '../services/lifecycleSync.service.js';
import UserLifecycleChecklistItem from '../models/UserLifecycleChecklistItem.model.js';
import UserSeparationInfo from '../models/UserSeparationInfo.model.js';
import LifecycleChecklistDefinition from '../models/LifecycleChecklistDefinition.model.js';
import { scopeLifecycleItem } from '../services/lifecycleScope.service.js';
import StorageService from '../services/storage.service.js';
import DocumentEncryptionService from '../services/documentEncryption.service.js';

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'), false);
  },
  limits: { fileSize: 15 * 1024 * 1024 },
});

const ATTACHMENT_INTEGRATION_TYPES = new Set(['document_task', 'manual']);

function canAttachToDefinition(def) {
  if (!def) return false;
  if (def.category !== 'compliance_documents') return false;
  return ATTACHMENT_INTEGRATION_TYPES.has(String(def.integration_type || '').toLowerCase());
}

async function loadAttachmentContext(req) {
  const userId = parseInt(req.params.id, 10);
  const definitionId = parseInt(req.params.definitionId, 10);
  if (!userId || !definitionId) {
    return { error: { status: 400, message: 'Invalid user id or definition id' } };
  }

  const def = await LifecycleChecklistDefinition.findById(definitionId);
  if (!def) return { error: { status: 404, message: 'Checklist item not found' } };
  if (!canAttachToDefinition(def)) {
    return { error: { status: 400, message: 'This checklist item does not support document uploads' } };
  }

  await UserLifecycleChecklistItem.ensureRows(userId, [definitionId]);
  const row = await UserLifecycleChecklistItem.findByUserAndDefinition(userId, definitionId);
  return { userId, definitionId, def, row };
}

async function deleteStoredAttachment(row) {
  if (!row?.attachment_storage_path) return;
  try {
    await StorageService.deleteLifecycleChecklistAttachment(row.attachment_storage_path);
  } catch {
    // best-effort
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export const getUserLifecycle = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    // Run auto-sync on every load (non-blocking to response but awaited for accuracy)
    try {
      await syncLifecycleItems(userId);
    } catch {
      // sync failures are non-fatal
    }

    const data = await getLifecycleData(userId);
    res.json(data);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: { message: err.message } });
    next(err);
  }
};

export const updateLifecycleDates = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const allowed = new Set([
      'offer_accepted_date',
      'start_date',
      'orientation_date',
      'therapy_notes_training_date',
      'first_client_date',
      'first_payroll_submission_date',
      'probation_end_date',
    ]);

    const payload = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (allowed.has(k)) {
        payload[k] = v || null;
      }
    }

    await saveMilestoneDates(userId, payload);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const updateSeparationInfo = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const {
      lastDayWorked,
      separationType,
      resignationReceivedDate,
      rehireEligible,
      exitInterviewCompleted,
      offboardingNotes,
      terminationDate,
    } = req.body || {};

    const validSepTypes = [null, undefined, 'voluntary', 'involuntary', ''];
    if (separationType !== undefined && !validSepTypes.includes(separationType)) {
      return res.status(400).json({ error: { message: 'separationType must be voluntary or involuntary' } });
    }

    // Setting / clearing termination_date enables (or disables) Lifecycle offboarding.
    if (terminationDate !== undefined) {
      const pool = (await import('../config/database.js')).default;
      const User = (await import('../models/User.model.js')).default;
      const existing = await User.findById(userId);
      if (!existing) return res.status(404).json({ error: { message: 'User not found' } });

      const nextDate = terminationDate
        ? String(terminationDate).trim().slice(0, 10)
        : null;
      if (nextDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
        return res.status(400).json({ error: { message: 'terminationDate must be YYYY-MM-DD' } });
      }

      const hadDate = !!existing.termination_date;
      await pool.execute(
        `UPDATE users SET termination_date = ? WHERE id = ?`,
        [nextDate, userId]
      );

      // First time a termination date is set → scope offboarding checklist items.
      if (nextDate && !hadDate) {
        try {
          const { scopeOffboardingChecklist } = await import('../services/lifecycleScope.service.js');
          await scopeOffboardingChecklist(userId);
        } catch (scopeErr) {
          console.warn('[updateSeparationInfo] offboarding scope failed:', scopeErr?.message);
        }
      }
    }

    const row = await UserSeparationInfo.upsert(
      userId,
      {
        lastDayWorked: lastDayWorked || null,
        separationType: separationType || null,
        resignationReceivedDate: resignationReceivedDate || null,
        rehireEligible: rehireEligible != null ? !!rehireEligible : null,
        exitInterviewCompleted: !!exitInterviewCompleted,
        offboardingNotes: offboardingNotes || null,
      },
      req.user?.id
    );
    res.json({ ok: true, separation: row });
  } catch (err) {
    next(err);
  }
};

export const toggleLifecycleChecklistItem = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const definitionId = parseInt(req.params.definitionId, 10);
    if (!userId || !definitionId) {
      return res.status(400).json({ error: { message: 'Invalid user id or definition id' } });
    }

    const { completed } = req.body || {};
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: { message: 'completed (boolean) is required' } });
    }

    const def = await LifecycleChecklistDefinition.findById(definitionId);
    if (!def) return res.status(404).json({ error: { message: 'Checklist item not found' } });

    const item = await UserLifecycleChecklistItem.toggle(userId, definitionId, completed, req.user?.id);
    await scopeLifecycleItem(userId, def.item_key, 'manual', definitionId);
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
};

export const setLifecycleChecklistNotApplicable = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const definitionId = parseInt(req.params.definitionId, 10);
    if (!userId || !definitionId) {
      return res.status(400).json({ error: { message: 'Invalid user id or definition id' } });
    }

    const { notApplicable } = req.body || {};
    if (typeof notApplicable !== 'boolean') {
      return res.status(400).json({ error: { message: 'notApplicable (boolean) is required' } });
    }

    const def = await LifecycleChecklistDefinition.findById(definitionId);
    if (!def) return res.status(404).json({ error: { message: 'Checklist item not found' } });

    const item = await UserLifecycleChecklistItem.setNotApplicable(
      userId,
      definitionId,
      notApplicable,
      req.user?.id
    );
    if (notApplicable) {
      await scopeLifecycleItem(userId, def.item_key, 'manual', definitionId);
    }
    res.json({ ok: true, item });
  } catch (err) {
    next(err);
  }
};

export const syncLifecycle = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    await syncLifecycleItems(userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const uploadLifecycleChecklistAttachment = [
  attachmentUpload.single('file'),
  async (req, res, next) => {
    try {
      const ctx = await loadAttachmentContext(req);
      if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });

      if (!req.file) {
        return res.status(400).json({ error: { message: 'PDF file is required' } });
      }

      const { userId, definitionId, def, row } = ctx;
      const originalName = req.file.originalname || 'document.pdf';
      const safeExt = path.extname(originalName) || '.pdf';
      const filename = `${def.item_key || 'checklist'}-${Date.now()}${safeExt}`;

      const encryptionAad = JSON.stringify({
        userId,
        definitionId,
        itemKey: def.item_key,
        uploadType: 'lifecycle_checklist_attachment',
      });

      let fileBuffer = req.file.buffer;
      let isEncrypted = false;
      let encryptionMeta = {
        encryptionKeyId: null,
        encryptionWrappedKeyB64: null,
        encryptionIvB64: null,
        encryptionAuthTagB64: null,
        encryptionAlg: null,
        encryptionAad: null,
      };

      if (DocumentEncryptionService.isConfigured()) {
        const enc = await DocumentEncryptionService.encryptBuffer(fileBuffer, { aad: encryptionAad });
        fileBuffer = enc.encryptedBuffer;
        isEncrypted = true;
        encryptionMeta = {
          encryptionKeyId: enc.encryptionKeyId,
          encryptionWrappedKeyB64: enc.encryptionWrappedKeyB64,
          encryptionIvB64: enc.encryptionIvB64,
          encryptionAuthTagB64: enc.encryptionAuthTagB64,
          encryptionAlg: enc.encryptionAlg,
          encryptionAad: encryptionAad,
        };
      }

      const storageResult = await StorageService.saveLifecycleChecklistAttachment({
        userId,
        definitionId,
        fileBuffer,
        filename,
        contentType: req.file.mimetype,
        isEncrypted,
      });

      if (row?.attachment_storage_path) {
        await deleteStoredAttachment(row);
      }

      const uploadedAt = new Date();
      const updated = await UserLifecycleChecklistItem.setAttachment(
        userId,
        definitionId,
        {
          storagePath: storageResult.relativePath,
          originalName,
          mimeType: req.file.mimetype || 'application/pdf',
          uploadedAt,
          uploadedByUserId: req.user?.id || null,
          isEncrypted,
          ...encryptionMeta,
        },
        { markComplete: true, completedByUserId: req.user?.id || null }
      );

      await scopeLifecycleItem(userId, def.item_key, 'manual', definitionId);

      res.status(201).json({
        ok: true,
        attachment: {
          hasAttachment: true,
          originalName,
          uploadedAt,
          isEncrypted,
        },
        item: updated,
      });
    } catch (err) {
      next(err);
    }
  },
];

export const downloadLifecycleChecklistAttachment = async (req, res, next) => {
  try {
    const ctx = await loadAttachmentContext(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });

    const { row } = ctx;
    if (!row?.attachment_storage_path) {
      return res.status(404).json({ error: { message: 'No attachment found for this item' } });
    }

    const encryptedBuffer = await StorageService.readObjectBuffer(row.attachment_storage_path);
    let outputBuffer = encryptedBuffer;

    if (row.attachment_is_encrypted) {
      outputBuffer = await DocumentEncryptionService.decryptBuffer({
        encryptedBuffer,
        encryptionKeyId: row.attachment_encryption_key_id,
        encryptionWrappedKeyB64: row.attachment_encryption_wrapped_key_b64,
        encryptionIvB64: row.attachment_encryption_iv_b64,
        encryptionAuthTagB64: row.attachment_encryption_auth_tag_b64,
        aad: row.attachment_encryption_aad,
      });
    }

    const downloadName = row.attachment_original_name || 'document.pdf';
    res.setHeader('Content-Type', row.attachment_mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName.replace(/"/g, '')}"`);
    res.send(outputBuffer);
  } catch (err) {
    next(err);
  }
};

export const deleteLifecycleChecklistAttachment = async (req, res, next) => {
  try {
    const ctx = await loadAttachmentContext(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: { message: ctx.error.message } });

    const { userId, definitionId, row } = ctx;
    if (!row?.attachment_storage_path) {
      return res.status(404).json({ error: { message: 'No attachment found for this item' } });
    }

    await deleteStoredAttachment(row);
    await UserLifecycleChecklistItem.clearAttachment(userId, definitionId);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

/** GET /api/lifecycle/checklist-definitions — for document editor + package config dropdowns */
export const listChecklistDefinitions = async (req, res, next) => {
  try {
    const phase = String(req.query.phase || 'onboarding').toLowerCase();
    const defs = phase === 'offboarding'
      ? await LifecycleChecklistDefinition.findByPhase('offboarding')
      : await LifecycleChecklistDefinition.findByPhase('onboarding');

    const grouped = {};
    for (const def of defs) {
      const cat = def.category || 'other';
      if (!grouped[cat]) {
        grouped[cat] = {
          category: cat,
          label: LifecycleChecklistDefinition.categoryLabel(cat),
          items: []
        };
      }
      grouped[cat].items.push({
        id: def.id,
        itemKey: def.item_key,
        label: def.item_label,
        integrationType: def.integration_type,
        integrationRef: def.integration_ref,
        appliesTo: def.applies_to,
        isRequired: !!def.is_required
      });
    }

    const order = LifecycleChecklistDefinition.categoryOrder(phase);
    const groups = order.filter((c) => grouped[c]).map((c) => grouped[c]);

    res.json({ phase, groups, definitions: defs });
  } catch (err) {
    next(err);
  }
};
