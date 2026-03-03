import { validationResult } from 'express-validator';
import crypto from 'crypto';
import IntakeLink from '../models/IntakeLink.model.js';
import User from '../models/User.model.js';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
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

const isSuperAdmin = (role) => String(role || '').toLowerCase() === 'super_admin';

const asNumberOrNull = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const canAccessLink = ({ link, userOrgIds, userId }) => {
  const orgId = asNumberOrNull(link?.organization_id);
  if (orgId) return userOrgIds.includes(orgId);
  return asNumberOrNull(link?.created_by_user_id) === asNumberOrNull(userId);
};

const getUserOrganizationIds = async (userId) => {
  const memberships = await User.getAgencies(userId);
  return (memberships || [])
    .map((row) => asNumberOrNull(row?.id))
    .filter((id) => Number.isFinite(id));
};

export const listIntakeLinks = async (req, res, next) => {
  try {
    const scopeType = req.query.scopeType ? String(req.query.scopeType) : null;
    const organizationId = req.query.organizationId ? asNumberOrNull(req.query.organizationId) : null;

    let userOrgIds = [];
    if (!isSuperAdmin(req.user?.role)) {
      userOrgIds = await getUserOrganizationIds(req.user?.id);
      if (organizationId && !userOrgIds.includes(organizationId)) {
        return res.status(403).json({ error: { message: 'Access denied for requested organization.' } });
      }
    }

    let links = [];
    if (scopeType) {
      links = await IntakeLink.findByScope({
        scopeType,
        organizationId,
        programId: req.query.programId ? parseInt(req.query.programId, 10) : null
      });
    } else {
      const [rows] = await pool.execute('SELECT * FROM intake_links ORDER BY updated_at DESC, id DESC');
      links = rows.map(row => IntakeLink.normalize(row));
    }
    if (!isSuperAdmin(req.user?.role)) {
      links = links.filter((link) => canAccessLink({ link, userOrgIds, userId: req.user?.id }));
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
    const organizationId = req.body.organizationId ? asNumberOrNull(req.body.organizationId) : null;
    const userOrgIds = isSuperAdmin(req.user?.role) ? [] : await getUserOrganizationIds(req.user?.id);
    if (!isSuperAdmin(req.user?.role) && organizationId && !userOrgIds.includes(organizationId)) {
      return res.status(403).json({ error: { message: 'Access denied for requested organization.' } });
    }

    const formTypeRaw = String(req.body.formType || 'intake').toLowerCase();
    const formType = ['public_form', 'job_application', 'medical_records_request'].includes(formTypeRaw) ? formTypeRaw : 'intake';
    const createClientDefault = ['public_form', 'medical_records_request', 'job_application'].includes(formType) ? false : (req.body.createClient !== false);
    const requiresAssignmentDefault = formType === 'medical_records_request' ? false : true;
    let jobDescriptionId = req.body.jobDescriptionId ? asNumberOrNull(req.body.jobDescriptionId) : null;
    let effectiveOrgId = organizationId;
    if (formType === 'job_application') {
      if (!jobDescriptionId) return res.status(400).json({ error: { message: 'jobDescriptionId is required for job application forms' } });
      const jd = await HiringJobDescription.findById(jobDescriptionId);
      if (!jd || !jd.is_active) return res.status(400).json({ error: { message: 'Invalid or inactive job description' } });
      effectiveOrgId = jd.agency_id;
      if (!isSuperAdmin(req.user?.role) && !userOrgIds.includes(Number(effectiveOrgId))) {
        return res.status(403).json({ error: { message: 'Access denied for this job' } });
      }
    }
    const link = await IntakeLink.create({
      publicKey,
      title: req.body.title || null,
      description: req.body.description || null,
      languageCode,
      scopeType,
      formType,
      organizationId: effectiveOrgId,
      programId: req.body.programId ? parseInt(req.body.programId, 10) : null,
      jobDescriptionId: formType === 'job_application' ? jobDescriptionId : null,
      isActive: req.body.isActive !== false,
      createClient: req.body.createClient !== undefined ? req.body.createClient : createClientDefault,
      createGuardian: createGuardianDefault,
      requiresAssignment: req.body.requiresAssignment !== undefined ? req.body.requiresAssignment : requiresAssignmentDefault,
      allowedDocumentTemplateIds: parseJsonField(req.body.allowedDocumentTemplateIds),
      intakeFields: parseJsonField(req.body.intakeFields),
      intakeSteps: parseJsonField(req.body.intakeSteps),
      retentionPolicy: parseJsonField(req.body.retentionPolicy),
      customMessages: parseJsonField(req.body.customMessages),
      createdByUserId: req.user?.id || null
    });

    res.status(201).json({ link });
  } catch (error) {
    next(error);
  }
};

export const createIntakeLinkFromJob = async (req, res, next) => {
  try {
    const jobDescriptionId = parseInt(req.params.jobDescriptionId, 10);
    if (!jobDescriptionId) return res.status(400).json({ error: { message: 'jobDescriptionId is required' } });

    const jd = await HiringJobDescription.findById(jobDescriptionId);
    if (!jd || !jd.is_active) return res.status(404).json({ error: { message: 'Job not found or inactive' } });

    const userOrgIds = isSuperAdmin(req.user?.role) ? [] : await getUserOrganizationIds(req.user?.id);
    if (!isSuperAdmin(req.user?.role) && !userOrgIds.includes(Number(jd.agency_id))) {
      return res.status(403).json({ error: { message: 'Access denied for this job' } });
    }

    const publicKey = crypto.randomBytes(24).toString('hex');
    const link = await IntakeLink.create({
      publicKey,
      title: `Apply: ${jd.title || 'Job Application'}`,
      description: jd.description || null,
      languageCode: 'en',
      scopeType: 'agency',
      formType: 'job_application',
      organizationId: jd.agency_id,
      programId: null,
      jobDescriptionId,
      isActive: true,
      createClient: false,
      createGuardian: false,
      requiresAssignment: true,
      allowedDocumentTemplateIds: [],
      intakeFields: null,
      intakeSteps: null,
      retentionPolicy: null,
      customMessages: null,
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
    const existing = await IntakeLink.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Intake link not found' } });
    if (!isSuperAdmin(req.user?.role)) {
      const userOrgIds = await getUserOrganizationIds(req.user?.id);
      if (!canAccessLink({ link: existing, userOrgIds, userId: req.user?.id })) {
        return res.status(403).json({ error: { message: 'Access denied for this intake link.' } });
      }
      const requestedOrgId = req.body.organizationId ? asNumberOrNull(req.body.organizationId) : null;
      if (requestedOrgId && !userOrgIds.includes(requestedOrgId)) {
        return res.status(403).json({ error: { message: 'Access denied for requested organization.' } });
      }
    }

    const scopeType = req.body.scopeType ?? undefined;
    const languageCode =
      req.body.languageCode !== undefined ? String(req.body.languageCode || '').trim().toLowerCase() : undefined;
    const formTypeRaw = req.body.formType !== undefined ? String(req.body.formType || 'intake').toLowerCase() : undefined;
    const formType = formTypeRaw && ['public_form', 'job_application', 'medical_records_request'].includes(formTypeRaw) ? formTypeRaw : (formTypeRaw === 'intake' ? 'intake' : undefined);
    const jobDescriptionId = req.body.jobDescriptionId !== undefined ? asNumberOrNull(req.body.jobDescriptionId) : undefined;
    if (formType === 'job_application' && jobDescriptionId && existing) {
      const jd = await HiringJobDescription.findById(jobDescriptionId);
      const orgId = Number(existing.organization_id || req.body.organizationId);
      if (jd && Number(jd.agency_id) !== orgId) {
        return res.status(400).json({ error: { message: 'Invalid jobDescriptionId for selected organization' } });
      }
    }
    const updates = {
      title: req.body.title ?? null,
      description: req.body.description ?? null,
      language_code: languageCode === undefined ? undefined : (languageCode || null),
      scope_type: scopeType,
      form_type: formType,
      organization_id: req.body.organizationId ? parseInt(req.body.organizationId, 10) : null,
      program_id: req.body.programId ? parseInt(req.body.programId, 10) : null,
      job_description_id: jobDescriptionId,
      requires_assignment: req.body.requiresAssignment !== undefined ? (req.body.requiresAssignment ? 1 : 0) : undefined,
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
      })(),
      custom_messages: (() => {
        if (req.body.customMessages === undefined) return undefined;
        const parsed = parseJsonField(req.body.customMessages);
        return parsed ? JSON.stringify(parsed) : null;
      })()
    };

    if (scopeType === 'school') {
      updates.create_guardian = 0;
    }

    const filtered = Object.fromEntries(Object.entries(updates).filter(([k, v]) => v !== undefined));
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
    if (!isSuperAdmin(req.user?.role)) {
      const userOrgIds = await getUserOrganizationIds(req.user?.id);
      if (!canAccessLink({ link: existing, userOrgIds, userId: req.user?.id })) {
        return res.status(403).json({ error: { message: 'Access denied for this intake link.' } });
      }
    }

    const publicKey = crypto.randomBytes(24).toString('hex');
    const title = existing.title ? `${existing.title} (Copy)` : 'Digital Form (Copy)';
    const link = await IntakeLink.create({
      publicKey,
      title,
      description: existing.description || null,
      languageCode: existing.language_code || 'en',
      scopeType: existing.scope_type || 'agency',
      formType: existing.form_type || 'intake',
      organizationId: existing.organization_id || null,
      programId: existing.program_id || null,
      jobDescriptionId: existing.job_description_id || null,
      isActive: false,
      createClient: existing.create_client !== false,
      createGuardian: existing.create_guardian !== false,
      requiresAssignment: existing.requires_assignment !== false,
      allowedDocumentTemplateIds: existing.allowed_document_template_ids || [],
      intakeFields: existing.intake_fields || null,
      intakeSteps: existing.intake_steps || null,
      retentionPolicy: existing.retention_policy_json || null,
      customMessages: existing.custom_messages || null,
      createdByUserId: req.user?.id || null
    });

    res.status(201).json({ link });
  } catch (error) {
    next(error);
  }
};
