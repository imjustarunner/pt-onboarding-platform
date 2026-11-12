import {paperStaffGrantNeedsProcessing} from '../utils/paperStaffGrantReview.js';
import { clientEnrollmentPacketReview } from '../services/clientEnrollmentPacketReview.service.js';
import { canReceiveGuardianConsentRequest } from '../services/schoolRoiGuardianConsent.service.js';
import pool from '../config/database.js';
import { requestSchoolRoiForGuardians } from '../services/schoolRoiGuardianRequests.service.js';
import { clientEmailLabel, portalActionHtml } from '../services/clientPortalEmailContent.js';
import crypto from 'crypto';
import Client from '../models/Client.model.js';
import IntakeSubmissionDocument from '../models/IntakeSubmissionDocument.model.js';
import StorageService from '../services/storage.service.js';
import { isSchoolRoiDocument, schoolRoiAuditTrail } from '../utils/schoolRoiDocument.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import ClientSchoolStaffRoiAccess, {
  getEffectiveSchoolStaffRoiState,
  isRoiExpired
} from '../models/ClientSchoolStaffRoiAccess.model.js';
import { paperPacketRoiExpiresAtYmd } from '../utils/paperPacketRoiExpiry.js';
import SchoolRoiIntakeLinkConfig from '../models/SchoolRoiIntakeLinkConfig.model.js';
import ClientSchoolRoiSigningLink from '../models/ClientSchoolRoiSigningLink.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import ClientGuardianIntakeProfile from '../models/ClientGuardianIntakeProfile.model.js';
import MessageLog from '../models/MessageLog.model.js';
import Notification from '../models/Notification.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import SmsOptInState from '../models/SmsOptInState.model.js';
import VonageService from '../services/vonage.service.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import { resolvePreferredSenderIdentityForSchoolThenAgency } from '../services/emailSenderIdentityResolver.service.js';

export function buildSchoolRoiSigningUrl(publicKey) {
  const key = String(publicKey || '').trim();
  return key ? `https://auricwell.com/intake/${encodeURIComponent(key)}` : null;
}

const BACKOFFICE_NOTIFICATION_AUDIENCE = Object.freeze({
  admin: true,
  schoolStaff: false,
  provider: false,
  supervisor: false,
  clinicalPracticeAssistant: false
});

function isBackofficeManager(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff'].includes(normalized);
}

function normalizeClientType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['basic_nonclinical', 'school', 'learning', 'clinical'].includes(normalized)) return normalized;
  return '';
}

function resolveEffectiveClientTypeForRules(client) {
  const explicit = normalizeClientType(client?.client_type);
  if (explicit) return explicit;
  const orgType = String(client?.organization_type || '').trim().toLowerCase();
  if (orgType === 'school') return 'school';
  if (orgType === 'learning') return 'learning';
  if (orgType === 'program' || orgType === 'clinical') return 'clinical';
  return 'basic_nonclinical';
}

async function requireManagedClient(req, clientId) {
  const client = await Client.findById(clientId, { includeSensitive: true });
  if (!client) {
    return { ok: false, status: 404, message: 'Client not found' };
  }

  if (req.user?.role === 'super_admin') {
    return { ok: true, client };
  }

  const userAgencies = await User.getAgencies(req.user?.id);
  const hasAgencyAccess = (userAgencies || []).some((agency) => Number(agency?.id) === Number(client.agency_id));
  if (!hasAgencyAccess) {
    return { ok: false, status: 403, message: 'You do not have access to this client' };
  }

  return { ok: true, client };
}

function serializeAvailableRoiLink(link, source = {}) {
  return {
    id: Number(link.id),
    title: link.title || `Form ${link.id}`,
    description: link.description || null,
    public_key: link.public_key || null,
    form_type: link.form_type || 'smart_school_roi',
    language_code: link.language_code || 'en',
    documents_count: Array.isArray(link.allowed_document_template_ids) ? link.allowed_document_template_ids.length : 0,
    source_school_organization_id: Number(source.organizationId || link.organization_id || 0) || null,
    source_school_name: source.organizationName || null,
    source_kind: source.kind || 'school'
  };
}

async function signedSchoolRoiDocuments(clientId) {
  return (await IntakeSubmissionDocument.listSignedForClient(clientId))
    .filter(doc => doc.signed_at && doc.signed_pdf_path && isSchoolRoiDocument(doc));
}

export const viewClientSignedSchoolRoi = async (req, res, next) => {
  try {
    if (!isBackofficeManager(req.user?.role)) return res.status(403).json({ error: { message: 'Backoffice access required' } });
    const clientId = Number(req.params.id), documentId = Number(req.params.documentId);
    if (!clientId || !documentId) return res.status(400).json({ error: { message: 'Invalid document or client id' } });
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const doc = (await signedSchoolRoiDocuments(clientId)).find(row => Number(row.id) === documentId);
    if (!doc) return res.status(404).json({ error: { message: 'Signed school ROI not found for this client' } });
    const url = await StorageService.getSignedUrl(doc.signed_pdf_path, 15);
    await logAuditEvent(req, { actionType: 'school_roi_document_viewed', agencyId: access.client.agency_id,
      metadata: { clientId, intakeSubmissionDocumentId: documentId } });
    res.set('Cache-Control', 'no-store').json({ url });
  } catch (error) { next(error); }
};

async function listAvailableSchoolRoiIntakeLinks(schoolOrganizationId) {
  const sid = Number(schoolOrganizationId || 0);
  if (!sid) return [];
  const links = await IntakeLink.findByScope({ scopeType: 'school', organizationId: sid });
  return (links || [])
    .filter((link) => link && link.is_active)
    .filter((link) => String(link.form_type || '').trim().toLowerCase() === 'smart_school_roi')
    .filter((link) => !link.create_client)
    .map((link) => serializeAvailableRoiLink(link, { organizationId: sid, kind: 'school' }));
}

async function resolveSchoolRoiSelection(schoolOrganizationId) {
  let availableLinks = await listAvailableSchoolRoiIntakeLinks(schoolOrganizationId);
  if (!availableLinks.length) {
    const sid = Number(schoolOrganizationId || 0);
    if (sid) {
      const defaultLink = await IntakeLink.create({
        publicKey: crypto.randomBytes(24).toString('hex'),
        title: 'School Release of Information (Default)',
        description: 'System default interactive school release of information.',
        languageCode: 'en',
        scopeType: 'school',
        formType: 'smart_school_roi',
        organizationId: sid,
        isActive: true,
        createClient: false,
        createGuardian: false,
        requiresAssignment: false,
        allowedDocumentTemplateIds: [],
        intakeFields: null,
        intakeSteps: null,
        retentionPolicy: null,
        customMessages: null,
        createdByUserId: null
      });
      if (defaultLink?.id) {
        availableLinks = [serializeAvailableRoiLink(defaultLink, { organizationId: sid, kind: 'school' })];
      }
    }
  }
  const explicitConfig = await SchoolRoiIntakeLinkConfig.findBySchoolOrganizationId(schoolOrganizationId);
  const selectedLink = explicitConfig?.intake_link_id
    ? (availableLinks.find((link) => Number(link.id) === Number(explicitConfig.intake_link_id)) || availableLinks[0] || null)
    : (availableLinks[0] || null);
  return {
    availableLinks,
    explicitConfig,
    selectedLink
  };
}

function serializeIssuedRoiSigningLink(record, client) {
  if (!record) return null;
  const issuedCfg = record?.roi_context_json?.issuedConfig || record?.roi_context_json || null;
  return {
    id: Number(record.id),
    intake_link_id: Number(record.intake_link_id),
    intake_link_title: record.intake_link_title || null,
    public_key: record.public_key || null,
    status: String(record.status || 'issued').trim().toLowerCase(),
    issued_at: record.issued_at || null,
    signed_at: record.signed_at || null,
    latest_intake_submission_id: record.latest_intake_submission_id ? Number(record.latest_intake_submission_id) : null,
    completed_client_phi_document_id: record.completed_client_phi_document_id
      ? Number(record.completed_client_phi_document_id)
      : null,
    client_id: Number(record.client_id),
    client_full_name: client?.full_name || null,
    language_code: normalizeLanguageCode(
      record.intake_link_language_code
      || record?.roi_context_json?.issuedConfig?.preferredLanguageCode
      || 'en'
    ),
    issue_mode: normalizeRoiLinkMode(issuedCfg?.externalReleaseMode),
    programmed_external_recipient: issuedCfg?.programmedExternalRecipient || null,
    email_send_count: Number(record.email_send_count || 0),
    last_email_sent_at: record.last_email_sent_at || null,
    last_email_sent_to: record.last_email_sent_to || null
  };
}

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function getFrontendBaseUrl() {
  return String(process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

function buildShortPublicIntakeUrl(publicKey) {
  const key = String(publicKey || '').trim();
  if (!key) return '';
  return `${getFrontendBaseUrl()}/i/${key}`;
}

function buildDefaultRoiSmsMessage({ agencyName, linkUrl }) {
  const senderName = String(agencyName || 'our agency').trim() || 'our agency';
  const url = String(linkUrl || '').trim();
  return [
    `Hi, this is ${senderName}. Please review your school release of information.`,
    `A new one has been attached to this private link: ${url}`,
    `If you are no longer interested in our services write STOP. Respond with MORE if you'd like us to call you.`
  ].join(' ');
}

export function buildDefaultRoiEmailSubject({ agencyName, schoolName, languageCode = 'en' }) {
  const locale = normalizeLanguageCode(languageCode);
  const senderName = String(agencyName || 'ITSCO').trim() || 'ITSCO';
  const school = String(schoolName || 'your school').trim() || 'your school';
  if (locale === 'es') {
    return `${senderName}: Autorizacion de Divulgacion de Informacion para ${school}`;
  }
  return `${senderName}: Release of Information for ${school}`;
}

export function buildDefaultRoiEmailBody({ agencyName, schoolName, clientName, linkUrl, languageCode = 'en' }) {
  const locale = normalizeLanguageCode(languageCode);
  const senderName = String(agencyName || 'ITSCO').trim() || 'ITSCO';
  const school = String(schoolName || 'your school').trim() || 'your school';
  const client = clientName ? clientEmailLabel({ full_name: clientName }) : 'your dependent';
  const url = String(linkUrl || '').trim();
  if (locale === 'es') {
    return [
      'Hola,',
      '',
      `${senderName} preparo una autorizacion de divulgacion de informacion (ROI) para ${client} relacionada con ${school}.`,
      'Por favor revise y complete la autorizacion con el enlace privado y seguro a continuacion:',
      '',
      url,
      '',
      'Este enlace es especifico para el cliente y actualizara su perfil automaticamente una vez firmado.',
      '',
      'Si tiene preguntas, responda este correo o contacte al soporte.',
      '',
      `${senderName}`
    ].join('\n');
  }
  return [
    `Hello,`,
    ``,
    `${senderName} has prepared a release of information (ROI) for ${client} related to ${school}.`,
    `Please review and complete it using the secure private link below:`,
    ``,
    url,
    ``,
    `This link is client-specific and will update the client's profile automatically once it is signed.`,
    ``,
    `If you have questions, please reply to this email or contact support.`,
    ``,
    `${senderName}`
  ].join('\n');
}

function normalizeRoiLinkMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'sender_programmed') return 'sender_programmed';
  if (mode === 'parent_defined') return 'parent_defined';
  return 'school_staff_only';
}

function normalizeLanguageCode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('es') ? 'es' : 'en';
}

function normalizeProgrammedExternalRecipient(input = {}) {
  return {
    name: String(input?.name || '').trim() || null,
    relationship: String(input?.relationship || '').trim() || null,
    email: String(input?.email || '').trim() || null,
    phone: String(input?.phone || '').trim() || null
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildRoiEmailHtml({ body, linkUrl, languageCode = 'en' }) {
  return String(body || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim() === linkUrl
      ? portalActionHtml(normalizeLanguageCode(languageCode) === 'es' ? 'Revisar autorizacion escolar' : 'Review school release', linkUrl)
      : `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function ensureRoiSmsBodyHasLink(body, linkUrl) {
  const message = String(body || '').trim();
  const url = String(linkUrl || '').trim();
  if (!url) return message;
  if (!message) return url;
  if (message.includes(url)) return message;
  return `${message} ${url}`.trim();
}

function ensureRoiEmailBodyHasLink(body, linkUrl) {
  const message = String(body || '').trim();
  const url = String(linkUrl || '').trim();
  if (!url) return message;
  if (!message) return url;
  if (message.includes(url)) return message;

  const linkBelowIdx = message.toLowerCase().indexOf('link below');
  if (linkBelowIdx >= 0) {
    const after = message.slice(linkBelowIdx);
    const nextBreak = after.indexOf('\n\n');
    if (nextBreak > 0) {
      const insertAt = linkBelowIdx + nextBreak;
      return `${message.slice(0, insertAt)}\n\n${url}${message.slice(insertAt)}`;
    }
  }
  return `${message}\n\n${url}`.trim();
}

async function createSchoolRoiBackofficeNotification({
  type,
  title,
  message,
  clientId,
  agencyId,
  actorUserId = null
}) {
  if (!type || !title || !message || !clientId || !agencyId) return;
  try {
    await Notification.create({
      type,
      severity: 'info',
      title,
      message,
      audienceJson: BACKOFFICE_NOTIFICATION_AUDIENCE,
      userId: null,
      agencyId,
      relatedEntityType: 'client',
      relatedEntityId: clientId,
      actorUserId,
      actorSource: 'School ROI'
    });
  } catch {
    // best-effort
  }
}

export async function ensureIssuedRoiSigningLinkForClient({
  client,
  schoolOrganizationId,
  actorUserId = null,
  regenerate = false,
  preferredLanguageCode = 'en',
  recipientGuardianUserId = 0
}) {
  const selection = await resolveSchoolRoiSelection(schoolOrganizationId);
  const preferredLocale = normalizeLanguageCode(preferredLanguageCode);
  const languageMatched = (selection.availableLinks || []).find(
    (link) => normalizeLanguageCode(link?.language_code || 'en') === preferredLocale
  ) || null;
  const selectedLink = languageMatched || selection.selectedLink;
  if (!selectedLink?.id) {
    return { ok: false, status: 400, message: 'No ROI form is available for this school yet.' };
  }

  const existing = await ClientSchoolRoiSigningLink.findForClient({
    clientId: client.id,
    schoolOrganizationId, recipientGuardianUserId
  });
  const hasUsableKey =
    existing
    && !regenerate
    && String(existing.status || '').trim().toLowerCase() !== 'completed'
    && Number(existing.intake_link_id || 0) === Number(selectedLink.id || 0)
    && String(existing.public_key || '').trim();

  if(existing?.status==='completed' && !regenerate)return {ok:true,issuedLink:existing,config:selection.explicitConfig,selectedLink,preferredLanguageCode:preferredLocale};

  const issuedLink = hasUsableKey
    ? existing
    : await ClientSchoolRoiSigningLink.issueForClient({
        clientId: client.id,
        schoolOrganizationId,
        intakeLinkId: Number(selectedLink.id),
        publicKey: crypto.randomBytes(24).toString('hex'),
        issuedByUserId: actorUserId,
        preserveCompleted: !regenerate,
        recipientGuardianUserId
      });

  return { ok: true, issuedLink, config: selection.explicitConfig, selectedLink, preferredLanguageCode: preferredLocale };
}

async function resolveAgencySmsSenderNumber(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return null;
  const agency = await Agency.findById(aid);
  const flags = parseFeatureFlags(agency?.feature_flags);
  const preferredNumberId = Number(flags.companyEventsSenderNumberId || 0);
  if (preferredNumberId) {
    const preferred = await PhoneNumber.findById(preferredNumberId);
    if (preferred && Number(preferred.agency_id) === aid && preferred.is_active && preferred.status !== 'released') {
      return preferred;
    }
  }
  const numbers = await PhoneNumber.listByAgency(aid, { includeInactive: false });
  return numbers?.[0] || null;
}

export const listClientSchoolRoiAccess = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackofficeManager(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }

    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const client = access.client;
    if (resolveEffectiveClientTypeForRules(client) !== 'school') {
      return res.status(400).json({ error: { message: 'School ROI access is only available for school clients' } });
    }
    const schoolOrganizationId = Number(client.organization_id || 0);
    if (!schoolOrganizationId) {
      return res.json({
        client_id: clientId,
        school_organization_id: null,
        roi_expires_at: client.roi_expires_at || null,
        roi_expired: isRoiExpired(client.roi_expires_at),
        staff: [],
        school_roi_signing: {
          available_links: [],
          selected_intake_link_id: null,
          issued_link: null
        }
      });
    }

    const staff = await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForClient({
      clientId,
      schoolOrganizationId,
      roiExpiresAt: client.roi_expires_at || null
    });
    const guardians = await ClientGuardian.listForClient(clientId);
    const guardianEmails = (guardians || [])
      .map((guardian) => ({
        guardian_user_id: Number(guardian.guardian_user_id || 0) || null,
        email: String(guardian.email || '').trim() || null,
        first_name: guardian.first_name || null,
        last_name: guardian.last_name || null,
        relationship_title: guardian.relationship_title || null,
        relationship_type: guardian.relationship_type || null,
        can_request_roi: canReceiveGuardianConsentRequest(guardian),
        access_enabled: guardian.access_enabled !== false && guardian.access_enabled !== 0
      }))
      .filter((guardian) => guardian.email);
    const [enrollments] = await pool.execute(`SELECT i.invited_email, i.status, i.expires_at FROM co_guardian_invites i
      JOIN co_guardian_invite_clients ic ON ic.invite_id=i.id
      WHERE ic.client_id=? AND i.agency_id=? ORDER BY i.id DESC`, [clientId,client.agency_id]);
    for (const guardian of guardianEmails) {
      const invite=(enrollments||[]).find(row=>String(row.invited_email||'').trim().toLowerCase()===guardian.email.toLowerCase());
      guardian.enrollment_status=invite ? (invite.status==='pending' && new Date(invite.expires_at).getTime()<=Date.now() ? 'expired' : invite.status) : null;
    }
    const selection = await resolveSchoolRoiSelection(schoolOrganizationId);
    const availableRoiLinks = selection.availableLinks;
    const issuedRoiLink = await ClientSchoolRoiSigningLink.findForClient({ clientId, schoolOrganizationId });
    const completedDocuments = await signedSchoolRoiDocuments(clientId);

    let paperPacketVision = null;
    try {
      const { getLatestPaperPacketVisionEval } = await import('../services/paperPacketVision.service.js');
      paperPacketVision = await getLatestPaperPacketVisionEval(clientId);
    } catch {
      paperPacketVision = null;
    }

    res.json({
      client_id: clientId,
      school_organization_id: schoolOrganizationId,
      school_name: client.organization_name || null,
      enrollment_packet_review: await clientEnrollmentPacketReview(clientId),
      client_contact_phone: client.contact_phone || null,
      guardian_emails: guardianEmails,
      default_guardian_email: guardianEmails.find((guardian) => guardian.access_enabled)?.email || guardianEmails[0]?.email || null,
      roi_expires_at: client.roi_expires_at || null,
      roi_expired: isRoiExpired(client.roi_expires_at),
      paper_packet_staff_roi_pending: client.paper_packet_staff_roi_pending === 1
        || client.paper_packet_staff_roi_pending === true,
      paper_packet_vision: paperPacketVision
        ? {
          status: paperPacketVision.status,
          detected_version_label: paperPacketVision.detected_version_label,
          matched_version_id: paperPacketVision.matched_version_id,
          confidence: paperPacketVision.confidence,
          roi_signature_detected: !!paperPacketVision.roi_signature_detected,
          disclosure_signature_detected: !!paperPacketVision.disclosure_signature_detected,
          deny_staff_user_ids: paperPacketVision.deny_staff_user_ids || [],
          review_reasons: paperPacketVision.review_reasons || [],
          applied_at: paperPacketVision.applied_at || null,
          created_at: paperPacketVision.created_at || null
        }
        : null,
      staff,
      school_roi_signing: {
        available_links: availableRoiLinks,
        completed_documents: completedDocuments.map(doc => ({ id: Number(doc.id), signed_at: doc.signed_at,
          submission_id: Number(doc.intake_submission_id), signer_name: schoolRoiAuditTrail(doc).signerName || null })),
        selected_intake_link_id: selection.selectedLink?.id ? Number(selection.selectedLink.id) : null,
        issued_link: serializeIssuedRoiSigningLink(issuedRoiLink, client)
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateClientSchoolRoiAccess = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    const schoolStaffUserId = Number(req.params.schoolStaffUserId || 0);
    const rawNextState = String(req.body?.nextState || '').trim().toLowerCase();
    let nextState = rawNextState === 'none' ? 'packet' : rawNextState;
    if (!clientId || !schoolStaffUserId) {
      return res.status(400).json({ error: { message: 'Invalid ids' } });
    }
    if (!['packet', 'limited', 'roi', 'roi_docs'].includes(nextState)) {
      return res.status(400).json({ error: { message: 'nextState must be packet, limited, roi, or roi_docs' } });
    }
    if (!isBackofficeManager(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }

    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const client = access.client;
    if (resolveEffectiveClientTypeForRules(client) !== 'school') {
      return res.status(400).json({ error: { message: 'School ROI access is only available for school clients' } });
    }
    const schoolOrganizationId = Number(client.organization_id || 0);
    if (!schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'Client does not have a school affiliation yet' } });
    }

    if(nextState!=='packet'&&paperStaffGrantNeedsProcessing(client)){
      return res.status(409).json({error:{message:'Review this uploaded packet in Process paper packet before applying staff permissions. Its signatures, version and staff choices must be confirmed together.'}});
    }

    const schoolStaffUser = await User.findById(schoolStaffUserId);
    if (!schoolStaffUser || String(schoolStaffUser.role || '').toLowerCase() !== 'school_staff') {
      return res.status(404).json({ error: { message: 'School staff user not found' } });
    }

    const memberships = await User.getAgencies(schoolStaffUserId);
    const isInSchool = (memberships || []).some((agency) => Number(agency?.id) === schoolOrganizationId);
    if (!isInSchool) {
      return res.status(400).json({ error: { message: 'Selected user is not active in this school' } });
    }

    await ClientSchoolStaffRoiAccess.setAccessState({
      clientId,
      schoolOrganizationId,
      schoolStaffUserId,
      nextState,
      actorUserId: req.user?.id || null
    });

    try {
      await Client.update(clientId, { paper_packet_staff_roi_pending: 0 }, req.user?.id || null);
    } catch (pendingErr) {
      if (pendingErr?.code !== 'ER_BAD_FIELD_ERROR') throw pendingErr;
    }

    const paperSource = String(client.source || '').toLowerCase().includes('school_upload')
      || client.paper_packet_staff_roi_pending === 1
      || client.paper_packet_staff_roi_pending === true;
    if (
      paperSource
      && ['limited', 'roi', 'roi_docs'].includes(nextState)
      && Number(schoolStaffUserId) !== Number(client.created_by_user_id || 0)
    ) {
      const initials = String(client.initials || client.identifier_code || `client ${clientId}`).trim();
      const speak = nextState === 'roi';
      await Notification.create({
        type: 'new_packet_uploaded',
        severity: 'info',
        title: 'You were named on a printed referral packet',
        message: speak
          ? `You now have ROI (Speak) access for ${initials}. Referral documents, including the packet, stay hidden at this level.`
          : `You now have access for ${initials} because your name was on the signed printed referral packet.`,
        audienceJson: { schoolStaff: true },
        userId: schoolStaffUserId,
        agencyId: client.agency_id || schoolOrganizationId,
        relatedEntityType: 'client',
        relatedEntityId: clientId,
        actorUserId: req.user?.id || null,
        actorSource: 'System'
      }).catch(() => {});
    }

    // Staff ROI grants are gated by clients.roi_expires_at. A null date is treated as
    // expired, so hand-selecting roi/roi_docs without a date makes the UI show "ROI expired".
    // Paper-packet hand grants use paper defaults (1y before 2026-08-09, else 3y).
    let roiExpiresAt = client.roi_expires_at || null;
    if (['roi', 'roi_docs'].includes(nextState) && !roiExpiresAt) {
      const ymd = paperPacketRoiExpiresAtYmd(new Date());
      await Client.update(clientId, { roi_expires_at: ymd }, req.user?.id || null);
      roiExpiresAt = ymd;
    }

    await logAuditEvent(req, {
      actionType: 'client_school_staff_roi_access_updated',
      agencyId: client.agency_id || null,
      metadata: {
        clientId,
        schoolOrganizationId,
        schoolStaffUserId,
        nextState,
        roiExpiresAt: roiExpiresAt || null
      }
    });

    const staff = await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForClient({
      clientId,
      schoolOrganizationId,
      roiExpiresAt
    });
    const updatedStaff = staff.find((row) => Number(row.school_staff_user_id) === schoolStaffUserId) || null;

    res.json({
      ok: true,
      client_id: clientId,
      school_organization_id: schoolOrganizationId,
      roi_expires_at: roiExpiresAt || null,
      roi_expired: isRoiExpired(roiExpiresAt),
      staff: updatedStaff,
      effective_access_state: updatedStaff
        ? getEffectiveSchoolStaffRoiState(updatedStaff, roiExpiresAt)
        : 'none'
    });
  } catch (error) {
    next(error);
  }
};

export const updateClientSchoolRoiExpiration = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackofficeManager(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }

    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    if (resolveEffectiveClientTypeForRules(access.client) !== 'school') {
      return res.status(400).json({ error: { message: 'School ROI access is only available for school clients' } });
    }

    const roiExpiresAtRaw = req.body?.roi_expires_at === null
      ? ''
      : String(req.body?.roi_expires_at || '').trim();
    let roiExpiresAtValue = null;
    if (roiExpiresAtRaw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(roiExpiresAtRaw)) {
        return res.status(400).json({ error: { message: 'roi_expires_at must be YYYY-MM-DD (or null to revoke/clear)' } });
      }
      const parsed = new Date(`${roiExpiresAtRaw}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: { message: 'Invalid ROI expiration date' } });
      }
      roiExpiresAtValue = roiExpiresAtRaw;
    }

    const updatedClient = await Client.update(
      clientId,
      { roi_expires_at: roiExpiresAtValue },
      req.user?.id || null
    );

    await logAuditEvent(req, {
      actionType: roiExpiresAtValue ? 'client_school_roi_expiration_updated' : 'client_school_roi_revoked',
      agencyId: access.client?.agency_id || null,
      metadata: {
        clientId,
        schoolOrganizationId: access.client?.organization_id || null,
        roiExpiresAt: roiExpiresAtValue
      }
    });

    res.json({
      ok: true,
      client: updatedClient,
      roi_expires_at: updatedClient?.roi_expires_at || roiExpiresAtValue || null,
      roi_expired: isRoiExpired(updatedClient?.roi_expires_at || roiExpiresAtValue || null)
    });
  } catch (error) {
    next(error);
  }
};

export const updateClientSchoolRoiSigningConfig = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackofficeManager(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }

    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const client = access.client;
    if (resolveEffectiveClientTypeForRules(client) !== 'school') {
      return res.status(400).json({ error: { message: 'School ROI access is only available for school clients' } });
    }
    const schoolOrganizationId = Number(client.organization_id || 0);
    if (!schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'Client does not have a school affiliation yet' } });
    }

    const intakeLinkIdRaw = req.body?.intakeLinkId;
    const intakeLinkId =
      intakeLinkIdRaw === null || intakeLinkIdRaw === undefined || intakeLinkIdRaw === ''
        ? null
        : Number(intakeLinkIdRaw);

    let config = null;
    if (!intakeLinkId) {
      await SchoolRoiIntakeLinkConfig.clearBySchoolOrganizationId(schoolOrganizationId);
    } else {
      const availableLinks = await listAvailableSchoolRoiIntakeLinks(schoolOrganizationId);
      const match = availableLinks.find((link) => Number(link.id) === intakeLinkId);
      if (!match) {
        return res.status(400).json({
          error: { message: 'Selected ROI form must be an active release of information form available to this school, including the agency default.' }
        });
      }
      config = await SchoolRoiIntakeLinkConfig.upsert({
        schoolOrganizationId,
        intakeLinkId,
        actorUserId: req.user?.id || null
      });
    }

    await logAuditEvent(req, {
      actionType: 'school_roi_signing_config_updated',
      agencyId: client.agency_id || null,
      metadata: {
        clientId,
        schoolOrganizationId,
        intakeLinkId: config?.intake_link_id || null
      }
    });

    res.json({
      ok: true,
      client_id: clientId,
      school_organization_id: schoolOrganizationId,
      selected_intake_link_id: config?.intake_link_id ? Number(config.intake_link_id) : null
    });
  } catch (error) {
    next(error);
  }
};

export const issueClientSchoolRoiSigningLink = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackofficeManager(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }

    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const client = access.client;
    if (resolveEffectiveClientTypeForRules(client) !== 'school') {
      return res.status(400).json({ error: { message: 'School ROI access is only available for school clients' } });
    }
    const schoolOrganizationId = Number(client.organization_id || 0);
    if (!schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'Client does not have a school affiliation yet' } });
    }

    const regenerate = req.body?.regenerate === true;
    const preferredLanguageCode = normalizeLanguageCode(req.body?.languageCode);
    const issueMode = normalizeRoiLinkMode(req.body?.issueMode);
    const programmedExternalRecipient = issueMode === 'sender_programmed'
      ? normalizeProgrammedExternalRecipient(req.body?.programmedExternalRecipient || {})
      : null;
    if (issueMode === 'sender_programmed') {
      if (!programmedExternalRecipient?.name || !programmedExternalRecipient?.relationship) {
        return res.status(400).json({
          error: { message: 'Programmed recipient name and relationship are required for sender-programmed ROI links.' }
        });
      }
    }
    const issuedResult = await ensureIssuedRoiSigningLinkForClient({
      client,
      schoolOrganizationId,
      actorUserId: req.user?.id || null,
      regenerate,
      preferredLanguageCode
    });
    if (!issuedResult.ok) {
      return res.status(issuedResult.status).json({ error: { message: issuedResult.message } });
    }
    const issuedLink = issuedResult.issuedLink;
    const issuedConfig = {
      externalReleaseMode: issueMode,
      programmedExternalRecipient,
      preferredLanguageCode
    };
    const issuedWithConfig = await ClientSchoolRoiSigningLink.updatePayload({
      id: issuedLink?.id,
      roiContext: {
        issuedConfig
      }
    });

    await logAuditEvent(req, {
      actionType: 'client_school_roi_signing_link_issued',
      agencyId: client.agency_id || null,
      metadata: {
        clientId,
        schoolOrganizationId,
        intakeLinkId: Number(issuedResult.selectedLink?.id || issuedLink?.intake_link_id || 0) || null,
        signingLinkId: issuedLink?.id || null,
        regenerate,
        preferredLanguageCode,
        issueMode,
        programmedExternalRecipient
      }
    });
    await createSchoolRoiBackofficeNotification({
      type: 'client_school_roi_link_generated',
      title: regenerate ? 'School ROI link regenerated' : 'School ROI link generated',
      message: `${client.full_name || client.initials || `Client ${clientId}`} (${client.identifier_code || 'NO ROI'}) now has an active school ROI signing link${regenerate ? ' (regenerated)' : ''}.`,
      clientId,
      agencyId: client.agency_id || null,
      actorUserId: req.user?.id || null
    });

    res.json({
      ok: true,
      client_id: clientId,
      school_organization_id: schoolOrganizationId,
      issued_link: serializeIssuedRoiSigningLink(issuedWithConfig || issuedLink, client)
    });
  } catch (error) {
    next(error);
  }
};

export const trackClientSchoolRoiSigningLinkCopied = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    const signingLinkId = Number(req.body?.signingLinkId || 0);
    if (!clientId || !signingLinkId) {
      return res.status(400).json({ error: { message: 'Invalid clientId/signingLinkId' } });
    }
    if (!isBackofficeManager(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }
    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });
    const client = access.client;
    if (resolveEffectiveClientTypeForRules(client) !== 'school') {
      return res.status(400).json({ error: { message: 'School ROI access is only available for school clients' } });
    }
    const schoolOrganizationId = Number(client.organization_id || 0) || null;

    await logAuditEvent(req, {
      actionType: 'client_school_roi_signing_link_issued',
      agencyId: client.agency_id || null,
      metadata: {
        clientId,
        schoolOrganizationId,
        signingLinkId,
        copied: true
      }
    });
    await createSchoolRoiBackofficeNotification({
      type: 'client_school_roi_link_copied',
      title: 'School ROI link copied',
      message: `${client.full_name || client.initials || `Client ${clientId}`} (${client.identifier_code || 'NO ROI'}) school ROI link was copied by ${req.user?.first_name || 'staff'}.`,
      clientId,
      agencyId: client.agency_id || null,
      actorUserId: req.user?.id || null
    });

    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const sendClientSchoolRoiSigningText = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackofficeManager(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }

    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    let client = access.client;
    if (resolveEffectiveClientTypeForRules(client) !== 'school') {
      return res.status(400).json({ error: { message: 'School ROI access is only available for school clients' } });
    }
    const schoolOrganizationId = Number(client.organization_id || 0);
    if (!schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'Client does not have a school affiliation yet' } });
    }

    const phoneInput = String(req.body?.phoneNumber || client.contact_phone || '').trim();
    const normalizedPhone = Client.normalizePhone(phoneInput);
    if (!normalizedPhone) {
      return res.status(400).json({ error: { message: 'A valid client phone number is required to send the ROI link by text.' } });
    }

    if (normalizedPhone !== String(client.contact_phone || '').trim()) {
      client = await Client.update(clientId, { contact_phone: normalizedPhone }, req.user?.id || null);
    }

    const preferredLanguageCode = normalizeLanguageCode(req.body?.languageCode);
    const issuedResult = await ensureIssuedRoiSigningLinkForClient({
      client,
      schoolOrganizationId,
      actorUserId: req.user?.id || null,
      regenerate: req.body?.regenerate === true,
      preferredLanguageCode
    });
    if (!issuedResult.ok) {
      return res.status(issuedResult.status).json({ error: { message: issuedResult.message } });
    }

    const senderNumber = await resolveAgencySmsSenderNumber(client.agency_id || null);
    if (!senderNumber?.phone_number) {
      return res.status(503).json({ error: { message: 'SMS is not configured for this agency. Add an active system number first.' } });
    }

    const numberId = Number(senderNumber.id || 0) || null;
    const agency = client.agency_id ? await Agency.findById(client.agency_id) : null;
    const flags = parseFeatureFlags(agency?.feature_flags);
    // Phone- and campaign-scoped consent is enforced by VonageService for every send.

    const linkUrl = buildShortPublicIntakeUrl(issuedResult.issuedLink?.public_key || '');
    const defaultBody = buildDefaultRoiSmsMessage({
      agencyName: client.agency_name || agency?.name || 'our agency', linkUrl
    });
    const requestedBody = String(req.body?.message || '').trim();
    const body = ensureRoiSmsBodyHasLink(requestedBody || defaultBody, linkUrl).slice(0, 480);
    const fromNumber = senderNumber.phone_number;

    const outboundLog = await MessageLog.createOutbound({
      agencyId: client.agency_id || null,
      userId: req.user?.id || null,
      assignedUserId: req.user?.id || null,
      numberId,
      ownerType: 'agency',
      clientId,
      body,
      fromNumber,
      toNumber: normalizedPhone,
      deliveryStatus: 'pending',
      metadata: {
        provider: 'vonage',
        messageType: 'roi_signing_link',
        signingLinkId: issuedResult.issuedLink?.id || null
      }
    });

    try {
      const msg = await VonageService.sendSms({ purpose: 'care', agencyId: client.agency_id,
        to: normalizedPhone,
        from: PhoneNumber.normalizePhone(fromNumber) || fromNumber,
        body
      });
      const updatedLog = await MessageLog.markSent(outboundLog.id, msg.sid, {
        provider: 'vonage',
        status: msg.status,
        messageType: 'roi_signing_link',
        signingLinkId: issuedResult.issuedLink?.id || null
      });
      await logAuditEvent(req, {
        actionType: 'client_school_roi_signing_text_sent',
        agencyId: client.agency_id || null,
        metadata: {
          clientId,
          schoolOrganizationId,
          signingLinkId: issuedResult.issuedLink?.id || null,
          numberId,
          toNumber: normalizedPhone
        }
      });
      await createSchoolRoiBackofficeNotification({
        type: 'client_school_roi_link_sent',
        title: 'School ROI link sent by text',
        message: `${client.full_name || client.initials || `Client ${clientId}`} (${client.identifier_code || 'NO ROI'}) school ROI link was sent by text to ${normalizedPhone}.`,
        clientId,
        agencyId: client.agency_id || null,
        actorUserId: req.user?.id || null
      });
      res.json({
        ok: true,
        client,
        issued_link: serializeIssuedRoiSigningLink(issuedResult.issuedLink, client),
        sent_to: normalizedPhone,
        link_url: linkUrl,
        message: body,
        message_log: updatedLog
      });
    } catch (sendErr) {
      await MessageLog.markFailed(outboundLog.id, sendErr.message);
      return res.status(502).json({
        error: { message: 'Failed to send ROI text message', details: sendErr.message }
      });
    }
  } catch (error) {
    next(error);
  }
};


export const sendClientSchoolRoiSigningEmail = async (req, res, next) => {
  try {
    const clientId = Number(req.params.id || 0);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid client id' } });
    if (!isBackofficeManager(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }

    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const client = access.client;
    if (resolveEffectiveClientTypeForRules(client) !== 'school') {
      return res.status(400).json({ error: { message: 'School ROI access is only available for school clients' } });
    }
    const schoolOrganizationId = Number(client.organization_id || 0);
    if (!schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'Client does not have a school affiliation yet' } });
    }

    const delivery = await requestSchoolRoiForGuardians({
      client, schoolOrganizationId, actorUserId: req.user?.id || null,
      languageCode: normalizeLanguageCode(req.body?.languageCode),
      guardianUserIds: req.body?.guardianUserIds ?? null,
      issueLink: ensureIssuedRoiSigningLinkForClient
    });
    await logAuditEvent(req, { actionType: 'client_school_roi_guardian_requests', agencyId: client.agency_id,
      metadata: { clientId, schoolOrganizationId, recipients: delivery.deliveries.map(row => ({ guardianUserId: row.guardianUserId, status: row.status })) } });
    return res.json(delivery);

  } catch (error) {
    next(error);
  }
};
