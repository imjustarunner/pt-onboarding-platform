import User from '../models/User.model.js';
import AgencyManagementTeam from '../models/AgencyManagementTeam.model.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

const parseAgencyId = (raw) => {
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

async function userHasAgencyAccess(req, agencyId) {
  if (!agencyId) return false;
  if (req.user?.role === 'super_admin') return true;
  const userId = req.user?.id;
  if (!userId) return false;
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => Number(a?.id) === agencyId);
}

/**
 * GET /api/agencies/:id/management-team
 * Agency view: their management team with presence status.
 * Access: agency users (admin, support, staff) who belong to this agency.
 */
export const getManagementTeam = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }

    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }

    const rows = await AgencyManagementTeam.listForAgencyWithPresence(agencyId);
    const out = (rows || []).map((r) => {
      const firstName = r.first_name || '';
      const lastName = r.last_name || '';
      const preferredName = r.preferred_name || '';
      const displayName = preferredName
        ? `${firstName} "${preferredName}" ${lastName}`.trim()
        : `${firstName} ${lastName}`.trim() || 'Unknown';
      return {
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        display_name: displayName,
        email: r.email,
        role: r.role,
        display_role: r.display_role || null,
        profile_photo_url: publicUploadsUrlFromStoredPath(r.profile_photo_path),
        presence_status: r.presence_status || null,
        presence_note: r.presence_note || null,
        presence_expected_return_at: r.presence_expected_return_at || null
      };
    });
    res.json(out);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/agencies/:id/management-team/config
 * SuperAdmin only: list management team config for editing.
 */
export const getManagementTeamConfig = async (req, res, next) => {
  try {
    if (String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }

    const agencyId = parseAgencyId(req.params.id);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }

    const rows = await AgencyManagementTeam.listConfig(agencyId);
    res.json(rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      display_role: r.display_role || null,
      display_order: r.display_order,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      role: r.role
    })));
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /api/agencies/:id/management-team/config
 * SuperAdmin only: set management team members.
 * Body: { members: [{ userId, displayRole?, displayOrder? }, ...] }
 */
export const updateManagementTeamConfig = async (req, res, next) => {
  try {
    if (String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }

    const agencyId = parseAgencyId(req.params.id);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }

    const { members } = req.body || {};
    const updated = await AgencyManagementTeam.setConfig(agencyId, members);
    res.json(updated.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      display_role: r.display_role || null,
      display_order: r.display_order,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      role: r.role
    })));
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/agencies/management-team/eligible-users
 * SuperAdmin only: list users eligible for management team (staff, admin, super_admin).
 */
export const listEligibleUsers = async (req, res, next) => {
  try {
    if (String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }

    const rows = await AgencyManagementTeam.listEligibleUsers();
    res.json(rows);
  } catch (e) {
    next(e);
  }
};
