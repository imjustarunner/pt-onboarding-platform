import pool from '../config/database.js';
import config from '../config/config.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';

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

    res.json(Array.isArray(rows) ? rows : []);
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

    if (!fullName && !email && !roleTitle && !notes) {
      return res.status(400).json({ error: { message: 'At least one field is required' } });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (isPrimary) {
        await conn.execute(`UPDATE school_contacts SET is_primary = FALSE WHERE school_organization_id = ?`, [orgId]);
      }

      const [result] = await conn.execute(
        `INSERT INTO school_contacts
          (school_organization_id, full_name, email, role_title, notes, raw_source_text, is_primary)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
        [orgId, fullName || null, email || null, roleTitle || null, notes || null, isPrimary ? 1 : 0]
      );

      const insertedId = result?.insertId ? Number(result.insertId) : null;
      const [rows] = await conn.execute(
        `SELECT id, full_name, email, role_title, notes, raw_source_text, is_primary, created_at, updated_at
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

      if (isPrimary === true) {
        await conn.execute(`UPDATE school_contacts SET is_primary = FALSE WHERE school_organization_id = ?`, [orgId]);
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
      if (isPrimary !== undefined) {
        fields.push('is_primary = ?');
        values.push(isPrimary ? 1 : 0);
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
        `SELECT id, full_name, email, role_title, notes, raw_source_text, is_primary, created_at, updated_at
         FROM school_contacts
         WHERE id = ? AND school_organization_id = ?
         LIMIT 1`,
        [contactId, orgId]
      );

      await conn.commit();
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

    const org = await assertManageableSchoolOrg(req, orgId);

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

    // Create passwordless setup link (48 hours).
    const passwordlessTokenResult = await User.generatePasswordlessToken(user.id, 48);
    const frontendBase = String(config?.frontendUrl || process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const portalSlug = String(org.portal_url || org.slug || '').trim();
    const setupLink = portalSlug
      ? `${frontendBase}/${portalSlug}/passwordless-login/${passwordlessTokenResult.token}`
      : `${frontendBase}/passwordless-login/${passwordlessTokenResult.token}`;

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
      setupLink
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

    await User.removeFromAgency(userId, orgId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

