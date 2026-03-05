import { validationResult } from 'express-validator';
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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
import DocumentEncryptionService from '../services/documentEncryption.service.js';
import EmailService from '../services/email.service.js';
import Agency from '../models/Agency.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import User from '../models/User.model.js';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
import HiringProfile from '../models/HiringProfile.model.js';
import config from '../config/config.js';
import { verifyRecaptchaV3 } from '../services/captcha.service.js';
import ActivityLogService from '../services/activityLog.service.js';
import PlatformRetentionSettings from '../models/PlatformRetentionSettings.model.js';
import Notification from '../models/Notification.model.js';
import { notifyNewPacketUploaded } from '../services/clientNotifications.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';

const normalizeName = (name) => String(name || '').trim();
const BASE_CONSENT_TTL_MS = 60 * 60 * 1000; // 1 hour to complete once started
const PER_PAGE_TTL_MS = 5 * 60 * 1000;

const isSubmissionExpired = (submission, { templatesCount = 0 } = {}) => {
  if (!submission) return false;
  if (String(submission.status || '').toLowerCase() === 'submitted') return false;
  const base = submission.consent_given_at || submission.created_at;
  if (!base) return false;
  const startedAt = new Date(base).getTime();
  if (Number.isNaN(startedAt)) return false;
  const extra = Math.max(0, Number(templatesCount) || 0) * PER_PAGE_TTL_MS;
  const ttl = BASE_CONSENT_TTL_MS + extra;
  return Date.now() - startedAt > ttl;
};

const deleteSubmissionData = async (submissionId) => {
  if (!submissionId) return;
  const docs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
  const clients = await IntakeSubmissionClient.listBySubmissionId(submissionId);
  const phiDocs = await ClientPhiDocument.listByIntakeSubmissionId(submissionId);
  let uploadPaths = [];
  try {
    const pool = (await import('../config/database.js')).default;
    const [uploadRows] = await pool.execute(
      'SELECT storage_path FROM intake_submission_uploads WHERE intake_submission_id = ?',
      [submissionId]
    );
    uploadPaths = (uploadRows || []).map((r) => String(r?.storage_path || '').trim()).filter(Boolean);
  } catch {
    // table may not exist yet
  }
  const paths = new Set([
    ...(Array.isArray(docs) ? docs.map((d) => String(d?.signed_pdf_path || '').trim()) : []),
    ...(Array.isArray(clients) ? clients.map((c) => String(c?.bundle_pdf_path || '').trim()) : []),
    ...uploadPaths
  ].filter(Boolean));
  for (const doc of phiDocs || []) {
    const p = String(doc?.storage_path || '').trim();
    if (p) paths.add(p);
  }
  for (const path of paths) {
    try {
      await StorageService.deleteObject(path);
    } catch {
      // best-effort
    }
  }
  if (phiDocs?.length) {
    try {
      const ids = phiDocs.map((d) => d.id).filter(Boolean);
      await ClientPhiDocument.deleteByIds(ids);
    } catch {
      // ignore
    }
  }
  try {
    await IntakeSubmission.deleteById(submissionId);
  } catch {
    // ignore
  }
};

const isOptionalPublicField = (def) => {
  const normalize = (val) =>
    String(val || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '_');
  const key = normalize(def?.prefillKey || def?.prefill_key || def?.id);
  const label = normalize(def?.label);
  const name = normalize(def?.name);
  const hiddenKeys = new Set(['client_first', 'client_last', 'relationship']);
  return hiddenKeys.has(key) || hiddenKeys.has(label) || hiddenKeys.has(name);
};

const isPublicDateField = (def) => {
  const key = String(def?.prefillKey || def?.prefill_key || def?.id || '').trim().toLowerCase();
  return key === 'date';
};

const decodeHtmlEntities = (value) =>
  String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const resolveIntakeSenderIdentity = async ({ organizationId, scopeType }) => {
  const agencyId = Number(organizationId);
  if (!agencyId) return null;
  const scope = String(scopeType || '').trim().toLowerCase();
  const keys = scope === 'school'
    ? ['school_intake', 'intake', 'notifications', 'system']
    : ['intake', 'notifications', 'system'];
  const list = await EmailSenderIdentity.list({ agencyId, includePlatformDefaults: true, onlyActive: true });
  for (const key of keys) {
    const match = (list || []).find((i) => String(i?.identity_key || '').trim() === key);
    if (match) return match;
  }
  return null;
};

const buildAnswersPdfBuffer = async ({ link, intakeData }) => {
  if (!intakeData) return null;
  const clients = Array.isArray(intakeData?.clients) ? intakeData.clients : [];
  const totalClients = clients.length || 1;
  const sections = [];
  for (let i = 0; i < totalClients; i += 1) {
    const rawText = buildIntakeAnswersText({ link, intakeData, clientIndex: i });
    if (!rawText) continue;
    const client = clients[i];
    const clientName =
      String(client?.fullName || '').trim()
      || `${String(client?.firstName || '').trim()} ${String(client?.lastName || '').trim()}`.trim();
    const heading = clientName ? `Intake Responses - ${clientName}` : `Intake Responses - Client ${i + 1}`;
    const lines = decodeHtmlEntities(rawText).split('\n');
    sections.push({ heading, lines });
  }
  if (!sections.length) return null;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageSize = [612, 792];
  const margin = 48;
  const maxWidth = pageSize[0] - margin * 2;
  const lineGap = 4;

  const wrapText = (text, activeFont, size, width) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let current = '';
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      const nextWidth = activeFont.widthOfTextAtSize(next, size);
      if (nextWidth <= width) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines;
  };

  let page = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - margin;
  const newLine = (size) => {
    y -= size + lineGap;
    if (y < margin + 40) {
      page = pdfDoc.addPage(pageSize);
      y = pageSize[1] - margin;
    }
  };

  const approval = intakeData?.approval || null;
  if (approval && (approval.staffLastName || approval.clientFirstName || approval.mode)) {
    const approvalTitle = wrapText('Staff-Assisted Verification', fontBold, 18, maxWidth);
    approvalTitle.forEach((line) => {
      page.drawText(line, { x: margin, y, size: 18, font: fontBold, color: rgb(0, 0, 0) });
      newLine(18);
    });
    newLine(8);
    const approvalLines = [
      `Mode: ${approval.mode || 'staff_assisted'}`,
      `Staff last name: ${approval.staffLastName || '—'}`,
      `Client first name: ${approval.clientFirstName || '—'}`,
      `Approved at: ${approval.approvedAt || '—'}`
    ];
    approvalLines.forEach((line) => {
      const wrapped = wrapText(line, font, 12, maxWidth);
      wrapped.forEach((w) => {
        page.drawText(w, { x: margin, y, size: 12, font, color: rgb(0, 0, 0) });
        newLine(12);
      });
    });
    page = pdfDoc.addPage(pageSize);
    y = pageSize[1] - margin;
  }

  const headerLines = wrapText('Intake Responses', fontBold, 18, maxWidth);
  headerLines.forEach((line) => {
    page.drawText(line, { x: margin, y, size: 18, font: fontBold, color: rgb(0, 0, 0) });
    newLine(18);
  });
  newLine(10);

  for (const section of sections) {
    const headingLines = wrapText(section.heading, fontBold, 14, maxWidth);
    headingLines.forEach((line) => {
      page.drawText(line, { x: margin, y, size: 14, font: fontBold, color: rgb(0, 0, 0) });
      newLine(14);
    });

    section.lines.forEach((rawLine) => {
      const trimmed = String(rawLine || '').trim();
      if (!trimmed) {
        newLine(10);
        return;
      }
      if (/^-{2,}$/.test(trimmed)) return;
      if (!trimmed.includes(':')) {
        page.drawText(trimmed, { x: margin, y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
        newLine(12);
        return;
      }
      const idx = trimmed.indexOf(':');
      const label = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      const labelText = `${label}:`;
      const labelLines = wrapText(labelText, fontBold, 11, maxWidth * 0.4);
      labelLines.forEach((line) => {
        page.drawText(line, { x: margin, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
        newLine(11);
      });
      const valueLines = wrapText(value, font, 11, maxWidth);
      valueLines.forEach((line) => {
        page.drawText(line, { x: margin, y, size: 11, font, color: rgb(0, 0, 0) });
        newLine(11);
      });
    });

    newLine(12);
  }

  return await pdfDoc.save();
};

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

  const fullName = String(clientPayload?.fullName || '').trim()
    || `${String(clientPayload?.firstName || '').trim()} ${String(clientPayload?.lastName || '').trim()}`.trim();
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

  if (!hasValue(merged.client_first)) {
    const fallbackFirst =
      clientResponses?.client_first ||
      clientResponses?.clientFirst ||
      submissionResponses?.client_first ||
      submissionResponses?.clientFirst;
    setValue('client_first', fallbackFirst);
  }
  if (!hasValue(merged.client_last)) {
    const fallbackLast =
      clientResponses?.client_last ||
      clientResponses?.clientLast ||
      submissionResponses?.client_last ||
      submissionResponses?.clientLast;
    setValue('client_last', fallbackLast);
  }
  if (!hasValue(merged.relationship)) {
    const relKey = Object.keys(guardianResponses || {}).find((k) => String(k || '').toLowerCase().includes('relationship'));
    if (relKey && guardianResponses?.[relKey]) {
      setValue('relationship', guardianResponses[relKey]);
    } else {
      setValue('relationship', guardianResponses?.relationship || submissionResponses?.relationship || '');
    }
  }

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

/** Format YYYY-MM-DD as MM/DD/YYYY for display. */
const formatDateForDisplay = (val) => {
  const s = String(val || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [, yyyy, mm, dd] = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return `${mm}/${dd}/${yyyy}`;
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
  const str = String(val);
  const formatted = formatDateForDisplay(str);
  if (formatted) return formatted;
  return str;
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

  const clientFirst =
    clientPayload?.firstName ||
    clientResponses?.client_first ||
    clientResponses?.clientFirst ||
    submissionResponses?.client_first ||
    submissionResponses?.clientFirst;
  const clientLast =
    clientPayload?.lastName ||
    clientResponses?.client_last ||
    clientResponses?.clientLast ||
    submissionResponses?.client_last ||
    submissionResponses?.clientLast;
  const clientName =
    String(clientPayload?.fullName || '').trim() ||
    `${String(clientFirst || '').trim()} ${String(clientLast || '').trim()}`.trim();

  // Client info first (requested: first page shows client, not parent)
  pushHeader(`Client ${clientIndex + 1}${clientName ? ` - ${clientName}` : ''} Information`);
  pushLine('Client first name', clientFirst);
  pushLine('Client last name', clientLast);
  const clientLines = buildAnswerLinesForScope({
    fields: getOrderedFieldsByScope(fields, 'client'),
    responses: clientResponses
  });
  if (clientLines.length) {
    clientLines.forEach((line) => output.push(`${line.label}: ${line.value}`));
  } else {
    output.push('No client answers captured.');
  }

  // Guardian info second
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

const summaryExcludePattern = /insurance|member id|policy|subscriber|payer|medicaid|medicare|coverage|group|plan|billing|ssn|social security|address|street|city|state|zip|postal|phone|email|contact|relationship|guardian first|guardian last|client first|client last|full name|middle name|date of birth|birthdate|dob|grade|school|legal right|custodian|sms|text message|communication preference|apartment|apt/i;
const summaryExcludeKeyPattern = /legal|custodian|sms|text|communication|apartment|address|phone|email|relationship|client_first|client_last|guardian_first|guardian_last|dob|birth|grade|school/i;

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
  const isExampleValue = (val) => {
    if (!hasValue(val)) return false;
    const normalized = String(val).trim().toLowerCase();
    return normalized === 'example' || normalized === 'yes_full';
  };
  const isYes = (val) => {
    if (!hasValue(val)) return false;
    const normalized = String(val).trim().toLowerCase();
    return normalized === 'yes' || normalized === 'true' || normalized === '1';
  };
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

  const formatElevated = (score, cutoff) => (score >= cutoff ? 'Elevated' : 'Not Elevated');
  const buildH0002Narrative = ({ attentionScore, internalScore, externalScore, totalScore, traumaIndicators, goals }) => {
    const attentionStatus = formatElevated(attentionScore, 7);
    const internalStatus = formatElevated(internalScore, 5);
    const externalStatus = formatElevated(externalScore, 7);
    const totalStatus = totalScore >= 15 ? 'clinically significant' : 'below clinical cutoff';
    const traumaText = traumaIndicators.length
      ? `Trauma indicators were endorsed (${traumaIndicators.join('; ')}).`
      : 'No trauma indicators were endorsed.';
    const goalsText = goals.length
      ? `Client goals include: ${goals.map((g) => g.value).join('; ')}.`
      : 'Client goals were not reported.';
    return (
      `PSC-17 was completed to assess fit and functioning and establish a baseline for services. ` +
      `Scores indicate Attention is ${attentionStatus}, Internalizing is ${internalStatus}, and Externalizing is ${externalStatus}; total score is ${totalStatus}. ` +
      `${traumaText} ${goalsText} ` +
      `Findings support the need for structured support and ongoing monitoring of emotional and behavioral functioning.`
    ).trim();
  };

  let attentionScore = 0;
  let internalScore = 0;
  let externalScore = 0;
  let totalScore = 0;
  let answered = 0;
  if (pscItems.length) {
    const attentionKeys = [1, 3, 7, 13, 17];
    const internalKeys = [2, 6, 9, 11, 15];
    const externalKeys = [4, 5, 8, 10, 12, 14, 16];
    const sumScores = (keys) =>
      keys.reduce((acc, idx) => {
        const item = pscItems.find((entry) => entry.index === idx);
        return acc + (item?.score ?? 0);
      }, 0);
    totalScore = pscItems.reduce((acc, entry) => acc + (entry?.score ?? 0), 0);
    answered = pscItems.filter((entry) => entry.score !== null).length;
    attentionScore = sumScores(attentionKeys);
    internalScore = sumScores(internalKeys);
    externalScore = sumScores(externalKeys);
    output.push('PSC-17 Summary');
    output.push('--------------');
    output.push(`Total score: ${totalScore} (${answered} of 17 answered)`);
    output.push(`Attention: ${attentionScore}`);
    output.push(`Internalizing: ${internalScore}`);
    output.push(`Externalizing: ${externalScore}`);
    output.push('');
    output.push('Interpretation');
    output.push('-------------');
    output.push(
      attentionScore >= 7
        ? 'Attention scores indicate clinically significant concerns with focus and attention.'
        : 'Functioning within normal limits; attention does not appear to be a primary barrier.'
    );
    output.push(
      internalScore >= 5
        ? 'Scores indicate the presence of emotional distress, meeting the threshold for clinical risk.'
        : 'Internalizing scores do not indicate clinically significant distress.'
    );
    output.push(
      externalScore >= 7
        ? 'Scores indicate behavioral dysregulation and interpersonal conflict, meeting the threshold for clinical risk.'
        : 'Externalizing scores do not indicate clinically significant behavioral dysregulation.'
    );
    output.push(
      totalScore >= 15
        ? 'Total PSC-17 score meets the overall clinical cutoff for risk.'
        : 'Total PSC-17 score is below the overall clinical cutoff.'
    );
    output.push('');
  }

  const shouldExcludeSummaryLine = (line) => {
    if (!line?.label || !hasValue(line?.value)) return true;
    if (isExampleValue(line?.value)) return true;
    const label = String(line.label);
    if (summaryExcludePattern.test(label)) return true;
    const key = String(line.key || '').toLowerCase();
    if (key && summaryExcludeKeyPattern.test(key)) return true;
    return false;
  };

  const pushClinicalLines = (lines) => {
    lines.forEach((line) => {
      if (shouldExcludeSummaryLine(line)) return;
      const label = String(line.label);
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

  const findYesLabels = (lines, patterns) =>
    lines
      .filter((line) => {
        if (shouldExcludeSummaryLine(line)) return false;
        const label = String(line.label || '').toLowerCase();
        return patterns.some((p) => p.test(label)) && isYes(line.value);
      })
      .map((line) => String(line.label).trim());

  const traumaLabels = [
    ...findYesLabels(orderedClient, [/physical harm|abuse/i]),
    ...findYesLabels(orderedClient, [/neglect|lack of appropriate care/i]),
    ...findYesLabels(orderedClient, [/emotional harm|mistreatment|intimidation/i])
  ];

  const goalLines = [...orderedClient, ...orderedSubmission].filter((line) => {
    if (shouldExcludeSummaryLine(line)) return false;
    const label = String(line.label || '').toLowerCase();
    return label.includes('hope') && label.includes('gain');
  });

  if (traumaLabels.length) {
    output.push('Clinical History');
    output.push('----------------');
    output.push(
      `Trauma indicators endorsed: ${traumaLabels.join('; ')}.`
    );
    output.push('');
  }
  if (goalLines.length) {
    output.push('Client Goals');
    output.push('------------');
    goalLines.forEach((line) => output.push(`${line.label}: ${line.value}`));
    output.push('');
  } else if (!pscItems.length) {
    output.push('No clinical responses captured.');
  }

  if (pscItems.length) {
    const h0002Narrative = buildH0002Narrative({
      attentionScore,
      internalScore,
      externalScore,
      totalScore,
      traumaIndicators: traumaLabels,
      goals: goalLines
    });
    output.push('H0002 Narrative');
    output.push('--------------');
    output.push(h0002Narrative);
    output.push('');
    output.push(
      `Objective Output: Client scored in the ${formatElevated(attentionScore, 7)} range for Attention (${attentionScore}; Cutoff >= 7), ` +
      `the ${formatElevated(internalScore, 5)} range for Internalizing (${internalScore}; Cutoff >= 5), and the ${formatElevated(externalScore, 7)} range for Externalizing (${externalScore}; Cutoff >= 7). ` +
      `Total Score was ${totalScore} (Cutoff >= 15).`
    );
    output.push('Diagnosis: Deferred (R69 – Illness, unspecified) or Z03.89 – Encounter for observation for other suspected diseases and conditions ruled out.');
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
  expiresAt,
  organizationId = null
}) => {
  if (!clientId || !intakeData) return;
  const agencyId = clientRow?.agency_id || link?.organization_id || null;
  const orgId =
    clientRow?.organization_id ||
    clientRow?.school_organization_id ||
    organizationId ||
    link?.organization_id ||
    null;
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
      const resolvedOrgId =
        clientRow?.organization_id ||
        clientRow?.school_organization_id ||
        organizationId ||
        agencyId ||
        null;
      const phiDoc = await ClientPhiDocument.create({
        clientId,
        agencyId,
        schoolOrganizationId: resolvedOrgId || agencyId,
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
    } catch (err) {
      // best-effort; do not block public intake
      console.error('createIntakeTextDocuments failed', {
        clientId,
        submissionId,
        filename: doc.filename,
        error: err?.message || err,
        code: err?.code,
        sqlState: err?.sqlState
      });
    }
  }
};

const createIntakePacketDocument = async ({
  clientId,
  clientRow,
  submissionId,
  storagePath,
  ipAddress,
  expiresAt,
  link,
  organizationId = null
}) => {
  if (!clientId || !storagePath) return;
  const agencyId = clientRow?.agency_id || link?.organization_id || null;
  const orgId =
    clientRow?.organization_id ||
    clientRow?.school_organization_id ||
    organizationId ||
    link?.organization_id ||
    null;
  try {
    const phiDoc = await ClientPhiDocument.create({
      clientId,
      agencyId,
      schoolOrganizationId: orgId || agencyId,
      intakeSubmissionId: submissionId,
      storagePath,
      originalName: 'Intake Packet (Signed)',
      documentTitle: 'Intake Packet',
      documentType: 'Intake Packet',
      mimeType: 'application/pdf',
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
      metadata: { submissionId, kind: 'intake_packet' }
    });
  } catch (err) {
    // best-effort; do not block public intake
    console.error('createIntakePacketDocument failed', {
      clientId,
      submissionId,
      storagePath,
      error: err?.message || err,
      code: err?.code,
      sqlState: err?.sqlState
    });
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

const requiresCaptchaForLink = (organization, agency) => {
  const names = process.env.RECAPTCHA_REQUIRED_ORG_NAMES;
  if (!names || typeof names !== 'string') return false;
  const list = names.split(',').map((s) => String(s || '').trim().toLowerCase()).filter(Boolean);
  if (!list.length) return false;
  const check = (org) => {
    if (!org) return false;
    const n = String(org.name || '').trim().toLowerCase();
    const o = String(org.official_name || '').trim().toLowerCase();
    return list.some((x) => n === x || o === x || n.includes(x) || o.includes(x));
  };
  return check(organization) || check(agency);
};

const notifyUnassignedDocuments = async ({ link, submission, docCount }) => {
  if (!link || !submission || !docCount || docCount < 1) return;
  try {
    const { agency } = await resolveIntakeOrgContext(link);
    const agencyId = agency?.id || link?.organization_id || null;
    if (!agencyId) return;
    const signerName = String(submission?.signer_name || '').trim() || 'Someone';
    const formTitle = String(link?.title || '').trim() || 'Public form';
    const isMedicalRecords = String(link?.form_type || '').toLowerCase() === 'medical_records_request';

    if (isMedicalRecords) {
      await Notification.create({
        type: 'medical_records_release_submitted',
        severity: 'critical',
        title: 'Medical Records Release Submitted',
        message: `${formTitle}: ${signerName} submitted a medical records release. View in Submitted Documents.`,
        audienceJson: {
          admin: true,
          clinicalPracticeAssistant: false,
          supervisor: false,
          provider: false
        },
        userId: null,
        agencyId,
        relatedEntityType: 'intake_submission',
        relatedEntityId: submission.id,
        actorUserId: null
      });
    } else {
      await Notification.create({
        type: 'unassigned_document_submitted',
        severity: 'info',
        title: 'New unassigned document(s)',
        message: `${formTitle}: ${signerName} submitted ${docCount} document(s). Assign to a client in Unassigned Documents.`,
        audienceJson: {
          admin: true,
          clinicalPracticeAssistant: false,
          supervisor: false,
          provider: false
        },
        userId: null,
        agencyId,
        relatedEntityType: 'intake_submission',
        relatedEntityId: submission.id,
        actorUserId: null
      });
    }
  } catch {
    // best-effort; do not block submission
  }
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
    const needsCaptcha = requiresCaptchaForLink(organization, agency);
    res.json({
      link: {
        id: link.id,
        title: link.title,
        description: link.description,
        language_code: link.language_code || 'en',
        scope_type: link.scope_type,
        form_type: link.form_type || 'intake',
        organization_id: link.organization_id,
        program_id: link.program_id,
        create_client: link.create_client,
        create_guardian: link.create_guardian,
        intake_fields: link.intake_fields,
        intake_steps: link.intake_steps,
        custom_messages: link.custom_messages || null
      },
      recaptcha: needsCaptcha
        ? {
            siteKey: process.env.RECAPTCHA_SITE_KEY_INTAKE || config.recaptcha?.siteKey || null,
            useEnterprise: !!config.recaptcha?.enterpriseApiKey,
            forceWidget: !!process.env.RECAPTCHA_SITE_KEY_INTAKE
          }
        : { siteKey: null, useEnterprise: false, forceWidget: false },
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

export const createPublicIntakeSession = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    const ipAddress = getClientIpAddress(req);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const starts = await IntakeSubmission.countStartsByLinkAndIp({
      intakeLinkId: link.id,
      ipAddress,
      since
    });
    if (starts >= 5) {
      return res.status(429).json({ error: { message: 'Daily intake start limit reached. Please try again tomorrow.' } });
    }

    const templates = await loadAllowedTemplates(link);
    const ttlMs = BASE_CONSENT_TTL_MS + Math.max(0, Number(templates.length || 0)) * PER_PAGE_TTL_MS;
    const retentionExpiresAt = new Date(Date.now() + ttlMs);
    const sessionToken = crypto.randomBytes(18).toString('hex');

    const submission = await IntakeSubmission.create({
      intakeLinkId: link.id,
      status: 'started',
      sessionToken,
      ipAddress,
      userAgent: req.get('user-agent'),
      retentionExpiresAt
    });

    res.json({ sessionToken, submissionId: submission?.id || null });
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

    const publicKey = String(req.params.publicKey || '').trim();
    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const { organization, agency } = await resolveIntakeOrgContext(link);
    const needsCaptcha = requiresCaptchaForLink(organization, agency);
    const captchaConfigured = !!config.recaptcha?.secretKey || !!config.recaptcha?.enterpriseApiKey;
    if (needsCaptcha && config.nodeEnv === 'production' && !captchaConfigured) {
      return res.status(500).json({ error: { message: 'Captcha is not configured' } });
    }
    if (needsCaptcha && captchaConfigured) {
      const captchaToken = String(req.body.captchaToken || '').trim();
      if (!captchaToken) {
        if (config.nodeEnv === 'production') {
          return res.status(400).json({ error: { message: 'Captcha is required' } });
        }
      } else {
        const intakeSiteKey = process.env.RECAPTCHA_SITE_KEY_INTAKE || config.recaptcha?.siteKey;
        const verification = await verifyRecaptchaV3({
          token: captchaToken,
          remoteip: getClientIpAddress(req),
          expectedAction: 'public_intake_consent',
          userAgent: req.get('user-agent'),
          siteKeyOverride: intakeSiteKey || undefined,
          checkboxKey: !!process.env.RECAPTCHA_SITE_KEY_INTAKE
        });
        if (!verification.ok) {
          console.warn('[recaptcha] public intake verification failed', {
            reason: verification.reason,
            errorCodes: verification.errorCodes,
            action: verification.action
          });
          if (config.nodeEnv === 'production') {
            return res.status(400).json({ error: { message: 'Captcha verification failed. Please complete the captcha again and try again.' } });
          }
        } else {
          const minScoreRaw = process.env.RECAPTCHA_MIN_SCORE_INTAKE ?? config.recaptcha?.minScore ?? 0.3;
          const effectiveMinScore = Number.isFinite(Number(minScoreRaw)) ? Number(minScoreRaw) : 0.3;
          if (verification.score !== null && verification.score < effectiveMinScore) {
            console.warn('[recaptcha] public intake score too low', {
              score: verification.score,
              minScore: effectiveMinScore
            });
            if (config.nodeEnv === 'production') {
              return res.status(400).json({ error: { message: 'Captcha verification failed. Please try again.' } });
            }
          }
        }
      }
    }

    const ipAddress = getClientIpAddress(req);
    const userAgent = req.get('user-agent');
    const now = new Date();
    const retentionPolicy = await resolveRetentionPolicy(link);
    const retentionExpiresAt = buildRetentionExpiresAt({ policy: retentionPolicy, submittedAt: now });

    const intakeData = req.body?.intakeData || null;
    const intakeDataHash = hashIntakeData(intakeData);
    const sessionToken = String(req.body?.sessionToken || '').trim();
    let submission = sessionToken ? await IntakeSubmission.findBySessionToken(sessionToken) : null;
    if (submission) {
      if (String(submission.status || '').toLowerCase() === 'submitted') {
        return res.status(409).json({ error: { message: 'This intake session is already completed.' } });
      }
      submission = await IntakeSubmission.updateById(submission.id, {
        status: 'consented',
        signer_name: normalizeName(req.body.signerName),
        signer_initials: normalizeName(req.body.signerInitials),
        signer_email: normalizeName(req.body.signerEmail) || null,
        signer_phone: normalizeName(req.body.signerPhone) || null,
        intake_data: intakeData ? JSON.stringify(intakeData) : null,
        intake_data_hash: intakeDataHash,
        consent_given_at: now,
        ip_address: ipAddress,
        user_agent: userAgent,
        retention_expires_at: retentionExpiresAt,
        session_token: sessionToken || null
      });
    } else {
      submission = await IntakeSubmission.create({
        intakeLinkId: link.id,
        status: 'consented',
        signerName: normalizeName(req.body.signerName),
        signerInitials: normalizeName(req.body.signerInitials),
        signerEmail: normalizeName(req.body.signerEmail) || null,
        signerPhone: normalizeName(req.body.signerPhone) || null,
        sessionToken: sessionToken || null,
        intakeData,
        intakeDataHash,
        consentGivenAt: now,
        ipAddress,
        userAgent,
        retentionExpiresAt
      });
    }

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
    if (isSubmissionExpired(submission, { templatesCount: templates.length })) {
      await deleteSubmissionData(submissionId);
      return res.status(410).json({ error: { message: 'This intake session has expired. Please restart the intake.' } });
    }

    let downloadUrl = null;
    if (submission.combined_pdf_path) {
      downloadUrl = await StorageService.getSignedUrl(submission.combined_pdf_path, 60 * 24 * 14);
    }

    let intakeData = null;
    if (submission.intake_data) {
      try {
        intakeData = typeof submission.intake_data === 'string'
          ? JSON.parse(submission.intake_data)
          : submission.intake_data;
      } catch {
        intakeData = null;
      }
    }

    res.json({
      submissionId,
      status: submission.status,
      totalDocuments: templates.length,
      signedTemplateIds: Array.from(signedTemplateIds),
      signedDocuments: signedDocs,
      downloadUrl,
      intakeData
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
    let intakeData = null;
    if (submission?.intake_data) {
      try {
        intakeData = typeof submission.intake_data === 'string'
          ? JSON.parse(submission.intake_data)
          : submission.intake_data;
      } catch {
        intakeData = null;
      }
    }
    if (intakeData) {
      const baseValues = buildDocumentFieldValuesForClient({
        link,
        intakeData,
        clientIndex: 0,
        baseFieldValues: {}
      });
      const normalize = (val) =>
        String(val || '')
          .trim()
          .toLowerCase()
          .replace(/[\s_-]+/g, ' ');
      const normalizedBase = {};
      Object.keys(baseValues || {}).forEach((key) => {
        normalizedBase[normalize(key)] = baseValues[key];
      });
      const resolveFieldKey = (def) => def?.prefillKey || def?.prefill_key || def?.id || '';
      const getFallbackValue = (def) => {
        const key = normalize(resolveFieldKey(def));
        if (key && hasValue(normalizedBase[key])) return normalizedBase[key];
        const label = normalize(def?.label || def?.name || def?.id || '');
        if (label.includes('printed client name') || label.includes('client name')) {
          return baseValues.client_full_name
            || `${baseValues.client_first || ''} ${baseValues.client_last || ''}`.trim();
        }
        if (label.includes('relationship')) return baseValues.relationship || '';
        return '';
      };
      fieldDefinitions.forEach((def) => {
        if (!def?.id) return;
        const existing = fieldValues[def.id];
        if (hasValue(existing)) return;
        const fallback = getFallbackValue(def);
        if (hasValue(fallback)) fieldValues[def.id] = fallback;
      });
    }

    const missingFields = [];
    for (const def of fieldDefinitions) {
      if (!def || !def.required) continue;
      if (!isFieldVisible(def, fieldValues)) continue;
      if (def.type === 'date' && (def.autoToday || isPublicDateField(def))) continue;
      if (isOptionalPublicField(def)) continue;
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
    const templates = await loadAllowedTemplates(link);
    if (isSubmissionExpired(submission, { templatesCount: templates.length })) {
      await deleteSubmissionData(submissionId);
      return res.status(410).json({ error: { message: 'This intake session has expired. Please restart the intake.' } });
    }

    // Idempotent retry: if already submitted, return existing result (no duplicate work, no data loss)
    const isJobApplication = String(link.form_type || '').toLowerCase() === 'job_application';
    if (String(submission.status || '').toLowerCase() === 'submitted') {
      if (isJobApplication && submission.guardian_user_id) {
        return res.json({
          success: true,
          submission,
          jobApplicationSubmitted: true,
          candidateId: submission.guardian_user_id
        });
      }
      if (submission.combined_pdf_path) {
        let downloadUrl = null;
        try {
          downloadUrl = await StorageService.getSignedUrl(submission.combined_pdf_path, 60 * 24 * 14);
        } catch {
          // best-effort
        }
        const clientRows = await IntakeSubmissionClient.listBySubmissionId(submissionId);
        const clientBundles = [];
        for (const c of clientRows || []) {
          if (c?.bundle_pdf_path) {
            try {
              const url = await StorageService.getSignedUrl(c.bundle_pdf_path, 60 * 24 * 14);
              clientBundles.push({
                clientId: c.client_id,
                clientName: c.full_name || null,
                filename: `intake-client-${c.client_id || 'unknown'}.pdf`,
                downloadUrl: url
              });
            } catch {
              // best-effort
            }
          }
        }
        const signedDocs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
        return res.json({
          success: true,
          submission,
          documents: signedDocs || [],
          downloadUrl,
          clientBundles
        });
      }
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
      const gLast = String(req.body?.guardian?.lastName || '').trim();
      if (isJobApplication) {
        if (!gEmail || !gFirst || !gLast) {
          return res.status(400).json({ error: { message: 'First name, last name, and email are required.' } });
        }
      } else {
        if (!gEmail || !gFirst) {
          return res.status(400).json({ error: { message: 'Guardian name and email are required.' } });
        }
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
      retention_expires_at: retentionExpiresAt,
      session_token: String(req.body?.sessionToken || '').trim() || null
    });

    // Job application: create candidate, migrate uploads, return success (no client, no document validation)
    if (isJobApplication) {
      const agencyId = parseInt(link.organization_id, 10);
      if (!agencyId) {
        return res.status(400).json({ error: { message: 'Job application link is not associated with an organization.' } });
      }
      const gFirst = String(req.body?.guardian?.firstName || '').trim();
      const gLast = String(req.body?.guardian?.lastName || '').trim();
      const gEmail = String(req.body?.guardian?.email || '').trim();
      const gPhone = req.body?.guardian?.phoneNumber !== undefined ? String(req.body.guardian.phoneNumber || '').trim()
  : req.body?.guardian?.phone !== undefined ? String(req.body.guardian.phone || '').trim() : null;

      const user = await User.create({
        email: gEmail,
        passwordHash: null,
        firstName: gFirst,
        lastName: gLast,
        phoneNumber: gPhone || null,
        personalEmail: gEmail,
        role: 'provider',
        status: 'PROSPECTIVE'
      });
      await User.assignToAgency(user.id, agencyId);

      const jobDescriptionId = link.job_description_id ? parseInt(link.job_description_id, 10) : null;
      if (jobDescriptionId) {
        const jd = await HiringJobDescription.findById(jobDescriptionId);
        if (jd && Number(jd.agency_id) === Number(agencyId) && Number(jd.is_active) === 1) {
          await HiringProfile.upsert({
            candidateUserId: user.id,
            stage: 'applied',
            appliedRole: null,
            source: 'job_application_link',
            jobDescriptionId,
            coverLetterText: null
          });
        }
      } else {
        await HiringProfile.upsert({
          candidateUserId: user.id,
          stage: 'applied',
          appliedRole: null,
          source: 'job_application_link',
          jobDescriptionId: null,
          coverLetterText: null
        });
      }

      // Migrate intake_submission_uploads to user_admin_docs
      const pool = (await import('../config/database.js')).default;
      let uploadRows = [];
      try {
        const [rows] = await pool.execute(
          `SELECT id, storage_path, original_filename, mime_type, upload_label,
                  is_encrypted, encryption_key_id, encryption_wrapped_key, encryption_iv, encryption_auth_tag, encryption_aad
           FROM intake_submission_uploads WHERE intake_submission_id = ?`,
          [submissionId]
        );
        uploadRows = rows || [];
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }

      for (const row of uploadRows) {
        const storagePath = String(row?.storage_path || '').trim();
        if (!storagePath) continue;
        let fileBuffer;
        try {
          fileBuffer = await StorageService.readObject(storagePath);
        } catch (e) {
          // best-effort: skip if file missing
          continue;
        }
        if (Number(row?.is_encrypted) === 1 && row?.encryption_wrapped_key && row?.encryption_iv && row?.encryption_auth_tag) {
          try {
            fileBuffer = await DocumentEncryptionService.decryptBuffer({
              encryptedBuffer: fileBuffer,
              encryptionKeyId: row.encryption_key_id || null,
              encryptionWrappedKeyB64: row.encryption_wrapped_key,
              encryptionIvB64: row.encryption_iv,
              encryptionAuthTagB64: row.encryption_auth_tag,
              aad: row.encryption_aad || undefined
            });
          } catch (e) {
            continue;
          }
        }
        const originalName = row.original_filename || 'upload';
        const mimeType = row.mime_type || 'application/octet-stream';
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const safeExt = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
        const filename = `application-${user.id}-${uniqueSuffix}${safeExt}`;
        const storageResult = await StorageService.saveAdminDoc(fileBuffer, filename, mimeType);
        const docType = (row.upload_label || '').toLowerCase().includes('resume') ? 'resume' : 'application_material';
        await pool.execute(
          `INSERT INTO user_admin_docs (user_id, title, doc_type, storage_path, original_name, mime_type, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [user.id, row.upload_label || 'Application material', docType, storageResult.relativePath, originalName, mimeType, user.id]
        );
      }

      await IntakeSubmission.updateById(submissionId, { guardian_user_id: user.id });

      return res.json({
        success: true,
        submission: await IntakeSubmission.findById(submissionId),
        jobApplicationSubmitted: true,
        candidateId: user.id
      });
    }

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

    const signedDocs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
    const signedByTemplate = new Map(signedDocs.map((d) => [d.document_template_id, d]));
    for (const t of templates) {
      if (!signedByTemplate.has(t.id)) {
        return res.status(400).json({ error: { message: `Missing signed document for ${t.name || 'document'}` } });
      }
    }

    const signer = buildSignerFromSubmission(updatedSubmission);
    const signedDocsOrdered = templates.map((t) => signedByTemplate.get(t.id)).filter(Boolean);
    const pdfPaths = [];
    const clientBundles = [];
    const workflowData = buildWorkflowData({ submission: { ...updatedSubmission, submitted_at: now } });

    for (const entry of signedDocsOrdered) {
      if (entry?.signed_pdf_path) {
        pdfPaths.push(entry.signed_pdf_path);
      }
    }
    const answersPdf = await buildAnswersPdfBuffer({ link, intakeData });

    let rawClients = createdClients.length
      ? createdClients.map((c) => ({ id: c.id, fullName: c.full_name || c.initials || '', initials: c.initials, contactPhone: c.contact_phone }))
      : (Array.isArray(req.body?.clients) ? req.body.clients : (req.body?.client ? [req.body.client] : []));
    // Public forms (create_client=false): use signer as virtual entry so documents are created with client_id=null
    if (!link.create_client && !rawClients.length) {
      const signerName = String(updatedSubmission?.signer_name || '').trim() || 'Signer';
      rawClients = [{ id: null, fullName: signerName, initials: updatedSubmission?.signer_initials || null, contactPhone: null }];
    }
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

      const clientPaths = [];

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
          let referenceNumber = null;

          if (template.document_action_type === 'signature' && !signatureData) {
            const sharedDoc = signedByTemplate.get(template.id);
            if (sharedDoc?.signed_pdf_path) {
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

          if (storagePath) clientPaths.push(storagePath);
          if (clientId && storagePath) {
            try {
              const clientRow = await Client.findById(clientId, { includeSensitive: true });
              const agencyId = clientRow?.agency_id || null;
              const orgId = clientRow?.organization_id || clientRow?.school_organization_id || null;
              const phiDoc = await ClientPhiDocument.create({
                clientId,
                agencyId,
                schoolOrganizationId: orgId || agencyId,
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
            const agencyId = clientRow?.agency_id || link?.organization_id || null;
            const orgId =
              clientRow?.organization_id ||
              clientRow?.school_organization_id ||
              (req.body?.organizationId ? Number(req.body.organizationId) : null) ||
              link?.organization_id ||
              null;
            const phiDoc = await ClientPhiDocument.create({
              clientId,
              agencyId,
              schoolOrganizationId: orgId || agencyId,
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

      const mergePaths = clientPaths.length ? clientPaths : pdfPaths;
      if (mergePaths.length) {
        const prefixBuffers = !clientPaths.length && answersPdf ? [answersPdf] : [];
        const mergedClientPdf = await PublicIntakeSigningService.mergeSignedPdfsFromPaths(mergePaths, prefixBuffers);
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
          filename: `intake-client-${clientPayload?.id || 'unknown'}.pdf`,
          downloadUrl: await StorageService.getSignedUrl(clientBundleResult.relativePath, 60 * 24 * 14)
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
          expiresAt: retentionExpiresAt,
          organizationId: req.body?.organizationId || null
        });
      }
    }

    let downloadUrl = null;
    if (pdfPaths.length > 0) {
      const mergedPdf = await PublicIntakeSigningService.mergeSignedPdfsFromPaths(
        pdfPaths,
        answersPdf ? [answersPdf] : []
      );
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
      downloadUrl = await StorageService.getSignedUrl(bundleResult.relativePath, 60 * 24 * 14);

      for (const clientPayload of rawClients) {
        const clientId = clientPayload?.id || null;
        if (!clientId) continue;
        let clientRow = null;
        try {
          clientRow = await Client.findById(clientId, { includeSensitive: true });
        } catch {
          clientRow = null;
        }
        await createIntakePacketDocument({
          clientId,
          clientRow,
          submissionId,
          storagePath: bundleResult.relativePath,
          ipAddress: updatedSubmission.ip_address || null,
          expiresAt: retentionExpiresAt,
          link,
          organizationId: req.body?.organizationId || null
        });

        // Notify admin/CPA team (same as paper packet upload) so they can process the intake
        let agencyId = clientRow?.agency_id || null;
        if (!agencyId && link?.organization_id) {
          const scope = String(link?.scope_type || '').toLowerCase();
          if (scope === 'school') {
            agencyId = await AgencySchool.getActiveAgencyIdForSchool(link.organization_id);
          }
          if (!agencyId) {
            agencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(link.organization_id);
          }
          if (!agencyId) agencyId = link.organization_id;
        }
        const schoolOrgId =
          clientRow?.school_organization_id ||
          clientRow?.organization_id ||
          (String(link?.scope_type || '').toLowerCase() === 'school' ? link?.organization_id : null) ||
          req.body?.organizationId ||
          null;
        const clientLabel =
          clientPayload?.fullName || clientRow?.identifier_code || clientRow?.initials || `ID ${clientId}`;
        notifyNewPacketUploaded({
          agencyId,
          schoolOrganizationId: schoolOrgId,
          clientId,
          clientNameOrIdentifier: clientLabel
        }).catch(() => {});
      }

      if (updatedSubmission.signer_email && EmailService.isConfigured()) {
        const clientCount = rawClients.length || 1;
        const subject = 'Your signed intake packet';
        const summaryLine = clientCount > 1 ? `Clients: ${clientCount}\n\n` : (primaryClientName ? `Client: ${primaryClientName}\n\n` : '');
        const text = `${summaryLine}Your intake packet is ready. Download here:\n\n${downloadUrl}\n\nThis link expires in 14 days.`;
        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            ${clientCount > 1 ? `<p><strong>Clients:</strong> ${clientCount}</p>` : (primaryClientName ? `<p><strong>Client:</strong> ${primaryClientName}</p>` : '')}
            <p>Your intake packet is ready.</p>
            <p><a href="${downloadUrl}" style="display:inline-block;padding:10px 14px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px;">Download Signed Packet</a></p>
            <p style="color:#777;">This link expires in 14 days.</p>
          </div>
        `.trim();
        try {
          const identity = await resolveIntakeSenderIdentity({
            organizationId: link?.organization_id || null,
            scopeType: link?.scope_type || null
          });
          if (identity?.id) {
            await sendEmailFromIdentity({
              senderIdentityId: identity.id,
              to: updatedSubmission.signer_email,
              subject,
              text,
              html,
              source: 'auto'
            });
          } else {
            await EmailService.sendEmail({
              to: updatedSubmission.signer_email,
              subject,
              text,
              html,
              fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || 'People Operations',
              fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
              replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
              attachments: null,
              source: 'auto',
              agencyId: link?.organization_id || null
            });
          }
        } catch {
          // best-effort email
        }
      }
    }

    if (!link.create_client && signedDocsOrdered.length > 0) {
      await notifyUnassignedDocuments({
        link,
        submission: updatedSubmission,
        docCount: signedDocsOrdered.length
      });
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

    // Idempotent retry: if already submitted, return existing result (no duplicate work, no data loss)
    if (String(submission.status || '').toLowerCase() === 'submitted' && submission.combined_pdf_path) {
      let downloadUrl = null;
      try {
        downloadUrl = await StorageService.getSignedUrl(submission.combined_pdf_path, 60 * 24 * 14);
      } catch {
        // best-effort
      }
      const clientRows = await IntakeSubmissionClient.listBySubmissionId(submissionId);
      const clientBundles = [];
      for (const c of clientRows || []) {
        if (c?.bundle_pdf_path) {
          try {
            const url = await StorageService.getSignedUrl(c.bundle_pdf_path, 60 * 24 * 14);
            clientBundles.push({
              clientId: c.client_id,
              clientName: c.full_name || null,
              filename: `intake-client-${c.client_id || 'unknown'}.pdf`,
              downloadUrl: url
            });
          } catch {
            // best-effort
          }
        }
      }
      return res.json({
        success: true,
        submission,
        downloadUrl,
        clientBundles
      });
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
    const pdfPaths = [];
    const clientBundles = [];
    const workflowData = buildWorkflowData({ submission: { ...updatedSubmission, submitted_at: now } });
    let rawClients = createdClients.length
      ? createdClients.map((c) => ({ id: c.id, fullName: c.full_name || c.initials || '', initials: c.initials, contactPhone: c.contact_phone }))
      : (Array.isArray(req.body?.clients) ? req.body.clients : (req.body?.client ? [req.body.client] : []));
    // Public forms (create_client=false): use signer as virtual entry so documents are created with client_id=null
    if (!link.create_client && !rawClients.length) {
      const signerName = String(updatedSubmission?.signer_name || '').trim() || 'Signer';
      rawClients = [{ id: null, fullName: signerName, initials: updatedSubmission?.signer_initials || null, contactPhone: null }];
    }
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
      const clientPaths = [];
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

        if (result.storagePath) {
          pdfPaths.push(result.storagePath);
          clientPaths.push(result.storagePath);
        }

        if (clientId) {
          try {
            const clientRow = await Client.findById(clientId, { includeSensitive: true });
            const agencyId = clientRow?.agency_id || link?.organization_id || null;
            const orgId =
              clientRow?.organization_id ||
              clientRow?.school_organization_id ||
              (req.body?.organizationId ? Number(req.body.organizationId) : null) ||
              link?.organization_id ||
              null;
            const phiDoc = await ClientPhiDocument.create({
              clientId,
              agencyId,
              schoolOrganizationId: orgId || agencyId,
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

      if (clientPaths.length) {
        const mergedClientPdf = await PublicIntakeSigningService.mergeSignedPdfsFromPaths(clientPaths);
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
          filename: `intake-client-${clientId || 'unknown'}.pdf`,
          downloadUrl: await StorageService.getSignedUrl(clientBundleResult.relativePath, 60 * 24 * 14)
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
          expiresAt: retentionExpiresAt,
          organizationId: req.body?.organizationId || null
        });
      }
    }

    const answersPdf = await buildAnswersPdfBuffer({ link, intakeData });

    let downloadUrl = null;
    if (pdfPaths.length > 0) {
      const mergedPdf = await PublicIntakeSigningService.mergeSignedPdfsFromPaths(
        pdfPaths,
        answersPdf ? [answersPdf] : []
      );
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
      downloadUrl = await StorageService.getSignedUrl(bundleResult.relativePath, 60 * 24 * 14);

      for (const clientPayload of rawClients) {
        const clientId = clientPayload?.id || null;
        if (!clientId) continue;
        let clientRow = null;
        try {
          clientRow = await Client.findById(clientId, { includeSensitive: true });
        } catch {
          clientRow = null;
        }
        await createIntakePacketDocument({
          clientId,
          clientRow,
          submissionId,
          storagePath: bundleResult.relativePath,
          ipAddress: updatedSubmission.ip_address || null,
          expiresAt: retentionExpiresAt,
          link,
          organizationId: req.body?.organizationId || null
        });

        // Notify admin/CPA team (same as paper packet upload) so they can process the intake
        let agencyId = clientRow?.agency_id || null;
        if (!agencyId && link?.organization_id) {
          const scope = String(link?.scope_type || '').toLowerCase();
          if (scope === 'school') {
            agencyId = await AgencySchool.getActiveAgencyIdForSchool(link.organization_id);
          }
          if (!agencyId) {
            agencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(link.organization_id);
          }
          if (!agencyId) agencyId = link.organization_id;
        }
        const schoolOrgId =
          clientRow?.school_organization_id ||
          clientRow?.organization_id ||
          (String(link?.scope_type || '').toLowerCase() === 'school' ? link?.organization_id : null) ||
          req.body?.organizationId ||
          null;
        const clientLabel =
          clientPayload?.fullName || clientRow?.identifier_code || clientRow?.initials || `ID ${clientId}`;
        notifyNewPacketUploaded({
          agencyId,
          schoolOrganizationId: schoolOrgId,
          clientId,
          clientNameOrIdentifier: clientLabel
        }).catch(() => {});
      }

      if (updatedSubmission.signer_email && EmailService.isConfigured()) {
        const clientCount = rawClients.length || 1;
        const subject = 'Your signed intake packet';
        const summaryLine = clientCount > 1 ? `Clients: ${clientCount}\n\n` : (primaryClientName ? `Client: ${primaryClientName}\n\n` : '');
        const text = `${summaryLine}Your intake packet is ready. Download here:\n\n${downloadUrl}\n\nThis link expires in 14 days.`;
        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            ${clientCount > 1 ? `<p><strong>Clients:</strong> ${clientCount}</p>` : (primaryClientName ? `<p><strong>Client:</strong> ${primaryClientName}</p>` : '')}
            <p>Your intake packet is ready.</p>
            <p><a href="${downloadUrl}" style="display:inline-block;padding:10px 14px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px;">Download Signed Packet</a></p>
            <p style="color:#777;">This link expires in 14 days.</p>
          </div>
        `.trim();
        try {
          const identity = await resolveIntakeSenderIdentity({
            organizationId: link?.organization_id || null,
            scopeType: link?.scope_type || null
          });
          if (identity?.id) {
            await sendEmailFromIdentity({
              senderIdentityId: identity.id,
              to: updatedSubmission.signer_email,
              subject,
              text,
              html,
              source: 'auto'
            });
          } else {
            await EmailService.sendEmail({
              to: updatedSubmission.signer_email,
              subject,
              text,
              html,
              fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || 'People Operations',
              fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
              replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
              attachments: null,
              source: 'auto',
              agencyId: link?.organization_id || null
            });
          }
        } catch {
          // best-effort email
        }
      }
    }

    if (!link.create_client && signedDocs.length > 0) {
      await notifyUnassignedDocuments({
        link,
        submission: updatedSubmission,
        docCount: signedDocs.length
      });
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
    const activeLinks = (links || []).filter((l) => !!l?.is_active);
    const link = activeLinks[0] || null;
    if (!activeLinks.length) return res.status(404).json({ error: { message: 'No intake link configured for school' } });
    res.json({ link, links: activeLinks });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /public-intake/:publicKey/:submissionId/upload
 * Upload files for an intake upload step. Uses multipart/form-data with field 'files'.
 */
export const uploadIntakeFiles = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const submissionId = parseInt(req.params.submissionId, 10);
    const stepId = String(req.body?.stepId || '').trim();
    const label = String(req.body?.label || 'Upload').trim().slice(0, 255);

    if (!submissionId || !stepId) {
      return res.status(400).json({ error: { message: 'submissionId and stepId are required' } });
    }

    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }
    if (String(submission.status || '').toLowerCase() === 'submitted') {
      return res.status(400).json({ error: { message: 'Submission already finalized' } });
    }

    const files = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
    if (!files.length) {
      return res.status(400).json({ error: { message: 'No files uploaded' } });
    }

    const pool = (await import('../config/database.js')).default;
    const saved = [];
    const useEncryption = DocumentEncryptionService.isConfigured();
    if (!useEncryption && process.env.NODE_ENV === 'production') {
      console.warn('Intake uploads stored unencrypted: REFERRAL_KMS_KEY or DOCUMENTS_KMS_KEY not configured');
    }

    for (const f of files) {
      if (!f?.buffer) continue;
      const sanitizedFilename = StorageService.sanitizeFilename(f.originalname || f.name || `upload-${Date.now()}`);
      const encryptionAad = JSON.stringify({
        intakeSubmissionId: submissionId,
        stepId,
        uploadLabel: label,
        filename: sanitizedFilename
      });

      let fileBuffer = f.buffer;
      let storagePath;
      let isEncrypted = 0;
      let encryptionKeyId = null;
      let encryptionWrappedKey = null;
      let encryptionIv = null;
      let encryptionAuthTag = null;
      let encryptionAlg = null;
      let encryptionAadVal = null;

      if (useEncryption) {
        const encResult = await DocumentEncryptionService.encryptBuffer(f.buffer, { aad: encryptionAad });
        fileBuffer = encResult.encryptedBuffer;
        isEncrypted = 1;
        encryptionKeyId = encResult.encryptionKeyId;
        encryptionWrappedKey = encResult.encryptionWrappedKeyB64;
        encryptionIv = encResult.encryptionIvB64;
        encryptionAuthTag = encResult.encryptionAuthTagB64;
        encryptionAlg = encResult.encryptionAlg;
        encryptionAadVal = encryptionAad;
      }

      const result = await StorageService.saveIntakeUpload({
        submissionId,
        stepId,
        fileBuffer,
        filename: sanitizedFilename,
        mimeType: useEncryption ? 'application/octet-stream' : (f.mimetype || null)
      });
      storagePath = result.relativePath;

      try {
        await pool.execute(
          `INSERT INTO intake_submission_uploads
           (intake_submission_id, step_id, upload_label, storage_path, original_filename, file_size, mime_type,
            is_encrypted, encryption_key_id, encryption_wrapped_key, encryption_iv, encryption_auth_tag, encryption_alg, encryption_aad)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            submissionId,
            stepId,
            label,
            storagePath,
            f.originalname || f.name || null,
            f.size || null,
            f.mimetype || null,
            isEncrypted,
            encryptionKeyId,
            encryptionWrappedKey,
            encryptionIv,
            encryptionAuthTag,
            encryptionAlg,
            encryptionAadVal
          ]
        );
      } catch (e) {
        if (e?.code === 'ER_NO_SUCH_TABLE') {
          return res.status(503).json({
            error: { message: 'Upload feature not available (run migration 517_intake_submission_uploads.sql)' }
          });
        }
        if (e?.code === 'ER_BAD_FIELD_ERROR' && String(e?.message || '').includes('is_encrypted')) {
          return res.status(503).json({
            error: { message: 'Upload encryption not available (run migration 518_intake_submission_uploads_encryption.sql)' }
          });
        }
        throw e;
      }
      saved.push({ path: result.relativePath, originalName: f.originalname || f.name });
    }

    res.json({ success: true, count: saved.length, uploads: saved });
  } catch (error) {
    next(error);
  }
};
