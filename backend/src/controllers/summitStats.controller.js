import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import pool from '../config/database.js';
import { validationResult } from 'express-validator';

function slugify(name) {
  let s = String(name || '').trim();
  // Strip possessives (e.g. "Superhero's" -> "Superhero") to avoid awkward "s-s" in slug
  s = s.replace(/'s\b/gi, '').replace(/\s+/g, ' ');
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-') // collapse consecutive hyphens
    .replace(/^-|-$/g, '');
}

/** Resolve Summit Stats platform agency ID (for club creation, club manager emails, etc.). */
export async function getPlatformAgencyId() {
  const envId = process.env.SUMMIT_STATS_PLATFORM_AGENCY_ID;
  if (envId) {
    const id = parseInt(envId, 10);
    if (Number.isFinite(id) && id > 0) return id;
  }
  const slug = process.env.SUMMIT_STATS_PLATFORM_SLUG || 'ssc';
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

    const dbName = process.env.DB_NAME || 'onboarding_stage';
    const [agencyCols] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'agencies'",
      [dbName]
    );
    const agencyColumnSet = new Set((agencyCols || []).map((r) => r.COLUMN_NAME));
    const hasState = agencyColumnSet.has('state');
    const hasCity = agencyColumnSet.has('city');

    const search = String(req.query?.search || req.query?.q || '').trim();
    const state = String(req.query?.state || '').trim();
    // Inline LIMIT/OFFSET: some MySQL/CloudSQL setups reject prepared-statement params for these
    const limit = Math.trunc(Math.min(100, Math.max(1, parseInt(req.query?.limit, 10) || 50)));
    const offset = Math.trunc(Math.max(0, parseInt(req.query?.offset, 10) || 0));

    let where = `oa.agency_id = ? AND oa.is_active = 1 AND a.organization_type = 'affiliation' AND a.is_active = 1`;
    const params = [platformAgencyId];

    if (state && hasState) {
      where += ` AND (a.state = ? OR UPPER(TRIM(a.state)) = ?)`;
      const stateNorm = state.toUpperCase().trim();
      params.push(state, stateNorm);
    }

    if (search) {
      const searchConditions = ['a.name LIKE ?', 'a.slug LIKE ?'];
      if (hasCity) searchConditions.push('a.city LIKE ?');
      where += ` AND (${searchConditions.join(' OR ')})`;
      const pattern = `%${search.replace(/%/g, '\\%')}%`;
      params.push(...searchConditions.map(() => pattern));
    }

    const selectCols = ['a.id', 'a.name', 'a.slug'];
    if (hasState) selectCols.push('a.state');
    if (hasCity) selectCols.push('a.city');
    selectCols.push('a.organization_type', 'a.is_active', 'a.created_at');

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
      `SELECT ${selectCols.join(', ')}
       FROM organization_affiliations oa
       JOIN agencies a ON a.id = oa.organization_id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      [...params, ...orderParams]
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
 * Add a member to a club by email. Club manager only.
 * Checks if user exists: if yes, assigns to club; if no, returns exists: false with invite guidance.
 */
export const addMemberToClub = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: errors.array()[0]?.msg || 'Validation failed', errors: errors.array() } });
    }

    const clubId = parseInt(req.params.id, 10);
    if (!Number.isFinite(clubId) || clubId < 1) {
      return res.status(400).json({ error: { message: 'Invalid club ID' } });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: { message: 'Valid email is required' } });
    }

    const user = req.user;
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Club manager access required' } });
    }

    const userAgencies = await User.getAgencies(user.id);
    const hasAccess = (userAgencies || []).some((a) => Number(a?.id) === clubId);
    if (!hasAccess) {
      return res.status(403).json({ error: { message: 'You do not have access to this club' } });
    }

    const [clubRows] = await pool.execute(
      'SELECT id, organization_type FROM agencies WHERE id = ? LIMIT 1',
      [clubId]
    );
    const club = clubRows?.[0];
    if (!club || String(club.organization_type || '').toLowerCase() !== 'affiliation') {
      return res.status(404).json({ error: { message: 'Club not found' } });
    }

    const existingUser = await User.findByEmail(email);
    if (!existingUser) {
      return res.json({
        exists: false,
        message: 'No account found with this email. They can sign up as a participant and apply to join your club.'
      });
    }

    const agencies = await User.getAgencies(existingUser.id);
    const alreadyMember = (agencies || []).some((a) => Number(a?.id) === clubId);
    if (alreadyMember) {
      return res.status(400).json({ error: { message: 'This person is already a member of your club' } });
    }

    await User.assignToAgency(existingUser.id, clubId);
    const displayName = `${(existingUser.first_name || '').trim()} ${(existingUser.last_name || '').trim()}`.trim() || email;
    return res.json({
      exists: true,
      added: true,
      message: displayName ? `${displayName} has been added to your club.` : 'Member added to your club.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get club specs: fitness totals and current season metrics.
 * GET /api/summit-stats/club-specs?agencyId=123
 */
export const getClubSpecs = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.query.agencyId, 10);
    if (!Number.isFinite(agencyId) || agencyId < 1) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const user = req.user;
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(user.id);
      const hasAccess = (userAgencies || []).some((a) => Number(a?.id) === agencyId);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this club' } });
      }
    }

    const [orgRows] = await pool.execute(
      'SELECT id, organization_type FROM agencies WHERE id = ? LIMIT 1',
      [agencyId]
    );
    const org = orgRows?.[0];
    if (!org || String(org.organization_type || '').toLowerCase() !== 'affiliation') {
      return res.status(404).json({ error: { message: 'Club not found' } });
    }

    const result = {
      agencyId,
      refreshedAt: new Date().toISOString(),
      totalMiles: 0,
      estimatedCalories: 0,
      totalPoints: 0,
      totalWorkouts: 0,
      currentSeason: null
    };

    try {
      const [totals] = await pool.execute(
        `SELECT
           COUNT(w.id) AS workout_count,
           COALESCE(SUM(w.points), 0) AS total_points,
           COALESCE(SUM(w.distance_value), 0) AS total_distance,
           COALESCE(SUM(w.duration_minutes), 0) AS total_duration
         FROM challenge_workouts w
         INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
         WHERE c.organization_id = ?`,
        [agencyId]
      );
      const r = totals?.[0];
      result.totalWorkouts = Number(r?.workout_count || 0);
      result.totalPoints = Number(r?.total_points || 0);
      result.totalMiles = Math.round(Number(r?.total_distance || 0) * 100) / 100;

      const [byType] = await pool.execute(
        `SELECT w.activity_type, w.distance_value, w.duration_minutes
         FROM challenge_workouts w
         INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
         WHERE c.organization_id = ?`,
        [agencyId]
      );
      let estCal = 0;
      for (const row of byType || []) {
        const at = String(row?.activity_type || '').toLowerCase();
        const dist = Number(row?.distance_value || 0);
        const dur = Number(row?.duration_minutes || 0);
        if (dist > 0) {
          if (at === 'running') estCal += dist * 100;
          else if (at === 'cycling') estCal += dist * 50;
          else estCal += dist * 75;
        } else if (dur > 0) {
          estCal += dur * 8;
        }
      }
      result.estimatedCalories = Math.round(estCal);
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }

    try {
      const [seasonRows] = await pool.execute(
        `SELECT c.id, c.class_name, c.status, c.starts_at, c.ends_at,
                (SELECT COUNT(DISTINCT pm.provider_user_id)
                 FROM learning_class_provider_memberships pm
                 WHERE pm.learning_class_id = c.id AND pm.membership_status IN ('active','completed')) AS participants,
                (SELECT COUNT(*) FROM challenge_teams t WHERE t.learning_class_id = c.id) AS teams,
                (SELECT COUNT(*) FROM challenge_workouts w WHERE w.learning_class_id = c.id) AS workouts
         FROM learning_program_classes c
         WHERE c.organization_id = ? AND c.is_active = 1
         ORDER BY CASE WHEN LOWER(COALESCE(c.status,'')) = 'active' THEN 0 ELSE 1 END, COALESCE(c.starts_at, '9999-12-31') DESC, c.id DESC
         LIMIT 1`,
        [agencyId]
      );
      const season = seasonRows?.[0];
      if (season) {
        result.currentSeason = {
          id: season.id,
          name: season.class_name,
          status: season.status || 'draft',
          participants: Number(season.participants || 0),
          teams: Number(season.teams || 0),
          workouts: Number(season.workouts || 0),
          startsAt: season.starts_at,
          endsAt: season.ends_at
        };
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }

    res.json(result);
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
