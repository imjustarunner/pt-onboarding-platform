/**
 * SSTC Member Application Pipeline
 * Handles: public-stats, invite-token resolution, application submission,
 * manager review (approve/deny), invite CRUD, and member referral links.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import Icon from '../models/Icon.model.js';
import ChallengeParticipantProfile from '../models/ChallengeParticipantProfile.model.js';
import EmailService from '../services/email.service.js';
import config from '../config/config.js';
import { verifyRecaptchaV3 } from '../services/captcha.service.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import { resolvePreferredSenderIdentityForAgency } from '../services/emailSenderIdentityResolver.service.js';
import { getPlatformAgencyId, getPlatformAgencyIds } from './summitStats.controller.js';
import { sqlAffiliationUnderSummitPlatform } from '../utils/summitPlatformClubs.js';
import { buildRaceDivisions, buildRecordMetricMap } from './challenges.controller.js';
import { callGeminiText } from '../services/geminiText.service.js';
import Notification from '../models/Notification.model.js';
import {
  canUserManageClub,
  formatClubManagerDisplayName,
  getPrimaryClubManager,
  getUserClubMembership,
  getClubPlatformTenantAgencyId,
  getClubManagerNotificationRecipientUserIds,
  getManagedClubsForUser
} from '../utils/sscClubAccess.js';
import { normalizeSplashImageUrl } from './agencyAnnouncements.controller.js';
import { getOrCreateTeamThread } from './chat.controller.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import StorageService from '../services/storage.service.js';
import multer from 'multer';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import {
  isSstcInviteOnlyMemberSignup,
  getActiveInviteForTokenAndClub,
  inviteEmailMatchesInviteRow
} from '../utils/sstcInviteOnly.js';
import { loadRetainedTotalsForClub } from '../utils/summitClubErasureRetainedTotals.js';

/** Multer for club feed image attachments (memory). */
export const clubFeedImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only PNG, JPEG, GIF, and WebP are allowed.'), false);
  }
});

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

const MAX_PUBLIC_SLUG_HISTORY = 20;

const omitPublicSlugHistory = (cfg) => {
  if (!cfg || typeof cfg !== 'object') return cfg;
  const { publicSlugHistory: _h, ...rest } = cfg;
  return rest;
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

/** Resolve club by current public slug or a prior slug kept in publicSlugHistory (after renames). */
const resolveClubByPublicSlug = async (publicSlug) => {
  const slug = normalizePublicSlug(publicSlug);
  if (!slug) return null;
  const [rows] = await pool.execute(
    `SELECT id, name, slug, logo_url, logo_path, organization_type, color_palette
     FROM agencies
     WHERE organization_type = 'affiliation'
       AND (
         LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(store_config_json, '$.publicPageConfig.publicSlug')), '')) = ?
         OR JSON_CONTAINS(
           COALESCE(JSON_EXTRACT(store_config_json, '$.publicPageConfig.publicSlugHistory'), JSON_ARRAY()),
           JSON_QUOTE(?),
           '$'
         )
       )
     LIMIT 1`,
    [slug, slug]
  );
  return rows?.[0] || null;
};

/** Resolve club from either numeric ID or public slug. */
const resolveClubByPublicRef = async (clubRef) => {
  const id = toInt(clubRef);
  if (id) return resolveClub(id);
  return resolveClubByPublicSlug(clubRef);
};

/**
 * Increment an invite's accepted-uses counter. When the invite reaches its
 * cap (or has no cap, i.e. legacy single-use), also stamp `used_at`.
 * Falls back to the legacy `used_at = NOW()` write when migration 715 has
 * not yet run on this environment.
 */
async function markInviteAccepted(inviteId) {
  if (!inviteId) return;
  try {
    await pool.execute(
      `UPDATE challenge_member_invites
       SET times_used = times_used + 1,
           used_at = CASE
             WHEN max_uses IS NULL OR (times_used + 1) >= max_uses THEN NOW()
             ELSE used_at
           END
       WHERE id = ?`,
      [inviteId]
    );
  } catch (e) {
    const tolerable = e?.code === 'ER_BAD_FIELD_ERROR' || String(e?.message || '').includes('Unknown column');
    if (!tolerable) throw e;
    await pool.execute('UPDATE challenge_member_invites SET used_at = NOW() WHERE id = ?', [inviteId]);
  }
}

/** Enrollment window for SSTC season join UI (open vs deadline passed → request-only). */
const computeJoinPhase = (row, now = new Date()) => {
  if (!row) return null;
  const opens = row.enrollment_opens_at ? new Date(row.enrollment_opens_at).getTime() : null;
  const closes = row.enrollment_closes_at ? new Date(row.enrollment_closes_at).getTime() : null;
  const nowMs = now.getTime();
  if (opens && nowMs < opens) return 'not_open';
  if (closes && nowMs > closes) return 'request_only';
  return 'open';
};

const mapSeasonRow = (row) => {
  if (!row) return null;
  const startsAt = row.starts_at || row.created_at || null;
  let daysUntilStart = null;
  if (startsAt) {
    const now = new Date();
    const startDate = new Date(startsAt);
    const millis = startDate.getTime() - now.getTime();
    daysUntilStart = millis <= 0 ? 0 : Math.ceil(millis / (1000 * 60 * 60 * 24));
  }
  return {
    id: Number(row.id),
    name: row.class_name || `Season ${row.id}`,
    description: String(row.description || '').trim() || null,
    status: String(row.status || '').toLowerCase() || null,
    startsAt,
    endsAt: row.ends_at || null,
    daysUntilStart,
    enrollmentOpensAt: row.enrollment_opens_at || null,
    enrollmentClosesAt: row.enrollment_closes_at || null,
    joinPhase: computeJoinPhase(row)
  };
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
const APPLICATION_WAIVER_VERSION = 'sstc_member_participation_waiver_v2';
const SSTC_RECAPTCHA_ACTION = 'sstc_club_application';
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
  const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').trim().replace(/\/$/, '');
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
    expectedAction: SSTC_RECAPTCHA_ACTION,
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

const issueUserEmailVerification = async ({ userId, email, firstName = '', portalSlug = 'sstc' }) => {
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
  const slug = String(portalSlug || 'sstc').trim().replace(/[^a-z0-9-]/gi, '') || 'sstc';
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
    console.error('SSTC applicant verification email failed:', error?.message || error);
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

const normalizeGenderToken = (v) => {
  if (v == null || v === '') return '';
  return String(v).trim().toLowerCase().replace(/\s+/g, '_');
};

const formatGenderDisplayLabel = (v) => {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

const ageFromDateOfBirth = (dob) => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age;
};

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
  const allowCustomPronouns = cfg.allowCustomPronouns === true || String(cfg.allowCustomPronouns || '').toLowerCase() === 'true';

  let publicSlugHistory = [];
  if (Array.isArray(cfg.publicSlugHistory)) {
    for (const s of cfg.publicSlugHistory) {
      const n = normalizePublicSlug(s);
      if (n) publicSlugHistory.push(n);
    }
  }
  publicSlugHistory = [...new Set(publicSlugHistory)].slice(0, MAX_PUBLIC_SLUG_HISTORY);

  return {
    publicSlug: normalizePublicSlug(cfg.publicSlug),
    publicSlugHistory,
    bannerTitle: String(cfg.bannerTitle || '').trim().slice(0, 120),
    bannerSubtitle: String(cfg.bannerSubtitle || '').trim().slice(0, 220),
    bannerImageUrl: String(cfg.bannerImageUrl || '').trim().slice(0, 500),
    showCurrentSeason: cfg.showCurrentSeason !== false,
    showActiveParticipants: cfg.showActiveParticipants !== false,
    showFeaturedWorkout: cfg.showFeaturedWorkout !== false,
    showPhotoAlbum: cfg.showPhotoAlbum !== false,
    showClubFeed: cfg.showClubFeed !== false,
    /** When true, members may mark club feed items as visible on the public club page. */
    publicFeedEnabled: cfg.publicFeedEnabled === true,
    albumSlides: slides,
    genderOptions,
    allowCustomPronouns
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

    try {
      const retained = await loadRetainedTotalsForClub(clubId);
      const a = retained.all || {};
      stats.total_miles = Number(stats.total_miles || 0) + Number(a.distance || 0);
      stats.total_points = Number(stats.total_points || 0) + Number(a.points || 0);
      stats.total_minutes = Number(stats.total_minutes || 0) + Number(a.durationMinutes || 0);
      stats.total_workouts = Number(stats.total_workouts || 0) + Number(a.workoutCount || 0);
    } catch (re) {
      if (re?.code !== 'ER_NO_SUCH_TABLE') throw re;
    }

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
    if (Array.isArray(clubRecords) && clubRecords.length) {
      try {
        const iconIds = Array.from(new Set(
          clubRecords
            .map((r) => Number(r?.iconId || 0))
            .filter((n) => Number.isFinite(n) && n > 0)
        ));
        const iconUrlById = new Map();
        if (iconIds.length) {
          const placeholders = iconIds.map(() => '?').join(', ');
          const [iconRows] = await pool.execute(
            `SELECT id, file_path
             FROM icons
             WHERE id IN (${placeholders})`,
            iconIds
          );
          for (const icon of iconRows || []) {
            iconUrlById.set(Number(icon.id), Icon.getIconUrl(icon));
          }
        }
        clubRecords = clubRecords.map((r) => {
          const iconId = Number(r?.iconId || 0);
          return {
            ...r,
            iconId: Number.isFinite(iconId) && iconId > 0 ? iconId : null,
            iconUrl: Number.isFinite(iconId) && iconId > 0 ? (iconUrlById.get(iconId) || null) : null
          };
        });
      } catch {
        clubRecords = clubRecords.map((r) => {
          const iconId = Number(r?.iconId || 0);
          return {
            ...r,
            iconId: Number.isFinite(iconId) && iconId > 0 ? iconId : null,
            iconUrl: null
          };
        });
      }
    }

    // Logo URL
    const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    let logoUrl = club.logo_url || null;
    if (club.logo_path) logoUrl = `${baseUrl}/uploads/${club.logo_path.replace(/^uploads\//, '')}`;
    const publicPageConfig = buildPublicPageConfig(clubRow?.[0]?.store_config_json);
    const publicPageConfigForClient = omitPublicSlugHistory(publicPageConfig);
    const publicStore = buildPublicStoreConfig(clubRow?.[0]?.store_config_json);

    let viewer = {
      isAuthenticated: false,
      isMember: false,
      clubRole: null,
      isManager: false,
      pendingApplication: null
    };
    if (req.user?.id) {
      viewer.isAuthenticated = true;
      const m = await getUserClubMembership(req.user.id, clubId);
      if (m && m.is_active !== false) {
        viewer.isMember = true;
        viewer.clubRole = m.club_role || 'member';
        const cr = String(m.club_role || '').toLowerCase();
        viewer.isManager = cr === 'manager' || cr === 'assistant_manager';
      } else {
        const userEmail = String(req.user?.email || '').trim().toLowerCase();
        const pendingParams = userEmail ? [clubId, req.user.id, userEmail] : [clubId, req.user.id];
        const pendingEmailClause = userEmail ? ' OR LOWER(TRIM(email)) = ?' : '';
        const [pendingRows] = await pool.execute(
          `SELECT id, status, applied_at
           FROM challenge_member_applications
           WHERE agency_id = ?
             AND status = 'pending'
             AND (user_id = ?${pendingEmailClause})
           ORDER BY applied_at DESC, id DESC
           LIMIT 1`,
          pendingParams
        );
        const pending = pendingRows?.[0];
        if (pending) {
          viewer.pendingApplication = {
            id: Number(pending.id),
            status: 'pending',
            appliedAt: pending.applied_at || null
          };
        }
      }
    }

    // Current season (active only)
    let currentSeason = null;
    const [seasonRows] = await pool.execute(
      `SELECT id, class_name, description, status, starts_at, ends_at, created_at,
              enrollment_opens_at, enrollment_closes_at
       FROM learning_program_classes
       WHERE organization_id = ?
         AND LOWER(COALESCE(status, '')) = 'active'
       ORDER BY COALESCE(starts_at, created_at) DESC, id DESC
       LIMIT 1`,
      [clubId]
    );
    const season = seasonRows?.[0] || null;
    if (season) {
      currentSeason = mapSeasonRow(season);
    }

    let upcomingSeason = null;
    const [upcomingRows] = await pool.execute(
      `SELECT id, class_name, description, status, starts_at, ends_at, created_at,
              enrollment_opens_at, enrollment_closes_at
       FROM learning_program_classes
       WHERE organization_id = ?
         AND LOWER(COALESCE(status, '')) NOT IN ('active', 'archived', 'cancelled')
         AND (starts_at IS NULL OR starts_at >= NOW())
       ORDER BY COALESCE(starts_at, created_at) ASC, id ASC
       LIMIT 1`,
      [clubId]
    );
    const nextSeason = upcomingRows?.[0] || null;
    if (nextSeason) {
      upcomingSeason = mapSeasonRow(nextSeason);
      if (currentSeason && upcomingSeason && Number(upcomingSeason.id) === Number(currentSeason.id)) {
        upcomingSeason = null;
      }
    }

    let viewerSeasonMemberships = {};
    let viewerPendingSeasonJoinRequest = null;
    if (req.user?.id && viewer.isMember) {
      const classIds = [currentSeason?.id, upcomingSeason?.id].filter((id) => id != null);
      const uniqueIds = [...new Set(classIds.map(Number))];
      if (uniqueIds.length) {
        const ph = uniqueIds.map(() => '?').join(',');
        const [memRows] = await pool.execute(
          `SELECT learning_class_id, membership_status
           FROM learning_class_provider_memberships
           WHERE provider_user_id = ? AND learning_class_id IN (${ph})`,
          [req.user.id, ...uniqueIds]
        );
        for (const r of memRows || []) {
          viewerSeasonMemberships[Number(r.learning_class_id)] = String(r.membership_status || '').toLowerCase();
        }
      }
      if (upcomingSeason?.id) {
        try {
          const [jrRows] = await pool.execute(
            `SELECT id, status FROM summit_stats_season_join_requests
             WHERE learning_class_id = ? AND user_id = ? AND status = 'pending'
             LIMIT 1`,
            [upcomingSeason.id, req.user.id]
          );
          const jr = jrRows?.[0];
          if (jr) {
            viewerPendingSeasonJoinRequest = { id: Number(jr.id), status: 'pending' };
          }
        } catch {
          viewerPendingSeasonJoinRequest = null;
        }
      }
    }

    let companyEventsPreview = [];
    try {
      const [evRows] = await pool.execute(
        `SELECT id, title, starts_at, ends_at
         FROM company_events
         WHERE agency_id = ?
           AND is_active = 1
           AND starts_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
         ORDER BY starts_at ASC
         LIMIT 8`,
        [clubId]
      );
      companyEventsPreview = (evRows || []).map((r) => ({
        id: Number(r.id),
        title: String(r.title || '').trim() || `Event ${r.id}`,
        startsAt: r.starts_at || null,
        endsAt: r.ends_at || null
      }));
    } catch {
      companyEventsPreview = [];
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
      // Public site: limited roster only (no user ids — names + optional team tooltip for display).
      activeParticipants = (activeRows || []).map((r) => ({
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
      viewer: {
        ...viewer,
        seasonMembershipByClassId: viewerSeasonMemberships,
        pendingSeasonJoinRequest: viewerPendingSeasonJoinRequest
      },
      companyEventsPreview,
      club: {
        id: club.id,
        name: club.name,
        slug: club.slug,
        publicSlug: publicPageConfig.publicSlug || null,
        canonicalClubRef: publicPageConfig.publicSlug || String(club.id),
        logoUrl,
        publicPageConfig: publicPageConfigForClient
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
      recaptcha: getSscRecaptchaConfig(),
      memberJoinRequiresInvite: isSstcInviteOnlyMemberSignup()
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
    return res.json({ config: omitPublicSlugHistory(config) });
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
    const prevCfg = buildPublicPageConfig(storeObj);
    const nextConfig = buildPublicPageConfig({
      publicPageConfig: {
        ...prevCfg,
        publicSlug: body.publicSlug,
        bannerTitle: body.bannerTitle,
        bannerSubtitle: body.bannerSubtitle,
        bannerImageUrl: body.bannerImageUrl,
        showCurrentSeason: body.showCurrentSeason,
        showActiveParticipants: body.showActiveParticipants,
        showFeaturedWorkout: body.showFeaturedWorkout,
        showPhotoAlbum: body.showPhotoAlbum,
        showClubFeed: body.showClubFeed,
        publicFeedEnabled: body.publicFeedEnabled,
        albumSlides: body.albumSlides,
        genderOptions: body.genderOptions,
        allowCustomPronouns: body.allowCustomPronouns
      }
    });
    const prevSlug = prevCfg.publicSlug || '';
    const newSlug = nextConfig.publicSlug || '';
    let history = Array.isArray(prevCfg.publicSlugHistory) ? [...prevCfg.publicSlugHistory] : [];
    if (prevSlug && normalizePublicSlug(prevSlug) !== newSlug) {
      const oldH = normalizePublicSlug(prevSlug);
      if (oldH && !history.includes(oldH)) history.unshift(oldH);
    }
    history = [...new Set(history.filter(Boolean))]
      .filter((h) => h !== newSlug)
      .slice(0, MAX_PUBLIC_SLUG_HISTORY);
    nextConfig.publicSlugHistory = history;

    if (nextConfig.publicSlug) {
      const [dupeRows] = await pool.execute(
        `SELECT id
         FROM agencies
         WHERE id <> ?
           AND organization_type = 'affiliation'
           AND (
             LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(store_config_json, '$.publicPageConfig.publicSlug')), '')) = ?
             OR JSON_CONTAINS(
               COALESCE(JSON_EXTRACT(store_config_json, '$.publicPageConfig.publicSlugHistory'), JSON_ARRAY()),
               JSON_QUOTE(?),
               '$'
             )
           )
         LIMIT 1`,
        [clubId, nextConfig.publicSlug, nextConfig.publicSlug]
      );
      if (Array.isArray(dupeRows) && dupeRows.length) {
        return res.status(409).json({ error: { message: 'That public URL slug is already in use or was used by another club.' } });
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
    return res.json({ ok: true, config: omitPublicSlugHistory(nextConfig) });
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

    let invite = null;
    try {
      const [rows] = await pool.execute(
        `SELECT i.*, a.name AS club_name, a.logo_url, a.logo_path, a.id AS club_id,
                c.id AS season_id, c.class_name AS season_name, c.starts_at AS season_starts_at,
                c.ends_at AS season_ends_at, c.status AS season_status,
                c.enrollment_opens_at AS season_enrollment_opens_at,
                c.enrollment_closes_at AS season_enrollment_closes_at
         FROM challenge_member_invites i
         JOIN agencies a ON a.id = i.agency_id
         LEFT JOIN learning_program_classes c ON c.id = i.learning_class_id
         WHERE i.token = ? AND i.is_active = 1 LIMIT 1`,
        [token]
      );
      invite = rows?.[0] || null;
    } catch (e) {
      const msg = String(e?.message || '');
      const tolerable = e?.code === 'ER_BAD_FIELD_ERROR' || msg.includes('Unknown column');
      if (!tolerable) throw e;
      const [rows] = await pool.execute(
        `SELECT i.*, a.name AS club_name, a.logo_url, a.logo_path, a.id AS club_id
         FROM challenge_member_invites i
         JOIN agencies a ON a.id = i.agency_id
         WHERE i.token = ? AND i.is_active = 1 LIMIT 1`,
        [token]
      );
      invite = rows?.[0] || null;
    }
    if (!invite) return res.status(404).json({ error: { message: 'Invite link not found or expired' } });
    const inviteMaxUses = invite.max_uses == null ? 1 : Number(invite.max_uses);
    const inviteTimesUsed = Number(invite.times_used || 0);
    const usedLegacy = inviteTimesUsed === 0 && invite.used_at && (invite.max_uses == null);
    const exhausted = (Number.isFinite(inviteMaxUses) && inviteMaxUses > 0 && inviteTimesUsed >= inviteMaxUses) || usedLegacy;
    if (exhausted) return res.status(410).json({ error: { message: 'This invite link has reached its limit' } });
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

    const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    let logoUrl = invite.logo_url || null;
    if (invite.logo_path) logoUrl = `${baseUrl}/uploads/${invite.logo_path.replace(/^uploads\//, '')}`;

    const seasonInfo = invite.season_id
      ? {
          id: Number(invite.season_id),
          name: String(invite.season_name || '').trim() || `Season ${invite.season_id}`,
          status: invite.season_status || null,
          startsAt: invite.season_starts_at || null,
          endsAt: invite.season_ends_at || null,
          enrollmentOpensAt: invite.season_enrollment_opens_at || null,
          enrollmentClosesAt: invite.season_enrollment_closes_at || null
        }
      : null;

    return res.json({
      invite: {
        clubId:        invite.agency_id,
        clubName:      invite.club_name,
        logoUrl,
        token:         invite.token,
        email:         invite.email || null,
        autoApprove:   !!invite.auto_approve,
        label:         invite.label || null,
        season:        seasonInfo,
        genderOptions: publicPageConfig.genderOptions,
        allowCustomPronouns: publicPageConfig.allowCustomPronouns === true,
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
  gender, pronouns, dateOfBirth, weightLbs, heightInches, timezone,
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
        gender, pronouns, date_of_birth, weight_lbs, height_inches, timezone,
        heard_about_club, running_fitness_background, average_miles_per_week, average_hours_per_week, current_fitness_activities,
        waiver_signature_name, waiver_agreed_at, waiver_version, waiver_ip_address, waiver_user_agent,
        custom_fields, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
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
      normalizeShortText(pronouns, 64),
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

const notifyClubManagersOfPendingMemberApplication = async ({
  clubId,
  applicationId,
  firstName,
  lastName,
  email
}) => {
  const applicantName = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim() || String(email || '').trim();
  let recipientIds = [];
  try {
    recipientIds = await getClubManagerNotificationRecipientUserIds(clubId);
  } catch (e) {
    console.error('notifyClubManagersOfPendingMemberApplication:', e);
    return;
  }
  if (!recipientIds.length) return;
  const title = `${applicantName} applied to join your club`;
  const message = `New member application is pending review. Applicant email: ${String(email || '').trim()}.`;
  for (const userId of recipientIds) {
    try {
      await Notification.create({
        type: 'sstc_club_member_application_pending',
        severity: 'info',
        title,
        message,
        userId,
        agencyId: clubId,
        relatedEntityType: 'challenge_member_application',
        relatedEntityId: applicationId
      });
    } catch (e) {
      console.error('notifyClubManagersOfPendingMemberApplication create:', e);
    }
  }
};

const notifyClubManagersOfInviteRequest = async ({
  clubId,
  requestId,
  firstName,
  lastName,
  email
}) => {
  const requesterLabel = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim() || String(email || '').trim();
  let recipientIds = [];
  try {
    recipientIds = await getClubManagerNotificationRecipientUserIds(clubId);
  } catch (e) {
    console.error('notifyClubManagersOfInviteRequest:', e);
    return;
  }
  if (!recipientIds.length) return;
  const title = `${requesterLabel} requested a club invitation`;
  const message = `Someone asked to join via the app without an invite link. Email: ${String(email || '').trim()}. Create and send them an invite when you are ready.`;
  for (const userId of recipientIds) {
    try {
      await Notification.create({
        type: 'sstc_club_invite_request',
        severity: 'info',
        title,
        message,
        userId,
        agencyId: clubId,
        relatedEntityType: 'summit_stats_invite_request',
        relatedEntityId: requestId
      });
    } catch (e) {
      console.error('notifyClubManagersOfInviteRequest create:', e);
    }
  }
};

/**
 * POST /summit-stats/clubs/:id/request-invite
 * Public — when invite-only mode is on, lets store users ask club managers for an invitation.
 */
export const requestMemberInvite = async (req, res, next) => {
  try {
    if (!isSstcInviteOnlyMemberSignup()) {
      return res.status(404).json({ error: { message: 'Not available' } });
    }

    const clubId = toInt(req.params.id);
    const club = await resolveClub(clubId);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });

    const { firstName, lastName, email, message } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: { message: 'First and last name are required' } });
    }
    if (!email) {
      return res.status(400).json({ error: { message: 'Email is required' } });
    }

    const captchaResult = await verifySscApplicationCaptcha(req);
    if (!captchaResult.ok) {
      return res.status(captchaResult.status || 400).json({ error: { message: captchaResult.message } });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const msg = normalizeLongText(message, 2000);

    const existingUser = await User.findByEmail(normalizedEmail);
    if (existingUser?.id) {
      const agencies = await User.getAgencies(existingUser.id);
      const alreadyMember = (agencies || []).some((a) => Number(a?.id) === Number(clubId));
      if (alreadyMember) {
        return res.status(409).json({ error: { message: 'This email is already a member of this club' } });
      }
    }

    const [dupRows] = await pool.execute(
      `SELECT id FROM summit_stats_invite_requests
       WHERE agency_id = ? AND LOWER(TRIM(email)) = ? AND status = 'pending'
         AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
       LIMIT 1`,
      [clubId, normalizedEmail]
    );
    if (dupRows?.length) {
      return res.status(429).json({
        error: {
          message: 'You already have a pending invitation request for this club. Please wait for the club manager to respond.'
        }
      });
    }

    const [insertResult] = await pool.execute(
      `INSERT INTO summit_stats_invite_requests
        (agency_id, first_name, last_name, email, message, status, request_ip, user_agent)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        clubId,
        String(firstName || '').trim().slice(0, 100),
        String(lastName || '').trim().slice(0, 100),
        normalizedEmail,
        msg,
        getRequestIp(req),
        normalizeShortText(req.get('user-agent'), 255)
      ]
    );
    const requestId = insertResult.insertId;

    await notifyClubManagersOfInviteRequest({
      clubId,
      requestId,
      firstName,
      lastName,
      email: normalizedEmail
    });

    return res.status(201).json({
      ok: true,
      message:
        'Your request was sent. When a club manager sends you an invitation, open that link (from email or text) to finish signing up.'
    });
  } catch (e) {
    next(e);
  }
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
  const platformAgencyId = await getClubPlatformTenantAgencyId(clubId);
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
    const platformAgencyId = await getClubPlatformTenantAgencyId(clubId);
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
 *         weightLbs?, heightInches?, timezone?, customFields?, referralCode?, inviteToken? }
 * When SSTC_INVITE_ONLY_MEMBER_SIGNUP is set, inviteToken is required and must match this club.
 */
export const submitApplication = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club   = await resolveClub(clubId);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });

    const {
      firstName, lastName, email, phone, username,
      password,
      gender, pronouns, dateOfBirth, weightLbs, heightInches, timezone,
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

    const normalizedEmail = String(email).trim().toLowerCase();

    let inviteForApply = null;
    if (isSstcInviteOnlyMemberSignup()) {
      const token = String(req.body?.inviteToken || '').trim();
      if (!token) {
        return res.status(403).json({
          error: {
            message: 'A club invitation link is required to apply. Ask your club leader for an invite.',
            code: 'INVITE_REQUIRED'
          }
        });
      }
      inviteForApply = await getActiveInviteForTokenAndClub(token, clubId);
      if (!inviteForApply) {
        return res.status(403).json({
          error: {
            message: 'That invite is invalid, expired, or already used. Ask your club for a new link.',
            code: 'INVITE_INVALID'
          }
        });
      }
      if (!inviteEmailMatchesInviteRow(inviteForApply, normalizedEmail)) {
        return res.status(400).json({
          error: {
            message:
              'This invite was issued for a different email address. Use the email your club sent the invite to, or ask for a new invite.'
          }
        });
      }
    }

    const existingApplication = await findLatestApplicationForClubEmail({ clubId, email: normalizedEmail });
    if (existingApplication?.status === 'approved') {
      return res.status(409).json({ error: { message: 'An account with this email is already a member of this club' } });
    }
    if (existingApplication?.status === 'pending') {
      return res.status(409).json({ error: { message: 'An application for this email is already pending review' } });
    }
    const [clubConfigRows] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );
    const clubPublicConfig = buildPublicPageConfig(clubConfigRows?.[0]?.store_config_json);
    const normalizedPronouns = clubPublicConfig.allowCustomPronouns === true ? normalizeShortText(pronouns, 64) : null;
    const existingUser = await User.findByEmail(normalizedEmail);
    let existingUserAgencies = [];
    if (existingUser?.id) {
      existingUserAgencies = await User.getAgencies(existingUser.id);
      const alreadyMember = existingUserAgencies.some((a) => Number(a?.id) === Number(clubId));
      if (alreadyMember) {
        return res.status(409).json({ error: { message: 'This account is already a member of this club' } });
      }
    } else if (!password || String(password).length < 6) {
      return res.status(400).json({ error: { message: 'Password must be at least 6 characters' } });
    } else if (String(password).length > 128) {
      return res.status(400).json({ error: { message: 'Password must be no more than 128 characters' } });
    } else if (!/[a-zA-Z]/.test(String(password))) {
      return res.status(400).json({ error: { message: 'Password must contain at least one letter (a–z or A–Z)' } });
    }

    const { userId, isNew } = existingUser
      ? { userId: Number(existingUser.id), isNew: false }
      : await createUserForApplication({ firstName, lastName, email: normalizedEmail, phone, username, password });

    await ensureUserInPlatformTenantForClub(userId, clubId, existingUserAgencies);
    const verification = { required: false, verificationSent: false, verifyUrl: null };

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
      clubId,
      inviteId: inviteForApply?.id ?? null,
      referrerUserId,
      userId,
      firstName, lastName, email: normalizedEmail, phone, username,
      gender, pronouns: normalizedPronouns, dateOfBirth, weightLbs, heightInches, timezone,
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

    if (inviteForApply) {
      await markInviteAccepted(inviteForApply.id);
      if (inviteForApply.auto_approve && !verification.required) {
        await _approveApplication(appId, null, 'Auto-approved via invite link');
        if (inviteForApply.learning_class_id) {
          try {
            await LearningProgramClass.addProviderMember({
              classId: Number(inviteForApply.learning_class_id),
              providerUserId: userId,
              membershipStatus: 'active',
              roleLabel: null,
              notes: 'Auto-enrolled via season invite link',
              actorUserId: null
            });
          } catch (enrollErr) {
            console.warn('[invite] season auto-enroll failed', enrollErr?.message || enrollErr);
          }
        }
        return res.status(201).json({
          ok: true,
          applicationId: appId,
          verificationRequired: !!verification.required,
          verificationSent: !!verification.verificationSent,
          verifyUrl: verification.verifyUrl || null,
          seasonId: inviteForApply.learning_class_id ? Number(inviteForApply.learning_class_id) : null,
          message: verification.required
            ? 'Application submitted and club access is ready once you verify your email.'
            : (inviteForApply.learning_class_id
                ? 'Welcome! You have been added to the club and season automatically.'
                : 'Welcome! You have been added to the club automatically.')
        });
      }
    }

    await notifyClubManagersOfPendingMemberApplication({
      clubId,
      applicationId: appId,
      firstName,
      lastName,
      email: normalizedEmail
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
    {
      const maxUses = invite.max_uses == null ? 1 : Number(invite.max_uses);
      const timesUsed = Number(invite.times_used || 0);
      const usedLegacy = timesUsed === 0 && invite.used_at && (invite.max_uses == null);
      const exhausted = (Number.isFinite(maxUses) && maxUses > 0 && timesUsed >= maxUses) || usedLegacy;
      if (exhausted) return res.status(410).json({ error: { message: 'This invite has reached its limit' } });
    }
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: { message: 'This invite has expired' } });
    }

    const clubId = toInt(invite.agency_id);
    const club   = await resolveClub(clubId);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });

    const {
      firstName, lastName, email, phone, username,
      password,
      gender, pronouns, dateOfBirth, weightLbs, heightInches, timezone,
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
    const [clubConfigRows] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );
    const clubPublicConfig = buildPublicPageConfig(clubConfigRows?.[0]?.store_config_json);
    const normalizedPronouns = clubPublicConfig.allowCustomPronouns === true ? normalizeShortText(pronouns, 64) : null;
    const existingUser = await User.findByEmail(normalizedEmail);
    let existingUserAgencies = [];
    if (existingUser?.id) {
      existingUserAgencies = await User.getAgencies(existingUser.id);
      const alreadyMember = existingUserAgencies.some((a) => Number(a?.id) === Number(clubId));
      if (alreadyMember) {
        return res.status(409).json({ error: { message: 'This account is already a member of this club' } });
      }
    } else if (!password || String(password).length < 6) {
      return res.status(400).json({ error: { message: 'Password must be at least 6 characters' } });
    } else if (String(password).length > 128) {
      return res.status(400).json({ error: { message: 'Password must be no more than 128 characters' } });
    } else if (!/[a-zA-Z]/.test(String(password))) {
      return res.status(400).json({ error: { message: 'Password must contain at least one letter (a–z or A–Z)' } });
    }

    const { userId, isNew } = existingUser
      ? { userId: Number(existingUser.id), isNew: false }
      : await createUserForApplication({ firstName, lastName, email: normalizedEmail, phone, username, password });

    await ensureUserInPlatformTenantForClub(userId, clubId, existingUserAgencies);
    const verification = { required: false, verificationSent: false, verifyUrl: null };

    const appId = await createApplicationRow({
      clubId, inviteId: invite.id, userId,
      firstName, lastName, email: normalizedEmail, phone, username,
      gender, pronouns: normalizedPronouns, dateOfBirth, weightLbs, heightInches, timezone,
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

    await markInviteAccepted(invite.id);

    // Auto-approve if the invite flag is set
    if (invite.auto_approve && !verification.required) {
      await _approveApplication(appId, null /* no manager */, 'Auto-approved via invite link');
      // Season fast-track: if the invite was scoped to a season, drop the
      // brand-new member straight into it so they land on the season feed.
      if (invite.learning_class_id) {
        try {
          await LearningProgramClass.addProviderMember({
            classId: Number(invite.learning_class_id),
            providerUserId: userId,
            membershipStatus: 'active',
            roleLabel: null,
            notes: 'Auto-enrolled via season invite link',
            actorUserId: null
          });
        } catch (enrollErr) {
          console.warn('[invite] season auto-enroll failed', enrollErr?.message || enrollErr);
        }
      }
      return res.status(201).json({
        ok: true, applicationId: appId,
        verificationRequired: !!verification.required,
        verificationSent: !!verification.verificationSent,
        verifyUrl: verification.verifyUrl || null,
        seasonId: invite.learning_class_id ? Number(invite.learning_class_id) : null,
        message: verification.required
          ? 'Application submitted and club access is ready once you verify your email.'
          : (invite.learning_class_id
              ? 'Welcome! You have been added to the club and season automatically.'
              : 'Welcome! You have been added to the club automatically.')
      });
    }

    await notifyClubManagersOfPendingMemberApplication({
      clubId,
      applicationId: appId,
      firstName,
      lastName,
      email: normalizedEmail
    });

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

  // Season fast-track: if this application originated from a season-scoped
  // invite, drop the (now-approved) member straight into that season too so
  // they don't have to find/join it manually.
  if (app.invite_id) {
    try {
      const [invRows] = await pool.execute(
        `SELECT learning_class_id FROM challenge_member_invites WHERE id = ? LIMIT 1`,
        [app.invite_id]
      );
      const seasonId = Number(invRows?.[0]?.learning_class_id || 0);
      if (seasonId) {
        await LearningProgramClass.addProviderMember({
          classId: seasonId,
          providerUserId: userId,
          membershipStatus: 'active',
          roleLabel: null,
          notes: 'Auto-enrolled via season invite link (manager approval)',
          actorUserId: reviewedByUserId || null
        });
      }
    } catch (enrollErr) {
      const msg = String(enrollErr?.message || '');
      const tolerable = enrollErr?.code === 'ER_BAD_FIELD_ERROR' || msg.includes('Unknown column');
      if (!tolerable) console.warn('[invite] season auto-enroll on approval failed', msg || enrollErr);
    }
  }

  return { userId };
};

/**
 * Club applicant ↔ manager direct thread (Summit platform `agency_id` + `organization_id` = club).
 * Returns unread count for the viewing manager and last message preview for the inline applications UI.
 */
async function getApplicantManagerThreadEnrichment({ platformAgencyId, clubId, managerUserId, applicantUserId }) {
  const empty = {
    applicant_chat_thread_id: null,
    applicant_chat_agency_id: null,
    applicant_chat_unread_count: 0,
    applicant_chat_last_preview: null
  };
  const pid = Number(platformAgencyId);
  const cid = Number(clubId);
  const mid = Number(managerUserId);
  const aid = Number(applicantUserId);
  if (!pid || !cid || !mid || !aid || aid === mid) return empty;

  const [threadRows] = await pool.execute(
    `SELECT t.id AS thread_id
     FROM chat_threads t
     INNER JOIN chat_thread_participants tp1 ON tp1.thread_id = t.id AND tp1.user_id = ?
     INNER JOIN chat_thread_participants tp2 ON tp2.thread_id = t.id AND tp2.user_id = ?
     WHERE t.agency_id = ?
       AND (t.organization_id <=> ?)
       AND t.thread_type = 'direct'
     LIMIT 1`,
    [mid, aid, pid, cid]
  );
  const threadId = Number(threadRows?.[0]?.thread_id || 0) || null;
  if (!threadId) return empty;

  const [readRows] = await pool.execute(
    `SELECT last_read_message_id FROM chat_thread_reads WHERE thread_id = ? AND user_id = ? LIMIT 1`,
    [threadId, mid]
  );
  const lr = readRows?.[0]?.last_read_message_id != null ? Number(readRows[0].last_read_message_id) : null;

  const [unreadRows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM chat_messages m2
     WHERE m2.thread_id = ?
       AND ((? IS NULL) OR (m2.id > ?))
       AND m2.sender_user_id <> ?
       AND NOT EXISTS (
         SELECT 1 FROM chat_message_deletes d2
         WHERE d2.user_id = ? AND d2.message_id = m2.id
       )`,
    [threadId, lr, lr, mid, mid]
  );
  const unread = Number(unreadRows?.[0]?.cnt || 0);

  const [lmRows] = await pool.execute(
    `SELECT m.body
     FROM chat_messages m
     LEFT JOIN chat_message_deletes d ON d.message_id = m.id AND d.user_id = ?
     WHERE m.thread_id = ? AND d.message_id IS NULL
     ORDER BY m.id DESC
     LIMIT 1`,
    [mid, threadId]
  );
  const lastBody = lmRows?.[0]?.body != null ? String(lmRows[0].body).trim() : '';
  const preview = lastBody.length > 140 ? `${lastBody.slice(0, 137)}…` : lastBody;

  return {
    applicant_chat_thread_id: threadId,
    applicant_chat_agency_id: pid,
    applicant_chat_unread_count: unread,
    applicant_chat_last_preview: preview || null
  };
}

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
              rb.first_name AS reviewed_by_first, rb.last_name AS reviewed_by_last,
              u_applicant.profile_photo_path AS applicant_profile_photo_path
       FROM challenge_member_applications a
       LEFT JOIN users ru ON ru.id = a.referrer_user_id
       LEFT JOIN challenge_member_invites i ON i.id = a.invite_id
       LEFT JOIN users rb ON rb.id = a.reviewed_by
       LEFT JOIN users u_applicant ON u_applicant.id = a.user_id
       WHERE a.agency_id = ? ${whereStatus}
       ORDER BY a.applied_at DESC`,
      params
    );

    const baseChat = {
      applicant_chat_thread_id: null,
      applicant_chat_agency_id: null,
      applicant_chat_unread_count: 0,
      applicant_chat_last_preview: null
    };
    let applications = (rows || []).map((row) => {
      const { applicant_profile_photo_path, ...rest } = row;
      return {
        ...rest,
        applicant_photo_url: publicUploadsUrlFromStoredPath(applicant_profile_photo_path || null) || null,
        ...baseChat
      };
    });

    const managerUserId = req.user?.id;
    const platformAgencyId = await getPlatformAgencyId();
    if (platformAgencyId && managerUserId && applications.length) {
      applications = await Promise.all(
        applications.map(async (row) => {
          const uid = row.user_id != null ? Number(row.user_id) : null;
          if (!uid) return row;
          const extra = await getApplicantManagerThreadEnrichment({
            platformAgencyId,
            clubId,
            managerUserId,
            applicantUserId: uid
          });
          return { ...row, ...extra };
        })
      );
    }

    return res.json({ applications });
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
 * GET /summit-stats/clubs/:id/invitable-seasons
 * Manager — list seasons that an invite link can be scoped to (current and
 * upcoming, excluding archived/cancelled). Used to populate the season
 * picker on the create-invite form.
 */
export const listInvitableSeasons = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club   = await assertManagerAccess(req, res, clubId);
    if (!club) return;

    const [rows] = await pool.execute(
      `SELECT id, class_name, status, starts_at, ends_at,
              enrollment_opens_at, enrollment_closes_at
       FROM learning_program_classes
       WHERE organization_id = ?
         AND LOWER(COALESCE(status, '')) NOT IN ('archived', 'cancelled')
         AND (ends_at IS NULL OR ends_at >= NOW() - INTERVAL 1 DAY)
       ORDER BY COALESCE(starts_at, created_at) ASC, id ASC`,
      [clubId]
    );

    const seasons = (rows || []).map((row) => ({
      id: Number(row.id),
      name: String(row.class_name || '').trim() || `Season ${row.id}`,
      status: row.status || null,
      startsAt: row.starts_at || null,
      endsAt: row.ends_at || null,
      enrollmentOpensAt: row.enrollment_opens_at || null,
      enrollmentClosesAt: row.enrollment_closes_at || null,
      joinPhase: computeJoinPhase(row)
    }));

    return res.json({ seasons });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/:id/invites
 * Manager — create an invite token.
 * Body: { email?, label?, autoApprove?, expiresAt?, learningClassId?, maxUses? }
 *
 * When `learningClassId` is set, the invite acts as a "season fast-track":
 * accepting it adds the recruit to the club AND drops them straight into
 * that season as an active member.
 */
export const createInvite = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club   = await assertManagerAccess(req, res, clubId);
    if (!club) return;

    const { email, label, autoApprove, expiresAt, learningClassId, maxUses } = req.body;
    const token = genToken(32);

    // Validate optional season scope: must belong to this club.
    let learningClassIdValue = null;
    if (learningClassId !== undefined && learningClassId !== null && learningClassId !== '') {
      const lcId = toInt(learningClassId);
      if (!lcId) return res.status(400).json({ error: { message: 'Invalid season id' } });
      const klass = await LearningProgramClass.findById(lcId);
      if (!klass || Number(klass.organization_id) !== Number(clubId)) {
        return res.status(400).json({ error: { message: 'That season does not belong to this club' } });
      }
      const statusLower = String(klass.status || '').toLowerCase();
      if (['archived', 'cancelled'].includes(statusLower)) {
        return res.status(400).json({ error: { message: 'Cannot create an invite for an archived or cancelled season' } });
      }
      learningClassIdValue = lcId;
    }

    // Optional max_uses cap. Anything <=0 or unparseable becomes unlimited (NULL).
    let maxUsesValue = null;
    if (maxUses !== undefined && maxUses !== null && maxUses !== '') {
      const mu = Number(maxUses);
      if (Number.isFinite(mu) && mu > 0) maxUsesValue = Math.floor(mu);
    }

    let insertResult;
    try {
      [insertResult] = await pool.execute(
        `INSERT INTO challenge_member_invites
           (agency_id, learning_class_id, created_by, token, email, label, auto_approve, max_uses, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          clubId,
          learningClassIdValue,
          req.user.id,
          token,
          email ? String(email).trim().toLowerCase() : null,
          label ? String(label).trim() : null,
          autoApprove ? 1 : 0,
          maxUsesValue,
          expiresAt || null
        ]
      );
    } catch (e) {
      // Fallback for environments where migration 715 has not run yet:
      // store the invite without the new columns so club managers can still
      // create classic single-use, club-only invite links.
      const msg = String(e?.message || '');
      const tolerable = e?.code === 'ER_BAD_FIELD_ERROR' || msg.includes('Unknown column');
      if (!tolerable) throw e;
      [insertResult] = await pool.execute(
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
      learningClassIdValue = null;
      maxUsesValue = null;
    }

    const baseUrl = process.env.FRONTEND_URL || process.env.VITE_APP_URL || '';
    const joinUrl = `${baseUrl}/sstc/join?invite=${token}`;

    return res.status(201).json({
      ok: true,
      inviteId: insertResult?.insertId || null,
      token,
      joinUrl,
      learningClassId: learningClassIdValue,
      maxUses: maxUsesValue
    });
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

    let rows = [];
    try {
      const [r] = await pool.execute(
        `SELECT i.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name,
                c.class_name AS season_name
         FROM challenge_member_invites i
         LEFT JOIN users u ON u.id = i.created_by
         LEFT JOIN learning_program_classes c ON c.id = i.learning_class_id
         WHERE i.agency_id = ? AND i.is_active = 1
         ORDER BY i.created_at DESC`,
        [clubId]
      );
      rows = r || [];
    } catch (e) {
      const msg = String(e?.message || '');
      const tolerable = e?.code === 'ER_BAD_FIELD_ERROR' || msg.includes('Unknown column');
      if (!tolerable) throw e;
      const [r] = await pool.execute(
        `SELECT i.*, CONCAT(u.first_name, ' ', u.last_name) AS created_by_name
         FROM challenge_member_invites i
         LEFT JOIN users u ON u.id = i.created_by
         WHERE i.agency_id = ? AND i.is_active = 1
         ORDER BY i.created_at DESC`,
        [clubId]
      );
      rows = (r || []).map((row) => ({ ...row, season_name: null }));
    }

    const baseUrl = process.env.FRONTEND_URL || process.env.VITE_APP_URL || '';
    const invites = rows.map(inv => {
      const maxUses = inv.max_uses == null ? null : Number(inv.max_uses);
      const timesUsed = Number(inv.times_used || 0);
      // Legacy invite rows that pre-date migration 715 only track used_at.
      // Treat them as single-use so they still display correctly in the UI.
      const effectiveMaxUses = maxUses == null && inv.used_at && timesUsed === 0 ? 1 : maxUses;
      const effectiveTimesUsed = timesUsed === 0 && inv.used_at ? 1 : timesUsed;
      const exhausted = effectiveMaxUses != null && effectiveTimesUsed >= effectiveMaxUses;
      return {
        ...inv,
        joinUrl: `${baseUrl}/sstc/join?invite=${inv.token}`,
        max_uses: effectiveMaxUses,
        times_used: effectiveTimesUsed,
        exhausted
      };
    });

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
    const joinUrl = `${baseUrl}/sstc/join?ref=${code}`;

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

const mapClubFeedPostRows = (rows, opts = {}) => {
  const defaultRead = opts.defaultRead === true;
  return (rows || []).map((m) => {
    const role = String(m.club_role || 'member').toLowerCase();
    const isManagerPost = role === 'manager' || role === 'assistant_manager';
    let attachments = [];
    try {
      const raw = m.attachments_json;
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(arr)) {
        attachments = arr
          .map((a) => ({
            type: a.type || 'image',
            url: publicUploadsUrlFromStoredPath(a.path || '')
          }))
          .filter((a) => a.url);
      }
    } catch {
      attachments = [];
    }
    const uid = m.user_id != null ? Number(m.user_id) : null;
    const profilePhotoUrl = publicUploadsUrlFromStoredPath(m.profile_photo_path || null) || null;
    let isRead = defaultRead;
    if (!defaultRead && m.is_read !== undefined && m.is_read !== null) {
      isRead = m.is_read === 1 || m.is_read === true || Number(m.is_read) === 1;
    }
    return {
      type: isManagerPost ? 'announcement' : 'member_message',
      source: 'club',
      id: `cfp-${m.id}`,
      clubPostId: Number(m.id),
      userId: Number.isFinite(uid) && uid > 0 ? uid : null,
      profilePhotoUrl,
      isRead,
      name: `${m.first_name || ''} ${m.last_name || ''}`.trim(),
      text: m.message_text,
      attachments,
      seasonName: null,
      visibility: m.visibility === 'public' ? 'public' : 'club',
      timestamp: m.created_at
    };
  });
};

/**
 * Club feed posts for a viewer: all unread (non-own) first, then up to 5 most recent read
 * (includes own posts in the read slice).
 */
const fetchClubFeedPostsForViewer = async (clubId, viewerId) => {
  const cid = Number(clubId);
  const vid = Number(viewerId);
  if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(vid) || vid <= 0) {
    return [];
  }

  const [unreadRows] = await pool.execute(
    `SELECT cfp.id, cfp.message_text, cfp.attachments_json, cfp.visibility, cfp.created_at,
            cfp.user_id, u.first_name, u.last_name, u.profile_photo_path,
            COALESCE(ua.club_role, 'member') AS club_role,
            0 AS is_read
     FROM club_feed_posts cfp
     INNER JOIN users u ON u.id = cfp.user_id
     LEFT JOIN user_agencies ua ON ua.user_id = cfp.user_id AND ua.agency_id = ?
     LEFT JOIN club_feed_post_reads r ON r.post_id = cfp.id AND r.user_id = ?
     WHERE cfp.agency_id = ?
       AND cfp.user_id <> ?
       AND r.post_id IS NULL
     ORDER BY cfp.created_at DESC
     LIMIT 80`,
    [cid, vid, cid, vid]
  );

  const [readRows] = await pool.execute(
    `SELECT cfp.id, cfp.message_text, cfp.attachments_json, cfp.visibility, cfp.created_at,
            cfp.user_id, u.first_name, u.last_name, u.profile_photo_path,
            COALESCE(ua.club_role, 'member') AS club_role,
            1 AS is_read
     FROM club_feed_posts cfp
     INNER JOIN users u ON u.id = cfp.user_id
     LEFT JOIN user_agencies ua ON ua.user_id = cfp.user_id AND ua.agency_id = ?
     LEFT JOIN club_feed_post_reads r ON r.post_id = cfp.id AND r.user_id = ?
     WHERE cfp.agency_id = ?
       AND (cfp.user_id = ? OR r.post_id IS NOT NULL)
     ORDER BY cfp.created_at DESC
     LIMIT 5`,
    [cid, vid, cid, vid]
  );

  const unread = mapClubFeedPostRows(unreadRows, { defaultRead: false });
  const read = mapClubFeedPostRows(readRows, { defaultRead: false });
  const seen = new Set(unread.map((x) => x.clubPostId));
  const readDedup = read.filter((x) => !seen.has(x.clubPostId));
  return [...unread, ...readDedup];
};

/** Merged feed: more club posts with read flags (no unread-first ordering). */
const fetchClubFeedPostsMergedForViewer = async (clubId, viewerId) => {
  const cid = Number(clubId);
  const vid = Number(viewerId);
  if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(vid) || vid <= 0) {
    return [];
  }
  const [rows] = await pool.execute(
    `SELECT cfp.id, cfp.message_text, cfp.attachments_json, cfp.visibility, cfp.created_at,
            cfp.user_id, u.first_name, u.last_name, u.profile_photo_path,
            COALESCE(ua.club_role, 'member') AS club_role,
            CASE WHEN cfp.user_id = ? THEN 1
                 WHEN r.post_id IS NOT NULL THEN 1
                 ELSE 0 END AS is_read
     FROM club_feed_posts cfp
     INNER JOIN users u ON u.id = cfp.user_id
     LEFT JOIN user_agencies ua ON ua.user_id = cfp.user_id AND ua.agency_id = ?
     LEFT JOIN club_feed_post_reads r ON r.post_id = cfp.id AND r.user_id = ?
     WHERE cfp.agency_id = ?
     ORDER BY cfp.created_at DESC
     LIMIT 80`,
    [vid, cid, vid, cid]
  );
  return mapClubFeedPostRows(rows, { defaultRead: false });
};

/**
 * GET /summit-stats/clubs/:id/feed/public
 * No auth — items the club marked as public (when public feed is enabled in Public page settings).
 */
export const getClubFeedPublic = async (req, res, next) => {
  try {
    const clubRef = String(req.params.id || '').trim();
    const club = await resolveClubByPublicRef(clubRef);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });
    const clubId = Number(club.id);
    const [cfgRows] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );
    const pubCfg = buildPublicPageConfig(cfgRows?.[0]?.store_config_json);
    if (!pubCfg.publicFeedEnabled) return res.json({ items: [] });

    const limit = Math.min(60, parseInt(req.query.limit, 10) || 40);
    const [postRows] = await pool.execute(
      `SELECT cfp.id, cfp.message_text, cfp.attachments_json, cfp.visibility, cfp.created_at,
              cfp.user_id, u.first_name, u.last_name, u.profile_photo_path,
              COALESCE(ua.club_role, 'member') AS club_role
       FROM club_feed_posts cfp
       INNER JOIN users u ON u.id = cfp.user_id
       LEFT JOIN user_agencies ua ON ua.user_id = cfp.user_id AND ua.agency_id = ?
       WHERE cfp.agency_id = ? AND cfp.visibility = 'public'
       ORDER BY cfp.created_at DESC
       LIMIT ${limit}`,
      [clubId, clubId]
    );
    const feedItems = mapClubFeedPostRows(postRows, { defaultRead: true });
    return res.json({ items: feedItems });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/:id/feed/posts
 * Authenticated club members — club-wide message (not tied to a season).
 */
export const postClubFeedPost = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club = await assertMemberAccess(req, res, clubId);
    if (!club) return;
    const messageText = String(req.body?.messageText || '').trim().slice(0, 4000);
    if (!messageText) return res.status(400).json({ error: { message: 'messageText is required' } });
    let visibility = String(req.body?.visibility || 'club').toLowerCase() === 'public' ? 'public' : 'club';
    const [cfgRows] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );
    const pubCfg = buildPublicPageConfig(cfgRows?.[0]?.store_config_json);
    if (visibility === 'public' && !pubCfg.publicFeedEnabled) {
      return res.status(403).json({
        error: { message: 'Public feed is not enabled for this club. Turn it on under Public page settings.' }
      });
    }
    const uid = req.user.id;
    const rawPaths = req.body?.attachmentPaths;
    let paths = [];
    if (Array.isArray(rawPaths)) {
      paths = rawPaths.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 8);
    }
    const prefix = `uploads/club_feed/${clubId}/${uid}/`;
    for (const p of paths) {
      if (!p.startsWith(prefix)) {
        return res.status(400).json({ error: { message: 'Invalid attachment path' } });
      }
    }
    const attachmentsJson = paths.length ? JSON.stringify(paths.map((path) => ({ type: 'image', path }))) : null;
    const [insertResult] = await pool.execute(
      `INSERT INTO club_feed_posts (agency_id, user_id, message_text, attachments_json, visibility) VALUES (?, ?, ?, ?, ?)`,
      [clubId, uid, messageText, attachmentsJson, visibility]
    );
    const newId = insertResult?.insertId;
    if (newId) {
      try {
        await pool.execute(
          `INSERT IGNORE INTO club_feed_post_reads (user_id, post_id) VALUES (?, ?)`,
          [uid, newId]
        );
      } catch {
        // table may not exist until migration applied
      }
    }
    return res.status(201).json({ ok: true });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/:clubId/feed/from-workout
 * Manager-only: share a season workout to the club's public feed.
 * Auto-formats the post text from workout data; optionally appends the top comments.
 */
export const postWorkoutToClubFeed = async (req, res, next) => {
  try {
    const clubId   = toInt(req.params.id);
    const club     = await assertManagerAccess(req, res, clubId);
    if (!club) return;

    const workoutId      = toInt(req.body?.workoutId);
    const includeComments = req.body?.includeComments === true || req.body?.includeComments === 'true';

    if (!workoutId) return res.status(400).json({ error: { message: 'workoutId is required' } });

    // Verify the workout belongs to this club's season
    const [wRows] = await pool.execute(
      `SELECT cw.id, cw.activity_type, cw.distance_value, cw.duration_minutes,
              cw.workout_notes, cw.completed_at, cw.learning_class_id,
              u.first_name, u.last_name,
              lpc.class_name AS season_name
         FROM challenge_workouts cw
         JOIN users u ON u.id = cw.user_id
         JOIN learning_program_classes lpc ON lpc.id = cw.learning_class_id
         JOIN agencies ag ON ag.id = lpc.organization_id
        WHERE cw.id = ? AND ag.id = ?
        LIMIT 1`,
      [workoutId, clubId]
    );
    const w = wRows?.[0];
    if (!w) return res.status(404).json({ error: { message: 'Workout not found for this club' } });

    // Check if already shared
    const [existingRows] = await pool.execute(
      `SELECT id FROM club_feed_posts WHERE source_workout_id = ? LIMIT 1`,
      [workoutId]
    );
    if (existingRows?.length) {
      return res.status(409).json({ error: { message: 'This workout has already been shared to the club feed.' }, postId: existingRows[0].id });
    }

    // Check public feed enabled
    const [cfgRows] = await pool.execute(`SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`, [clubId]);
    const pubCfg = buildPublicPageConfig(cfgRows?.[0]?.store_config_json);
    if (!pubCfg.publicFeedEnabled) {
      return res.status(403).json({ error: { message: 'Public feed is not enabled for this club. Turn it on under Public page settings.' } });
    }

    // Format the activity type nicely
    const activityLabel = String(w.activity_type || 'workout')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const distLabel = w.distance_value ? `${(+w.distance_value).toFixed(2)} mi of ` : '';
    const dateLabel = w.completed_at
      ? new Date(w.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
    const firstName = String(w.first_name || '').trim();

    let messageText = `🏃 ${firstName} completed ${distLabel}${activityLabel}${dateLabel ? ` on ${dateLabel}` : ''}`;
    if (w.workout_notes) {
      const noteSnippet = String(w.workout_notes).trim().slice(0, 200);
      messageText += `\n\n"${noteSnippet}"`;
    }
    messageText += `\n\n— Season: ${w.season_name || 'Current Season'}`;

    // Optionally append top comments
    if (includeComments) {
      const [commentRows] = await pool.execute(
        `SELECT wc.comment_text, u.first_name AS commenter_name
           FROM challenge_workout_comments wc
           JOIN users u ON u.id = wc.user_id
          WHERE wc.workout_id = ?
          ORDER BY wc.created_at ASC
          LIMIT 5`,
        [workoutId]
      );
      if (commentRows?.length) {
        messageText += '\n\nComments:';
        for (const c of commentRows) {
          messageText += `\n• ${c.commenter_name}: ${String(c.comment_text || '').trim().slice(0, 150)}`;
        }
      }
    }

    const [insertResult] = await pool.execute(
      `INSERT INTO club_feed_posts (agency_id, user_id, message_text, visibility, source_workout_id, source_class_id)
       VALUES (?, ?, ?, 'public', ?, ?)`,
      [clubId, req.user.id, messageText.slice(0, 4000), workoutId, w.learning_class_id]
    );
    const postId = insertResult?.insertId;

    // Auto-mark read for the poster
    if (postId) {
      await pool.execute(
        `INSERT IGNORE INTO club_feed_post_reads (user_id, post_id) VALUES (?, ?)`,
        [req.user.id, postId]
      ).catch(() => {});
    }

    return res.status(201).json({ ok: true, postId });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/:id/feed/attachments
 * Upload one image for a club feed post; returns path for attachmentPaths on POST .../feed/posts.
 */
export const postClubFeedAttachment = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club = await assertMemberAccess(req, res, clubId);
    if (!club) return;
    if (!req.file?.buffer) {
      return res.status(400).json({ error: { message: 'No image file uploaded' } });
    }
    const result = await StorageService.saveClubFeedAttachment(
      clubId,
      req.user.id,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    const url = publicUploadsUrlFromStoredPath(result.relativePath);
    return res.json({ path: result.relativePath, url });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/clubs/:id/feed/season-options
 * Active seasons in this club the current user belongs to (for "Post to season").
 */
export const getClubFeedSeasonOptions = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club = await assertMemberAccess(req, res, clubId);
    if (!club) return;
    const userId = req.user.id;
    const [rows] = await pool.execute(
      `SELECT c.id, c.class_name, c.status, c.starts_at, c.ends_at
       FROM learning_program_classes c
       INNER JOIN learning_class_provider_memberships m ON m.learning_class_id = c.id
       WHERE c.organization_id = ?
         AND m.provider_user_id = ?
         AND m.membership_status = 'active'
         AND LOWER(COALESCE(c.status, '')) NOT IN ('archived', 'cancelled')
         AND (c.ends_at IS NULL OR c.ends_at >= NOW())
       ORDER BY COALESCE(c.starts_at, c.created_at) DESC, c.id DESC
       LIMIT 12`,
      [clubId, userId]
    );
    const seasons = (rows || []).map((r) => ({
      id: Number(r.id),
      name: String(r.class_name || '').trim() || `Season ${r.id}`,
      status: r.status || null
    }));
    return res.json({ seasons });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/clubs/:id/feed
 * Authenticated member — club-wide posts; optional merge with season workouts + chat.
 * Query: includeSeasonFeed=0|1 (default 0) — when 1, merge season workouts + chat into the feed.
 * Query: seasonId=<classId> — only that season's workouts + messages (no club-wide posts).
 */
export const getClubFeed = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club = await assertMemberAccess(req, res, clubId);
    if (!club) return;

    const limit = Math.min(60, parseInt(req.query.limit, 10) || 40);
    const seasonId = toInt(req.query.seasonId);
    const incQ = String(req.query.includeSeasonFeed ?? '').toLowerCase();
    const includeSeasonFeed = incQ === '1' || incQ === 'true';

    const viewerId = req.user.id;
    let clubFeedItems = [];
    if (!seasonId) {
      clubFeedItems = includeSeasonFeed
        ? await fetchClubFeedPostsMergedForViewer(clubId, viewerId)
        : await fetchClubFeedPostsForViewer(clubId, viewerId);
    }

    const mapWorkouts = (workoutRows, seasonMap) => (workoutRows || []).map((w) => ({
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
    }));

    const mapMsgs = (msgRows, seasonMap) => (msgRows || []).map((m) => {
      const role = String(m.club_role || 'member').toLowerCase();
      const isManagerPost = role === 'manager' || role === 'assistant_manager';
      return {
        type: isManagerPost ? 'announcement' : 'member_message',
        source: 'season',
        id: `m-${m.id}`,
        userId: null,
        name: `${m.first_name || ''} ${m.last_name || ''}`.trim(),
        text: m.message_text,
        seasonName: seasonMap.get(m.learning_class_id) || null,
        timestamp: m.created_at
      };
    });

    if (seasonId) {
      const [mem] = await pool.execute(
        `SELECT 1 FROM learning_class_provider_memberships
         WHERE provider_user_id = ? AND learning_class_id = ? AND membership_status = 'active' LIMIT 1`,
        [req.user.id, seasonId]
      );
      if (!mem?.length) {
        return res.status(403).json({ error: { message: 'You are not active in this season' } });
      }
      const [clsRows] = await pool.execute(
        `SELECT id, class_name FROM learning_program_classes WHERE id = ? AND organization_id = ? LIMIT 1`,
        [seasonId, clubId]
      );
      if (!clsRows?.[0]) return res.status(404).json({ error: { message: 'Season not found' } });
      const seasonMap = new Map([[Number(clsRows[0].id), clsRows[0].class_name || 'Season']]);

      const workoutLim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
      const [workoutRows] = await pool.execute(
        `SELECT
           w.id, w.user_id, w.learning_class_id, w.activity_type,
           w.distance_value, w.duration_minutes, w.points, w.calories_burned,
           w.workout_notes, w.completed_at, w.is_race,
           u.first_name, u.last_name
         FROM challenge_workouts w
         INNER JOIN users u ON u.id = w.user_id
         WHERE w.learning_class_id = ?
           AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         ORDER BY w.completed_at DESC
         LIMIT ${workoutLim}`,
        [seasonId]
      );

      const [msgRows] = await pool.execute(
        `SELECT
           cm.id, cm.learning_class_id, cm.message_text, cm.created_at,
           u.first_name, u.last_name,
           COALESCE(ua.club_role, 'member') AS club_role
         FROM challenge_messages cm
         INNER JOIN users u ON u.id = cm.user_id
         LEFT JOIN user_agencies ua ON ua.user_id = cm.user_id AND ua.agency_id = ?
         WHERE cm.learning_class_id = ?
           AND cm.team_id IS NULL
           AND cm.deleted_at IS NULL
         ORDER BY cm.created_at DESC
         LIMIT 80`,
        [clubId, seasonId]
      );

      const feedItems = [
        ...mapWorkouts(workoutRows, seasonMap),
        ...mapMsgs(msgRows, seasonMap)
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);

      return res.json({
        items: feedItems,
        feedScope: 'season',
        seasonId,
        seasonName: clsRows[0].class_name || 'Season'
      });
    }

    if (!includeSeasonFeed) {
      const feedItems = clubFeedItems.slice(0, limit);
      return res.json({ items: feedItems, feedScope: 'club' });
    }

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

    if (!visibleSeasonIds.length) {
      const feedItems = clubFeedItems
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
      return res.json({ items: feedItems, feedScope: 'merged' });
    }

    const placeholders = visibleSeasonIds.map(() => '?').join(', ');
    const seasonMap = new Map((seasonRows || []).map((s) => [s.id, s.class_name]));

    const dashWorkoutLim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
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
       LIMIT ${dashWorkoutLim}`,
      [...visibleSeasonIds]
    );

    const [msgRows] = await pool.execute(
      `SELECT
         cm.id, cm.learning_class_id, cm.message_text, cm.created_at,
         u.first_name, u.last_name,
         COALESCE(ua.club_role, 'member') AS club_role
       FROM challenge_messages cm
       INNER JOIN users u ON u.id = cm.user_id
       LEFT JOIN user_agencies ua ON ua.user_id = cm.user_id AND ua.agency_id = ?
       WHERE cm.learning_class_id IN (${placeholders})
         AND cm.team_id IS NULL
         AND cm.deleted_at IS NULL
       ORDER BY cm.created_at DESC
       LIMIT 80`,
      [clubId, ...visibleSeasonIds]
    );

    const feedItems = [
      ...clubFeedItems,
      ...mapWorkouts(workoutRows, seasonMap),
      ...mapMsgs(msgRows, seasonMap)
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);

    return res.json({ items: feedItems, feedScope: 'merged' });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/:id/feed/read/:postId
 * Mark one club feed post as read for the current user.
 */
export const postClubFeedMarkRead = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const postId = toInt(req.params.postId);
    const club = await assertMemberAccess(req, res, clubId);
    if (!club) return;
    if (!postId) return res.status(400).json({ error: { message: 'Invalid post id' } });
    const [rows] = await pool.execute(
      `SELECT id FROM club_feed_posts WHERE id = ? AND agency_id = ? LIMIT 1`,
      [postId, clubId]
    );
    if (!rows?.length) return res.status(404).json({ error: { message: 'Post not found' } });
    await pool.execute(
      `INSERT INTO club_feed_post_reads (user_id, post_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP`,
      [req.user.id, postId]
    );
    return res.json({ ok: true });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/:id/feed/read-all
 * Mark all club feed posts in this club as read for the current user.
 */
export const postClubFeedMarkAllRead = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const club = await assertMemberAccess(req, res, clubId);
    if (!club) return;
    await pool.execute(
      `INSERT IGNORE INTO club_feed_post_reads (user_id, post_id)
       SELECT ?, id FROM club_feed_posts WHERE agency_id = ?`,
      [req.user.id, clubId]
    );
    return res.json({ ok: true });
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
      isActiveInClub: Number(r.club_is_active || 0) === 1,
      applicationPending: false
    })) : [];

    const seenIds = new Set(members.map((m) => m.id).filter((n) => Number.isFinite(n) && n > 0));
    const [pendingRows] = await pool.execute(
      `SELECT cma.user_id, cma.email, cma.first_name, cma.last_name, cma.applied_at, u.role, u.status
       FROM challenge_member_applications cma
       INNER JOIN users u ON u.id = cma.user_id
       WHERE cma.agency_id = ?
         AND cma.status = 'pending'
         AND cma.user_id IS NOT NULL
         AND (u.is_archived IS NULL OR u.is_archived = 0)`,
      [clubId]
    );
    for (const pr of pendingRows || []) {
      const uid = Number(pr.user_id);
      if (!uid || seenIds.has(uid)) continue;
      seenIds.add(uid);
      members.push({
        id: uid,
        email: pr.email || '',
        firstName: pr.first_name || '',
        lastName: pr.last_name || '',
        role: pr.role || '',
        status: pr.status || '',
        createdAt: pr.applied_at || null,
        clubRole: 'pending',
        isActiveInClub: false,
        applicationPending: true
      });
    }

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
      `SELECT u.id, u.first_name, u.last_name, u.email, ua.is_active, COALESCE(ua.club_role, 'member') AS club_role
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
      dateOfBirth: (() => {
        const raw = latestApplication?.date_of_birth || latestParticipantProfile?.date_of_birth || null;
        if (!raw) return null;
        if (raw instanceof Date) return raw.toISOString().slice(0, 10);
        return String(raw).slice(0, 10);
      })(),
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

    const [capRows] = await pool.execute(
      `SELECT COUNT(DISTINCT t.id) AS cnt
       FROM challenge_teams t
       INNER JOIN learning_program_classes c ON c.id = t.learning_class_id
       WHERE c.organization_id = ? AND t.team_manager_user_id = ?`,
      [clubId, userId]
    );
    const captainTeamCount = Number(capRows?.[0]?.cnt || 0);
    const everTeamCaptain = captainTeamCount > 0;

    return res.json({
      everTeamCaptain,
      captainTeamCount,
      member: {
        userId: Number(member.id),
        firstName: member.first_name || '',
        lastName: member.last_name || '',
        email: member.email || '',
        isActiveInClub: Number(member.is_active || 0) === 1,
        clubRole: String(member.club_role || 'member').trim().toLowerCase() || 'member'
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
      `SELECT COALESCE(club_role, 'member') AS club_role
       FROM user_agencies
       WHERE user_id = ? AND agency_id = ?
       LIMIT 1`,
      [targetUserId, clubId]
    );
    if (!membershipRows?.length) return res.status(404).json({ error: { message: 'Member not found in this club' } });

    const target = await User.findById(targetUserId);
    if (!target) return res.status(404).json({ error: { message: 'User not found' } });

    const currentRole = String(target.role || '').toLowerCase();
    const currentClubRole = String(membershipRows?.[0]?.club_role || 'member').trim().toLowerCase();
    const editableCurrentRoles = new Set([
      // Standard SSTC member roles.
      'provider',
      'provider_plus',
      // Legacy/accidental role states that managers may need to normalize.
      'club_manager',
      'admin',
      'support',
      'staff',
      'clinical_practice_assistant'
    ]);
    const editableClubRoles = new Set(['member', 'assistant_manager', 'manager', 'club_manager']);
    if (!editableCurrentRoles.has(currentRole) && !editableClubRoles.has(currentClubRole)) {
      return res.status(400).json({
        error: {
          message: 'Club member profile can only be edited for member/assistant/manager club accounts. If this user is a legacy admin role, re-open and save as Member or Assistant manager.'
        }
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

    // Club role change — tracked exclusively in user_agencies.club_role.
    // users.role (global system role) is NEVER changed here. A provider at ITSCO who joins
    // an SSTC club is still a provider at ITSCO. An admin who participates in a club is still
    // an admin. Club membership level (member / assistant_manager) is orthogonal to system role.
    let newClubRole = null;
    if (body.role !== undefined) {
      const r = String(body.role || '').trim().toLowerCase();
      if (r === 'provider_plus' || r === 'assistant_manager') {
        newClubRole = 'assistant_manager';
      } else if (r === 'provider' || r === 'member') {
        newClubRole = 'member';
      } else {
        return res.status(400).json({ error: { message: 'Club role must be member or assistant_manager' } });
      }
    }

    const hasUserPatch = Object.keys(patch).length > 0;
    const hasClubRoleChange = !!newClubRole;

    if (!hasUserPatch && !hasClubRoleChange) {
      return res.status(400).json({ error: { message: 'No valid fields to update' } });
    }

    if (patch.email) {
      const existing = await User.findByEmail(patch.email);
      if (existing && Number(existing.id) !== Number(targetUserId)) {
        return res.status(409).json({ error: { message: 'That email is already in use' } });
      }
    }

    if (hasUserPatch) {
      await User.update(targetUserId, patch);
    }

    if (newClubRole) {
      await pool.execute(
        `UPDATE user_agencies SET club_role = ? WHERE user_id = ? AND agency_id = ?`,
        [newClubRole, targetUserId, clubId]
      );
    }

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

    let userRows;
    try {
      [userRows] = await pool.execute(
        `SELECT id, email, first_name, last_name, role, status, timezone, created_at, profile_photo_path, personal_phone,
                home_street_address, home_address_line2, home_city, home_state, home_postal_code,
                profile_gender, profile_date_of_birth, profile_average_miles_per_week, profile_average_hours_per_week,
                profile_heard_about_club, profile_running_fitness_background, profile_current_fitness_activities
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
      );
    } catch {
      // Migration 693 columns may not exist yet — fall back to base columns.
      [userRows] = await pool.execute(
        `SELECT id, email, first_name, last_name, role, status, timezone, created_at, profile_photo_path, personal_phone,
                home_street_address, home_address_line2, home_city, home_state, home_postal_code
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
      );
    }
    const user = userRows?.[0];
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    const platformIds = await getPlatformAgencyIds(null);
    const plat = sqlAffiliationUnderSummitPlatform('a', platformIds);

    const agencies = await User.getAgencies(userId);
    let clubs = (agencies || [])
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
    if (plat) {
      const cids = clubs.map((c) => c.id).filter((id) => Number.isFinite(id) && id > 0);
      if (cids.length) {
        const ph = cids.map(() => '?').join(',');
        const [allowedRows] = await pool.execute(
          `SELECT a.id FROM agencies a WHERE a.id IN (${ph})${plat.sql}`,
          [...cids, ...plat.params]
        );
        const allowed = new Set((allowedRows || []).map((r) => Number(r.id)));
        clubs = clubs.filter((c) => allowed.has(c.id));
      } else {
        clubs = [];
      }
    }

    // Fetch latest application; fall back to a query without `pronouns` if the column
    // migration has not yet been run on this environment (migration 675).
    let applicationRows;
    try {
      [applicationRows] = await pool.execute(
        `SELECT first_name, last_name, email, phone, gender, pronouns, date_of_birth, weight_lbs, height_inches, timezone,
                heard_about_club, running_fitness_background, average_miles_per_week, average_hours_per_week,
                current_fitness_activities, waiver_signature_name, waiver_agreed_at, waiver_version, status, applied_at
         FROM challenge_member_applications
         WHERE user_id = ? OR LOWER(COALESCE(email, '')) = LOWER(?)
         ORDER BY applied_at DESC, id DESC
         LIMIT 1`,
        [userId, user.email || '']
      );
    } catch (appQueryErr) {
      if (String(appQueryErr?.message || '').includes("pronouns")) {
        [applicationRows] = await pool.execute(
          `SELECT first_name, last_name, email, phone, gender, NULL AS pronouns, date_of_birth, weight_lbs, height_inches, timezone,
                  heard_about_club, running_fitness_background, average_miles_per_week, average_hours_per_week,
                  current_fitness_activities, waiver_signature_name, waiver_agreed_at, waiver_version, status, applied_at
           FROM challenge_member_applications
           WHERE user_id = ? OR LOWER(COALESCE(email, '')) = LOWER(?)
           ORDER BY applied_at DESC, id DESC
           LIMIT 1`,
          [userId, user.email || '']
        );
      } else {
        throw appQueryErr;
      }
    }
    const latestApplication = applicationRows?.[0] || null;

    const statsSqlSuffix = plat ? plat.sql : '';
    const statsParams = plat ? [userId, ...plat.params] : [userId];
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
         AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'${statsSqlSuffix}`,
      statsParams
    );
    const totals = statsRows?.[0] || {};

    const memberSeasonSqlSuffix = `${plat ? plat.sql : ''}`;
    const memberSeasonParams = plat ? [userId, ...plat.params] : [userId];
    const [seasonRows] = await pool.execute(
      `SELECT
         c.id AS class_id,
         c.class_name,
         c.status AS class_status,
         c.starts_at,
         c.ends_at,
         c.organization_id AS club_id,
         c.banner_image_path,
         c.logo_image_path,
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
         AND LOWER(COALESCE(c.program_kind, 'season')) <> 'monthly_book'${memberSeasonSqlSuffix}
       GROUP BY
         c.id, c.class_name, c.status, c.starts_at, c.ends_at, c.organization_id,
         c.banner_image_path, c.logo_image_path, a.name, a.slug, m.membership_status
       ORDER BY COALESCE(c.starts_at, c.created_at) DESC, c.id DESC`,
      memberSeasonParams
    );

    const memberSeasonRows = seasonRows || [];
    const seenClassIds = new Set(memberSeasonRows.map((r) => Number(r.class_id)));

    const managedClubRows = await getManagedClubsForUser(userId, { includeAssistant: true });
    let managedClubIds = [
      ...new Set(
        (managedClubRows || [])
          .map((row) => Number(row.id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    ];
    if (plat && managedClubIds.length) {
      const phm = managedClubIds.map(() => '?').join(',');
      const [managedOk] = await pool.execute(
        `SELECT a.id FROM agencies a WHERE a.id IN (${phm})${plat.sql}`,
        [...managedClubIds, ...plat.params]
      );
      managedClubIds = (managedOk || []).map((r) => Number(r.id)).filter((id) => id > 0);
    } else if (plat && !managedClubIds.length) {
      managedClubIds = [];
    }

    let mergedSeasonRows = memberSeasonRows;
    if (managedClubIds.length) {
      const placeholders = managedClubIds.map(() => '?').join(',');
      const [managedSeasonRows] = await pool.execute(
        `SELECT
           c.id AS class_id,
           c.class_name,
           c.status AS class_status,
           c.starts_at,
           c.ends_at,
           c.organization_id AS club_id,
           c.banner_image_path,
           c.logo_image_path,
           a.name AS club_name,
           a.slug AS club_slug,
           NULL AS membership_status,
           NULL AS team_name,
           0 AS workout_count,
           0 AS total_miles,
           0 AS total_points
         FROM learning_program_classes c
         INNER JOIN agencies a ON a.id = c.organization_id
         WHERE c.organization_id IN (${placeholders})
           AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'
           AND LOWER(COALESCE(c.program_kind, 'season')) <> 'monthly_book'
         ORDER BY COALESCE(c.starts_at, c.created_at) DESC, c.id DESC`,
        managedClubIds
      );
      const extras = (managedSeasonRows || []).filter((r) => !seenClassIds.has(Number(r.class_id)));
      mergedSeasonRows = [...memberSeasonRows, ...extras];
      mergedSeasonRows.sort((a, b) => {
        const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0;
        const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return Number(b.class_id) - Number(a.class_id);
      });
    }

    const now = Date.now();
    const seasons = (mergedSeasonRows || []).map((row) => {
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
        bannerImagePath: row.banner_image_path || null,
        logoImagePath: row.logo_image_path || null,
        bucket
      };
    });

    let accountGenderOptions = [...DEFAULT_GENDER_OPTIONS];
    let accountAllowCustomPronouns = false;
    if (clubs.length) {
      const firstClubId = clubs[0].id;
      const [cfgRows] = await pool.execute(
        `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
        [firstClubId]
      );
      const accountConfig = buildPublicPageConfig(cfgRows?.[0]?.store_config_json);
      accountGenderOptions = accountConfig.genderOptions;
      accountAllowCustomPronouns = accountConfig.allowCustomPronouns === true;
    }

    // Fetch active seasons in clubs the user is a member of but hasn't joined yet.
    const enrolledClassIds = new Set(mergedSeasonRows.map((r) => Number(r.class_id)));
    const memberClubIds = clubs.map((c) => c.id).filter((id) => Number.isFinite(id) && id > 0);
    let availableSeasons = [];
    if (memberClubIds.length) {
      const ph = memberClubIds.map(() => '?').join(',');
      const availSuffix = plat ? plat.sql : '';
      const availParams = plat ? [...memberClubIds, ...plat.params] : memberClubIds;
      const [availRows] = await pool.execute(
        `SELECT c.id AS class_id, c.class_name, c.status AS class_status,
                c.starts_at, c.ends_at, c.allow_late_join,
                c.organization_id AS club_id, a.name AS club_name, a.slug AS club_slug
         FROM learning_program_classes c
         INNER JOIN agencies a ON a.id = c.organization_id
         WHERE c.organization_id IN (${ph})
           AND c.status = 'active'
           AND LOWER(COALESCE(a.organization_type, '')) = 'affiliation'
           AND LOWER(COALESCE(c.program_kind, 'season')) <> 'monthly_book'${availSuffix}
         ORDER BY COALESCE(c.starts_at, c.created_at) DESC, c.id DESC`,
        availParams
      );
      availableSeasons = (availRows || [])
        .filter((r) => !enrolledClassIds.has(Number(r.class_id)))
        .map((r) => ({
          classId: Number(r.class_id),
          className: r.class_name || `Season ${r.class_id}`,
          classStatus: r.class_status || null,
          startsAt: r.starts_at || null,
          endsAt: r.ends_at || null,
          allowLateJoin: !!r.allow_late_join,
          clubId: Number(r.club_id),
          clubName: r.club_name || '',
          clubSlug: r.club_slug || ''
        }));
    }

    return res.json({
      member: {
        userId,
        email: user.email || '',
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        timezone: user.timezone || null,
        profilePhotoUrl: publicUploadsUrlFromStoredPath(user.profile_photo_path),
        role: user.role || '',
        status: user.status || '',
        createdAt: user.created_at || null
      },
      memberships: clubs,
      accountSettings: {
        genderOptions: accountGenderOptions,
        allowCustomPronouns: accountAllowCustomPronouns
      },
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
        past: seasons.filter((season) => season.bucket === 'past'),
        available: availableSeasons
      },
      account: {
        billingPlan: 'Free account',
        billingStatus: 'active',
        heardAboutClub: latestApplication?.heard_about_club || user.profile_heard_about_club || null,
        runningFitnessBackground: latestApplication?.running_fitness_background || user.profile_running_fitness_background || null,
        averageMilesPerWeek: latestApplication?.average_miles_per_week != null
          ? Number(latestApplication.average_miles_per_week)
          : (user.profile_average_miles_per_week != null ? Number(user.profile_average_miles_per_week) : null),
        averageHoursPerWeek: latestApplication?.average_hours_per_week != null
          ? Number(latestApplication.average_hours_per_week)
          : (user.profile_average_hours_per_week != null ? Number(user.profile_average_hours_per_week) : null),
        currentFitnessActivities: latestApplication?.current_fitness_activities || user.profile_current_fitness_activities || null,
        gender: latestApplication?.gender || user.profile_gender || null,
        pronouns: latestApplication?.pronouns || null,
        dateOfBirth: (() => {
          const raw = latestApplication?.date_of_birth || user.profile_date_of_birth || null;
          if (!raw) return null;
          // MySQL DATE columns come back as JS Date objects; normalize to YYYY-MM-DD string.
          if (raw instanceof Date) return raw.toISOString().slice(0, 10);
          return String(raw).slice(0, 10);
        })(),
        weightLbs: latestApplication?.weight_lbs != null ? Number(latestApplication.weight_lbs) : null,
        heightInches: latestApplication?.height_inches != null ? Number(latestApplication.height_inches) : null,
        phone: latestApplication?.phone || user.personal_phone || null,
        latestApplicationStatus: latestApplication?.status || null,
        homeStreetAddress: user.home_street_address || null,
        homeAddressLine2: user.home_address_line2 || null,
        homeCity: user.home_city || null,
        homeState: user.home_state || null,
        homePostalCode: user.home_postal_code || null
      }
    });
  } catch (e) { next(e); }
};

/**
 * PUT /summit-stats/me/account-snapshot
 * Self-service — update name, timezone, contact/activity fields shown on the SSTC dashboard snapshot.
 * Persists to `users` and, when present, the latest `challenge_member_applications` row.
 */
export const putMyAccountSnapshot = async (req, res, next) => {
  try {
    const userId = toInt(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Sign in required' } });

    const body = req.body || {};
    const trimAddr = (v, maxLen) => {
      if (v === undefined) return undefined;
      const s = String(v ?? '').trim();
      if (!s) return null;
      return s.slice(0, maxLen);
    };

    const hasUserField =
      body.firstName !== undefined ||
      body.lastName !== undefined ||
      body.phone !== undefined ||
      body.timezone !== undefined ||
      body.homeStreetAddress !== undefined ||
      body.homeAddressLine2 !== undefined ||
      body.homeCity !== undefined ||
      body.homeState !== undefined ||
      body.homePostalCode !== undefined;
    const hasAppOnlyField =
      body.gender !== undefined ||
      body.pronouns !== undefined ||
      body.dateOfBirth !== undefined ||
      body.averageMilesPerWeek !== undefined ||
      body.averageHoursPerWeek !== undefined ||
      body.heardAboutClub !== undefined ||
      body.runningFitnessBackground !== undefined ||
      body.currentFitnessActivities !== undefined;

    if (!hasUserField && !hasAppOnlyField) {
      return res.status(400).json({ error: { message: 'No fields to update' } });
    }

    const userPatch = {};
    if (body.firstName !== undefined) userPatch.firstName = String(body.firstName || '').trim();
    if (body.lastName !== undefined) userPatch.lastName = String(body.lastName || '').trim();
    if (body.phone !== undefined) userPatch.personalPhone = String(body.phone || '').trim() || null;
    if (body.homeStreetAddress !== undefined) userPatch.homeStreetAddress = trimAddr(body.homeStreetAddress, 255);
    if (body.homeAddressLine2 !== undefined) userPatch.homeAddressLine2 = trimAddr(body.homeAddressLine2, 255);
    if (body.homeCity !== undefined) userPatch.homeCity = trimAddr(body.homeCity, 128);
    if (body.homeState !== undefined) userPatch.homeState = trimAddr(body.homeState, 64);
    if (body.homePostalCode !== undefined) userPatch.homePostalCode = trimAddr(body.homePostalCode, 32);

    if (Object.keys(userPatch).length > 0) {
      await User.update(userId, userPatch);
    }

    if (body.timezone !== undefined) {
      const tz = body.timezone ? String(body.timezone).trim().slice(0, 64) : null;
      await pool.execute(`UPDATE users SET timezone = ? WHERE id = ?`, [tz, userId]);
    }

    const [idRows] = await pool.execute(
      `SELECT id FROM challenge_member_applications
       WHERE user_id = ? OR LOWER(COALESCE(email, '')) = LOWER((SELECT email FROM users WHERE id = ? LIMIT 1))
       ORDER BY applied_at DESC, id DESC
       LIMIT 1`,
      [userId, userId]
    );
    let appId = idRows?.[0]?.id;

    // If no application row exists but the user wants to save profile fields (gender, DOB, etc.),
    // create a minimal approved application row so the data has a home.
    if (!appId && hasAppOnlyField) {
      try {
        const [userRow] = await pool.execute(
          `SELECT first_name, last_name, email FROM users WHERE id = ? LIMIT 1`, [userId]
        );
        const u = userRow?.[0];
        if (u?.email) {
          // Strategy 1: affiliation-type agency via user_agencies (standard member path)
          let [agencyRow] = await pool.execute(
            `SELECT a.id FROM agencies a
             INNER JOIN user_agencies ua ON ua.agency_id = a.id
             WHERE ua.user_id = ?
               AND LOWER(COALESCE(a.organization_type,'')) = 'affiliation'
             ORDER BY ua.id ASC LIMIT 1`,
            [userId]
          );
          // Strategy 2: club via season enrollment (club_manager enrolled in own season)
          if (!agencyRow?.length) {
            [agencyRow] = await pool.execute(
              `SELECT DISTINCT c.organization_id AS id
               FROM learning_class_provider_memberships pm
               INNER JOIN learning_program_classes c ON c.id = pm.learning_class_id
               INNER JOIN agencies a ON a.id = c.organization_id
               WHERE pm.provider_user_id = ?
                 AND LOWER(COALESCE(a.organization_type,'')) = 'affiliation'
               LIMIT 1`,
              [userId]
            );
          }
          // Strategy 3: any agency the user belongs to (handles top-level SSTC-only managers)
          if (!agencyRow?.length) {
            [agencyRow] = await pool.execute(
              `SELECT a.id FROM agencies a
               INNER JOIN user_agencies ua ON ua.agency_id = a.id
               WHERE ua.user_id = ?
               ORDER BY ua.id ASC LIMIT 1`,
              [userId]
            );
          }
          const clubId = agencyRow?.[0]?.id;
          if (clubId) {
            const [insertResult] = await pool.execute(
              `INSERT INTO challenge_member_applications
               (agency_id, user_id, first_name, last_name, email, status)
               VALUES (?, ?, ?, ?, ?, 'approved')`,
              [clubId, userId, u.first_name || '', u.last_name || '', u.email]
            );
            appId = insertResult?.insertId || null;
          }
        }
      } catch {
        // Non-fatal: skip app-only fields if insert fails
      }
    }

    let accountAllowCustomPronouns = false;
    try {
      const userAgencies = await User.getAgencies(userId);
      const clubIds = (userAgencies || [])
        .filter((a) => String(a?.organization_type || a?.organizationType || '').toLowerCase() === 'affiliation')
        .map((a) => Number(a?.id || 0))
        .filter((id) => Number.isFinite(id) && id > 0);
      for (const cid of clubIds) {
        const [cfgRows] = await pool.execute(
          `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
          [cid]
        );
        const cfg = buildPublicPageConfig(cfgRows?.[0]?.store_config_json);
        if (cfg.allowCustomPronouns === true) {
          accountAllowCustomPronouns = true;
          break;
        }
      }
    } catch {
      accountAllowCustomPronouns = false;
    }

    if (appId) {
      const appUpdates = [];
      const appVals = [];
      const pushCol = (col, val) => {
        appUpdates.push(`${col} = ?`);
        appVals.push(val);
      };
      if (body.phone !== undefined) pushCol('phone', String(body.phone || '').trim() || null);
      if (body.gender !== undefined) pushCol('gender', String(body.gender || '').trim() || null);
      if (body.dateOfBirth !== undefined) {
        const dob = body.dateOfBirth ? String(body.dateOfBirth).trim().slice(0, 10) : null;
        pushCol('date_of_birth', dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null);
      }
      if (body.pronouns !== undefined && accountAllowCustomPronouns) {
        pushCol('pronouns', normalizeShortText(body.pronouns, 64));
      }
      if (body.averageMilesPerWeek !== undefined) {
        const v = body.averageMilesPerWeek;
        const n = v === null || v === '' ? null : Number(v);
        pushCol('average_miles_per_week', Number.isFinite(n) ? n : null);
      }
      if (body.averageHoursPerWeek !== undefined) {
        const v = body.averageHoursPerWeek;
        const n = v === null || v === '' ? null : Number(v);
        pushCol('average_hours_per_week', Number.isFinite(n) ? n : null);
      }
      if (body.heardAboutClub !== undefined) {
        pushCol('heard_about_club', String(body.heardAboutClub || '').trim() || null);
      }
      if (body.runningFitnessBackground !== undefined) {
        pushCol('running_fitness_background', String(body.runningFitnessBackground || '').trim() || null);
      }
      if (body.currentFitnessActivities !== undefined) {
        pushCol('current_fitness_activities', String(body.currentFitnessActivities || '').trim() || null);
      }
      if (body.firstName !== undefined) pushCol('first_name', String(body.firstName || '').trim());
      if (body.lastName !== undefined) pushCol('last_name', String(body.lastName || '').trim());
      if (body.timezone !== undefined) {
        pushCol('timezone', body.timezone ? String(body.timezone).trim().slice(0, 64) : null);
      }

      if (appUpdates.length) {
        appVals.push(appId);
        try {
          await pool.execute(
            `UPDATE challenge_member_applications SET ${appUpdates.join(', ')} WHERE id = ?`,
            appVals
          );
        } catch (updateErr) {
          // If the pronouns column hasn't been migrated yet, retry without it.
          if (String(updateErr?.message || '').includes('pronouns')) {
            const filteredPairs = appUpdates
              .map((col, i) => ({ col, val: appVals[i] }))
              .filter(({ col }) => !col.startsWith('pronouns'));
            if (filteredPairs.length) {
              const retryVals = [...filteredPairs.map((p) => p.val), appId];
              await pool.execute(
                `UPDATE challenge_member_applications SET ${filteredPairs.map((p) => p.col).join(', ')} WHERE id = ?`,
                retryVals
              );
            }
          } else {
            throw updateErr;
          }
        }
      }
    }

    // Always persist profile fields directly to users table (Migration 693 columns).
    // This is the canonical store for managers who may never have a challenge_member_applications row.
    try {
      const userProfileUpdates = [];
      const userProfileVals = [];
      const pushUserProfile = (col, val) => { userProfileUpdates.push(`${col} = ?`); userProfileVals.push(val); };
      if (body.gender !== undefined) pushUserProfile('profile_gender', String(body.gender || '').trim() || null);
      if (body.dateOfBirth !== undefined) {
        const dob = body.dateOfBirth ? String(body.dateOfBirth).trim().slice(0, 10) : null;
        pushUserProfile('profile_date_of_birth', dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null);
      }
      if (body.averageMilesPerWeek !== undefined) {
        const v = body.averageMilesPerWeek;
        const n = v === null || v === '' ? null : Number(v);
        pushUserProfile('profile_average_miles_per_week', Number.isFinite(n) ? n : null);
      }
      if (body.averageHoursPerWeek !== undefined) {
        const v = body.averageHoursPerWeek;
        const n = v === null || v === '' ? null : Number(v);
        pushUserProfile('profile_average_hours_per_week', Number.isFinite(n) ? n : null);
      }
      if (body.heardAboutClub !== undefined) pushUserProfile('profile_heard_about_club', String(body.heardAboutClub || '').trim() || null);
      if (body.runningFitnessBackground !== undefined) pushUserProfile('profile_running_fitness_background', String(body.runningFitnessBackground || '').trim() || null);
      if (body.currentFitnessActivities !== undefined) pushUserProfile('profile_current_fitness_activities', String(body.currentFitnessActivities || '').trim() || null);
      if (userProfileUpdates.length) {
        userProfileVals.push(userId);
        await pool.execute(`UPDATE users SET ${userProfileUpdates.join(', ')} WHERE id = ?`, userProfileVals);
      }
    } catch (profileErr) {
      // Migration 693 columns may not exist on this environment yet — non-fatal.
      console.warn('[putMyAccountSnapshot] Could not save to users profile columns:', profileErr.message);
    }

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
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

    const userEmail = String(req.user?.email || '').trim().toLowerCase();
    const params = userEmail ? [userId, userEmail] : [userId];
    const emailOrClause = userEmail ? ' OR LOWER(TRIM(cma.email)) = ?' : '';
    const [rows] = await pool.execute(
      `SELECT cma.id, cma.status, cma.applied_at, cma.reviewed_at,
              a.id AS club_id, a.name AS club_name, a.slug AS club_slug,
              a.logo_url, a.logo_path, a.store_config_json
       FROM challenge_member_applications cma
       JOIN agencies a ON a.id = cma.agency_id
       WHERE cma.user_id = ?${emailOrClause}
       ORDER BY cma.applied_at DESC
       LIMIT 20`,
      params
    );

    const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    const applications = await Promise.all((rows || []).map(async (r) => {
      let logoUrl = r.logo_url || null;
      if (r.logo_path) logoUrl = `${baseUrl}/uploads/${String(r.logo_path).replace(/^uploads\//, '')}`;
      const publicPageConfig = buildPublicPageConfig(r.store_config_json);
      const manager = await getPrimaryClubManager(Number(r.club_id));
      return {
        id: Number(r.id),
        status: String(r.status || 'pending'),
        clubId: Number(r.club_id),
        clubName: r.club_name || '',
        clubSlug: String(r.club_slug || '').trim() || null,
        publicClubRef: publicPageConfig.publicSlug || String(r.club_id),
        logoUrl,
        bannerImageUrl: publicPageConfig.bannerImageUrl || null,
        managerName: formatClubManagerDisplayName(manager) || null,
        managerUserId: Number(manager?.userId || 0) || null,
        appliedAt: r.applied_at || null,
        reviewedAt: r.reviewed_at || null
      };
    }));

    return res.json({ applications });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/clubs/:id/members/directory
 * Authenticated club members — roster with photos, stats, location, age; gender shown in list only when it matches club-configured options.
 */
export const listClubMembersDirectory = async (req, res, next) => {
  try {
    const clubRef = String(req.params.id || '').trim();
    const club = await resolveClubByPublicRef(clubRef);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });
    const clubId = Number(club.id);
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: { message: 'Sign in required' } });
    const membership = await getUserClubMembership(user.id, clubId);
    if (!membership || membership.is_active === false) {
      return res.status(403).json({ error: { message: 'Club membership required' } });
    }

    const [cfgRows] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );
    const { genderOptions } = buildPublicPageConfig(cfgRows?.[0]?.store_config_json);
    const clubGenderSet = new Set((genderOptions || []).map((g) => normalizeGenderToken(g)));

    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.profile_photo_path,
              u.home_city, u.home_state,
              COALESCE(st.workout_count, 0) AS workout_count,
              COALESCE(st.total_points, 0) AS total_points,
              COALESCE(st.total_miles, 0) AS total_miles
       FROM user_agencies ua
       INNER JOIN users u ON u.id = ua.user_id
       LEFT JOIN (
         SELECT w.user_id,
                COUNT(w.id) AS workout_count,
                COALESCE(SUM(w.points), 0) AS total_points,
                COALESCE(SUM(w.distance_value), 0) AS total_miles
         FROM challenge_workouts w
         INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
         WHERE c.organization_id = ?
           AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         GROUP BY w.user_id
       ) st ON st.user_id = u.id
       WHERE ua.agency_id = ?
         AND ua.is_active = 1
         AND (u.is_archived IS NULL OR u.is_archived = 0)
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC
       LIMIT 300`,
      [clubId, clubId]
    );

    const userIds = (rows || []).map((r) => Number(r.id));
    if (!userIds.length) {
      return res.json({ members: [], genderOptions });
    }

    const placeholders = userIds.map(() => '?').join(',');
    const [appRows] = await pool.execute(
      `SELECT user_id, gender, date_of_birth, applied_at, id
       FROM challenge_member_applications
       WHERE agency_id = ? AND user_id IN (${placeholders})
       ORDER BY user_id ASC, applied_at DESC, id DESC`,
      [clubId, ...userIds]
    );
    const appByUser = new Map();
    for (const r of appRows || []) {
      const uid = Number(r.user_id);
      if (!appByUser.has(uid)) appByUser.set(uid, r);
    }

    const [profRows] = await pool.execute(
      `SELECT p.provider_user_id AS user_id, p.gender, p.date_of_birth, p.updated_at, p.id
       FROM challenge_participant_profiles p
       INNER JOIN learning_program_classes c ON c.id = p.learning_class_id
       WHERE c.organization_id = ? AND p.provider_user_id IN (${placeholders})
       ORDER BY p.provider_user_id ASC, p.updated_at DESC, p.id DESC`,
      [clubId, ...userIds]
    );
    const profByUser = new Map();
    for (const r of profRows || []) {
      const uid = Number(r.user_id);
      if (!profByUser.has(uid)) profByUser.set(uid, r);
    }

    const members = (rows || []).map((r) => {
      const uid = Number(r.id);
      const app = appByUser.get(uid);
      const prof = profByUser.get(uid);
      const genderRaw = app?.gender || prof?.gender || null;
      const dob = app?.date_of_birth || prof?.date_of_birth || null;
      const gTok = normalizeGenderToken(genderRaw);
      const genderInClubList = !!(gTok && clubGenderSet.has(gTok));

      return {
        id: uid,
        firstName: String(r.first_name || '').trim(),
        lastName: String(r.last_name || '').trim(),
        displayName: `${String(r.first_name || '').trim()} ${String(r.last_name || '').trim()}`.trim() || 'Member',
        profilePhotoUrl: publicUploadsUrlFromStoredPath(r.profile_photo_path),
        homeCity: r.home_city || null,
        homeState: r.home_state || null,
        age: ageFromDateOfBirth(dob),
        stats: {
          totalPoints: Math.round(Number(r.total_points || 0)),
          totalMiles: normalizeNum(r.total_miles, 1),
          workoutCount: Number(r.workout_count || 0)
        },
        genderListLabel: genderInClubList && genderRaw ? formatGenderDisplayLabel(genderRaw) : null,
        genderHiddenInList: !!(genderRaw && !genderInClubList)
      };
    });

    return res.json({ members, genderOptions });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/clubs/:id/members/directory/public
 * No authentication — limited roster for public club pages: photo, name, miles, moving time, city/state.
 * Does not expose user ids, points, age, or gender.
 */
export const listClubMembersDirectoryPublic = async (req, res, next) => {
  try {
    const clubRef = String(req.params.id || '').trim();
    const club = await resolveClubByPublicRef(clubRef);
    if (!club) return res.status(404).json({ error: { message: 'Club not found' } });
    const clubId = Number(club.id);

    const [rows] = await pool.execute(
      `SELECT u.first_name, u.last_name, u.profile_photo_path,
              u.home_city, u.home_state,
              COALESCE(ua.club_role, 'member') AS club_role,
              COALESCE(st.total_miles, 0) AS total_miles,
              COALESCE(st.total_minutes, 0) AS total_minutes
       FROM user_agencies ua
       INNER JOIN users u ON u.id = ua.user_id
       LEFT JOIN (
         SELECT w.user_id,
                COALESCE(SUM(w.distance_value), 0) AS total_miles,
                COALESCE(SUM(w.duration_minutes), 0) AS total_minutes
         FROM challenge_workouts w
         INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
         WHERE c.organization_id = ?
           AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)
         GROUP BY w.user_id
       ) st ON st.user_id = u.id
       WHERE ua.agency_id = ?
         AND ua.is_active = 1
         AND (u.is_archived IS NULL OR u.is_archived = 0)
       ORDER BY
         CASE LOWER(COALESCE(ua.club_role, 'member'))
           WHEN 'manager' THEN 0
           WHEN 'assistant_manager' THEN 1
           ELSE 2
         END,
         u.last_name ASC,
         u.first_name ASC,
         u.id ASC
       LIMIT 300`,
      [clubId, clubId]
    );

    const members = (rows || []).map((r) => {
      const cr = String(r.club_role || 'member').trim().toLowerCase();
      let publicRole = 'member';
      if (cr === 'manager') publicRole = 'manager';
      else if (cr === 'assistant_manager') publicRole = 'assistant_manager';
      const firstName = String(r.first_name || '').trim() || 'Member';
      return {
        firstName,
        /** @deprecated use firstName for public roster */
        displayName: firstName,
        publicRole,
        profilePhotoUrl: publicUploadsUrlFromStoredPath(r.profile_photo_path),
        homeCity: r.home_city || null,
        homeState: r.home_state || null,
        stats: {
          totalMiles: normalizeNum(r.total_miles, 1),
          totalMinutes: Math.round(Number(r.total_minutes || 0))
        }
      };
    });

    return res.json({ members, public: true });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /summit-stats/clubs/:id/members/:userId/profile
 * Club peer profile — extended fields + all-time stats in this club (for directory modal).
 */
export const getClubMemberProfile = async (req, res, next) => {
  try {
    const clubRef = String(req.params.id || '').trim();
    const club = await resolveClubByPublicRef(clubRef);
    const targetUserId = toInt(req.params.userId);
    const viewerId = req.user?.id;
    if (!viewerId) return res.status(401).json({ error: { message: 'Sign in required' } });
    if (!club || !targetUserId) return res.status(400).json({ error: { message: 'Invalid club or user' } });
    const clubId = Number(club.id);

    const membership = await getUserClubMembership(viewerId, clubId);
    if (!membership || membership.is_active === false) {
      return res.status(403).json({ error: { message: 'Club membership required' } });
    }

    const [memRows] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? AND is_active = 1 LIMIT 1`,
      [targetUserId, clubId]
    );
    if (!memRows?.length) {
      return res.status(404).json({ error: { message: 'Member not found in this club' } });
    }

    const [cfgRows] = await pool.execute(
      `SELECT store_config_json FROM agencies WHERE id = ? LIMIT 1`,
      [clubId]
    );
    const { genderOptions } = buildPublicPageConfig(cfgRows?.[0]?.store_config_json);
    const clubGenderSet = new Set((genderOptions || []).map((g) => normalizeGenderToken(g)));

    const [userRows] = await pool.execute(
      `SELECT id, first_name, last_name, profile_photo_path, home_city, home_state, timezone
       FROM users WHERE id = ? LIMIT 1`,
      [targetUserId]
    );
    const u = userRows?.[0];
    if (!u) return res.status(404).json({ error: { message: 'User not found' } });

    const [appRows] = await pool.execute(
      `SELECT gender, date_of_birth, heard_about_club, running_fitness_background, current_fitness_activities,
              average_miles_per_week, average_hours_per_week
       FROM challenge_member_applications
       WHERE agency_id = ? AND user_id = ?
       ORDER BY applied_at DESC, id DESC
       LIMIT 1`,
      [clubId, targetUserId]
    );
    const app = appRows?.[0] || null;

    const [profRows] = await pool.execute(
      `SELECT p.gender, p.date_of_birth
       FROM challenge_participant_profiles p
       INNER JOIN learning_program_classes c ON c.id = p.learning_class_id
       WHERE c.organization_id = ? AND p.provider_user_id = ?
       ORDER BY p.updated_at DESC, p.id DESC
       LIMIT 1`,
      [clubId, targetUserId]
    );
    const prof = profRows?.[0] || null;

    const genderRaw = app?.gender || prof?.gender || null;
    const dob = app?.date_of_birth || prof?.date_of_birth || null;
    const gTok = normalizeGenderToken(genderRaw);

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
         END) AS longest_run_miles
       FROM challenge_workouts w
       INNER JOIN learning_program_classes c ON c.id = w.learning_class_id
       WHERE w.user_id = ?
         AND c.organization_id = ?
         AND (w.is_disqualified IS NULL OR w.is_disqualified = 0)`,
      [targetUserId, clubId]
    );
    const totals = statsRows?.[0] || {};

    return res.json({
      member: {
        id: targetUserId,
        firstName: String(u.first_name || '').trim(),
        lastName: String(u.last_name || '').trim(),
        displayName: `${String(u.first_name || '').trim()} ${String(u.last_name || '').trim()}`.trim() || 'Member',
        profilePhotoUrl: publicUploadsUrlFromStoredPath(u.profile_photo_path),
        homeCity: u.home_city || null,
        homeState: u.home_state || null,
        timezone: u.timezone || null,
        age: ageFromDateOfBirth(dob),
        gender: genderRaw ? formatGenderDisplayLabel(genderRaw) : null,
        genderRaw: genderRaw || null,
        genderMatchesClubOptions: !!(gTok && clubGenderSet.has(gTok)),
        heardAboutClub: app?.heard_about_club || null,
        runningFitnessBackground: app?.running_fitness_background || null,
        currentFitnessActivities: app?.current_fitness_activities || null,
        averageMilesPerWeek: app?.average_miles_per_week != null ? Number(app.average_miles_per_week) : null,
        averageHoursPerWeek: app?.average_hours_per_week != null ? Number(app.average_hours_per_week) : null
      },
      allTimeStats: {
        totalWorkouts: Number(totals.workout_count || 0),
        totalPoints: Math.round(Number(totals.total_points || 0)),
        totalMiles: normalizeNum(totals.total_miles, 1),
        totalMinutes: Math.round(Number(totals.total_minutes || 0)),
        longestRunMiles: normalizeNum(totals.longest_run_miles, 1)
      }
    });
  } catch (e) { next(e); }
};

/**
 * POST /summit-stats/clubs/:clubId/seasons/:classId/join-request
 * Club member requests to join after enrollment deadline (manager approval).
 */
export const requestSeasonJoin = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.clubId);
    const classId = toInt(req.params.classId);
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: { message: 'Sign in required' } });
    if (!clubId || !classId) return res.status(400).json({ error: { message: 'Invalid club or season' } });

    const membership = await getUserClubMembership(user.id, clubId);
    if (!membership || membership.is_active === false) {
      return res.status(403).json({ error: { message: 'Club membership required' } });
    }

    const klass = await LearningProgramClass.findById(classId);
    if (!klass || Number(klass.organization_id) !== clubId) {
      return res.status(404).json({ error: { message: 'Season not found' } });
    }

    const phase = computeJoinPhase(klass);
    if (phase !== 'request_only') {
      return res.status(400).json({
        error: { message: 'Join requests are only available after the enrollment deadline. Use Join season while enrollment is open.' }
      });
    }

    const statusLower = String(klass.status || '').toLowerCase();
    if (['archived', 'cancelled'].includes(statusLower)) {
      return res.status(400).json({ error: { message: 'This season is not open for join requests' } });
    }

    const [existing] = await pool.execute(
      `SELECT id, membership_status FROM learning_class_provider_memberships
       WHERE learning_class_id = ? AND provider_user_id = ? LIMIT 1`,
      [classId, user.id]
    );
    if (existing?.[0] && ['active', 'completed'].includes(String(existing[0].membership_status || '').toLowerCase())) {
      return res.status(400).json({ error: { message: 'You are already in this season' } });
    }

    let jrRow = null;
    try {
      const [jrExisting] = await pool.execute(
        `SELECT id, status FROM summit_stats_season_join_requests WHERE learning_class_id = ? AND user_id = ? LIMIT 1`,
        [classId, user.id]
      );
      jrRow = jrExisting?.[0] || null;
    } catch (e) {
      if (String(e?.code) === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'Season join requests are not available yet (database migration pending).' } });
      }
      throw e;
    }
    if (jrRow) {
      const st = String(jrRow.status || '');
      if (st === 'pending') {
        return res.json({ ok: true, request: { id: Number(jrRow.id), status: 'pending' } });
      }
      if (st === 'approved') {
        return res.status(400).json({ error: { message: 'Your join request was already approved' } });
      }
      await pool.execute(
        `UPDATE summit_stats_season_join_requests
         SET status = 'pending', reviewed_at = NULL, reviewed_by_user_id = NULL
         WHERE id = ?`,
        [jrRow.id]
      );
    } else {
      await pool.execute(
        `INSERT INTO summit_stats_season_join_requests (agency_id, learning_class_id, user_id, status)
         VALUES (?, ?, ?, 'pending')`,
        [clubId, classId, user.id]
      );
    }

    const [rows] = await pool.execute(
      `SELECT id, status FROM summit_stats_season_join_requests WHERE learning_class_id = ? AND user_id = ? LIMIT 1`,
      [classId, user.id]
    );
    const row = rows?.[0];
    return res.status(jrRow ? 200 : 201).json({
      ok: true,
      request: { id: Number(row?.id), status: String(row?.status || 'pending') }
    });
  } catch (e) { next(e); }
};

/**
 * GET /summit-stats/clubs/:clubId/seasons/:classId/join-requests
 * Managers — list pending season join requests.
 */
export const listSeasonJoinRequests = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.clubId);
    const classId = toInt(req.params.classId);
    if (!clubId || !classId) return res.status(400).json({ error: { message: 'Invalid club or season' } });
    const club = await assertManagerAccess(req, res, clubId);
    if (!club) return;

    const klass = await LearningProgramClass.findById(classId);
    if (!klass || Number(klass.organization_id) !== clubId) {
      return res.status(404).json({ error: { message: 'Season not found' } });
    }

    let rows = [];
    try {
      const [r] = await pool.execute(
        `SELECT r.id, r.user_id, r.status, r.created_at,
                u.first_name, u.last_name, u.email
         FROM summit_stats_season_join_requests r
         INNER JOIN users u ON u.id = r.user_id
         WHERE r.learning_class_id = ? AND r.agency_id = ?
         ORDER BY r.created_at DESC
         LIMIT 200`,
        [classId, clubId]
      );
      rows = r || [];
    } catch (e) {
      if (String(e?.code) === 'ER_NO_SUCH_TABLE') {
        return res.json({ requests: [] });
      }
      throw e;
    }

    const requests = rows.map((row) => ({
      id: Number(row.id),
      userId: Number(row.user_id),
      status: String(row.status || ''),
      createdAt: row.created_at || null,
      firstName: String(row.first_name || '').trim(),
      lastName: String(row.last_name || '').trim(),
      email: String(row.email || '').trim()
    }));

    return res.json({ requests });
  } catch (e) { next(e); }
};

/**
 * PUT /summit-stats/clubs/:clubId/seasons/:classId/join-requests/:requestId
 * Body: { status: 'approved' | 'denied' }
 */
export const reviewSeasonJoinRequest = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.clubId);
    const classId = toInt(req.params.classId);
    const requestId = toInt(req.params.requestId);
    const nextStatus = String(req.body?.status || '').toLowerCase();
    if (!clubId || !classId || !requestId) return res.status(400).json({ error: { message: 'Invalid parameters' } });
    if (!['approved', 'denied'].includes(nextStatus)) {
      return res.status(400).json({ error: { message: 'status must be approved or denied' } });
    }

    const club = await assertManagerAccess(req, res, clubId);
    if (!club) return;

    const klass = await LearningProgramClass.findById(classId);
    if (!klass || Number(klass.organization_id) !== clubId) {
      return res.status(404).json({ error: { message: 'Season not found' } });
    }

    let reqRow = null;
    try {
      const [r] = await pool.execute(
        `SELECT id, user_id, status FROM summit_stats_season_join_requests
         WHERE id = ? AND agency_id = ? AND learning_class_id = ?
         LIMIT 1`,
        [requestId, clubId, classId]
      );
      reqRow = r?.[0] || null;
    } catch (e) {
      if (String(e?.code) === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'Season join requests are not available yet' } });
      }
      throw e;
    }
    if (!reqRow) return res.status(404).json({ error: { message: 'Request not found' } });
    if (String(reqRow.status || '') !== 'pending') {
      return res.status(400).json({ error: { message: 'Request is not pending' } });
    }

    const memberUserId = Number(reqRow.user_id);
    const reviewerId = req.user.id;

    await pool.execute(
      `UPDATE summit_stats_season_join_requests
       SET status = ?, reviewed_at = NOW(), reviewed_by_user_id = ?
       WHERE id = ?`,
      [nextStatus, reviewerId, requestId]
    );

    if (nextStatus === 'approved') {
      await LearningProgramClass.addProviderMember({
        classId,
        providerUserId: memberUserId,
        membershipStatus: 'active',
        actorUserId: reviewerId
      });
    }

    return res.json({ ok: true, status: nextStatus });
  } catch (e) { next(e); }
};

const ANNOUNCEMENT_MS_DAY = 24 * 60 * 60 * 1000;

/**
 * Team captain or club manager: post a scheduled announcement to this team only (roster-backed recipient_user_ids).
 * POST /summit-stats/clubs/:clubId/seasons/:classId/teams/:teamId/announcements
 */
export const postTeamAnnouncementForTeam = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.clubId);
    const classId = toInt(req.params.classId);
    const teamId = toInt(req.params.teamId);
    const userId = toInt(req.user?.id);
    if (!clubId || !classId || !teamId || !userId) {
      return res.status(400).json({ error: { message: 'Invalid parameters' } });
    }

    const agencies = await User.getAgencies(userId);
    const hasClub = (agencies || []).some((a) => Number(a?.id) === clubId);
    if (!hasClub && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Not authorized for this club' } });
    }

    const [teamRows] = await pool.execute(
      `SELECT t.id, t.team_manager_user_id, t.learning_class_id, c.organization_id
       FROM challenge_teams t
       INNER JOIN learning_program_classes c ON c.id = t.learning_class_id
       WHERE t.id = ? AND t.learning_class_id = ? AND c.organization_id = ?
       LIMIT 1`,
      [teamId, classId, clubId]
    );
    const team = teamRows?.[0];
    if (!team) return res.status(404).json({ error: { message: 'Team not found for this season and club' } });

    const isCaptain = Number(team.team_manager_user_id) === userId;
    const canManage = await canUserManageClub({ user: req.user, clubId });
    if (!isCaptain && !canManage) {
      return res.status(403).json({ error: { message: 'Team captain or club manager access required' } });
    }

    const [memberRows] = await pool.execute(
      `SELECT DISTINCT provider_user_id FROM challenge_team_members WHERE team_id = ?`,
      [teamId]
    );
    const recipientUserIds = [...new Set((memberRows || []).map((r) => Number(r.provider_user_id)).filter((n) => n > 0))];
    if (!recipientUserIds.length) {
      return res.status(400).json({ error: { message: 'No team members to message' } });
    }

    const titleRaw = req.body?.title;
    const title = titleRaw === null || titleRaw === undefined ? null : String(titleRaw || '').trim().slice(0, 255) || null;
    const message = String(req.body?.message || '').trim();
    const displayTypeRaw = String(req.body?.displayType || req.body?.display_type || 'announcement').trim().toLowerCase();
    // 'message' = post only to the team chat thread (no banner / splash row).
    const displayType = displayTypeRaw === 'splash'
      ? 'splash'
      : displayTypeRaw === 'message'
        ? 'message'
        : 'announcement';
    const splashImageUrl = normalizeSplashImageUrl(req.body?.splashImageUrl ?? req.body?.splash_image_url);
    if (req.body?.splashImageUrl != null || req.body?.splash_image_url != null) {
      const raw = req.body?.splashImageUrl ?? req.body?.splash_image_url;
      if (raw !== null && raw !== undefined && String(raw).trim() !== '' && !splashImageUrl) {
        return res.status(400).json({ error: { message: 'splash_image_url must be a valid http(s) URL or /uploads path (max 512 chars)' } });
      }
    }

    if (!message) return res.status(400).json({ error: { message: 'Message is required' } });
    if (message.length > 1200) return res.status(400).json({ error: { message: 'Message is too long (max 1200 characters)' } });

    // starts_at / ends_at are only required for banner / splash rows.
    const writeAnnouncementRow = displayType !== 'message';
    let startsAt = null;
    let endsAt = null;
    if (writeAnnouncementRow) {
      const startsAtRaw = req.body?.starts_at || req.body?.startsAt;
      const endsAtRaw = req.body?.ends_at || req.body?.endsAt;
      if (!startsAtRaw || !endsAtRaw) return res.status(400).json({ error: { message: 'starts_at and ends_at are required' } });

      startsAt = new Date(startsAtRaw);
      endsAt = new Date(endsAtRaw);
      if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
        return res.status(400).json({ error: { message: 'Invalid starts_at or ends_at' } });
      }
      if (endsAt.getTime() <= startsAt.getTime()) {
        return res.status(400).json({ error: { message: 'ends_at must be after starts_at' } });
      }

      const durationDays = (endsAt.getTime() - startsAt.getTime()) / ANNOUNCEMENT_MS_DAY;
      if (durationDays > 14.0001) {
        return res.status(400).json({ error: { message: 'Announcements must be time-limited to 2 weeks maximum' } });
      }

      const maxStart = Date.now() + 364 * ANNOUNCEMENT_MS_DAY;
      if (startsAt.getTime() > maxStart) {
        return res.status(400).json({ error: { message: 'Announcements can only be scheduled up to 364 days out' } });
      }
    }

    const audience = 'everyone';

    let announcementId = null;
    if (writeAnnouncementRow) {
      const [result] = await pool.execute(
        `INSERT INTO agency_scheduled_announcements
         (agency_id, created_by_user_id, title, message, display_type, recipient_user_ids, audience, starts_at, ends_at, splash_image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clubId, userId, title, message, displayType, JSON.stringify(recipientUserIds), audience, startsAt, endsAt, splashImageUrl]
      );
      announcementId = result?.insertId ? Number(result.insertId) : null;
    }

    // Bridge: also write the announcement into the persistent team chat thread.
    let chatThreadId = null;
    let chatMessageId = null;
    try {
      const { threadId } = await getOrCreateTeamThread({ clubId, teamId });
      chatThreadId = threadId;
      const bridgedBody = title ? `${title}\n\n${message}` : message;
      const hasAnnouncementCol = await pool.execute(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = 'chat_messages' AND column_name = 'announcement_id'
          LIMIT 1`
      ).then(([r]) => r?.length > 0).catch(() => false);
      const [msgIns] = hasAnnouncementCol
        ? await pool.execute(
            `INSERT INTO chat_messages (thread_id, sender_user_id, body, announcement_id) VALUES (?, ?, ?, ?)`,
            [threadId, userId, bridgedBody, announcementId]
          )
        : await pool.execute(
            `INSERT INTO chat_messages (thread_id, sender_user_id, body) VALUES (?, ?, ?)`,
            [threadId, userId, bridgedBody]
          );
      chatMessageId = msgIns?.insertId ? Number(msgIns.insertId) : null;

      if (splashImageUrl) {
        const hasAttachmentsTable = await pool.execute(
          `SELECT 1 FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = 'chat_message_attachments'
            LIMIT 1`
        ).then(([r]) => r?.length > 0).catch(() => false);
        if (hasAttachmentsTable && chatMessageId) {
          // Strip leading host / 'uploads/' so the chat layer reconstructs it consistently.
          let storedPath = String(splashImageUrl);
          const upIdx = storedPath.indexOf('/uploads/');
          if (upIdx >= 0) storedPath = storedPath.slice(upIdx + '/uploads/'.length);
          await pool.execute(
            `INSERT INTO chat_message_attachments
               (message_id, file_path, mime_type, file_kind, original_filename)
             VALUES (?, ?, ?, 'image', NULL)`,
            [chatMessageId, storedPath.slice(0, 512), 'image/*']
          );
        }
      }

      await pool.execute('UPDATE chat_threads SET updated_at = NOW() WHERE id = ?', [threadId]);
    } catch (bridgeErr) {
      // Bridging is best-effort - never fail the announcement because chat is not ready.
      console.warn('[messages] Failed to bridge team announcement into chat thread:', bridgeErr?.message || bridgeErr);
    }

    return res.status(201).json({
      announcement: announcementId
        ? {
            id: announcementId,
            agency_id: clubId,
            learning_class_id: classId,
            team_id: teamId,
            title,
            message,
            splash_image_url: splashImageUrl,
            display_type: displayType,
            recipient_user_ids: recipientUserIds,
            audience,
            starts_at: startsAt,
            ends_at: endsAt,
            created_by_user_id: userId
          }
        : null,
      chat: chatThreadId ? { thread_id: chatThreadId, message_id: chatMessageId } : null
    });
  } catch (e) {
    next(e);
  }
};
