import { validationResult } from 'express-validator';
import crypto from 'crypto';
import IntakeLink from '../models/IntakeLink.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeSubmissionDocument from '../models/IntakeSubmissionDocument.model.js';
import IntakeSubmissionClient from '../models/IntakeSubmissionClient.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import PublicIntakeSigningService from '../services/publicIntakeSigning.service.js';
import DocumentSigningService from '../services/documentSigning.service.js';
import PublicIntakeClientService from '../services/publicIntakeClient.service.js';
import { getClientIpAddress } from '../utils/ipAddress.util.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import Client from '../models/Client.model.js';
import StorageService from '../services/storage.service.js';
import EmailService from '../services/email.service.js';
import Agency from '../models/Agency.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import User from '../models/User.model.js';
import config from '../config/config.js';
import { verifyRecaptchaV3 } from '../services/captcha.service.js';
import ActivityLogService from '../services/activityLog.service.js';
import PlatformRetentionSettings from '../models/PlatformRetentionSettings.model.js';

const normalizeName = (name) => String(name || '').trim();

const isFieldVisible = (def, values = {}) => {
  const showIf = def?.showIf;
  if (!showIf || !showIf.fieldId) return true;
  const actual = values[showIf.fieldId];
  const expected = showIf.equals;
  if (Array.isArray(expected)) {
    return expected.map(String).includes(String(actual));
  }
  if (expected === '' || expected === null || expected === undefined) {
    return Boolean(actual);
  }
  return String(actual ?? '') === String(expected ?? '');
};

const buildSignerFromSubmission = (submission) => {
  const name = normalizeName(submission.signer_name);
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Signer';
  const lastName = parts.slice(1).join(' ') || '';
  return {
    firstName,
    lastName,
    email: submission.signer_email || 'unknown@example.com',
    userId: `Public-${submission.id}`
  };
};

const buildWorkflowData = ({ submission }) => ({
  consent_given_at: submission.consent_given_at,
  intent_to_sign_at: submission.submitted_at,
  identity_verified_at: null,
  finalized_at: submission.submitted_at,
  consent_ip: submission.ip_address || null,
  intent_ip: submission.ip_address || null
});

const buildAuditTrail = ({ link, submission }) => ({
  intakeLinkId: link.id,
  submissionId: submission.id,
  signerRole: submission.signer_role || 'guardian',
  signerName: submission.signer_name,
  signerInitials: submission.signer_initials,
  clientName: submission.client_name || null,
  consentGivenAt: submission.consent_given_at,
  submittedAt: submission.submitted_at,
  ipAddress: submission.ip_address,
  userAgent: submission.user_agent
});

const hasValue = (val) => val !== null && val !== undefined && (typeof val !== 'string' || val.trim() !== '');

const hashIntakeData = (intakeData) => {
  if (!intakeData) return null;
  try {
    const raw = JSON.stringify(intakeData);
    return crypto.createHash('sha256').update(raw).digest('hex');
  } catch {
    return null;
  }
};

const parseFieldDefinitions = (rawFieldDefs) => {
  try {
    const parsed = rawFieldDefs
      ? (typeof rawFieldDefs === 'string' ? JSON.parse(rawFieldDefs) : rawFieldDefs)
      : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildDocumentFieldValuesForClient = ({ link, intakeData, clientIndex = 0, baseFieldValues = {} }) => {
  const merged = { ...(baseFieldValues || {}) };
  const responses = intakeData?.responses || {};
  const clientResponses = Array.isArray(responses?.clients) ? (responses.clients[clientIndex] || {}) : {};
  const guardianResponses = responses?.guardian || {};
  const submissionResponses = responses?.submission || {};
  const clientPayload = Array.isArray(intakeData?.clients) ? (intakeData.clients[clientIndex] || {}) : {};
  const guardianPayload = intakeData?.guardian || {};

  const setValue = (key, value) => {
    if (!key) return;
    if (!hasValue(value)) return;
    merged[key] = value;
  };

  const fullName = String(clientPayload?.fullName || '').trim() || `${String(clientPayload?.firstName || '').trim()} ${String(clientPayload?.lastName || '').trim()}`.trim();
  if (fullName) {
    const parts = fullName.split(/\s+/);
    setValue('client_full_name', fullName);
    setValue('client_first', parts[0] || '');
    setValue('client_last', parts.slice(1).join(' ') || '');
  }
  setValue('client_initials', clientPayload?.initials || '');

  setValue('guardian_first', guardianPayload?.firstName || '');
  setValue('guardian_last', guardianPayload?.lastName || '');
  setValue('guardian_email', guardianPayload?.email || '');
  setValue('guardian_phone', guardianPayload?.phone || '');
  setValue('relationship', guardianPayload?.relationship || '');

  const steps = Array.isArray(link?.intake_steps) ? link.intake_steps : [];
  steps.forEach((step) => {
    if (step?.type !== 'questions' || !Array.isArray(step.fields)) return;
    step.fields.forEach((field) => {
      const documentKey = String(field?.documentKey || '').trim();
      if (!documentKey) return;
      const key = field?.key;
      if (!key) return;
      let value = clientResponses?.[key];
      if (!hasValue(value)) value = guardianResponses?.[key];
      if (!hasValue(value)) value = submissionResponses?.[key];
      if (hasValue(value)) merged[documentKey] = value;
    });
  });

  return merged;
};

const normalizeAnswerValue = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) {
    return val.map((entry) => normalizeAnswerValue(entry)).filter(Boolean).join(', ');
  }
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
};

const buildIntakeFieldIndex = (link) => {
  const fields = Array.isArray(link?.intake_fields) ? link.intake_fields : [];
  const byKey = new Map();
  fields.forEach((field) => {
    if (!field?.key) return;
    byKey.set(field.key, field);
  });
  return { fields, byKey };
};

const getOrderedFieldsByScope = (fields, scope) =>
  fields.filter((field) => (field?.scope || 'client') === scope && field?.type !== 'info' && field?.key);

const isIntakeFieldVisible = (field, values = {}) => {
  const showIf = field?.showIf;
  if (!showIf || !showIf.fieldKey) return true;
  const actual = values[showIf.fieldKey];
  const expected = showIf.equals;
  if (Array.isArray(expected)) {
    return expected.map((v) => String(v).trim().toLowerCase()).includes(String(actual).trim().toLowerCase());
  }
  if (expected === '' || expected === null || expected === undefined) {
    return Boolean(actual);
  }
  return String(actual ?? '').trim().toLowerCase() === String(expected ?? '').trim().toLowerCase();
};

const buildAnswerLinesForScope = ({ fields, responses }) => {
  const lines = [];
  fields.forEach((field) => {
    if (!isIntakeFieldVisible(field, responses)) return;
    const value = responses?.[field.key];
    if (!hasValue(value)) return;
    const label = String(field?.label || field?.key || '').trim() || String(field?.key || '').trim();
    const rendered = normalizeAnswerValue(value);
    if (!label || !rendered) return;
    lines.push({ key: field.key, label, value: rendered });
  });
  return lines;
};

const buildIntakeAnswersText = ({ link, intakeData, clientIndex = 0 }) => {
  if (!intakeData) return '';
  const { fields } = buildIntakeFieldIndex(link);
  const guardianPayload = intakeData?.guardian || {};
  const clientPayload = Array.isArray(intakeData?.clients) ? intakeData.clients[clientIndex] : null;
  const responses = intakeData?.responses || {};
  const guardianResponses = responses?.guardian || {};
  const submissionResponses = responses?.submission || {};
  const clientResponses = Array.isArray(responses?.clients) ? (responses.clients[clientIndex] || {}) : {};

  const output = [];
  const pushHeader = (title) => {
    if (!title) return;
    if (output.length) output.push('');
    output.push(`${title}`);
    output.push('-'.repeat(title.length));
  };
  const pushLine = (label, value) => {
    if (!label || !hasValue(value)) return;
    output.push(`${label}: ${normalizeAnswerValue(value)}`);
  };

  pushHeader('Guardian Information');
  pushLine('Guardian first name', guardianPayload.firstName);
  pushLine('Guardian last name', guardianPayload.lastName);
  pushLine('Guardian email', guardianPayload.email);
  pushLine('Guardian phone', guardianPayload.phone);
  pushLine('Relationship', guardianPayload.relationship);

  const guardianLines = buildAnswerLinesForScope({
    fields: getOrderedFieldsByScope(fields, 'guardian'),
    responses: guardianResponses
  });
  if (guardianLines.length) {
    pushHeader('Guardian Questions');
    guardianLines.forEach((line) => output.push(`${line.label}: ${line.value}`));
  }

  const submissionLines = buildAnswerLinesForScope({
    fields: getOrderedFieldsByScope(fields, 'submission'),
    responses: submissionResponses
  });
  if (submissionLines.length) {
    pushHeader('One-Time Questions');
    submissionLines.forEach((line) => output.push(`${line.label}: ${line.value}`));
  }

  const clientName =
    String(clientPayload?.fullName || '').trim() ||
    `${String(clientPayload?.firstName || '').trim()} ${String(clientPayload?.lastName || '').trim()}`.trim();
  pushHeader(`Client ${clientIndex + 1}${clientName ? ` - ${clientName}` : ''} Questions`);
  const clientLines = buildAnswerLinesForScope({
    fields: getOrderedFieldsByScope(fields, 'client'),
    responses: clientResponses
  });
  if (clientLines.length) {
    clientLines.forEach((line) => output.push(`${line.label}: ${line.value}`));
  } else {
    output.push('No client answers captured.');
  }

  return output.join('\n').trim();
};

const parsePscScore = (value) => {
  if (!hasValue(value)) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(2, Math.round(value)));
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(2, Math.round(numeric)));
  }
  const normalized = raw.toLowerCase();
  if (normalized.includes('never') || normalized.includes('not at all')) return 0;
  if (normalized.includes('sometimes') || normalized.includes('somewhat')) return 1;
  if (normalized.includes('often') || normalized.includes('very')) return 2;
  return null;
};

const summaryExcludePattern = /insurance|member id|policy|subscriber|payer|medicaid|medicare|coverage|group|plan|billing|ssn|social security|address|street|city|state|zip|postal|phone|email|contact|relationship|guardian first|guardian last|client first|client last|full name|middle name|date of birth|birthdate|dob|grade|school/i;

const buildClinicalSummaryText = ({ link, intakeData, clientIndex = 0 }) => {
  if (!intakeData) return '';
  const { fields, byKey } = buildIntakeFieldIndex(link);
  const responses = intakeData?.responses || {};
  const guardianResponses = responses?.guardian || {};
  const submissionResponses = responses?.submission || {};
  const clientResponses = Array.isArray(responses?.clients) ? (responses.clients[clientIndex] || {}) : {};
  const clientPayload = Array.isArray(intakeData?.clients) ? intakeData.clients[clientIndex] : null;

  const clientName =
    String(clientPayload?.fullName || '').trim() ||
    `${String(clientPayload?.firstName || '').trim()} ${String(clientPayload?.lastName || '').trim()}`.trim();

  const output = [];
  output.push('Clinical Intake Summary');
  output.push('=======================');
  if (clientName) {
    output.push(`Client: ${clientName}`);
    output.push('');
  }

  const pscItems = [];
  for (let i = 1; i <= 17; i += 1) {
    const key = `psc_${i}`;
    const raw = clientResponses?.[key];
    if (!hasValue(raw)) continue;
    const score = parsePscScore(raw);
    const field = byKey.get(key);
    const label = String(field?.label || key).trim() || key;
    pscItems.push({ index: i, key, label, value: normalizeAnswerValue(raw), score });
  }

  if (pscItems.length) {
    const attentionKeys = [1, 3, 7, 13, 17];
    const internalKeys = [2, 6, 9, 11, 15];
    const externalKeys = [4, 5, 8, 10, 12, 14, 16];
    const sumScores = (keys) =>
      keys.reduce((acc, idx) => {
        const item = pscItems.find((entry) => entry.index === idx);
        return acc + (item?.score ?? 0);
      }, 0);
    const totalScore = pscItems.reduce((acc, entry) => acc + (entry?.score ?? 0), 0);
    const answered = pscItems.filter((entry) => entry.score !== null).length;
    output.push('PSC-17 Results');
    output.push('--------------');
    output.push(`Total score: ${totalScore} (${answered} of 17 answered)`);
    output.push(`Attention: ${sumScores(attentionKeys)}`);
    output.push(`Internalizing: ${sumScores(internalKeys)}`);
    output.push(`Externalizing: ${sumScores(externalKeys)}`);
    output.push('');
    output.push('PSC-17 Item Responses');
    output.push('---------------------');
    pscItems
      .sort((a, b) => a.index - b.index)
      .forEach((entry) => {
        const scoreLabel = entry.score === null ? 'n/a' : entry.score;
        output.push(`${entry.index}. ${entry.label}: ${entry.value} (score ${scoreLabel})`);
      });
    output.push('');
  }

  const pushClinicalLines = (lines) => {
    lines.forEach((line) => {
      if (!line?.label || !hasValue(line?.value)) return;
      const label = String(line.label);
      if (summaryExcludePattern.test(label)) return;
      output.push(`${label}: ${line.value}`);
    });
  };

  const orderedGuardian = buildAnswerLinesForScope({
    fields: getOrderedFieldsByScope(fields, 'guardian'),
    responses: guardianResponses
  });
  const orderedSubmission = buildAnswerLinesForScope({
    fields: getOrderedFieldsByScope(fields, 'submission'),
    responses: submissionResponses
  });
  const orderedClient = buildAnswerLinesForScope({
    fields: getOrderedFieldsByScope(fields, 'client'),
    responses: clientResponses
  }).filter((line) => !/^psc_\d+$/i.test(line.key || ''));

  if (orderedGuardian.length || orderedSubmission.length || orderedClient.length) {
    output.push('Clinical Responses');
    output.push('------------------');
    pushClinicalLines(orderedGuardian);
    pushClinicalLines(orderedSubmission);
    pushClinicalLines(orderedClient);
  } else if (!pscItems.length) {
    output.push('No clinical responses captured.');
  }

  return output.join('\n').trim();
};

const createIntakeTextDocuments = async ({
  clientId,
  clientRow,
  submissionId,
  link,
  intakeData,
  clientIndex,
  ipAddress,
  expiresAt
}) => {
  if (!clientId || !intakeData) return;
  const agencyId = clientRow?.agency_id || null;
  const orgId = clientRow?.organization_id || null;
  const answersText = buildIntakeAnswersText({ link, intakeData, clientIndex });
  const summaryText = buildClinicalSummaryText({ link, intakeData, clientIndex });
  const docsToCreate = [
    {
      text: answersText,
      filename: `intake-answers-client-${clientId}.txt`,
      title: 'Intake Responses',
      type: 'Intake Responses',
      auditKind: 'intake_answers'
    },
    {
      text: summaryText,
      filename: `intake-clinical-summary-client-${clientId}.txt`,
      title: 'Clinical Intake Summary',
      type: 'Clinical Summary',
      auditKind: 'clinical_summary'
    }
  ];

  for (const doc of docsToCreate) {
    if (!doc.text) continue;
    try {
      const storageResult = await StorageService.saveIntakeTextDocument({
        submissionId,
        clientId,
        fileBuffer: Buffer.from(doc.text, 'utf8'),
        filename: doc.filename
      });
      const phiDoc = await ClientPhiDocument.create({
        clientId,
        agencyId,
        schoolOrganizationId: orgId,
        intakeSubmissionId: submissionId,
        storagePath: storageResult.relativePath,
        originalName: doc.filename,
        documentTitle: doc.title,
        documentType: doc.type,
        mimeType: 'text/plain',
        uploadedByUserId: null,
        scanStatus: 'clean',
        expiresAt: expiresAt || null
      });
      await PhiDocumentAuditLog.create({
        documentId: phiDoc.id,
        clientId,
        action: 'uploaded',
        actorUserId: null,
        actorLabel: 'public_intake',
        ipAddress: ipAddress || null,
        metadata: { submissionId, kind: doc.auditKind }
      });
    } catch {
      // best-effort; do not block public intake
    }
  }
};

export const approvePublicIntake = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    ActivityLogService.logActivity(
      {
        actionType: 'intake_approval',
        metadata: {
          intakeLinkId: link.id,
          scopeType: link.scope_type || null,
          organizationId: link.organization_id || null,
          programId: link.program_id || null,
          portalOrganizationId: req.body?.organizationId || null,
          approvalMode: req.body?.mode || 'staff_assisted',
          staffLastName: req.body?.staffLastName || null,
          clientFirstName: req.body?.clientFirstName || null
        }
      },
      req
    );

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
};

const toOrgPayload = (org) => {
  if (!org) return null;
  return {
    id: org.id,
    name: org.name || null,
    official_name: org.official_name || null,
    organization_type: org.organization_type || null,
    logo_url: org.logo_url || null,
    logo_path: org.logo_path || null
  };
};

const resolveIntakeOrgContext = async (link) => {
  if (!link) return { organization: null, agency: null };

  const scope = String(link.scope_type || 'agency');
  const orgId = link.organization_id ? parseInt(link.organization_id, 10) : null;
  let organization = null;
  let agency = null;

  if (orgId) {
    organization = await Agency.findById(orgId);
  }

  if (scope === 'agency') {
    agency = organization;
    if (!agency && link.created_by_user_id) {
      try {
        const agencies = await User.getAgencies(link.created_by_user_id);
        agency = agencies.find((a) => String(a.organization_type || 'agency') === 'agency') || agencies[0] || null;
      } catch {
        agency = null;
      }
    }
    return { organization, agency };
  }

  let agencyId = null;
  if (orgId) {
    if (scope === 'school') {
      agencyId = await AgencySchool.getActiveAgencyIdForSchool(orgId);
    }
    if (!agencyId) {
      agencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId);
    }
  }
  if (agencyId) {
    agency = await Agency.findById(agencyId);
  }
  return { organization, agency };
};

const normalizeRetentionPolicy = (raw) => {
  if (!raw) return { mode: 'inherit', days: null };
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return { mode: 'inherit', days: null };
  const modeRaw = String(parsed.mode || 'inherit').toLowerCase();
  const mode = ['inherit', 'days', 'never'].includes(modeRaw) ? modeRaw : 'inherit';
  const days = Number.isFinite(Number(parsed.days)) ? Number(parsed.days) : null;
  return { mode, days };
};

const resolveRetentionPolicy = async (link) => {
  const platform = await PlatformRetentionSettings.get();
  const platformPolicy = {
    mode: String(platform.default_intake_retention_mode || 'days'),
    days: Number(platform.default_intake_retention_days || 14)
  };
  const { agency } = await resolveIntakeOrgContext(link);
  const agencyPolicy = normalizeRetentionPolicy(agency?.intake_retention_policy_json);
  const linkPolicy = normalizeRetentionPolicy(link?.retention_policy_json);

  const resolve = (policy, fallback) => {
    if (!policy || policy.mode === 'inherit') return fallback;
    if (policy.mode === 'never') return { mode: 'never', days: null };
    if (policy.mode === 'days') {
      const days = Number.isFinite(Number(policy.days)) ? Number(policy.days) : fallback?.days;
      return { mode: 'days', days };
    }
    return fallback;
  };

  const base = resolve(platformPolicy, { mode: 'days', days: 14 });
  const agencyResolved = resolve(agencyPolicy, base);
  return resolve(linkPolicy, agencyResolved);
};

const buildRetentionExpiresAt = ({ policy, submittedAt }) => {
  if (!policy || policy.mode === 'never') return null;
  const days = Number.isFinite(Number(policy.days)) ? Number(policy.days) : null;
  if (!days || days <= 0) return null;
  const clamped = Math.max(1, Math.min(3650, Math.round(days)));
  const base = submittedAt ? new Date(submittedAt) : new Date();
  const expires = new Date(base.getTime());
  expires.setDate(expires.getDate() + clamped);
  return expires;
};

const loadAllowedTemplates = async (link) => {
  const allowedIds = Array.isArray(link.allowed_document_template_ids)
    ? link.allowed_document_template_ids
    : [];
  if (!allowedIds.length) return [];

  const templates = [];
  for (const id of allowedIds) {
    const t = await DocumentTemplate.findById(id);
    if (t && t.is_active) templates.push(t);
  }
  return templates;
};

const loadTemplateById = async (link, templateId) => {
  const allowedIds = Array.isArray(link.allowed_document_template_ids)
    ? link.allowed_document_template_ids
    : [];
  if (!allowedIds.includes(templateId)) return null;
  const template = await DocumentTemplate.findById(templateId);
  if (!template || !template.is_active) return null;
  return template;
};

export const getPublicIntakeLink = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const templates = await loadAllowedTemplates(link);
    const { organization, agency } = await resolveIntakeOrgContext(link);
    res.json({
      link: {
        id: link.id,
        title: link.title,
        description: link.description,
        scope_type: link.scope_type,
        organization_id: link.organization_id,
        program_id: link.program_id,
        create_client: link.create_client,
        create_guardian: link.create_guardian,
        intake_fields: link.intake_fields,
        intake_steps: link.intake_steps
      },
      organization: toOrgPayload(organization),
      agency: toOrgPayload(agency),
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        document_action_type: t.document_action_type,
        template_type: t.template_type,
        html_content: t.template_type === 'html' ? t.html_content : null,
        file_path: t.template_type === 'pdf' ? t.file_path : null,
        signature_x: t.signature_x,
        signature_y: t.signature_y,
        signature_width: t.signature_width,
        signature_height: t.signature_height,
        signature_page: t.signature_page,
        field_definitions: t.field_definitions
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const createPublicConsent = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const secretConfigured = !!config.recaptcha?.secretKey;
    if (config.nodeEnv === 'production' && !secretConfigured) {
      return res.status(500).json({ error: { message: 'Captcha is not configured' } });
    }
    if (secretConfigured) {
      const captchaToken = String(req.body.captchaToken || '').trim();
      if (!captchaToken) {
        if (config.nodeEnv === 'production') {
          return res.status(400).json({ error: { message: 'Captcha is required' } });
        }
      } else {
        const verification = await verifyRecaptchaV3({
          token: captchaToken,
          remoteip: getClientIpAddress(req),
          expectedAction: 'public_intake_consent'
        });
        if (!verification.ok) {
          if (config.nodeEnv === 'production') {
            return res.status(400).json({ error: { message: 'Captcha verification failed' } });
          }
        } else {
          const minScore = Number.isFinite(config.recaptcha?.minScore) ? config.recaptcha.minScore : 0.5;
          if (verification.score !== null && verification.score < minScore) {
            if (config.nodeEnv === 'production') {
              return res.status(400).json({ error: { message: 'Captcha verification failed' } });
            }
          }
        }
      }
    }

    const publicKey = String(req.params.publicKey || '').trim();
    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const ipAddress = getClientIpAddress(req);
    const userAgent = req.get('user-agent');
    const now = new Date();
    const retentionPolicy = await resolveRetentionPolicy(link);
    const retentionExpiresAt = buildRetentionExpiresAt({ policy: retentionPolicy, submittedAt: now });

    const submission = await IntakeSubmission.create({
      intakeLinkId: link.id,
      status: 'consented',
      signerName: normalizeName(req.body.signerName),
      signerInitials: normalizeName(req.body.signerInitials),
      signerEmail: normalizeName(req.body.signerEmail) || null,
      signerPhone: normalizeName(req.body.signerPhone) || null,
      consentGivenAt: now,
      ipAddress,
      userAgent,
      retentionExpiresAt
    });

    res.status(201).json({ submission });
  } catch (error) {
    next(error);
  }
};

export const getPublicIntakeStatus = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const submissionId = parseInt(req.params.submissionId, 10);
    if (!submissionId) {
      return res.status(400).json({ error: { message: 'submissionId is required' } });
    }
    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }

    const templates = await loadAllowedTemplates(link);
    const signedDocs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
    const signedTemplateIds = new Set(signedDocs.map((d) => d.document_template_id));

    let downloadUrl = null;
    if (submission.combined_pdf_path) {
      downloadUrl = await StorageService.getSignedUrl(submission.combined_pdf_path, 60 * 24 * 3);
    }

    res.json({
      submissionId,
      status: submission.status,
      totalDocuments: templates.length,
      signedTemplateIds: Array.from(signedTemplateIds),
      signedDocuments: signedDocs,
      downloadUrl
    });
  } catch (error) {
    next(error);
  }
};

export const previewPublicTemplate = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const templateId = parseInt(req.params.templateId, 10);
    if (!templateId) {
      return res.status(400).json({ error: { message: 'templateId is required' } });
    }
    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    const template = await loadTemplateById(link, templateId);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }
    if (template.template_type !== 'pdf' || !template.file_path) {
      return res.status(400).json({ error: { message: 'Template preview is only available for PDF templates' } });
    }

    const StorageService = (await import('../services/storage.service.js')).default;
    let filePath = String(template.file_path || '').trim();
    if (filePath.startsWith('/')) filePath = filePath.substring(1);
    const templateFilename = filePath.includes('/')
      ? filePath.split('/').pop()
      : filePath.replace('templates/', '');
    const buffer = await StorageService.readTemplate(templateFilename);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

export const signPublicIntakeDocument = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const publicKey = String(req.params.publicKey || '').trim();
    const submissionId = parseInt(req.params.submissionId, 10);
    const templateId = parseInt(req.params.templateId, 10);
    if (!submissionId || !templateId) {
      return res.status(400).json({ error: { message: 'submissionId and templateId are required' } });
    }

    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }

    const template = await loadTemplateById(link, templateId);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    const signatureData = String(req.body.signatureData || '').trim();
    if (template.document_action_type === 'signature' && !signatureData) {
      return res.status(400).json({ error: { message: 'signatureData is required for signature documents' } });
    }

    const existingDocs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
    const existing = existingDocs.find((d) => d.document_template_id === templateId);
    if (existing) {
      return res.json({ success: true, document: existing, alreadySigned: true });
    }

    const now = new Date();
    const signer = buildSignerFromSubmission(submission);
    const auditTrail = buildAuditTrail({ link, submission });
    const workflowData = {
      consent_given_at: submission.consent_given_at,
      intent_to_sign_at: now,
      identity_verified_at: null,
      finalized_at: now,
      consent_ip: submission.ip_address || null,
      intent_ip: submission.ip_address || null
    };

    const rawFieldDefs = template.field_definitions || null;
    let parsedFieldDefs = [];
    try {
      parsedFieldDefs = rawFieldDefs
        ? (typeof rawFieldDefs === 'string' ? JSON.parse(rawFieldDefs) : rawFieldDefs)
        : [];
    } catch {
      parsedFieldDefs = [];
    }
    const fieldDefinitions = Array.isArray(parsedFieldDefs) ? parsedFieldDefs : [];
    const fieldValues = req.body?.fieldValues && typeof req.body.fieldValues === 'object' ? req.body.fieldValues : {};

    const missingFields = [];
    for (const def of fieldDefinitions) {
      if (!def || !def.required) continue;
      if (!isFieldVisible(def, fieldValues)) continue;
      if (def.type === 'date' && def.autoToday) continue;
      const val = fieldValues[def.id];
      if (def.type === 'checkbox') {
        if (val !== true) missingFields.push(def.label || def.id || 'field');
        continue;
      }
      if (def.type === 'select' || def.type === 'radio') {
        const options = Array.isArray(def.options) ? def.options : [];
        const optionValues = options.map((opt) => String(opt.value ?? opt.label ?? '')).filter(Boolean);
        if (!val || (optionValues.length > 0 && !optionValues.includes(String(val)))) {
          missingFields.push(def.label || def.id || 'field');
        }
        continue;
      }
      if (val === null || val === undefined || String(val).trim() === '') {
        missingFields.push(def.label || def.id || 'field');
      }
    }
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: { message: `Missing required fields: ${missingFields.join(', ')}` }
      });
    }

    const result = await PublicIntakeSigningService.generateSignedDocument({
      template,
      signatureData: signatureData || null,
      signer,
      auditTrail,
      workflowData,
      submissionId,
      fieldDefinitions,
      fieldValues
    });

    const doc = await IntakeSubmissionDocument.create({
      intakeSubmissionId: submissionId,
      clientId: null,
      documentTemplateId: template.id,
      signedPdfPath: result.storagePath,
      pdfHash: result.pdfHash,
      signedAt: now,
      auditTrail: {
        ...auditTrail,
        documentReference: result.referenceNumber || null,
        documentName: template.name || null,
        fieldValues,
        signatureData: signatureData || null
      }
    });

    await IntakeSubmission.updateById(submissionId, { status: 'in_progress' });

    res.json({
      success: true,
      document: doc,
      referenceNumber: result.referenceNumber || null
    });
  } catch (error) {
    next(error);
  }
};

export const finalizePublicIntake = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const publicKey = String(req.params.publicKey || '').trim();
    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const submissionId = parseInt(req.params.submissionId || req.body.submissionId, 10);
    if (!submissionId) {
      return res.status(400).json({ error: { message: 'submissionId is required' } });
    }

    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }

    if (link.create_client) {
      const rawClients = Array.isArray(req.body?.clients) && req.body.clients.length
        ? req.body.clients
        : (req.body?.client ? [req.body.client] : []);
      if (!rawClients.length || !String(rawClients?.[0]?.fullName || '').trim()) {
        return res.status(400).json({ error: { message: 'Client full name is required.' } });
      }
    }
    {
      const gEmail = String(req.body?.guardian?.email || '').trim();
      const gFirst = String(req.body?.guardian?.firstName || '').trim();
      if (!gEmail || !gFirst) {
        return res.status(400).json({ error: { message: 'Guardian name and email are required.' } });
      }
    }

    const now = new Date();
    const intakeData = req.body?.intakeData || null;
    const retentionPolicy = await resolveRetentionPolicy(link);
    const retentionExpiresAt = buildRetentionExpiresAt({ policy: retentionPolicy, submittedAt: now });
    const intakeDataHash = hashIntakeData(intakeData);
    let updatedSubmission = await IntakeSubmission.updateById(submissionId, {
      status: 'submitted',
      submitted_at: now,
      intake_data: intakeData ? JSON.stringify(intakeData) : null,
      intake_data_hash: intakeDataHash,
      retention_expires_at: retentionExpiresAt
    });

    let createdClients = [];
    if (link.create_client) {
      const { clients, guardianUser } = await PublicIntakeClientService.createClientAndGuardian({
        link,
        payload: req.body
      });
      createdClients = clients || [];
      updatedSubmission = await IntakeSubmission.updateById(submissionId, {
        client_id: createdClients?.[0]?.id || null,
        guardian_user_id: guardianUser?.id || null
      });
    }

    const templates = await loadAllowedTemplates(link);
    if (!templates.length) {
      return res.status(400).json({ error: { message: 'No documents are configured for this intake link.' } });
    }

    const signedDocs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
    const signedByTemplate = new Map(signedDocs.map((d) => [d.document_template_id, d]));
    for (const t of templates) {
      if (!signedByTemplate.has(t.id)) {
        return res.status(400).json({ error: { message: `Missing signed document for ${t.name || 'document'}` } });
      }
    }

    const signer = buildSignerFromSubmission(updatedSubmission);
    const signedDocsOrdered = templates.map((t) => signedByTemplate.get(t.id)).filter(Boolean);
    const pdfBuffers = [];
    const clientBundles = [];
    const workflowData = buildWorkflowData({ submission: { ...updatedSubmission, submitted_at: now } });

    for (const entry of signedDocsOrdered) {
      const buffer = await StorageService.readIntakeSignedDocument(entry.signed_pdf_path);
      pdfBuffers.push(buffer);
    }

    const rawClients = createdClients.length
      ? createdClients.map((c) => ({ id: c.id, fullName: c.full_name || c.initials || '', initials: c.initials, contactPhone: c.contact_phone }))
      : (Array.isArray(req.body?.clients) ? req.body.clients : (req.body?.client ? [req.body.client] : []));
    const primaryClientName = String(rawClients?.[0]?.fullName || '').trim() || null;

    const intakeClientRows = [];
    const isMultiClient = rawClients.length > 1;
    const docAuditByTemplate = new Map();
    signedDocsOrdered.forEach((doc) => {
      if (!doc) return;
      const rawTrail = doc.audit_trail;
      let trail = null;
      try {
        trail = rawTrail ? (typeof rawTrail === 'string' ? JSON.parse(rawTrail) : rawTrail) : null;
      } catch {
        trail = null;
      }
      docAuditByTemplate.set(doc.document_template_id, trail || {});
    });

    for (let i = 0; i < rawClients.length; i += 1) {
      const clientPayload = rawClients[i];
      const clientId = clientPayload?.id || null;
      const clientName = String(clientPayload?.fullName || '').trim() || null;

      intakeClientRows.push(
        await IntakeSubmissionClient.create({
          intakeSubmissionId: submissionId,
          clientId,
          fullName: clientName,
          initials: clientPayload?.initials || null,
          contactPhone: clientPayload?.contactPhone || null
        })
      );

      const clientBuffers = [];

      if (isMultiClient) {
        for (const template of templates) {
          const baseAudit = docAuditByTemplate.get(template.id) || {};
          const signatureData = baseAudit?.signatureData || null;
          const baseFieldValues = baseAudit?.fieldValues && typeof baseAudit.fieldValues === 'object' ? baseAudit.fieldValues : {};
          const fieldDefinitions = parseFieldDefinitions(template.field_definitions);
          const fieldValues = buildDocumentFieldValuesForClient({
            link,
            intakeData,
            clientIndex: i,
            baseFieldValues
          });
          const clientAuditTrail = buildAuditTrail({
            link,
            submission: { ...updatedSubmission, submitted_at: now, client_name: clientName }
          });

          let storagePath = null;
          let pdfHash = null;
          let pdfBytes = null;
          let referenceNumber = null;

          if (template.document_action_type === 'signature' && !signatureData) {
            const sharedDoc = signedByTemplate.get(template.id);
            if (sharedDoc?.signed_pdf_path) {
              pdfBytes = await StorageService.readIntakeSignedDocument(sharedDoc.signed_pdf_path);
              storagePath = sharedDoc.signed_pdf_path;
              pdfHash = sharedDoc.pdf_hash || null;
              if (clientId) {
                await IntakeSubmissionDocument.create({
                  intakeSubmissionId: submissionId,
                  clientId,
                  documentTemplateId: template.id,
                  signedPdfPath: storagePath,
                  pdfHash,
                  signedAt: now,
                  auditTrail: {
                    ...clientAuditTrail,
                    documentName: template.name || null,
                    fieldValues,
                    signatureData: null
                  }
                });
              }
            }
          } else {
            const result = await PublicIntakeSigningService.generateSignedDocument({
              template,
              signatureData,
              signer,
              auditTrail: clientAuditTrail,
              workflowData,
              submissionId,
              fieldDefinitions,
              fieldValues
            });
            storagePath = result.storagePath;
            pdfHash = result.pdfHash;
            pdfBytes = result.pdfBytes;
            referenceNumber = result.referenceNumber || null;
            await IntakeSubmissionDocument.create({
              intakeSubmissionId: submissionId,
              clientId,
              documentTemplateId: template.id,
              signedPdfPath: storagePath,
              pdfHash,
              signedAt: now,
              auditTrail: {
                ...clientAuditTrail,
                documentReference: referenceNumber,
                documentName: template.name || null,
                fieldValues,
                signatureData
              }
            });
          }

          if (pdfBytes) clientBuffers.push(pdfBytes);
          if (clientId && storagePath) {
            try {
              const clientRow = await Client.findById(clientId, { includeSensitive: true });
              const agencyId = clientRow?.agency_id || null;
              const orgId = clientRow?.organization_id || null;
              const phiDoc = await ClientPhiDocument.create({
                clientId,
                agencyId,
                schoolOrganizationId: orgId,
                intakeSubmissionId: submissionId,
                storagePath,
                originalName: `${template.name || 'Document'} (Signed)`,
                mimeType: 'application/pdf',
                uploadedByUserId: null,
                scanStatus: 'clean',
                expiresAt: retentionExpiresAt
              });
              await PhiDocumentAuditLog.create({
                documentId: phiDoc.id,
                clientId,
                action: 'uploaded',
                actorUserId: null,
                actorLabel: 'public_intake',
                ipAddress: updatedSubmission.ip_address || null,
                metadata: { submissionId, templateId: template.id }
              });
            } catch {
              // best-effort; do not block public intake
            }
          }
        }
      } else {
        for (const template of templates) {
          const docRow = signedByTemplate.get(template.id);
          if (!docRow) continue;
          try {
            const clientRow = await Client.findById(clientId, { includeSensitive: true });
            const agencyId = clientRow?.agency_id || null;
            const orgId = clientRow?.organization_id || null;
            const phiDoc = await ClientPhiDocument.create({
              clientId,
              agencyId,
              schoolOrganizationId: orgId,
              intakeSubmissionId: submissionId,
              storagePath: docRow.signed_pdf_path,
              originalName: `${template.name || 'Document'} (Signed)`,
              mimeType: 'application/pdf',
              uploadedByUserId: null,
              scanStatus: 'clean',
              expiresAt: retentionExpiresAt
            });
            await PhiDocumentAuditLog.create({
              documentId: phiDoc.id,
              clientId,
              action: 'uploaded',
              actorUserId: null,
              actorLabel: 'public_intake',
              ipAddress: updatedSubmission.ip_address || null,
              metadata: { submissionId, templateId: template.id }
            });
          } catch {
            // best-effort; do not block public intake
          }
        }
      }

      const mergeBuffers = clientBuffers.length ? clientBuffers : pdfBuffers;
      if (mergeBuffers.length) {
        const mergedClientPdf = await PublicIntakeSigningService.mergeSignedPdfs(mergeBuffers);
        const clientBundleResult = await StorageService.saveIntakeClientBundle({
          submissionId,
          clientId: clientPayload?.id || 'unknown',
          fileBuffer: mergedClientPdf,
          filename: `intake-client-${clientPayload?.id || 'unknown'}.pdf`
        });
        const clientBundleHash = DocumentSigningService.calculatePDFHash(mergedClientPdf);
        const targetRow = intakeClientRows[i];
        if (targetRow?.id) {
          await IntakeSubmissionClient.updateById(targetRow.id, {
            bundle_pdf_path: clientBundleResult.relativePath,
            bundle_pdf_hash: clientBundleHash
          });
        }
        clientBundles.push({
          clientId: clientPayload?.id || null,
          clientName: clientPayload?.fullName || null,
          buffer: mergedClientPdf,
          filename: `intake-client-${clientPayload?.id || 'unknown'}.pdf`,
          downloadUrl: await StorageService.getSignedUrl(clientBundleResult.relativePath, 60 * 24 * 3)
        });
      }

      if (clientId) {
        let clientRow = null;
        try {
          clientRow = await Client.findById(clientId, { includeSensitive: true });
        } catch {
          clientRow = null;
        }
        await createIntakeTextDocuments({
          clientId,
          clientRow,
          submissionId,
          link,
          intakeData,
          clientIndex: i,
          ipAddress: updatedSubmission.ip_address || null,
          expiresAt: retentionExpiresAt
        });
      }
    }

    let downloadUrl = null;
    if (pdfBuffers.length > 0) {
      const mergedPdf = await PublicIntakeSigningService.mergeSignedPdfs(pdfBuffers);
      const bundleHash = DocumentSigningService.calculatePDFHash(mergedPdf);
      const bundleResult = await StorageService.saveIntakeBundle({
        submissionId,
        fileBuffer: mergedPdf,
        filename: `intake-bundle-${submissionId}.pdf`
      });
      await IntakeSubmission.updateById(submissionId, {
        combined_pdf_path: bundleResult.relativePath,
        combined_pdf_hash: bundleHash
      });
      downloadUrl = await StorageService.getSignedUrl(bundleResult.relativePath, 60 * 24 * 3);

      if (updatedSubmission.signer_email && EmailService.isConfigured()) {
        const clientCount = rawClients.length || 1;
        const subject = 'Your signed intake packet';
        const summaryLine = clientCount > 1 ? `Clients: ${clientCount}\n\n` : (primaryClientName ? `Client: ${primaryClientName}\n\n` : '');
        const text = `${summaryLine}Your intake packet is ready. Download here:\n\n${downloadUrl}\n\nThis link expires in 3 days.`;
        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            ${clientCount > 1 ? `<p><strong>Clients:</strong> ${clientCount}</p>` : (primaryClientName ? `<p><strong>Client:</strong> ${primaryClientName}</p>` : '')}
            <p>Your intake packet is ready.</p>
            <p><a href="${downloadUrl}" style="display:inline-block;padding:10px 14px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px;">Download Signed Packet</a></p>
            <p style="color:#777;">This link expires in 3 days.</p>
          </div>
        `.trim();
        const attachments = [];
        for (const entry of clientBundles) {
          if (entry?.buffer) {
            attachments.push({
              filename: entry.filename,
              contentType: 'application/pdf',
              contentBase64: entry.buffer.toString('base64')
            });
          }
        }
        try {
          await EmailService.sendEmail({
            to: updatedSubmission.signer_email,
            subject,
            text,
            html,
            fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || 'People Operations',
            fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
            replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
            attachments: attachments.length ? attachments : null,
            source: 'auto',
            agencyId: link?.organization_id || null
          });
        } catch {
          // best-effort email
        }
      }
    }

    res.json({
      success: true,
      submission: updatedSubmission,
      documents: signedDocsOrdered,
      downloadUrl,
      clientBundles
    });
  } catch (error) {
    next(error);
  }
};

export const submitPublicIntake = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const publicKey = String(req.params.publicKey || '').trim();
    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const submissionId = parseInt(req.body.submissionId, 10);
    if (!submissionId) {
      return res.status(400).json({ error: { message: 'submissionId is required' } });
    }

    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }

    if (link.create_client) {
      const rawClients = Array.isArray(req.body?.clients) && req.body.clients.length
        ? req.body.clients
        : (req.body?.client ? [req.body.client] : []);
      if (!rawClients.length || !String(rawClients?.[0]?.fullName || '').trim()) {
        return res.status(400).json({ error: { message: 'Client full name is required.' } });
      }
    }
    {
      const gEmail = String(req.body?.guardian?.email || '').trim();
      const gFirst = String(req.body?.guardian?.firstName || '').trim();
      if (!gEmail || !gFirst) {
        return res.status(400).json({ error: { message: 'Guardian name and email are required.' } });
      }
    }

    const signatureData = String(req.body.signatureData || '').trim();
    if (!signatureData) {
      return res.status(400).json({ error: { message: 'signatureData is required' } });
    }

    const now = new Date();
    const intakeData = req.body?.intakeData || null;
    const retentionPolicy = await resolveRetentionPolicy(link);
    const retentionExpiresAt = buildRetentionExpiresAt({ policy: retentionPolicy, submittedAt: now });
    const intakeDataHash = hashIntakeData(intakeData);
    let updatedSubmission = await IntakeSubmission.updateById(submissionId, {
      status: 'submitted',
      submitted_at: now,
      intake_data: intakeData ? JSON.stringify(intakeData) : null,
      intake_data_hash: intakeDataHash,
      retention_expires_at: retentionExpiresAt
    });

    let createdClients = [];
    if (link.create_client) {
      const { clients, guardianUser } = await PublicIntakeClientService.createClientAndGuardian({
        link,
        payload: req.body
      });
      createdClients = clients || [];
      updatedSubmission = await IntakeSubmission.updateById(submissionId, {
        client_id: createdClients?.[0]?.id || null,
        guardian_user_id: guardianUser?.id || null
      });
    }

    const templates = await loadAllowedTemplates(link);
    if (!templates.length) {
      return res.status(400).json({ error: { message: 'No documents are configured for this intake link.' } });
    }

    const signer = buildSignerFromSubmission(updatedSubmission);
    const signedDocs = [];
    const pdfBuffers = [];
    const clientBundles = [];
    const workflowData = buildWorkflowData({ submission: { ...updatedSubmission, submitted_at: now } });
    const rawClients = createdClients.length
      ? createdClients.map((c) => ({ id: c.id, fullName: c.full_name || c.initials || '', initials: c.initials, contactPhone: c.contact_phone }))
      : (Array.isArray(req.body?.clients) ? req.body.clients : (req.body?.client ? [req.body.client] : []));
    const primaryClientName = String(rawClients?.[0]?.fullName || '').trim() || null;

    const intakeClientRows = [];
    for (const clientPayload of rawClients) {
      const clientId = clientPayload?.id || null;
      const clientName = String(clientPayload?.fullName || '').trim() || null;
      const auditTrail = buildAuditTrail({
        link,
        submission: { ...updatedSubmission, submitted_at: now, client_name: clientName }
      });

      intakeClientRows.push(
        await IntakeSubmissionClient.create({
          intakeSubmissionId: submissionId,
          clientId,
          fullName: clientName,
          initials: clientPayload?.initials || null,
          contactPhone: clientPayload?.contactPhone || null
        })
      );

      const clientIndex = intakeClientRows.length - 1;
      const clientBuffers = [];
      for (const template of templates) {
        const fieldDefinitions = parseFieldDefinitions(template.field_definitions);
        const fieldValues = buildDocumentFieldValuesForClient({
          link,
          intakeData,
          clientIndex,
          baseFieldValues: {}
        });
        const result = await PublicIntakeSigningService.generateSignedDocument({
          template,
          signatureData,
          signer,
          auditTrail,
          workflowData,
          submissionId,
          fieldDefinitions,
          fieldValues
        });

        const doc = await IntakeSubmissionDocument.create({
          intakeSubmissionId: submissionId,
          clientId,
          documentTemplateId: template.id,
          signedPdfPath: result.storagePath,
          pdfHash: result.pdfHash,
          signedAt: now,
          auditTrail: {
            ...auditTrail,
            documentReference: result.referenceNumber || null,
            documentName: template.name || null,
            fieldValues,
            signatureData
          }
        });

        pdfBuffers.push(result.pdfBytes);
        clientBuffers.push(result.pdfBytes);

        if (clientId) {
          try {
            const clientRow = await Client.findById(clientId, { includeSensitive: true });
            const agencyId = clientRow?.agency_id || null;
            const orgId = clientRow?.organization_id || null;
            const phiDoc = await ClientPhiDocument.create({
              clientId,
              agencyId,
              schoolOrganizationId: orgId,
              intakeSubmissionId: submissionId,
              storagePath: result.storagePath,
              originalName: `${template.name || 'Document'} (Signed)`,
              mimeType: 'application/pdf',
              uploadedByUserId: null,
              scanStatus: 'clean',
              expiresAt: retentionExpiresAt
            });
            await PhiDocumentAuditLog.create({
              documentId: phiDoc.id,
              clientId,
              action: 'uploaded',
              actorUserId: null,
              actorLabel: 'public_intake',
              ipAddress: updatedSubmission.ip_address || null,
              metadata: { submissionId, templateId: template.id }
            });
          } catch {
            // best-effort; do not block public intake
          }
        }

        signedDocs.push(doc);
      }

      if (clientBuffers.length) {
        const mergedClientPdf = await PublicIntakeSigningService.mergeSignedPdfs(clientBuffers);
        const clientBundleResult = await StorageService.saveIntakeClientBundle({
          submissionId,
          clientId: clientId || 'unknown',
          fileBuffer: mergedClientPdf,
          filename: `intake-client-${clientId || 'unknown'}.pdf`
        });
        const clientBundleHash = DocumentSigningService.calculatePDFHash(mergedClientPdf);
        if (intakeClientRows?.length) {
          const targetRow = intakeClientRows[intakeClientRows.length - 1];
          if (targetRow?.id) {
            await IntakeSubmissionClient.updateById(targetRow.id, {
              bundle_pdf_path: clientBundleResult.relativePath,
              bundle_pdf_hash: clientBundleHash
            });
          }
        }
        clientBundles.push({
          clientId,
          clientName,
          buffer: mergedClientPdf,
          filename: `intake-client-${clientId || 'unknown'}.pdf`,
          downloadUrl: await StorageService.getSignedUrl(clientBundleResult.relativePath, 60 * 24 * 3)
        });
      }

      if (clientId) {
        let clientRow = null;
        try {
          clientRow = await Client.findById(clientId, { includeSensitive: true });
        } catch {
          clientRow = null;
        }
        await createIntakeTextDocuments({
          clientId,
          clientRow,
          submissionId,
          link,
          intakeData,
          clientIndex,
          ipAddress: updatedSubmission.ip_address || null,
          expiresAt: retentionExpiresAt
        });
      }
    }

    let downloadUrl = null;
    if (pdfBuffers.length > 0) {
      const mergedPdf = await PublicIntakeSigningService.mergeSignedPdfs(pdfBuffers);
      const bundleHash = DocumentSigningService.calculatePDFHash(mergedPdf);
      const bundleResult = await StorageService.saveIntakeBundle({
        submissionId,
        fileBuffer: mergedPdf,
        filename: `intake-bundle-${submissionId}.pdf`
      });
      await IntakeSubmission.updateById(submissionId, {
        combined_pdf_path: bundleResult.relativePath,
        combined_pdf_hash: bundleHash
      });
      downloadUrl = await StorageService.getSignedUrl(bundleResult.relativePath, 60 * 24 * 3);

      if (updatedSubmission.signer_email && EmailService.isConfigured()) {
        const clientCount = rawClients.length || 1;
        const subject = 'Your signed intake packet';
        const summaryLine = clientCount > 1 ? `Clients: ${clientCount}\n\n` : (primaryClientName ? `Client: ${primaryClientName}\n\n` : '');
        const text = `${summaryLine}Your intake packet is ready. Download here:\n\n${downloadUrl}\n\nThis link expires in 3 days.`;
        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            ${clientCount > 1 ? `<p><strong>Clients:</strong> ${clientCount}</p>` : (primaryClientName ? `<p><strong>Client:</strong> ${primaryClientName}</p>` : '')}
            <p>Your intake packet is ready.</p>
            <p><a href="${downloadUrl}" style="display:inline-block;padding:10px 14px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px;">Download Signed Packet</a></p>
            <p style="color:#777;">This link expires in 3 days.</p>
          </div>
        `.trim();
        const attachments = [];
        for (const entry of clientBundles) {
          if (entry?.buffer) {
            attachments.push({
              filename: entry.filename,
              contentType: 'application/pdf',
              contentBase64: entry.buffer.toString('base64')
            });
          }
        }
        try {
          await EmailService.sendEmail({
            to: updatedSubmission.signer_email,
            subject,
            text,
            html,
            fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || 'People Operations',
            fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
            replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
            attachments: attachments.length ? attachments : null
          });
        } catch {
          // best-effort email
        }
      }
    }

    res.json({
      success: true,
      submission: updatedSubmission,
      documents: signedDocs,
      downloadUrl,
      clientBundles
    });
  } catch (error) {
    next(error);
  }
};

export const getSchoolIntakeLink = async (req, res, next) => {
  try {
    const orgId = parseInt(req.params.organizationId, 10);
    if (!orgId) return res.status(400).json({ error: { message: 'organizationId is required' } });
    const links = await IntakeLink.findByScope({ scopeType: 'school', organizationId: orgId, programId: null });
    const link = links[0] || null;
    if (!link) return res.status(404).json({ error: { message: 'No intake link configured for school' } });
    res.json({ link });
  } catch (error) {
    next(error);
  }
};
