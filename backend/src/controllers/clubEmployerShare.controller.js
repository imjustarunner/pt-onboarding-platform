import pool from '../config/database.js';
import { canUserManageClub } from '../utils/sscClubAccess.js';
import { sqlAffiliationUnderSummitPlatform } from '../utils/summitPlatformClubs.js';
import { getPlatformAgencyIds } from './summitStats.controller.js';

async function assertClubAffiliationOnSummitPlatform(clubId, platformAgencyIds) {
  const plat = sqlAffiliationUnderSummitPlatform('a', platformAgencyIds);
  if (!plat) return false;
  const [rows] = await pool.execute(
    `SELECT a.id FROM agencies a
     WHERE a.id = ? AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'${plat.sql}`,
    [clubId, ...plat.params]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function userHasEmployerMembership(userId, employerAgencyId) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? AND is_active = 1 LIMIT 1`,
    [userId, employerAgencyId]
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * POST /summit-stats/clubs/:clubId/share-with-employer
 * Body: { employerAgencyId, message? }
 */
export const postClubShareWithEmployer = async (req, res) => {
  try {
    const clubId = Number(req.params.clubId);
    const employerAgencyId = Number(req.body?.employerAgencyId);
    const message = req.body?.message != null ? String(req.body.message).trim().slice(0, 2000) : null;
    if (!Number.isFinite(clubId) || clubId <= 0 || !Number.isFinite(employerAgencyId) || employerAgencyId <= 0) {
      return res.status(400).json({ error: { message: 'clubId and employerAgencyId are required' } });
    }
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: { message: 'Sign in required' } });

    if (!(await canUserManageClub({ user, clubId }))) {
      return res.status(403).json({ error: { message: 'Club manager access required' } });
    }

    const platformIds = await getPlatformAgencyIds(null);
    if (!(await assertClubAffiliationOnSummitPlatform(clubId, platformIds))) {
      return res.status(400).json({ error: { message: 'Club is not on the Summit platform' } });
    }

    const [empRows] = await pool.execute(
      `SELECT id, organization_type FROM agencies WHERE id = ? LIMIT 1`,
      [employerAgencyId]
    );
    const emp = empRows?.[0];
    if (!emp) return res.status(404).json({ error: { message: 'Employer agency not found' } });
    if (String(emp.organization_type || '').toLowerCase() === 'affiliation') {
      return res.status(400).json({ error: { message: 'Employer must be a work tenant, not a club' } });
    }

    if (!(await userHasEmployerMembership(user.id, employerAgencyId))) {
      return res.status(403).json({ error: { message: 'You are not a member of that employer agency' } });
    }

    const [r] = await pool.execute(
      `INSERT INTO club_employer_share_broadcasts (club_id, employer_agency_id, created_by_user_id, message)
       VALUES (?, ?, ?, ?)`,
      [clubId, employerAgencyId, user.id, message || null]
    );
    const insertId = r?.insertId;
    return res.status(201).json({ ok: true, id: insertId });
  } catch (e) {
    console.error('postClubShareWithEmployer', e);
    return res.status(500).json({ error: { message: 'Failed to share club with employer' } });
  }
};

/**
 * GET /api/me/club-employer-share-prompts?agencyId=
 */
export const getMyClubEmployerSharePrompts = async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: { message: 'Sign in required' } });

    const agencyId = Number(req.query.agencyId);
    if (!Number.isFinite(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'agencyId query parameter is required' } });
    }

    if (!(await userHasEmployerMembership(user.id, agencyId))) {
      return res.status(403).json({ error: { message: 'Not a member of this agency' } });
    }

    const [rows] = await pool.execute(
      `SELECT b.id AS broadcastId, b.club_id AS clubId, b.message, b.created_at AS createdAt,
              a.name AS clubName,
              COALESCE(NULLIF(TRIM(a.slug), ''), NULLIF(TRIM(a.portal_url), '')) AS clubSlug
       FROM club_employer_share_broadcasts b
       INNER JOIN agencies a ON a.id = b.club_id
       LEFT JOIN club_employer_share_responses r
         ON r.broadcast_id = b.id AND r.user_id = ?
       WHERE b.employer_agency_id = ?
         AND b.revoked_at IS NULL
         AND r.id IS NULL
       ORDER BY b.created_at DESC
       LIMIT 20`,
      [user.id, agencyId]
    );

    return res.json({ prompts: rows || [] });
  } catch (e) {
    console.error('getMyClubEmployerSharePrompts', e);
    return res.status(500).json({ error: { message: 'Failed to load prompts' } });
  }
};

/**
 * POST /api/me/club-employer-share-prompts/:broadcastId/respond
 * Body: { action: 'join' | 'dismiss' | 'never' }
 */
export const postMyClubEmployerSharePromptRespond = async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: { message: 'Sign in required' } });

    const broadcastId = Number(req.params.broadcastId);
    if (!Number.isFinite(broadcastId) || broadcastId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid broadcast' } });
    }
    const action = String(req.body?.action || '').toLowerCase();
    if (!['join', 'dismiss', 'never'].includes(action)) {
      return res.status(400).json({ error: { message: 'action must be join, dismiss, or never' } });
    }

    const [brows] = await pool.execute(
      `SELECT b.id, b.employer_agency_id AS employerAgencyId
       FROM club_employer_share_broadcasts b
       WHERE b.id = ? AND b.revoked_at IS NULL LIMIT 1`,
      [broadcastId]
    );
    const b = brows?.[0];
    if (!b) return res.status(404).json({ error: { message: 'Broadcast not found' } });

    if (!(await userHasEmployerMembership(user.id, b.employerAgencyId))) {
      return res.status(403).json({ error: { message: 'Not allowed for this prompt' } });
    }

    await pool.execute(
      `INSERT INTO club_employer_share_responses (broadcast_id, user_id, action)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE action = VALUES(action), updated_at = CURRENT_TIMESTAMP`,
      [broadcastId, user.id, action]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error('postMyClubEmployerSharePromptRespond', e);
    return res.status(500).json({ error: { message: 'Failed to save response' } });
  }
};
