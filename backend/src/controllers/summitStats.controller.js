import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import pool from '../config/database.js';
import { validationResult } from 'express-validator';

function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Resolve Summit Stats platform agency ID (for club creation, club manager emails, etc.). */
export async function getPlatformAgencyId() {
  const envId = process.env.SUMMIT_STATS_PLATFORM_AGENCY_ID;
  if (envId) {
    const id = parseInt(envId, 10);
    if (Number.isFinite(id) && id > 0) return id;
  }
  const slug = process.env.SUMMIT_STATS_PLATFORM_SLUG || 'summit-stats';
  const agency = await Agency.findBySlug(slug);
  return agency?.id || null;
}

/**
 * Create a club (affiliation) under the Summit Stats platform.
 * Requires: auth, role=admin, email verified (for club managers).
 */
export const createClub = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { name, slug: inputSlug } = req.body;
    const nameTrimmed = String(name || '').trim();
    if (!nameTrimmed) {
      return res.status(400).json({ error: { message: 'Club name is required' } });
    }

    const platformAgencyId = await getPlatformAgencyId();
    if (!platformAgencyId) {
      return res.status(503).json({
        error: { message: 'Summit Stats platform is not configured. Contact support.' }
      });
    }

    const user = req.user;
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only admins can create clubs' } });
    }

    const dbName = process.env.DB_NAME || 'onboarding_stage';
    const [cols] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified_at'",
      [dbName]
    );
    const hasEmailVerified = cols?.length > 0;
    if (hasEmailVerified && user.role === 'admin') {
      const [uRows] = await pool.execute(
        'SELECT email_verified_at FROM users WHERE id = ? LIMIT 1',
        [user.id]
      );
      const verified = uRows?.[0]?.email_verified_at;
      if (!verified) {
        return res.status(403).json({
          error: {
            message: 'Email verification required before creating a club.',
            code: 'EMAIL_VERIFICATION_REQUIRED'
          }
        });
      }
    }

    const finalSlug = inputSlug?.trim() ? slugify(inputSlug) : slugify(nameTrimmed);
    if (!finalSlug) {
      return res.status(400).json({ error: { message: 'Could not generate a valid slug from the club name' } });
    }

    const existing = await Agency.findBySlug(finalSlug);
    if (existing) {
      return res.status(400).json({ error: { message: 'A club with this slug already exists' } });
    }

    const agency = await Agency.create({
      name: nameTrimmed,
      slug: finalSlug,
      organizationType: 'affiliation',
      isActive: true
    });

    await OrganizationAffiliation.upsert({
      agencyId: platformAgencyId,
      organizationId: agency.id,
      isActive: true
    });

    await User.assignToAgency(user.id, agency.id);

    res.status(201).json(agency);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: { message: 'A club with this slug already exists' } });
    }
    next(error);
  }
};

/**
 * Public: List clubs (affiliations under Summit Stats platform).
 * No auth required - for browsing/searching clubs.
 */
export const listClubs = async (req, res, next) => {
  try {
    const platformAgencyId = await getPlatformAgencyId();
    if (!platformAgencyId) {
      return res.status(503).json({
        error: { message: 'Summit Stats platform is not configured.' }
      });
    }

    const search = String(req.query?.search || req.query?.q || '').trim();
    const state = String(req.query?.state || '').trim();
    const limit = Math.min(100, Math.max(1, parseInt(req.query?.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);

    let where = `oa.agency_id = ? AND oa.is_active = 1 AND a.organization_type = 'affiliation' AND a.is_active = 1`;
    const params = [platformAgencyId];

    if (state) {
      where += ` AND (a.state = ? OR UPPER(TRIM(a.state)) = ?)`;
      const stateNorm = state.toUpperCase().trim();
      params.push(state, stateNorm);
    }

    if (search) {
      where += ` AND (a.name LIKE ? OR a.slug LIKE ? OR a.city LIKE ?)`;
      const pattern = `%${search.replace(/%/g, '\\%')}%`;
      params.push(pattern, pattern, pattern);
    }

    const searchLower = search ? search.toLowerCase().trim() : '';
    const orderBy = searchLower
      ? `CASE
           WHEN LOWER(a.name) = ? THEN 0
           WHEN LOWER(a.name) LIKE ? THEN 1
           WHEN LOWER(a.slug) LIKE ? THEN 2
           ELSE 3
         END, a.name ASC`
      : 'a.name ASC';
    const orderParams = searchLower
      ? [searchLower, `${searchLower}%`, `${searchLower}%`]
      : [];

    const [rows] = await pool.execute(
      `SELECT a.id, a.name, a.slug, a.state, a.city, a.organization_type, a.is_active, a.created_at
       FROM organization_affiliations oa
       JOIN agencies a ON a.id = oa.organization_id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, ...orderParams, limit, offset]
    );

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM organization_affiliations oa
       JOIN agencies a ON a.id = oa.organization_id
       WHERE ${where}`,
      params
    );
    const total = Number(countRows?.[0]?.total || 0);

    res.json({ clubs: rows || [], total });
  } catch (error) {
    next(error);
  }
};

/**
 * Apply to join a club. Requires auth. Assigns user to club.
 */
export const applyToClub = async (req, res, next) => {
  try {
    const clubId = parseInt(req.params.id, 10);
    if (!Number.isFinite(clubId) || clubId < 1) {
      return res.status(400).json({ error: { message: 'Invalid club ID' } });
    }

    const platformAgencyId = await getPlatformAgencyId();
    if (!platformAgencyId) {
      return res.status(503).json({ error: { message: 'Summit Stats platform is not configured.' } });
    }

    const [affRows] = await pool.execute(
      `SELECT oa.organization_id FROM organization_affiliations oa
       WHERE oa.agency_id = ? AND oa.organization_id = ? AND oa.is_active = 1`,
      [platformAgencyId, clubId]
    );
    if (!affRows?.length) {
      return res.status(404).json({ error: { message: 'Club not found' } });
    }

    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: { message: 'Sign in to apply' } });
    }

    const agencies = await User.getAgencies(user.id);
    const alreadyMember = (agencies || []).some((a) => Number(a?.id) === clubId);
    if (alreadyMember) {
      return res.status(400).json({ error: { message: 'You are already a member of this club' } });
    }

    await User.assignToAgency(user.id, clubId);

    const club = await Agency.findById(clubId);
    res.status(201).json({
      message: 'You have joined the club.',
      club: club ? { id: club.id, name: club.name, slug: club.slug } : null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get club manager context: clubs, email verified, can create club.
 */
export const getClubManagerContext = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: { message: 'Not authenticated' } });
    }

    const agencies = await User.getAgencies(user.id);
    const clubs = (agencies || []).filter(
      (a) => String(a?.organization_type || '').toLowerCase() === 'affiliation'
    );

    const dbName = process.env.DB_NAME || 'onboarding_stage';
    let emailVerified = true;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified_at'",
        [dbName]
      );
      if (cols?.length) {
        const [uRows] = await pool.execute(
          'SELECT email_verified_at FROM users WHERE id = ? LIMIT 1',
          [user.id]
        );
        emailVerified = !!uRows?.[0]?.email_verified_at;
      }
    } catch {
      emailVerified = true;
    }

    const canCreateClub = (user.role === 'admin' || user.role === 'super_admin') && emailVerified;
    const summitStatsScopedAdmin = user.role === 'admin' && clubs.length === 0;

    res.json({
      clubs,
      emailVerified,
      canCreateClub,
      summitStatsScopedAdmin
    });
  } catch (error) {
    next(error);
  }
};
