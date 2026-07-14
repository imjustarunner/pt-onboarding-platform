import pool from '../config/database.js';
import User from '../models/User.model.js';
import config from '../config/config.js';
import {
  assertPractitionerAgency,
  userBelongsToAgency,
  isPractitionerOwnerRole,
  requirePractitionerOwner,
  getPractitionerAssistantPermissions,
  setPractitionerAssistantPermissions,
  permissionsFromInviteBody,
  DEFAULT_PRACTITIONER_ASSISTANT_PERMISSIONS,
  normalizePractitionerAssistantPermissions
} from '../utils/practitionerAssistantAccess.js';

function parseAgencyId(req) {
  return Number(req.query?.agencyId || req.body?.agencyId || req.headers['x-agency-id'] || 0) || 0;
}

async function assertCallerOnAgency(req, agencyId) {
  const ok = await userBelongsToAgency(req.user?.id, agencyId);
  if (!ok && String(req.user?.role || '').toLowerCase() !== 'super_admin') {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
}

async function buildSetupLink(userId) {
  const user = await User.findById(userId);
  if (!user) return null;

  const purpose = String(user.passwordless_token_purpose || 'setup');
  const expiresAt = user.passwordless_token_expires_at ? new Date(user.passwordless_token_expires_at) : null;
  const now = new Date();
  const hasValidExisting =
    user.passwordless_token &&
    purpose === 'setup' &&
    expiresAt &&
    expiresAt.getTime() > now.getTime();

  let tokenResult;
  if (hasValidExisting) {
    tokenResult = { token: user.passwordless_token, expiresAt };
  } else {
    tokenResult = await User.generatePasswordlessToken(userId, 48, 'setup');
  }

  const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
  const userAgencies = await User.getAgencies(userId);
  const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
  const link = portalSlug
    ? `${frontendBase}/${portalSlug}/passwordless-login/${tokenResult.token}`
    : `${frontendBase}/passwordless-login/${tokenResult.token}`;

  return {
    token: tokenResult.token,
    tokenLink: link,
    expiresAt: tokenResult.expiresAt
  };
}

function mapMemberRow(row) {
  const role = String(row.role || '').toLowerCase();
  const isOwner = isPractitionerOwnerRole(role);
  return {
    id: Number(row.id),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    email: row.work_email || row.email || '',
    role,
    status: row.status || '',
    isOwner,
    hasPassword: !!row.password_hash,
    permissions: isOwner
      ? { ...DEFAULT_PRACTITIONER_ASSISTANT_PERMISSIONS }
      : normalizePractitionerAssistantPermissions(row.practitioner_assistant_permissions_json),
    joinedAt: row.ua_created_at || row.created_at || null
  };
}

/** GET /api/practitioner-team/me?agencyId= */
export const getMyTeamAccess = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const agency = await assertPractitionerAgency(agencyId);
    await assertCallerOnAgency(req, agencyId);

    const role = String(req.user?.role || '').toLowerCase();
    const isOwner = isPractitionerOwnerRole(role) || role === 'support' || role === 'super_admin';
    const permissions = isOwner
      ? { ...DEFAULT_PRACTITIONER_ASSISTANT_PERMISSIONS }
      : await getPractitionerAssistantPermissions(req.user.id, agencyId);

    res.json({
      ok: true,
      agencyId,
      orgType: agency.organization_type,
      isOwner,
      role,
      permissions
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** GET /api/practitioner-team?agencyId= — owner only */
export const listTeam = async (req, res, next) => {
  try {
    requirePractitionerOwner(req);
    const agencyId = parseAgencyId(req);
    await assertPractitionerAgency(agencyId);
    await assertCallerOnAgency(req, agencyId);

    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.work_email, u.role, u.status,
              u.password_hash, u.created_at, ua.created_at AS ua_created_at,
              ua.practitioner_assistant_permissions_json
       FROM user_agencies ua
       JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND UPPER(COALESCE(u.status, '')) = 'ACTIVE_EMPLOYEE'
         AND LOWER(COALESCE(u.role, '')) NOT IN ('client_guardian', 'kiosk')
       ORDER BY
         FIELD(LOWER(COALESCE(u.role, '')), 'admin', 'super_admin', 'support', 'staff') ASC,
         u.last_name ASC,
         u.first_name ASC`,
      [agencyId]
    );

    res.json({
      ok: true,
      agencyId,
      members: (rows || []).map(mapMemberRow)
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** POST /api/practitioner-team/invite */
export const inviteAssistant = async (req, res, next) => {
  try {
    requirePractitionerOwner(req);
    const agencyId = parseAgencyId(req);
    const agency = await assertPractitionerAgency(agencyId);
    await assertCallerOnAgency(req, agencyId);

    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const email = String(req.body?.email || req.body?.workEmail || '').trim().toLowerCase();
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: { message: 'firstName, lastName, and email are required' } });
    }

    const existingUser = await User.findByWorkEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: { message: 'A user with this work email already exists' } });
    }
    const existingEmail = await User.findByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: { message: 'A user with this email already exists' } });
    }

    const permissions = permissionsFromInviteBody(req.body);

    const user = await User.create({
      email,
      passwordHash: null,
      firstName,
      lastName,
      personalEmail: null,
      role: 'staff',
      status: 'ACTIVE_EMPLOYEE'
    });

    try {
      await User.setWorkEmail(user.id, email);
    } catch {
      // optional column
    }
    await pool.execute('UPDATE users SET email = ?, username = ? WHERE id = ?', [email, email, user.id]);
    await User.assignToAgency(user.id, agencyId);
    await setPractitionerAssistantPermissions(user.id, agencyId, permissions);

    const setup = await buildSetupLink(user.id);

    res.status(201).json({
      ok: true,
      message: 'Assistant invited',
      member: {
        id: user.id,
        firstName,
        lastName,
        email,
        role: 'staff',
        status: 'ACTIVE_EMPLOYEE',
        isOwner: false,
        hasPassword: false,
        permissions
      },
      setupLink: setup?.tokenLink || null,
      setupExpiresAt: setup?.expiresAt || null,
      agencyName: agency?.name || null
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** PUT /api/practitioner-team/:userId/permissions */
export const updateMemberPermissions = async (req, res, next) => {
  try {
    requirePractitionerOwner(req);
    const agencyId = parseAgencyId(req);
    await assertPractitionerAgency(agencyId);
    await assertCallerOnAgency(req, agencyId);

    const userId = Number(req.params.userId || 0);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ error: { message: 'User not found' } });
    if (isPractitionerOwnerRole(target.role)) {
      return res.status(400).json({ error: { message: 'Cannot edit permissions for an owner/admin' } });
    }
    if (String(target.role || '').toLowerCase() !== 'staff') {
      return res.status(400).json({ error: { message: 'Permissions apply only to staff assistants' } });
    }

    const belongs = await userBelongsToAgency(userId, agencyId);
    if (!belongs) return res.status(404).json({ error: { message: 'User is not on this team' } });

    const permissions = await setPractitionerAssistantPermissions(
      userId,
      agencyId,
      permissionsFromInviteBody(req.body)
    );

    res.json({ ok: true, userId, permissions });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** POST /api/practitioner-team/:userId/resend-setup */
export const resendMemberSetup = async (req, res, next) => {
  try {
    requirePractitionerOwner(req);
    const agencyId = parseAgencyId(req);
    await assertPractitionerAgency(agencyId);
    await assertCallerOnAgency(req, agencyId);

    const userId = Number(req.params.userId || 0);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const belongs = await userBelongsToAgency(userId, agencyId);
    if (!belongs) return res.status(404).json({ error: { message: 'User is not on this team' } });

    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ error: { message: 'User not found' } });
    if (target.password_hash) {
      return res.status(400).json({ error: { message: 'Password already set. Use Reset Password Link instead.' } });
    }

    const tokenResult = await User.generatePasswordlessToken(userId, 48, 'setup');
    const frontendBase = (config.frontendUrl || '').replace(/\/$/, '');
    const userAgencies = await User.getAgencies(userId);
    const portalSlug = userAgencies?.[0]?.portal_url || userAgencies?.[0]?.slug || null;
    const link = portalSlug
      ? `${frontendBase}/${portalSlug}/passwordless-login/${tokenResult.token}`
      : `${frontendBase}/passwordless-login/${tokenResult.token}`;

    res.json({
      ok: true,
      setupLink: link,
      expiresAt: tokenResult.expiresAt
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** DELETE /api/practitioner-team/:userId */
export const removeMember = async (req, res, next) => {
  try {
    requirePractitionerOwner(req);
    const agencyId = parseAgencyId(req);
    await assertPractitionerAgency(agencyId);
    await assertCallerOnAgency(req, agencyId);

    const userId = Number(req.params.userId || 0);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (Number(req.user?.id) === userId) {
      return res.status(400).json({ error: { message: 'You cannot remove yourself' } });
    }

    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ error: { message: 'User not found' } });

    if (isPractitionerOwnerRole(target.role)) {
      const [adminCountRows] = await pool.execute(
        `SELECT COUNT(*) AS n
         FROM user_agencies ua
         JOIN users u ON u.id = ua.user_id
         WHERE ua.agency_id = ?
           AND UPPER(COALESCE(u.status, '')) = 'ACTIVE_EMPLOYEE'
           AND LOWER(COALESCE(u.role, '')) IN ('admin', 'super_admin')`,
        [agencyId]
      );
      if (Number(adminCountRows?.[0]?.n || 0) <= 1) {
        return res.status(400).json({ error: { message: 'Cannot remove the last owner/admin' } });
      }
    }

    const belongs = await userBelongsToAgency(userId, agencyId);
    if (!belongs) return res.status(404).json({ error: { message: 'User is not on this team' } });

    await pool.execute(`DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?`, [userId, agencyId]);

    res.json({ ok: true, removedUserId: userId });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
