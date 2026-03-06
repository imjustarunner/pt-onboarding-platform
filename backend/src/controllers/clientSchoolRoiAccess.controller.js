import crypto from 'crypto';
import Client from '../models/Client.model.js';
import User from '../models/User.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import ClientSchoolStaffRoiAccess, {
  getEffectiveSchoolStaffRoiState,
  isRoiExpired
} from '../models/ClientSchoolStaffRoiAccess.model.js';
import SchoolRoiIntakeLinkConfig from '../models/SchoolRoiIntakeLinkConfig.model.js';
import ClientSchoolRoiSigningLink from '../models/ClientSchoolRoiSigningLink.model.js';
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
    .filter((link) => String(link.form_type || '').trim().toLowerCase() === 'public_form')
    .filter((link) => !link.create_client)
    .map((link) => ({
      id: Number(link.id),
      title: link.title || `Form ${link.id}`,
      description: link.description || null,
      public_key: link.public_key || null,
      form_type: link.form_type || 'public_form',
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
    const availableRoiLinks = await listAvailableSchoolRoiIntakeLinks(schoolOrganizationId);
    const schoolRoiConfig = await SchoolRoiIntakeLinkConfig.findBySchoolOrganizationId(schoolOrganizationId);
    const issuedRoiLink = await ClientSchoolRoiSigningLink.findForClient({ clientId, schoolOrganizationId });

    res.json({
      client_id: clientId,
      school_organization_id: schoolOrganizationId,
      school_name: client.organization_name || null,
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
    if (!['none', 'packet', 'roi'].includes(nextState)) {
      return res.status(400).json({ error: { message: 'nextState must be none, packet, or roi' } });
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
          error: { message: 'Selected ROI form must be an active school-scoped public form for this school that does not create clients.' }
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

    const config = await SchoolRoiIntakeLinkConfig.findBySchoolOrganizationId(schoolOrganizationId);
    if (!config?.intake_link_id) {
      return res.status(400).json({ error: { message: 'Assign a school ROI form before issuing a client ROI link.' } });
    }

    const availableLinks = await listAvailableSchoolRoiIntakeLinks(schoolOrganizationId);
    const selectedLink = availableLinks.find((link) => Number(link.id) === Number(config.intake_link_id));
    if (!selectedLink) {
      return res.status(400).json({ error: { message: 'The assigned school ROI form is no longer active for this school.' } });
    }

    const regenerate = req.body?.regenerate === true;
    const existing = await ClientSchoolRoiSigningLink.findForClient({ clientId, schoolOrganizationId });
    const canReuseExisting =
      existing
      && !regenerate
      && Number(existing.intake_link_id) === Number(config.intake_link_id)
      && String(existing.status || '').trim().toLowerCase() !== 'completed'
      && String(existing.public_key || '').trim();

    const issuedLink = canReuseExisting
      ? existing
      : await ClientSchoolRoiSigningLink.issueForClient({
          clientId,
          schoolOrganizationId,
          intakeLinkId: Number(config.intake_link_id),
          publicKey: crypto.randomBytes(24).toString('hex'),
          issuedByUserId: req.user?.id || null
        });

    await logAuditEvent(req, {
      actionType: 'client_school_roi_signing_link_issued',
      agencyId: client.agency_id || null,
      metadata: {
        clientId,
        schoolOrganizationId,
        intakeLinkId: Number(config.intake_link_id),
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
