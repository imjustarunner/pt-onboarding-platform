import crypto from 'crypto';
import Client from '../models/Client.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import ClientSchoolStaffRoiAccess, {
  getEffectiveSchoolStaffRoiState,
  isRoiExpired
} from '../models/ClientSchoolStaffRoiAccess.model.js';
import SchoolRoiIntakeLinkConfig from '../models/SchoolRoiIntakeLinkConfig.model.js';
import ClientSchoolRoiSigningLink from '../models/ClientSchoolRoiSigningLink.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import MessageLog from '../models/MessageLog.model.js';
import TwilioNumber from '../models/TwilioNumber.model.js';
import TwilioOptInState from '../models/TwilioOptInState.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import TwilioService from '../services/twilio.service.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

function isBackofficeManager(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff'].includes(normalized);
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

async function listAvailableSchoolRoiIntakeLinks(schoolOrganizationId) {
  const sid = Number(schoolOrganizationId || 0);
  if (!sid) return [];
  const links = await IntakeLink.findByScope({ scopeType: 'school', organizationId: sid });
  return (links || [])
    .filter((link) => link && link.is_active)
    .filter((link) => String(link.form_type || '').trim().toLowerCase() === 'smart_school_roi')
    .filter((link) => !link.create_client)
    .map((link) => ({
      id: Number(link.id),
      title: link.title || `Form ${link.id}`,
      description: link.description || null,
      public_key: link.public_key || null,
      form_type: link.form_type || 'smart_school_roi',
      language_code: link.language_code || 'en',
      documents_count: Array.isArray(link.allowed_document_template_ids) ? link.allowed_document_template_ids.length : 0
    }));
}

function serializeIssuedRoiSigningLink(record, client) {
  if (!record) return null;
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
    client_full_name: client?.full_name || null
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
    `Hi this is ${senderName} and your ROI is expired.`,
    `A new one has been attached to this private link: ${url}`,
    `If you are no longer interested in our services write STOP. Respond with MORE if you'd like us to call you.`
  ].join(' ');
}

function buildDefaultRoiEmailSubject({ agencyName, schoolName }) {
  const senderName = String(agencyName || 'ITSCO').trim() || 'ITSCO';
  const school = String(schoolName || 'your school').trim() || 'your school';
  return `${senderName}: Smart ROI for ${school}`;
}

function buildDefaultRoiEmailBody({ agencyName, schoolName, clientName, linkUrl }) {
  const senderName = String(agencyName || 'ITSCO').trim() || 'ITSCO';
  const school = String(schoolName || 'your school').trim() || 'your school';
  const client = String(clientName || 'the client').trim() || 'the client';
  const url = String(linkUrl || '').trim();
  return [
    `Hello,`,
    ``,
    `${senderName} has prepared a smart school ROI for ${client} related to ${school}.`,
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRoiEmailHtml({ body }) {
  return String(body || '')
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

async function resolveAgencyRoiSenderIdentity(agencyId) {
  const aid = Number(agencyId || 0) || null;
  if (!aid) return null;
  const list = await EmailSenderIdentity.list({ agencyId: aid, includePlatformDefaults: true, onlyActive: true });
  const preferredKeys = ['school_intake', 'intake', 'notifications', 'system'];
  for (const key of preferredKeys) {
    const match = (list || []).find((identity) => String(identity?.identity_key || '').trim().toLowerCase() === key);
    if (match) return match;
  }
  return (list || [])[0] || null;
}

function ensureRoiSmsBodyHasLink(body, linkUrl) {
  const message = String(body || '').trim();
  const url = String(linkUrl || '').trim();
  if (!url) return message;
  if (!message) return url;
  if (message.includes(url)) return message;
  return `${message} ${url}`.trim();
}

export async function ensureIssuedRoiSigningLinkForClient({ client, schoolOrganizationId, actorUserId = null, regenerate = false }) {
  const config = await SchoolRoiIntakeLinkConfig.findBySchoolOrganizationId(schoolOrganizationId);
  if (!config?.intake_link_id) {
    return { ok: false, status: 400, message: 'Assign a school ROI form before sending a client ROI link.' };
  }

  const availableLinks = await listAvailableSchoolRoiIntakeLinks(schoolOrganizationId);
  const selectedLink = availableLinks.find((link) => Number(link.id) === Number(config.intake_link_id));
  if (!selectedLink) {
    return { ok: false, status: 400, message: 'The assigned school ROI form is no longer active for this school.' };
  }

  const existing = await ClientSchoolRoiSigningLink.findForClient({
    clientId: client.id,
    schoolOrganizationId
  });
  const canReuseExisting =
    existing
    && !regenerate
    && Number(existing.intake_link_id) === Number(config.intake_link_id)
    && String(existing.status || '').trim().toLowerCase() !== 'completed'
    && String(existing.public_key || '').trim();

  const issuedLink = canReuseExisting
    ? existing
    : await ClientSchoolRoiSigningLink.issueForClient({
        clientId: client.id,
        schoolOrganizationId,
        intakeLinkId: Number(config.intake_link_id),
        publicKey: crypto.randomBytes(24).toString('hex'),
        issuedByUserId: actorUserId
      });

  return { ok: true, issuedLink, config };
}

async function resolveAgencySmsSenderNumber(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return null;
  const agency = await Agency.findById(aid);
  const flags = parseFeatureFlags(agency?.feature_flags);
  const preferredNumberId = Number(flags.companyEventsSenderNumberId || 0);
  if (preferredNumberId) {
    const preferred = await TwilioNumber.findById(preferredNumberId);
    if (preferred && Number(preferred.agency_id) === aid && preferred.is_active && preferred.status !== 'released') {
      return preferred;
    }
  }
  const numbers = await TwilioNumber.listByAgency(aid, { includeInactive: false });
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
        access_enabled: guardian.access_enabled !== false && guardian.access_enabled !== 0
      }))
      .filter((guardian) => guardian.email);
    const availableRoiLinks = await listAvailableSchoolRoiIntakeLinks(schoolOrganizationId);
    const schoolRoiConfig = await SchoolRoiIntakeLinkConfig.findBySchoolOrganizationId(schoolOrganizationId);
    const issuedRoiLink = await ClientSchoolRoiSigningLink.findForClient({ clientId, schoolOrganizationId });

    res.json({
      client_id: clientId,
      school_organization_id: schoolOrganizationId,
      school_name: client.organization_name || null,
      client_contact_phone: client.contact_phone || null,
      guardian_emails: guardianEmails,
      default_guardian_email: guardianEmails.find((guardian) => guardian.access_enabled)?.email || guardianEmails[0]?.email || null,
      roi_expires_at: client.roi_expires_at || null,
      roi_expired: isRoiExpired(client.roi_expires_at),
      staff,
      school_roi_signing: {
        available_links: availableRoiLinks,
        selected_intake_link_id: schoolRoiConfig?.intake_link_id ? Number(schoolRoiConfig.intake_link_id) : null,
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
    const nextState = String(req.body?.nextState || '').trim().toLowerCase();
    if (!clientId || !schoolStaffUserId) {
      return res.status(400).json({ error: { message: 'Invalid ids' } });
    }
    if (!['none', 'packet', 'roi', 'roi_docs'].includes(nextState)) {
      return res.status(400).json({ error: { message: 'nextState must be none, packet, roi, or roi_docs' } });
    }
    if (!isBackofficeManager(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Backoffice access required' } });
    }

    const access = await requireManagedClient(req, clientId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const client = access.client;
    const schoolOrganizationId = Number(client.organization_id || 0);
    if (!schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'Client does not have a school affiliation yet' } });
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

    await logAuditEvent(req, {
      actionType: 'client_school_staff_roi_access_updated',
      agencyId: client.agency_id || null,
      metadata: {
        clientId,
        schoolOrganizationId,
        schoolStaffUserId,
        nextState
      }
    });

    const staff = await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForClient({
      clientId,
      schoolOrganizationId,
      roiExpiresAt: client.roi_expires_at || null
    });
    const updatedStaff = staff.find((row) => Number(row.school_staff_user_id) === schoolStaffUserId) || null;

    res.json({
      ok: true,
      client_id: clientId,
      school_organization_id: schoolOrganizationId,
      roi_expires_at: client.roi_expires_at || null,
      roi_expired: isRoiExpired(client.roi_expires_at),
      staff: updatedStaff,
      effective_access_state: updatedStaff
        ? getEffectiveSchoolStaffRoiState(updatedStaff, client.roi_expires_at || null)
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

    const roiExpiresAtRaw = String(req.body?.roi_expires_at || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(roiExpiresAtRaw)) {
      return res.status(400).json({ error: { message: 'roi_expires_at must be YYYY-MM-DD' } });
    }
    const parsed = new Date(`${roiExpiresAtRaw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: { message: 'Invalid ROI expiration date' } });
    }

    const updatedClient = await Client.update(
      clientId,
      { roi_expires_at: roiExpiresAtRaw },
      req.user?.id || null
    );

    await logAuditEvent(req, {
      actionType: 'client_school_roi_expiration_updated',
      agencyId: access.client?.agency_id || null,
      metadata: {
        clientId,
        schoolOrganizationId: access.client?.organization_id || null,
        roiExpiresAt: roiExpiresAtRaw
      }
    });

    res.json({
      ok: true,
      client: updatedClient,
      roi_expires_at: updatedClient?.roi_expires_at || roiExpiresAtRaw,
      roi_expired: isRoiExpired(updatedClient?.roi_expires_at || roiExpiresAtRaw)
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
          error: { message: 'Selected ROI form must be an active school-scoped smart ROI form for this school that does not create clients.' }
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
    const schoolOrganizationId = Number(client.organization_id || 0);
    if (!schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'Client does not have a school affiliation yet' } });
    }

    const regenerate = req.body?.regenerate === true;
    const issuedResult = await ensureIssuedRoiSigningLinkForClient({
      client,
      schoolOrganizationId,
      actorUserId: req.user?.id || null,
      regenerate
    });
    if (!issuedResult.ok) {
      return res.status(issuedResult.status).json({ error: { message: issuedResult.message } });
    }
    const issuedLink = issuedResult.issuedLink;

    await logAuditEvent(req, {
      actionType: 'client_school_roi_signing_link_issued',
      agencyId: client.agency_id || null,
      metadata: {
        clientId,
        schoolOrganizationId,
        intakeLinkId: Number(issuedResult.config.intake_link_id),
        signingLinkId: issuedLink?.id || null,
        regenerate
      }
    });

    res.json({
      ok: true,
      client_id: clientId,
      school_organization_id: schoolOrganizationId,
      issued_link: serializeIssuedRoiSigningLink(issuedLink, client)
    });
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

    const issuedResult = await ensureIssuedRoiSigningLinkForClient({
      client,
      schoolOrganizationId,
      actorUserId: req.user?.id || null,
      regenerate: req.body?.regenerate === true
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
    const complianceMode = String(flags.smsComplianceMode || 'opt_in_required');
    if (numberId && client?.id) {
      const optState = await TwilioOptInState.findByClientNumber({ clientId: client.id, numberId });
      const optStatus = optState?.status || 'pending';
      if (optStatus === 'opted_out') {
        return res.status(403).json({ error: { message: 'Client has opted out of SMS' } });
      }
      if (complianceMode === 'opt_in_required' && optStatus !== 'opted_in') {
        return res.status(403).json({ error: { message: 'Client has not opted in to SMS yet' } });
      }
    }

    const linkUrl = buildShortPublicIntakeUrl(issuedResult.issuedLink?.public_key || '');
    const defaultBody = buildDefaultRoiSmsMessage({
      agencyName: client.agency_name || agency?.name || 'our agency',
      linkUrl
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
        provider: 'twilio',
        messageType: 'roi_signing_link',
        signingLinkId: issuedResult.issuedLink?.id || null
      }
    });

    try {
      const msg = await TwilioService.sendSms({
        to: normalizedPhone,
        from: TwilioNumber.normalizePhone(fromNumber) || fromNumber,
        body
      });
      const updatedLog = await MessageLog.markSent(outboundLog.id, msg.sid, {
        provider: 'twilio',
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
        error: { message: 'Failed to send ROI text message via Twilio', details: sendErr.message }
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
    const schoolOrganizationId = Number(client.organization_id || 0);
    if (!schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'Client does not have a school affiliation yet' } });
    }

    const issuedResult = await ensureIssuedRoiSigningLinkForClient({
      client,
      schoolOrganizationId,
      actorUserId: req.user?.id || null,
      regenerate: !!req.body?.regenerate
    });
    if (!issuedResult.ok) {
      return res.status(issuedResult.status).json({ error: { message: issuedResult.message } });
    }

    const senderIdentity = await resolveAgencyRoiSenderIdentity(client.agency_id || null);
    if (!senderIdentity?.id) {
      return res.status(503).json({ error: { message: 'Email is not configured for this agency. Add an active sender identity first.' } });
    }

    const guardians = await ClientGuardian.listForClient(clientId);
    const defaultEmail = (guardians || [])
      .map((guardian) => String(guardian.email || '').trim())
      .find(Boolean);
    const toEmail = String(req.body?.email || defaultEmail || '').trim().toLowerCase();
    if (!toEmail || !toEmail.includes('@')) {
      return res.status(400).json({ error: { message: 'A valid guardian email is required.' } });
    }

    const schoolName = client.organization_name || 'School';
    const agency = client.agency_id ? await Agency.findById(client.agency_id) : null;
    const linkUrl = buildPublicIntakeUrl(issuedResult.issuedLink?.public_key || '');
    const defaultSubject = buildDefaultRoiEmailSubject({
      agencyName: client.agency_name || agency?.name || 'ITSCO',
      schoolName
    });
    const defaultBody = buildDefaultRoiEmailBody({
      agencyName: client.agency_name || agency?.name || 'ITSCO',
      schoolName,
      clientName: client.full_name || client.initials || `Client ${client.id}`,
      linkUrl
    });
    const subject = String(req.body?.subject || defaultSubject).trim() || defaultSubject;
    const body = String(req.body?.message || defaultBody).trim() || defaultBody;

    const result = await sendEmailFromIdentity({
      senderIdentityId: senderIdentity.id,
      to: toEmail,
      subject,
      text: body,
      html: buildRoiEmailHtml({ body })
    });

    await logAuditEvent(req, {
      actionType: 'client_school_roi_signing_email_sent',
      agencyId: client.agency_id || null,
      metadata: {
        clientId,
        schoolOrganizationId,
        signingLinkId: issuedResult.issuedLink?.id || null,
        toEmail
      }
    });

    res.json({
      ok: true,
      client,
      issued_link: serializeIssuedRoiSigningLink(issuedResult.issuedLink, client),
      sent_to: toEmail,
      link_url: linkUrl,
      subject,
      message: body,
      email_result: result
    });
  } catch (error) {
    next(error);
  }
};
