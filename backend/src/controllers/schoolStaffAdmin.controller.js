import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import ClientSchoolStaffRoiAccess from '../models/ClientSchoolStaffRoiAccess.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { setSchoolStaffRoleTitleForOrg, syncSchoolStaffUserTitle } from '../services/schoolStaffContactRole.service.js';
import {
  sqlNonEmpty,
  sqlUnicodeEq,
  sqlUnicodeIn,
  sqlUnicodeLiteral,
  sqlUnicodeNe
} from '../utils/mysqlCollation.js';

const TEMP_PASSWORD_SET_ACTION_TYPES = [
  'school_staff_temporary_password_set',
  'school_portal_school_staff_temporary_password_set'
];

const parseActivityMetadata = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const displayNameFromUserRow = (row) => {
  const name = `${row?.first_name || ''} ${row?.last_name || ''}`.trim();
  return name || row?.email || null;
};

async function resolveUserDisplayNames(userIds) {
  const ids = [...new Set((userIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, first_name, last_name, email
     FROM users
     WHERE id IN (${placeholders})`,
    ids
  );

  const map = new Map();
  for (const row of rows || []) {
    map.set(Number(row.id), displayNameFromUserRow(row) || `User #${row.id}`);
  }
  return map;
}

async function fetchLatestTemporaryPasswordSetEvents(userIds) {
  const ids = [...new Set((userIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => '?').join(',');

  try {
    const [rows] = await pool.execute(
      `SELECT ual.user_id, ual.created_at, ual.metadata
       FROM user_activity_log ual
       INNER JOIN (
         SELECT user_id, MAX(id) AS max_id
         FROM user_activity_log
         WHERE user_id IN (${placeholders})
           AND ${sqlUnicodeIn('action_type', TEMP_PASSWORD_SET_ACTION_TYPES.length)}
         GROUP BY user_id
       ) latest ON latest.max_id = ual.id`,
      [...ids, ...TEMP_PASSWORD_SET_ACTION_TYPES]
    );

    const map = new Map();
    for (const row of rows || []) {
      const meta = parseActivityMetadata(row.metadata);
      map.set(Number(row.user_id), {
        set_at: row.created_at || null,
        set_by_user_id: meta?.performedByUserId != null ? Number(meta.performedByUserId) : null,
        set_by_email: meta?.performedByEmail ? String(meta.performedByEmail) : null,
        source: meta?.source ? String(meta.source) : null,
        expires_at: meta?.expiresAt || null
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

function buildTemporaryPasswordFields(user, tempSetEvent, performerNames) {
  const hasTemporaryPassword = !!user.temporary_password_hash;
  const tempExpiresAt = user.temporary_password_expires_at ? new Date(user.temporary_password_expires_at) : null;
  const now = new Date();
  const hasActiveTemporaryPassword =
    hasTemporaryPassword &&
    (!tempExpiresAt || tempExpiresAt.getTime() > now.getTime());

  let temporaryPasswordStatus = 'none';
  if (hasTemporaryPassword) {
    temporaryPasswordStatus = hasActiveTemporaryPassword ? 'active' : 'expired';
  }

  const setByUserId = tempSetEvent?.set_by_user_id || null;
  const setByEmail = tempSetEvent?.set_by_email || null;
  const setByName = setByUserId ? performerNames.get(setByUserId) || null : null;

  const setAt =
    user.temporary_password_set_at ||
    tempSetEvent?.set_at ||
    null;

  return {
    has_temporary_password: hasTemporaryPassword,
    has_active_temporary_password: hasActiveTemporaryPassword,
    temporary_password_status: temporaryPasswordStatus,
    temporary_password_expires_at: hasTemporaryPassword ? user.temporary_password_expires_at : null,
    temporary_password_set_at: hasTemporaryPassword ? setAt : null,
    temporary_password_set_by_user_id: setByUserId,
    temporary_password_set_by_email: setByEmail,
    temporary_password_set_by_name: setByName,
    temporary_password_set_by_label: setByName || setByEmail || null,
    temporary_password_set_source: tempSetEvent?.source || null
  };
}

const normalizeEmail = (v) => {
  const s = String(v || '').trim().toLowerCase();
  return s.includes('@') ? s : '';
};

const canManageSchoolOrg = async (req, orgId) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  if (!['admin', 'support', 'staff'].includes(role)) return false;

  // Admin/support/staff must have access to the parent agency (or direct membership to the org).
  const userAgencies = await User.getAgencies(req.user.id);
  const userAgencyIds = new Set((userAgencies || []).map((a) => Number(a?.id)).filter((n) => Number.isFinite(n)));
  if (userAgencyIds.has(Number(orgId))) return true;

  let parent = null;
  try {
    parent = await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId);
  } catch {
    parent = null;
  }
  if (!parent) {
    try {
      parent = await AgencySchool.getActiveAgencyIdForSchool(orgId);
    } catch {
      parent = null;
    }
  }
  if (parent && userAgencyIds.has(Number(parent))) return true;
  return false;
};

const assertManageableSchoolOrg = async (req, orgId) => {
  const ok = await canManageSchoolOrg(req, orgId);
  if (!ok) {
    const e = new Error('Access denied');
    e.statusCode = 403;
    throw e;
  }

  const org = await Agency.findById(orgId);
  if (!org) {
    const e = new Error('Organization not found');
    e.statusCode = 404;
    throw e;
  }
  const orgType = String(org.organization_type || 'agency').toLowerCase();
  if (orgType !== 'school') {
    const e = new Error('This endpoint is only valid for school organizations');
    e.statusCode = 400;
    throw e;
  }
  return org;
};

const parseName = (fullName) => {
  const s = String(fullName || '').trim();
  if (!s) return { firstName: 'School', lastName: 'Staff' };
  const parts = s.split(/\s+/g).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Staff' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
};

const canManageAgencySchoolStaff = async (req, agencyId) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  if (!['admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(role)) {
    return false;
  }
  const userAgencies = await User.getAgencies(req.user.id);
  const userAgencyIds = new Set((userAgencies || []).map((a) => Number(a?.id)).filter((n) => Number.isFinite(n)));
  return userAgencyIds.has(Number(agencyId));
};

const assertManageableAgency = async (req, agencyId) => {
  const ok = await canManageAgencySchoolStaff(req, agencyId);
  if (!ok) {
    const e = new Error('Access denied');
    e.statusCode = 403;
    throw e;
  }
  const org = await Agency.findById(agencyId);
  if (!org) {
    const e = new Error('Agency not found');
    e.statusCode = 404;
    throw e;
  }
  return org;
};

async function fetchAgencySchoolStaffRows(agencyId) {
  const emailMatch = sqlUnicodeEq(
    "LOWER(TRIM(COALESCE(sc.email, '')))",
    "LOWER(TRIM(COALESCE(u.email, '')))"
  );
  const workEmailMatch = sqlUnicodeEq(
    "LOWER(TRIM(COALESCE(sc.email, '')))",
    "LOWER(TRIM(COALESCE(u.work_email, '')))"
  );
  const schoolTypeIsSchool = sqlUnicodeLiteral("LOWER(COALESCE(school.organization_type, ''))", 'school');
  const roleIsSchoolStaff = sqlUnicodeLiteral("LOWER(COALESCE(u.role, ''))", 'school_staff');
  const statusNotArchived = sqlUnicodeNe("UPPER(COALESCE(u.status, ''))", "'ARCHIVED'");

  const selectCore = `SELECT
         u.id,
         u.email,
         u.work_email,
         u.first_name,
         u.last_name,
         u.status,
         u.is_active,
         u.password_hash,
         u.temporary_password_hash,
         u.temporary_password_expires_at,
         u.temporary_password_set_at,
         u.created_at,
         u.title AS user_title,
         school.id AS school_id,
         school.name AS school_name`;
  const contactJoin = `LEFT JOIN school_contacts sc ON sc.school_organization_id = school.id
         AND (
           ${emailMatch}
           OR (
             ${sqlNonEmpty('u.work_email')}
             AND ${workEmailMatch}
           )
         )`;
  const fromCore = `FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id
       INNER JOIN agencies school ON school.id = ua.agency_id
         AND ${schoolTypeIsSchool}`;
  const whereClause = `WHERE ${roleIsSchoolStaff}
         AND ${statusNotArchived}
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)`;
  const affiliationJoin = `INNER JOIN organization_affiliations oa ON oa.organization_id = school.id
         AND oa.agency_id = ?
         AND oa.is_active = 1`;
  const legacyJoin = `INNER JOIN agency_schools ash ON ash.school_id = school.id AND ash.agency_id = ?`;
  const orderClause = 'ORDER BY u.last_name ASC, u.first_name ASC, school.name ASC';

  const withContacts = (joinSql) =>
    `${selectCore}, sc.role_title AS contact_role_title ${fromCore} ${joinSql} ${contactJoin} ${whereClause} ${orderClause}`;
  const withoutContacts = (joinSql) =>
    `${selectCore}, NULL AS contact_role_title ${fromCore} ${joinSql} ${whereClause} ${orderClause}`;

  const isRetryableListError = (e) => {
    const code = String(e?.code || '').trim();
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
    const msg = String(e?.message || '').toLowerCase();
    return msg.includes('collation') || msg.includes('school_contacts');
  };

  try {
    const [rows] = await pool.execute(withContacts(affiliationJoin), [agencyId]);
    return rows || [];
  } catch (e) {
    if (!isRetryableListError(e) && e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') {
      try {
        const [rows] = await pool.execute(withContacts(legacyJoin), [agencyId]);
        return rows || [];
      } catch (legacyErr) {
        if (!isRetryableListError(legacyErr)) throw legacyErr;
      }
    }
    try {
      const [rows] = await pool.execute(withoutContacts(affiliationJoin), [agencyId]);
      return rows || [];
    } catch (affErr) {
      if (!isRetryableListError(affErr) && affErr?.code !== 'ER_NO_SUCH_TABLE' && affErr?.code !== 'ER_BAD_FIELD_ERROR') {
        throw affErr;
      }
      const [rows] = await pool.execute(withoutContacts(legacyJoin), [agencyId]);
      return rows || [];
    }
  }
}


async function getEligibleSchoolStaffUserIdsForAgency(agencyId, userIds) {
  const ids = [...new Set((userIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return new Set();

  const rows = await fetchAgencySchoolStaffRows(agencyId);
  const eligible = new Set((rows || []).map((r) => Number(r.id)).filter(Boolean));
  return new Set(ids.filter((id) => eligible.has(id)));
}

function aggregateSchoolStaffRows(rows) {
  const byUser = new Map();
  for (const row of rows || []) {
    const userId = Number(row.id);
    if (!userId) continue;
    const schoolEntry = row.school_id
      ? {
        id: Number(row.school_id),
        name: row.school_name || `School #${row.school_id}`,
        role_title: String(row.contact_role_title || row.user_title || '').trim() || null
      }
      : null;

    if (!byUser.has(userId)) {
      byUser.set(userId, {
        id: userId,
        email: row.email || row.work_email || null,
        first_name: row.first_name,
        last_name: row.last_name,
        status: row.status,
        is_active: row.is_active,
        password_hash: row.password_hash || null,
        temporary_password_hash: row.temporary_password_hash,
        temporary_password_expires_at: row.temporary_password_expires_at,
        temporary_password_set_at: row.temporary_password_set_at,
        created_at: row.created_at,
        schools: schoolEntry ? [schoolEntry] : []
      });
      continue;
    }

    const existing = byUser.get(userId);
    if (schoolEntry && !existing.schools.some((s) => s.id === schoolEntry.id)) {
      existing.schools.push(schoolEntry);
    }
  }
  return byUser;
}

async function buildStaffAccountRows(byUser) {
  const userIds = [...byUser.keys()];
  if (!userIds.length) return [];

  const tempSetEvents = await fetchLatestTemporaryPasswordSetEvents(userIds);

  const performerIds = [...tempSetEvents.values()]
    .map((event) => event?.set_by_user_id)
    .filter(Boolean);
  const performerNames = await resolveUserDisplayNames(performerIds);

  return [...byUser.values()].map((user) => {
    // A user has a permanent password when they have a password_hash but no
    // temporary_password_hash (which changePassword() clears on first self-set).
    // This is the most reliable signal: you can't have a permanent password
    // without having logged in with a temp one and changed it.
    const hasPermanentPassword = !!user.password_hash && !user.temporary_password_hash;
    const hasNeverLoggedIn = !hasPermanentPassword;

    const tempFields = buildTemporaryPasswordFields(
      user,
      tempSetEvents.get(user.id) || null,
      performerNames
    );

    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      status: user.status,
      is_active: user.is_active,
      schools: user.schools,
      school_names: user.schools.map((s) => s.name).join(', '),
      primary_role_title: user.schools.find((s) => s.role_title)?.role_title || null,
      has_permanent_password: hasPermanentPassword,
      has_never_logged_in: hasNeverLoggedIn,
      created_at: user.created_at,
      ...tempFields
    };
  });
}

export const updateAgencySchoolStaffRoleTitle = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.params.id || ''), 10);
    const userId = parseInt(String(req.params.userId || ''), 10);
    if (!Number.isFinite(agencyId) || agencyId <= 0 || !Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agency or user id' } });
    }

    await assertManageableAgency(req, agencyId);

    const schoolOrganizationId = parseInt(String(req.body?.schoolOrganizationId || ''), 10);
    if (!Number.isFinite(schoolOrganizationId) || schoolOrganizationId <= 0) {
      return res.status(400).json({ error: { message: 'schoolOrganizationId is required' } });
    }

    const eligible = await getEligibleSchoolStaffUserIdsForAgency(agencyId, [userId]);
    if (!eligible.has(userId)) {
      return res.status(403).json({ error: { message: 'User is not school staff for this agency' } });
    }

    const roleTitle = req.body?.roleTitle !== undefined ? String(req.body.roleTitle || '').trim() : '';
    const result = await setSchoolStaffRoleTitleForOrg({
      schoolOrganizationId,
      userId,
      roleTitle
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ error: { message: error.message } });
    }
    next(error);
  }
};

export const listAgencySchoolStaffAccounts = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }

    await assertManageableAgency(req, agencyId);

    const neverLoggedInOnly =
      String(req.query.neverLoggedIn || '').toLowerCase() === '1' ||
      String(req.query.neverLoggedIn || '').toLowerCase() === 'true';

    const rows = await fetchAgencySchoolStaffRows(agencyId);
    const byUser = aggregateSchoolStaffRows(rows);
    let result = await buildStaffAccountRows(byUser);

    if (neverLoggedInOnly) {
      result = result.filter((row) => row.has_never_logged_in);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const bulkSetAgencySchoolStaffTemporaryPasswords = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }

    await assertManageableAgency(req, agencyId);

    const userIds = Array.isArray(req.body?.userIds)
      ? req.body.userIds.map((id) => parseInt(String(id), 10)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const temporaryPassword = String(req.body?.temporaryPassword || '').trim();
    const expiresInHours = Math.min(720, Math.max(1, parseInt(String(req.body?.expiresInHours || '168'), 10) || 168));

    if (!userIds.length) {
      return res.status(400).json({ error: { message: 'At least one userId is required' } });
    }
    if (!temporaryPassword) {
      return res.status(400).json({ error: { message: 'Temporary password is required' } });
    }
    if (temporaryPassword.length < 6) {
      return res.status(400).json({ error: { message: 'Temporary password must be at least 6 characters' } });
    }
    if (temporaryPassword.length > 128) {
      return res.status(400).json({ error: { message: 'Temporary password must be 128 characters or less' } });
    }

    const eligibleUserIds = await getEligibleSchoolStaffUserIdsForAgency(agencyId, userIds);
    const results = [];

    for (const userId of userIds) {
      if (!eligibleUserIds.has(userId)) {
        results.push({ userId, ok: false, error: 'User is not school staff for this agency' });
        continue;
      }

      try {
        const user = await User.findById(userId);
        if (!user) {
          results.push({ userId, ok: false, error: 'User not found' });
          continue;
        }
        if (String(user.role || '').toLowerCase() !== 'school_staff') {
          results.push({ userId, ok: false, error: 'Only school_staff users can receive temporary passwords' });
          continue;
        }
        if (String(user.status || '').toUpperCase() === 'ARCHIVED') {
          results.push({ userId, ok: false, error: 'Cannot reset password for an archived user' });
          continue;
        }

        const temporaryPasswordResult = await User.setTemporaryPassword(userId, temporaryPassword, expiresInHours);

        if (String(user.status || '').toUpperCase() === 'PENDING_SETUP') {
          try {
            await User.updateStatus(userId, 'ACTIVE_EMPLOYEE', req.user?.id || null);
          } catch {
            // ignore
          }
          try {
            await User.update(userId, { isActive: true });
          } catch {
            // ignore
          }
        }

        try {
          await User.markTokenAsUsed(userId);
        } catch {
          // best-effort
        }

        try {
          const ActivityLogService = (await import('../services/activityLog.service.js')).default;
          ActivityLogService.logActivity(
            {
              actionType: 'school_staff_temporary_password_set',
              userId,
              metadata: {
                performedByUserId: req.user?.id || null,
                performedByEmail: req.user?.email || req.user?.username || null,
                source: 'school_staff_accounts_bulk',
                agencyId,
                expiresAt: temporaryPasswordResult?.expiresAt || null,
                expiresInHours
              }
            },
            req
          );
        } catch {
          // best-effort
        }

        results.push({
          userId,
          ok: true,
          temporaryPasswordExpiresAt: temporaryPasswordResult?.expiresAt || null
        });
      } catch (err) {
        results.push({ userId, ok: false, error: err?.message || 'Failed to set temporary password' });
      }
    }

    res.json({
      ok: results.every((row) => row.ok),
      expiresInHours,
      results
    });
  } catch (error) {
    next(error);
  }
};

export const previewSchoolStaffAccountAccessEmail = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }
    await assertManageableAgency(req, agencyId);

    const {
      previewAccessEmail
    } = await import('../services/schoolStaffAccountAccessEmail.service.js');

    const senderName = `${req.user?.first_name || ''} ${req.user?.last_name || ''}`.trim()
      || req.user?.email
      || null;

    const preview = await previewAccessEmail({
      agencyId,
      emailType: req.body?.emailType || req.query?.emailType || 'recovery',
      userIds: Array.isArray(req.body?.userIds) ? req.body.userIds : [],
      subject: req.body?.subject,
      body: req.body?.body,
      senderIdentityId: req.body?.senderIdentityId,
      senderName,
      temporaryPassword: req.body?.temporaryPassword
    });
    res.json(preview);
  } catch (error) {
    next(error);
  }
};

export const saveSchoolStaffAccountAccessEmailTemplate = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }
    await assertManageableAgency(req, agencyId);

    const {
      normalizeEmailType,
      upsertAccessEmailTemplate
    } = await import('../services/schoolStaffAccountAccessEmail.service.js');

    const emailType = normalizeEmailType(req.body?.emailType);
    if (!emailType) {
      return res.status(400).json({ error: { message: 'emailType must be recovery or portal_access' } });
    }

    const template = await upsertAccessEmailTemplate({
      agencyId,
      emailType,
      name: req.body?.name,
      subject: req.body?.subject,
      body: req.body?.body,
      saveMode: req.body?.saveMode === 'new' ? 'new' : 'update',
      actorUserId: req.user?.id || null
    });
    res.json({ ok: true, template });
  } catch (error) {
    next(error);
  }
};

export const testSchoolStaffAccountAccessEmail = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }
    await assertManageableAgency(req, agencyId);

    const { sendAccessEmailTest } = await import('../services/schoolStaffAccountAccessEmail.service.js');
    const senderName = `${req.user?.first_name || ''} ${req.user?.last_name || ''}`.trim()
      || req.user?.email
      || null;

    const result = await sendAccessEmailTest({
      agencyId,
      emailType: req.body?.emailType,
      to: req.body?.to,
      subject: req.body?.subject,
      body: req.body?.body,
      senderIdentityId: req.body?.senderIdentityId,
      senderName,
      sampleUserId: req.body?.sampleUserId
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const queueSchoolStaffAccountAccessEmails = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }
    await assertManageableAgency(req, agencyId);

    const userIds = Array.isArray(req.body?.userIds)
      ? req.body.userIds.map((id) => parseInt(String(id), 10)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const eligibleUserIds = await getEligibleSchoolStaffUserIdsForAgency(agencyId, userIds);
    const allowedIds = userIds.filter((id) => eligibleUserIds.has(id));
    if (!allowedIds.length) {
      return res.status(400).json({ error: { message: 'None of the selected users are school staff for this agency' } });
    }

    const { queueAccessEmails } = await import('../services/schoolStaffAccountAccessEmail.service.js');
    const senderName = `${req.user?.first_name || ''} ${req.user?.last_name || ''}`.trim()
      || req.user?.email
      || null;

    const result = await queueAccessEmails({
      agencyId,
      emailType: req.body?.emailType,
      userIds: allowedIds,
      subject: req.body?.subject,
      body: req.body?.body,
      senderIdentityId: req.body?.senderIdentityId,
      staggerSeconds: req.body?.staggerSeconds,
      createdByUserId: req.user?.id,
      senderName,
      saveTemplate: req.body?.saveTemplate || null,
      temporaryPassword: req.body?.temporaryPassword,
      expiresInHours: req.body?.expiresInHours
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getSchoolStaffAccountAccessEmailSend = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.params.id || ''), 10);
    const sendId = parseInt(String(req.params.sendId || ''), 10);
    if (!Number.isFinite(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }
    if (!Number.isFinite(sendId) || sendId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid send id' } });
    }
    await assertManageableAgency(req, agencyId);

    const { getAccessEmailSend } = await import('../services/schoolStaffAccountAccessEmail.service.js');
    const send = await getAccessEmailSend(sendId, agencyId);
    if (!send) {
      return res.status(404).json({ error: { message: 'Send job not found' } });
    }
    res.json(send);
  } catch (error) {
    next(error);
  }
};

export const getPendingSchoolStaffAccessPasswordSync = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }
    await assertManageableAgency(req, agencyId);

    const { getPendingAccessPasswordSync } = await import('../services/schoolStaffAccountAccessEmail.service.js');
    const pending = await getPendingAccessPasswordSync(agencyId);
    res.json(pending);
  } catch (error) {
    next(error);
  }
};

export const syncSchoolStaffAccountAccessSendPasswords = async (req, res, next) => {
  try {
    const agencyId = parseInt(String(req.params.id || ''), 10);
    const sendId = parseInt(String(req.params.sendId || ''), 10);
    if (!Number.isFinite(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agency id' } });
    }
    if (!Number.isFinite(sendId) || sendId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid send id' } });
    }
    await assertManageableAgency(req, agencyId);

    const { syncAccessSendTemporaryPasswords } = await import('../services/schoolStaffAccountAccessEmail.service.js');
    const result = await syncAccessSendTemporaryPasswords({
      sendId,
      agencyId,
      temporaryPassword: req.body?.temporaryPassword,
      expiresInHours: req.body?.expiresInHours,
      performedByUserId: req.user?.id || null,
      performedByEmail: req.user?.email || req.user?.username || null
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const listSchoolStaffUsers = async (req, res, next) => {
  try {
    const orgId = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(orgId) || orgId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid organization id' } });
    }

    await assertManageableSchoolOrg(req, orgId);

    const [rows] = await pool.execute(
      `SELECT
         u.id,
         u.email,
         u.work_email,
         u.first_name,
         u.last_name,
         u.role,
         u.status,
         u.is_active,
         u.is_archived,
         u.archived_at
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND LOWER(COALESCE(u.role, '')) = 'school_staff'
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [orgId]
    );

    res.json(
      (Array.isArray(rows) ? rows : []).map((r) => ({
        ...r,
        needs_activation: String(r.status || '').toUpperCase() === 'PENDING_SETUP'
      }))
    );
  } catch (error) {
    next(error);
  }
};

export const createSchoolContact = async (req, res, next) => {
  try {
    const orgId = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(orgId) || orgId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid organization id' } });
    }
    await assertManageableSchoolOrg(req, orgId);

    const fullName = req.body?.fullName !== undefined ? String(req.body.fullName || '').trim() : null;
    const email = req.body?.email !== undefined ? normalizeEmail(req.body.email) : '';
    const roleTitle = req.body?.roleTitle !== undefined ? String(req.body.roleTitle || '').trim() : null;
    const notes = req.body?.notes !== undefined ? String(req.body.notes || '').trim() : null;
    const isPrimary = req.body?.isPrimary === true;
    const isSchoolAdmin = req.body?.isSchoolAdmin === true || isPrimary;
    const isScheduler = req.body?.isScheduler === true;

    if (!fullName && !email && !roleTitle && !notes) {
      return res.status(400).json({ error: { message: 'At least one field is required' } });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.execute(
        `INSERT INTO school_contacts
          (school_organization_id, full_name, email, role_title, notes, raw_source_text, is_primary, is_school_admin, is_scheduler)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        [
          orgId,
          fullName || null,
          email || null,
          roleTitle || null,
          notes || null,
          isSchoolAdmin ? 1 : 0,
          isSchoolAdmin ? 1 : 0,
          isScheduler ? 1 : 0
        ]
      );

      const insertedId = result?.insertId ? Number(result.insertId) : null;
      const [rows] = await conn.execute(
        `SELECT id, full_name, email, role_title, notes, raw_source_text, is_primary, is_school_admin, is_scheduler, created_at, updated_at
         FROM school_contacts
         WHERE id = ? AND school_organization_id = ?
         LIMIT 1`,
        [insertedId, orgId]
      );

      await conn.commit();
      return res.status(201).json(rows?.[0] || null);
    } catch (e) {
      try {
        await conn.rollback();
      } catch {
        // ignore
      }
      // Duplicate email constraint -> conflict
      if (e?.code === 'ER_DUP_ENTRY' || String(e?.message || '').toLowerCase().includes('duplicate')) {
        return res.status(409).json({ error: { message: 'A contact with that email already exists for this school.' } });
      }
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(400).json({ error: { message: 'School contact role flags are not enabled yet (missing migration).' } });
      }
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(400).json({ error: { message: 'School contacts are not enabled (missing school_contacts table).' } });
      }
      throw e;
    } finally {
      conn.release();
    }
  } catch (error) {
    next(error);
  }
};

export const updateSchoolContact = async (req, res, next) => {
  try {
    const orgId = parseInt(String(req.params.id || ''), 10);
    const contactId = parseInt(String(req.params.contactId || ''), 10);
    if (!Number.isFinite(orgId) || orgId <= 0 || !Number.isFinite(contactId) || contactId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid id' } });
    }
    await assertManageableSchoolOrg(req, orgId);

    const fullName = req.body?.fullName !== undefined ? String(req.body.fullName || '').trim() : undefined;
    const email = req.body?.email !== undefined ? normalizeEmail(req.body.email) : undefined;
    const roleTitle = req.body?.roleTitle !== undefined ? String(req.body.roleTitle || '').trim() : undefined;
    const notes = req.body?.notes !== undefined ? String(req.body.notes || '').trim() : undefined;
    const isPrimary = req.body?.isPrimary !== undefined ? (req.body.isPrimary === true) : undefined;
    const isSchoolAdminRaw = req.body?.isSchoolAdmin !== undefined ? (req.body.isSchoolAdmin === true) : undefined;
    const isScheduler = req.body?.isScheduler !== undefined ? (req.body.isScheduler === true) : undefined;
    const isSchoolAdmin = isSchoolAdminRaw !== undefined ? isSchoolAdminRaw : isPrimary;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existingRows] = await conn.execute(
        `SELECT id, school_organization_id FROM school_contacts WHERE id = ? AND school_organization_id = ? LIMIT 1`,
        [contactId, orgId]
      );
      if (!existingRows?.length) {
        await conn.rollback();
        return res.status(404).json({ error: { message: 'Contact not found' } });
      }

      const fields = [];
      const values = [];
      if (fullName !== undefined) {
        fields.push('full_name = ?');
        values.push(fullName || null);
      }
      if (email !== undefined) {
        fields.push('email = ?');
        values.push(email || null);
      }
      if (roleTitle !== undefined) {
        fields.push('role_title = ?');
        values.push(roleTitle || null);
      }
      if (notes !== undefined) {
        fields.push('notes = ?');
        values.push(notes || null);
      }
      if (isSchoolAdmin !== undefined) {
        fields.push('is_primary = ?');
        values.push(isSchoolAdmin ? 1 : 0);
        fields.push('is_school_admin = ?');
        values.push(isSchoolAdmin ? 1 : 0);
      }
      if (isScheduler !== undefined) {
        fields.push('is_scheduler = ?');
        values.push(isScheduler ? 1 : 0);
      }

      if (fields.length) {
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(contactId, orgId);
        await conn.execute(
          `UPDATE school_contacts SET ${fields.join(', ')} WHERE id = ? AND school_organization_id = ?`,
          values
        );
      }

      const [rows] = await conn.execute(
        `SELECT id, full_name, email, role_title, notes, raw_source_text, is_primary, is_school_admin, is_scheduler, created_at, updated_at
         FROM school_contacts
         WHERE id = ? AND school_organization_id = ?
         LIMIT 1`,
        [contactId, orgId]
      );

      await conn.commit();

      if (roleTitle !== undefined && rows?.[0]) {
        const contactEmail = normalizeEmail(rows[0].email);
        if (contactEmail) {
          try {
            const [userRows] = await pool.execute(
              `SELECT id FROM users
               WHERE LOWER(TRIM(COALESCE(email, ''))) = ?
                 AND LOWER(COALESCE(role, '')) = 'school_staff'
               LIMIT 1`,
              [contactEmail]
            );
            if (userRows?.[0]?.id) {
              await syncSchoolStaffUserTitle(userRows[0].id, roleTitle || null);
            }
          } catch {
            // best-effort
          }
        }
      }

      return res.json(rows?.[0] || null);
    } catch (e) {
      try {
        await conn.rollback();
      } catch {
        // ignore
      }
      if (e?.code === 'ER_DUP_ENTRY' || String(e?.message || '').toLowerCase().includes('duplicate')) {
        return res.status(409).json({ error: { message: 'A contact with that email already exists for this school.' } });
      }
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(400).json({ error: { message: 'School contact role flags are not enabled yet (missing migration).' } });
      }
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(400).json({ error: { message: 'School contacts are not enabled (missing school_contacts table).' } });
      }
      throw e;
    } finally {
      conn.release();
    }
  } catch (error) {
    next(error);
  }
};

export const deleteSchoolContact = async (req, res, next) => {
  try {
    const orgId = parseInt(String(req.params.id || ''), 10);
    const contactId = parseInt(String(req.params.contactId || ''), 10);
    if (!Number.isFinite(orgId) || orgId <= 0 || !Number.isFinite(contactId) || contactId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid id' } });
    }
    await assertManageableSchoolOrg(req, orgId);

    try {
      const [result] = await pool.execute(
        `DELETE FROM school_contacts WHERE id = ? AND school_organization_id = ?`,
        [contactId, orgId]
      );
      const ok = Number(result?.affectedRows || 0) > 0;
      if (!ok) return res.status(404).json({ error: { message: 'Contact not found' } });
      return res.json({ ok: true });
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(400).json({ error: { message: 'School contacts are not enabled (missing school_contacts table).' } });
      }
      throw e;
    }
  } catch (error) {
    next(error);
  }
};

export const createSchoolStaffUserFromContact = async (req, res, next) => {
  try {
    const orgId = parseInt(String(req.params.id || ''), 10);
    const contactId = parseInt(String(req.params.contactId || ''), 10);
    if (!Number.isFinite(orgId) || orgId <= 0 || !Number.isFinite(contactId) || contactId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid id' } });
    }

    await assertManageableSchoolOrg(req, orgId);

    let contact = null;
    try {
      const [rows] = await pool.execute(
        `SELECT id, full_name, email FROM school_contacts WHERE id = ? AND school_organization_id = ? LIMIT 1`,
        [contactId, orgId]
      );
      contact = rows?.[0] || null;
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(400).json({ error: { message: 'School contacts are not enabled (missing school_contacts table).' } });
      }
      throw e;
    }
    if (!contact) return res.status(404).json({ error: { message: 'Contact not found' } });

    const email = normalizeEmail(contact.email);
    if (!email) return res.status(400).json({ error: { message: 'Contact must have a valid email to create an account' } });
    const temporaryPassword = String(req.body?.temporaryPassword || '').trim();
    if (!temporaryPassword) {
      return res.status(400).json({ error: { message: 'Temporary password is required' } });
    }
    if (temporaryPassword.length < 6) {
      return res.status(400).json({ error: { message: 'Temporary password must be at least 6 characters' } });
    }
    if (temporaryPassword.length > 128) {
      return res.status(400).json({ error: { message: 'Temporary password must be 128 characters or less' } });
    }

    // If the user exists, it must already be a school_staff user.
    const existing = await User.findByEmail(email);
    let user = null;
    if (existing?.id) {
      if (String(existing.role || '').toLowerCase() !== 'school_staff') {
        return res.status(409).json({ error: { message: `A user already exists with this email (role: ${existing.role}). Not creating a school staff account.` } });
      }
      user = await User.findById(existing.id);
    } else {
      const { firstName, lastName } = parseName(contact.full_name);
      user = await User.create({
        email,
        passwordHash: null,
        firstName,
        lastName,
        role: 'school_staff',
        status: 'ACTIVE_EMPLOYEE'
      });
      // Prefer work_email if available in this deployment
      try {
        await User.setWorkEmail(user.id, email);
      } catch {
        // ignore if column/method not present
      }
      try {
        await pool.execute('UPDATE users SET email = ?, username = ? WHERE id = ?', [email, email, user.id]);
      } catch {
        // ignore if username column missing
      }
    }

    // School staff do not have a workflow: ensure they are ACTIVE immediately.
    try {
      await User.updateStatus(user.id, 'ACTIVE_EMPLOYEE', req.user?.id || null);
    } catch {
      // ignore (older deployments without full status lifecycle)
    }
    try {
      await User.update(user.id, { isActive: true });
    } catch {
      // ignore (older deployments)
    }

    // Ensure membership exists.
    await User.assignToAgency(user.id, orgId);
    await ClientSchoolStaffRoiAccess.revokeForSchoolStaff({
      schoolStaffUserId: user.id,
      schoolOrganizationId: orgId,
      actorUserId: req.user?.id || null
    });

    // School-specific setup: admin provides temporary password, valid for 7 days.
    const temporaryPasswordResult = await User.setTemporaryPassword(user.id, temporaryPassword, 24 * 7);

    res.status(201).json({
      ok: true,
      user: {
        id: user.id,
        email: user.email || email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        status: user.status
      },
      temporaryPasswordExpiresAt: temporaryPasswordResult?.expiresAt || null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Activate a PENDING_SETUP school_staff user for this school (title/flags + temp password).
 */
export const activateSchoolStaffUser = async (req, res, next) => {
  try {
    const orgId = parseInt(String(req.params.id || ''), 10);
    const userId = parseInt(String(req.params.userId || ''), 10);
    if (!Number.isFinite(orgId) || orgId <= 0 || !Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid id' } });
    }
    await assertManageableSchoolOrg(req, orgId);

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });
    if (String(user.role || '').toLowerCase() !== 'school_staff') {
      return res.status(400).json({ error: { message: 'Only school_staff users can be activated' } });
    }
    const membership = await User.getAgencyMembership(userId, orgId);
    if (!membership) {
      return res.status(400).json({ error: { message: 'User is not assigned to this school.' } });
    }

    const roleTitle = req.body?.roleTitle !== undefined ? String(req.body.roleTitle || '').trim() : null;
    const isSchoolAdmin = req.body?.isSchoolAdmin === true;
    const isScheduler = req.body?.isScheduler === true;
    let temporaryPassword = String(req.body?.temporaryPassword || '').trim();
    if (!temporaryPassword) temporaryPassword = await User.generateTemporaryPassword();
    if (temporaryPassword.length < 6) {
      return res.status(400).json({ error: { message: 'Temporary password must be at least 6 characters' } });
    }

    const email = normalizeEmail(user.email || user.work_email);
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || email;
    if (email) {
      try {
        await pool.execute(
          `INSERT INTO school_contacts
            (school_organization_id, full_name, email, role_title, notes, raw_source_text, is_primary, is_school_admin, is_scheduler)
           VALUES (?, ?, ?, ?, 'Activated from admin', 'school_staff_activate', 0, ?, ?)
           ON DUPLICATE KEY UPDATE
             full_name = COALESCE(VALUES(full_name), full_name),
             role_title = COALESCE(VALUES(role_title), role_title),
             is_school_admin = VALUES(is_school_admin),
             is_scheduler = VALUES(is_scheduler),
             updated_at = CURRENT_TIMESTAMP`,
          [orgId, fullName, email, roleTitle || null, isSchoolAdmin ? 1 : 0, isScheduler ? 1 : 0]
        );
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }

    const temporaryPasswordResult = await User.setTemporaryPassword(userId, temporaryPassword, 24 * 7);
    try {
      await User.updateStatus(userId, 'ACTIVE_EMPLOYEE', req.user?.id || null);
    } catch {
      // ignore
    }
    try {
      await User.update(userId, { isActive: true });
    } catch {
      // ignore
    }

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email || email,
        firstName: user.first_name,
        lastName: user.last_name,
        status: 'ACTIVE_EMPLOYEE'
      },
      temporaryPassword,
      temporaryPasswordExpiresAt: temporaryPasswordResult?.expiresAt || null
    });
  } catch (error) {
    next(error);
  }
};

export const revokeSchoolStaffAccess = async (req, res, next) => {
  try {
    const orgId = parseInt(String(req.params.id || ''), 10);
    const userId = parseInt(String(req.params.userId || ''), 10);
    if (!Number.isFinite(orgId) || orgId <= 0 || !Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid id' } });
    }
    await assertManageableSchoolOrg(req, orgId);

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });
    if (String(user.role || '').toLowerCase() !== 'school_staff') {
      return res.status(400).json({ error: { message: 'Only school_staff users can be revoked from this page.' } });
    }

    const membership = await User.getAgencyMembership(userId, orgId);
    if (!membership) {
      return res.status(400).json({ error: { message: 'User is not assigned to this school.' } });
    }

    await ClientSchoolStaffRoiAccess.revokeForSchoolStaff({
      schoolStaffUserId: userId,
      schoolOrganizationId: orgId,
      actorUserId: req.user?.id || null
    });
    await User.removeFromAgency(userId, orgId);
    const stillHasSchoolAccess = await User.hasAnySchoolAgencyMembership(userId);
    if (!stillHasSchoolAccess) {
      await User.disableSchoolStaffLogin(userId, req.user?.id || null);
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

