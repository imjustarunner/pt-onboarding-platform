/**
 * Summit Stats Team Challenge controller
 * Teams, workouts, leaderboards, activity feed.
 * Challenges are learning_program_classes; UI displays as "Challenges".
 */
import pool from '../config/database.js';
import crypto from 'crypto';
import { RACE_DISTANCES, DEFAULT_ENABLED_KEYS } from '../utils/raceDistances.js';
import Icon from '../models/Icon.model.js';
import ChallengeTeam from '../models/ChallengeTeam.model.js';
import ChallengeWorkout from '../models/ChallengeWorkout.model.js';
import User from '../models/User.model.js';
import ChallengeWeeklyTask from '../models/ChallengeWeeklyTask.model.js';
import ChallengeWeeklyAssignment from '../models/ChallengeWeeklyAssignment.model.js';
import ChallengeCaptainApplication from '../models/ChallengeCaptainApplication.model.js';
import ChallengeMessage from '../models/ChallengeMessage.model.js';
import ChallengeWorkoutComment from '../models/ChallengeWorkoutComment.model.js';
import ChallengeWorkoutMedia from '../models/ChallengeWorkoutMedia.model.js';
import { queueClubRecordBreakCandidates, getPlatformAgencyId, getPlatformAgencyIds } from './summitStats.controller.js';
import { sqlAffiliationUnderSummitPlatform } from '../utils/summitPlatformClubs.js';
import { canManageTeam } from '../utils/challengePermissions.js';
import { canAccessChallenge, resolveChallengeAccessOrManage } from '../utils/challengeAccess.js';
import { ensureChallengeParticipationAgreementAccepted } from '../utils/challengeParticipationAgreement.js';
import EmailService from '../services/email.service.js';
import config from '../config/config.js';
import {
  getWeekStartDate,
  getWeekDateTimeRange,
  getSeasonWeekMileGoals,
  resolveWeeklyDistanceTargets,
  weekSeventhPaceState,
  firstCompetitionWeekDate as firstCompetitionWeekDateUtil
} from '../utils/challengeWeekUtils.js';
import { enqueueWorkoutVision, scanWorkoutScreenshot as scanWorkoutScreenshotWithVision } from '../services/challengeWorkoutVision.service.js';
import { challengeMessageBridge } from '../services/challengeMessageBridge.service.js';
import { canUserManageChallengeClass } from '../utils/sscClubAccess.js';
import { sanitizeCalories, estimateCalories } from '../utils/calorieUtils.js';
import { normalizeActivityType } from '../utils/activityTypeUtils.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import ChallengeElimination from '../models/ChallengeElimination.model.js';

const asInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

// mysql2 returns DATE columns as JS Date objects (UTC midnight + local offset).
// Using String(date).slice(0,10) gives the LOCAL day name (e.g. "Sat Apr 25").
// Always use toISOString() to get the UTC-based YYYY-MM-DD string.
const dateToYmd = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // If already YYYY-MM-DD return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // If ISO string with time component, slice the date part
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10);
};

const parseJsonObject = (raw, fallback = {}) => {
  if (!raw) return fallback;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  return fallback;
};

const isApprovedWeeklyAssignment = (assignment) => !!assignment;

const canManageChallengeRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'staff' || r === 'clinical_practice_assistant' || r === 'provider_plus';
};

const canManageChallenge = async ({ user, classId }) => {
  if (!classId) return canManageChallengeRole(user?.role);
  if (await canUserManageChallengeClass({ user, learningClassId: classId })) return true;
  return canManageChallengeRole(user?.role);
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizePhoneNumber = (value) => User.normalizePhone(value);

const normalizePersonName = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9\s'-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const splitRosterName = (row = {}) => {
  const display = String(row.displayName || row.name || '').trim();
  const first = String(row.firstName || row.first_name || '').trim();
  const last = String(row.lastName || row.last_name || '').trim();
  if (first || last) return { firstName: first || null, lastName: last || 'Member', displayName: `${first} ${last}`.trim() };
  const parts = display.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: 'Member', displayName: 'Roster Member' };
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Member', displayName: parts[0] };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1], displayName: display };
};

const getChallengeClassRow = async (classId) => {
  const [rows] = await pool.execute(
    `SELECT c.id, c.organization_id, c.season_settings_json, c.week_start_time, c.status,
            a.slug AS organization_slug, a.name AS organization_name
     FROM learning_program_classes c
     INNER JOIN agencies a ON a.id = c.organization_id
     WHERE c.id = ?
     LIMIT 1`,
    [classId]
  );
  return rows?.[0] || null;
};

const isBerlinClassRow = (classRow) => {
  const slug = String(classRow?.organization_slug || '').trim().toLowerCase();
  const name = String(classRow?.organization_name || '').trim().toLowerCase();
  return slug === 'berlin' || name.includes('berlin');
};

const ensureChallengeRosterMember = async ({ classId, classRow, row, createdByUserId }) => {
  const { firstName, lastName, displayName } = splitRosterName(row);
  const email = normalizeEmail(row.email);
  const phoneNumber = normalizePhoneNumber(row.phoneNumber || row.phone_number || row.phone || row.mobile);
  let user = email ? await User.findByEmail(email) : null;
  if (!user?.id && phoneNumber) user = await User.findByPhone(phoneNumber);
  let createdPlaceholder = false;
  if (!user?.id) {
    const syntheticEmail = email || `roster-${classId}-${crypto.randomUUID()}@placeholder.sstc.local`;
    user = await User.create({
      email: syntheticEmail,
      personalEmail: email || syntheticEmail,
      passwordHash: null,
      firstName,
      lastName,
      phoneNumber,
      role: 'provider',
      status: 'ACTIVE_EMPLOYEE'
    });
    createdPlaceholder = true;
    await pool.execute(
      `UPDATE users
       SET is_roster_placeholder = 1,
           roster_placeholder_claim_email = ?,
           roster_placeholder_claimed_at = NULL
       WHERE id = ?`,
      [email || null, user.id]
    );
  } else if (phoneNumber) {
    await pool.execute(
      `UPDATE users
       SET phone_number = COALESCE(NULLIF(phone_number, ''), ?)
       WHERE id = ?`,
      [phoneNumber, user.id]
    ).catch(() => {});
  }

  const clubId = Number(classRow?.organization_id || 0) || null;
  if (clubId) await User.assignToAgency(user.id, clubId, { clubRole: 'member', isActive: true });
  const platformAgencyId = await getPlatformAgencyId();
  if (platformAgencyId) await User.assignToAgency(user.id, platformAgencyId, { isActive: true });

  await pool.execute(
    `INSERT INTO learning_class_provider_memberships
       (learning_class_id, provider_user_id, membership_status, joined_at, role_label, notes, created_by_user_id)
     VALUES (?, ?, 'active', NOW(), NULL, ?, ?)
     ON DUPLICATE KEY UPDATE
       membership_status = IF(membership_status = 'removed', 'active', membership_status),
       joined_at = COALESCE(joined_at, NOW()),
       notes = COALESCE(VALUES(notes), notes),
       updated_at = NOW()`,
    [classId, user.id, 'Imported by manager roster upload', createdByUserId || null]
  );

  const teamName = String(row.teamName || row.team_name || row.team || '').trim();
  let team = null;
  if (teamName) {
    const [teamRows] = await pool.execute(
      `SELECT * FROM challenge_teams WHERE learning_class_id = ? AND LOWER(team_name) = LOWER(?) LIMIT 1`,
      [classId, teamName]
    );
    team = teamRows?.[0] || await ChallengeTeam.create({ learningClassId: classId, teamName });
    if (team?.id) await ChallengeTeam.addMember({ teamId: team.id, providerUserId: user.id });
  }

  return {
    userId: user.id,
    email: email || null,
    phoneNumber,
    displayName,
    firstName,
    lastName,
    teamId: team?.id || null,
    teamName: team?.team_name || teamName || null,
    createdPlaceholder
  };
};

const rosterDisplayName = (member) => `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email || `User ${member.provider_user_id || member.id}`;

const scoreRosterNameAgainstText = (member, rawText) => {
  const text = normalizePersonName(rawText);
  if (!text) return 0;
  const full = normalizePersonName(rosterDisplayName(member));
  const first = normalizePersonName(member.first_name);
  const last = normalizePersonName(member.last_name);
  const firstInitial = first ? first[0] : '';
  let score = 0;
  if (full && text.includes(full)) score += 100;
  if (first && first.length > 1 && text.includes(first)) score += 35;
  if (last && last.length > 1 && text.includes(last)) score += 55;
  if (firstInitial && last && new RegExp(`\\b${escapeRegExp(firstInitial)}[a-z]*\\s+${escapeRegExp(last)}\\b`, 'i').test(text)) score += 95;
  if (firstInitial && last && new RegExp(`\\b${escapeRegExp(firstInitial)}\\s+${escapeRegExp(last)}\\b`, 'i').test(text)) score += 95;
  if (member.email && text.includes(normalizeEmail(member.email).split('@')[0].replace(/[._-]+/g, ' '))) score += 20;
  return Math.min(100, score);
};

const matchRosterMemberFromText = (members, rawText) => {
  let best = null;
  for (const member of members || []) {
    const score = scoreRosterNameAgainstText(member, rawText);
    if (!best || score > best.score) best = { member, score };
  }
  if (!best || best.score < 70) return { matchedUserId: null, confidence: best?.score || 0, match: null, needsMemberSelection: true };
  return {
    matchedUserId: Number(best.member.provider_user_id || best.member.id),
    confidence: best.score,
    match: best.member,
    needsMemberSelection: false
  };
};

const calculateChallengeWorkoutPoints = ({ activityType, distanceValue, caloriesBurned, durationMinutes, settings }) => {
  const eventCategory = String(settings?.event?.category || 'run_ruck').toLowerCase();
  const scoring = parseJsonObject(settings?.scoring || {});
  const runMilesPerPoint = Number(scoring.runMilesPerPoint || 1) || 1;
  const ruckMilesPerPoint = Number(scoring.ruckMilesPerPoint || 1) || 1;
  const caloriesPerPoint = Number(scoring.caloriesPerPoint || 100) || 100;
  const activityLower = String(activityType || '').toLowerCase();
  const isRunLike = activityLower.includes('run') || activityLower.includes('walk') || activityLower.includes('ruck') || activityLower.includes('step');
  if (eventCategory === 'run_ruck' && isRunLike && distanceValue != null && Number.isFinite(Number(distanceValue))) {
    const divisor = activityLower.includes('ruck') ? ruckMilesPerPoint : runMilesPerPoint;
    return Math.max(0, Math.round((Number(distanceValue) / divisor) * 100) / 100);
  }
  if (eventCategory === 'run_ruck' && distanceValue != null && Number.isFinite(Number(distanceValue))) {
    return Math.max(0, Math.round((Number(distanceValue) / runMilesPerPoint) * 100) / 100);
  }
  if (caloriesBurned != null && caloriesPerPoint > 0) return Math.max(0, Math.floor(Number(caloriesBurned) / caloriesPerPoint));
  return 0;
};

const loadChallengeRosterMembers = async (classId) => {
  const [rows] = await pool.execute(
    `SELECT
       pm.provider_user_id,
       pm.membership_status,
       u.first_name,
       u.last_name,
       u.email,
       u.phone_number,
       u.is_roster_placeholder,
       u.roster_placeholder_claim_email,
       t.id AS team_id,
       t.team_name
     FROM learning_class_provider_memberships pm
     INNER JOIN users u ON u.id = pm.provider_user_id
     LEFT JOIN challenge_team_members ctm ON ctm.provider_user_id = pm.provider_user_id
     LEFT JOIN challenge_teams t ON t.id = ctm.team_id AND t.learning_class_id = pm.learning_class_id
     WHERE pm.learning_class_id = ?
       AND pm.membership_status IN ('active','completed')
     ORDER BY u.last_name ASC, u.first_name ASC, pm.provider_user_id ASC`,
    [classId]
  );
  return rows || [];
};

const isCaptainForClass = async ({ classId, userId }) => {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM challenge_teams
     WHERE learning_class_id = ? AND team_manager_user_id = ?
     LIMIT 1`,
    [classId, userId]
  );
  if (rows?.length) return true;
  const [appRows] = await pool.execute(
    `SELECT 1
     FROM challenge_captain_applications
     WHERE learning_class_id = ? AND user_id = ? AND status = 'approved'
     LIMIT 1`,
    [classId, userId]
  );
  return !!appRows?.length;
};

const getWorkoutModerationMode = (settings) => {
  const mode = String(settings?.workoutModeration?.mode || '').trim().toLowerCase();
  if (mode === 'all' || mode === 'treadmill_only' || mode === 'none') return mode;
  return 'treadmill_only';
};

const isNicknameSuffixUpdateAllowed = (currentTeamName, requestedTeamName) => {
  const current = String(currentTeamName || '').trim();
  const requested = String(requestedTeamName || '').trim();
  if (!current || !requested) return false;
  if (requested.length <= current.length) return false;
  if (!requested.toLowerCase().startsWith(current.toLowerCase())) return false;
  const suffix = requested.slice(current.length);
  if (!suffix || !suffix.trim()) return false;
  return /^\s+[\w\-'.&]+(?:\s+[\w\-'.&]+)*$/.test(suffix);
};

export const listTeams = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const teams = await ChallengeTeam.listByChallenge(classId);
    return res.json({ teams });
  } catch (e) {
    next(e);
  }
};

export const createTeam = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamName = String(req.body.teamName || '').trim();
    if (!classId || !teamName) return res.status(400).json({ error: { message: 'classId and teamName required' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const team = await ChallengeTeam.create({
      learningClassId: classId,
      teamName,
      teamManagerUserId: req.body.teamManagerUserId ? asInt(req.body.teamManagerUserId) : null
    });
    return res.status(201).json({ team });
  } catch (e) {
    next(e);
  }
};

export const updateTeam = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    const canManage = (await canManageChallenge({ user: req.user, classId })) || canManageTeam(req.user, team);
    if (!canManage) return res.status(403).json({ error: { message: 'Access denied' } });
    if (req.body.teamName !== undefined && !(await canManageChallenge({ user: req.user, classId }))) {
      const [classRows] = await pool.execute(
        `SELECT season_settings_json
         FROM learning_program_classes
         WHERE id = ?
         LIMIT 1`,
        [classId]
      );
      const settings = parseJsonObject(classRows?.[0]?.season_settings_json || {});
      const allowCaptainRename = settings?.teams?.allowCaptainRenameTeam !== false;
      const allowNicknameSuffixWhenLocked = settings?.teams?.allowCaptainNicknameSuffixWhenLocked === true;
      if (!allowCaptainRename) {
        const requestedName = String(req.body.teamName || '').trim();
        const currentName = String(team.team_name || '').trim();
        if (!allowNicknameSuffixWhenLocked) {
          return res.status(403).json({ error: { message: 'Captains cannot rename teams for this season' } });
        }
        if (!isNicknameSuffixUpdateAllowed(currentName, requestedName)) {
          return res.status(400).json({
            error: {
              message: 'Nickname mode only allows appending a suffix to the existing team name (example: "Charlie Chimeras")'
            }
          });
        }
      }
    }
    const patch = {};
    if (req.body.teamName !== undefined) patch.teamName = String(req.body.teamName || '').trim();
    if (req.body.teamManagerUserId !== undefined) patch.teamManagerUserId = req.body.teamManagerUserId ? asInt(req.body.teamManagerUserId) : null;
    if (req.body.teamColor !== undefined) {
      // Accept a valid 3- or 6-char hex color (with or without #), or null to clear.
      const raw = req.body.teamColor ? String(req.body.teamColor).trim() : null;
      if (raw && /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(raw)) {
        patch.teamColor = raw.startsWith('#') ? raw : `#${raw}`;
      } else {
        patch.teamColor = null;
      }
    }
    const updated = await ChallengeTeam.update(teamId, patch);
    return res.json({ team: updated });
  } catch (e) {
    next(e);
  }
};

export const deleteTeam = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    await ChallengeTeam.delete(teamId);
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const uploadTeamLogo = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    if (!canManageTeam(req.user, team) && !(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Only team captains or season managers can upload a team logo' } });
    }
    if (!req.file) return res.status(400).json({ error: { message: 'No file uploaded' } });
    const { default: StorageService } = await import('../services/storage.service.js');
    const result = await StorageService.saveTeamLogo({ teamId, fileBuffer: req.file.buffer, filename: req.file.originalname, contentType: req.file.mimetype });
    await ChallengeTeam.update(teamId, { logoPath: result.relativePath });
    return res.json({ logoPath: result.relativePath });
  } catch (e) { next(e); }
};

export const uploadTeamBanner = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    if (!canManageTeam(req.user, team) && !(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Only team captains or season managers can upload a team banner' } });
    }
    if (!req.file) return res.status(400).json({ error: { message: 'No file uploaded' } });
    const { default: StorageService } = await import('../services/storage.service.js');
    const result = await StorageService.saveTeamBanner({ teamId, fileBuffer: req.file.buffer, filename: req.file.originalname, contentType: req.file.mimetype });
    await ChallengeTeam.update(teamId, { bannerPath: result.relativePath, bannerFocalX: 50, bannerFocalY: 50 });
    return res.json({ bannerPath: result.relativePath, bannerFocalX: 50, bannerFocalY: 50 });
  } catch (e) { next(e); }
};

export const updateTeamBannerFocal = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    if (!canManageTeam(req.user, team) && !(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const focalX = Math.min(100, Math.max(0, parseFloat(req.body.focalX ?? 50)));
    const focalY = Math.min(100, Math.max(0, parseFloat(req.body.focalY ?? 50)));
    await ChallengeTeam.update(teamId, { bannerFocalX: focalX, bannerFocalY: focalY });
    return res.json({ focalX, focalY });
  } catch (e) { next(e); }
};

export const sendTeamMemberPasswordReset = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    const targetUserId = asInt(req.params.userId);
    if (!classId || !teamId || !targetUserId) return res.status(400).json({ error: { message: 'Invalid classId/teamId/userId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    if (!canManageTeam(req.user, team) && !(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const members = await ChallengeTeam.listMembers(teamId);
    if (!members.some((m) => Number(m.provider_user_id) === targetUserId)) {
      return res.status(404).json({ error: { message: 'Member not found on this team' } });
    }
    const targetUser = await User.findById(targetUserId);
    if (!targetUser?.id || !targetUser.email) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    const tokenResult = await User.generatePasswordlessToken(targetUser.id, 48, 'reset');
    const frontendBase = String(config.frontendUrl || '').replace(/\/$/, '');
    const resetLink = `${frontendBase}/reset-password/${tokenResult.token}`;
    const subject = 'Reset your password';
    const body = `Hello ${targetUser.first_name || targetUser.email},\n\nA team manager sent you a password reset link.\n\nReset your password using this link (expires in 48 hours):\n${resetLink}\n\nIf you did not expect this email, you can safely ignore it.`;
    await EmailService.sendEmail({ to: targetUser.email, subject, body });
    return res.json({ ok: true, message: `Password reset email sent to ${targetUser.email}` });
  } catch (e) {
    next(e);
  }
};

export const deleteTeamLogo = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    if (!canManageTeam(req.user, team) && !(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    await ChallengeTeam.update(teamId, { logoPath: null });
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

export const deleteTeamBanner = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    if (!canManageTeam(req.user, team) && !(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    await ChallengeTeam.update(teamId, { bannerPath: null, bannerFocalX: 50, bannerFocalY: 50 });
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

export const getPreSeasonStats = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });

    const [klassRows] = await pool.execute(
      `SELECT id, starts_at, ends_at, activated_at, created_at, status FROM learning_program_classes WHERE id = ? LIMIT 1`,
      [classId]
    );
    const klass = klassRows?.[0];
    if (!klass) return res.status(404).json({ error: { message: 'Season not found' } });

    // activated_at is set when a season is first launched; fall back to created_at for
    // seasons that existed before the activated_at column was added.
    const activatedAt = klass.activated_at
      ? new Date(klass.activated_at)
      : (klass.created_at ? new Date(klass.created_at) : null);
    const startsAt = klass.starts_at ? new Date(klass.starts_at) : null;

    // No pre-season window if we have no reference date, no start date, or the season already started
    if (!activatedAt || !startsAt || activatedAt >= startsAt) {
      return res.json({ available: false });
    }

    // Individual workout totals during pre-season window
    const [rows] = await pool.execute(
      `SELECT
         w.user_id,
         w.team_id,
         u.first_name,
         u.last_name,
         t.team_name,
         t.logo_path AS team_logo_path,
         COUNT(*)                              AS workouts,
         COALESCE(SUM(w.distance_value), 0)   AS miles
       FROM challenge_workouts w
       JOIN users u ON u.id = w.user_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.learning_class_id = ?
         AND w.completed_at >= ?
         AND w.completed_at < ?
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
       GROUP BY w.user_id, w.team_id, u.first_name, u.last_name, t.team_name, t.logo_path
       ORDER BY miles DESC, workouts DESC`,
      [classId, activatedAt, startsAt]
    );

    // Roll up per-team standings from the individual rows
    const teamMap = {};
    for (const row of rows) {
      const tid = row.team_id ?? '__noteam__';
      if (!teamMap[tid]) {
        teamMap[tid] = {
          teamId: row.team_id || null,
          teamName: row.team_name || 'No Team',
          teamLogoPath: row.team_logo_path || null,
          workouts: 0,
          miles: 0
        };
      }
      teamMap[tid].workouts += Number(row.workouts || 0);
      teamMap[tid].miles = Math.round((teamMap[tid].miles + Number(row.miles || 0)) * 100) / 100;
    }
    const teamStandings = Object.values(teamMap).sort((a, b) => b.miles - a.miles || b.workouts - a.workouts);

    const individualStandings = rows.map(r => ({
      userId: r.user_id,
      firstName: r.first_name,
      lastName: r.last_name,
      teamId: r.team_id || null,
      teamName: r.team_name || null,
      workouts: Number(r.workouts || 0),
      miles: Math.round(Number(r.miles || 0) * 100) / 100
    })).slice(0, 25);

    return res.json({
      available: true,
      window: { activatedAt: activatedAt.toISOString(), startsAt: startsAt.toISOString() },
      teamStandings,
      individualStandings
    });
  } catch (e) { next(e); }
};

export const listTeamMembers = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const members = await ChallengeTeam.listMembers(teamId);
    return res.json({ members });
  } catch (e) {
    next(e);
  }
};

export const upsertTeamMembers = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const teamId = asInt(req.params.teamId);
    if (!classId || !teamId) return res.status(400).json({ error: { message: 'Invalid classId/teamId' } });
    const team = await ChallengeTeam.findById(teamId);
    if (!team || Number(team.learning_class_id) !== Number(classId)) return res.status(404).json({ error: { message: 'Team not found' } });
    const canManage = (await canManageChallenge({ user: req.user, classId })) || canManageTeam(req.user, team);
    if (!canManage) return res.status(403).json({ error: { message: 'Access denied' } });
    const members = Array.isArray(req.body?.members) ? req.body.members : [];
    for (const m of members) {
      const providerUserId = asInt(m?.providerUserId);
      if (!providerUserId) continue;
      const action = String(m?.action || 'add').toLowerCase();
      if (action === 'remove') {
        await ChallengeTeam.removeMember({ teamId, providerUserId });
      } else {
        await ChallengeTeam.addMember({ teamId, providerUserId });
      }
    }
    const teamMembers = await ChallengeTeam.listMembers(teamId);
    return res.json({ teamId, members: teamMembers });
  } catch (e) {
    next(e);
  }
};

export const getLeaderboard = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const individual = await ChallengeWorkout.getLeaderboardIndividual(classId);
    const team = await ChallengeWorkout.getLeaderboardTeam(classId);
    const weekStart = req.query.weekStart || null;
    let weekly = [];
    if (weekStart) {
      weekly = await ChallengeWorkout.getWeeklyLeaderboard(classId, weekStart);
    }
    return res.json({ individual, team, weekly });
  } catch (e) {
    next(e);
  }
};

export const buildRecordMetricMap = async ({ classId, organizationId, selectedMetricKeys = [] }) => {
  const scopeWhere = {
    season: {
      sql: `w.learning_class_id = ?
        AND (c.starts_at IS NULL OR w.completed_at >= c.starts_at)
        AND (c.ends_at IS NULL OR w.completed_at <= c.ends_at)`,
      params: [classId]
    },
    club_all_time: organizationId
      ? {
        sql: 'c.organization_id = ?',
        params: [organizationId]
      }
      : null
  };
  const metricDefs = [
    {
      key: 'longest_run',
      label: 'Longest Run',
      where: `LOWER(w.activity_type) LIKE '%run%' AND COALESCE(w.distance_value, 0) > 0`,
      order: 'w.distance_value DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.distance_value || 0).toFixed(2)} mi`
    },
    {
      key: 'fastest_mile',
      label: 'Best Mile Pace (Run)',
      where: `LOWER(w.activity_type) LIKE '%run%' AND COALESCE(w.distance_value, 0) >= 1 AND COALESCE(w.duration_minutes, 0) > 0`,
      order: '((w.duration_minutes * 60 + COALESCE(w.duration_seconds, 0)) / NULLIF(w.distance_value, 0)) ASC, w.completed_at ASC',
      valueText: (r) => {
        const totalSec = Number(r.duration_minutes || 0) * 60 + Number(r.duration_seconds || 0);
        const secPerMile = totalSec / Number(r.distance_value || 1);
        const min = Math.floor(secPerMile / 60);
        const sec = Math.round(secPerMile % 60);
        return `${String(min)}:${String(sec).padStart(2, '0')} /mi`;
      }
    },
    {
      key: 'longest_ruck',
      label: 'Longest Ruck',
      where: `LOWER(w.activity_type) LIKE '%ruck%' AND COALESCE(w.distance_value, 0) > 0`,
      order: 'w.distance_value DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.distance_value || 0).toFixed(2)} mi`
    },
    {
      key: 'highest_points_workout',
      label: 'Highest Points (Single Workout)',
      where: 'COALESCE(w.points, 0) > 0',
      order: 'w.points DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.points || 0)} pts`
    },
    {
      key: 'longest_trail_run',
      label: 'Longest Trail Run',
      where: `(LOWER(w.activity_type) LIKE '%trail%' OR LOWER(w.workout_notes) LIKE '%trail%') AND COALESCE(w.distance_value, 0) > 0`,
      order: 'w.distance_value DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.distance_value || 0).toFixed(2)} mi`
    },
    {
      key: 'fastest_5k',
      label: 'Fastest 5K (Est.)',
      where: `LOWER(w.activity_type) LIKE '%run%' AND COALESCE(w.distance_value, 0) >= 3.1 AND COALESCE(w.duration_minutes, 0) > 0`,
      order: '((w.duration_minutes * 60 + COALESCE(w.duration_seconds, 0)) / NULLIF(w.distance_value, 0)) ASC, w.completed_at ASC',
      valueText: (r) => {
        const totalSec = Number(r.duration_minutes || 0) * 60 + Number(r.duration_seconds || 0);
        const secPerMile = totalSec / Number(r.distance_value || 1);
        const estimate5kSec = secPerMile * 3.10686;
        const min = Math.floor(estimate5kSec / 60);
        const sec = Math.round(estimate5kSec % 60);
        return `${String(min)}:${String(sec).padStart(2, '0')} (est.)`;
      }
    },
    {
      key: 'fastest_half_marathon',
      label: 'Fastest Half Marathon',
      where: `LOWER(w.activity_type) LIKE '%run%' AND COALESCE(w.distance_value, 0) >= 13.1 AND COALESCE(w.duration_minutes, 0) > 0`,
      order: 'w.duration_minutes ASC, w.completed_at ASC',
      valueText: (r) => {
        const total = Number(r.duration_minutes || 0);
        const h = Math.floor(total / 60);
        const m = Math.floor(total % 60);
        const s = Math.round((total - Math.floor(total)) * 60);
        return h > 0
          ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
          : `${m}m ${String(s).padStart(2, '0')}s`;
      }
    },
    {
      key: 'fastest_marathon',
      label: 'Fastest Marathon',
      where: `LOWER(w.activity_type) LIKE '%run%' AND COALESCE(w.distance_value, 0) >= 26.2 AND COALESCE(w.duration_minutes, 0) > 0`,
      order: 'w.duration_minutes ASC, w.completed_at ASC',
      valueText: (r) => {
        const total = Number(r.duration_minutes || 0);
        const h = Math.floor(total / 60);
        const m = Math.floor(total % 60);
        const s = Math.round((total - Math.floor(total)) * 60);
        return h > 0
          ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
          : `${m}m ${String(s).padStart(2, '0')}s`;
      }
    },
    {
      key: 'longest_walk',
      label: 'Longest Walk',
      where: `LOWER(w.activity_type) LIKE '%walk%' AND COALESCE(w.distance_value, 0) > 0`,
      order: 'w.distance_value DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.distance_value || 0).toFixed(2)} mi`
    },
    {
      key: 'longest_duration_workout',
      label: 'Longest Workout Duration',
      where: 'COALESCE(w.duration_minutes, 0) > 0',
      order: 'w.duration_minutes DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.duration_minutes || 0)} min`
    },
    {
      key: 'highest_calories_workout',
      label: 'Highest Calories (Single Workout)',
      where: 'COALESCE(w.calories_burned, 0) > 0',
      order: 'w.calories_burned DESC, w.completed_at ASC',
      valueText: (r) => `${Number(r.calories_burned || 0)} cal`
    }
  ];
  const metricByKey = new Map(metricDefs.map((m) => [m.key, m]));
  const chosen = Array.isArray(selectedMetricKeys) && selectedMetricKeys.length
    ? selectedMetricKeys.map((k) => metricByKey.get(String(k || '').trim())).filter(Boolean)
    : metricDefs.slice(0, 4);

  const fetchBest = async (scopeKey, metric) => {
    const scope = scopeWhere[scopeKey];
    if (!scope) return null;
    const [rows] = await pool.execute(
      `SELECT
         w.id AS workout_id,
         w.user_id,
         w.team_id,
         w.activity_type,
         w.distance_value,
         w.duration_minutes,
         w.points,
         w.completed_at,
         w.contributor_anonymized_at,
         u.first_name,
         u.last_name,
         t.team_name,
         c.class_name
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       WHERE ${scope.sql}
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         AND ${metric.where}
       ORDER BY ${metric.order}
       LIMIT 1`,
      scope.params
    );
    const row = rows?.[0];
    if (!row) return null;
    const holderName = row.contributor_anonymized_at
      ? 'Anonymous participant'
      : `${row.first_name || ''} ${row.last_name || ''}`.trim();
    return {
      metricKey: metric.key,
      label: metric.label,
      holderUserId: Number(row.user_id),
      holderName,
      teamName: row.team_name || null,
      seasonName: row.class_name || null,
      valueText: metric.valueText(row),
      workoutId: Number(row.workout_id),
      completedAt: row.completed_at
    };
  };

  const season = [];
  const clubAllTime = [];
  for (const metric of chosen) {
    const s = await fetchBest('season', metric);
    if (s) season.push(s);
    const a = await fetchBest('club_all_time', metric);
    if (a) clubAllTime.push(a);
  }
  return { season, clubAllTime };
};

export const getRecordBoards = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const organizationId = Number(access.class?.organization_id || 0) || null;
    const seasonSettings = parseJsonObject(access.class?.season_settings_json || {});
    const selectedMetricKeys = Array.isArray(seasonSettings?.records?.metrics)
      ? seasonSettings.records.metrics.map((k) => String(k || '').trim()).filter(Boolean)
      : [];
    const boards = await buildRecordMetricMap({ classId, organizationId, selectedMetricKeys });
    return res.json({
      seasonRecords: boards.season,
      clubAllTimeRecords: boards.clubAllTime,
      selectedMetricKeys
    });
  } catch (e) {
    next(e);
  }
};

const formatRaceTime = (totalMinutes) => {
  const total = Number(totalMinutes || 0);
  if (!total) return '—';
  const h = Math.floor(total / 60);
  const m = Math.floor(total % 60);
  const s = Math.round((total - Math.floor(total)) * 60);
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
    : `${m}m ${String(s).padStart(2, '0')}s`;
};

/**
 * Build race division leaderboards for a season and/or club all-time.
 *
 * Workouts must be explicitly tagged as a race (is_race = 1) and must fall
 * within the distance range for a standard race distance (not just any run
 * that surpasses a threshold).
 *
 * @param {object}   opts
 * @param {number}   opts.classId         - Season class ID (0 = skip season scope)
 * @param {number}   opts.organizationId  - Club org ID (0 = skip all-time scope)
 * @param {string[]} opts.enabledKeys     - Which race distance keys to include
 * @param {object}   opts.emojiOverrides  - { [key]: 'icon:123' | emoji }
 * @param {object[]} opts.customDistances - Extra distances defined at club level
 */
export const buildRaceDivisions = async ({ classId, organizationId, enabledKeys, emojiOverrides = {}, customDistances = [] }) => {
  // Merge standard + custom distances (custom can override keys that match standard ones)
  const allDistances = [
    ...RACE_DISTANCES,
    ...customDistances.filter((c) => c?.key && !RACE_DISTANCES.find((s) => s.key === c.key))
  ];

  const keys = Array.isArray(enabledKeys) && enabledKeys.length ? enabledKeys : DEFAULT_ENABLED_KEYS;
  const distances = allDistances.filter((d) => keys.includes(d.key))
    .sort((a, b) => a.miles - b.miles);

  // Resolve any icon:ID references in emojiOverrides to image URLs
  const resolvedIconUrls = {};
  for (const [key, val] of Object.entries(emojiOverrides)) {
    if (val && typeof val === 'string') {
      const iconMatch = val.match(/^icon:(\d+)$/);
      if (iconMatch) {
        try {
          const icon = await Icon.findById(Number(iconMatch[1]));
          if (icon) resolvedIconUrls[key] = Icon.getIconUrl(icon);
        } catch { /* non-blocking */ }
      }
    }
  }

  const fetchDivision = async (scopeSql, scopeParams, minMiles, maxMiles) => {
    const [rows] = await pool.execute(
      `SELECT
         u.id AS user_id,
         u.first_name,
         u.last_name,
         MIN(w.duration_minutes) AS best_time_minutes,
         MAX(w.distance_value)   AS best_distance,
         MIN(w.completed_at)     AS first_completed_at,
         COUNT(*)                AS completion_count
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       WHERE ${scopeSql}
         AND w.is_race = 1
         AND LOWER(w.activity_type) LIKE '%run%'
         AND COALESCE(w.distance_value, 0) >= ?
         AND COALESCE(w.distance_value, 0) <= ?
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
       GROUP BY u.id, u.first_name, u.last_name
       ORDER BY MIN(w.duration_minutes) ASC`,
      [...scopeParams, minMiles, maxMiles]
    );
    return (rows || []).map((r) => ({
      userId: Number(r.user_id),
      name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      bestTimeMinutes: Number(r.best_time_minutes || 0),
      bestTimeText: formatRaceTime(Number(r.best_time_minutes || 0)),
      bestDistance: Number(r.best_distance || 0),
      completionCount: Number(r.completion_count || 0),
      firstCompletedAt: r.first_completed_at
    }));
  };

  const seasonScope  = classId        ? { sql: 'w.learning_class_id = ?', params: [classId] }        : null;
  const allTimeScope = organizationId ? { sql: 'c.organization_id = ?',   params: [organizationId] } : null;

  const divisions = [];
  for (const dist of distances) {
    const [seasonEntries, allTimeEntries] = await Promise.all([
      seasonScope  ? fetchDivision(seasonScope.sql,  seasonScope.params,  dist.minMiles, dist.maxMiles) : Promise.resolve([]),
      allTimeScope ? fetchDivision(allTimeScope.sql, allTimeScope.params, dist.minMiles, dist.maxMiles) : Promise.resolve([])
    ]);
    const rawIcon = emojiOverrides[dist.key];
    const isIconRef = rawIcon && /^icon:\d+$/.test(rawIcon);
    divisions.push({
      key: dist.key,
      label: dist.label,
      shortLabel: dist.shortLabel,
      miles: dist.miles,
      emoji: isIconRef ? dist.defaultEmoji : (rawIcon || dist.defaultEmoji),
      iconUrl: resolvedIconUrls[dist.key] || null,
      season: seasonEntries,
      allTime: allTimeEntries,
      hasEntries: seasonEntries.length > 0 || allTimeEntries.length > 0
    });
  }
  return divisions;
};

export const getRaceDivisions = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });

    const organizationId = Number(access.class?.organization_id || 0) || null;

    // Merge club-level config with season-level overrides
    let clubConfig = {};
    if (organizationId) {
      const [clubRows] = await pool.execute(
        `SELECT race_division_config_json FROM agencies WHERE id = ? LIMIT 1`, [organizationId]
      );
      try { clubConfig = JSON.parse(clubRows?.[0]?.race_division_config_json || '{}'); } catch { clubConfig = {}; }
    }

    const seasonSettings = parseJsonObject(access.class?.season_settings_json || {});
    const seasonRD = seasonSettings?.raceDivisions || {};
    // Season overrides take precedence over club config; fall back to club enabled list
    const enabledKeys = Array.isArray(seasonRD.enabledKeys) && seasonRD.enabledKeys.length
      ? seasonRD.enabledKeys
      : (Array.isArray(clubConfig.enabledKeys) && clubConfig.enabledKeys.length ? clubConfig.enabledKeys : DEFAULT_ENABLED_KEYS);
    const emojiOverrides = { ...(clubConfig.emojiOverrides || {}), ...(seasonRD.emojiOverrides || {}) };
    const customDistances = Array.isArray(clubConfig.customDistances) ? clubConfig.customDistances : [];

    const divisions = await buildRaceDivisions({ classId, organizationId, enabledKeys, emojiOverrides, customDistances });
    return res.json({ divisions, enabledKeys, emojiOverrides, customDistances });
  } catch (e) {
    next(e);
  }
};

export const getActivityFeed = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const limit = Math.min(100, asInt(req.query.limit) || 50);
    const offset = asInt(req.query.offset) || 0;
    const teamId = req.query.teamId ? asInt(req.query.teamId) : null;
    const workouts = await ChallengeWorkout.listByChallenge(classId, { limit, offset, teamId });
    const workoutIds = (workouts || []).map((w) => Number(w.id)).filter(Boolean);
    const mediaRows = await ChallengeWorkoutMedia.listByWorkoutIds(workoutIds);
    const commentsByWorkout = new Map();
    if (workoutIds.length) {
      const placeholders = workoutIds.map(() => '?').join(', ');
      const [commentCounts] = await pool.execute(
        `SELECT workout_id, COUNT(*) AS comment_count
         FROM challenge_workout_comments
         WHERE workout_id IN (${placeholders})
         GROUP BY workout_id`,
        workoutIds
      );
      for (const c of commentCounts || []) commentsByWorkout.set(Number(c.workout_id), Number(c.comment_count || 0));
    }
    const mediaByWorkout = new Map();
    for (const m of mediaRows || []) {
      const wid = Number(m.workout_id);
      if (!mediaByWorkout.has(wid)) mediaByWorkout.set(wid, []);
      mediaByWorkout.get(wid).push(m);
    }
    // Check which workouts have already been shared to the public club feed
    const feedPostByWorkout = new Map();
    if (workoutIds.length) {
      const placeholders = workoutIds.map(() => '?').join(', ');
      const [feedRows] = await pool.execute(
        `SELECT source_workout_id, id AS post_id
           FROM club_feed_posts
          WHERE source_workout_id IN (${placeholders})`,
        workoutIds
      ).catch(() => [[]]);
      for (const r of feedRows || []) feedPostByWorkout.set(Number(r.source_workout_id), Number(r.post_id));
    }
    const enriched = (workouts || []).map((w) => ({
      ...w,
      profile_photo_url: publicUploadsUrlFromStoredPath(w.profile_photo_path) || null,
      comment_count: commentsByWorkout.get(Number(w.id)) || 0,
      media: mediaByWorkout.get(Number(w.id)) || [],
      club_feed_post_id: feedPostByWorkout.get(Number(w.id)) || null,
    }));
    return res.json({ workouts: enriched });
  } catch (e) {
    next(e);
  }
};

export const getMyParticipationSummary = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    const organizationId = asInt(req.query.organizationId);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const platformIds = await getPlatformAgencyIds(null);
    const plat = sqlAffiliationUnderSummitPlatform('a', platformIds);
    const platSql = plat ? plat.sql : '';
    const platParams = plat ? plat.params : [];
    // Match seasons tied to this club OR its parent agency (and NULL org legacy rows) so the context bar
    // still finds teams when class.organization_id differs from the affiliation id in the UI.
    let orgFilter = '';
    let orgParams = [];
    if (organizationId) {
      const orgIds = [organizationId];
      const parentAgencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(organizationId);
      if (parentAgencyId && !orgIds.includes(Number(parentAgencyId))) orgIds.push(Number(parentAgencyId));
      const ph = orgIds.map(() => '?').join(', ');
      orgFilter = ` AND (c.organization_id IS NULL OR c.organization_id IN (${ph}))`;
      orgParams = orgIds;
    }
    const statsParams = organizationId
      ? [userId, userId, ...orgParams, ...platParams]
      : [userId, userId, ...platParams];
    const [stats] = await pool.execute(
      `SELECT
         COUNT(DISTINCT w.id) AS workout_count,
         COALESCE(SUM(w.points), 0) AS total_points
       FROM challenge_workouts w
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       INNER JOIN agencies a ON a.id = c.organization_id
       INNER JOIN learning_class_provider_memberships m ON m.learning_class_id = w.learning_class_id AND m.provider_user_id = ?
       WHERE w.user_id = ? AND m.membership_status IN ('active','completed')
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'${orgFilter}${platSql}`,
      statsParams
    );
    const teamsParams = organizationId
      ? [userId, ...orgParams, ...platParams, userId, ...orgParams, ...platParams]
      : [userId, ...platParams, userId, ...platParams];
    const [teams] = await pool.execute(
      `SELECT challenge_id, class_name, team_id, team_name FROM (
         SELECT c.id AS challenge_id, c.class_name AS class_name, t.id AS team_id, t.team_name AS team_name, c.starts_at
       FROM challenge_team_members m
       INNER JOIN challenge_teams t ON t.id = m.team_id
       INNER JOIN learning_program_classes c ON c.id = t.learning_class_id
         INNER JOIN agencies a ON a.id = c.organization_id
         WHERE m.provider_user_id = ?
           AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'${orgFilter}${platSql}
         UNION
         SELECT c.id, c.class_name, t.id, t.team_name, c.starts_at
         FROM challenge_teams t
         INNER JOIN learning_program_classes c ON c.id = t.learning_class_id
         INNER JOIN agencies a ON a.id = c.organization_id
         WHERE t.team_manager_user_id = ?
           AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'${orgFilter}${platSql}
       ) AS combined
       ORDER BY COALESCE(combined.starts_at, '9999-12-31') DESC, combined.team_name`,
      teamsParams
    );
    const recentParams = organizationId ? [userId, userId, ...orgParams, ...platParams] : [userId, userId, ...platParams];
    const [recent] = await pool.execute(
      `SELECT w.id, w.learning_class_id, w.activity_type, w.points, w.completed_at, c.class_name, t.team_name
       FROM challenge_workouts w
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       INNER JOIN agencies a ON a.id = c.organization_id
       INNER JOIN learning_class_provider_memberships pm ON pm.learning_class_id = c.id AND pm.provider_user_id = ?
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.user_id = ? AND pm.membership_status IN ('active','completed')
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'${orgFilter}${platSql}
       ORDER BY w.completed_at DESC, w.created_at DESC
       LIMIT 10`,
      recentParams
    );
    return res.json({
      workoutCount: Number(stats?.[0]?.workout_count || 0),
      totalPoints: Number(stats?.[0]?.total_points || 0),
      teams: (teams || []).map((r) => ({
        challengeId: r.challenge_id,
        challengeName: r.class_name,
        teamId: r.team_id,
        teamName: r.team_name
      })),
      recentWorkouts: (recent || []).map((r) => ({
        id: r.id,
        learningClassId: r.learning_class_id,
        activityType: r.activity_type,
        points: r.points,
        completedAt: r.completed_at,
        challengeName: r.class_name,
        teamName: r.team_name
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const listChallengeRoster = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Manage access required' } });
    }
    const classRow = await getChallengeClassRow(classId);
    if (!classRow) return res.status(404).json({ error: { message: 'Season not found' } });
    if (!isBerlinClassRow(classRow)) {
      return res.status(403).json({ error: { message: 'This roster fallback is currently enabled only for Berlin.' } });
    }
    const members = await loadChallengeRosterMembers(classId);
    return res.json({
      members: members.map((m) => ({
        userId: Number(m.provider_user_id),
        providerUserId: Number(m.provider_user_id),
        firstName: m.first_name,
        lastName: m.last_name,
        displayName: rosterDisplayName(m),
        email: String(m.email || '').includes('@placeholder.sstc.local') ? null : m.email,
        phoneNumber: m.phone_number || null,
        claimEmail: m.roster_placeholder_claim_email || null,
        isRosterPlaceholder: Number(m.is_roster_placeholder || 0) === 1,
        teamId: m.team_id || null,
        teamName: m.team_name || null
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const importChallengeRoster = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Manage access required' } });
    }
    const classRow = await getChallengeClassRow(classId);
    if (!classRow) return res.status(404).json({ error: { message: 'Season not found' } });
    if (!isBerlinClassRow(classRow)) {
      return res.status(403).json({ error: { message: 'This roster fallback is currently enabled only for Berlin.' } });
    }
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: { message: 'Roster rows are required' } });
    if (rows.length > 500) return res.status(400).json({ error: { message: 'Import up to 500 roster rows at a time' } });

    const imported = [];
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const nameBits = splitRosterName(rows[i]);
        const email = normalizeEmail(rows[i]?.email);
        const phoneNumber = normalizePhoneNumber(rows[i]?.phoneNumber || rows[i]?.phone_number || rows[i]?.phone || rows[i]?.mobile);
        if (!email && !normalizePersonName(nameBits.displayName)) {
          errors.push({ row: i + 1, message: 'Name or email required' });
          continue;
        }
        const result = await ensureChallengeRosterMember({
          classId,
          classRow,
          row: rows[i],
          createdByUserId: req.user.id
        });
        imported.push({ row: i + 1, ...result });
      } catch (err) {
        errors.push({ row: i + 1, message: err?.message || 'Import failed' });
      }
    }
    return res.json({ imported, errors, members: await loadChallengeRosterMembers(classId) });
  } catch (e) {
    next(e);
  }
};

export const mergeRosterPlaceholder = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const placeholderUserId = asInt(req.body?.placeholderUserId);
    const targetUserId = asInt(req.body?.targetUserId);
    if (!classId || !placeholderUserId || !targetUserId || placeholderUserId === targetUserId) {
      return res.status(400).json({ error: { message: 'classId, placeholderUserId, and targetUserId are required' } });
    }
    if (!(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Manage access required' } });
    }
    const classRow = await getChallengeClassRow(classId);
    if (!classRow) return res.status(404).json({ error: { message: 'Season not found' } });
    if (!isBerlinClassRow(classRow)) {
      return res.status(403).json({ error: { message: 'This roster fallback is currently enabled only for Berlin.' } });
    }
    const [placeholderRows] = await pool.execute(
      `SELECT u.id
       FROM users u
       INNER JOIN learning_class_provider_memberships pm ON pm.provider_user_id = u.id
       WHERE u.id = ? AND pm.learning_class_id = ? AND u.is_roster_placeholder = 1
       LIMIT 1`,
      [placeholderUserId, classId]
    );
    if (!placeholderRows?.length) return res.status(404).json({ error: { message: 'Placeholder roster member not found' } });
    const [targetRows] = await pool.execute(
      `SELECT id FROM users WHERE id = ? LIMIT 1`,
      [targetUserId]
    );
    if (!targetRows?.length) return res.status(404).json({ error: { message: 'Target user not found' } });

    await pool.execute(
      `INSERT INTO learning_class_provider_memberships
         (learning_class_id, provider_user_id, membership_status, joined_at, role_label, notes, created_by_user_id)
       SELECT learning_class_id, ?, 'active', COALESCE(joined_at, NOW()), role_label, 'Merged from placeholder roster member', ?
       FROM learning_class_provider_memberships
       WHERE learning_class_id = ? AND provider_user_id = ?
       ON DUPLICATE KEY UPDATE membership_status = 'active', updated_at = NOW()`,
      [targetUserId, req.user.id, classId, placeholderUserId]
    );
    await pool.execute(
      `INSERT IGNORE INTO challenge_team_members (team_id, provider_user_id, joined_at)
       SELECT team_id, ?, COALESCE(joined_at, NOW())
       FROM challenge_team_members
       WHERE provider_user_id = ?`,
      [targetUserId, placeholderUserId]
    );
    await pool.execute(
      `UPDATE challenge_workouts
       SET user_id = ?,
           submitted_on_behalf_of_user_id = CASE WHEN submitted_on_behalf_of_user_id = ? THEN ? ELSE submitted_on_behalf_of_user_id END
       WHERE learning_class_id = ? AND user_id = ?`,
      [targetUserId, placeholderUserId, targetUserId, classId, placeholderUserId]
    );
    await pool.execute(`UPDATE user_photos SET user_id = ? WHERE user_id = ?`, [targetUserId, placeholderUserId]).catch(() => {});
    await pool.execute(`DELETE FROM challenge_team_members WHERE provider_user_id = ?`, [placeholderUserId]);
    await pool.execute(`DELETE FROM learning_class_provider_memberships WHERE learning_class_id = ? AND provider_user_id = ?`, [classId, placeholderUserId]);
    await pool.execute(
      `UPDATE users
       SET is_roster_placeholder = 0,
           roster_placeholder_claimed_at = NOW()
       WHERE id = ?`,
      [placeholderUserId]
    );
    return res.json({ ok: true, placeholderUserId, targetUserId });
  } catch (e) {
    next(e);
  }
};

export const submitWorkout = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const activityType = normalizeActivityType(String(req.body.activityType || '').trim());
    if (!classId || !activityType) return res.status(400).json({ error: { message: 'classId and activityType required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const classStatus = String(access.class?.status || '').toLowerCase();
    if (classStatus === 'closed' || classStatus === 'archived') {
      return res.status(400).json({ error: { message: 'This season has been closed by a manager' } });
    }
    // Verify user is a provider member
    const [pm] = await pool.execute(
      `SELECT 1 FROM learning_class_provider_memberships WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed') LIMIT 1`,
      [classId, req.user.id]
    );
    if (!pm?.length) return res.status(403).json({ error: { message: 'You must be a season participant to submit workouts' } });
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass: access.class,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }
    let teamId = req.body.teamId ? asInt(req.body.teamId) : null;
    if (!teamId) {
      const team = await ChallengeTeam.getTeamForUser(classId, req.user.id);
      teamId = team?.id || null;
    }
    const settings = parseJsonObject(access.class?.season_settings_json || {});
    const schedule = parseJsonObject(settings?.schedule || {});
    const eventCategory = String(settings?.event?.category || 'run_ruck').toLowerCase();
    const scoring = parseJsonObject(settings?.scoring || {});
    const runMilesPerPoint = Number(scoring.runMilesPerPoint || 1) || 1;
    const ruckMilesPerPoint = Number(scoring.ruckMilesPerPoint || 1) || 1;
    const caloriesPerPoint = Number(scoring.caloriesPerPoint || 100) || 100;
    const activityLower = String(activityType || '').toLowerCase();
    const isTreadmill = asInt(req.body.isTreadmill) === 1 || req.body.isTreadmill === true;
    const distanceValue = req.body.distanceValue != null ? Number(req.body.distanceValue) : null;
    const durationMinutesRaw = req.body.durationMinutes != null ? Number(req.body.durationMinutes) : null;
    // Sanitize manually-entered calories against evidence-based ceilings.
    // If the user didn't enter any, estimate from distance/duration using standardised
    // coefficients (no body weight — prevents weight-inflation cheating).
    const rawCalInput = req.body.caloriesBurned != null ? Number(req.body.caloriesBurned) : null;
    const caloriesBurned = (() => {
      if (rawCalInput != null && rawCalInput > 0) {
        const { calories } = sanitizeCalories({
          calories: rawCalInput,
          activityType,
          distanceMiles: distanceValue ?? 0,
          durationMinutes: durationMinutesRaw ?? 0,
        });
        return calories;
      }
      return estimateCalories({
        activityType,
        distanceMiles: distanceValue ?? 0,
        durationMinutes: durationMinutesRaw ?? 0,
      });
    })();
    const treadmillpocalypseEnabled = settings?.treadmillpocalypse?.enabled === true;
    const treadmillpocalypseStartsAtWeek = String(settings?.treadmillpocalypse?.startsAtWeek || '').slice(0, 10) || null;
    const moderationMode = getWorkoutModerationMode(settings);
    const weekCutoffTime = String(schedule?.weekEndsSundayAt || access.class?.week_start_time || '00:00');
    const weekTimeZone = String(schedule?.weekTimeZone || 'UTC');
    const runRuckScoringMetric = String(scoring.runRuckScoringMetric || 'distance').toLowerCase();
    let computedPoints = null;
    const isRunLike = activityLower.includes('run') || activityLower.includes('walk') || activityLower.includes('ruck') || activityLower.includes('step');
    if (eventCategory === 'run_ruck' && isRunLike) {
      if (runRuckScoringMetric === 'calories') {
        // season configured to score run/ruck by calories
        if (caloriesBurned != null && caloriesPerPoint > 0) {
          computedPoints = Math.max(0, Math.floor(caloriesBurned / caloriesPerPoint));
        }
      } else {
        // default: score by distance
        if (distanceValue != null && Number.isFinite(distanceValue)) {
          if (activityLower.includes('ruck')) {
            computedPoints = Math.max(0, Math.round((distanceValue / ruckMilesPerPoint) * 100) / 100);
          } else {
            computedPoints = Math.max(0, Math.round((distanceValue / runMilesPerPoint) * 100) / 100);
          }
        }
        // no distance → computedPoints stays null; falls back to req.body.points
      }
    } else if (eventCategory === 'run_ruck' && distanceValue != null && Number.isFinite(distanceValue)) {
      // non-run-like activity in a run_ruck season (e.g. swim, bike) — score by distance
      computedPoints = Math.max(0, Math.round((distanceValue / runMilesPerPoint) * 100) / 100);
    } else if (caloriesBurned != null && caloriesPerPoint > 0) {
      // fitness season — score by calories
      computedPoints = Math.max(0, Math.floor(caloriesBurned / caloriesPerPoint));
    }
    const points = computedPoints != null ? computedPoints : (Math.round((Number(req.body.points) || 0) * 100) / 100);
    const completedAt = req.body.completedAt ? new Date(req.body.completedAt) : new Date();
    // Same-day rule (configurable per season; defaults to enabled).
    const sameDayOnly = settings?.participation?.sameDayOnly !== false;
    if (sameDayOnly) {
      const sameDayTz     = weekTimeZone || 'UTC';
      const todayInTz     = new Intl.DateTimeFormat('en-CA', { timeZone: sameDayTz }).format(new Date());
      const completedInTz = new Intl.DateTimeFormat('en-CA', { timeZone: sameDayTz }).format(completedAt);
      if (completedInTz !== todayInTz) {
        return res.status(400).json({ error: { message: 'Workouts can only be logged on the day they were completed. You cannot backdate or future-date a workout.' } });
      }
    }
    const completedWeekStart = getWeekStartDate(completedAt, weekCutoffTime, weekTimeZone);
    if (eventCategory === 'run_ruck' && activityLower.includes('ruck')) {
      const participation = parseJsonObject(settings?.participation || {});
      const maxRucksPerWeek = Math.max(0, Number.parseInt(participation?.maxRucksPerWeek, 10) || 0);
      if (maxRucksPerWeek > 0) {
        const range = getWeekDateTimeRange(completedWeekStart, weekCutoffTime, weekTimeZone) || {
          start: `${String(completedWeekStart).slice(0, 10)} 00:00:00`,
          end: `${String(completedWeekStart).slice(0, 10)} 23:59:59`
        };
        const [ruckRows] = await pool.execute(
          `SELECT COUNT(*) AS total
           FROM challenge_workouts w
           WHERE w.learning_class_id = ?
             AND w.user_id = ?
             AND LOWER(w.activity_type) LIKE '%ruck%'
             AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
             AND w.completed_at >= ?
             AND w.completed_at < ?`,
          [classId, req.user.id, range.start, range.end]
        );
        const alreadyLogged = Number(ruckRows?.[0]?.total || 0);
        if (alreadyLogged >= maxRucksPerWeek) {
          return res.status(400).json({ error: { message: `Weekly ruck limit reached (${maxRucksPerWeek}) for this season` } });
        }
      }
    }
    if (isTreadmill && treadmillpocalypseEnabled && treadmillpocalypseStartsAtWeek && String(completedWeekStart || '') >= treadmillpocalypseStartsAtWeek) {
      return res.status(400).json({ error: { message: 'Treadmill workouts are blocked for this week (treadmillpocalypse active).' } });
    }
    const terrain = req.body.terrain ? String(req.body.terrain).trim() : null;
    const weeklyTaskId = req.body.weeklyTaskId ? asInt(req.body.weeklyTaskId) : null;
    let weeklyTask = null;
    if (weeklyTaskId) {
      weeklyTask = await ChallengeWeeklyTask.findById(weeklyTaskId);
      if (!weeklyTask || Number(weeklyTask.learning_class_id) !== Number(classId)) {
        return res.status(400).json({ error: { message: 'Invalid weekly challenge tag' } });
      }
      if (dateToYmd(weeklyTask.week_start_date) !== dateToYmd(completedWeekStart) ) {
        return res.status(400).json({ error: { message: 'Weekly challenge tag must belong to the active workout week' } });
      }
      // Enforce assignment for volunteer/captain modes — only the assigned user may tag
      if (weeklyTask.mode !== 'full_team') {
        const assignment = await ChallengeWeeklyAssignment.findByTaskAndUser(weeklyTask.id, req.user.id);
        if (!assignment) {
          return res.status(403).json({ error: { message: 'You must be assigned to this weekly challenge before tagging a workout.' } });
        }
      }
    }
    // screenshotFilePath = workout watch/app screenshot used for Vision OCR AND stored as the main proof image.
    // treadmillProofFilePath = separate treadmill-display photo required for treadmill entries.
    // mapImageFilePath = optional map photo attached to the workout.
    const screenshotFilePath = req.body.screenshotFilePath ? String(req.body.screenshotFilePath).trim() : null;
    const treadmillProofFilePath = req.body.treadmillProofFilePath ? String(req.body.treadmillProofFilePath).trim() : null;
    const mapImageFilePath = req.body.mapImageFilePath ? String(req.body.mapImageFilePath).trim() : null;
    const hasProofImage = !!(screenshotFilePath || treadmillProofFilePath);
    // Manual uploads that include a screenshot always go to pending review so a manager
    // can verify the proof — regardless of the season's moderation mode setting.
    let proofStatus = (moderationMode === 'all' || (moderationMode === 'treadmill_only' && isTreadmill) || screenshotFilePath)
      ? 'pending'
      : 'not_required';
    const taskProofPolicy = String(weeklyTask?.proof_policy || 'none').toLowerCase();
    if (taskProofPolicy === 'photo_required' && !hasProofImage) {
      return res.status(400).json({ error: { message: 'This weekly challenge requires photo proof upload.' } });
    }
    if (taskProofPolicy === 'screenshot' && !screenshotFilePath) {
      return res.status(400).json({ error: { message: 'This weekly challenge requires a workout screenshot upload.' } });
    }
    if (taskProofPolicy === 'gps_required_no_treadmill' && isTreadmill) {
      return res.status(400).json({ error: { message: 'This weekly challenge does not allow treadmill workouts.' } });
    }
    if (taskProofPolicy === 'manager_approval') {
      proofStatus = 'pending';
    }
    if (isTreadmill && !treadmillProofFilePath) {
      return res.status(400).json({ error: { message: 'Treadmill entries require a treadmill screen photo upload.' } });
    }
    // ── Criteria validation (non-blocking by default unless manager enforces strict mode) ──
    let criteriaViolation = null;
    if (weeklyTask && weeklyTask.criteria_json) {
      const crit = typeof weeklyTask.criteria_json === 'object'
        ? weeklyTask.criteria_json
        : (() => { try { return JSON.parse(weeklyTask.criteria_json); } catch { return null; } })();
      if (crit) {
        // Activity type filter
        if (crit.activityTypes?.length && !crit.activityTypes.some(
          (t) => String(t).toLowerCase() === activityLower || activityLower.includes(String(t).toLowerCase())
        )) {
          criteriaViolation = `Activity type "${activityType}" is not allowed for this challenge (requires: ${crit.activityTypes.join(', ')})`;
        }
        // Terrain filter
        if (!criteriaViolation && crit.terrain?.length && terrain &&
          !crit.terrain.map((t) => String(t).toLowerCase()).includes(String(terrain).toLowerCase())
        ) {
          criteriaViolation = `Terrain "${terrain}" is not allowed for this challenge (requires: ${crit.terrain.join(', ')})`;
        }
        // Minimum distance
        const submittedDist = distanceValue != null ? Number(distanceValue) : null;
        if (!criteriaViolation && crit.distance?.minMiles && (submittedDist == null || submittedDist < crit.distance.minMiles)) {
          criteriaViolation = `Minimum distance for this challenge is ${crit.distance.minMiles} mi (submitted: ${submittedDist ?? 0} mi)`;
        }
        // Minimum duration
        const submittedDur = req.body.durationMinutes != null ? Number(req.body.durationMinutes) : null;
        if (!criteriaViolation && crit.duration?.minMinutes && (submittedDur == null || submittedDur < crit.duration.minMinutes)) {
          criteriaViolation = `Minimum duration for this challenge is ${crit.duration.minMinutes} min (submitted: ${submittedDur ?? 0} min)`;
        }
        // Max pace (minSeconds per mile)
        if (!criteriaViolation && crit.pace?.maxSecondsPerMile && submittedDist && submittedDur) {
          const submittedPaceSecPerMi = (submittedDur * 60) / submittedDist;
          if (submittedPaceSecPerMi > crit.pace.maxSecondsPerMile) {
            const maxMins = Math.floor(crit.pace.maxSecondsPerMile / 60);
            const maxSecs = String(crit.pace.maxSecondsPerMile % 60).padStart(2, '0');
            criteriaViolation = `Pace requirement not met — challenge requires faster than ${maxMins}:${maxSecs}/mi`;
          }
        }
        // Time-of-day window
        if (!criteriaViolation && crit.timeOfDay?.start && crit.timeOfDay?.end) {
          const completedHHMM = completedAt.toTimeString().slice(0, 5); // "HH:MM"
          if (completedHHMM < crit.timeOfDay.start || completedHHMM > crit.timeOfDay.end) {
            criteriaViolation = `This challenge must be completed between ${crit.timeOfDay.start} and ${crit.timeOfDay.end} (submitted: ${completedHHMM})`;
          }
        }
        // Split-run logic — count same-task workouts for this user today
        if (!criteriaViolation && crit.splitRuns?.count && crit.splitRuns.count > 1) {
          const todayStr = completedAt.toISOString().slice(0, 10);
          const [existingRows] = await pool.execute(
            `SELECT completed_at FROM challenge_workouts
             WHERE user_id = ? AND weekly_task_id = ? AND DATE(completed_at) = ?
             ORDER BY completed_at ASC`,
            [req.user.id, weeklyTaskId, todayStr]
          );
          const existingCount = existingRows?.length || 0;
          if (existingCount >= crit.splitRuns.count) {
            criteriaViolation = `You have already logged ${existingCount} workout(s) for this challenge today (max: ${crit.splitRuns.count})`;
          }
          // Check minimum separation between runs
          if (!criteriaViolation && existingCount > 0 && crit.splitRuns.minSeparationMinutes) {
            const lastAt = new Date(existingRows[existingCount - 1].completed_at).getTime();
            const sepMs = crit.splitRuns.minSeparationMinutes * 60 * 1000;
            if (completedAt.getTime() - lastAt < sepMs) {
              criteriaViolation = `Split runs for this challenge must be separated by at least ${crit.splitRuns.minSeparationMinutes} minutes`;
            }
          }
        }

        // If there's a violation, enforce strict mode or flag-only
        if (criteriaViolation) {
          const strictMode = String(weeklyTask.proof_policy || '').includes('strict') || crit.strictMode === true;
          if (strictMode) {
            return res.status(400).json({ error: { message: criteriaViolation }, criteriaViolation });
          }
          // Otherwise fall through — workout is logged but flagged
        }
      }
    }

    // Auto-flag as a race entry when a run meets or exceeds half-marathon distance
    // isRace: explicit flag from client, or auto-detect for long runs
    const isRaceExplicit = req.body.isRace === true || req.body.isRace === 'true' || req.body.isRace === 1;
    const isRaceAutoDetect = activityLower.includes('run') && distanceValue != null && Number(distanceValue) >= 13.1;
    const isRace = isRaceExplicit || isRaceAutoDetect;
    const raceDistanceMiles = isRace && req.body.raceDistanceMiles != null ? parseFloat(req.body.raceDistanceMiles) : null;
    const raceChipTimeSeconds = isRace && req.body.raceChipTimeSeconds != null ? asInt(req.body.raceChipTimeSeconds) : null;
    const raceOverallPlace = isRace && req.body.raceOverallPlace != null ? asInt(req.body.raceOverallPlace) : null;
    const workout = await ChallengeWorkout.create({
      learningClassId: classId,
      teamId,
      userId: req.user.id,
      activityType,
      isTreadmill,
      isRace,
      raceDistanceMiles,
      raceChipTimeSeconds,
      raceOverallPlace,
      terrain,
      distanceValue,
      reportedDistanceValue: distanceValue,
      durationMinutes: req.body.durationMinutes != null ? asInt(req.body.durationMinutes) : null,
      durationSeconds: req.body.durationSeconds != null ? Math.min(59, Math.max(0, asInt(req.body.durationSeconds) || 0)) : null,
      caloriesBurned,
      averageHeartrate: req.body.averageHeartrate != null ? Number(req.body.averageHeartrate) : null,
      points,
      workoutNotes: req.body.workoutNotes ? String(req.body.workoutNotes).trim() : null,
      screenshotFilePath,
      completedAt: completedAt.toISOString().slice(0, 19).replace('T', ' '),
      weeklyTaskId,
      proofStatus
    });
    if (workout?.id) {
      if (workout.weekly_task_id && weeklyTask?.mode !== 'full_team') {
        const assignment = await ChallengeWeeklyAssignment.findByTaskAndUser(weeklyTaskId, req.user.id);
        if (isApprovedWeeklyAssignment(assignment)) {
          await ChallengeWeeklyAssignment.markCompleted(assignment.id, {
      completedAt: completedAt.toISOString().slice(0, 19).replace('T', ' ')
    });
        }
      }
      // Save treadmill proof and map image as separate media records
      if (treadmillProofFilePath) {
        ChallengeWorkoutMedia.create({
          workoutId: workout.id, learningClassId: classId, userId: req.user.id,
          mediaType: 'treadmill_proof', filePath: treadmillProofFilePath
        }).catch(() => {});
      }
      if (mapImageFilePath) {
        ChallengeWorkoutMedia.create({
          workoutId: workout.id, learningClassId: classId, userId: req.user.id,
          mediaType: 'map', filePath: mapImageFilePath
        }).catch(() => {});
      }
      try {
        await queueClubRecordBreakCandidates({
          learningClassId: classId,
          workoutId: workout.id,
          userId: req.user.id
        });
      } catch {
        // Non-blocking async hook.
      }
      try {
        await enqueueWorkoutVision({
          workoutId: workout.id,
          learningClassId: classId,
          userId: req.user.id,
          screenshotFilePath: workout?.screenshot_file_path || null,
          workoutNotes: workout?.workout_notes || null
        });
      } catch {
        // Non-blocking async hook.
      }
      // Auto-link screenshot to user photo album so it appears in the member's photos.
      if (workout?.screenshot_file_path) {
        pool.execute(
          `INSERT IGNORE INTO user_photos (user_id, file_path, source, source_ref_id, is_profile)
           VALUES (?, ?, 'workout_screenshot', ?, 0)`,
          [req.user.id, workout.screenshot_file_path, workout.id]
        ).catch(() => {});
      }
    }
    return res.status(201).json({ workout, criteriaViolation: criteriaViolation || null });
  } catch (e) {
    next(e);
  }
};

export const reviewWorkoutProof = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    const status = String(req.body?.proofStatus || '').toLowerCase();
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: { message: 'proofStatus must be approved, rejected, or pending' } });
    }
    const verifiedDistanceValue = req.body?.verifiedDistanceValue != null ? Number(req.body.verifiedDistanceValue) : null;
    const overridePoints = req.body?.overridePoints != null ? Number(req.body.overridePoints) : null;
    const nextDistance = status === 'approved' && verifiedDistanceValue != null
      ? verifiedDistanceValue
      : (workout.reported_distance_value != null ? Number(workout.reported_distance_value) : Number(workout.distance_value || 0));
    // Recalculate points on approval: explicit override wins, otherwise derive from verified distance
    let nextPoints;
    if (status === 'approved') {
      if (overridePoints != null && Number.isFinite(overridePoints)) {
        nextPoints = parseFloat(Math.max(0, overridePoints).toFixed(2));
      } else if (verifiedDistanceValue != null && Number.isFinite(verifiedDistanceValue)) {
        nextPoints = parseFloat(Math.max(0, verifiedDistanceValue).toFixed(2));
      }
    }
    const managerMadeEdit = status === 'approved' && (
      (verifiedDistanceValue != null && Number.isFinite(verifiedDistanceValue)) ||
      (overridePoints != null && Number.isFinite(overridePoints))
    );
    const nextWorkout = await ChallengeWorkout.updateProofReview(workoutId, {
      proofStatus: status,
      verifiedDistanceValue: status === 'approved' ? verifiedDistanceValue : null,
      distanceValue: nextDistance,
      ...(nextPoints !== undefined ? { points: nextPoints } : {}),
      managerEdited: managerMadeEdit ? 1 : 0,
      proofReviewNote: req.body?.proofReviewNote ? String(req.body.proofReviewNote) : null,
      proofReviewedByUserId: req.user.id,
      proofReviewedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
    return res.json({ workout: nextWorkout });
  } catch (e) {
    next(e);
  }
};

export const scanBulkWorkoutScreenshots = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Manage access required' } });
    }
    const classRow = await getChallengeClassRow(classId);
    if (!classRow) return res.status(404).json({ error: { message: 'Season not found' } });
    if (!isBerlinClassRow(classRow)) {
      return res.status(403).json({ error: { message: 'This roster fallback is currently enabled only for Berlin.' } });
    }
    const files = Array.isArray(req.files) ? req.files.slice(0, 10) : [];
    if (!files.length) return res.status(400).json({ error: { message: 'At least one image is required' } });
    const roster = await loadChallengeRosterMembers(classId);
    const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    const StorageService = (await import('../services/storage.service.js')).default;
    const items = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const saved = await StorageService.saveWorkoutMedia({
        userId: req.user.id,
        fileBuffer: file.buffer,
        filename: file.originalname || `bulk-workout-${Date.now()}-${i + 1}.jpg`,
        contentType: file.mimetype
      });
      let extracted = {};
      let rawText = '';
      let confidence = 0;
      let visionEnabled = false;
      try {
        const result = await scanWorkoutScreenshotWithVision({ fileBuffer: file.buffer, mimeType: file.mimetype });
        extracted = result.extracted || {};
        rawText = result.rawText || '';
        confidence = result.confidence || 0;
        visionEnabled = true;
      } catch (visionErr) {
        console.warn('[scanBulkWorkoutScreenshots] Vision scan failed:', visionErr?.message || visionErr);
      }
      const match = matchRosterMemberFromText(roster, rawText);
      items.push({
        clientItemId: crypto.randomUUID(),
        originalName: file.originalname || `Image ${i + 1}`,
        filePath: saved.relativePath,
        fileUrl: `${baseUrl}/uploads/${saved.relativePath}`,
        extracted,
        rawText,
        confidence,
        visionEnabled,
        matchedUserId: match.matchedUserId,
        matchConfidence: match.confidence,
        needsMemberSelection: match.needsMemberSelection,
        matchedMember: match.match ? {
          userId: Number(match.match.provider_user_id),
          displayName: rosterDisplayName(match.match),
          teamId: match.match.team_id || null,
          teamName: match.match.team_name || null
        } : null
      });
    }
    return res.json({
      items,
      members: roster.map((m) => ({
        userId: Number(m.provider_user_id),
        displayName: rosterDisplayName(m),
        firstName: m.first_name,
        lastName: m.last_name,
        teamId: m.team_id || null,
        teamName: m.team_name || null,
        isRosterPlaceholder: Number(m.is_roster_placeholder || 0) === 1
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const submitBulkWorkoutsOnBehalf = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Manage access required' } });
    }
    const classRow = await getChallengeClassRow(classId);
    if (!classRow) return res.status(404).json({ error: { message: 'Season not found' } });
    if (!isBerlinClassRow(classRow)) {
      return res.status(403).json({ error: { message: 'This roster fallback is currently enabled only for Berlin.' } });
    }
    const settings = parseJsonObject(classRow.season_settings_json || {});
    const schedule = parseJsonObject(settings?.schedule || {});
    const weekCutoffTime = String(schedule?.weekEndsSundayAt || classRow.week_start_time || '00:00');
    const weekTimeZone = String(schedule?.weekTimeZone || 'UTC');
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 10) : [];
    if (!items.length) return res.status(400).json({ error: { message: 'At least one workout item is required' } });
    const created = [];
    const errors = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      try {
        const targetUserId = asInt(item.userId || item.providerUserId || item.matchedUserId);
        const activityType = normalizeActivityType(String(item.activityType || item.extracted?.activityTypeHint || '').trim());
        if (!targetUserId) throw new Error('Select a member for this workout');
        if (!activityType) throw new Error('Activity type is required');
        const [pm] = await pool.execute(
          `SELECT 1 FROM learning_class_provider_memberships
           WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed')
           LIMIT 1`,
          [classId, targetUserId]
        );
        if (!pm?.length) throw new Error('Selected member is not active in this season');

        const completedAt = item.completedAt ? new Date(item.completedAt) : new Date();
        if (Number.isNaN(completedAt.getTime())) throw new Error('Invalid completed date');
        const completedWeekStart = getWeekStartDate(completedAt, weekCutoffTime, weekTimeZone);
        const distanceValue = item.distanceValue != null && item.distanceValue !== '' ? Number(item.distanceValue) : null;
        const durationMinutes = item.durationMinutes != null && item.durationMinutes !== '' ? asInt(item.durationMinutes) : null;
        const durationSeconds = item.durationSeconds != null && item.durationSeconds !== '' ? Math.min(59, Math.max(0, asInt(item.durationSeconds) || 0)) : null;
        const caloriesBurned = item.caloriesBurned != null && item.caloriesBurned !== ''
          ? sanitizeCalories({
              calories: Number(item.caloriesBurned),
              activityType,
              distanceMiles: distanceValue ?? 0,
              durationMinutes: durationMinutes ?? 0
            }).calories
          : estimateCalories({ activityType, distanceMiles: distanceValue ?? 0, durationMinutes: durationMinutes ?? 0 });
        const points = item.points != null && item.points !== ''
          ? Math.round(Number(item.points) * 100) / 100
          : calculateChallengeWorkoutPoints({ activityType, distanceValue, caloriesBurned, durationMinutes, settings });

        let weeklyTask = null;
        const weeklyTaskId = item.weeklyTaskId ? asInt(item.weeklyTaskId) : null;
        if (weeklyTaskId) {
          weeklyTask = await ChallengeWeeklyTask.findById(weeklyTaskId);
          if (!weeklyTask || Number(weeklyTask.learning_class_id) !== Number(classId)) throw new Error('Invalid weekly challenge tag');
          if (dateToYmd(weeklyTask.week_start_date) !== dateToYmd(completedWeekStart)) {
            throw new Error('Weekly challenge tag must belong to the workout week');
          }
          if (weeklyTask.mode !== 'full_team') {
            const assignment = await ChallengeWeeklyAssignment.findByTaskAndUser(weeklyTask.id, targetUserId);
            if (!assignment && item.allowManagerChallengeOverride !== true) {
              throw new Error('Selected member is not assigned to that weekly challenge');
            }
          }
        }

        const team = await ChallengeTeam.getTeamForUser(classId, targetUserId);
        const isRaceExplicit = item.isRace === true || item.isRace === 'true' || item.isRace === 1;
        const isRaceAutoDetect = String(activityType).toLowerCase().includes('run') && distanceValue != null && Number(distanceValue) >= 13.1;
        const isRace = isRaceExplicit || isRaceAutoDetect;
        const proofReviewedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const workout = await ChallengeWorkout.create({
          learningClassId: classId,
          teamId: team?.id || null,
          userId: targetUserId,
          submittedByUserId: req.user.id,
          submittedOnBehalfOfUserId: targetUserId,
          submissionSource: 'manager_bulk_upload',
          ocrConfidence: item.ocrConfidence ?? item.confidence ?? null,
          ocrRawText: item.rawText || null,
          ocrExtractedJson: item.extracted || null,
          activityType,
          isTreadmill: item.isTreadmill === true || /treadmill/i.test(String(item.terrain || item.extracted?.terrain || '')),
          isRace,
          raceDistanceMiles: isRace && item.raceDistanceMiles != null ? Number(item.raceDistanceMiles) : null,
          raceChipTimeSeconds: isRace && item.raceChipTimeSeconds != null ? asInt(item.raceChipTimeSeconds) : null,
          raceOverallPlace: isRace && item.raceOverallPlace != null ? asInt(item.raceOverallPlace) : null,
          terrain: item.terrain || item.extracted?.terrain || null,
          distanceValue,
          reportedDistanceValue: distanceValue,
          verifiedDistanceValue: distanceValue,
          durationMinutes,
          durationSeconds,
          caloriesBurned,
          averageHeartrate: item.averageHeartrate != null ? Number(item.averageHeartrate) : null,
          points,
          workoutNotes: item.workoutNotes || 'Manager bulk uploaded on behalf of athlete',
          screenshotFilePath: item.filePath || item.screenshotFilePath || null,
          completedAt: completedAt.toISOString().slice(0, 19).replace('T', ' '),
          weeklyTaskId,
          proofStatus: 'approved',
          proofReviewNote: 'Auto-approved manager on-behalf upload',
          proofReviewedByUserId: req.user.id,
          proofReviewedAt
        });

        if (workout?.id) {
          if (workout.weekly_task_id && weeklyTask?.mode !== 'full_team') {
            const assignment = await ChallengeWeeklyAssignment.findByTaskAndUser(weeklyTaskId, targetUserId);
            if (assignment) {
              await ChallengeWeeklyAssignment.markCompleted(assignment.id, {
                completedAt: completedAt.toISOString().slice(0, 19).replace('T', ' ')
              });
            }
          }
          if (workout.screenshot_file_path) {
            await pool.execute(
              `INSERT IGNORE INTO user_photos (user_id, file_path, source, source_ref_id, is_profile)
               VALUES (?, ?, 'workout_screenshot', ?, 0)`,
              [targetUserId, workout.screenshot_file_path, workout.id]
            ).catch(() => {});
          }
          await enqueueWorkoutVision({
            workoutId: workout.id,
            learningClassId: classId,
            userId: targetUserId,
            screenshotFilePath: workout.screenshot_file_path || null,
            workoutNotes: workout.workout_notes || null,
            responseJson: {
              extracted: item.extracted || null,
              rawText: item.rawText || null,
              confidence: item.ocrConfidence ?? item.confidence ?? null,
              source: 'manager_bulk_upload'
            }
          }).catch(() => {});
          await queueClubRecordBreakCandidates({ learningClassId: classId, workoutId: workout.id, userId: targetUserId }).catch(() => {});
        }
        created.push({ clientItemId: item.clientItemId || null, workout });
      } catch (err) {
        errors.push({ index: i, clientItemId: item.clientItemId || null, message: err?.message || 'Failed to create workout' });
      }
    }
    return res.status(created.length ? 201 : 400).json({ created, errors });
  } catch (e) {
    next(e);
  }
};

export const disqualifyWorkout = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    const isDisqualified = req.body?.isDisqualified !== false;
    const reason = req.body?.reason ? String(req.body.reason) : null;
    const updated = await ChallengeWorkout.updateDisqualification(workoutId, {
      isDisqualified,
      reason,
      byUserId: req.user.id,
      at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
    return res.json({ workout: updated });
  } catch (e) {
    next(e);
  }
};

export const getDraftReport = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const canManage = await canManageChallenge({ user: req.user, classId });
    const isCaptain = await isCaptainForClass({ classId, userId: req.user.id });
    if (!canManage && !isCaptain) {
      return res.status(403).json({ error: { message: 'Manager/captain access required' } });
    }
    const [members] = await pool.execute(
      `SELECT pm.provider_user_id, pm.membership_status, u.first_name, u.last_name, u.email
       FROM learning_class_provider_memberships pm
       INNER JOIN users u ON u.id = pm.provider_user_id
       WHERE pm.learning_class_id = ? AND pm.membership_status IN ('active','completed')
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [classId]
    );
    const [noteRows] = await pool.execute(
      `SELECT provider_user_id, note_text, updated_at
       FROM challenge_member_draft_notes
       WHERE learning_class_id = ?`,
      [classId]
    );
    const notesByUser = new Map((noteRows || []).map((r) => [Number(r.provider_user_id), { note: r.note_text || '', updatedAt: r.updated_at || null }]));
    let previousSeason = null;
    const orgId = Number(access.class?.organization_id || 0);
    let clubNotesByUser = new Map();
    if (orgId > 0) {
      try {
        const [clubNoteRows] = await pool.execute(
          `SELECT provider_user_id, note_text, updated_at
           FROM club_member_draft_notes
           WHERE club_organization_id = ?`,
          [orgId]
        );
        clubNotesByUser = new Map(
          (clubNoteRows || []).map((r) => [Number(r.provider_user_id), { note: r.note_text || '', updatedAt: r.updated_at || null }])
        );
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }
    if (orgId > 0) {
      const anchor = access.class?.starts_at || access.class?.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
      const [prevRows] = await pool.execute(
        `SELECT id, class_name, starts_at
         FROM learning_program_classes
         WHERE organization_id = ?
           AND id <> ?
           AND COALESCE(starts_at, created_at) < COALESCE(?, NOW())
         ORDER BY COALESCE(starts_at, created_at) DESC
         LIMIT 1`,
        [orgId, classId, anchor]
      );
      previousSeason = prevRows?.[0] || null;
    }
    const previousByUser = new Map();
    if (previousSeason?.id) {
      const [prevStats] = await pool.execute(
        `SELECT
           pm.provider_user_id,
           COALESCE(SUM(w.points), 0) AS total_points,
           COALESCE(SUM(w.distance_value), 0) AS total_miles,
           COUNT(w.id) AS workout_count,
           MAX(t.team_name) AS team_name,
           MAX(CASE WHEN e.id IS NULL THEN 0 ELSE 1 END) AS was_eliminated
         FROM learning_class_provider_memberships pm
         LEFT JOIN challenge_workouts w
           ON w.learning_class_id = pm.learning_class_id
           AND w.user_id = pm.provider_user_id
           AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         LEFT JOIN challenge_team_members ctm ON ctm.provider_user_id = pm.provider_user_id
         LEFT JOIN challenge_teams t ON t.id = ctm.team_id AND t.learning_class_id = pm.learning_class_id
         LEFT JOIN challenge_eliminations e
           ON e.learning_class_id = pm.learning_class_id
           AND e.provider_user_id = pm.provider_user_id
         WHERE pm.learning_class_id = ?
         GROUP BY pm.provider_user_id`,
        [previousSeason.id]
      );
      for (const row of prevStats || []) {
        previousByUser.set(Number(row.provider_user_id), {
          totalPoints: Number(row.total_points || 0),
          totalMiles: Number(row.total_miles || 0),
          workoutCount: Number(row.workout_count || 0),
          teamName: row.team_name || null,
          wasEliminated: Number(row.was_eliminated || 0) === 1
        });
      }
    }
    const participants = (members || []).map((m) => {
      const uid = Number(m.provider_user_id);
      const seasonNote = String(notesByUser.get(uid)?.note || '').trim();
      const clubNote = String(clubNotesByUser.get(uid)?.note || '').trim();
      const draftNote = seasonNote || clubNote;
      const draftNoteUpdatedAt = seasonNote
        ? notesByUser.get(uid)?.updatedAt || null
        : clubNotesByUser.get(uid)?.updatedAt || null;
      return {
        providerUserId: uid,
        firstName: m.first_name,
        lastName: m.last_name,
        email: m.email,
        membershipStatus: m.membership_status,
        draftNote,
        draftNoteUpdatedAt,
        draftNoteScope: seasonNote ? 'season' : clubNote ? 'club' : 'none',
        previousSeason: previousByUser.get(uid) || null
      };
    });
    return res.json({
      canEditNotes: canManage,
      previousSeason: previousSeason
        ? { id: Number(previousSeason.id), className: previousSeason.class_name, startsAt: previousSeason.starts_at || null }
        : null,
      participants
    });
  } catch (e) {
    next(e);
  }
};

export const upsertDraftNote = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const providerUserId = asInt(req.params.providerUserId);
    if (!classId || !providerUserId) return res.status(400).json({ error: { message: 'Invalid classId/providerUserId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const [memberRows] = await pool.execute(
      `SELECT 1 FROM learning_class_provider_memberships
       WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed')
       LIMIT 1`,
      [classId, providerUserId]
    );
    if (!memberRows?.length) return res.status(404).json({ error: { message: 'Participant not found in season' } });
    const noteText = req.body?.noteText != null ? String(req.body.noteText).slice(0, 2000) : null;
    await pool.execute(
      `INSERT INTO challenge_member_draft_notes
       (learning_class_id, provider_user_id, note_text, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         note_text = VALUES(note_text),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [classId, providerUserId, noteText, req.user.id, req.user.id]
    );
    const orgId = Number(access.class?.organization_id || 0);
    if (orgId > 0) {
      try {
        await pool.execute(
          `INSERT INTO club_member_draft_notes
           (club_organization_id, provider_user_id, note_text, updated_by_user_id)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             note_text = VALUES(note_text),
             updated_by_user_id = VALUES(updated_by_user_id),
             updated_at = CURRENT_TIMESTAMP`,
          [orgId, providerUserId, noteText, req.user.id]
        );
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }
    return res.json({ ok: true, providerUserId, noteText });
  } catch (e) {
    next(e);
  }
};

export const editOwnImportedTreadmillWorkout = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    if (Number(workout.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: { message: 'You can only edit your own workouts' } });
    }
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass: access.class,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }
    if (!workout.strava_activity_id || Number(workout.is_treadmill) !== 1) {
      return res.status(400).json({ error: { message: 'Only treadmill workouts imported from Strava can be edited' } });
    }
    const distanceValue = req.body?.distanceValue != null ? Number(req.body.distanceValue) : null;
    if (distanceValue == null || !Number.isFinite(distanceValue) || distanceValue < 0) {
      return res.status(400).json({ error: { message: 'A valid distanceValue is required' } });
    }
    const note = req.body?.workoutNotes != null ? String(req.body.workoutNotes).trim() : null;
    const screenshot = req.body?.screenshotFilePath != null ? String(req.body.screenshotFilePath).trim() : null;
    const [result] = await pool.execute(
      `UPDATE challenge_workouts
       SET distance_value = ?,
           reported_distance_value = ?,
           workout_notes = ?,
           screenshot_file_path = CASE WHEN ? = '' THEN screenshot_file_path ELSE ? END,
           proof_status = 'pending'
       WHERE id = ? AND learning_class_id = ? AND user_id = ?`,
      [distanceValue, distanceValue, note, screenshot || '', screenshot || '', workoutId, classId, req.user.id]
    );
    if (!Number(result?.affectedRows || 0)) return res.status(404).json({ error: { message: 'Workout not found' } });
    const updated = await ChallengeWorkout.findById(workoutId);
    return res.json({ workout: updated });
  } catch (e) {
    next(e);
  }
};

/**
 * PATCH /learning-program-classes/:classId/workouts/:workoutId/strava-details
 * Allow the workout owner to attach a weekly challenge and/or treadmill proof to any Strava import.
 * Accepts multipart/form-data with optional file field "treadmillProof".
 */
export const patchStravaWorkoutDetails = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    if (Number(workout.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: { message: 'You can only edit your own workouts' } });
    }
    if (!workout.strava_activity_id) {
      return res.status(400).json({ error: { message: 'Only Strava-imported workouts can be edited here' } });
    }

    const updates = [];
    const params = [];

    // Attach a weekly challenge
    const weeklyTaskId = req.body?.weeklyTaskId != null ? asInt(req.body.weeklyTaskId) : undefined;
    if (weeklyTaskId !== undefined) {
      updates.push('weekly_task_id = ?');
      params.push(weeklyTaskId || null);
    }

    // Mark as treadmill (can toggle on for Strava treadmill imports that weren't flagged)
    const isTreadmill = req.body?.isTreadmill != null
      ? (req.body.isTreadmill === true || req.body.isTreadmill === 'true' || req.body.isTreadmill === '1')
      : undefined;
    if (isTreadmill !== undefined) {
      updates.push('is_treadmill = ?');
      params.push(isTreadmill ? 1 : 0);
    }

    // Corrected treadmill distance
    const distanceValue = req.body?.distanceValue != null ? Number(req.body.distanceValue) : undefined;
    if (distanceValue !== undefined && Number.isFinite(distanceValue) && distanceValue >= 0) {
      updates.push('distance_value = ?');
      params.push(distanceValue);
      updates.push('reported_distance_value = ?');
      params.push(distanceValue);
      // Recalculate points from corrected distance
      updates.push('points = ?');
      params.push(parseFloat(Math.max(0, distanceValue).toFixed(2)));
    }

    // Treadmill proof file upload
    if (req.file?.buffer) {
      const { default: StorageService } = await import('../services/storage.service.js');
      const saved = await StorageService.saveWorkoutMedia({
        userId: req.user.id,
        fileBuffer: req.file.buffer,
        filename: req.file.originalname || `proof-${Date.now()}.jpg`,
        contentType: req.file.mimetype || 'image/jpeg'
      });
      updates.push('screenshot_file_path = ?');
      params.push(saved.relativePath);
      // Trigger pending proof review if it wasn't already
      if (workout.proof_status !== 'approved') {
        updates.push('proof_status = ?');
        params.push('pending');
      }
    }

    if (!updates.length) return res.json({ workout });
    params.push(workoutId, classId, req.user.id);
    await pool.execute(
      `UPDATE challenge_workouts SET ${updates.join(', ')} WHERE id = ? AND learning_class_id = ? AND user_id = ?`,
      params
    );
    const updated = await ChallengeWorkout.findById(workoutId);
    return res.json({ workout: updated });
  } catch (e) {
    next(e);
  }
};

const ALLOWED_TERRAINS = new Set(['Road', 'Trail', 'Track', 'Treadmill', 'Beach', 'Race', 'Other']);

/**
 * PATCH /learning-program-classes/:classId/workouts/:workoutId/own-fields
 * Allow the workout owner to update activity type, terrain, and notes on any own workout.
 * Accepts multipart/form-data with optional file field "treadmillProof".
 */
export const editOwnWorkoutFields = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    if (Number(workout.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: { message: 'You can only edit your own workouts' } });
    }

    const updates = [];
    const params = [];

    const activityType = req.body?.activityType != null ? normalizeActivityType(String(req.body.activityType).trim()) : undefined;
    if (activityType !== undefined && activityType.length > 0) {
      updates.push('activity_type = ?');
      params.push(activityType);
    }

    const terrain = req.body?.terrain != null ? String(req.body.terrain).trim() : undefined;
    if (terrain !== undefined) {
      if (terrain && !ALLOWED_TERRAINS.has(terrain)) {
        return res.status(400).json({ error: { message: `Invalid terrain. Allowed: ${[...ALLOWED_TERRAINS].join(', ')}` } });
      }
      updates.push('terrain = ?');
      params.push(terrain || null);
      // Auto-set treadmill flag from terrain
      const isTreadmill = terrain === 'Treadmill';
      updates.push('is_treadmill = ?');
      params.push(isTreadmill ? 1 : 0);
    }

    const workoutNotes = req.body?.workoutNotes != null ? String(req.body.workoutNotes).trim() : undefined;
    if (workoutNotes !== undefined) {
      updates.push('workout_notes = ?');
      params.push(workoutNotes || null);
    }

    // If switching to treadmill, require proof photo (existing or newly uploaded)
    const becomingTreadmill = terrain === 'Treadmill';
    const alreadyHasProof = !!(workout.screenshot_file_path || workout.treadmill_proof_file_path);

    if (req.file?.buffer) {
      const { default: StorageService } = await import('../services/storage.service.js');
      const saved = await StorageService.saveWorkoutMedia({
        userId: req.user.id,
        fileBuffer: req.file.buffer,
        filename: req.file.originalname || `proof-${Date.now()}.jpg`,
        contentType: req.file.mimetype || 'image/jpeg'
      });
      updates.push('screenshot_file_path = ?');
      params.push(saved.relativePath);
      if (workout.proof_status !== 'approved') {
        updates.push('proof_status = ?');
        params.push('pending');
      }
    } else if (becomingTreadmill && !alreadyHasProof) {
      return res.status(400).json({ error: { message: 'Treadmill workouts require a treadmill proof photo. Please upload one.' } });
    }

    if (!updates.length) return res.json({ workout });
    params.push(workoutId, classId, req.user.id);
    await pool.execute(
      `UPDATE challenge_workouts SET ${updates.join(', ')} WHERE id = ? AND learning_class_id = ? AND user_id = ?`,
      params
    );
    const updated = await ChallengeWorkout.findById(workoutId);
    return res.json({ workout: updated });
  } catch (e) {
    next(e);
  }
};

export const patchRaceInfo = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    if (Number(workout.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: { message: 'You can only edit your own workouts' } });
    }

    const updates = [];
    const params = [];
    let weeklyTask = null;

    const isRace = req.body.isRace === true || req.body.isRace === 'true' || req.body.isRace === 1 || req.body.isRace === '1';
    updates.push('is_race = ?');
    params.push(isRace ? 1 : 0);

    if (isRace) {
      if (req.body.raceDistanceMiles != null) { updates.push('race_distance_miles = ?'); params.push(parseFloat(req.body.raceDistanceMiles) || null); }
      if (req.body.raceChipTimeSeconds != null) { updates.push('race_chip_time_seconds = ?'); params.push(asInt(req.body.raceChipTimeSeconds) || null); }
      if (req.body.raceOverallPlace != null) { updates.push('race_overall_place = ?'); params.push(asInt(req.body.raceOverallPlace) || null); }
    } else {
      updates.push('race_distance_miles = NULL', 'race_chip_time_seconds = NULL', 'race_overall_place = NULL');
    }

    if (req.body.weeklyTaskId !== undefined) {
      const wt = req.body.weeklyTaskId ? asInt(req.body.weeklyTaskId) : null;
      if (wt) {
        weeklyTask = await ChallengeWeeklyTask.findById(wt);
        if (!weeklyTask || Number(weeklyTask.learning_class_id) !== Number(classId)) {
          return res.status(400).json({ error: { message: 'Invalid weekly challenge tag' } });
        }
        if (String(weeklyTask.mode || '') !== 'full_team') {
          const assignment = await ChallengeWeeklyAssignment.findByTaskAndUser(wt, req.user.id);
          if (!assignment) {
            return res.status(403).json({ error: { message: 'You must be assigned to this weekly challenge before tagging a workout.' } });
          }
        }
      }
      updates.push('weekly_task_id = ?');
      params.push(wt);
    }

    params.push(workoutId, classId, req.user.id);
    await pool.execute(
      `UPDATE challenge_workouts SET ${updates.join(', ')} WHERE id = ? AND learning_class_id = ? AND user_id = ?`,
      params
    );
    const updated = await ChallengeWorkout.findById(workoutId);
    if (weeklyTask && String(weeklyTask.mode || '') !== 'full_team') {
      const assignment = await ChallengeWeeklyAssignment.findByTaskAndUser(weeklyTask.id, req.user.id);
      if (isApprovedWeeklyAssignment(assignment)) {
        await ChallengeWeeklyAssignment.markCompleted(assignment.id, {
          completedAt: updated?.completed_at || null
        });
      }
    }
    return res.json({ workout: updated });
  } catch (e) {
    next(e);
  }
};

export const listCaptainApplications = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) {
      const mine = await ChallengeCaptainApplication.findByClassAndUser(classId, req.user.id);
      // Return only current user's record if non-manager; do not expose full applicant list.
      return res.json({ applications: mine ? [mine] : [] });
    }
    const applications = await ChallengeCaptainApplication.listByClass(classId);
    return res.json({ applications });
  } catch (e) {
    next(e);
  }
};

export const applyForCaptain = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const klass = access.class;
    const isOpen = klass?.captain_application_open === 1 || klass?.captain_application_open === true;
    const finalized = klass?.captains_finalized === 1 || klass?.captains_finalized === true;
    if (finalized || !isOpen) {
      return res.status(400).json({ error: { message: 'Captain applications are currently closed for this season' } });
    }
    const [membership] = await pool.execute(
      `SELECT 1
       FROM learning_class_provider_memberships
       WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed')
       LIMIT 1`,
      [classId, req.user.id]
    );
    if (!membership?.length) {
      return res.status(403).json({ error: { message: 'Join the season before applying for captain' } });
    }
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }
    const application = await ChallengeCaptainApplication.upsertPending({
      learningClassId: classId,
      userId: req.user.id,
      applicationText: req.body?.applicationText ? String(req.body.applicationText) : null
    });
    return res.status(201).json({ application });
  } catch (e) {
    next(e);
  }
};

export const reviewCaptainApplication = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const applicationId = asInt(req.params.applicationId);
    if (!classId || !applicationId) return res.status(400).json({ error: { message: 'Invalid classId/applicationId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const app = await ChallengeCaptainApplication.findById(applicationId);
    if (!app || Number(app.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Captain application not found' } });
    }
    const reviewed = await ChallengeCaptainApplication.review({
      id: applicationId,
      status: req.body?.status,
      managerNotes: req.body?.managerNotes || null,
      reviewedByUserId: req.user.id
    });
    if (!reviewed) return res.status(400).json({ error: { message: 'status must be approved or rejected' } });
    return res.json({ application: reviewed });
  } catch (e) {
    next(e);
  }
};

export const finalizeCaptains = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    await pool.execute(
      `UPDATE learning_program_classes
       SET captains_finalized = 1, captain_application_open = 0
       WHERE id = ?`,
      [classId]
    );
    return res.json({ finalized: true });
  } catch (e) {
    next(e);
  }
};

export const getTeamWeeklyProgress = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });

    const seasonSettingsForWeek = parseJsonObject(access.class?.season_settings_json || {});
    const scheduleWeek = parseJsonObject(seasonSettingsForWeek?.schedule || {});
    const weekCutoffTime = String(scheduleWeek?.weekEndsSundayAt || access.class?.week_start_time || '00:00');
    const weekTimeZone = String(scheduleWeek?.weekTimeZone || 'UTC');
    const weekStart = req.query.weekStart || req.query.week || getWeekStartDate(new Date(), weekCutoffTime, weekTimeZone);
    const range = getWeekDateTimeRange(String(weekStart).slice(0, 10), weekCutoffTime, weekTimeZone);
    if (!range) return res.status(400).json({ error: { message: 'Invalid weekStart' } });
    const startStr = range.start;
    const endStr = range.end;
    const seasonStartStr = access.class?.starts_at || null;
    const seasonEndStr = access.class?.ends_at || null;

    const seasonSettings = parseJsonObject(access.class?.season_settings_json || {});
    const eventCategory = String(seasonSettings?.event?.category || 'run_ruck').toLowerCase();
    const participation = parseJsonObject(seasonSettings?.participation || {});
    const weeklyGoalMetricRaw = String(participation?.weeklyGoalMetric || '').toLowerCase();
    const weeklyGoalMetric = weeklyGoalMetricRaw;
    const firstPositiveInt = (...vals) => {
      for (const v of vals) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) return n;
      }
      return null;
    };
    const teamsSettings = parseJsonObject(seasonSettings?.teams || {});
    const membersPerTeamFallback = Math.max(1, firstPositiveInt(
      teamsSettings.membersPerTeam,
      teamsSettings.members_per_team,
      participation.weeklyGoalMembersPerTeam,
      participation.weekly_goal_members_per_team,
      participation.baselineMemberCount,
      seasonSettings?.drafting?.membersPerTeam,
      access.class?.expected_team_size
    ) ?? 12);
    let individualMinimum = access.class?.individual_min_points_per_week != null
      ? Number.parseInt(access.class.individual_min_points_per_week, 10)
      : null;
    let teamMinimum = access.class?.team_min_points_per_week != null
      ? Number.parseInt(access.class.team_min_points_per_week, 10)
      : null;
    let metricUnit = 'pts';
    let metricField = 'weekly_points';
    let milesTargets = null;
    const isMilesGoal = eventCategory === 'run_ruck' || weeklyGoalMetric === 'miles' || weeklyGoalMetric.includes('mile');
    if (isMilesGoal) {
      milesTargets = resolveWeeklyDistanceTargets(access.class, String(weekStart).slice(0, 10));
      individualMinimum = milesTargets.perPersonMilesMinimum;
      teamMinimum = milesTargets.teamMilesMinimumBaseline;
      metricUnit = 'mi';
      metricField = 'weekly_miles';
    } else if ((teamMinimum == null || Number(teamMinimum) === 0) && individualMinimum != null && Number(individualMinimum) > 0) {
      teamMinimum = Math.round(Number(individualMinimum) * membersPerTeamFallback);
    }

    const viewWeekYmd = String(weekStart).slice(0, 10);

    const [allTeamRows] = await pool.execute(
      `SELECT id, team_name, logo_path, team_color FROM challenge_teams WHERE learning_class_id = ?`,
      [classId]
    );
    const teamMeta = new Map((allTeamRows || []).map((t) => [Number(t.id), String(t.team_name || '')]));

    const [rows] = await pool.execute(
      `SELECT
         t.id AS team_id,
         t.team_name,
         u.id AS user_id,
         u.first_name,
         u.last_name,
         COALESCE(SUM(w.points), 0) AS weekly_points,
         COALESCE(SUM(w.distance_value), 0) AS weekly_miles
       FROM challenge_teams t
       INNER JOIN challenge_team_members tm ON tm.team_id = t.id
       INNER JOIN users u ON u.id = tm.provider_user_id
       LEFT JOIN challenge_workouts w
         ON w.learning_class_id = t.learning_class_id
         AND w.user_id = tm.provider_user_id
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         AND (? IS NULL OR w.completed_at >= ?)
         AND (? IS NULL OR w.completed_at <= ?)
         AND w.completed_at >= ?
         AND w.completed_at < ?
       WHERE t.learning_class_id = ?
       GROUP BY t.id, t.team_name, u.id, u.first_name, u.last_name
       ORDER BY t.team_name ASC, ${metricField} DESC, u.last_name ASC, u.first_name ASC`,
      [seasonStartStr, seasonStartStr, seasonEndStr, seasonEndStr, startStr, endStr, classId]
    );

    // Also fetch captains with their workout data for this week
    const [captainRows] = await pool.execute(
      `SELECT
         t.id AS team_id,
         t.team_name,
         u.id AS user_id,
         u.first_name,
         u.last_name,
         COALESCE(SUM(w.points), 0) AS weekly_points,
         COALESCE(SUM(w.distance_value), 0) AS weekly_miles
       FROM challenge_teams t
       INNER JOIN users u ON u.id = t.team_manager_user_id
       LEFT JOIN challenge_workouts w
         ON w.learning_class_id = t.learning_class_id
         AND w.user_id = t.team_manager_user_id
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         AND (? IS NULL OR w.completed_at >= ?)
         AND (? IS NULL OR w.completed_at <= ?)
         AND w.completed_at >= ?
         AND w.completed_at < ?
       WHERE t.learning_class_id = ?
         AND t.team_manager_user_id IS NOT NULL
       GROUP BY t.id, t.team_name, u.id, u.first_name, u.last_name`,
      [seasonStartStr, seasonStartStr, seasonEndStr, seasonEndStr, startStr, endStr, classId]
    );

    const pace = weekSeventhPaceState({
      rangeStartSql: startStr,
      rangeEndSql: endStr,
      timeZone: weekTimeZone
    });
    const paceFraction = pace.paceFraction;

    const teamsMap = new Map();
    const memberSeen = new Set();
    for (const t of allTeamRows || []) {
      const tid = Number(t.id);
      if (!tid) continue;
      teamsMap.set(tid, {
        teamId: tid,
        teamName: String(t.team_name || '').trim() || 'Team',
        logoPath: t.logo_path || null,
        teamColor: t.team_color || null,
        totalWeeklyPoints: 0,
        totalWeeklyMiles: 0,
        members: []
      });
    }
    const addMember = (r, opts = {}) => {
      const eliminated = !!opts.eliminated;
      const eliminationWeekStart = opts.eliminationWeekStart ? String(opts.eliminationWeekStart).slice(0, 10) : null;
      const tid = Number(r.team_id);
      const uid = Number(r.user_id);
      const key = `${tid}:${uid}`;
      if (memberSeen.has(key)) return;
      memberSeen.add(key);
      const teamName = String(r.team_name || teamMeta.get(tid) || '').trim() || 'Team';
      if (!teamsMap.has(tid)) {
        teamsMap.set(tid, {
          teamId: tid,
          teamName,
          totalWeeklyPoints: 0,
          totalWeeklyMiles: 0,
          members: []
        });
      }
      const metricValue = Number(r[metricField] || 0);
      let progressStatus = 'tracking';
      if (individualMinimum != null) {
        const ind = Number(individualMinimum);
        const expectedToDate = Number((ind * paceFraction).toFixed(2));
        if (metricValue > ind) progressStatus = 'ahead';
        else if (metricValue === ind) progressStatus = 'met';
        else if (metricValue >= expectedToDate) progressStatus = 'tracking';
        else progressStatus = 'behind';
      }
      const entry = teamsMap.get(tid);
      entry.totalWeeklyPoints += Number(r.weekly_points || 0);
      entry.totalWeeklyMiles += Number(r.weekly_miles || 0);
      entry.members.push({
        userId: uid,
        firstName: r.first_name,
        lastName: r.last_name,
        weeklyPoints: Number(r.weekly_points || 0),
        weeklyMiles: Number(r.weekly_miles || 0),
        progressStatus,
        eliminated,
        eliminationWeekStart
      });
    };
    for (const r of rows || []) addMember(r);
    for (const r of captainRows || []) addMember(r);

    const elimRows = await ChallengeElimination.listAll(classId);
    const elimUids = [...new Set((elimRows || []).map((e) => Number(e.provider_user_id)).filter(Boolean))];
    let elimWorkoutByUser = new Map();
    if (elimUids.length) {
      const ph = elimUids.map(() => '?').join(',');
      const [wElim] = await pool.execute(
        `SELECT user_id,
                COALESCE(SUM(points), 0) AS weekly_points,
                COALESCE(SUM(distance_value), 0) AS weekly_miles
         FROM challenge_workouts
         WHERE learning_class_id = ?
           AND user_id IN (${ph})
           AND (is_disqualified IS NULL OR is_disqualified = 0)
           AND (? IS NULL OR completed_at >= ?)
           AND (? IS NULL OR completed_at <= ?)
           AND completed_at >= ?
           AND completed_at < ?
         GROUP BY user_id`,
        [classId, ...elimUids, seasonStartStr, seasonStartStr, seasonEndStr, seasonEndStr, startStr, endStr]
      );
      elimWorkoutByUser = new Map(
        (wElim || []).map((row) => [
          Number(row.user_id),
          { weekly_points: row.weekly_points, weekly_miles: row.weekly_miles }
        ])
      );
    }
    for (const er of elimRows || []) {
      const tid = Number(er.team_id);
      const uid = Number(er.provider_user_id);
      if (!tid || !uid) continue;
      const elimWeek = dateToYmd(er.week_start_date);
      const eliminatedForThisWeekView = Boolean(elimWeek && viewWeekYmd >= elimWeek);
      const wr = elimWorkoutByUser.get(uid) || { weekly_points: 0, weekly_miles: 0 };
      addMember(
        {
          team_id: tid,
          team_name: teamMeta.get(tid) || er.team_name || 'Team',
          user_id: uid,
          first_name: er.first_name,
          last_name: er.last_name,
          weekly_points: wr.weekly_points,
          weekly_miles: wr.weekly_miles
        },
        { eliminated: eliminatedForThisWeekView, eliminationWeekStart: elimWeek || null }
      );
    }

    const storedWeekTarget = teamsSettings?.weeklyTeamTargets?.[viewWeekYmd];
    const plannedTeamTarget =
      storedWeekTarget != null && Number.isFinite(Number(storedWeekTarget)) && Number(storedWeekTarget) > 0
        ? Number(Number(storedWeekTarget).toFixed(2))
        : Number.isFinite(Number(individualMinimum)) && Number(individualMinimum) > 0
          ? Number((Number(individualMinimum) * membersPerTeamFallback).toFixed(2))
          : null;

    const progressStatusRank = (s) => {
      const x = String(s || 'tracking').toLowerCase();
      if (x === 'behind') return 0;
      if (x === 'tracking') return 1;
      if (x === 'met') return 2;
      if (x === 'ahead') return 3;
      return 1;
    };
    const rankToProgressStatus = (r) => {
      if (r <= 0) return 'behind';
      if (r === 1) return 'tracking';
      if (r === 2) return 'met';
      return 'ahead';
    };

    const teamsOut = Array.from(teamsMap.values()).map((entry) => {
      const rosteredMemberCount = Array.isArray(entry.members) ? entry.members.length : 0;
      const activeMemberCount = Array.isArray(entry.members)
        ? entry.members.filter((m) => !m.eliminated).length
        : 0;
      const totalMetric = metricUnit === 'mi'
        ? Number(entry.totalWeeklyMiles || 0)
        : Number(entry.totalWeeklyPoints || 0);
      const teamTargetForStatus = plannedTeamTarget;
      if (teamTargetForStatus == null) {
        return {
          ...entry,
          rosteredMemberCount,
          activeMemberCount,
          teamMilesTargetPlanned: null,
          teamPointsTargetPlanned: null,
          teamProgressStatus: 'tracking',
          teamExpectedToDate: null
        };
      }
      const expected = Number((teamTargetForStatus * paceFraction).toFixed(2));
      let teamProgressStatus = 'tracking';
      if (totalMetric > teamTargetForStatus) teamProgressStatus = 'ahead';
      else if (totalMetric === teamTargetForStatus) teamProgressStatus = 'met';
      else if (totalMetric >= expected) teamProgressStatus = 'tracking';
      else teamProgressStatus = 'behind';

      let worstRank = progressStatusRank(teamProgressStatus);
      for (const m of entry.members || []) {
        if (m.eliminated) continue;
        worstRank = Math.min(worstRank, progressStatusRank(m.progressStatus));
      }
      teamProgressStatus = rankToProgressStatus(worstRank);

      return {
        ...entry,
        rosteredMemberCount,
        activeMemberCount,
        teamMilesTargetPlanned: metricUnit === 'mi' ? teamTargetForStatus : null,
        teamPointsTargetPlanned: metricUnit === 'mi' ? null : teamTargetForStatus,
        teamProgressStatus,
        teamExpectedToDate: expected
      };
    });

    const indMinNum = individualMinimum != null ? Number(individualMinimum) : null;

    return res.json({
      weekStartDate: String(weekStart).slice(0, 10),
      individualMinimum,
      teamMinimum,
      /** Effective group weekly target (mi or pts) after DB + fallbacks; same for every team. */
      groupWeeklyTarget: plannedTeamTarget,
      teamMilesMinimumBaseline: metricUnit === 'mi' ? plannedTeamTarget : null,
      baselineRosterSize: membersPerTeamFallback,
      metricUnit,
      paceFraction,
      paceDayNumber: pace.dayNumberInWeek,
      elapsedHoursRatio: pace.elapsedHoursRatio,
      individualRequiredPerSegment:
        indMinNum != null && indMinNum > 0 ? Number((indMinNum / 7).toFixed(3)) : null,
      teamRequiredPerSegment:
        plannedTeamTarget != null && plannedTeamTarget > 0
          ? Number((plannedTeamTarget / 7).toFixed(3))
          : null,
      targetBasis: metricUnit === 'mi' ? 'planned_roster_baseline' : 'points',
      teams: teamsOut
    });
  } catch (e) {
    next(e);
  }
};

export const listChallengeMessages = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await resolveChallengeAccessOrManage({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const limit = Math.min(100, asInt(req.query.limit) || 50);
    const offset = asInt(req.query.offset) || 0;
    const scope = String(req.query.scope || 'season').toLowerCase() === 'team' ? 'team' : 'season';
    let teamId = req.query.teamId ? asInt(req.query.teamId) : null;
    if (scope === 'team' && !teamId) {
      const team = await ChallengeTeam.getTeamForUser(classId, req.user.id);
      teamId = team?.id || null;
    }
    const messages = await ChallengeMessage.listByChallenge(classId, { limit, offset, scope, teamId });
    const peek = String(req.query.peek || req.query.noMarkRead || '').trim() === '1';
    if (!peek) {
      const newestId = await ChallengeMessage.getLatestMessageId(classId, { scope, teamId: teamId || 0 });
      if (newestId) {
        await ChallengeMessage.bumpReadWatermark({
          learningClassId: classId,
          userId: Number(req.user.id),
          scope,
          teamId: teamId || 0,
          lastReadMessageId: newestId
        });
      }
    }
    return res.json({ scope, teamId: teamId || null, messages });
  } catch (e) {
    next(e);
  }
};

export const postChallengeMessage = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const messageText = String(req.body?.messageText || '').trim();
    if (!classId || !messageText) return res.status(400).json({ error: { message: 'classId and messageText required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const [membership] = await pool.execute(
      `SELECT 1
       FROM learning_class_provider_memberships
       WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed')
       LIMIT 1`,
      [classId, req.user.id]
    );
    if (!membership?.length && !(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Join the season before posting messages' } });
    }
    if (membership?.length) {
      const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
        klass: access.class,
        userId: req.user.id
      });
      if (!participationAcceptance.ok) {
        return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
      }
    }
    const scope = String(req.body?.scope || 'season').toLowerCase() === 'team' ? 'team' : 'season';
    let teamId = null;
    if (scope === 'team') {
      teamId = req.body.teamId ? asInt(req.body.teamId) : null;
      if (!teamId) {
        const team = await ChallengeTeam.getTeamForUser(classId, req.user.id);
        teamId = team?.id || null;
      }
      if (!teamId) {
        return res.status(400).json({ error: { message: 'Join a team before posting in team chat' } });
      }
    }
    // attachmentPaths: array of previously-uploaded file paths (from /messages/attachment endpoint)
    let attachmentsJson = null;
    if (Array.isArray(req.body?.attachmentPaths) && req.body.attachmentPaths.length) {
      const paths = req.body.attachmentPaths.map((p) => String(p).trim()).filter(Boolean).slice(0, 8);
      if (paths.length) attachmentsJson = JSON.stringify(paths);
    }
    const parentMessageId = req.body?.parentMessageId ? asInt(req.body.parentMessageId) : null;
    const message = await ChallengeMessage.create({
      learningClassId: classId,
      userId: req.user.id,
      teamId,
      messageText,
      attachmentsJson,
      parentMessageId
    });
    try {
      await challengeMessageBridge.postMessageToChannel({
        learningClassId: classId,
        teamId,
        userId: req.user.id,
        messageId: message?.id,
        text: messageText
      });
    } catch {
      // Non-blocking bridge integration.
    }
    return res.status(201).json({ message });
  } catch (e) {
    next(e);
  }
};

export const listMessageReactions = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const messageId = asInt(req.params.messageId);
    if (!classId || !messageId) return res.status(400).json({ error: { message: 'Invalid params' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: 'Access denied' } });
    const [rows] = await pool.execute(
      `SELECT emoji, COUNT(*) AS count,
              MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
       FROM challenge_message_reactions
       WHERE message_id = ?
       GROUP BY emoji
       ORDER BY count DESC`,
      [req.user.id, messageId]
    );
    return res.json({ reactions: (rows || []).map((r) => ({ emoji: r.emoji, count: Number(r.count), mine: Number(r.mine) === 1 })) });
  } catch (e) { next(e); }
};

export const toggleMessageReaction = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const messageId = asInt(req.params.messageId);
    if (!classId || !messageId) return res.status(400).json({ error: { message: 'Invalid params' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: 'Access denied' } });
    const emoji = String(req.body?.emoji || '').trim().slice(0, 64);
    if (!emoji) return res.status(400).json({ error: { message: 'emoji is required' } });
    // Toggle: insert or delete
    const [existing] = await pool.execute(
      `SELECT id FROM challenge_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ? LIMIT 1`,
      [messageId, req.user.id, emoji]
    );
    if ((existing || []).length) {
      await pool.execute(`DELETE FROM challenge_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`, [messageId, req.user.id, emoji]);
    } else {
      await pool.execute(`INSERT IGNORE INTO challenge_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)`, [messageId, req.user.id, emoji]);
    }
    const [rows] = await pool.execute(
      `SELECT emoji, COUNT(*) AS count, MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
       FROM challenge_message_reactions WHERE message_id = ? GROUP BY emoji ORDER BY count DESC`,
      [req.user.id, messageId]
    );
    return res.json({ reactions: (rows || []).map((r) => ({ emoji: r.emoji, count: Number(r.count), mine: Number(r.mine) === 1 })) });
  } catch (e) { next(e); }
};

export const uploadChallengeMessageAttachment = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });
    const StorageService = (await import('../services/storage.service.js')).default;
    const saved = await StorageService.saveWorkoutMedia({
      userId: req.user.id,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname || `attachment-${Date.now()}.jpg`,
      contentType: req.file.mimetype
    });
    const filePath = saved.relativePath;
    const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    return res.json({ filePath, fileUrl: `${baseUrl}/uploads/${filePath}` });
  } catch (e) { next(e); }
};

export const getChallengeMessageUnreadCounts = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await resolveChallengeAccessOrManage({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    let teamId = 0;
    const team = await ChallengeTeam.getTeamForUser(classId, req.user.id);
    teamId = team?.id || 0;
    const unread = await ChallengeMessage.getUnreadCounts({
      learningClassId: classId,
      userId: req.user.id,
      teamId
    });
    return res.json({ ...unread, teamId: teamId || null });
  } catch (e) {
    next(e);
  }
};

/** Mark season + team chat as read (latest message id per scope). */
export const markChallengeMessagesRead = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await resolveChallengeAccessOrManage({ user: req.user, learningClassId: classId });
    if (!access.ok) {
      return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    }
    const uid = Number(req.user.id);
    const team = await ChallengeTeam.getTeamForUser(classId, uid);
    const teamId = team?.id || 0;
    const seasonNewest = await ChallengeMessage.getLatestMessageId(classId, { scope: 'season', teamId: 0 });
    if (seasonNewest) {
      await ChallengeMessage.bumpReadWatermark({
        learningClassId: classId,
        userId: uid,
        scope: 'season',
        teamId: 0,
        lastReadMessageId: seasonNewest
      });
    }
    if (teamId) {
      const teamNewest = await ChallengeMessage.getLatestMessageId(classId, { scope: 'team', teamId });
      if (teamNewest) {
        await ChallengeMessage.bumpReadWatermark({
          learningClassId: classId,
          userId: uid,
          scope: 'team',
          teamId,
          lastReadMessageId: teamNewest
        });
      }
    }
    const unread = await ChallengeMessage.getUnreadCounts({
      learningClassId: classId,
      userId: uid,
      teamId
    });
    return res.json({ ok: true, ...unread, teamId: teamId || null });
  } catch (e) {
    next(e);
  }
};

export const deleteChallengeMessage = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const messageId = asInt(req.params.messageId);
    if (!classId || !messageId) return res.status(400).json({ error: { message: 'Invalid classId/messageId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const message = await ChallengeMessage.findById(messageId);
    if (!message || Number(message.learning_class_id) !== Number(classId) || message.deleted_at) {
      return res.status(404).json({ error: { message: 'Message not found' } });
    }
    const canDelete = (await canManageChallenge({ user: req.user, classId })) || Number(message.user_id) === Number(req.user.id);
    if (!canDelete) return res.status(403).json({ error: { message: 'Access denied' } });
    await ChallengeMessage.softDelete(messageId, req.user.id);
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const pinChallengeMessage = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const messageId = asInt(req.params.messageId);
    if (!classId || !messageId) return res.status(400).json({ error: { message: 'Invalid classId/messageId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) return res.status(403).json({ error: { message: 'Manage access required' } });
    const message = await ChallengeMessage.findById(messageId);
    if (!message || Number(message.learning_class_id) !== Number(classId) || message.deleted_at) {
      return res.status(404).json({ error: { message: 'Message not found' } });
    }
    const pinned = req.body?.pinned !== false;
    const updated = await ChallengeMessage.pin(messageId, pinned, req.user.id);
    return res.json({ message: updated });
  } catch (e) {
    next(e);
  }
};

export const listWorkoutComments = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    const comments = await ChallengeWorkoutComment.listByWorkout(workoutId);
    return res.json({ comments });
  } catch (e) {
    next(e);
  }
};

export const postWorkoutComment = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    const commentText = String(req.body?.commentText || '').trim();
    const attachmentPath = req.body?.attachmentPath ? String(req.body.attachmentPath).trim() : null;
    const iconId = req.body?.iconId ? asInt(req.body.iconId) : null;
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'classId and workoutId required' } });
    if (!commentText && !attachmentPath && !iconId) return res.status(400).json({ error: { message: 'commentText, attachmentPath, or iconId required' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass: access.class,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }
    const parentCommentId = req.body?.parentCommentId ? asInt(req.body.parentCommentId) : null;
    const comment = await ChallengeWorkoutComment.create({
      workoutId,
      learningClassId: classId,
      userId: req.user.id,
      commentText,
      parentCommentId,
      attachmentPath,
      iconId
    });
    return res.status(201).json({ comment });
  } catch (e) {
    next(e);
  }
};

export const uploadCommentAttachment = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });
    const StorageService = (await import('../services/storage.service.js')).default;
    const saved = await StorageService.saveWorkoutMedia({
      userId: req.user.id,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname || `comment-${Date.now()}.jpg`,
      contentType: req.file.mimetype
    });
    const filePath = saved.relativePath;
    const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    return res.json({ filePath, fileUrl: `${baseUrl}/uploads/${filePath}` });
  } catch (e) { next(e); }
};

export const deleteWorkoutComment = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const commentId = asInt(req.params.commentId);
    if (!classId || !commentId) return res.status(400).json({ error: { message: 'Invalid classId/commentId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const comment = await ChallengeWorkoutComment.findById(commentId);
    if (!comment || Number(comment.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Comment not found' } });
    }
    const canDelete = Number(comment.user_id) === Number(req.user.id) || (await canManageChallenge({ user: req.user, classId }));
    if (!canDelete) return res.status(403).json({ error: { message: 'Access denied' } });
    await ChallengeWorkoutComment.remove(commentId);
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /:classId/workouts/scan-screenshot
 * Multer handles the multipart upload; Google Vision OCR extracts workout data.
 * Returns extracted fields for the frontend to pre-fill the form.
 * Does NOT create a workout — the user reviews and submits separately.
 */
export const scanWorkoutScreenshot = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!req.file) return res.status(400).json({ error: { message: 'No image file uploaded' } });

    const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');

    // Save to GCS (or local fallback in dev)
    const StorageService = (await import('../services/storage.service.js')).default;
    const saved = await StorageService.saveWorkoutMedia({
      userId: req.user.id,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname || `screenshot-${Date.now()}.jpg`,
      contentType: req.file.mimetype
    });
    const filePath = saved.relativePath;

    // Attempt Vision scan — always try; gracefully degrade if credentials unavailable.
    // Uses Application Default Credentials on Cloud Run (same as PDF OCR path).
    let extracted = {};
    let rawText = null;
    let confidence = 0;
    let visionEnabled = false;

    try {
      const { scanWorkoutScreenshot: visionScan } = await import('../services/challengeWorkoutVision.service.js');
      const result = await visionScan({ fileBuffer: req.file.buffer, mimeType: req.file.mimetype });
      extracted = result.extracted;
      rawText = result.rawText;
      confidence = result.confidence;
      visionEnabled = true;
    } catch (visionErr) {
      // Vision unavailable or credentials missing — return the file path without extracted fields
      console.warn('[scanWorkoutScreenshot] Vision scan failed:', visionErr.message);
    }

    return res.json({
      filePath,
      fileUrl: `${baseUrl}/uploads/${filePath}`,
      extracted,
      rawText,
      confidence,
      visionEnabled
    });
  } catch (e) {
    next(e);
  }
};

export const uploadWorkoutMedia = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const workoutId = asInt(req.params.workoutId);
    if (!classId || !workoutId) return res.status(400).json({ error: { message: 'Invalid classId/workoutId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: access.eliminated ? 'You have been eliminated from this season.' : 'Access denied' } });
    const workout = await ChallengeWorkout.findById(workoutId);
    if (!workout || Number(workout.learning_class_id) !== Number(classId)) {
      return res.status(404).json({ error: { message: 'Workout not found' } });
    }
    if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });
    const participationAcceptance = await ensureChallengeParticipationAgreementAccepted({
      klass: access.class,
      userId: req.user.id
    });
    if (!participationAcceptance.ok) {
      return res.status(participationAcceptance.status).json({ error: { message: participationAcceptance.message } });
    }
    const StorageService = (await import('../services/storage.service.js')).default;
    const saved = await StorageService.saveWorkoutMedia({
      userId: req.user.id,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname || `media-${Date.now()}.jpg`,
      contentType: req.file.mimetype
    });
    const filePath = saved.relativePath;
    const mime = String(req.file.mimetype || '').toLowerCase();
    const mediaType = mime.includes('gif') ? 'gif' : 'image';
    const media = await ChallengeWorkoutMedia.create({
      workoutId,
      learningClassId: classId,
      userId: req.user.id,
      mediaType,
      filePath
    });
    try {
      await enqueueWorkoutVision({
        workoutId,
        learningClassId: classId,
        userId: req.user.id,
        screenshotFilePath: filePath,
        workoutNotes: null
      });
    } catch {
      // Non-blocking async hook.
    }
    // Auto-link uploaded workout media to user photo album.
    pool.execute(
      `INSERT IGNORE INTO user_photos (user_id, file_path, source, source_ref_id, is_profile)
       VALUES (?, ?, 'workout_media', ?, 0)`,
      [req.user.id, filePath, media?.id || null]
    ).catch(() => {});
    return res.status(201).json({ media });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// Live Draft Session handlers
// ---------------------------------------------------------------------------

/**
 * Build the full draft session payload shared by GET /draft-session.
 * Returns { session, teams, availableMembers, currentPickTeamId, isComplete }
 */
const buildDraftPayload = async (classId) => {
  // Session row
  const [sessionRows] = await pool.execute(
    `SELECT id, status, draft_mode, pick_queue_json, current_pick_index, started_at, completed_at, created_by_user_id
     FROM challenge_draft_sessions WHERE learning_class_id = ? LIMIT 1`,
    [classId]
  );
  const session = sessionRows?.[0] || null;

  // Teams with members already drafted
  const [teamRows] = await pool.execute(
    `SELECT t.id, t.team_name, t.team_manager_user_id,
            u.first_name AS captain_first, u.last_name AS captain_last,
            u.profile_photo_path AS captain_photo
     FROM challenge_teams t
     LEFT JOIN users u ON u.id = t.team_manager_user_id
     WHERE t.learning_class_id = ?
     ORDER BY t.team_name ASC`,
    [classId]
  );
  const [memberRows] = await pool.execute(
    `SELECT ctm.team_id, ctm.provider_user_id, u.first_name, u.last_name, u.profile_photo_path
     FROM challenge_team_members ctm
     INNER JOIN users u ON u.id = ctm.provider_user_id
     WHERE ctm.team_id IN (
       SELECT id FROM challenge_teams WHERE learning_class_id = ?
     )`,
    [classId]
  );
  const membersByTeam = new Map();
  for (const m of memberRows || []) {
    const tid = Number(m.team_id);
    if (!membersByTeam.has(tid)) membersByTeam.set(tid, []);
    membersByTeam.get(tid).push({
      providerUserId: Number(m.provider_user_id),
      firstName: m.first_name,
      lastName: m.last_name,
      photo: m.profile_photo_path || null
    });
  }
  const draftedUserIds = new Set((memberRows || []).map((m) => Number(m.provider_user_id)));

  const teams = (teamRows || []).map((t) => ({
    id: Number(t.id),
    teamName: t.team_name,
    captainUserId: t.team_manager_user_id ? Number(t.team_manager_user_id) : null,
    captainName: t.captain_first ? `${t.captain_first} ${t.captain_last || ''}`.trim() : null,
    captainPhoto: t.captain_photo || null,
    picks: membersByTeam.get(Number(t.id)) || []
  }));

  // All season participants not yet drafted
  const [participantRows] = await pool.execute(
    `SELECT pm.provider_user_id, u.first_name, u.last_name, u.profile_photo_path,
            COALESCE(dn.note_text, '') AS draft_note
     FROM learning_class_provider_memberships pm
     INNER JOIN users u ON u.id = pm.provider_user_id
     LEFT JOIN challenge_member_draft_notes dn
       ON dn.learning_class_id = pm.learning_class_id AND dn.provider_user_id = pm.provider_user_id
     WHERE pm.learning_class_id = ? AND pm.membership_status IN ('active','completed')
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [classId]
  );
  const availableMembers = (participantRows || [])
    .filter((p) => !draftedUserIds.has(Number(p.provider_user_id)))
    .map((p) => ({
      providerUserId: Number(p.provider_user_id),
      firstName: p.first_name,
      lastName: p.last_name,
      photo: p.profile_photo_path || null,
      draftNote: p.draft_note || ''
    }));

  let currentPickTeamId = null;
  let pickQueue = [];
  let currentPickIndex = 0;
  if (session) {
    try {
      pickQueue = typeof session.pick_queue_json === 'string'
        ? JSON.parse(session.pick_queue_json)
        : (session.pick_queue_json || []);
    } catch { pickQueue = []; }
    currentPickIndex = Number(session.current_pick_index || 0);
    if (session.status === 'in_progress' && currentPickIndex < pickQueue.length && availableMembers.length > 0) {
      currentPickTeamId = pickQueue[currentPickIndex] || null;
    }
  }

  return {
    session: session ? {
      id: Number(session.id),
      status: session.status,
      draftMode: session.draft_mode,
      currentPickIndex,
      totalPicks: pickQueue.length,
      startedAt: session.started_at || null,
      completedAt: session.completed_at || null
    } : null,
    teams,
    availableMembers,
    currentPickTeamId
  };
};

/**
 * GET /:classId/draft-session
 * Public to all season participants; returns live draft state.
 */
export const getDraftSession = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const access = await canAccessChallenge({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(403).json({ error: { message: 'Access denied' } });
    const payload = await buildDraftPayload(classId);
    return res.json(payload);
  } catch (e) {
    next(e);
  }
};

/**
 * POST /:classId/draft-session
 * Manager creates (or resets) the draft session.
 * Body: { draftMode: 'snake'|'random', captainOrder: [teamId, ...], rounds: number }
 */
export const createDraftSession = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Manager access required' } });
    }

    const draftMode = ['snake', 'random'].includes(req.body?.draftMode) ? req.body.draftMode : 'snake';
    const captainOrder = Array.isArray(req.body?.captainOrder) ? req.body.captainOrder.map(Number).filter(Boolean) : [];
    const rounds = Math.max(1, Math.min(30, asInt(req.body?.rounds) || 10));

    // Validate teams
    if (!captainOrder.length) {
      return res.status(400).json({ error: { message: 'captainOrder must contain at least one team ID' } });
    }

    // Build pick queue
    let pickQueue = [];
    if (draftMode === 'snake') {
      for (let r = 0; r < rounds; r++) {
        const row = r % 2 === 0 ? captainOrder : [...captainOrder].reverse();
        pickQueue.push(...row);
      }
    } else {
      // Random: shuffle once, then repeat for rounds
      for (let r = 0; r < rounds; r++) {
        const shuffled = [...captainOrder].sort(() => Math.random() - 0.5);
        pickQueue.push(...shuffled);
      }
    }

    await pool.execute(
      `INSERT INTO challenge_draft_sessions
         (learning_class_id, status, draft_mode, pick_queue_json, current_pick_index, created_by_user_id)
       VALUES (?, 'pending', ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE
         status = 'pending',
         draft_mode = VALUES(draft_mode),
         pick_queue_json = VALUES(pick_queue_json),
         current_pick_index = 0,
         started_at = NULL,
         completed_at = NULL,
         created_by_user_id = VALUES(created_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [classId, draftMode, JSON.stringify(pickQueue), req.user.id]
    );

    const payload = await buildDraftPayload(classId);
    return res.json(payload);
  } catch (e) {
    next(e);
  }
};

/**
 * POST /:classId/draft-session/start
 * Manager starts the draft (status → in_progress).
 */
export const startDraftSession = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Manager access required' } });
    }
    const [rows] = await pool.execute(
      `SELECT id, status FROM challenge_draft_sessions WHERE learning_class_id = ? LIMIT 1`,
      [classId]
    );
    if (!rows?.length) return res.status(404).json({ error: { message: 'No draft session found — set it up first' } });
    if (rows[0].status === 'in_progress') return res.status(400).json({ error: { message: 'Draft is already in progress' } });
    if (rows[0].status === 'completed') return res.status(400).json({ error: { message: 'Draft is already completed — reset to start again' } });
    await pool.execute(
      `UPDATE challenge_draft_sessions SET status = 'in_progress', started_at = NOW(), updated_at = CURRENT_TIMESTAMP
       WHERE learning_class_id = ?`,
      [classId]
    );
    const payload = await buildDraftPayload(classId);
    return res.json(payload);
  } catch (e) {
    next(e);
  }
};

/**
 * POST /:classId/draft-session/pick
 * Current captain (or manager override) drafts a member.
 * Body: { providerUserId: number }
 */
export const makeDraftPick = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const providerUserId = asInt(req.body?.providerUserId);
    if (!classId || !providerUserId) return res.status(400).json({ error: { message: 'Invalid classId or providerUserId' } });

    const [sessionRows] = await pool.execute(
      `SELECT id, status, pick_queue_json, current_pick_index FROM challenge_draft_sessions WHERE learning_class_id = ? LIMIT 1`,
      [classId]
    );
    if (!sessionRows?.length) return res.status(404).json({ error: { message: 'No draft session found' } });
    const session = sessionRows[0];
    if (session.status !== 'in_progress') {
      return res.status(400).json({ error: { message: `Draft is ${session.status} — cannot pick` } });
    }

    let pickQueue;
    try { pickQueue = typeof session.pick_queue_json === 'string' ? JSON.parse(session.pick_queue_json) : (session.pick_queue_json || []); }
    catch { pickQueue = []; }
    const currentIndex = Number(session.current_pick_index || 0);
    if (currentIndex >= pickQueue.length) {
      return res.status(400).json({ error: { message: 'All picks are exhausted' } });
    }

    const currentPickTeamId = Number(pickQueue[currentIndex]);

    // Permission: must be current turn's captain OR a manager
    const isManager = await canManageChallenge({ user: req.user, classId });
    if (!isManager) {
      // Verify caller is the captain of the team whose turn it is
      const [captainCheck] = await pool.execute(
        `SELECT 1 FROM challenge_teams WHERE id = ? AND team_manager_user_id = ? LIMIT 1`,
        [currentPickTeamId, req.user.id]
      );
      if (!captainCheck?.length) {
        return res.status(403).json({ error: { message: 'It is not your team\'s turn to pick' } });
      }
    }

    // Verify member is a season participant and not already drafted
    const [memberCheck] = await pool.execute(
      `SELECT 1 FROM learning_class_provider_memberships
       WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed') LIMIT 1`,
      [classId, providerUserId]
    );
    if (!memberCheck?.length) return res.status(404).json({ error: { message: 'Member not found in this season' } });

    const [alreadyDrafted] = await pool.execute(
      `SELECT 1 FROM challenge_team_members ctm
       INNER JOIN challenge_teams t ON t.id = ctm.team_id
       WHERE t.learning_class_id = ? AND ctm.provider_user_id = ? LIMIT 1`,
      [classId, providerUserId]
    );
    if (alreadyDrafted?.length) return res.status(400).json({ error: { message: 'Member is already on a team' } });

    // Add to team
    await pool.execute(
      `INSERT IGNORE INTO challenge_team_members (team_id, provider_user_id) VALUES (?, ?)`,
      [currentPickTeamId, providerUserId]
    );

    // Advance pick index
    const nextIndex = currentIndex + 1;

    // Check if draft should auto-complete (queue exhausted after this pick)
    // We'll check available members after the pick in buildDraftPayload; for now advance index
    await pool.execute(
      `UPDATE challenge_draft_sessions
       SET current_pick_index = ?, updated_at = CURRENT_TIMESTAMP
       WHERE learning_class_id = ?`,
      [nextIndex, classId]
    );

    const payload = await buildDraftPayload(classId);

    // Auto-complete if no more available members or queue exhausted
    const shouldComplete = nextIndex >= pickQueue.length || payload.availableMembers.length === 0;
    if (shouldComplete && payload.session?.status === 'in_progress') {
      await pool.execute(
        `UPDATE challenge_draft_sessions SET status = 'completed', completed_at = NOW(), updated_at = CURRENT_TIMESTAMP
         WHERE learning_class_id = ?`,
        [classId]
      );
      payload.session.status = 'completed';
      payload.session.completedAt = new Date().toISOString();
      payload.currentPickTeamId = null;
    }

    return res.json(payload);
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /:classId/draft-session
 * Manager resets the draft: removes all team members and deletes the session.
 */
export const resetDraftSession = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    if (!(await canManageChallenge({ user: req.user, classId }))) {
      return res.status(403).json({ error: { message: 'Manager access required' } });
    }
    // Remove all team member assignments for this season's teams
    await pool.execute(
      `DELETE ctm FROM challenge_team_members ctm
       INNER JOIN challenge_teams t ON t.id = ctm.team_id
       WHERE t.learning_class_id = ?`,
      [classId]
    );
    // Delete the session
    await pool.execute(`DELETE FROM challenge_draft_sessions WHERE learning_class_id = ?`, [classId]);
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /:classId/season-report
 * Returns daily and weekly workout totals, broken down by team and member.
 * Manager-only endpoint.
 */
export const getSeasonReport = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Invalid classId' });

    // Require manager access
    const access = await resolveChallengeAccessOrManage({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(access.status || 403).json({ error: access.error || 'Forbidden' });
    if (!await canManageChallenge({ user: req.user, classId })) return res.status(403).json({ error: 'Manager access required' });

    const klass = access.class;
    const settings = parseJsonObject(klass?.season_settings_json || {});
    const schedule = settings?.schedule && typeof settings.schedule === 'object' ? settings.schedule : {};
    const weekCutoffTime = String(schedule?.weekEndsSundayAt || '23:59');
    const weekTimeZone   = String(schedule?.weekTimeZone   || 'UTC');

    // Fetch all non-DQ workouts for this season
    const [rows] = await pool.execute(
      `SELECT
         w.id,
         w.user_id,
         w.team_id,
         w.completed_at,
         COALESCE(w.distance_value, 0) AS miles,
         COALESCE(w.points, 0)         AS points,
         w.activity_type,
         u.first_name,
         u.last_name,
         t.team_name
       FROM challenge_workouts w
       JOIN users u ON u.id = w.user_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       WHERE w.learning_class_id = ?
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
       ORDER BY w.completed_at ASC`,
      [classId]
    );

    // Helper: local YYYY-MM-DD in the season's configured timezone
    const toDateStr = (val) => {
      if (!val) return null;
      const d = new Date(val);
      if (isNaN(d.getTime())) return null;
      try {
        return d.toLocaleDateString('en-CA', { timeZone: weekTimeZone }); // YYYY-MM-DD
      } catch {
        return d.toISOString().slice(0, 10);
      }
    };

    // Build flat day-level and week-level maps
    // dayMap: { dateStr -> { teams: { teamId -> { teamName, miles, workouts, points, members: { userId -> {...} } } } } }
    const dayMap = new Map();
    const weekMap = new Map();

    for (const row of rows) {
      const dateStr = toDateStr(row.completed_at);
      if (!dateStr) continue;

      // Compute week start key
      const completedAt = new Date(row.completed_at);
      const weekStart = getWeekStartDate(completedAt, weekCutoffTime, weekTimeZone);
      const weekKey = toDateStr(weekStart) || weekStart?.toISOString().slice(0, 10) || dateStr;

      const teamId   = row.team_id   || 0;
      const teamName = row.team_name || 'Unassigned';
      const userId   = row.user_id;
      const fullName = `${row.first_name || ''} ${row.last_name || ''}`.trim() || `User ${userId}`;
      const miles    = Number(row.miles   || 0);
      const points   = Number(row.points  || 0);

      for (const [key, map] of [[dateStr, dayMap], [weekKey, weekMap]]) {
        if (!map.has(key)) map.set(key, { teams: new Map() });
        const entry = map.get(key);
        if (!entry.teams.has(teamId)) {
          entry.teams.set(teamId, { teamId, teamName, miles: 0, workouts: 0, points: 0, members: new Map() });
        }
        const teamEntry = entry.teams.get(teamId);
        teamEntry.miles    += miles;
        teamEntry.workouts += 1;
        teamEntry.points   += points;
        if (!teamEntry.members.has(userId)) {
          teamEntry.members.set(userId, { userId, name: fullName, miles: 0, workouts: 0, points: 0 });
        }
        const memberEntry = teamEntry.members.get(userId);
        memberEntry.miles    += miles;
        memberEntry.workouts += 1;
        memberEntry.points   += points;
      }
    }

    // Serialize maps → plain arrays, sorted by date desc
    const serializeMap = (map) =>
      [...map.entries()]
        .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)) // desc by date
        .map(([date, { teams }]) => ({
          date,
          teams: [...teams.values()].map((t) => ({
            ...t,
            miles: Math.round(t.miles * 100) / 100,
            points: Math.round(t.points * 10) / 10,
            members: [...t.members.values()].map((m) => ({
              ...m,
              miles: Math.round(m.miles * 100) / 100,
              points: Math.round(m.points * 10) / 10,
            })).sort((a, b) => b.miles - a.miles),
          })).sort((a, b) => b.miles - a.miles),
        }));

    return res.json({
      classId,
      timezone: weekTimeZone,
      daily:  serializeMap(dayMap),
      weekly: serializeMap(weekMap),
    });
  } catch (e) {
    next(e);
  }
};

// ─── Weekly Matchups ───────────────────────────────────────────────────────

/**
 * Berger round-robin schedule generator.
 * Returns an array of rounds; each round is an array of [teamA_idx, teamB_idx] pairs.
 * For odd N a "bye" (-1) is inserted so every team gets one bye per full cycle.
 */
function buildRoundRobin(n) {
  const teams = Array.from({ length: n }, (_, i) => i);
  if (n % 2 !== 0) teams.push(-1); // bye slot
  const total = teams.length;
  const rounds = [];
  for (let r = 0; r < total - 1; r++) {
    const round = [];
    for (let i = 0; i < total / 2; i++) {
      const a = teams[i];
      const b = teams[total - 1 - i];
      if (a !== -1 && b !== -1) round.push([a, b]);
    }
    rounds.push(round);
    // rotate all except teams[0]
    const last = teams.pop();
    teams.splice(1, 0, last);
  }
  // Reverse so Week 1 pairs the first two teams (team[0] vs team[1], etc.)
  // rather than team[0] vs the last team.
  rounds.reverse();
  return rounds;
}

/**
 * Compute the week_start_date for competition Week 1 from the season's starts_at.
 * The first competition week is the week boundary that starts ON OR AFTER starts_at.
 * Delegate to the shared utility (imported as firstCompetitionWeekDateUtil).
 */
const firstCompetitionWeekDate = firstCompetitionWeekDateUtil;

/**
 * POST /:classId/matchup-schedule/generate
 * Generates (or regenerates) the round-robin matchup schedule for a season.
 * Only unresolved future matchups are replaced; already-resolved weeks are kept.
 */
export const generateMatchupSchedule = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Invalid classId' });

    const access = await resolveChallengeAccessOrManage({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(access.status || 403).json({ error: access.error || 'Forbidden' });
    if (!await canManageChallenge({ user: req.user, classId })) return res.status(403).json({ error: 'Manager access required' });

    const klass = access.class;
    const settings = parseJsonObject(klass?.season_settings_json || {});
    const schedule = settings?.schedule || {};
    const weekCutoffTime = String(schedule?.weekEndsSundayAt || '23:59');
    const weekTimeZone   = String(schedule?.weekTimeZone   || 'UTC');

    if (!settings?.matchups?.enabled) {
      return res.status(400).json({ error: 'Matchups are not enabled for this season.' });
    }

    // Fetch current teams
    const [teamRows] = await pool.execute(
      `SELECT id, team_name, logo_path FROM challenge_teams WHERE learning_class_id = ? ORDER BY id ASC`,
      [classId]
    );
    if (teamRows.length < 2) {
      return res.status(400).json({ error: 'At least 2 teams are required to generate a matchup schedule.' });
    }

    // Determine regular-season week dates
    const postseason = settings?.postseason || {};
    const playoffWeekNumber = Number.parseInt(postseason?.playoffWeekNumber, 10) || 0;
    const rawRegWeeks = Number.parseInt(postseason?.regularSeasonWeeks, 10) || 0;
    const regularSeasonWeeks = Math.max(1,
      playoffWeekNumber > 1 ? playoffWeekNumber - 1 : (rawRegWeeks || 10)
    );
    const startsAt = klass.starts_at ? new Date(klass.starts_at) : null;
    if (!startsAt) return res.status(400).json({ error: 'Season must have a start date before generating the schedule.' });

    // Compute the first competition week boundary (on or after season start)
    const firstWeekDate = firstCompetitionWeekDate(startsAt, weekCutoffTime, weekTimeZone);
    const firstWeekDateObj = new Date(`${firstWeekDate}T12:00:00Z`); // noon UTC — avoids DST edge cases

    const weekDates = [];
    for (let w = 0; w < regularSeasonWeeks; w++) {
      const d = new Date(firstWeekDateObj.getTime() + w * 7 * 24 * 60 * 60 * 1000);
      weekDates.push(d.toISOString().slice(0, 10));
    }

    // Build round-robin rounds
    const rounds = buildRoundRobin(teamRows.length);
    const roundCount = rounds.length;

    // Delete unresolved matchups only (preserve resolved weeks)
    await pool.execute(
      `DELETE FROM challenge_matchups WHERE learning_class_id = ? AND resolved_at IS NULL`,
      [classId]
    );

    // Insert new matchup rows for each regular-season week
    const insertValues = [];
    for (let w = 0; w < weekDates.length; w++) {
      const round = rounds[w % roundCount];
      for (const [aIdx, bIdx] of round) {
        const team1 = teamRows[aIdx];
        const team2 = teamRows[bIdx];
        if (!team1 || !team2) continue;
        insertValues.push([classId, weekDates[w], team1.id, team2.id]);
      }
    }

    if (insertValues.length > 0) {
      await pool.query(
        `INSERT IGNORE INTO challenge_matchups (learning_class_id, week_start_date, team1_id, team2_id) VALUES ?`,
        [insertValues]
      );
    }

    // Return the generated schedule
    const [matchupRows] = await pool.execute(
      `SELECT m.*, t1.team_name AS team1_name, t1.logo_path AS team1_logo,
              t2.team_name AS team2_name, t2.logo_path AS team2_logo,
              tw.team_name AS winner_name
       FROM challenge_matchups m
       JOIN challenge_teams t1 ON t1.id = m.team1_id
       JOIN challenge_teams t2 ON t2.id = m.team2_id
       LEFT JOIN challenge_teams tw ON tw.id = m.winner_team_id
       WHERE m.learning_class_id = ?
       ORDER BY m.week_start_date ASC, m.id ASC`,
      [classId]
    );
    return res.json({ ok: true, matchups: matchupRows });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /:classId/matchup-schedule
 * Returns all matchups for the season grouped by week, accessible to any season member.
 */
export const getMatchupSchedule = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Invalid classId' });

    const access = await resolveChallengeAccessOrManage({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(access.status || 403).json({ error: access.error || 'Forbidden' });

    const klass = access.class;
    const settings = parseJsonObject(klass?.season_settings_json || {});
    if (!settings?.matchups?.enabled) {
      return res.json({ enabled: false, weeks: [] });
    }

    const schedule = settings?.schedule || {};
    const weekCutoffTime = String(schedule?.weekEndsSundayAt || '23:59');
    const weekTimeZone   = String(schedule?.weekTimeZone   || 'UTC');

    // Compute the current week's start date so the frontend can highlight it
    const currentWeekStart = getWeekStartDate(new Date(), weekCutoffTime, weekTimeZone);

    let [rows] = await pool.execute(
      `SELECT m.id, m.week_start_date, m.team1_id, m.team2_id,
              m.winner_team_id, m.team1_points, m.team2_points, m.is_tie, m.resolved_at,
              t1.team_name AS team1_name, t1.logo_path AS team1_logo,
              t2.team_name AS team2_name, t2.logo_path AS team2_logo,
              tw.team_name AS winner_name
       FROM challenge_matchups m
       JOIN challenge_teams t1 ON t1.id = m.team1_id
       JOIN challenge_teams t2 ON t2.id = m.team2_id
       LEFT JOIN challenge_teams tw ON tw.id = m.winner_team_id
       WHERE m.learning_class_id = ?
       ORDER BY m.week_start_date ASC, m.id ASC`,
      [classId]
    );

    // Auto-generate if no schedule exists yet and the season has a start date
    if (rows.length === 0 && klass.starts_at) {
      const [teamRows] = await pool.execute(
        `SELECT id, team_name, logo_path FROM challenge_teams WHERE learning_class_id = ? ORDER BY id ASC`,
        [classId]
      );
      if (teamRows.length >= 2) {
        const postseason = settings?.postseason || {};
        // If playoff week is defined, use playoffWeekNumber - 1 as the regular season length.
        // This is more reliable than regularSeasonWeeks when weekPhases are set (weekPhases
        // only lists playoff/break/championship weeks, not regular season weeks, so
        // normalizeSeasonSettings ends up computing regularSeasonWeeks = 1).
        const playoffWeekNumber = Number.parseInt(postseason?.playoffWeekNumber, 10) || 0;
        const rawRegWeeks = Number.parseInt(postseason?.regularSeasonWeeks, 10) || 0;
        const regularSeasonWeeks = Math.max(1,
          playoffWeekNumber > 1 ? playoffWeekNumber - 1 : (rawRegWeeks || 10)
        );
        const startsAt = new Date(klass.starts_at);
        const firstWeekDate = firstCompetitionWeekDate(startsAt, weekCutoffTime, weekTimeZone);
        const firstWeekDateObj = new Date(`${firstWeekDate}T12:00:00Z`);
        const weekDates = [];
        for (let w = 0; w < regularSeasonWeeks; w++) {
          const d = new Date(firstWeekDateObj.getTime() + w * 7 * 24 * 60 * 60 * 1000);
          weekDates.push(d.toISOString().slice(0, 10));
        }
        const rounds = buildRoundRobin(teamRows.length);
        const roundCount = rounds.length;
        const insertValues = [];
        for (let w = 0; w < weekDates.length; w++) {
          const round = rounds[w % roundCount];
          for (const [aIdx, bIdx] of round) {
            const team1 = teamRows[aIdx];
            const team2 = teamRows[bIdx];
            if (team1 && team2) insertValues.push([classId, weekDates[w], team1.id, team2.id]);
          }
        }
        if (insertValues.length > 0) {
          await pool.query(
            `INSERT IGNORE INTO challenge_matchups (learning_class_id, week_start_date, team1_id, team2_id) VALUES ?`,
            [insertValues]
          );
        }
        // Re-fetch after generation
        [rows] = await pool.execute(
          `SELECT m.id, m.week_start_date, m.team1_id, m.team2_id,
                  m.winner_team_id, m.team1_points, m.team2_points, m.is_tie, m.resolved_at,
                  t1.team_name AS team1_name, t1.logo_path AS team1_logo,
                  t2.team_name AS team2_name, t2.logo_path AS team2_logo,
                  tw.team_name AS winner_name
           FROM challenge_matchups m
           JOIN challenge_teams t1 ON t1.id = m.team1_id
           JOIN challenge_teams t2 ON t2.id = m.team2_id
           LEFT JOIN challenge_teams tw ON tw.id = m.winner_team_id
           WHERE m.learning_class_id = ?
           ORDER BY m.week_start_date ASC, m.id ASC`,
          [classId]
        );
      }
    }

    // Fetch live week totals (from workouts) for every unresolved matchup week so
    // the dashboard can show real-time scores even before a week closes.
    const unresolvedWeeks = [...new Set(
      rows.filter((r) => !r.resolved_at).map((r) => dateToYmd(r.week_start_date))
    )];
    const liveScoreMap = {}; // weekDate -> { teamId -> points }
    for (const weekDate of unresolvedWeeks) {
      const weekRange = getWeekDateTimeRange(weekDate, weekCutoffTime, weekTimeZone);
      if (!weekRange) continue;
      const [scoreRows] = await pool.execute(
        `SELECT w.team_id, COALESCE(SUM(w.points), 0) AS live_points
         FROM challenge_workouts w
         WHERE w.learning_class_id = ?
           AND w.completed_at >= ?
           AND w.completed_at < ?
           AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
           AND w.team_id IS NOT NULL
         GROUP BY w.team_id`,
        [classId, weekRange.start, weekRange.end]
      );
      liveScoreMap[weekDate] = {};
      for (const sr of scoreRows) {
        liveScoreMap[weekDate][sr.team_id] = Math.round(Number(sr.live_points) * 100) / 100;
      }
    }

    // Group by week
    const weekMap = new Map();
    for (const row of rows) {
      const d = dateToYmd(row.week_start_date);
      if (!weekMap.has(d)) weekMap.set(d, []);
      const live = liveScoreMap[d] || {};
      weekMap.get(d).push({
        id: row.id,
        team1Id: row.team1_id,
        team1Name: row.team1_name,
        team1Logo: row.team1_logo || null,
        team1Points: row.team1_points != null ? Number(row.team1_points) : null,
        team1LivePoints: live[row.team1_id] ?? null,
        team2Id: row.team2_id,
        team2Name: row.team2_name,
        team2Logo: row.team2_logo || null,
        team2Points: row.team2_points != null ? Number(row.team2_points) : null,
        team2LivePoints: live[row.team2_id] ?? null,
        winnerTeamId: row.winner_team_id || null,
        winnerName: row.winner_name || null,
        isTie: !!row.is_tie,
        resolvedAt: row.resolved_at || null,
      });
    }

    const weeks = [...weekMap.entries()].map(([date, matchups]) => ({ date, matchups }));
    return res.json({ enabled: true, weeks, currentWeekStart });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /:classId/matchup-standings
 * Returns W/L/T records per team for playoff seeding, with logo and rank.
 */
export const getMatchupStandings = async (req, res, next) => {
  try {
    const classId = Number(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'Invalid classId' });

    const access = await resolveChallengeAccessOrManage({ user: req.user, learningClassId: classId });
    if (!access.ok) return res.status(access.status || 403).json({ error: access.error || 'Forbidden' });

    const settings = parseJsonObject(access.class?.season_settings_json || {});
    if (!settings?.matchups?.enabled) {
      return res.json({ enabled: false, standings: [] });
    }

    const [rows] = await pool.execute(
      `SELECT
         sub.team_id,
         sub.team_name,
         t.logo_path,
         SUM(sub.wins)    AS wins,
         SUM(sub.losses)  AS losses,
         SUM(sub.ties)    AS ties,
         SUM(sub.pts_for) AS pts_for,
         SUM(sub.pts_against) AS pts_against
       FROM (
         SELECT
           m.team1_id AS team_id,
           t1.team_name,
           SUM(m.winner_team_id = m.team1_id AND m.is_tie = 0) AS wins,
           SUM(m.winner_team_id = m.team2_id AND m.is_tie = 0) AS losses,
           SUM(m.is_tie = 1 AND m.resolved_at IS NOT NULL)     AS ties,
           SUM(COALESCE(m.team1_points, 0)) AS pts_for,
           SUM(COALESCE(m.team2_points, 0)) AS pts_against
         FROM challenge_matchups m
         JOIN challenge_teams t1 ON t1.id = m.team1_id
         WHERE m.learning_class_id = ? AND m.resolved_at IS NOT NULL
         GROUP BY m.team1_id, t1.team_name
         UNION ALL
         SELECT
           m.team2_id,
           t2.team_name,
           SUM(m.winner_team_id = m.team2_id AND m.is_tie = 0) AS wins,
           SUM(m.winner_team_id = m.team1_id AND m.is_tie = 0) AS losses,
           SUM(m.is_tie = 1 AND m.resolved_at IS NOT NULL)     AS ties,
           SUM(COALESCE(m.team2_points, 0)) AS pts_for,
           SUM(COALESCE(m.team1_points, 0)) AS pts_against
         FROM challenge_matchups m
         JOIN challenge_teams t2 ON t2.id = m.team2_id
         WHERE m.learning_class_id = ? AND m.resolved_at IS NOT NULL
         GROUP BY m.team2_id, t2.team_name
       ) sub
       JOIN challenge_teams t ON t.id = sub.team_id
       GROUP BY sub.team_id, sub.team_name, t.logo_path
       ORDER BY wins DESC, pts_for DESC`,
      [classId, classId]
    );

    const standings = rows.map((r, i) => ({
      rank: i + 1,
      teamId: r.team_id,
      teamName: r.team_name,
      logoPath: r.logo_path || null,
      wins: Number(r.wins || 0),
      losses: Number(r.losses || 0),
      ties: Number(r.ties || 0),
      ptsFor: Math.round(Number(r.pts_for || 0) * 10) / 10,
      ptsAgainst: Math.round(Number(r.pts_against || 0) * 10) / 10,
    }));

    return res.json({ enabled: true, standings });
  } catch (e) {
    next(e);
  }
};
