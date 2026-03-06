import Client from '../models/Client.model.js';
import User from '../models/User.model.js';
import ClientSchoolStaffRoiAccess, {
  getEffectiveSchoolStaffRoiState,
  isRoiExpired
} from '../models/ClientSchoolStaffRoiAccess.model.js';
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
        staff: []
      });
    }

    const staff = await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForClient({
      clientId,
      schoolOrganizationId,
      roiExpiresAt: client.roi_expires_at || null
    });

    res.json({
      client_id: clientId,
      school_organization_id: schoolOrganizationId,
      school_name: client.organization_name || null,
      roi_expires_at: client.roi_expires_at || null,
      roi_expired: isRoiExpired(client.roi_expires_at),
      staff
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
