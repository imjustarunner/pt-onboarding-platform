/**
 * SSC Member Application Pipeline
 * Handles: public-stats, invite-token resolution, application submission,
 * manager review (approve/deny), invite CRUD, and member referral links.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import ChallengeParticipantProfile from '../models/ChallengeParticipantProfile.model.js';
import EmailService from '../services/email.service.js';
import config from '../config/config.js';
import { verifyRecaptchaV3 } from '../services/captcha.service.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import { resolvePreferredSenderIdentityForAgency } from '../services/emailSenderIdentityResolver.service.js';
import { getPlatformAgencyId } from './summitStats.controller.js';
import { buildRaceDivisions, buildRecordMetricMap } from './challenges.controller.js';
import { callGeminiText } from '../services/geminiText.service.js';
import { canUserManageClub } from '../utils/sscClubAccess.js';

// ── Helpers ──────────────────────────────────────────────────────

const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const normalizePublicSlug = (v) => {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  const cleaned = s
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleaned) return '';
  return cleaned.slice(0, 64);
};

/** Verify club exists (affiliation type) and return it. */
const resolveClub = async (clubId) => {
  if (!clubId) return null;
  const [rows] = await pool.execute(
    `SELECT id, name, slug, logo_url, logo_path, organization_type, color_palette
     FROM agencies WHERE id = ? LIMIT 1`,
    [clubId]
  );
  const club = rows?.[0];
  if (!club || String(club.organization_type || '').toLowerCase() !== 'affiliation') return null;
  return club;
};

/** Resolve club by a manager-defined public slug (stored in store_config_json.publicPageConfig.publicSlug). */
const resolveClubByPublicSlug = async (publicSlug) => {
  const slug = normalizePublicSlug(publicSlug);
  if (!slug) return null;
  const [rows] = await pool.execute(
    `SELECT id, name, slug, logo_url, logo_path, organization_type, color_palette
     FROM agencies
     WHERE organization_type = 'affiliation'
       AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(store_config_json, '$.publicPageConfig.publicSlug')), '')) = ?
     LIMIT 1`,
    [slug]
  );
  return rows?.[0] || null;
};

/** Resolve club from either numeric ID or public slug. */
const resolveClubByPublicRef = async (clubRef) => {
  const id = toInt(clubRef);
  if (id) return resolveClub(id);
  return resolveClubByPublicSlug(clubRef);
};

/** Resolve the parent/platform agency a club belongs to so applicants can be added to the tenant. */
const resolveClubPlatformAgencyId = async (clubId) => {
  const normalizedClubId = toInt(clubId);
  if (!normalizedClubId) return null;
  const preferredSlug = String(process.env.SUMMIT_STATS_PLATFORM_SLUG || 'ssc').trim().toLowerCase();
  const [rows] = await pool.execute(
    `SELECT oa.agency_id
     FROM organization_affiliations oa
     INNER JOIN agencies parent ON parent.id = oa.agency_id
     WHERE oa.organization_id = ?
       AND oa.is_active = 1
     ORDER BY
       CASE
         WHEN LOWER(COALESCE(parent.slug, '')) = ? THEN 0
         WHEN LOWER(COALESCE(parent.slug, '')) IN ('ssc', 'sstc', 'summit-stats') THEN 1
         ELSE 2
       END,
       oa.agency_id DESC
     LIMIT 1`,
    [normalizedClubId, preferredSlug]
  );
  return toInt(rows?.[0]?.agency_id);
};

/** Assert club manager access. Returns { ok, club } or sends 4xx response. */
const assertManagerAccess = async (req, res, clubId) => {
  const user = req.user;
  if (!user?.id) { res.status(401).json({ error: { message: 'Sign in required' } }); return null; }
  const club = await resolveClub(clubId);
  if (!club) { res.status(404).json({ error: { message: 'Club not found' } }); return null; }
  const canManage = await canUserManageClub({ user, clubId });
  if (!canManage) {
    res.status(403).json({ error: { message: 'Club manager access required' } }); return null;
  }
  return club;
};

/** Assert current user is a member of the club. */
const assertMemberAccess = async (req, res, clubId) => {
  const user = req.user;
  if (!user?.id) { res.status(401).json({ error: { message: 'Sign in required' } }); return null; }
  const club = await resolveClub(clubId);
  if (!club) { res.status(404).json({ error: { message: 'Club not found' } }); return null; }
  const agencies = await User.getAgencies(user.id);
  const isMember = (agencies || []).some((a) => Number(a?.id) === clubId);
  const isManager = await canUserManageClub({ user, clubId });
  if (!isMember && !isManager) {
    res.status(403).json({ error: { message: 'You are not a member of this club' } }); return null;
  }
  return club;
};

/** Generate a URL-safe random token. */
const genToken = (len = 32) => crypto.randomBytes(len).toString('hex').slice(0, len);

/** Generate a short referral code (8 chars). */
const genReferralCode = () => crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
const APPLICATION_WAIVER_VERSION = 'ssc_member_participation_waiver_v2';
const SSC_RECAPTCHA_ACTION = 'ssc_club_application';
const LOCALHOST_TEST_RECAPTCHA_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';

/** Hash a plain-text password using bcrypt (reuse pattern from auth). */
const hashPassword = async (plain) => {
  const bcrypt = (await import('bcrypt')).default;
  return bcrypt.hash(plain, 12);
};

const parseJsonObject = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const toUploadsPublicUrl = (filePath) => {
  const p = String(filePath || '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const baseUrl = String(process.env.BACKEND_URL || '').trim();
  const clean = p.replace(/^\/+/, '').replace(/^uploads\//, '');
  return baseUrl ? `${baseUrl}/uploads/${clean}` : `/uploads/${clean}`;
};

const normalizeShortText = (value, maxLen = 255) => {
  const s = String(value || '').trim();
  return s ? s.slice(0, maxLen) : null;
};

const normalizeLongText = (value, maxLen = 4000) => {
  const s = String(value || '').replace(/\r\n/g, '\n').trim();
  return s ? s.slice(0, maxLen) : null;
};

const normalizeNonNegativeDecimal = (value, { max = 100000 } = {}) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Number(n.toFixed(2));
};

const getRequestIp = (req) => {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || String(req.ip || '').trim();
  return ip ? ip.slice(0, 64) : null;
};

const isLocalRecaptchaBypassRequest = (req) => {
  const host = String(req.get('host') || '').toLowerCase();
  const origin = String(req.get('origin') || req.get('referer') || '').toLowerCase();
  return host.includes('localhost') || host.includes('127.0.0.1') || origin.includes('localhost') || origin.includes('127.0.0.1');
};

const getSscRecaptchaSiteKey = () => String(process.env.RECAPTCHA_SITE_KEY_INTAKE || config.recaptcha?.siteKey || '').trim();
const isSscRecaptchaConfigured = () => !!getSscRecaptchaSiteKey() && (!!config.recaptcha?.secretKey || !!config.recaptcha?.enterpriseApiKey);
const getSscRecaptchaConfig = () => ({
  siteKey: getSscRecaptchaSiteKey() || null,
  useEnterprise: !!config.recaptcha?.enterpriseApiKey,
  forceWidget: true,
  localhostSiteKey: LOCALHOST_TEST_RECAPTCHA_SITE_KEY
});

const verifySscApplicationCaptcha = async (req) => {
  const siteKey = getSscRecaptchaSiteKey();
  const captchaConfigured = isSscRecaptchaConfigured();
  const isLocalBypass = isLocalRecaptchaBypassRequest(req);

  if (config.nodeEnv === 'production' && !captchaConfigured) {
    return { ok: false, status: 500, message: 'Captcha is not configured' };
  }
  if (!captchaConfigured) {
    return { ok: true };
  }
  if (isLocalBypass) {
    return { ok: true, bypassed: true };
  }

  const captchaToken = String(req.body?.captchaToken || '').trim();
  if (!captchaToken) {
    return { ok: false, status: 400, message: 'Captcha is required' };
  }
  const verification = await verifyRecaptchaV3({
    token: captchaToken,
    remoteip: getRequestIp(req),
    expectedAction: SSC_RECAPTCHA_ACTION,
    userAgent: req.get('user-agent'),
    siteKeyOverride: siteKey || undefined,
    checkboxKey: true
  });
  if (!verification.ok) {
    const message = config.nodeEnv !== 'production'
      ? `Captcha verification failed: ${verification.reason}${verification.invalidReason ? ` (${verification.invalidReason})` : ''}.`
      : 'Captcha verification failed. Please complete the captcha again and try again.';
    return { ok: false, status: 400, message };
  }
  const minScoreRaw = process.env.RECAPTCHA_MIN_SCORE_INTAKE ?? config.recaptcha?.minScore ?? 0.3;
  const effectiveMinScore = Number.isFinite(Number(minScoreRaw)) ? Number(minScoreRaw) : 0.3;
  if (verification.score !== null && verification.score < effectiveMinScore && config.nodeEnv === 'production') {
    return { ok: false, status: 400, message: 'Captcha verification failed. Please try again.' };
  }
  return { ok: true };
};

let userEmailVerificationColumnsPromise = null;
const getUserEmailVerificationSupport = async () => {
  if (!userEmailVerificationColumnsPromise) {
    userEmailVerificationColumnsPromise = (async () => {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('email_verified_at','email_verification_token','email_verification_token_expires_at')",
        [dbName]
      );
      const colSet = new Set((cols || []).map((c) => c.COLUMN_NAME));
      return {
        hasVerifiedAt: colSet.has('email_verified_at'),
        hasVerificationToken: colSet.has('email_verification_token'),
        hasVerificationTokenExpiresAt: colSet.has('email_verification_token_expires_at')
      };
    })().catch(() => ({
      hasVerifiedAt: false,
      hasVerificationToken: false,
      hasVerificationTokenExpiresAt: false
    }));
  }
  return userEmailVerificationColumnsPromise;
};

const issueUserEmailVerification = async ({ userId, email, firstName = '', portalSlug = 'ssc' }) => {
  const support = await getUserEmailVerificationSupport();
  if (!support.hasVerificationToken || !support.hasVerificationTokenExpiresAt) {
    return { required: false, verifyUrl: null, verificationSent: false };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const updateClauses = ['email_verification_token = ?', 'email_verification_token_expires_at = ?'];
  const updateParams = [token, expiresAt];
  if (support.hasVerifiedAt) {
    updateClauses.push('email_verified_at = NULL');
  }
  updateParams.push(userId);
  await pool.execute(
    `UPDATE users SET ${updateClauses.join(', ')} WHERE id = ?`,
    updateParams
  );

  const frontendUrl = String(config.frontendUrl || process.env.FRONTEND_URL || '').replace(/\/\s*$/, '');
  const backendBase = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || config.frontendUrl || '').replace(/\/\s*$/, '');
  const slug = String(portalSlug || 'ssc').trim().replace(/[^a-z0-9-]/gi, '') || 'ssc';
  const verifyUrl = `${backendBase}/api/auth/verify-club-manager-email?token=${token}&portalSlug=${slug}&redirect=1`;

  if (!EmailService.isConfigured()) {
    return { required: true, verifyUrl, verificationSent: false };
  }

  const preferredKeys = ['intake', 'school_intake', 'notifications', 'system'];
  const platformAgencyId = await getPlatformAgencyId();
  let identity = platformAgencyId
    ? await resolvePreferredSenderIdentityForAgency({ agencyId: platformAgencyId, preferredKeys })
    : null;
  if (!identity?.id) {
    identity = await resolvePreferredSenderIdentityForAgency({
      agencyId: null,
      preferredKeys: ['summit_stats', 'platform', 'default', 'system', 'notifications']
    });
  }

  const subject = 'Verify your email for Summit Stats Team Challenge';
  const text = `Hi${firstName ? ` ${String(firstName).trim()}` : ''},\n\nPlease verify your email to finish activating your Summit Stats Team Challenge application:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <p>Hi${firstName ? ` ${String(firstName).trim()}` : ''},</p>
      <p>Please verify your email to finish activating your Summit Stats Team Challenge application.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 14px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px;">Verify my email</a></p>
      <p style="color:#555;">Or copy/paste this link:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p style="color:#777;">This link expires in 24 hours.</p>
      <p style="color:#777;">If you did not request this application, you can ignore this email.</p>
    </div>
  `.trim();

  try {
    if (identity?.id) {
      await sendEmailFromIdentity({
        senderIdentityId: identity.id,
        to: email,
        subject,
        text,
        html,
        source: 'auto'
      });
    } else {
      await EmailService.sendEmail({
        to: email,
        subject,
        text,
        html,
        fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || null,
        fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
        replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null,
        source: 'auto',
        agencyId: platformAgencyId || null
      });
    }
    return { required: true, verifyUrl: null, verificationSent: true };
  } catch (error) {
    console.error('SSC applicant verification email failed:', error?.message || error);
    return { required: true, verifyUrl, verificationSent: false };
  }
};

const isUserEmailVerificationPending = async (userId) => {
  const support = await getUserEmailVerificationSupport();
  if (!userId || !support.hasVerificationToken) return false;
  const selectCols = [
    support.hasVerifiedAt ? 'email_verified_at' : 'NULL AS email_verified_at',
    support.hasVerificationToken ? 'email_verification_token' : 'NULL AS email_verification_token'
  ];
  const [rows] = await pool.execute(
    `SELECT ${selectCols.join(', ')} FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const user = rows?.[0];
  if (!user) return false;
  return !user.email_verified_at && !!String(user.email_verification_token || '').trim();
};

const DEFAULT_GENDER_OPTIONS = ['male', 'female'];

const buildPublicPageConfig = (rawStoreConfig) => {
  const storeObj = parseJsonObject(rawStoreConfig);
  const cfg = parseJsonObject(storeObj?.publicPageConfig);
  const slides = Array.isArray(cfg.albumSlides)
    ? cfg.albumSlides
      .map((s) => (typeof s === 'string'
        ? { imageUrl: String(s).trim(), caption: '' }
        : {
          imageUrl: String(s?.imageUrl || '').trim(),
          caption: String(s?.caption || '').trim().slice(0, 140)
        }))
      .filter((s) => s.imageUrl)
      .slice(0, 20)
    : [];

  let genderOptions = DEFAULT_GENDER_OPTIONS;
  if (Array.isArray(cfg.genderOptions) && cfg.genderOptions.length > 0) {
    const cleaned = cfg.genderOptions
      .map((v) => String(v || '').trim())
      .filter((v) => v)
      .slice(0, 30);
    if (cleaned.length > 0) genderOptions = cleaned;
  }

  return {
    publicSlug: normalizePublicSlug(cfg.publicSlug),
    bannerTitle: String(cfg.bannerTitle || '').trim().slice(0, 120),
    bannerSubtitle: String(cfg.bannerSubtitle || '').trim().slice(0, 220),
    bannerImageUrl: String(cfg.bannerImageUrl || '').trim().slice(0, 500),
    showCurrentSeason: cfg.showCurrentSeason !== false,
    showActiveParticipants: cfg.showActiveParticipants !== false,
    showFeaturedWorkout: cfg.showFeaturedWorkout !== false,
    showPhotoAlbum: cfg.showPhotoAlbum !== false,
    albumSlides: slides,
    genderOptions
  };
};

const buildPublicStoreConfig = (rawStoreConfig) => {
  const storeObj = parseJsonObject(rawStoreConfig);
  return {
    enabled: !!storeObj.enabled && !!String(storeObj.url || '').trim(),
    title: String(storeObj.title || 'Team Store').trim().slice(0, 120),
    buttonText: String(storeObj.buttonText || 'Shop Now').trim().slice(0, 60),
    url: String(storeObj.url || '').trim().slice(0, 500)
  };
};

// ── PUBLIC CLUB STATS ─────────────────────────────────────────────────────

/**
 * GET /summit-stats/clubs/:id/public
 * Public endpoint — returns club info, aggregate stats, and club records.
 */
export const getPublicClubStats = async (req, res, next) => {
  try {
    const clubRef = String(req.params.id || '').trim();
    const club = await resolveClubByPublicRef(clubRef);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });
    const clubId = Number(club.id);

    // Member count
    const [memberRows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM user_agencies WHERE agency_id = ? AND is_active = 1`,
      [clubId]
    );
    const memberCount = Number(memberRows?.[0]?.cnt || 0);

    // Aggregate workout stats across all seasons in this club
    const [statRows] = await pool.execute(
      `SELECT
         COALESCE(SUM(w.distance_value), 0)  AS total_miles,
         COALESCE(SUM(w.points), 0)           AS total_points,
         COALESCE(SUM(w.duration_minutes), 0) AS total_minutes,
         COUNT(w.id)                          AS total_workouts
       FROM challenge_workouts w
       INNER JOIN learning_program_classes lpc ON lpc.id = w.learning_class_id
       WHERE lpc.organization_id = ?`,
      [clubId]
    );
    const stats = statRows?.[0] || {};

    // Season count
    const [seasonCountRows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM learning_program_classes WHERE organization_id = ?`,
      [clubId]
    );
    const seasonCount = Number(seasonCountRows?.[0]?.cnt || 0);

    // Agency store/page config
    const [clubRow] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );

    // Club records (from dedicated table)
    let clubRecords = [];
    try {
      const [crRows] = await pool.execute(
        `SELECT records_json FROM summit_stats_club_records WHERE agency_id = ? LIMIT 1`,
        [clubId]
      );
      const raw = crRows?.[0]?.records_json;
      clubRecords = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    } catch { clubRecords = []; }

    // Logo URL
    const baseUrl = process.env.BACKEND_URL || '';
    let logoUrl = club.logo_url || null;
    if (club.logo_path) logoUrl = `${baseUrl}/uploads/${club.logo_path.replace(/^uploads\//, '')}`;
    const publicPageConfig = buildPublicPageConfig(clubRow?.[0]?.store_config_json);
    const publicStore = buildPublicStoreConfig(clubRow?.[0]?.store_config_json);

    // Current season (active only)
    let currentSeason = null;
    const [seasonRows] = await pool.execute(
      `SELECT id, class_name, description, status, starts_at, ends_at, created_at
       FROM learning_program_classes
       WHERE organization_id = ?
         AND LOWER(COALESCE(status, '')) = 'active'
       ORDER BY COALESCE(starts_at, created_at) DESC, id DESC
       LIMIT 1`,
      [clubId]
    );
    const season = seasonRows?.[0] || null;
    if (season) {
      currentSeason = {
        id: Number(season.id),
        name: season.class_name || `Season ${season.id}`,
        description: String(season.description || '').trim() || null,
        status: String(season.status || '').toLowerCase() || null,
        startsAt: season.starts_at || null,
        endsAt: season.ends_at || null
      };
    }

    let upcomingSeason = null;
    const [upcomingRows] = await pool.execute(
      `SELECT id, class_name, description, status, starts_at, ends_at, created_at
       FROM learning_program_classes
       WHERE organization_id = ?
         AND COALESCE(starts_at, created_at) >= NOW()
       ORDER BY COALESCE(starts_at, created_at) ASC, id ASC
       LIMIT 1`,
      [clubId]
    );
    const nextSeason = upcomingRows?.[0] || null;
    if (nextSeason) {
      const startsAt = nextSeason.starts_at || nextSeason.created_at || null;
      let daysUntilStart = null;
      if (startsAt) {
        const now = new Date();
        const startDate = new Date(startsAt);
        const millis = startDate.getTime() - now.getTime();
        daysUntilStart = millis <= 0 ? 0 : Math.ceil(millis / (1000 * 60 * 60 * 24));
      }
      upcomingSeason = {
        id: Number(nextSeason.id),
        name: nextSeason.class_name || `Season ${nextSeason.id}`,
        description: String(nextSeason.description || '').trim() || null,
        status: String(nextSeason.status || '').toLowerCase() || null,
        startsAt,
        endsAt: nextSeason.ends_at || null,
        daysUntilStart
      };
    }

    // Active participants in current season
    let activeParticipants = [];
    if (currentSeason?.id) {
      const [activeRows] = await pool.execute(
        `SELECT
           u.id AS user_id,
           u.first_name,
           u.last_name,
           MIN(t.team_name) AS team_name
         FROM learning_class_provider_memberships m
         INNER JOIN users u ON u.id = m.provider_user_id
         LEFT JOIN challenge_team_members tm
           ON tm.provider_user_id = m.provider_user_id
         LEFT JOIN challenge_teams t
           ON t.id = tm.team_id AND t.learning_class_id = m.learning_class_id
         INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
         WHERE m.learning_class_id = ?
           AND m.membership_status = 'active'
           AND ua.is_active = 1
         GROUP BY u.id, u.first_name, u.last_name
         ORDER BY u.first_name ASC, u.last_name ASC
         LIMIT 80`,
        [clubId, currentSeason.id]
      );
      activeParticipants = (activeRows || []).map((r) => ({
        userId: Number(r.user_id),
        displayName: `${String(r.first_name || '').trim()} ${String(r.last_name || '').trim().charAt(0)}.`.trim(),
        teamName: r.team_name || null
      }));
    }

    // Featured workout by highest kudos in the current kudos week
    let featuredWorkout = null;
    const now = new Date();
    const utcDay = now.getUTCDay(); // 0 Sun ... 6 Sat
    const daysSinceMonday = (utcDay + 6) % 7;
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const [featuredRows] = await pool.execute(
      `SELECT
         w.id AS workout_id,
         w.activity_type,
         w.distance_value,
         w.duration_minutes,
         w.terrain,
         w.completed_at,
         w.screenshot_file_path,
         u.first_name,
         u.last_name,
         t.team_name,
         COUNT(k.id) AS kudos_count
       FROM challenge_workout_kudos k
       INNER JOIN challenge_workouts w ON w.id = k.workout_id
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       INNER JOIN users u ON u.id = w.user_id
       LEFT JOIN challenge_teams t ON t.id = w.team_id
       WHERE c.organization_id = ?
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         AND (
           (k.week_start_date IS NOT NULL AND k.week_start_date = ?)
           OR (k.given_at IS NOT NULL AND k.given_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY))
         )
       GROUP BY
         w.id, w.activity_type, w.distance_value, w.duration_minutes, w.terrain, w.completed_at, w.screenshot_file_path,
         u.first_name, u.last_name, t.team_name
       ORDER BY kudos_count DESC, w.completed_at DESC
       LIMIT 1`,
      [clubId, weekStartStr]
    );
    const top = featuredRows?.[0] || null;
    if (top) {
      featuredWorkout = {
        workoutId: Number(top.workout_id),
        activityType: top.activity_type || 'Workout',
        distanceMiles: Number(top.distance_value || 0),
        durationMinutes: Number(top.duration_minutes || 0),
        terrain: top.terrain || '',
        kudosCount: Number(top.kudos_count || 0),
        completedAt: top.completed_at || null,
        teamName: top.team_name || null,
        // Keep it low-identifying: first name + last initial only.
        byline: `${String(top.first_name || '').trim()} ${String(top.last_name || '').trim().charAt(0)}.`.trim(),
        imageUrl: toUploadsPublicUrl(top.screenshot_file_path)
      };
    }

    // Public album: manager-curated slides first, fallback to recent workout screenshots.
    let albumSlides = [...publicPageConfig.albumSlides];
    if (!albumSlides.length) {
      const [photoRows] = await pool.execute(
        `SELECT w.id, w.screenshot_file_path, w.activity_type, w.distance_value
         FROM challenge_workouts w
         INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
         WHERE c.organization_id = ?
           AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
           AND COALESCE(TRIM(w.screenshot_file_path), '') <> ''
         ORDER BY w.completed_at DESC, w.created_at DESC
         LIMIT 12`,
        [clubId]
      );
      albumSlides = (photoRows || []).map((r) => ({
        imageUrl: toUploadsPublicUrl(r.screenshot_file_path),
        caption: `${String(r.activity_type || 'Workout').trim()}${Number(r.distance_value || 0) > 0 ? ` · ${Number(r.distance_value).toFixed(1)} mi` : ''}`
      })).filter((s) => s.imageUrl);
    }

    // Race divisions (all-time for this club)
    let raceDivisions = { halfMarathon: { allTime: [] }, marathon: { allTime: [] } };
    try {
      raceDivisions = await buildRaceDivisions({ classId: 0, organizationId: clubId });
    } catch { /* non-blocking */ }

    return res.json({
      club: {
        id: club.id,
        name: club.name,
        slug: club.slug,
        publicSlug: publicPageConfig.publicSlug || null,
        logoUrl,
        publicPageConfig
      },
      stats: {
        memberCount,
        totalMiles:    Number(Number(stats.total_miles || 0).toFixed(1)),
        totalPoints:   Number(stats.total_points || 0),
        totalMinutes:  Number(stats.total_minutes || 0),
        totalWorkouts: Number(stats.total_workouts || 0),
        seasonCount,
        halfMarathonCount: raceDivisions.halfMarathon?.allTime?.length || 0,
        marathonCount:     raceDivisions.marathon?.allTime?.length || 0
      },
      clubRecords: Array.isArray(clubRecords) ? clubRecords.filter(r => r?.label) : [],
      raceDivisions: {
        halfMarathon: raceDivisions.halfMarathon?.allTime || [],
        marathon:     raceDivisions.marathon?.allTime || []
      },
      currentSeason,
      upcomingSeason,
      activeParticipants,
      featuredWorkout,
      albumSlides,
      publicStore,
      recaptcha: getSscRecaptchaConfig()
    });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/clubs/:id/public-page-config
 * Manager-only — editable public page appearance/content settings.
 */
export const getPublicPageConfig = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club = await assertManagerAccess(req, res, clubId);
    if (!club) return;
    const [rows] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );
    const config = buildPublicPageConfig(rows?.[0]?.store_config_json);
    return res.json({ config });
  } catch (e) { next(e); }
};

/**
 * PUT /summit-stats/clubs/:id/public-page-config
 * Manager-only — save editable public page settings.
 */
export const updatePublicPageConfig = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club = await assertManagerAccess(req, res, clubId);
    if (!club) return;
    const [rows] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );
    const storeObj = parseJsonObject(rows?.[0]?.store_config_json);
    const body = req.body || {};
    const nextConfig = buildPublicPageConfig({
      publicPageConfig: {
        publicSlug: body.publicSlug,
        bannerTitle: body.bannerTitle,
        bannerSubtitle: body.bannerSubtitle,
        bannerImageUrl: body.bannerImageUrl,
        showCurrentSeason: body.showCurrentSeason,
        showActiveParticipants: body.showActiveParticipants,
        showFeaturedWorkout: body.showFeaturedWorkout,
        showPhotoAlbum: body.showPhotoAlbum,
        albumSlides: body.albumSlides,
        genderOptions: body.genderOptions
      }
    });
    if (nextConfig.publicSlug) {
      const [dupeRows] = await pool.execute(
        `SELECT id
         FROM agencies
         WHERE id <> ?
           AND organization_type = 'affiliation'
           AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(store_config_json, '$.publicPageConfig.publicSlug')), '')) = ?
         LIMIT 1`,
        [clubId, nextConfig.publicSlug]
      );
      if (Array.isArray(dupeRows) && dupeRows.length) {
        return res.status(409).json({ error: { message: 'That public URL slug is already in use by another club.' } });
      }
    }
    const nextStoreObj = {
      ...storeObj,
      publicPageConfig: nextConfig
    };
    await pool.execute(
      `UPDATE agencies SET store_config_json = ? WHERE id = ?`,
      [JSON.stringify(nextStoreObj), clubId]
    );
    return res.json({ ok: true, config: nextConfig });
  } catch (e) { next(e); }
};

// ── INVITE TOKEN RESOLUTION ───────────────────────────────────────────────

/**
 * GET /summit-stats/clubs/invite/:token
 * Public — resolves an invite token and returns club info + custom field defs.
 */
export const resolveInviteToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: { message: 'Token required' } });

    const [rows] = await pool.execute(
      `SELECT i.*, a.name AS club_name, a.logo_url, a.logo_path, a.id AS club_id
       FROM challenge_member_invites i
       JOIN agencies a ON a.id = i.agency_id
       WHERE i.token = ? AND i.is_active = 1 LIMIT 1`,
      [token]
    );
    const invite = rows?.[0];
    if (!invite) return res.status(404).json({ error: { message: 'Invite link not found or expired' } });
    if (invite.used_at) return res.status(410).json({ error: { message: 'This invite link has already been used' } });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: { message: 'This invite link has expired' } });
    }

    // Custom field defs for the club
    const [fieldRows] = await pool.execute(
      `SELECT id, label, field_type, is_required FROM challenge_custom_field_definitions
       WHERE agency_id = ? ORDER BY sort_order ASC, id ASC`,
      [invite.agency_id]
    );

    // Gender options from club public page config
    const [clubConfigRows] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [invite.agency_id]
    );
    const publicPageConfig = buildPublicPageConfig(clubConfigRows?.[0]?.store_config_json);

    const baseUrl = process.env.BACKEND_URL || '';
    let logoUrl = invite.logo_url || null;
    if (invite.logo_path) logoUrl = `${baseUrl}/uploads/${invite.logo_path.replace(/^uploads\//, '')}`;

    return res.json({
      invite: {
        clubId:        invite.agency_id,
        clubName:      invite.club_name,
        logoUrl,
        token:         invite.token,
        email:         invite.email || null,
        autoApprove:   !!invite.auto_approve,
        label:         invite.label || null,
        genderOptions: publicPageConfig.genderOptions,
        bannerImageUrl: publicPageConfig.bannerImageUrl || null
      },
      customFields: fieldRows || [],
      recaptcha: getSscRecaptchaConfig()
    });
  } catch (e) { next(e); }
};

// ── APPLICATION SUBMISSION ────────────────────────────────────────────────

/** Shared logic: validate and write an application row. */
const createApplicationRow = async ({
  clubId, inviteId = null, referrerUserId = null, userId = null,
  firstName, lastName, email, phone, username,
  gender, dateOfBirth, weightLbs, heightInches, timezone,
  customFields,
  heardAboutClub = null,
  runningFitnessBackground = null,
  averageMilesPerWeek = null,
  averageHoursPerWeek = null,
  currentFitnessActivities = null,
  waiverSignatureName = null,
  waiverAgreedAt = null,
  waiverVersion = null,
  waiverIpAddress = null,
  waiverUserAgent = null
}) => {
  // Store any non-system custom fields only
  const mergedCustomFields = { ...(customFields || {}) };

  const [result] = await pool.execute(
    `INSERT INTO challenge_member_applications
       (agency_id, invite_id, referrer_user_id, user_id,
        first_name, last_name, email, phone,
        gender, date_of_birth, weight_lbs, height_inches, timezone,
        heard_about_club, running_fitness_background, average_miles_per_week, average_hours_per_week, current_fitness_activities,
        waiver_signature_name, waiver_agreed_at, waiver_version, waiver_ip_address, waiver_user_agent,
        custom_fields, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      clubId,
      inviteId || null,
      referrerUserId || null,
      userId || null,
      String(firstName || '').trim(),
      String(lastName || '').trim(),
      String(email || '').trim().toLowerCase(),
      String(phone || '').trim() || null,
      gender || null,
      dateOfBirth || null,
      weightLbs ? Number(weightLbs) : null,
      heightInches ? Number(heightInches) : null,
      timezone || null,
      heardAboutClub || null,
      runningFitnessBackground || null,
      averageMilesPerWeek != null ? Number(averageMilesPerWeek) : null,
      averageHoursPerWeek != null ? Number(averageHoursPerWeek) : null,
      currentFitnessActivities || null,
      waiverSignatureName || null,
      waiverAgreedAt || null,
      waiverVersion || null,
      waiverIpAddress || null,
      waiverUserAgent || null,
      JSON.stringify(mergedCustomFields)
    ]
  );
  return result.insertId;
};

/** Create a new user account for an applicant. */
const createUserForApplication = async ({ firstName, lastName, email, phone, username, password }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const hashedPw = await hashPassword(String(password));
  const [insertResult] = await pool.execute(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, status, created_at)
     VALUES (?, ?, ?, ?, 'provider', 'ACTIVE_EMPLOYEE', NOW())`,
    [String(firstName || '').trim(), String(lastName || '').trim(), normalizedEmail, hashedPw]
  );
  const userId = insertResult.insertId;
  if (phone) {
    try { await pool.execute(`UPDATE users SET phone = ? WHERE id = ?`, [String(phone).trim(), userId]); } catch { /* non-fatal */ }
  }
  if (username) {
    try { await pool.execute(`UPDATE users SET username = ? WHERE id = ?`, [String(username).trim(), userId]); } catch { /* non-fatal: column may not exist or conflict */ }
  }
  return { userId, isNew: true };
};

const ensureUserInPlatformTenantForClub = async (userId, clubId, knownAgencies = null) => {
  const platformAgencyId = await resolveClubPlatformAgencyId(clubId);
  if (!platformAgencyId) return null;
  const agencies = Array.isArray(knownAgencies) ? knownAgencies : await User.getAgencies(userId);
  const alreadyInPlatform = (agencies || []).some((a) => Number(a?.id) === Number(platformAgencyId));
  if (!alreadyInPlatform) {
    await User.assignToAgency(userId, platformAgencyId, { isActive: true });
  }
  return platformAgencyId;
};

const findLatestApplicationForClubEmail = async ({ clubId, email }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!clubId || !normalizedEmail) return null;
  const [rows] = await pool.execute(
    `SELECT id, status
     FROM challenge_member_applications
     WHERE agency_id = ? AND email = ?
     ORDER BY applied_at DESC, id DESC
     LIMIT 1`,
    [clubId, normalizedEmail]
  );
  return rows?.[0] || null;
};

const getApplicationEmailStatusSnapshot = async ({ clubId, email }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!clubId || !normalizedEmail) {
    return {
      existingAccount: false,
      requiresPassword: true,
      alreadyMember: false,
      applicationStatus: null
    };
  }

  const existingUser = await User.findByEmail(normalizedEmail);
  const existingApplication = await findLatestApplicationForClubEmail({ clubId, email: normalizedEmail });

  let alreadyMember = false;
  let inPlatformTenant = false;
  let accountLabel = null;

  if (existingUser?.id) {
    const agencies = await User.getAgencies(existingUser.id);
    alreadyMember = (agencies || []).some((a) => Number(a?.id) === Number(clubId));
    const platformAgencyId = await resolveClubPlatformAgencyId(clubId);
    if (platformAgencyId) {
      inPlatformTenant = (agencies || []).some((a) => Number(a?.id) === Number(platformAgencyId));
    }
    const hasPassword = !!existingUser.password_hash;
    accountLabel = hasPassword ? 'password' : 'sso';
  }

  return {
    existingAccount: !!existingUser,
    requiresPassword: !existingUser,
    alreadyMember,
    inPlatformTenant,
    applicationStatus: existingApplication?.status || null,
    signInMethod: accountLabel
  };
};

/**
 * POST /summit-stats/application-email-status
 * Public — let the join form know whether this email already belongs to a platform account.
 */
export const getApplicationEmailStatus = async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const inviteToken = String(req.body?.inviteToken || '').trim();
    let clubId = toInt(req.body?.clubId);

    if (!email) {
      return res.status(400).json({ error: { message: 'Email is required' } });
    }

    if (!clubId && inviteToken) {
      const [inviteRows] = await pool.execute(
        `SELECT agency_id FROM challenge_member_invites WHERE token = ? AND is_active = 1 LIMIT 1`,
        [inviteToken]
      );
      clubId = toInt(inviteRows?.[0]?.agency_id);
    }

    const club = await resolveClub(clubId);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });

    const status = await getApplicationEmailStatusSnapshot({ clubId, email });
    return res.json({ ok: true, email, ...status });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/:id/apply-form
 * Public — submit a member application (from public page or referral link).
 * Body: { firstName, lastName, email, password, phone?, gender?, dateOfBirth?,
 *         weightLbs?, heightInches?, timezone?, customFields?, referralCode? }
 */
export const submitApplication = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club   = await resolveClub(clubId);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });

    const {
      firstName, lastName, email, phone, username,
      password,
      gender, dateOfBirth, weightLbs, heightInches, timezone,
      customFields, referralCode,
      heardAboutClub, runningFitnessBackground,
      averageMilesPerWeek, averageHoursPerWeek,
      currentFitnessActivities,
      waiverAccepted, waiverSignatureName,
      captchaToken, portalSlug
    } = req.body;

    if (!firstName || !lastName) return res.status(400).json({ error: { message: 'First and last name are required' } });
    if (!email) return res.status(400).json({ error: { message: 'Email is required' } });
    if (!(waiverAccepted === true || waiverAccepted === 1 || String(waiverAccepted || '').toLowerCase() === 'true')) {
      return res.status(400).json({ error: { message: 'You must accept the participation waiver to submit your application.' } });
    }
    if (!normalizeShortText(waiverSignatureName, 255)) {
      return res.status(400).json({ error: { message: 'Please type your full name to sign the waiver.' } });
    }
    const captchaResult = await verifySscApplicationCaptcha(req);
    if (!captchaResult.ok) {
      return res.status(captchaResult.status || 400).json({ error: { message: captchaResult.message } });
    }

    const existingApplication = await findLatestApplicationForClubEmail({ clubId, email });
    if (existingApplication?.status === 'approved') {
      return res.status(409).json({ error: { message: 'An account with this email is already a member of this club' } });
    }
    if (existingApplication?.status === 'pending') {
      return res.status(409).json({ error: { message: 'An application for this email is already pending review' } });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findByEmail(normalizedEmail);
    let existingUserAgencies = [];
    if (existingUser?.id) {
      existingUserAgencies = await User.getAgencies(existingUser.id);
      const alreadyMember = existingUserAgencies.some((a) => Number(a?.id) === Number(clubId));
      if (alreadyMember) {
        return res.status(409).json({ error: { message: 'This account is already a member of this club' } });
      }
    } else if (!password || String(password).length < 8) {
      return res.status(400).json({ error: { message: 'Password must be at least 8 characters' } });
    }

    const { userId, isNew } = existingUser
      ? { userId: Number(existingUser.id), isNew: false }
      : await createUserForApplication({ firstName, lastName, email: normalizedEmail, phone, username, password });

    await ensureUserInPlatformTenantForClub(userId, clubId, existingUserAgencies);
    const verification = isNew
      ? await issueUserEmailVerification({ userId, email: normalizedEmail, firstName, portalSlug: portalSlug || 'ssc' })
      : { required: false, verificationSent: false, verifyUrl: null };

    // Resolve referrer
    let referrerUserId = null;
    if (referralCode) {
      const [refRows] = await pool.execute(
        `SELECT ua.user_id FROM user_agencies ua
         WHERE ua.referral_code = ? AND ua.agency_id = ? LIMIT 1`,
        [String(referralCode).toUpperCase(), clubId]
      );
      referrerUserId = refRows?.[0]?.user_id || null;
    }

    const appId = await createApplicationRow({
      clubId, referrerUserId, userId,
      firstName, lastName, email: normalizedEmail, phone, username,
      gender, dateOfBirth, weightLbs, heightInches, timezone,
      customFields,
      heardAboutClub: normalizeLongText(heardAboutClub, 1000),
      runningFitnessBackground: normalizeLongText(runningFitnessBackground, 4000),
      averageMilesPerWeek: normalizeNonNegativeDecimal(averageMilesPerWeek, { max: 500 }),
      averageHoursPerWeek: normalizeNonNegativeDecimal(averageHoursPerWeek, { max: 200 }),
      currentFitnessActivities: normalizeLongText(currentFitnessActivities, 4000),
      waiverSignatureName: normalizeShortText(waiverSignatureName, 255),
      waiverAgreedAt: new Date(),
      waiverVersion: APPLICATION_WAIVER_VERSION,
      waiverIpAddress: getRequestIp(req),
      waiverUserAgent: normalizeShortText(req.get('user-agent'), 255)
    });

    return res.status(201).json({
      ok: true,
      applicationId: appId,
      verificationRequired: !!verification.required,
      verificationSent: !!verification.verificationSent,
      verifyUrl: verification.verifyUrl || null,
      message: verification.required
        ? 'Application submitted! Please verify your email to finish activating your account while the club manager reviews your application.'
        : 'Application submitted! Your club manager will review it shortly.'
    });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/invite/:token/apply
 * Public — submit a member application via a specific invite token.
 */
export const submitInviteApplication = async (req, res, next) => {
  try {
    const { token } = req.params;
    const [inviteRows] = await pool.execute(
      `SELECT * FROM challenge_member_invites WHERE token = ? AND is_active = 1 LIMIT 1`,
      [token]
    );
    const invite = inviteRows?.[0];
    if (!invite) return res.status(404).json({ error: { message: 'Invite link not found' } });
    if (invite.used_at) return res.status(410).json({ error: { message: 'This invite has already been used' } });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: { message: 'This invite has expired' } });
    }

    const clubId = toInt(invite.agency_id);
    const club   = await resolveClub(clubId);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });

    const {
      firstName, lastName, email, phone, username,
      password,
      gender, dateOfBirth, weightLbs, heightInches, timezone,
      customFields,
      heardAboutClub, runningFitnessBackground,
      averageMilesPerWeek, averageHoursPerWeek,
      currentFitnessActivities,
      waiverAccepted, waiverSignatureName,
      captchaToken, portalSlug
    } = req.body;

    if (!firstName || !lastName) return res.status(400).json({ error: { message: 'First and last name are required' } });
    if (!email) return res.status(400).json({ error: { message: 'Email is required' } });
    if (!(waiverAccepted === true || waiverAccepted === 1 || String(waiverAccepted || '').toLowerCase() === 'true')) {
      return res.status(400).json({ error: { message: 'You must accept the participation waiver to submit your application.' } });
    }
    if (!normalizeShortText(waiverSignatureName, 255)) {
      return res.status(400).json({ error: { message: 'Please type your full name to sign the waiver.' } });
    }
    const captchaResult = await verifySscApplicationCaptcha(req);
    if (!captchaResult.ok) {
      return res.status(captchaResult.status || 400).json({ error: { message: captchaResult.message } });
    }

    const existingApplication = await findLatestApplicationForClubEmail({ clubId, email });
    if (existingApplication?.status === 'approved') {
      return res.status(409).json({ error: { message: 'An account with this email is already a member of this club' } });
    }
    if (existingApplication?.status === 'pending') {
      return res.status(409).json({ error: { message: 'An application for this email is already pending review' } });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findByEmail(normalizedEmail);
    let existingUserAgencies = [];
    if (existingUser?.id) {
      existingUserAgencies = await User.getAgencies(existingUser.id);
      const alreadyMember = existingUserAgencies.some((a) => Number(a?.id) === Number(clubId));
      if (alreadyMember) {
        return res.status(409).json({ error: { message: 'This account is already a member of this club' } });
      }
    } else if (!password || String(password).length < 8) {
      return res.status(400).json({ error: { message: 'Password must be at least 8 characters' } });
    }

    const { userId, isNew } = existingUser
      ? { userId: Number(existingUser.id), isNew: false }
      : await createUserForApplication({ firstName, lastName, email: normalizedEmail, phone, username, password });

    await ensureUserInPlatformTenantForClub(userId, clubId, existingUserAgencies);
    const verification = isNew
      ? await issueUserEmailVerification({ userId, email: normalizedEmail, firstName, portalSlug: portalSlug || 'ssc' })
      : { required: false, verificationSent: false, verifyUrl: null };

    const appId = await createApplicationRow({
      clubId, inviteId: invite.id, userId,
      firstName, lastName, email: normalizedEmail, phone, username,
      gender, dateOfBirth, weightLbs, heightInches, timezone,
      customFields,
      heardAboutClub: normalizeLongText(heardAboutClub, 1000),
      runningFitnessBackground: normalizeLongText(runningFitnessBackground, 4000),
      averageMilesPerWeek: normalizeNonNegativeDecimal(averageMilesPerWeek, { max: 500 }),
      averageHoursPerWeek: normalizeNonNegativeDecimal(averageHoursPerWeek, { max: 200 }),
      currentFitnessActivities: normalizeLongText(currentFitnessActivities, 4000),
      waiverSignatureName: normalizeShortText(waiverSignatureName, 255),
      waiverAgreedAt: new Date(),
      waiverVersion: APPLICATION_WAIVER_VERSION,
      waiverIpAddress: getRequestIp(req),
      waiverUserAgent: normalizeShortText(req.get('user-agent'), 255)
    });

    // Mark invite as used
    await pool.execute(
      `UPDATE challenge_member_invites SET used_at = NOW() WHERE id = ?`,
      [invite.id]
    );

    // Auto-approve if the invite flag is set
    if (invite.auto_approve && !verification.required) {
      await _approveApplication(appId, null /* no manager */, 'Auto-approved via invite link');
      return res.status(201).json({
        ok: true, applicationId: appId,
        verificationRequired: !!verification.required,
        verificationSent: !!verification.verificationSent,
        verifyUrl: verification.verifyUrl || null,
        message: verification.required
          ? 'Application submitted and club access is ready once you verify your email.'
          : 'Welcome! You have been added to the club automatically.'
      });
    }

    return res.status(201).json({
      ok: true, applicationId: appId,
      verificationRequired: !!verification.required,
      verificationSent: !!verification.verificationSent,
      verifyUrl: verification.verifyUrl || null,
      message: verification.required
        ? (invite.auto_approve
            ? 'Application submitted! Verify your email to finish activating your invite-based access.'
            : 'Application submitted! Please verify your email while the club manager reviews your application.')
        : 'Application submitted! Your club manager will review it shortly.'
    });
  } catch (e) { next(e); }
};

// ── APPROVAL LOGIC (shared) ───────────────────────────────────────────────

/** Internal: approve one application row. Creates/links user, assigns to club, saves profile. */
const _approveApplication = async (appId, reviewedByUserId, notes = '') => {
  const [appRows] = await pool.execute(
    `SELECT * FROM challenge_member_applications WHERE id = ? LIMIT 1`, [appId]
  );
  const app = appRows?.[0];
  if (!app) throw new Error('Application not found');

  // Parse custom fields (skip reserved system keys)
  let appCustomFields = {};
  try { appCustomFields = typeof app.custom_fields === 'string' ? JSON.parse(app.custom_fields) : (app.custom_fields || {}); } catch { /* */ }

  // Resolve user — should already exist because we create the account at application submission time.
  // Fall back to email lookup or account creation for legacy applications submitted before this change.
  let userId = app.user_id ? Number(app.user_id) : null;
  if (!userId) {
    const existingUser = await User.findByEmail(app.email);
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const [insertResult] = await pool.execute(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, status, created_at)
         VALUES (?, ?, ?, ?, 'provider', 'ACTIVE_EMPLOYEE', NOW())`,
        [app.first_name, app.last_name, app.email, await hashPassword(genToken(16))]
      );
      userId = insertResult.insertId;
    }
  }

  if (await isUserEmailVerificationPending(userId)) {
    throw new Error('Applicant must verify their email before approval.');
  }

  // Assign to club (idempotent)
  const agencies = await User.getAgencies(userId);
  const alreadyMember = (agencies || []).some((a) => Number(a?.id) === Number(app.agency_id));
  if (!alreadyMember) await User.assignToAgency(userId, app.agency_id, { clubRole: 'member', isActive: true });

  // Save participant profile (gender, DOB, weight, height) to most recent season, or globally
  if (app.gender || app.date_of_birth || app.weight_lbs || app.height_inches) {
    // Find the most recent active season for this club
    const [seasonRows] = await pool.execute(
      `SELECT id FROM learning_program_classes WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1`,
      [app.agency_id]
    );
    const classId = seasonRows?.[0]?.id;
    if (classId) {
      await ChallengeParticipantProfile.upsert({
        learningClassId: classId,
        providerUserId: userId,
        gender:       app.gender || null,
        dateOfBirth:  app.date_of_birth || null,
        weightLbs:    app.weight_lbs || null,
        heightInches: app.height_inches || null
      });
    }
  }

  // Save custom field values (skip reserved system keys prefixed with _)
  if (app.custom_fields) {
    for (const [defId, value] of Object.entries(appCustomFields)) {
      if (String(defId).startsWith('_')) continue; // skip system keys like _passwordHash, _username
      if (value === undefined || value === null || value === '') continue;
      await pool.execute(
        `INSERT INTO challenge_custom_field_values (user_id, field_definition_id, value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [userId, Number(defId), String(value)]
      );
    }
  }

  // Credit referrer
  if (app.referrer_user_id) {
    await pool.execute(
      `UPDATE user_agencies SET referral_credit_count = referral_credit_count + 1
       WHERE user_id = ? AND agency_id = ?`,
      [app.referrer_user_id, app.agency_id]
    );
  }

  // Update application record
  await pool.execute(
    `UPDATE challenge_member_applications
     SET status = 'approved', user_id = ?, reviewed_by = ?, reviewed_at = NOW(), manager_notes = ?
     WHERE id = ?`,
    [userId, reviewedByUserId || null, notes || null, appId]
  );

  return { userId };
};

// ── MANAGER: LIST / REVIEW APPLICATIONS ───────────────────────────────────

/**
 * GET /summit-stats/clubs/:id/applications
 * Manager — list applications (default: pending; ?status=all|approved|denied).
 */
export const listApplications = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club   = await assertManagerAccess(req, res, clubId);
    if (!club) return;

    const status = req.query.status || 'pending';
    const whereStatus = status === 'all' ? '' : `AND a.status = ?`;
    const params = status === 'all' ? [clubId] : [clubId, status];

    const [rows] = await pool.execute(
      `SELECT a.*,
              CONCAT(ru.first_name, ' ', ru.last_name) AS referrer_name,
              i.label AS invite_label, i.token AS invite_token,
              rb.first_name AS reviewed_by_first, rb.last_name AS reviewed_by_last
       FROM challenge_member_applications a
       LEFT JOIN users ru ON ru.id = a.referrer_user_id
       LEFT JOIN challenge_member_invites i ON i.id = a.invite_id
       LEFT JOIN users rb ON rb.id = a.reviewed_by
       WHERE a.agency_id = ? ${whereStatus}
       ORDER BY a.applied_at DESC`,
      params
    );

    return res.json({ applications: rows || [] });
  } catch (e) { next(e); }
};

/**
 * PUT /summit-stats/clubs/:id/applications/:appId
 * Manager — approve or deny an application.
 * Body: { action: 'approve'|'deny', notes?: string }
 */
export const reviewApplication = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const appId  = toInt(req.params.appId);
    const club   = await assertManagerAccess(req, res, clubId);
    if (!club) return;

    const { action, notes } = req.body;
    if (!['approve', 'deny'].includes(action)) {
      return res.status(400).json({ error: { message: 'action must be "approve" or "deny"' } });
    }

    // Ensure application belongs to this club
    const [appRows] = await pool.execute(
      `SELECT id, status, agency_id FROM challenge_member_applications WHERE id = ? LIMIT 1`, [appId]
    );
    const app = appRows?.[0];
    if (!app || Number(app.agency_id) !== clubId) {
      return res.status(404).json({ error: { message: 'Application not found' } });
    }
    if (app.status !== 'pending') {
      return res.status(409).json({ error: { message: `Application is already ${app.status}` } });
    }

    if (action === 'approve') {
      let approved;
      try {
        approved = await _approveApplication(appId, req.user.id, notes);
      } catch (error) {
        if (String(error?.message || '').includes('verify their email')) {
          return res.status(409).json({ error: { message: error.message } });
        }
        throw error;
      }
      const { userId } = approved;
      return res.json({ ok: true, userId, message: 'Member approved and added to the club.' });
    } else {
      await pool.execute(
        `UPDATE challenge_member_applications
         SET status = 'denied', reviewed_by = ?, reviewed_at = NOW(), manager_notes = ?
         WHERE id = ?`,
        [req.user.id, notes || null, appId]
      );
      return res.json({ ok: true, message: 'Application denied.' });
    }
  } catch (e) { next(e); }
};

// ── MANAGER: INVITE TOKENS ────────────────────────────────────────────────

/**
 * POST /summit-stats/clubs/:id/invites
 * Manager — create an invite token.
 * Body: { email?, label?, autoApprove?, expiresAt? }
 */
export const createInvite = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club   = await assertManagerAccess(req, res, clubId);
    if (!club) return;

    const { email, label, autoApprove, expiresAt } = req.body;
    const token = genToken(32);

    await pool.execute(
      `INSERT INTO challenge_member_invites
         (agency_id, created_by, token, email, label, auto_approve, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        clubId,
        req.user.id,
        token,
        email ? String(email).trim().toLowerCase() : null,
        label ? String(label).trim() : null,
        autoApprove ? 1 : 0,
        expiresAt || null
      ]
    );

    const baseUrl = process.env.FRONTEND_URL || process.env.VITE_APP_URL || '';
    // Build join URL using the platform slug  
    const joinUrl = `${baseUrl}/ssc/join?invite=${token}`;

    return res.status(201).json({ ok: true, token, joinUrl });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/clubs/:id/invites
 * Manager — list active invite tokens.
 */
export const listInvites = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club   = await assertManagerAccess(req, res, clubId);
    if (!club) return;

    const [rows] = await pool.execute(
      `SELECT i.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
       FROM challenge_member_invites i
       LEFT JOIN users u ON u.id = i.created_by
       WHERE i.agency_id = ? AND i.is_active = 1
       ORDER BY i.created_at DESC`,
      [clubId]
    );

    const baseUrl = process.env.FRONTEND_URL || process.env.VITE_APP_URL || '';
    const invites = (rows || []).map(inv => ({
      ...inv,
      joinUrl: `${baseUrl}/ssc/join?invite=${inv.token}`
    }));

    return res.json({ invites });
  } catch (e) { next(e); }
};

/**
 * DELETE /summit-stats/clubs/:id/invites/:inviteId
 * Manager — revoke an invite.
 */
export const revokeInvite = async (req, res, next) => {
  try {
    const clubId   = toInt(req.params.id);
    const inviteId = toInt(req.params.inviteId);
    const club     = await assertManagerAccess(req, res, clubId);
    if (!club) return;

    await pool.execute(
      `UPDATE challenge_member_invites SET is_active = 0 WHERE id = ? AND agency_id = ?`,
      [inviteId, clubId]
    );
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

// ── MEMBER: REFERRAL LINK ─────────────────────────────────────────────────

/**
 * GET /summit-stats/clubs/:id/my-referral-link
 * Authenticated member — get or generate their personal referral code for this club.
 */
export const getMyReferralLink = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const user   = req.user;
    if (!user?.id) return res.status(401).json({ error: { message: 'Sign in required' } });

    const club = await resolveClub(clubId);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });

    // Check membership
    const [uaRows] = await pool.execute(
      `SELECT id, referral_code, referral_credit_count
       FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [user.id, clubId]
    );
    const ua = uaRows?.[0];
    if (!ua) return res.status(403).json({ error: { message: 'You are not a member of this club' } });

    let code = ua.referral_code;
    if (!code) {
      // Generate unique code
      let attempts = 0;
      while (!code && attempts < 10) {
        const candidate = genReferralCode();
        try {
          await pool.execute(
            `UPDATE user_agencies SET referral_code = ? WHERE user_id = ? AND agency_id = ?`,
            [candidate, user.id, clubId]
          );
          code = candidate;
        } catch { attempts++; } // UNIQUE constraint violation → retry
      }
    }

    const baseUrl = process.env.FRONTEND_URL || process.env.VITE_APP_URL || '';
    const joinUrl = `${baseUrl}/ssc/join?ref=${code}`;

    return res.json({
      referralCode: code,
      joinUrl,
      creditCount: Number(ua.referral_credit_count || 0)
    });
  } catch (e) { next(e); }
};

// ── PENDING COUNT (for badge) ─────────────────────────────────────────────

/**
 * GET /summit-stats/clubs/:id/applications/count
 * Manager — quick count of pending applications for badge display.
 */
export const getPendingApplicationCount = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club   = await assertManagerAccess(req, res, clubId);
    if (!club) return;

    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM challenge_member_applications WHERE agency_id = ? AND status = 'pending'`,
      [clubId]
    );
    return res.json({ count: Number(rows?.[0]?.cnt || 0) });
  } catch (e) { next(e); }
};

// ── CLUB FEED ─────────────────────────────────────────────────────────────

/**
 * GET /summit-stats/clubs/:id/feed
 * Authenticated — recent workout activity across all club seasons.
 * Seasons whose settings have feedSettings.showInClubFeed === false are excluded.
 */
export const getClubFeed = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club = await resolveClub(clubId);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });

    const limit = Math.min(60, parseInt(req.query.limit, 10) || 40);

    // Get all seasons for this club, filter out those with showInClubFeed === false
    const [seasonRows] = await pool.execute(
      `SELECT id, class_name, season_settings_json FROM learning_program_classes WHERE organization_id = ? ORDER BY created_at DESC LIMIT 20`,
      [clubId]
    );
    const visibleSeasonIds = (seasonRows || [])
      .filter((s) => {
        try {
          const settings = typeof s.season_settings_json === 'string'
            ? JSON.parse(s.season_settings_json)
            : (s.season_settings_json || {});
          return settings?.feedSettings?.showInClubFeed !== false;
        } catch { return true; }
      })
      .map((s) => s.id);

    if (!visibleSeasonIds.length) return res.json({ items: [] });

    const placeholders = visibleSeasonIds.map(() => '?').join(', ');
    const seasonMap = new Map((seasonRows || []).map((s) => [s.id, s.class_name]));

    const [workoutRows] = await pool.execute(
      `SELECT
         w.id, w.user_id, w.learning_class_id, w.activity_type,
         w.distance_value, w.duration_minutes, w.points, w.calories_burned,
         w.workout_notes, w.completed_at, w.is_race,
         u.first_name, u.last_name
       FROM challenge_workouts w
       INNER JOIN users u ON u.id = w.user_id
       WHERE w.learning_class_id IN (${placeholders})
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
       ORDER BY w.completed_at DESC
       LIMIT ?`,
      [...visibleSeasonIds, limit]
    );

    // Recent manager messages from visible seasons
    const [msgRows] = await pool.execute(
      `SELECT
         cm.id, cm.learning_class_id, cm.message_text, cm.created_at,
         u.first_name, u.last_name, u.role
       FROM challenge_messages cm
       INNER JOIN users u ON u.id = cm.user_id
       INNER JOIN user_agencies ua ON ua.user_id = cm.user_id AND ua.agency_id = ?
       WHERE cm.learning_class_id IN (${placeholders})
         AND COALESCE(ua.club_role, 'member') IN ('manager','assistant_manager')
       ORDER BY cm.created_at DESC
       LIMIT 20`,
      [clubId, ...visibleSeasonIds]
    );

    const feedItems = [
      ...(workoutRows || []).map((w) => ({
        type: 'workout',
        id: `w-${w.id}`,
        workoutId: Number(w.id),
        userId: Number(w.user_id),
        name: `${w.first_name || ''} ${w.last_name || ''}`.trim(),
        activityType: w.activity_type,
        distanceMiles: w.distance_value != null ? Number(w.distance_value) : null,
        durationMinutes: w.duration_minutes != null ? Number(w.duration_minutes) : null,
        points: Number(w.points || 0),
        isRace: w.is_race === 1,
        notes: w.workout_notes || null,
        seasonName: seasonMap.get(w.learning_class_id) || null,
        timestamp: w.completed_at
      })),
      ...(msgRows || []).map((m) => ({
        type: 'announcement',
        id: `m-${m.id}`,
        userId: null,
        name: `${m.first_name || ''} ${m.last_name || ''}`.trim(),
        text: m.message_text,
        seasonName: seasonMap.get(m.learning_class_id) || null,
        timestamp: m.created_at
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);

    return res.json({ items: feedItems });
  } catch (e) { next(e); }
};

// ── CLUB RECORD BOARD ────────────────────────────────────────────────────

/**
 * GET /summit-stats/clubs/:id/record-board
 * Authenticated — all-time club record board computed from workout data.
 */
export const getClubRecordBoard = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club = await resolveClub(clubId);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });

    // Use classId=0 (no season scope) and organizationId=clubId for all-time
    const boards = await buildRecordMetricMap({ classId: 0, organizationId: clubId, selectedMetricKeys: [] });
    return res.json({ records: boards.clubAllTime || [] });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/clubs/:id/members
 * Manager — list club members with season participation summary.
 */
export const listClubMembers = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club = await assertManagerAccess(req, res, clubId);
    if (!club) return;

    const [rows] = await pool.execute(
      `SELECT
         u.id,
         u.email,
         u.first_name,
         u.last_name,
         u.role,
         u.status,
         u.created_at,
         ua.is_active AS club_is_active,
         ua.club_role AS club_role
       FROM user_agencies ua
       INNER JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND (u.is_archived IS NULL OR u.is_archived = 0)
       ORDER BY u.created_at DESC`,
      [clubId]
    );

    const members = Array.isArray(rows) ? rows.map((r) => ({
      id: Number(r.id),
      email: r.email || '',
      firstName: r.first_name || '',
      lastName: r.last_name || '',
      role: r.role || '',
      status: r.status || '',
      createdAt: r.created_at || null,
      clubRole: r.club_role || null,
      isActiveInClub: Number(r.club_is_active || 0) === 1
    })) : [];

    const memberIds = members.map((m) => m.id).filter((n) => Number.isFinite(n) && n > 0);
    const seasonsByUser = {};
    if (memberIds.length) {
      const placeholders = memberIds.map(() => '?').join(',');
      const [seasonRows] = await pool.execute(
        `SELECT
           m.provider_user_id AS user_id,
           m.membership_status,
           c.id AS class_id,
           c.class_name,
           c.status AS class_status,
           c.starts_at,
           c.ends_at
         FROM learning_class_provider_memberships m
         INNER JOIN learning_program_classes c ON c.id = m.learning_class_id
         WHERE c.organization_id = ?
           AND m.provider_user_id IN (${placeholders})
           AND m.membership_status IN ('active','completed')
         ORDER BY COALESCE(c.starts_at, c.created_at) DESC, c.id DESC`,
        [clubId, ...memberIds]
      );
      for (const row of seasonRows || []) {
        const uid = Number(row.user_id);
        if (!uid) continue;
        if (!seasonsByUser[uid]) seasonsByUser[uid] = [];
        seasonsByUser[uid].push({
          classId: Number(row.class_id),
          className: row.class_name || 'Season',
          membershipStatus: row.membership_status || null,
          classStatus: row.class_status || null,
          startsAt: row.starts_at || null,
          endsAt: row.ends_at || null
        });
      }
    }

    return res.json({
      members: members.map((m) => ({
        ...m,
        seasons: seasonsByUser[m.id] || []
      }))
    });
  } catch (e) { next(e); }
};

const normalizeNum = (v, digits = 1) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(digits));
};

const buildSeasonHistoryFallbackSummary = ({ firstName, seasonCount, totalMiles, totalPoints, totalWorkouts, bestSeason }) => {
  const name = String(firstName || 'This member').trim() || 'This member';
  const seasonText = seasonCount === 1 ? '1 season' : `${seasonCount} seasons`;
  const bestSeasonText = bestSeason
    ? `Top season: ${bestSeason.className} (${normalizeNum(bestSeason.totalMiles, 1)} miles, ${Math.round(bestSeason.totalPoints)} points).`
    : 'No completed workout data has been logged yet.';
  return `${name} has participated in ${seasonText} with ${normalizeNum(totalMiles, 1)} total miles, ${Math.round(totalPoints)} points, and ${Math.round(totalWorkouts)} logged workouts. ${bestSeasonText}`;
};

const buildRegistrationContextSummary = ({
  heardAboutClub,
  runningFitnessBackground,
  averageMilesPerWeek,
  averageHoursPerWeek,
  currentFitnessActivities
}) => {
  const parts = [];
  if (heardAboutClub) parts.push(`Heard about the club via ${heardAboutClub}.`);
  const load = [];
  if (averageMilesPerWeek != null) load.push(`${normalizeNum(averageMilesPerWeek, 1)} miles/week`);
  if (averageHoursPerWeek != null) load.push(`${normalizeNum(averageHoursPerWeek, 1)} hours/week`);
  if (load.length) parts.push(`Current training load is about ${load.join(' and ')}.`);
  if (runningFitnessBackground) parts.push(`Background: ${runningFitnessBackground}.`);
  if (currentFitnessActivities) parts.push(`Current activities: ${currentFitnessActivities}.`);
  return parts.join(' ').trim();
};

const canViewMemberSeasonHistoryAsCaptain = async ({ clubId, requesterUserId, targetUserId }) => {
  const cid = toInt(clubId);
  const requesterId = toInt(requesterUserId);
  const targetId = toInt(targetUserId);
  if (!cid || !requesterId || !targetId) return false;
  const [rows] = await pool.execute(
    `SELECT 1
     FROM challenge_teams t
     INNER JOIN learning_program_classes c
       ON c.id = t.learning_class_id
      AND c.organization_id = ?
     INNER JOIN challenge_team_members tm
       ON tm.team_id = t.id
      AND tm.provider_user_id = ?
     WHERE t.team_manager_user_id = ?
     LIMIT 1`,
    [cid, targetId, requesterId]
  );
  return Array.isArray(rows) && rows.length > 0;
};

const assertSeasonHistoryViewerAccess = async (req, res, clubId, targetUserId) => {
  const user = req.user;
  if (!user?.id) {
    res.status(401).json({ error: { message: 'Sign in required' } });
    return null;
  }
  const club = await resolveClub(clubId);
  if (!club) {
    res.status(404).json({ error: { message: 'Club not found' } });
    return null;
  }
  if (String(user.role || '').toLowerCase() === 'super_admin') return club;
  const agencies = await User.getAgencies(user.id);
  const isClubMember = (agencies || []).some((a) => Number(a?.id) === Number(clubId));
  if (isClubMember && await canUserManageClub({ user, clubId })) return club;
  if (isClubMember && await canViewMemberSeasonHistoryAsCaptain({ clubId, requesterUserId: user.id, targetUserId })) {
    return club;
  }
  res.status(403).json({ error: { message: 'Club manager or current team captain access required' } });
  return null;
};

/**
 * GET /summit-stats/clubs/:id/members/:userId/season-history
 * Manager — season participation history + registration profile + AI summary.
 */
export const getClubMemberSeasonHistory = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const userId = toInt(req.params.userId);
    const club = await assertSeasonHistoryViewerAccess(req, res, clubId, userId);
    if (!club) return;
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const [membershipRows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, ua.is_active
       FROM user_agencies ua
       INNER JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ? AND ua.user_id = ?
       LIMIT 1`,
      [clubId, userId]
    );
    const member = membershipRows?.[0];
    if (!member) return res.status(404).json({ error: { message: 'Member not found in this club' } });

    const [applicationRows] = await pool.execute(
      `SELECT first_name, last_name, email, phone, gender, date_of_birth, weight_lbs, height_inches, timezone,
              heard_about_club, running_fitness_background, average_miles_per_week, average_hours_per_week, current_fitness_activities,
              waiver_signature_name, waiver_agreed_at, waiver_version,
              custom_fields, status, reviewed_at, applied_at
       FROM challenge_member_applications
       WHERE agency_id = ? AND (user_id = ? OR LOWER(email) = LOWER(?))
       ORDER BY reviewed_at DESC, applied_at DESC, id DESC
       LIMIT 1`,
      [clubId, userId, String(member.email || '').trim().toLowerCase()]
    );
    const latestApplication = applicationRows?.[0] || null;

    const [participantRows] = await pool.execute(
      `SELECT p.gender, p.date_of_birth, p.weight_lbs, p.height_inches, p.updated_at
       FROM challenge_participant_profiles p
       INNER JOIN learning_program_classes c ON c.id = p.learning_class_id
       WHERE c.organization_id = ? AND p.provider_user_id = ?
       ORDER BY p.updated_at DESC, p.id DESC
       LIMIT 1`,
      [clubId, userId]
    );
    const latestParticipantProfile = participantRows?.[0] || null;

    const [seasonRows] = await pool.execute(
      `SELECT
         c.id AS class_id,
         c.class_name,
         c.status AS class_status,
         c.starts_at,
         c.ends_at,
         c.created_at,
         m.membership_status,
         MAX(t.team_name) AS team_name,
         COUNT(w.id) AS workout_count,
         COALESCE(SUM(w.distance_value), 0) AS total_miles,
         COALESCE(SUM(w.points), 0) AS total_points,
         COALESCE(SUM(w.duration_minutes), 0) AS total_minutes,
         COALESCE(SUM(w.calories_burned), 0) AS total_calories,
         SUM(CASE WHEN w.weekly_task_id IS NOT NULL THEN 1 ELSE 0 END) AS challenge_tag_count,
         SUM(CASE WHEN w.is_race = 1 THEN 1 ELSE 0 END) AS race_count,
         MAX(CASE
           WHEN LOWER(COALESCE(w.activity_type, '')) LIKE '%run%' THEN COALESCE(w.distance_value, 0)
           ELSE 0
         END) AS longest_run_miles,
         MIN(CASE
           WHEN LOWER(COALESCE(w.activity_type, '')) LIKE '%run%'
             AND COALESCE(w.distance_value, 0) >= 1
             AND COALESCE(w.duration_minutes, 0) > 0
           THEN (w.duration_minutes / NULLIF(w.distance_value, 0))
           ELSE NULL
         END) AS best_run_pace_min_per_mile,
         MAX(w.completed_at) AS last_workout_at
       FROM learning_class_provider_memberships m
       INNER JOIN learning_program_classes c ON c.id = m.learning_class_id
       LEFT JOIN challenge_teams t ON t.learning_class_id = c.id
       LEFT JOIN challenge_team_members tm
         ON tm.team_id = t.id AND tm.provider_user_id = m.provider_user_id
       LEFT JOIN challenge_workouts w
         ON w.learning_class_id = c.id
        AND w.user_id = m.provider_user_id
        AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
       WHERE c.organization_id = ?
         AND m.provider_user_id = ?
         AND m.membership_status IN ('active', 'completed')
       GROUP BY
         c.id, c.class_name, c.status, c.starts_at, c.ends_at, c.created_at, m.membership_status
       ORDER BY COALESCE(c.starts_at, c.created_at) DESC, c.id DESC`,
      [clubId, userId]
    );

    const seasons = (seasonRows || []).map((row) => ({
      classId: Number(row.class_id),
      className: row.class_name || `Season ${row.class_id}`,
      classStatus: row.class_status || null,
      membershipStatus: row.membership_status || null,
      teamName: row.team_name || null,
      teamId: null,
      isTeamCaptain: false,
      startsAt: row.starts_at || null,
      endsAt: row.ends_at || null,
      lastWorkoutAt: row.last_workout_at || null,
      workoutCount: Number(row.workout_count || 0),
      totalMiles: normalizeNum(row.total_miles, 1),
      totalPoints: Number(row.total_points || 0),
      totalMinutes: Number(row.total_minutes || 0),
      totalCalories: Number(row.total_calories || 0),
      challengeTagCount: Number(row.challenge_tag_count || 0),
      raceCount: Number(row.race_count || 0),
      longestRunMiles: normalizeNum(row.longest_run_miles, 1),
      bestRunPaceMinPerMile: row.best_run_pace_min_per_mile != null ? normalizeNum(row.best_run_pace_min_per_mile, 2) : null
    }));

    const classIdsForTeams = [...new Set(seasons.map((s) => s.classId).filter((id) => Number.isFinite(id) && id > 0))];
    if (classIdsForTeams.length) {
      const ph = classIdsForTeams.map(() => '?').join(',');
      const [teamRows] = await pool.execute(
        `SELECT t.learning_class_id, t.id AS team_id, t.team_name, t.team_manager_user_id
         FROM challenge_team_members tm
         INNER JOIN challenge_teams t ON t.id = tm.team_id
         WHERE tm.provider_user_id = ? AND t.learning_class_id IN (${ph})`,
        [userId, ...classIdsForTeams]
      );
      const teamByClass = new Map();
      for (const tr of teamRows || []) {
        teamByClass.set(Number(tr.learning_class_id), tr);
      }
      for (const s of seasons) {
        const tr = teamByClass.get(s.classId);
        s.teamId = tr ? Number(tr.team_id) : null;
        if (tr?.team_name) s.teamName = tr.team_name;
        s.isTeamCaptain = !!(tr && Number(tr.team_manager_user_id) === Number(userId));
      }
    }

    const totals = seasons.reduce((acc, s) => {
      acc.totalMiles += Number(s.totalMiles || 0);
      acc.totalPoints += Number(s.totalPoints || 0);
      acc.totalMinutes += Number(s.totalMinutes || 0);
      acc.totalCalories += Number(s.totalCalories || 0);
      acc.totalWorkouts += Number(s.workoutCount || 0);
      acc.totalChallengeTags += Number(s.challengeTagCount || 0);
      acc.totalRaces += Number(s.raceCount || 0);
      acc.bestRunPaceMinPerMile = acc.bestRunPaceMinPerMile == null
        ? s.bestRunPaceMinPerMile
        : (s.bestRunPaceMinPerMile == null ? acc.bestRunPaceMinPerMile : Math.min(acc.bestRunPaceMinPerMile, s.bestRunPaceMinPerMile));
      acc.longestRunMiles = Math.max(acc.longestRunMiles, Number(s.longestRunMiles || 0));
      return acc;
    }, {
      totalMiles: 0,
      totalPoints: 0,
      totalMinutes: 0,
      totalCalories: 0,
      totalWorkouts: 0,
      totalChallengeTags: 0,
      totalRaces: 0,
      bestRunPaceMinPerMile: null,
      longestRunMiles: 0
    });

    const bestSeason = seasons.length
      ? seasons.slice().sort((a, b) => (Number(b.totalPoints || 0) - Number(a.totalPoints || 0)) || (Number(b.totalMiles || 0) - Number(a.totalMiles || 0)))[0]
      : null;

    const profile = {
      firstName: latestApplication?.first_name || member.first_name || '',
      lastName: latestApplication?.last_name || member.last_name || '',
      email: latestApplication?.email || member.email || '',
      phone: latestApplication?.phone || null,
      gender: latestApplication?.gender || latestParticipantProfile?.gender || null,
      dateOfBirth: latestApplication?.date_of_birth || latestParticipantProfile?.date_of_birth || null,
      weightLbs: latestApplication?.weight_lbs != null ? Number(latestApplication.weight_lbs) : (latestParticipantProfile?.weight_lbs != null ? Number(latestParticipantProfile.weight_lbs) : null),
      heightInches: latestApplication?.height_inches != null ? Number(latestApplication.height_inches) : (latestParticipantProfile?.height_inches != null ? Number(latestParticipantProfile.height_inches) : null),
      timezone: latestApplication?.timezone || null,
      heardAboutClub: latestApplication?.heard_about_club || null,
      runningFitnessBackground: latestApplication?.running_fitness_background || null,
      averageMilesPerWeek: latestApplication?.average_miles_per_week != null ? Number(latestApplication.average_miles_per_week) : null,
      averageHoursPerWeek: latestApplication?.average_hours_per_week != null ? Number(latestApplication.average_hours_per_week) : null,
      currentFitnessActivities: latestApplication?.current_fitness_activities || null,
      waiverSignatureName: latestApplication?.waiver_signature_name || null,
      waiverAgreedAt: latestApplication?.waiver_agreed_at || null,
      waiverVersion: latestApplication?.waiver_version || null,
      customFields: (() => {
        const raw = latestApplication?.custom_fields;
        if (!raw) return {};
        if (typeof raw === 'object') return raw;
        try { return JSON.parse(raw); } catch { return {}; }
      })(),
      source: latestApplication ? 'member_application' : (latestParticipantProfile ? 'participant_profile' : 'user_profile')
    };

    let aiSummary = '';
    try {
      const prompt = [
        'You are writing a short coaching/performance summary for a club manager or team captain.',
        'Use concise plain English. Focus on training baseline, trends, consistency, strengths, and actionable next-season focus.',
        'Do not invent data. If data is missing, say so briefly.',
        'Keep this to 4-6 sentences and under 110 words.',
        '',
        `Member: ${profile.firstName || member.first_name || ''} ${profile.lastName || member.last_name || ''}`.trim(),
        `Application source / referral: ${profile.heardAboutClub || 'not provided'}`,
        `Running & fitness background: ${profile.runningFitnessBackground || 'not provided'}`,
        `Current weekly load: miles=${profile.averageMilesPerWeek == null ? 'n/a' : normalizeNum(profile.averageMilesPerWeek, 1)}, hours=${profile.averageHoursPerWeek == null ? 'n/a' : normalizeNum(profile.averageHoursPerWeek, 1)}`,
        `Current activities: ${profile.currentFitnessActivities || 'not provided'}`,
        `Seasons participated: ${seasons.length}`,
        `All-time totals: miles=${normalizeNum(totals.totalMiles, 1)}, points=${Math.round(totals.totalPoints)}, workouts=${Math.round(totals.totalWorkouts)}, challengeTags=${Math.round(totals.totalChallengeTags)}, races=${Math.round(totals.totalRaces)}`,
        `Longest run miles: ${normalizeNum(totals.longestRunMiles, 1)}`,
        `Best run pace min/mile: ${totals.bestRunPaceMinPerMile == null ? 'n/a' : normalizeNum(totals.bestRunPaceMinPerMile, 2)}`,
        `Best season: ${bestSeason ? `${bestSeason.className} (${normalizeNum(bestSeason.totalMiles, 1)} miles, ${Math.round(bestSeason.totalPoints)} points, ${Math.round(bestSeason.workoutCount)} workouts)` : 'n/a'}`,
        '',
        'Season details:',
        ...(seasons || []).slice(0, 8).map((s) =>
          `- ${s.className}: status=${s.classStatus || 'unknown'}, memberStatus=${s.membershipStatus || 'unknown'}, team=${s.teamName || 'n/a'}, miles=${normalizeNum(s.totalMiles, 1)}, points=${Math.round(s.totalPoints)}, workouts=${Math.round(s.workoutCount)}, races=${Math.round(s.raceCount)}, longestRun=${normalizeNum(s.longestRunMiles, 1)}, bestPace=${s.bestRunPaceMinPerMile == null ? 'n/a' : normalizeNum(s.bestRunPaceMinPerMile, 2)}`
        )
      ].join('\n');
      const ai = await callGeminiText({ prompt, temperature: 0.2, maxOutputTokens: 260 });
      aiSummary = String(ai?.text || '').trim();
    } catch {
      aiSummary = '';
    }
    if (!aiSummary) {
      const baseSummary = buildSeasonHistoryFallbackSummary({
        firstName: profile.firstName || member.first_name,
        seasonCount: seasons.length,
        totalMiles: totals.totalMiles,
        totalPoints: totals.totalPoints,
        totalWorkouts: totals.totalWorkouts,
        bestSeason
      });
      const registrationSummary = buildRegistrationContextSummary(profile);
      aiSummary = [baseSummary, registrationSummary].filter(Boolean).join(' ');
    }

    return res.json({
      member: {
        userId: Number(member.id),
        firstName: member.first_name || '',
        lastName: member.last_name || '',
        email: member.email || '',
        isActiveInClub: Number(member.is_active || 0) === 1
      },
      registrationProfile: profile,
      seasonHistory: {
        seasonCount: seasons.length,
        totals: {
          totalMiles: normalizeNum(totals.totalMiles, 1),
          totalPoints: Math.round(totals.totalPoints),
          totalMinutes: Math.round(totals.totalMinutes),
          totalCalories: Math.round(totals.totalCalories),
          totalWorkouts: Math.round(totals.totalWorkouts),
          totalChallengeTags: Math.round(totals.totalChallengeTags),
          totalRaces: Math.round(totals.totalRaces),
          longestRunMiles: normalizeNum(totals.longestRunMiles, 1),
          bestRunPaceMinPerMile: totals.bestRunPaceMinPerMile == null ? null : normalizeNum(totals.bestRunPaceMinPerMile, 2)
        },
        bestSeason: bestSeason || null,
        seasons
      },
      aiSummary
    });
  } catch (e) { next(e); }
};

/**
 * PUT /summit-stats/clubs/:id/members/:userId/profile
 * Manager — update basic account fields + role (provider | provider_plus only) for club members.
 */
export const putClubMemberProfile = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const targetUserId = toInt(req.params.userId);
    const club = await assertManagerAccess(req, res, clubId);
    if (!club) return;
    if (!targetUserId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const [membershipRows] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [targetUserId, clubId]
    );
    if (!membershipRows?.length) return res.status(404).json({ error: { message: 'Member not found in this club' } });

    const target = await User.findById(targetUserId);
    if (!target) return res.status(404).json({ error: { message: 'User not found' } });

    const currentRole = String(target.role || '').toLowerCase();
    const memberRoles = new Set(['provider', 'provider_plus']);
    if (!memberRoles.has(currentRole)) {
      return res.status(400).json({
        error: { message: 'Club member profile can only be edited for accounts with role Member or Assistant manager (provider / provider_plus).' }
      });
    }

    const body = req.body || {};
    const patch = {};
    if (body.firstName !== undefined) patch.firstName = String(body.firstName || '').trim();
    if (body.lastName !== undefined) patch.lastName = String(body.lastName || '').trim();
    if (body.email !== undefined) {
      const e = String(body.email || '').trim().toLowerCase();
      if (!e || !e.includes('@')) return res.status(400).json({ error: { message: 'Valid email required' } });
      patch.email = e;
    }
    if (body.personalPhone !== undefined) patch.personalPhone = String(body.personalPhone || '').trim() || null;
    if (body.role !== undefined) {
      const r = String(body.role || '').trim().toLowerCase();
      if (!['provider', 'provider_plus'].includes(r)) {
        return res.status(400).json({ error: { message: 'role must be provider (member) or provider_plus (assistant manager)' } });
      }
      patch.role = r;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: { message: 'No valid fields to update' } });
    }

    if (patch.email) {
      const existing = await User.findByEmail(patch.email);
      if (existing && Number(existing.id) !== Number(targetUserId)) {
        return res.status(409).json({ error: { message: 'That email is already in use' } });
      }
    }

    await User.update(targetUserId, patch);
    const updated = await User.findById(targetUserId);
    return res.json(updated);
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /summit-stats/clubs/:id/members/:userId/team-captain
 * Manager — assign or remove this user as team captain (season-scoped: challenge_teams.team_manager_user_id).
 */
export const putClubMemberTeamCaptain = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const targetUserId = toInt(req.params.userId);
    const club = await assertManagerAccess(req, res, clubId);
    if (!club) return;
    if (!targetUserId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const classId = toInt(req.body?.learningClassId ?? req.body?.classId);
    const teamId = toInt(req.body?.teamId);
    const assign = req.body?.assign !== false && req.body?.assign !== 0 && String(req.body?.assign || '').toLowerCase() !== 'false';

    if (!classId || !teamId) {
      return res.status(400).json({ error: { message: 'learningClassId and teamId are required' } });
    }

    const [membershipRows] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [targetUserId, clubId]
    );
    if (!membershipRows?.length) return res.status(404).json({ error: { message: 'Member not found in this club' } });

    const [teamRows] = await pool.execute(
      `SELECT t.id, t.learning_class_id, c.organization_id
       FROM challenge_teams t
       INNER JOIN learning_program_classes c ON c.id = t.learning_class_id
       WHERE t.id = ? AND t.learning_class_id = ? AND c.organization_id = ?
       LIMIT 1`,
      [teamId, classId, clubId]
    );
    const teamRow = teamRows?.[0];
    if (!teamRow) return res.status(404).json({ error: { message: 'Team not found for this club/season' } });

    const [memRows] = await pool.execute(
      `SELECT 1 FROM challenge_team_members WHERE team_id = ? AND provider_user_id = ? LIMIT 1`,
      [teamId, targetUserId]
    );
    if (!memRows?.length) {
      return res.status(400).json({ error: { message: 'User must be on this team to be team captain' } });
    }

    if (assign) {
      await pool.execute(
        `UPDATE challenge_teams SET team_manager_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [targetUserId, teamId]
      );
    } else {
      const [r2] = await pool.execute(
        `UPDATE challenge_teams SET team_manager_user_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND team_manager_user_id = ?`,
        [teamId, targetUserId]
      );
      if (!r2?.affectedRows) {
        return res.json({ ok: true, cleared: false, message: 'User was not team captain for this team' });
      }
    }

    return res.json({ ok: true, teamId, learningClassId: classId, isTeamCaptain: assign });
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /summit-stats/clubs/:id/members/:userId/status
 * Manager — set member active/inactive within this club.
 */
export const setClubMemberStatus = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const userId = toInt(req.params.userId);
    const club = await assertManagerAccess(req, res, clubId);
    if (!club) return;
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const isActive = req.body?.isActive === true || req.body?.isActive === 1 || String(req.body?.isActive || '').toLowerCase() === 'true';

    const [existing] = await pool.execute(
      `SELECT id FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [userId, clubId]
    );
    if (!existing?.[0]?.id) return res.status(404).json({ error: { message: 'Member not found in this club' } });

    await pool.execute(
      `UPDATE user_agencies SET is_active = ? WHERE user_id = ? AND agency_id = ?`,
      [isActive ? 1 : 0, userId, clubId]
    );
    return res.json({ ok: true, userId, clubId, isActive });
  } catch (e) { next(e); }
};

export const getMyDashboardSummary = async (req, res, next) => {
  try {
    const userId = toInt(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Sign in required' } });

    const [userRows] = await pool.execute(
      `SELECT id, email, first_name, last_name, role, status, timezone, created_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );
    const user = userRows?.[0];
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    const agencies = await User.getAgencies(userId);
    const clubs = (agencies || [])
      .filter((agency) => String(agency?.organization_type || agency?.organizationType || '').toLowerCase() === 'affiliation')
      .map((agency) => ({
        id: Number(agency.id),
        name: agency.name || '',
        slug: agency.slug || agency.portal_url || '',
        city: agency.city || null,
        state: agency.state || null,
        clubRole: agency.club_role || 'member',
        isActive: agency.is_active !== false && agency.is_active !== 0 && String(agency.is_active || '1') !== '0'
      }));

    const [applicationRows] = await pool.execute(
      `SELECT first_name, last_name, email, phone, gender, date_of_birth, weight_lbs, height_inches, timezone,
              heard_about_club, running_fitness_background, average_miles_per_week, average_hours_per_week,
              current_fitness_activities, waiver_signature_name, waiver_agreed_at, waiver_version, status, applied_at
       FROM challenge_member_applications
       WHERE user_id = ? OR LOWER(COALESCE(email, '')) = LOWER(?)
       ORDER BY applied_at DESC, id DESC
       LIMIT 1`,
      [userId, user.email || '']
    );
    const latestApplication = applicationRows?.[0] || null;

    const [statsRows] = await pool.execute(
      `SELECT
         COUNT(w.id) AS workout_count,
         COALESCE(SUM(w.points), 0) AS total_points,
         COALESCE(SUM(w.distance_value), 0) AS total_miles,
         COALESCE(SUM(w.duration_minutes), 0) AS total_minutes,
         MAX(CASE
           WHEN LOWER(COALESCE(w.activity_type, '')) LIKE '%run%'
           THEN COALESCE(w.distance_value, 0)
           ELSE 0
         END) AS longest_run_miles,
         MAX(COALESCE(w.points, 0)) AS best_workout_points,
         MAX(COALESCE(w.duration_minutes, 0)) AS longest_workout_minutes,
         MIN(CASE
           WHEN LOWER(COALESCE(w.activity_type, '')) LIKE '%run%'
             AND COALESCE(w.distance_value, 0) >= 1
             AND COALESCE(w.duration_minutes, 0) > 0
           THEN (w.duration_minutes / NULLIF(w.distance_value, 0))
           ELSE NULL
         END) AS best_run_pace_min_per_mile
       FROM challenge_workouts w
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       INNER JOIN agencies a ON a.id = c.organization_id
       WHERE w.user_id = ?
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'`,
      [userId]
    );
    const totals = statsRows?.[0] || {};

    const [seasonRows] = await pool.execute(
      `SELECT
         c.id AS class_id,
         c.class_name,
         c.status AS class_status,
         c.starts_at,
         c.ends_at,
         c.organization_id AS club_id,
         a.name AS club_name,
         a.slug AS club_slug,
         m.membership_status,
         MAX(t.team_name) AS team_name,
         COUNT(w.id) AS workout_count,
         COALESCE(SUM(w.distance_value), 0) AS total_miles,
         COALESCE(SUM(w.points), 0) AS total_points
       FROM learning_class_provider_memberships m
       INNER JOIN learning_program_classes c ON c.id = m.learning_class_id
       INNER JOIN agencies a ON a.id = c.organization_id
       LEFT JOIN challenge_teams t ON t.learning_class_id = c.id
       LEFT JOIN challenge_team_members tm
         ON tm.team_id = t.id
        AND tm.provider_user_id = m.provider_user_id
       LEFT JOIN challenge_workouts w
         ON w.learning_class_id = c.id
        AND w.user_id = m.provider_user_id
        AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
       WHERE m.provider_user_id = ?
         AND m.membership_status IN ('active', 'completed')
         AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'
       GROUP BY
         c.id, c.class_name, c.status, c.starts_at, c.ends_at, c.organization_id, a.name, a.slug, m.membership_status
       ORDER BY COALESCE(c.starts_at, c.created_at) DESC, c.id DESC`,
      [userId]
    );

    const now = Date.now();
    const seasons = (seasonRows || []).map((row) => {
      const startsAt = row.starts_at ? new Date(row.starts_at).getTime() : null;
      const endsAt = row.ends_at ? new Date(row.ends_at).getTime() : null;
      const status = String(row.class_status || '').toLowerCase();
      let bucket = 'past';
      if (status === 'active') bucket = 'current';
      else if ((status === 'draft' || status === 'scheduled') && startsAt && startsAt > now) bucket = 'upcoming';
      else if (endsAt && endsAt >= now && status !== 'closed' && status !== 'archived') bucket = 'current';
      return {
        classId: Number(row.class_id),
        className: row.class_name || `Season ${row.class_id}`,
        classStatus: row.class_status || null,
        startsAt: row.starts_at || null,
        endsAt: row.ends_at || null,
        clubId: Number(row.club_id),
        clubName: row.club_name || '',
        clubSlug: row.club_slug || '',
        membershipStatus: row.membership_status || null,
        teamName: row.team_name || null,
        workoutCount: Number(row.workout_count || 0),
        totalMiles: normalizeNum(row.total_miles, 1),
        totalPoints: Number(row.total_points || 0),
        bucket
      };
    });

    return res.json({
      member: {
        userId,
        email: user.email || '',
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        timezone: user.timezone || null,
        role: user.role || '',
        status: user.status || '',
        createdAt: user.created_at || null
      },
      memberships: clubs,
      pendingClubAccess: {
        hasClub: clubs.some((club) => club.isActive),
        managedClubCount: clubs.filter((club) => club.clubRole === 'manager' || club.clubRole === 'assistant_manager').length
      },
      stats: {
        totalWorkouts: Number(totals.workout_count || 0),
        totalPoints: Math.round(Number(totals.total_points || 0)),
        totalMiles: normalizeNum(totals.total_miles, 1),
        totalMinutes: Math.round(Number(totals.total_minutes || 0)),
        longestRunMiles: normalizeNum(totals.longest_run_miles, 1),
        bestWorkoutPoints: Math.round(Number(totals.best_workout_points || 0)),
        longestWorkoutMinutes: Math.round(Number(totals.longest_workout_minutes || 0)),
        bestRunPaceMinPerMile: totals.best_run_pace_min_per_mile == null ? null : normalizeNum(totals.best_run_pace_min_per_mile, 2)
      },
      seasons: {
        current: seasons.filter((season) => season.bucket === 'current' || season.bucket === 'upcoming'),
        past: seasons.filter((season) => season.bucket === 'past')
      },
      account: {
        billingPlan: 'Free account',
        billingStatus: 'active',
        heardAboutClub: latestApplication?.heard_about_club || null,
        runningFitnessBackground: latestApplication?.running_fitness_background || null,
        averageMilesPerWeek: latestApplication?.average_miles_per_week != null ? Number(latestApplication.average_miles_per_week) : null,
        averageHoursPerWeek: latestApplication?.average_hours_per_week != null ? Number(latestApplication.average_hours_per_week) : null,
        currentFitnessActivities: latestApplication?.current_fitness_activities || null,
        gender: latestApplication?.gender || null,
        dateOfBirth: latestApplication?.date_of_birth || null,
        weightLbs: latestApplication?.weight_lbs != null ? Number(latestApplication.weight_lbs) : null,
        heightInches: latestApplication?.height_inches != null ? Number(latestApplication.height_inches) : null,
        phone: latestApplication?.phone || null,
        latestApplicationStatus: latestApplication?.status || null
      }
    });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/my-applications
 * Authenticated — returns the signed-in user's club applications (all statuses).
 * Used to show a "your application is pending" notice after registration.
 */
export const getMyApplications = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Sign in required' } });

    const [rows] = await pool.execute(
      `SELECT cma.id, cma.status, cma.applied_at, cma.reviewed_at,
              a.id AS club_id, a.name AS club_name, a.logo_url, a.logo_path
       FROM challenge_member_applications cma
       JOIN agencies a ON a.id = cma.agency_id
       WHERE cma.user_id = ?
       ORDER BY cma.applied_at DESC
       LIMIT 20`,
      [userId]
    );

    const baseUrl = process.env.BACKEND_URL || '';
    const applications = (rows || []).map((r) => {
      let logoUrl = r.logo_url || null;
      if (r.logo_path) logoUrl = `${baseUrl}/uploads/${String(r.logo_path).replace(/^uploads\//, '')}`;
      return {
        id: Number(r.id),
        status: String(r.status || 'pending'),
        clubId: Number(r.club_id),
        clubName: r.club_name || '',
        logoUrl,
        appliedAt: r.applied_at || null,
        reviewedAt: r.reviewed_at || null
      };
    });

    return res.json({ applications });
  } catch (e) { next(e); }
};
