import { validationResult } from 'express-validator';
import crypto from 'crypto';
import IntakeLink from '../models/IntakeLink.model.js';
import pool from '../config/database.js';

const parseJsonField = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const listIntakeLinks = async (req, res, next) => {
  try {
    const scopeType = req.query.scopeType ? String(req.query.scopeType) : null;
    let links = [];
    if (scopeType) {
      links = await IntakeLink.findByScope({
        scopeType,
        organizationId: req.query.organizationId ? parseInt(req.query.organizationId, 10) : null,
        programId: req.query.programId ? parseInt(req.query.programId, 10) : null
      });
    } else {
      const [rows] = await pool.execute('SELECT * FROM intake_links ORDER BY updated_at DESC, id DESC');
      links = rows.map(row => IntakeLink.normalize(row));
    }
    res.json(links);
  } catch (error) {
    next(error);
  }
};

export const createIntakeLink = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const publicKey = crypto.randomBytes(24).toString('hex');
    const scopeType = req.body.scopeType || 'agency';
    const languageCode = String(req.body.languageCode || 'en').trim().toLowerCase();
    const createGuardianDefault = scopeType === 'school' ? false : req.body.createGuardian !== false;
    const link = await IntakeLink.create({
      publicKey,
      title: req.body.title || null,
      description: req.body.description || null,
      languageCode,
      scopeType,
      organizationId: req.body.organizationId ? parseInt(req.body.organizationId, 10) : null,
      programId: req.body.programId ? parseInt(req.body.programId, 10) : null,
      isActive: req.body.isActive !== false,
      createClient: req.body.createClient !== false,
      createGuardian: createGuardianDefault,
      allowedDocumentTemplateIds: parseJsonField(req.body.allowedDocumentTemplateIds),
      intakeFields: parseJsonField(req.body.intakeFields),
      intakeSteps: parseJsonField(req.body.intakeSteps),
      retentionPolicy: parseJsonField(req.body.retentionPolicy),
      createdByUserId: req.user?.id || null
    });

    res.status(201).json({ link });
  } catch (error) {
    next(error);
  }
};

export const updateIntakeLink = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const scopeType = req.body.scopeType ?? undefined;
    const languageCode =
      req.body.languageCode !== undefined ? String(req.body.languageCode || '').trim().toLowerCase() : undefined;
    const updates = {
      title: req.body.title ?? null,
      description: req.body.description ?? null,
      language_code: languageCode === undefined ? undefined : (languageCode || null),
      scope_type: scopeType,
      organization_id: req.body.organizationId ? parseInt(req.body.organizationId, 10) : null,
      program_id: req.body.programId ? parseInt(req.body.programId, 10) : null,
      is_active: req.body.isActive !== undefined ? (req.body.isActive ? 1 : 0) : undefined,
      create_client: req.body.createClient !== undefined ? (req.body.createClient ? 1 : 0) : undefined,
      create_guardian: req.body.createGuardian !== undefined ? (req.body.createGuardian ? 1 : 0) : undefined,
      allowed_document_template_ids: req.body.allowedDocumentTemplateIds ? JSON.stringify(parseJsonField(req.body.allowedDocumentTemplateIds)) : null,
      intake_fields: req.body.intakeFields ? JSON.stringify(parseJsonField(req.body.intakeFields)) : null,
      intake_steps: req.body.intakeSteps ? JSON.stringify(parseJsonField(req.body.intakeSteps)) : null,
      retention_policy_json: (() => {
        if (req.body.retentionPolicy === undefined) return undefined;
        const parsed = parseJsonField(req.body.retentionPolicy);
        return parsed ? JSON.stringify(parsed) : null;
      })()
    };

    if (scopeType === 'school') {
      updates.create_guardian = 0;
    }

    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    if (!Object.keys(filtered).length) {
      return res.status(400).json({ error: { message: 'No updates provided' } });
    }

    const pool = (await import('../config/database.js')).default;
    const fields = Object.keys(filtered);
    const values = fields.map((f) => filtered[f]);
    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    values.push(id);
    await pool.execute(`UPDATE intake_links SET ${setClause} WHERE id = ?`, values);

    const link = await IntakeLink.findById(id);
    res.json({ link });
  } catch (error) {
    next(error);
  }
};

export const duplicateIntakeLink = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const existing = await IntakeLink.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const publicKey = crypto.randomBytes(24).toString('hex');
    const title = existing.title ? `${existing.title} (Copy)` : 'Intake Link (Copy)';
    const link = await IntakeLink.create({
      publicKey,
      title,
      description: existing.description || null,
      languageCode: existing.language_code || 'en',
      scopeType: existing.scope_type || 'agency',
      organizationId: existing.organization_id || null,
      programId: existing.program_id || null,
      isActive: false,
      createClient: existing.create_client !== false,
      createGuardian: existing.create_guardian !== false,
      allowedDocumentTemplateIds: existing.allowed_document_template_ids || [],
      intakeFields: existing.intake_fields || null,
      intakeSteps: existing.intake_steps || null,
      retentionPolicy: existing.retention_policy_json || null,
      createdByUserId: req.user?.id || null
    });

    res.status(201).json({ link });
  } catch (error) {
    next(error);
  }
};
