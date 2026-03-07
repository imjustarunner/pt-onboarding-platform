import { validationResult } from 'express-validator';
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import IntakeLink from '../models/IntakeLink.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeSubmissionDocument from '../models/IntakeSubmissionDocument.model.js';
import IntakeSubmissionClient from '../models/IntakeSubmissionClient.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import ClientSchoolRoiSigningLink from '../models/ClientSchoolRoiSigningLink.model.js';
import PublicIntakeSigningService from '../services/publicIntakeSigning.service.js';
import DocumentSigningService from '../services/documentSigning.service.js';
import PublicIntakeClientService from '../services/publicIntakeClient.service.js';
import applyClientRoiCompletion from '../services/clientRoiCompletion.service.js';
import { getClientIpAddress } from '../utils/ipAddress.util.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import Client from '../models/Client.model.js';
import StorageService from '../services/storage.service.js';
import DocumentEncryptionService from '../services/documentEncryption.service.js';
import EmailService from '../services/email.service.js';
import EmailTemplate from '../models/EmailTemplate.model.js';
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
import { logAuditEvent } from '../services/auditEvent.service.js';
import {
  applySmartSchoolRoiAccessDecisions,
  buildSmartSchoolRoiContext,
  buildSmartSchoolRoiHtml,
  isSmartSchoolRoiForm,
  normalizeSmartSchoolRoiResponse,
  validateSmartSchoolRoiResponse
} from '../services/smartSchoolRoi.service.js';

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

const PACKET_EMAIL_DEFAULT_TEMPLATE_TYPE = 'intake_packet_default';
const SCHOOL_PACKET_EMAIL_DEFAULT_TEMPLATE_TYPE = 'school_full_intake_packet_default';

const renderTemplateString = (template, params = {}) => {
  let rendered = String(template || '');
  Object.entries(params || {}).forEach(([key, value]) => {
    const safe = String(value ?? '');
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), safe);
  });
  return rendered;
};

const toSimpleHtmlEmail = (text) => `
  <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
    ${String(text || '')
      .split('\n')
      .map((line) => `<p>${escapeHtml(line || '').replace(/^\s+|\s+$/g, '') || '&nbsp;'}</p>`)
      .join('')}
  </div>
`.trim();

const resolvePacketEmailTemplateType = (link, customMessages = {}) => {
  const explicitType = String(customMessages?.completionEmailTemplateType || '').trim();
  if (explicitType) return explicitType;
  const scope = String(link?.scope_type || '').trim().toLowerCase();
  return scope === 'school' ? SCHOOL_PACKET_EMAIL_DEFAULT_TEMPLATE_TYPE : PACKET_EMAIL_DEFAULT_TEMPLATE_TYPE;
};

const resolvePacketCompletionEmailContent = async ({
  link,
  agencyId = null,
  signerName,
  signerEmail,
  clientCount,
  primaryClientName,
  schoolName,
  downloadUrl,
  expiresInDays = 14
}) => {
  const customMessages = link?.custom_messages && typeof link.custom_messages === 'object'
    ? link.custom_messages
    : {};
  const selectedTemplateId = Number(customMessages?.completionEmailTemplateId || 0) || null;
  const selectedTemplateType = resolvePacketEmailTemplateType(link, customMessages);
  let selectedTemplate = null;

  if (selectedTemplateId) {
    selectedTemplate = await EmailTemplate.findById(selectedTemplateId);
    if (selectedTemplate && agencyId && selectedTemplate.agency_id && Number(selectedTemplate.agency_id) !== Number(agencyId)) {
      selectedTemplate = null;
    }
  }
  if (!selectedTemplate && selectedTemplateType && agencyId) {
    selectedTemplate = await EmailTemplate.findByTypeAndAgency(selectedTemplateType, agencyId);
  }

  const params = {
    SIGNER_NAME: String(signerName || '').trim() || 'Signer',
    SIGNER_EMAIL: String(signerEmail || '').trim() || '',
    CLIENT_NAME: String(primaryClientName || '').trim() || '',
    CLIENT_COUNT: Number(clientCount || 0) || 1,
    CLIENT_SUMMARY: Number(clientCount || 0) > 1
      ? `Clients: ${Number(clientCount || 0)}`
      : (String(primaryClientName || '').trim() ? `Client: ${String(primaryClientName || '').trim()}` : ''),
    SCHOOL_NAME: String(schoolName || '').trim() || 'School',
    DOWNLOAD_URL: String(downloadUrl || '').trim(),
    LINK_EXPIRES_DAYS: Number(expiresInDays || 14),
    LINK_EXPIRY_DAYS: Number(expiresInDays || 14)
  };

  const fallbackSubject = 'Your signed intake packet';
  const fallbackText = `${params.CLIENT_SUMMARY ? `${params.CLIENT_SUMMARY}\n\n` : ''}Your intake packet is ready. Download here:\n\n${params.DOWNLOAD_URL}\n\nThis link expires in ${params.LINK_EXPIRES_DAYS} days.`;

  const customSubject = String(customMessages?.completionEmailSubject || '').trim();
  const customBody = String(customMessages?.completionEmailBody || '').trim();

  const subjectTemplate = customSubject || selectedTemplate?.subject || fallbackSubject;
  const bodyTemplate = customBody || selectedTemplate?.body || fallbackText;

  const subject = renderTemplateString(subjectTemplate, params).trim() || fallbackSubject;
  const text = renderTemplateString(bodyTemplate, params).trim() || fallbackText;
  const html = selectedTemplate?.body || customBody
    ? toSimpleHtmlEmail(text)
    : `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        ${params.CLIENT_COUNT > 1 ? `<p><strong>Clients:</strong> ${params.CLIENT_COUNT}</p>` : (params.CLIENT_NAME ? `<p><strong>Client:</strong> ${escapeHtml(params.CLIENT_NAME)}</p>` : '')}
        <p>Your intake packet is ready.</p>
        <p><a href="${escapeHtml(params.DOWNLOAD_URL)}" style="display:inline-block;padding:10px 14px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px;">Download Signed Packet</a></p>
        <p style="color:#777;">This link expires in ${params.LINK_EXPIRES_DAYS} days.</p>
      </div>
    `.trim();

  return {
    subject,
    text,
    html,
    templateId: selectedTemplate?.id || null,
    templateType: selectedTemplate?.type || selectedTemplateType || null
  };
};

const resolveIntakeSenderIdentity = async ({ organizationId, scopeType, agencyId: explicitAgencyId = null }) => {
  const agencyId = Number(explicitAgencyId || organizationId);
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

const resolveAbsoluteAssetUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const backendBase = String(
    process.env.BACKEND_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    process.env.CORS_ORIGIN ||
    ''
  ).replace(/\/$/, '');
  if (!backendBase) return '';
  if (raw.startsWith('/')) return `${backendBase}${raw}`;
  return `${backendBase}/${raw}`;
};

const applyIdentitySignatureBlock = ({ identity, text = '', html = '' }) => {
  if (!identity) return { text, html };
  const imageUrl = resolveAbsoluteAssetUrl(identity.signature_image_url || identity.signature_image_path);
  if (!imageUrl) return { text, html };
  const altText = String(identity.signature_alt_text || identity.display_name || 'Signature').trim() || 'Signature';
  return {
    text: `${String(text || '').trim()}\n\n[Signature image: ${imageUrl}]`.trim(),
    html: `${String(html || '').trim()}
      <div style="margin-top: 14px;">
        <img
          src="${escapeHtml(imageUrl)}"
          alt="${escapeHtml(altText)}"
          style="max-width: 360px; width: auto; height: auto; display: block; border: 0;"
        />
      </div>`.trim()
  };
};

const resolveFallbackSignatureIdentity = async ({ organizationId, scopeType, agencyId: explicitAgencyId = null }) => {
  const agencyId = Number(explicitAgencyId || organizationId);
  if (!agencyId) return null;
  const scope = String(scopeType || '').trim().toLowerCase();
  const keys = scope === 'school'
    ? ['school_intake', 'intake', 'notifications', 'system']
    : ['intake', 'notifications', 'system'];
  const list = await EmailSenderIdentity.list({ agencyId, includePlatformDefaults: true, onlyActive: true });
  const withSignature = (list || []).filter(
    (i) => String(i?.signature_image_url || i?.signature_image_path || '').trim()
  );
  if (!withSignature.length) return null;
  for (const key of keys) {
    const match = withSignature.find((i) => String(i?.identity_key || '').trim() === key);
    if (match) return match;
  }
  return withSignature[0] || null;
};

const resolvePublicIntakeContext = async (publicKey) => {
  const key = String(publicKey || '').trim();
  if (!key) return { link: null, issuedRoiLink: null, boundClient: null };
  const directLink = await IntakeLink.findByPublicKey(key);
  if (directLink) {
    return {
      link: directLink,
      issuedRoiLink: null,
      boundClient: null
    };
  }
  const issuedRoiLink = await ClientSchoolRoiSigningLink.findByPublicKey(key);
  if (!issuedRoiLink) {
    return { link: null, issuedRoiLink: null, boundClient: null };
  }
  const link = await IntakeLink.findById(issuedRoiLink.intake_link_id);
  if (!link) {
    return { link: null, issuedRoiLink: null, boundClient: null };
  }
  let boundClient = null;
  if (issuedRoiLink.client_id) {
    try {
      boundClient = await Client.findById(issuedRoiLink.client_id, { includeSensitive: true });
    } catch {
      boundClient = null;
    }
  }
  return { link, issuedRoiLink, boundClient };
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
    const { link } = await resolvePublicIntakeContext(publicKey);
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
  const forAll = String(process.env.RECAPTCHA_REQUIRED_FOR_ALL || '').toLowerCase() === 'true';
  if (forAll) return true;
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

const isLocalRecaptchaBypassRequest = (req) => {
  const host = String(req.get('host') || '').toLowerCase();
  const origin = String(req.get('origin') || req.get('referer') || '').toLowerCase();
  return host.includes('localhost') || host.includes('127.0.0.1') || origin.includes('localhost') || origin.includes('127.0.0.1');
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

const resolveIntakeOrgContext = async (link, { issuedRoiLink = null, boundClient = null } = {}) => {
  if (!link) return { organization: null, agency: null };

  const scope = String(link.scope_type || 'agency');
  const isSmartRoi = String(link.form_type || '').trim().toLowerCase() === 'smart_school_roi';
  const smartSchoolOrgId = isSmartRoi
    ? (
        Number(issuedRoiLink?.school_organization_id || 0)
        || Number(boundClient?.organization_id || 0)
        || Number(boundClient?.school_organization_id || 0)
        || Number(link.organization_id || 0)
      )
    : 0;
  const orgId = isSmartRoi
    ? (smartSchoolOrgId || null)
    : (link.organization_id ? parseInt(link.organization_id, 10) : null);
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

const hasProgrammedSchoolRoiStep = (link) => {
  const steps = Array.isArray(link?.intake_steps) ? link.intake_steps : [];
  return steps.some((step) => String(step?.type || '').trim().toLowerCase() === 'school_roi');
};

const resolveSmartSchoolRoiTemplate = async ({ roiContext, templates }) => {
  let selectedTemplate = Array.isArray(templates)
    ? templates.find((template) => Number(template?.id || 0) === Number(roiContext?.documentTemplate?.id || 0))
    : null;
  if (!selectedTemplate) {
    const schoolOrgId = Number(roiContext?.school?.id || 0) || null;
    const schoolRoiTemplatesResult = await DocumentTemplate.findAll({
      documentType: 'school_roi',
      isActive: true,
      includeArchived: false,
      limit: 200,
      offset: 0
    });
    const schoolRoiTemplates = Array.isArray(schoolRoiTemplatesResult?.data) ? schoolRoiTemplatesResult.data : [];
    selectedTemplate = schoolRoiTemplates.find((template) => Number(template?.organization_id || 0) === schoolOrgId)
      || schoolRoiTemplates[0]
      || null;
  }
  if (!selectedTemplate) {
    const anyTemplateResult = await DocumentTemplate.findAll({
      isActive: true,
      includeArchived: false,
      limit: 200,
      offset: 0
    });
    const anyTemplates = Array.isArray(anyTemplateResult?.data) ? anyTemplateResult.data : [];
    selectedTemplate = anyTemplates[0] || null;
  }
  return selectedTemplate || null;
};

export const getPublicIntakeLink = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const { link, issuedRoiLink, boundClient } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const templates = await loadAllowedTemplates(link);
    const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient });
    const needsCaptcha = requiresCaptchaForLink(organization, agency);
    const shouldIncludeRoiContext = isSmartSchoolRoiForm(link) || hasProgrammedSchoolRoiStep(link);
    const roiContext = shouldIncludeRoiContext
      ? await buildSmartSchoolRoiContext({
          link,
          boundClient,
          organization,
          agency,
          templates
        })
      : null;
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
            siteKey: process.env.RECAPTCHA_SITE_KEY_INTAKE || null,
            useEnterprise: !!config.recaptcha?.enterpriseApiKey,
            forceWidget: true
          }
        : { siteKey: null, useEnterprise: false, forceWidget: false },
      organization: toOrgPayload(organization),
      agency: toOrgPayload(agency),
      issuedLink: issuedRoiLink ? {
        id: issuedRoiLink.id,
        status: issuedRoiLink.status || 'issued',
        signed_at: issuedRoiLink.signed_at || null,
        client_id: issuedRoiLink.client_id,
        intake_link_id: issuedRoiLink.intake_link_id
      } : null,
      boundClient: boundClient ? {
        id: boundClient.id,
        full_name: boundClient.full_name || null,
        initials: boundClient.initials || null,
        organization_id: boundClient.organization_id || null,
        organization_name: boundClient.organization_name || null,
        date_of_birth: boundClient.date_of_birth || boundClient.dob || null
      } : null,
      roiContext,
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        document_type: t.document_type,
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
    console.error('[publicIntake] getPublicIntakeLink error', {
      publicKey: req.params?.publicKey,
      message: error?.message,
      stack: error?.stack
    });
    next(error);
  }
};

export const createPublicIntakeSession = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    const publicKey = String(req.params.publicKey || '').trim();
    const { link, issuedRoiLink, boundClient } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }
    const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient });
    const needsCaptcha = requiresCaptchaForLink(organization, agency);
    const intakeSiteKey = String(process.env.RECAPTCHA_SITE_KEY_INTAKE || '').trim();
    const captchaConfigured = !!intakeSiteKey && (!!config.recaptcha?.secretKey || !!config.recaptcha?.enterpriseApiKey);
    const isLocalBypass = isLocalRecaptchaBypassRequest(req);
    if (needsCaptcha && config.nodeEnv === 'production' && !captchaConfigured) {
      return res.status(500).json({ error: { message: 'Captcha is not configured' } });
    }
    if (needsCaptcha && captchaConfigured) {
      if (isLocalBypass) {
        console.info('[recaptcha] bypassing localhost verification for public intake begin');
      } else {
        const captchaToken = String(req.body?.captchaToken || '').trim();
        if (!captchaToken) {
          return res.status(400).json({ error: { message: 'Captcha is required' } });
        }
        const verification = await verifyRecaptchaV3({
          token: captchaToken,
          remoteip: getClientIpAddress(req),
          expectedAction: 'public_intake_begin',
          userAgent: req.get('user-agent'),
          siteKeyOverride: intakeSiteKey || undefined,
          checkboxKey: true
        });
        if (!verification.ok) {
          console.warn('[recaptcha] public intake begin verification failed', {
            reason: verification.reason,
            errorCodes: verification.errorCodes,
            action: verification.action,
            invalidReason: verification.invalidReason
          });
          const msg = config.nodeEnv !== 'production'
            ? `Captcha verification failed: ${verification.reason}${verification.invalidReason ? ` (${verification.invalidReason})` : ''}. Check backend logs.`
            : 'Captcha verification failed. Please complete the captcha again and try again.';
          return res.status(400).json({ error: { message: msg } });
        }
        const minScoreRaw = process.env.RECAPTCHA_MIN_SCORE_INTAKE ?? config.recaptcha?.minScore ?? 0.3;
        const effectiveMinScore = Number.isFinite(Number(minScoreRaw)) ? Number(minScoreRaw) : 0.3;
        if (verification.score !== null && verification.score < effectiveMinScore) {
          console.warn('[recaptcha] public intake begin score too low', {
            score: verification.score,
            minScore: effectiveMinScore
          });
          if (config.nodeEnv === 'production') {
            return res.status(400).json({ error: { message: 'Captcha verification failed. Please try again.' } });
          }
        }
      }
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
      retentionExpiresAt,
      clientId: issuedRoiLink?.client_id || null
    });

    if (issuedRoiLink?.id) {
      await ClientSchoolRoiSigningLink.markStarted({
        id: issuedRoiLink.id,
        intakeSubmissionId: submission?.id || null
      });
      if (isSmartSchoolRoiForm(link)) {
        const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient });
        const roiContext = await buildSmartSchoolRoiContext({
          link,
          boundClient,
          organization,
          agency,
          templates: await loadAllowedTemplates(link)
        });
        await ClientSchoolRoiSigningLink.updatePayload({
          id: issuedRoiLink.id,
          intakeSubmissionId: submission?.id || null,
          roiContext,
          roiResponse: null
        });
      }
    }

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
    const { link, issuedRoiLink } = await resolvePublicIntakeContext(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
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
        let downloadUrl = null;
        if (submission.combined_pdf_path) {
          try {
            downloadUrl = await StorageService.getSignedUrl(submission.combined_pdf_path, 60 * 24 * 14);
          } catch {
            downloadUrl = null;
          }
        }
        return res.status(200).json({
          success: true,
          alreadyCompleted: true,
          message: 'This release session is already completed.',
          submission,
          downloadUrl
        });
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
        session_token: sessionToken || null,
        client_id: issuedRoiLink?.client_id || submission.client_id || null
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
        retentionExpiresAt,
        clientId: issuedRoiLink?.client_id || null
      });
    }

    if (issuedRoiLink?.id) {
      await ClientSchoolRoiSigningLink.markStarted({
        id: issuedRoiLink.id,
        intakeSubmissionId: submission?.id || null
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
    const { link } = await resolvePublicIntakeContext(publicKey);
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
    const { link } = await resolvePublicIntakeContext(publicKey);
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

    const { link } = await resolvePublicIntakeContext(publicKey);
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
    const emailDelivery = {
      attempted: false,
      sent: false,
      error: null
    };
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const publicKey = String(req.params.publicKey || '').trim();
    const { link, issuedRoiLink } = await resolvePublicIntakeContext(publicKey);
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
        if (issuedRoiLink?.id) {
          let phiDocs = [];
          try {
            phiDocs = await ClientPhiDocument.listByIntakeSubmissionId(submissionId);
          } catch {
            phiDocs = [];
          }
          await ClientSchoolRoiSigningLink.markCompleted({
            id: issuedRoiLink.id,
            intakeSubmissionId: submissionId,
            signedAt: submission.submitted_at || submission.updated_at || new Date(),
            completedClientPhiDocumentId: phiDocs?.[0]?.id || null
          });
        }
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

    if (isSmartSchoolRoiForm(link)) {
      const signatureData = String(req.body?.signatureData || '').trim();
      if (!signatureData) {
        return res.status(400).json({ error: { message: 'Signature is required to complete this release.' } });
      }
      if (!updatedSubmission?.client_id) {
        return res.status(400).json({ error: { message: 'Smart school ROI links must be bound to a client.' } });
      }

      const boundClient = await Client.findById(updatedSubmission.client_id, { includeSensitive: true });
      if (!boundClient?.id) {
        return res.status(404).json({ error: { message: 'Bound client not found.' } });
      }

      const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient });
      const roiContext = await buildSmartSchoolRoiContext({
        link,
        boundClient,
        organization,
        agency,
        templates
      });
      const selectedTemplate = await resolveSmartSchoolRoiTemplate({ roiContext, templates });
      if (!selectedTemplate?.id) {
        return res.status(400).json({ error: { message: 'No active document template is available for Smart School ROI finalization.' } });
      }
      const effectiveRoiContext = roiContext?.documentTemplate?.id
        ? roiContext
        : {
            ...roiContext,
            documentTemplate: {
              id: Number(selectedTemplate.id),
              name: selectedTemplate.name || 'School Release of Information',
              documentType: selectedTemplate.document_type || 'school_roi'
            }
          };

      const roiResponse = normalizeSmartSchoolRoiResponse({
        roiContext: effectiveRoiContext,
        intakeData,
        signedAt: now
      });
      const roiValidation = validateSmartSchoolRoiResponse(roiResponse);
      if (!roiValidation.valid) {
        return res.status(400).json({
          error: {
            message: `Missing required smart ROI responses: ${roiValidation.missing.join(', ')}`
          }
        });
      }

      const signer = buildSignerFromSubmission(updatedSubmission);
      const workflowData = buildWorkflowData({ submission: { ...updatedSubmission, submitted_at: now } });
      const auditTrail = buildAuditTrail({
        link,
        submission: {
          ...updatedSubmission,
          submitted_at: now,
          client_name: roiResponse.clientFullName || boundClient.full_name || null
        }
      });
      const signedResult = await PublicIntakeSigningService.generateSignedDocument({
        template: {
          ...selectedTemplate,
          template_type: 'html',
          html_content: buildSmartSchoolRoiHtml({
            roiContext: effectiveRoiContext,
            response: roiResponse,
            signedAt: now
          }),
          document_action_type: 'signature'
        },
        signatureData,
        signer,
        auditTrail: {
          ...auditTrail,
          smartSchoolRoi: true,
          roiResponse
        },
        workflowData,
        submissionId,
        fieldDefinitions: [],
        fieldValues: {}
      });

      const intakeClientRow = await IntakeSubmissionClient.create({
        intakeSubmissionId: submissionId,
        clientId: boundClient.id,
        fullName: roiResponse.clientFullName || boundClient.full_name || boundClient.initials || `Client ${boundClient.id}`,
        initials: boundClient.initials || null,
        contactPhone: boundClient.contact_phone || null
      });
      if (intakeClientRow?.id) {
        await IntakeSubmissionClient.updateById(intakeClientRow.id, {
          bundle_pdf_path: signedResult.storagePath,
          bundle_pdf_hash: signedResult.pdfHash
        });
      }

      const documentRow = await IntakeSubmissionDocument.create({
        intakeSubmissionId: submissionId,
        clientId: boundClient.id,
        documentTemplateId: selectedTemplate.id,
        signedPdfPath: signedResult.storagePath,
        pdfHash: signedResult.pdfHash,
        signedAt: now,
        auditTrail: {
          ...auditTrail,
          documentReference: signedResult.referenceNumber || null,
          documentName: selectedTemplate.name || null,
          smartSchoolRoi: true,
          roiResponse,
          signatureData
        }
      });

      const schoolOrganizationId =
        Number(boundClient.organization_id || link.organization_id || organization?.id || 0) || null;
      const phiDoc = await ClientPhiDocument.create({
        clientId: boundClient.id,
        agencyId: boundClient.agency_id || agency?.id || null,
        schoolOrganizationId: schoolOrganizationId || boundClient.agency_id || agency?.id || null,
        intakeSubmissionId: submissionId,
        storagePath: signedResult.storagePath,
        originalName: `${selectedTemplate.name || 'School ROI'} (Signed)`,
        mimeType: 'application/pdf',
        uploadedByUserId: null,
        scanStatus: 'clean',
        expiresAt: retentionExpiresAt
      });
      await PhiDocumentAuditLog.create({
        documentId: phiDoc.id,
        clientId: boundClient.id,
        action: 'uploaded',
        actorUserId: null,
        actorLabel: 'public_intake',
        ipAddress: updatedSubmission.ip_address || null,
        metadata: {
          submissionId,
          templateId: selectedTemplate.id,
          smartSchoolRoi: true
        }
      });

      const accessUpdates = await applySmartSchoolRoiAccessDecisions({
        clientId: boundClient.id,
        schoolOrganizationId: schoolOrganizationId || 0,
        response: roiResponse,
        actorUserId: null
      });

      try {
        await applyClientRoiCompletion({
          clientId: boundClient.id,
          signedAt: now,
          actorUserId: null
        });
      } catch (error) {
        console.error('applyClientRoiCompletion failed', {
          clientId: boundClient.id,
          submissionId,
          signingLinkId: issuedRoiLink?.id || null,
          error: error?.message || error
        });
      }

      await IntakeSubmission.updateById(submissionId, {
        combined_pdf_path: signedResult.storagePath,
        combined_pdf_hash: signedResult.pdfHash
      });

      if (issuedRoiLink?.id) {
        await ClientSchoolRoiSigningLink.updatePayload({
          id: issuedRoiLink.id,
          intakeSubmissionId: submissionId,
          roiContext,
          roiResponse,
          accessAppliedAt: now
        });
        await ClientSchoolRoiSigningLink.markCompleted({
          id: issuedRoiLink.id,
          intakeSubmissionId: submissionId,
          signedAt: now,
          completedClientPhiDocumentId: phiDoc.id
        });
      }

      await logAuditEvent(req, {
        actionType: 'smart_school_roi_permissions_applied',
        agencyId: boundClient.agency_id || agency?.id || null,
        metadata: {
          clientId: boundClient.id,
          schoolOrganizationId,
          issuedRoiLinkId: issuedRoiLink?.id || null,
          packetReleaseAllowed: roiResponse.packetReleaseAllowed,
          schoolSchedulingSafetyLogisticsAuthorized: roiResponse.schoolSchedulingSafetyLogisticsAuthorized === true,
          approvedStaffCount: roiResponse.approvedStaffCount || 0,
          deniedStaffCount: roiResponse.deniedStaffCount || 0,
          accessUpdates
        }
      });

      const downloadUrl = await StorageService.getSignedUrl(signedResult.storagePath, 60 * 24 * 14);
      if (updatedSubmission.signer_email && downloadUrl) {
        emailDelivery.attempted = true;
        const signerName = String(updatedSubmission.signer_name || '').trim() || 'Signer';
        const clientName = String(roiResponse.clientFullName || boundClient.full_name || '').trim() || 'Client';
        const schoolName = String(roiContext?.school?.name || '').trim() || 'School';
        const subject = `${clientName} - School ROI Completed`;
        const text = `${signerName}, your school release of information is complete.\n\nClient: ${clientName}\nSchool: ${schoolName}\n\nDownload your signed copy:\n${downloadUrl}\n\nThis link expires in 14 days.`;
        const html = `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
            <p>${escapeHtml(signerName)}, your school release of information is complete.</p>
            <p><strong>Client:</strong> ${escapeHtml(clientName)}<br/><strong>School:</strong> ${escapeHtml(schoolName)}</p>
            <p><a href="${downloadUrl}" style="display:inline-block;padding:10px 14px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px;">Download Signed School ROI</a></p>
            <p style="color:#777;">This link expires in 14 days.</p>
          </div>
        `.trim();
        try {
          const identity = await resolveIntakeSenderIdentity({
            organizationId: link?.organization_id || null,
            scopeType: link?.scope_type || null,
            agencyId: boundClient?.agency_id || agency?.id || null
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
            const fallbackSignatureIdentity = await resolveFallbackSignatureIdentity({
              organizationId: link?.organization_id || null,
              scopeType: link?.scope_type || null,
              agencyId: boundClient?.agency_id || agency?.id || null
            });
            const signedContent = applyIdentitySignatureBlock({
              identity: fallbackSignatureIdentity,
              text,
              html
            });
            await EmailService.sendEmail({
              to: updatedSubmission.signer_email,
              subject,
              text: signedContent.text,
              html: signedContent.html,
              fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || 'People Operations',
              fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
              replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
              attachments: null,
              source: 'auto',
              agencyId: boundClient?.agency_id || agency?.id || null
            });
          }
          emailDelivery.sent = true;
        } catch {
          emailDelivery.error = 'send_failed';
        }
      }
      return res.json({
        success: true,
        submission: await IntakeSubmission.findById(submissionId),
        documents: [documentRow],
        downloadUrl,
        emailDelivery,
        clientBundles: [{
          clientId: boundClient.id,
          clientName: roiResponse.clientFullName || boundClient.full_name || null,
          filename: `school-roi-${boundClient.id}.pdf`,
          downloadUrl
        }]
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

    // If the intake sequence includes an embedded school_roi step, generate and append
    // the Smart School ROI signed artifact into the final packet bundle.
    if (hasProgrammedSchoolRoiStep(link) && intakeData?.smartSchoolRoi) {
      try {
        const embeddedSignatureData = String(intakeData?.smartSchoolRoi?.signatureData || '').trim();
        if (embeddedSignatureData) {
          let boundClient = null;
          if (updatedSubmission?.client_id) {
            try {
              boundClient = await Client.findById(updatedSubmission.client_id, { includeSensitive: true });
            } catch {
              boundClient = null;
            }
          }
          const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient });
          const roiContext = await buildSmartSchoolRoiContext({
            link,
            boundClient,
            organization,
            agency,
            templates
          });
          const selectedTemplate = await resolveSmartSchoolRoiTemplate({ roiContext, templates });
          if (selectedTemplate?.id) {
            const effectiveRoiContext = roiContext?.documentTemplate?.id
              ? roiContext
              : {
                  ...roiContext,
                  documentTemplate: {
                    id: Number(selectedTemplate.id),
                    name: selectedTemplate.name || 'School Release of Information',
                    documentType: selectedTemplate.document_type || 'school_roi'
                  }
                };
            const roiResponse = normalizeSmartSchoolRoiResponse({
              roiContext: effectiveRoiContext,
              intakeData,
              signedAt: now
            });
            const roiValidation = validateSmartSchoolRoiResponse(roiResponse);
            if (roiValidation.valid) {
              const roiAuditTrail = {
                ...buildAuditTrail({
                  link,
                  submission: {
                    ...updatedSubmission,
                    submitted_at: now,
                    client_name: roiResponse.clientFullName || null
                  }
                }),
                smartSchoolRoi: true,
                embeddedStep: true,
                roiResponse,
                signatureData: embeddedSignatureData
              };
              const roiSignedResult = await PublicIntakeSigningService.generateSignedDocument({
                template: {
                  ...selectedTemplate,
                  template_type: 'html',
                  html_content: buildSmartSchoolRoiHtml({
                    roiContext: effectiveRoiContext,
                    response: roiResponse,
                    signedAt: now
                  }),
                  document_action_type: 'signature'
                },
                signatureData: embeddedSignatureData,
                signer,
                auditTrail: roiAuditTrail,
                workflowData,
                submissionId,
                fieldDefinitions: [],
                fieldValues: {}
              });
              const embeddedClientId = Number(updatedSubmission?.client_id || rawClients?.[0]?.id || 0) || null;
              const embeddedDoc = await IntakeSubmissionDocument.create({
                intakeSubmissionId: submissionId,
                clientId: embeddedClientId,
                documentTemplateId: selectedTemplate.id,
                signedPdfPath: roiSignedResult.storagePath,
                pdfHash: roiSignedResult.pdfHash,
                signedAt: now,
                auditTrail: {
                  ...roiAuditTrail,
                  documentReference: roiSignedResult.referenceNumber || null,
                  documentName: selectedTemplate.name || null
                }
              });
              signedDocsOrdered.push(embeddedDoc);
              if (roiSignedResult.storagePath) {
                pdfPaths.push(roiSignedResult.storagePath);
              }
            } else {
              console.warn('[publicIntake] embedded school_roi payload failed validation; skipping packet include', {
                submissionId,
                missing: roiValidation.missing
              });
            }
          }
        }
      } catch (embeddedRoiError) {
        console.error('[publicIntake] failed generating embedded school_roi document', {
          submissionId,
          error: embeddedRoiError?.message || embeddedRoiError
        });
      }
    }

    // Backward-compatible submit path: include embedded school_roi artifact in the
    // merged intake packet when the step is present and captured.
    if (hasProgrammedSchoolRoiStep(link) && intakeData?.smartSchoolRoi) {
      try {
        const embeddedSignatureData = String(intakeData?.smartSchoolRoi?.signatureData || '').trim();
        if (embeddedSignatureData) {
          let boundClient = null;
          if (updatedSubmission?.client_id) {
            try {
              boundClient = await Client.findById(updatedSubmission.client_id, { includeSensitive: true });
            } catch {
              boundClient = null;
            }
          }
          const { organization, agency } = await resolveIntakeOrgContext(link, { boundClient });
          const roiContext = await buildSmartSchoolRoiContext({
            link,
            boundClient,
            organization,
            agency,
            templates
          });
          const selectedTemplate = await resolveSmartSchoolRoiTemplate({ roiContext, templates });
          if (selectedTemplate?.id) {
            const effectiveRoiContext = roiContext?.documentTemplate?.id
              ? roiContext
              : {
                  ...roiContext,
                  documentTemplate: {
                    id: Number(selectedTemplate.id),
                    name: selectedTemplate.name || 'School Release of Information',
                    documentType: selectedTemplate.document_type || 'school_roi'
                  }
                };
            const roiResponse = normalizeSmartSchoolRoiResponse({
              roiContext: effectiveRoiContext,
              intakeData,
              signedAt: now
            });
            const roiValidation = validateSmartSchoolRoiResponse(roiResponse);
            if (roiValidation.valid) {
              const roiAuditTrail = {
                ...buildAuditTrail({
                  link,
                  submission: {
                    ...updatedSubmission,
                    submitted_at: now,
                    client_name: roiResponse.clientFullName || null
                  }
                }),
                smartSchoolRoi: true,
                embeddedStep: true,
                roiResponse,
                signatureData: embeddedSignatureData
              };
              const roiSignedResult = await PublicIntakeSigningService.generateSignedDocument({
                template: {
                  ...selectedTemplate,
                  template_type: 'html',
                  html_content: buildSmartSchoolRoiHtml({
                    roiContext: effectiveRoiContext,
                    response: roiResponse,
                    signedAt: now
                  }),
                  document_action_type: 'signature'
                },
                signatureData: embeddedSignatureData,
                signer,
                auditTrail: roiAuditTrail,
                workflowData,
                submissionId,
                fieldDefinitions: [],
                fieldValues: {}
              });
              const embeddedClientId = Number(updatedSubmission?.client_id || rawClients?.[0]?.id || 0) || null;
              const embeddedDoc = await IntakeSubmissionDocument.create({
                intakeSubmissionId: submissionId,
                clientId: embeddedClientId,
                documentTemplateId: selectedTemplate.id,
                signedPdfPath: roiSignedResult.storagePath,
                pdfHash: roiSignedResult.pdfHash,
                signedAt: now,
                auditTrail: {
                  ...roiAuditTrail,
                  documentReference: roiSignedResult.referenceNumber || null,
                  documentName: selectedTemplate.name || null
                }
              });
              signedDocs.push(embeddedDoc);
              if (roiSignedResult.storagePath) {
                pdfPaths.push(roiSignedResult.storagePath);
              }
            } else {
              console.warn('[publicIntake] embedded school_roi payload failed validation; skipping packet include', {
                submissionId,
                missing: roiValidation.missing
              });
            }
          }
        }
      } catch (embeddedRoiError) {
        console.error('[publicIntake] failed generating embedded school_roi document (submit path)', {
          submissionId,
          error: embeddedRoiError?.message || embeddedRoiError
        });
      }
    }

    const answersPdf = await buildAnswersPdfBuffer({ link, intakeData });

    let rawClients = createdClients.length
      ? createdClients.map((c) => ({ id: c.id, fullName: c.full_name || c.initials || '', initials: c.initials, contactPhone: c.contact_phone }))
      : (Array.isArray(req.body?.clients) ? req.body.clients : (req.body?.client ? [req.body.client] : []));
    if (!link.create_client && updatedSubmission?.client_id) {
      try {
        const boundClient = await Client.findById(updatedSubmission.client_id, { includeSensitive: true });
        if (boundClient?.id) {
          rawClients = [{
            id: boundClient.id,
            fullName: boundClient.full_name || boundClient.initials || `Client ${boundClient.id}`,
            initials: boundClient.initials || null,
            contactPhone: boundClient.contact_phone || null
          }];
        }
      } catch {
        // fall back to submitted payload below
      }
    }
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

    let roiCompletionPhiDocument = null;
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
            if (!roiCompletionPhiDocument && issuedRoiLink?.id) {
              roiCompletionPhiDocument = phiDoc;
            }
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

    if (issuedRoiLink?.id && updatedSubmission?.client_id) {
      try {
        await applyClientRoiCompletion({
          clientId: updatedSubmission.client_id,
          signedAt: now,
          actorUserId: null
        });
      } catch (error) {
        console.error('applyClientRoiCompletion failed', {
          clientId: updatedSubmission.client_id,
          submissionId,
          signingLinkId: issuedRoiLink.id,
          error: error?.message || error
        });
      }
      await ClientSchoolRoiSigningLink.markCompleted({
        id: issuedRoiLink.id,
        intakeSubmissionId: submissionId,
        signedAt: now,
        completedClientPhiDocumentId: roiCompletionPhiDocument?.id || null
      });
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
        emailDelivery.attempted = true;
        const clientCount = rawClients.length || 1;
        const { organization, agency } = await resolveIntakeOrgContext(link, { boundClient: null });
        const packetEmail = await resolvePacketCompletionEmailContent({
          link,
          agencyId: link?.agency_id || agency?.id || null,
          signerName: updatedSubmission.signer_name || '',
          signerEmail: updatedSubmission.signer_email || '',
          clientCount,
          primaryClientName,
          schoolName: organization?.name || '',
          downloadUrl,
          expiresInDays: 14
        });
        try {
          const identity = await resolveIntakeSenderIdentity({
            organizationId: link?.organization_id || null,
            scopeType: link?.scope_type || null
          });
          if (identity?.id) {
            await sendEmailFromIdentity({
              senderIdentityId: identity.id,
              to: updatedSubmission.signer_email,
              subject: packetEmail.subject,
              text: packetEmail.text,
              html: packetEmail.html,
              source: 'auto'
            });
          } else {
            const fallbackSignatureIdentity = await resolveFallbackSignatureIdentity({
              organizationId: link?.organization_id || null,
              scopeType: link?.scope_type || null
            });
            const signedPacketEmail = applyIdentitySignatureBlock({
              identity: fallbackSignatureIdentity,
              text: packetEmail.text,
              html: packetEmail.html
            });
            await EmailService.sendEmail({
              to: updatedSubmission.signer_email,
              subject: packetEmail.subject,
              text: signedPacketEmail.text,
              html: signedPacketEmail.html,
              fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || 'People Operations',
              fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
              replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
              attachments: null,
              source: 'auto',
              agencyId: link?.organization_id || null
            });
          }
          emailDelivery.sent = true;
        } catch {
          emailDelivery.error = 'send_failed';
        }
      } else if (updatedSubmission.signer_email && !EmailService.isConfigured()) {
        emailDelivery.attempted = true;
        emailDelivery.sent = false;
        emailDelivery.error = 'email_not_configured';
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
      emailDelivery,
      clientBundles
    });
  } catch (error) {
    next(error);
  }
};

export const submitPublicIntake = async (req, res, next) => {
  try {
    const emailDelivery = {
      attempted: false,
      sent: false,
      error: null
    };
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const publicKey = String(req.params.publicKey || '').trim();
    const { link } = await resolvePublicIntakeContext(publicKey);
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
        emailDelivery.attempted = true;
        const clientCount = rawClients.length || 1;
        const { organization, agency } = await resolveIntakeOrgContext(link, { issuedRoiLink, boundClient: null });
        const packetEmail = await resolvePacketCompletionEmailContent({
          link,
          agencyId: link?.agency_id || agency?.id || null,
          signerName: updatedSubmission.signer_name || '',
          signerEmail: updatedSubmission.signer_email || '',
          clientCount,
          primaryClientName,
          schoolName: organization?.name || '',
          downloadUrl,
          expiresInDays: 14
        });
        try {
          const identity = await resolveIntakeSenderIdentity({
            organizationId: link?.organization_id || null,
            scopeType: link?.scope_type || null
          });
          if (identity?.id) {
            await sendEmailFromIdentity({
              senderIdentityId: identity.id,
              to: updatedSubmission.signer_email,
              subject: packetEmail.subject,
              text: packetEmail.text,
              html: packetEmail.html,
              source: 'auto'
            });
          } else {
            const fallbackSignatureIdentity = await resolveFallbackSignatureIdentity({
              organizationId: link?.organization_id || null,
              scopeType: link?.scope_type || null
            });
            const signedPacketEmail = applyIdentitySignatureBlock({
              identity: fallbackSignatureIdentity,
              text: packetEmail.text,
              html: packetEmail.html
            });
            await EmailService.sendEmail({
              to: updatedSubmission.signer_email,
              subject: packetEmail.subject,
              text: signedPacketEmail.text,
              html: signedPacketEmail.html,
              fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || 'People Operations',
              fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
              replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
              attachments: null,
              source: 'auto',
              agencyId: link?.organization_id || null
            });
          }
          emailDelivery.sent = true;
        } catch {
          emailDelivery.error = 'send_failed';
        }
      } else if (updatedSubmission.signer_email && !EmailService.isConfigured()) {
        emailDelivery.attempted = true;
        emailDelivery.sent = false;
        emailDelivery.error = 'email_not_configured';
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
      emailDelivery,
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

    const { link } = await resolvePublicIntakeContext(publicKey);
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
