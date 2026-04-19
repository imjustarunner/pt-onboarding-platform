/**
 * SSTC season participation, club invite dismissals, and manager-broadcast
 * season announcements.
 *
 * Tables:
 *   - season_participation_decisions  (Phase 2)
 *   - club_invite_dismissals          (Phase 3)
 *   - season_announcements            (Phase 4)
 *   - season_announcement_acks        (Phase 4)
 *
 * Access rules:
 *   - "my-*" endpoints: caller must have an active club membership.
 *   - manager endpoints: caller must satisfy canUserManageClub(clubId).
 */

import pool from '../config/database.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import {
  canUserManageClub,
  getUserClubMembership
} from '../utils/sscClubAccess.js';
import Agency from '../models/Agency.model.js';

const VALID_DECISIONS = new Set(['joined', 'sitting_out', 'remind_me']);
const VALID_ACK_RESPONSES = new Set(['joined', 'sitting_out', 'remind_me', 'dismissed']);

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const requireSignIn = (req, res) => {
  if (!req.user?.id) {
    res.status(401).json({ error: { message: 'Sign in required' } });
    return false;
  }
  return true;
};

const requireClubAndClass = async (req, res) => {
  const clubId = toInt(req.params.clubId);
  const classId = toInt(req.params.classId);
  if (!clubId || !classId) {
    res.status(400).json({ error: { message: 'Invalid club or season' } });
    return null;
  }
  const klass = await LearningProgramClass.findById(classId);
  if (!klass || Number(klass.organization_id) !== clubId) {
    res.status(404).json({ error: { message: 'Season not found' } });
    return null;
  }
  return { clubId, classId, klass };
};

const requireManager = async (req, res, clubId) => {
  const ok = await canUserManageClub(req.user, clubId);
  if (!ok) {
    res.status(403).json({ error: { message: 'Manager access required' } });
    return false;
  }
  return true;
};

// Whether the user is currently enrolled in the season per
// learning_class_provider_memberships (the source of truth for "joined").
async function userIsEnrolledInSeason(userId, classId) {
  const [rows] = await pool.execute(
    `SELECT id, membership_status FROM learning_class_provider_memberships
     WHERE learning_class_id = ? AND provider_user_id = ? LIMIT 1`,
    [classId, userId]
  );
  const row = rows?.[0];
  if (!row) return false;
  const status = String(row.membership_status || '').toLowerCase();
  return status === 'active' || status === 'completed';
}

// ─────────────────────────────────────────────────────────────────
// Phase 2 — per-season participation decisions
// ─────────────────────────────────────────────────────────────────

/**
 * GET /summit-stats/clubs/:clubId/seasons/:classId/my-participation
 * Returns this user's recorded decision for the season (if any) and whether
 * they are enrolled per learning_class_provider_memberships.
 */
export const getMySeasonParticipation = async (req, res, next) => {
  try {
    if (!requireSignIn(req, res)) return;
    const ctx = await requireClubAndClass(req, res);
    if (!ctx) return;
    const { clubId, classId } = ctx;

    const membership = await getUserClubMembership(req.user.id, clubId);
    if (!membership) {
      return res.status(403).json({ error: { message: 'Club membership required' } });
    }

    const [rows] = await pool.execute(
      `SELECT decision, decided_at, source
       FROM season_participation_decisions
       WHERE user_id = ? AND learning_class_id = ?
       LIMIT 1`,
      [req.user.id, classId]
    );
    const row = rows?.[0] || null;

    const enrolled = await userIsEnrolledInSeason(req.user.id, classId);
    return res.json({
      classId,
      clubId,
      decision: row?.decision || (enrolled ? 'joined' : null),
      decidedAt: row?.decided_at || null,
      source: row?.source || null,
      enrolled
    });
  } catch (e) { next(e); }
};

/**
 * PUT /summit-stats/clubs/:clubId/seasons/:classId/my-participation
 * Body: { decision: 'joined' | 'sitting_out' | 'remind_me', source?: string }
 *
 * Recording 'sitting_out' or 'remind_me' is purely an intent signal — it
 * does NOT add or remove the user from learning_class_provider_memberships.
 * Recording 'joined' here only persists the intent; actual enrollment is
 * still done via the existing season-join flow (so race rules, eligibility,
 * etc. continue to apply).
 */
export const setMySeasonParticipation = async (req, res, next) => {
  try {
    if (!requireSignIn(req, res)) return;
    const ctx = await requireClubAndClass(req, res);
    if (!ctx) return;
    const { clubId, classId } = ctx;

    const membership = await getUserClubMembership(req.user.id, clubId);
    if (!membership) {
      return res.status(403).json({ error: { message: 'Club membership required' } });
    }

    const decisionRaw = String(req.body?.decision || '').trim().toLowerCase();
    if (!VALID_DECISIONS.has(decisionRaw)) {
      return res.status(400).json({ error: { message: 'Invalid decision' } });
    }
    const source = String(req.body?.source || 'dashboard').slice(0, 32) || 'dashboard';

    await pool.execute(
      `INSERT INTO season_participation_decisions
         (user_id, agency_id, learning_class_id, decision, source, decided_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         decision   = VALUES(decision),
         source     = VALUES(source),
         decided_at = NOW(),
         agency_id  = VALUES(agency_id)`,
      [req.user.id, clubId, classId, decisionRaw, source]
    );

    return res.json({ ok: true, decision: decisionRaw });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/clubs/:clubId/seasons/:classId/participation-summary
 * Manager-only. Returns the count + roster of joined / sitting_out /
 * remind_me / no_response (all club members minus those with a decision row).
 */
export const getSeasonParticipationSummary = async (req, res, next) => {
  try {
    if (!requireSignIn(req, res)) return;
    const ctx = await requireClubAndClass(req, res);
    if (!ctx) return;
    const { clubId, classId } = ctx;
    if (!(await requireManager(req, res, clubId))) return;

    const [memberRows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, ua.club_role
       FROM user_agencies ua
       INNER JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND ua.is_active = 1
         AND (u.is_archived IS NULL OR u.is_archived = 0)
       ORDER BY u.first_name ASC, u.last_name ASC, u.id ASC`,
      [clubId]
    );

    const userIds = (memberRows || []).map((r) => Number(r.id));
    let decisionsByUser = new Map();
    let enrolledIds = new Set();

    if (userIds.length) {
      const ph = userIds.map(() => '?').join(', ');
      const [decRows] = await pool.execute(
        `SELECT user_id, decision, decided_at
         FROM season_participation_decisions
         WHERE learning_class_id = ? AND user_id IN (${ph})`,
        [classId, ...userIds]
      );
      for (const r of decRows || []) {
        decisionsByUser.set(Number(r.user_id), {
          decision: r.decision,
          decidedAt: r.decided_at
        });
      }
      const [enrRows] = await pool.execute(
        `SELECT provider_user_id FROM learning_class_provider_memberships
         WHERE learning_class_id = ? AND provider_user_id IN (${ph})
           AND membership_status IN ('active', 'completed')`,
        [classId, ...userIds]
      );
      for (const r of enrRows || []) enrolledIds.add(Number(r.provider_user_id));
    }

    const buckets = { joined: [], sitting_out: [], remind_me: [], no_response: [] };
    for (const m of memberRows || []) {
      const uid = Number(m.id);
      const dec = decisionsByUser.get(uid);
      const isEnrolled = enrolledIds.has(uid);
      const effective = isEnrolled
        ? 'joined'
        : (dec?.decision || null);

      const row = {
        userId: uid,
        firstName: m.first_name || '',
        lastName: m.last_name || '',
        email: m.email || '',
        clubRole: m.club_role || 'member',
        decidedAt: dec?.decidedAt || null,
        enrolled: isEnrolled
      };
      if (effective === 'joined') buckets.joined.push(row);
      else if (effective === 'sitting_out') buckets.sitting_out.push(row);
      else if (effective === 'remind_me') buckets.remind_me.push(row);
      else buckets.no_response.push(row);
    }

    return res.json({
      classId,
      clubId,
      totalMembers: (memberRows || []).length,
      counts: {
        joined: buckets.joined.length,
        sitting_out: buckets.sitting_out.length,
        remind_me: buckets.remind_me.length,
        no_response: buckets.no_response.length
      },
      buckets
    });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────────
// Phase 3 — permanent club invite dismissals
// ─────────────────────────────────────────────────────────────────

/**
 * GET /summit-stats/me/club-invite-dismissals
 * Returns the agency_ids the user has permanently declined invites from.
 */
export const getMyClubInviteDismissals = async (req, res, next) => {
  try {
    if (!requireSignIn(req, res)) return;
    const [rows] = await pool.execute(
      `SELECT cid.agency_id, a.name AS agency_name, a.slug AS agency_slug,
              cid.dismissed_at, cid.reason
       FROM club_invite_dismissals cid
       INNER JOIN agencies a ON a.id = cid.agency_id
       WHERE cid.user_id = ?
       ORDER BY cid.dismissed_at DESC`,
      [req.user.id]
    );
    const dismissals = (rows || []).map((r) => ({
      agencyId: Number(r.agency_id),
      agencyName: r.agency_name || '',
      agencySlug: r.agency_slug || null,
      dismissedAt: r.dismissed_at,
      reason: r.reason || null
    }));
    return res.json({ dismissals });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/me/clubs/:clubId/dismiss-invites
 * Body: { reason?: string }
 * Permanently dismisses any future invite/announcement from this club for
 * this user. If the user is currently a member of the club, this does NOT
 * remove them — it just records the intent so future *invitations* are
 * suppressed.
 */
export const dismissClubInvitesForever = async (req, res, next) => {
  try {
    if (!requireSignIn(req, res)) return;
    const clubId = toInt(req.params.clubId);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club' } });
    const club = await Agency.findById(clubId);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });

    const reason = String(req.body?.reason || '').slice(0, 160) || null;
    await pool.execute(
      `INSERT INTO club_invite_dismissals (user_id, agency_id, reason)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         reason       = COALESCE(VALUES(reason), reason),
         dismissed_at = NOW()`,
      [req.user.id, clubId, reason]
    );
    return res.json({ ok: true, agencyId: clubId });
  } catch (e) { next(e); }
};

/**
 * DELETE /summit-stats/me/clubs/:clubId/dismiss-invites
 * Re-engage: removes the permanent dismissal so future invites are visible.
 */
export const reEngageClubInvites = async (req, res, next) => {
  try {
    if (!requireSignIn(req, res)) return;
    const clubId = toInt(req.params.clubId);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club' } });
    await pool.execute(
      `DELETE FROM club_invite_dismissals WHERE user_id = ? AND agency_id = ?`,
      [req.user.id, clubId]
    );
    return res.json({ ok: true, agencyId: clubId });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────────
// Phase 4 — manager "Announce season" splashes
// ─────────────────────────────────────────────────────────────────

/**
 * POST /summit-stats/clubs/:clubId/seasons/:classId/announcements
 * Body: { headline, body?, audience?, expiresAt? }
 * Manager-only. Creates a splash that all current club members will see on
 * their next dashboard load (until they respond or dismiss).
 */
export const createSeasonAnnouncement = async (req, res, next) => {
  try {
    if (!requireSignIn(req, res)) return;
    const ctx = await requireClubAndClass(req, res);
    if (!ctx) return;
    const { clubId, classId } = ctx;
    if (!(await requireManager(req, res, clubId))) return;

    const headline = String(req.body?.headline || '').trim().slice(0, 180);
    if (!headline) return res.status(400).json({ error: { message: 'Headline is required' } });

    const body = req.body?.body == null ? null : String(req.body.body).trim();
    const audience = String(req.body?.audience || 'all_members').toLowerCase();
    if (!['all_members', 'team_captains_only'].includes(audience)) {
      return res.status(400).json({ error: { message: 'Invalid audience' } });
    }
    let expiresAt = null;
    if (req.body?.expiresAt) {
      const d = new Date(req.body.expiresAt);
      if (Number.isFinite(d.getTime())) expiresAt = d;
    }

    const [result] = await pool.execute(
      `INSERT INTO season_announcements
         (agency_id, learning_class_id, created_by, headline, body, audience, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [clubId, classId, req.user.id, headline, body, audience, expiresAt]
    );

    return res.status(201).json({
      id: Number(result.insertId),
      clubId,
      classId,
      headline,
      body,
      audience,
      expiresAt
    });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/clubs/:clubId/seasons/:classId/announcements
 * Manager-only. Returns the broadcast history with response counts.
 */
export const listSeasonAnnouncements = async (req, res, next) => {
  try {
    if (!requireSignIn(req, res)) return;
    const ctx = await requireClubAndClass(req, res);
    if (!ctx) return;
    const { clubId, classId } = ctx;
    if (!(await requireManager(req, res, clubId))) return;

    const [rows] = await pool.execute(
      `SELECT sa.id, sa.headline, sa.body, sa.audience, sa.is_active,
              sa.delivered_at, sa.expires_at, sa.created_by,
              u.first_name AS by_first, u.last_name AS by_last,
              (SELECT COUNT(*) FROM season_announcement_acks WHERE announcement_id = sa.id) AS total_acks,
              (SELECT COUNT(*) FROM season_announcement_acks WHERE announcement_id = sa.id AND response = 'joined') AS ack_joined,
              (SELECT COUNT(*) FROM season_announcement_acks WHERE announcement_id = sa.id AND response = 'sitting_out') AS ack_sitting_out,
              (SELECT COUNT(*) FROM season_announcement_acks WHERE announcement_id = sa.id AND response = 'remind_me') AS ack_remind_me,
              (SELECT COUNT(*) FROM season_announcement_acks WHERE announcement_id = sa.id AND response = 'dismissed') AS ack_dismissed
       FROM season_announcements sa
       LEFT JOIN users u ON u.id = sa.created_by
       WHERE sa.agency_id = ? AND sa.learning_class_id = ?
       ORDER BY sa.delivered_at DESC, sa.id DESC`,
      [clubId, classId]
    );
    const announcements = (rows || []).map((r) => ({
      id: Number(r.id),
      headline: r.headline,
      body: r.body,
      audience: r.audience,
      isActive: !!r.is_active,
      deliveredAt: r.delivered_at,
      expiresAt: r.expires_at,
      createdBy: {
        id: Number(r.created_by),
        firstName: r.by_first || '',
        lastName: r.by_last || ''
      },
      acks: {
        total: Number(r.total_acks || 0),
        joined: Number(r.ack_joined || 0),
        sitting_out: Number(r.ack_sitting_out || 0),
        remind_me: Number(r.ack_remind_me || 0),
        dismissed: Number(r.ack_dismissed || 0)
      }
    }));
    return res.json({ announcements });
  } catch (e) { next(e); }
};

/**
 * DELETE /summit-stats/clubs/:clubId/seasons/:classId/announcements/:id
 * Manager-only. Soft-cancels (is_active = 0) so the splash stops appearing.
 */
export const cancelSeasonAnnouncement = async (req, res, next) => {
  try {
    if (!requireSignIn(req, res)) return;
    const ctx = await requireClubAndClass(req, res);
    if (!ctx) return;
    const { clubId } = ctx;
    if (!(await requireManager(req, res, clubId))) return;

    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid announcement' } });
    await pool.execute(
      `UPDATE season_announcements SET is_active = 0 WHERE id = ? AND agency_id = ?`,
      [id, clubId]
    );
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/me/pending-season-announcements
 * Returns the active, unacked announcements for clubs the user belongs to,
 * filtered by club_invite_dismissals (decline-forever) and excluding any
 * the user has already responded to.
 *
 * For audience='team_captains_only', only emit if the user is a team captain.
 */
export const listMyPendingSeasonAnnouncements = async (req, res, next) => {
  try {
    if (!requireSignIn(req, res)) return;
    const userId = req.user.id;

    const [memberAgencies] = await pool.execute(
      `SELECT ua.agency_id, a.name AS agency_name, a.slug AS agency_slug
       FROM user_agencies ua
       INNER JOIN agencies a ON a.id = ua.agency_id
       WHERE ua.user_id = ?
         AND ua.is_active = 1
         AND a.organization_type = 'affiliation'`,
      [userId]
    );
    const agencyIds = (memberAgencies || []).map((r) => Number(r.agency_id));
    if (!agencyIds.length) return res.json({ announcements: [] });

    const [dismissedRows] = await pool.execute(
      `SELECT agency_id FROM club_invite_dismissals WHERE user_id = ?`,
      [userId]
    );
    const dismissed = new Set((dismissedRows || []).map((r) => Number(r.agency_id)));
    const agencyIdsActive = agencyIds.filter((id) => !dismissed.has(id));
    if (!agencyIdsActive.length) return res.json({ announcements: [] });

    const ph = agencyIdsActive.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT sa.id, sa.agency_id, sa.learning_class_id, sa.headline, sa.body,
              sa.audience, sa.delivered_at, sa.expires_at,
              a.name AS club_name, a.slug AS club_slug,
              c.class_name AS season_name, c.starts_at AS season_starts_at, c.ends_at AS season_ends_at
       FROM season_announcements sa
       INNER JOIN agencies a ON a.id = sa.agency_id
       LEFT JOIN learning_program_classes c ON c.id = sa.learning_class_id
       LEFT JOIN season_announcement_acks ack
         ON ack.announcement_id = sa.id AND ack.user_id = ?
       WHERE sa.is_active = 1
         AND sa.agency_id IN (${ph})
         AND ack.id IS NULL
         AND (sa.expires_at IS NULL OR sa.expires_at > NOW())
       ORDER BY sa.delivered_at DESC`,
      [userId, ...agencyIdsActive]
    );

    // For team_captains_only audience, filter to users who are captains.
    let captainClassIds = new Set();
    const captainOnly = (rows || []).filter((r) => r.audience === 'team_captains_only');
    if (captainOnly.length) {
      const classIds = [...new Set(captainOnly.map((r) => Number(r.learning_class_id)))];
      const cph = classIds.map(() => '?').join(', ');
      try {
        const [capRows] = await pool.execute(
          `SELECT learning_class_id FROM challenge_teams
           WHERE team_manager_user_id = ? AND learning_class_id IN (${cph})`,
          [userId, ...classIds]
        );
        for (const r of capRows || []) captainClassIds.add(Number(r.learning_class_id));
      } catch {
        // captain table not present; be conservative and skip captain-only items
      }
    }

    const announcements = (rows || [])
      .filter((r) => {
        if (r.audience === 'team_captains_only') {
          return captainClassIds.has(Number(r.learning_class_id));
        }
        return true;
      })
      .map((r) => ({
        id: Number(r.id),
        clubId: Number(r.agency_id),
        clubName: r.club_name || '',
        clubSlug: r.club_slug || null,
        classId: Number(r.learning_class_id),
        seasonName: r.season_name || '',
        seasonStartsAt: r.season_starts_at || null,
        seasonEndsAt: r.season_ends_at || null,
        headline: r.headline,
        body: r.body,
        audience: r.audience,
        deliveredAt: r.delivered_at,
        expiresAt: r.expires_at
      }));

    return res.json({ announcements });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/me/season-announcements/:id/respond
 * Body: { response: 'joined' | 'sitting_out' | 'remind_me' | 'dismissed' }
 *
 * Records the user's response. If response is 'sitting_out', 'remind_me',
 * or 'joined', also writes a season_participation_decisions row so the
 * intent is reflected on the season UI consistently. ('joined' here is a
 * signal of intent — actual enrollment still flows through the existing
 * join-season endpoint.)
 */
export const respondToSeasonAnnouncement = async (req, res, next) => {
  try {
    if (!requireSignIn(req, res)) return;
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid announcement' } });
    const responseRaw = String(req.body?.response || '').trim().toLowerCase();
    if (!VALID_ACK_RESPONSES.has(responseRaw)) {
      return res.status(400).json({ error: { message: 'Invalid response' } });
    }

    const [annRows] = await pool.execute(
      `SELECT id, agency_id, learning_class_id, is_active
       FROM season_announcements WHERE id = ? LIMIT 1`,
      [id]
    );
    const ann = annRows?.[0];
    if (!ann) return res.status(404).json({ error: { message: 'Announcement not found' } });

    const membership = await getUserClubMembership(req.user.id, Number(ann.agency_id));
    if (!membership) {
      return res.status(403).json({ error: { message: 'Club membership required' } });
    }

    await pool.execute(
      `INSERT INTO season_announcement_acks (announcement_id, user_id, response)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE response = VALUES(response), acted_at = NOW()`,
      [id, req.user.id, responseRaw]
    );

    if (responseRaw !== 'dismissed') {
      await pool.execute(
        `INSERT INTO season_participation_decisions
           (user_id, agency_id, learning_class_id, decision, source, decided_at)
         VALUES (?, ?, ?, ?, 'season_announcement', NOW())
         ON DUPLICATE KEY UPDATE
           decision   = VALUES(decision),
           source     = 'season_announcement',
           decided_at = NOW()`,
        [req.user.id, Number(ann.agency_id), Number(ann.learning_class_id), responseRaw]
      );
    }

    return res.json({ ok: true, response: responseRaw });
  } catch (e) { next(e); }
};
