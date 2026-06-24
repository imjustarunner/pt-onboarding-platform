import pool from '../config/database.js';
import User from '../models/User.model.js';
import Notification from '../models/Notification.model.js';
import HiringProfile from '../models/HiringProfile.model.js';
import HiringNote from '../models/HiringNote.model.js';
import HiringResearchReport from '../models/HiringResearchReport.model.js';
import HiringResumeParse from '../models/HiringResumeParse.model.js';
import HiringJobDescription from '../models/HiringJobDescription.model.js';
import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';
import StorageService from '../services/storage.service.js';
import {
  generatePreScreenReportWithGeminiApiKey,
  generatePreScreenReportWithGoogleSearch,
  generatePreScreenReportWithVertexNoSearch
} from '../services/preScreenResearch.service.js';
import { extractResumeTextFromUpload } from '../services/resumeTextExtraction.service.js';
import { generateResumeSummaryJson } from '../services/resumeStructuring.service.js';
import { extractResumePhotoPngFromPdf } from '../services/resumePhotoExtraction.service.js';
import config from '../config/config.js';
import {
  listPendingInterviewSplashesForUser,
  submitInterviewSplashAttendance,
  submitInterviewSplashCapsule,
  listPendingTimeCapsuleRevealsForUser,
  openTimeCapsuleReveal,
  acknowledgeTimeCapsuleReveal,
  snoozeTimeCapsuleReveal
} from '../services/hiringInterviewCapsule.service.js';
import HiringReferenceRequest from '../models/HiringReferenceRequest.model.js';
import EmailService from '../services/email.service.js';
import UserActivityLog from '../models/UserActivityLog.model.js';
import { createAndSendReferenceRequests } from '../services/hiringReferenceRequests.service.js';

function parseIntParam(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

async function ensureAgencyAccess(req, agencyId) {
  if (!agencyId) {
    const err = new Error('Agency ID required');
    err.status = 400;
    throw err;
  }
  if (req.user?.role === 'super_admin') return true;

  const agencies = await User.getAgencies(req.user.id);
  const ok = (agencies || []).some((a) => Number(a.id) === Number(agencyId));
  if (!ok) {
    const err = new Error('You do not have access to this agency');
    err.status = 403;
    throw err;
  }
  return true;
}

async function ensureCandidateInAgency(candidateUserId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM user_agencies
     WHERE user_id = ? AND agency_id = ?
     LIMIT 1`,
    [candidateUserId, agencyId]
  );
  return rows.length > 0;
}

function parseMetadata(metadata) {
  if (!metadata) return null;
  if (typeof metadata === 'object') return metadata;
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  }
  return null;
}

function parseJsonBodyValue(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'object') return value;
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error(`${fieldName} must be valid JSON`);
    err.status = 400;
    throw err;
  }
}

function compactText(value, max = 240) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  return raw ? raw.slice(0, max) : '';
}

function sanitizeApplicationPageJson(raw) {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const normalizeItems = (items, maxItems) => {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const title = compactText(item.title, 80);
        const body = compactText(item.body || item.description, 180);
        if (!title && !body) return null;
        return {
          icon: compactText(item.icon, 32),
          title,
          body
        };
      })
      .filter(Boolean)
      .slice(0, maxItems);
  };

  const out = {
    heroHeadline: compactText(raw.heroHeadline || raw.hero_headline, 120),
    heroSubheadline: compactText(raw.heroSubheadline || raw.hero_subheadline, 120),
    accentColor: compactText(raw.accentColor || raw.accent_color, 24),
    navItems: Array.isArray(raw.navItems || raw.nav_items)
      ? (raw.navItems || raw.nav_items)
          .map((n) => ({
            label: compactText(n?.label, 60),
            href: compactText(n?.href || n?.url, 512),
            style: String(n?.style || 'link').trim() === 'button' ? 'button' : 'link'
          }))
          .filter((n) => n.label)
          .slice(0, 6)
      : [],
    eyebrow: compactText(raw.eyebrow, 80),
    lead: compactText(raw.lead, 160),
    titleHighlight: compactText(raw.titleHighlight || raw.title_highlight, 120),
    heroImageUrl: compactText(raw.heroImageUrl || raw.hero_image_url, 1024),
    heroImageAlt: compactText(raw.heroImageAlt || raw.hero_image_alt, 160),
    heroImagePosition: compactText(raw.heroImagePosition || raw.hero_image_position, 80),
    secureTitle: compactText(raw.secureTitle || raw.secure_title, 80),
    secureSubtitle: compactText(raw.secureSubtitle || raw.secure_subtitle, 120),
    startHeading: compactText(raw.startHeading || raw.start_heading, 120),
    startSubtitle: compactText(raw.startSubtitle || raw.start_subtitle, 180),
    startButtonText: compactText(raw.startButtonText || raw.start_button_text, 80),
    startTimeNote: compactText(raw.startTimeNote || raw.start_time_note, 120),
    showLeafAccent: raw.showLeafAccent !== false && raw.show_leaf_accent !== false,
    bannerText: compactText(raw.bannerText || raw.banner_text, 240),
    bannerBullets: Array.isArray(raw.bannerBullets || raw.banner_bullets)
      ? (raw.bannerBullets || raw.banner_bullets)
          .map((b) => compactText(String(b || ''), 120))
          .filter(Boolean)
          .slice(0, 6)
      : [],
    bannerLinkText: compactText(raw.bannerLinkText || raw.banner_link_text, 80),
    bannerLinkHref: compactText(raw.bannerLinkHref || raw.banner_link_href, 512),
    iconUrl: compactText(raw.iconUrl || raw.icon_url, 512),
    iconAlt: compactText(raw.iconAlt || raw.icon_alt, 120),
    featureCards: normalizeItems(raw.featureCards || raw.feature_cards, 4),
    trustItems: normalizeItems(raw.trustItems || raw.trust_items, 3)
  };

  return Object.values(out).some((v) => (Array.isArray(v) ? v.length > 0 : !!v)) ? out : null;
}

async function saveJobIconImageUpload({ req, agencyId, applicationPageJson }) {
  const iconImage = getUploadedFile(req, 'jobIcon');
  if (!iconImage) return applicationPageJson;
  const mimeType = String(iconImage.mimetype || '').trim().toLowerCase();
  if (!mimeType.startsWith('image/')) {
    const err = new Error('Job icon must be an image file');
    err.status = 400;
    throw err;
  }
  const originalName = iconImage.originalname || 'job-icon';
  const ext = originalName.includes('.') ? originalName.split('.').pop() : 'png';
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const filename = StorageService.sanitizeFilename(`job-icon-${agencyId}-${uniqueSuffix}.${ext}`);
  const storageResult = await StorageService.savePublicMarketingAsset(iconImage.buffer, filename, iconImage.mimetype);
  const publicRel = String(storageResult.relativePath || storageResult.path || '').replace(/^uploads\//, '');
  if (!publicRel) return applicationPageJson;
  return {
    ...(applicationPageJson || {}),
    iconUrl: `/uploads/${publicRel}`,
    iconAlt: compactText((applicationPageJson || {}).iconAlt || 'Job icon', 120)
  };
}

function getApplicationPageJsonFromBody(body) {
  const parsed = parseJsonBodyValue(
    body?.applicationPageJson !== undefined ? body.applicationPageJson : body?.application_page_json,
    'applicationPageJson'
  );
  return sanitizeApplicationPageJson(parsed);
}

function getUploadedFile(req, fieldName = 'file') {
  if (fieldName === 'file' && req.file) return req.file;
  const list = req.files?.[fieldName];
  return Array.isArray(list) && list.length ? list[0] : null;
}

async function saveJobHeroImageUpload({ req, agencyId, applicationPageJson }) {
  const heroImage = getUploadedFile(req, 'heroImage');
  if (!heroImage) return applicationPageJson;

  const mimeType = String(heroImage.mimetype || '').trim().toLowerCase();
  if (!mimeType.startsWith('image/')) {
    const err = new Error('Hero image must be an image file');
    err.status = 400;
    throw err;
  }

  const originalName = heroImage.originalname || 'job-hero';
  const safeExt = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const filename = `job-hero-${agencyId}-${uniqueSuffix}${safeExt}`;
  const storageResult = await StorageService.savePublicMarketingAsset(heroImage.buffer, filename, heroImage.mimetype);
  const filePath = storageResult.relativePath;
  const publicRel = String(filePath || '').startsWith('uploads/')
    ? String(filePath).substring('uploads/'.length)
    : String(filePath || '');

  return {
    ...(applicationPageJson || {}),
    heroImageUrl: `/uploads/${publicRel}`,
    heroImageAlt: compactText(applicationPageJson?.heroImageAlt || 'Job application image', 160)
  };
}

async function saveAgencyCareersHeroImageUpload({ req, agencyId, careersPageJson }) {
  const heroImage = getUploadedFile(req, 'agencyHeroImage');
  if (!heroImage) return careersPageJson;

  const mimeType = String(heroImage.mimetype || '').trim().toLowerCase();
  if (!mimeType.startsWith('image/')) {
    const err = new Error('Careers page photo must be an image');
    err.status = 400;
    throw err;
  }

  const originalName = heroImage.originalname || 'agency-careers-hero';
  const ext = originalName.includes('.') ? originalName.split('.').pop() : 'png';
  const base = originalName.replace(/\.[^.]+$/, '') || 'agency-careers-hero';
  const filename = StorageService.sanitizeFilename(`agency-${agencyId}-careers-${Date.now()}-${base}.${ext}`);
  const storageResult = await StorageService.savePublicMarketingAsset(heroImage.buffer, filename, heroImage.mimetype);
  const publicRel = String(storageResult.relativePath || storageResult.path || '').replace(/^uploads\//, '');
  if (!publicRel) {
    const err = new Error('Unable to save careers page photo');
    err.status = 500;
    throw err;
  }

  return {
    ...(careersPageJson || {}),
    heroImageUrl: `/uploads/${publicRel}`,
    heroImageAlt: compactText(careersPageJson?.heroImageAlt || 'Careers page image', 160)
  };
}

export const getAgencyCareersPage = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query?.agencyId || req.params?.agencyId || req.body?.agencyId);
    await ensureAgencyAccess(req, agencyId);
    const [rows] = await pool.execute(
      `SELECT careers_page_json FROM agencies WHERE id = ? LIMIT 1`,
      [agencyId]
    );
    if (!rows?.length) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }
    return res.json({
      careersPage: sanitizeApplicationPageJson(parseMetadata(rows[0].careers_page_json)) || null
    });
  } catch (error) {
    return next(error);
  }
};

export const updateAgencyCareersPage = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query?.agencyId || req.params?.agencyId);
    await ensureAgencyAccess(req, agencyId);
    let careersPageJson = parseJsonBodyValue(
      req.body?.careersPageJson !== undefined ? req.body.careersPageJson : req.body?.careers_page_json,
      'careersPageJson'
    );
    careersPageJson = sanitizeApplicationPageJson(careersPageJson);
    careersPageJson = await saveAgencyCareersHeroImageUpload({ req, agencyId, careersPageJson });
    careersPageJson = sanitizeApplicationPageJson(careersPageJson);

    const [result] = await pool.execute(
      `UPDATE agencies SET careers_page_json = ? WHERE id = ?`,
      [careersPageJson ? JSON.stringify(careersPageJson) : null, agencyId]
    );
    if (!result?.affectedRows) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }
    return res.json({ careersPage: careersPageJson || null });
  } catch (error) {
    return next(error);
  }
};

function normalizeDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function hiringStageLabel(stage) {
  const s = String(stage || 'applied').trim().toLowerCase().replace(/\s+/g, '_');
  if (s === 'not_hired') return 'Not hired';
  if (s === 'hired') return 'Hired';
  if (!s || s === 'applied') return 'Applied';
  return s
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

async function markHiringCandidateViewed(agencyId, candidateUserId, viewerUserId) {
  const a = parseIntParam(agencyId);
  const c = parseIntParam(candidateUserId);
  const v = parseIntParam(viewerUserId);
  if (!a || !c || !v) return;
  try {
    await pool.execute(
      `INSERT INTO hiring_candidate_views (agency_id, candidate_user_id, viewer_user_id, first_viewed_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE first_viewed_at = hiring_candidate_views.first_viewed_at`,
      [a, c, v]
    );
  } catch {
    // Missing migration 705 or table — ignore
  }
}

export const listCandidates = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const status = req.query.status ? String(req.query.status).trim() : 'PROSPECTIVE';
    const statusNorm = String(status || '').trim().toUpperCase();
    const stageFilter = String(req.query.stageFilter || '').trim().toLowerCase();
    const q = String(req.query.q || '').trim();
    const jobDescriptionId = req.query.jobDescriptionId ? parseInt(req.query.jobDescriptionId, 10) : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);

    // IMPORTANT:
    // - Primary intent is "prospective applicants".
    // - Some DBs may not yet support users.status='PROSPECTIVE' (enum not migrated),
    //   and our User.create() will normalize to a fallback status.
    // To prevent "created then disappeared" behavior, we include any record that has a
    // hiring_profile and is not marked hired, when the caller asks for PROSPECTIVE.
    const viewerId = parseIntParam(req.user?.id) || 0;
    const params = [agencyId, viewerId];
    let whereSql = '';
    if (stageFilter === 'archived') {
      whereSql = `
        WHERE (
          u.status = 'ARCHIVED'
          OR (u.is_archived = TRUE)
        )
      `;
    } else if (stageFilter === 'not_hired') {
      whereSql = `
        WHERE (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL))
          AND LOWER(COALESCE(hp.stage, 'applied')) = 'not_hired'
      `;
    } else if (stageFilter === 'hired') {
      whereSql = `
        WHERE (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL))
          AND LOWER(COALESCE(hp.stage, 'applied')) = 'hired'
      `;
    } else if (stageFilter === 'all') {
      whereSql = `
        WHERE (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL))
          AND hp.candidate_user_id IS NOT NULL
      `;
    } else if (statusNorm === 'PROSPECTIVE') {
      // "Applicants" / default list: never show hired or not_hired, even when u.status is still PROSPECTIVE
      // (the old OR allowed not_hired rows through the first branch).
      whereSql = `
        WHERE (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL))
          AND (
            u.status = 'PROSPECTIVE'
            OR hp.candidate_user_id IS NOT NULL
          )
          AND (
            hp.id IS NULL
            OR LOWER(COALESCE(hp.stage, 'applied')) NOT IN ('hired', 'not_hired')
          )
      `;
    } else {
      whereSql = `WHERE (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL)) AND u.status = ?`;
      params.push(status);
    }

    if (q) {
      whereSql += ` AND (
        u.first_name LIKE ?
        OR u.last_name LIKE ?
        OR u.email LIKE ?
        OR u.personal_email LIKE ?
      )`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (jobDescriptionId && Number.isFinite(jobDescriptionId)) {
      whereSql += ` AND hp.job_description_id = ?`;
      params.push(jobDescriptionId);
    }

    const selectCore = `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.personal_email,
        u.phone_number,
        u.role,
        u.status,
        hp.stage,
        hp.applied_role,
        hp.source,
        hp.job_description_id,
        jd.title AS job_title,
        COALESCE(email_dupe.cnt, 0) AS duplicate_application_count,
        hp.created_at AS hiring_created_at,
        hp.updated_at AS hiring_updated_at
        __VIEW_COLS__
      FROM users u
      JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
      LEFT JOIN hiring_profiles hp
        ON hp.id = (
          SELECT hp_latest.id
          FROM hiring_profiles hp_latest
          WHERE hp_latest.candidate_user_id = u.id
          ORDER BY hp_latest.updated_at DESC, hp_latest.id DESC
          LIMIT 1
        )
      LEFT JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id
      __VIEW_JOIN__
      LEFT JOIN (
        SELECT
          ua2.agency_id,
          LOWER(TRIM(COALESCE(NULLIF(u2.personal_email, ''), u2.email))) AS email_key,
          COUNT(*) AS cnt
        FROM users u2
        JOIN user_agencies ua2 ON ua2.user_id = u2.id
        WHERE EXISTS (
            SELECT 1
            FROM hiring_profiles hp2
            WHERE hp2.candidate_user_id = u2.id
          )
          AND u2.status != 'ARCHIVED'
          AND (u2.is_archived = FALSE OR u2.is_archived IS NULL)
          AND COALESCE(NULLIF(u2.personal_email, ''), u2.email) IS NOT NULL
          AND TRIM(COALESCE(NULLIF(u2.personal_email, ''), u2.email)) != ''
        GROUP BY ua2.agency_id, LOWER(TRIM(COALESCE(NULLIF(u2.personal_email, ''), u2.email)))
      ) email_dupe
        ON email_dupe.agency_id = ua.agency_id
       AND email_dupe.email_key = LOWER(TRIM(COALESCE(NULLIF(u.personal_email, ''), u.email)))
      ${whereSql}
      ORDER BY COALESCE(hp.updated_at, hp.created_at, u.created_at) DESC, u.id DESC
      LIMIT ${limit}`;

    let rows;
    try {
      const sql = selectCore
        .replace('__VIEW_COLS__', `, (hcv.first_viewed_at IS NULL) AS is_new_for_me, hcv.first_viewed_at AS hiring_first_viewed_at`)
        .replace(
          '__VIEW_JOIN__',
          `LEFT JOIN hiring_candidate_views hcv
            ON hcv.agency_id = ua.agency_id AND hcv.candidate_user_id = u.id AND hcv.viewer_user_id = ?`
        );
      const exec = await pool.execute(sql, params);
      rows = exec[0];
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE' && String(e?.message || '').includes('hiring_candidate_views')) {
        const sqlLegacy = selectCore.replace('__VIEW_COLS__', '').replace('__VIEW_JOIN__', '');
        const legacyParams = [agencyId, ...params.slice(2)];
        const execLegacy = await pool.execute(sqlLegacy, legacyParams);
        rows = execLegacy[0];
      } else {
        throw e;
      }
    }

    res.json(
      (rows || []).map((r) => ({
        ...r,
        stage_label: hiringStageLabel(r.stage),
        is_new_for_me: !!(r.is_new_for_me === 1 || r.is_new_for_me === true)
      }))
    );
  } catch (e) {
    // Common deployment issue: DB migrations not run yet for hiring tables.
    if (e?.code === 'ER_NO_SUCH_TABLE' || String(e?.message || '').includes('hiring_profiles')) {
      return res.status(503).json({
        error: {
          message:
            'Hiring feature not available (database migrations not run yet). Run migrations 268-271 (and 270 for hiring tables).'
        }
      });
    }
    next(e);
  }
};

export const createCandidate = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const firstName = String(req.body?.firstName || '').trim() || null;
    const lastName = String(req.body?.lastName || '').trim();
    const personalEmail = String(req.body?.personalEmail || req.body?.email || '').trim();
    const phoneNumber = req.body?.phoneNumber !== undefined ? String(req.body.phoneNumber || '').trim() : null;
    const appliedRole = req.body?.appliedRole !== undefined ? String(req.body.appliedRole || '').trim() : null;
    const source = req.body?.source !== undefined ? String(req.body.source || '').trim() : null;
    const stage = req.body?.stage !== undefined ? String(req.body.stage || '').trim() : 'applied';
    const role = req.body?.role ? String(req.body.role).trim() : 'provider';
    const jobDescriptionId = req.body?.jobDescriptionId !== undefined && req.body?.jobDescriptionId !== null && req.body?.jobDescriptionId !== ''
      ? parseIntParam(req.body.jobDescriptionId)
      : null;
    const coverLetterText = req.body?.coverLetterText !== undefined
      ? String(req.body.coverLetterText || '').trim().slice(0, 20000) || null
      : null;

    if (!lastName) return res.status(400).json({ error: { message: 'Last name is required' } });
    if (!personalEmail) return res.status(400).json({ error: { message: 'personalEmail is required' } });

    if (jobDescriptionId) {
      const jd = await HiringJobDescription.findById(jobDescriptionId);
      if (!jd || Number(jd.agency_id) !== Number(agencyId) || Number(jd.is_active) !== 1) {
        return res.status(400).json({ error: { message: 'Invalid jobDescriptionId for this agency' } });
      }
    }

    // Create candidate user record (internal-only stage).
    const user = await User.create({
      email: personalEmail,
      passwordHash: null,
      firstName,
      lastName,
      phoneNumber,
      personalEmail,
      role,
      status: 'PROSPECTIVE'
    });

    // Associate candidate to the agency for access scoping.
    await User.assignToAgency(user.id, agencyId);

    const profile = await HiringProfile.upsert({
      candidateUserId: user.id,
      stage,
      appliedRole: appliedRole || null,
      source: source || null,
      jobDescriptionId: jobDescriptionId || null,
      coverLetterText: coverLetterText || null
    });

    res.status(201).json({
      user,
      profile
    });
  } catch (e) {
    next(e);
  }
};

async function enrichHiringNotesWithEngagement(notesRows, viewerUserId) {
  const notes = notesRows || [];
  if (!notes.length) return [];
  const ids = notes.map((n) => n.id).filter(Boolean);
  if (!ids.length) return notes;
  const placeholders = ids.map(() => '?').join(',');
  try {
    const [kudosRows] = await pool.execute(
      `SELECT note_id, user_id FROM hiring_note_kudos WHERE note_id IN (${placeholders})`,
      ids
    );
    const [rxRows] = await pool.execute(
      `SELECT note_id, user_id, emoji FROM hiring_note_reactions WHERE note_id IN (${placeholders})`,
      ids
    );
    const kudosByNote = new Map();
    for (const k of kudosRows || []) {
      if (!kudosByNote.has(k.note_id)) kudosByNote.set(k.note_id, []);
      kudosByNote.get(k.note_id).push(Number(k.user_id));
    }
    const rxByNote = new Map();
    for (const r of rxRows || []) {
      if (!rxByNote.has(r.note_id)) rxByNote.set(r.note_id, []);
      rxByNote.get(r.note_id).push({ userId: Number(r.user_id), emoji: String(r.emoji || '').trim() });
    }
    const vid = parseIntParam(viewerUserId);
    return notes.map((n) => {
      const givers = kudosByNote.get(n.id) || [];
      const reactions = rxByNote.get(n.id) || [];
      return {
        ...n,
        kudos_count: givers.length,
        kudos_user_ids: givers,
        my_kudos: !!(vid && givers.includes(vid)),
        reactions,
        my_reactions: reactions.filter((r) => vid && Number(r.userId) === vid)
      };
    });
  } catch {
    return notes.map((n) => ({
      ...n,
      kudos_count: 0,
      kudos_user_ids: [],
      my_kudos: false,
      reactions: [],
      my_reactions: []
    }));
  }
}

async function listHiringCandidateReviews(agencyId, candidateUserId) {
  try {
    const [rows] = await pool.execute(
      `SELECT r.id, r.agency_id, r.candidate_user_id, r.author_user_id, r.rating, r.body, r.created_at,
              u.first_name AS author_first_name,
              u.last_name AS author_last_name,
              u.email AS author_email
       FROM hiring_candidate_reviews r
       JOIN users u ON u.id = r.author_user_id
       WHERE r.agency_id = ? AND r.candidate_user_id = ?
       ORDER BY r.created_at DESC
       LIMIT 200`,
      [agencyId, candidateUserId]
    );
    return rows || [];
  } catch {
    return [];
  }
}

async function listMySealedCapsulesForProfile(hiringProfileId, authorUserId) {
  if (!hiringProfileId || !authorUserId) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT id, horizon_months,
         CASE WHEN splash_acknowledged_at IS NOT NULL THEN body_text ELSE NULL END AS body_text,
         anchor_at, reveal_at, splash_acknowledged_at, created_at
       FROM time_capsule_entries
       WHERE subject_type = 'hiring_interview' AND subject_id = ? AND author_user_id = ?
       ORDER BY horizon_months ASC`,
      [hiringProfileId, authorUserId]
    );
    return rows || [];
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      try {
        const [rows] = await pool.execute(
          `SELECT id, horizon_months, NULL AS body_text, anchor_at, reveal_at, created_at
           FROM time_capsule_entries
           WHERE subject_type = 'hiring_interview' AND subject_id = ? AND author_user_id = ?
           ORDER BY horizon_months ASC`,
          [hiringProfileId, authorUserId]
        );
        return rows || [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

export const getCandidate = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const user = await User.findById(candidateUserId);
    if (!user) return res.status(404).json({ error: { message: 'Candidate not found' } });

    const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
    const notesRaw = await HiringNote.listByCandidateUserId(candidateUserId, { limit: 200 });
    const notes = await enrichHiringNotesWithEngagement(notesRaw, req.user?.id);
    const reviews = await listHiringCandidateReviews(agencyId, candidateUserId);
    const latestResearch = await HiringResearchReport.findLatestByCandidateUserId(candidateUserId);
    const latestPreScreen = await HiringResearchReport.findLatestAiByCandidateUserId(candidateUserId);

    let jobDescription = null;
    if (profile?.job_description_id) {
      const jd = await HiringJobDescription.findById(profile.job_description_id);
      if (jd && Number(jd.agency_id) === Number(agencyId)) jobDescription = jd;
    }

    await markHiringCandidateViewed(agencyId, candidateUserId, req.user.id);

    const hiringProfileId = profile?.id != null ? parseInt(profile.id, 10) : null;
    const myTimeCapsules = await listMySealedCapsulesForProfile(hiringProfileId, req.user.id);

    res.json({
      user,
      profile: profile
        ? {
            ...profile,
            stage_label: hiringStageLabel(profile.stage),
            interview_starts_at: profile.interview_starts_at ?? null,
            interview_timezone: profile.interview_timezone ?? null,
            interview_status: profile.interview_status ?? null,
            interview_interviewer_user_ids: profile.interview_interviewer_user_ids ?? null,
            interview_scheduled_by_user_id: profile.interview_scheduled_by_user_id ?? null,
            interview_updated_at: profile.interview_updated_at ?? null
          }
        : profile,
      jobDescription,
      notes,
      reviews,
      myTimeCapsules,
      latestResearch,
      latestPreScreen
    });
  } catch (e) {
    next(e);
  }
};

export const listJobDescriptions = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const includeInactive = String(req.query.includeInactive || '').trim() === '1';
    const rows = await HiringJobDescription.listByAgencyId(agencyId, { includeInactive, limit: 500 });
    const parseTags = (raw) => {
      try {
        const t = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
        return Array.isArray(t) ? t.map((s) => String(s || '').trim()).filter(Boolean) : [];
      } catch { return []; }
    };
    res.json(
      (rows || []).map((r) => ({
        id: r.id,
        agencyId: r.agency_id,
        title: r.title,
        descriptionText: r.description_text || null,
        hasFile: !!r.storage_path,
        originalName: r.original_name || null,
        mimeType: r.mime_type || null,
        postedDate: r.posted_date || null,
        applicationDeadline: r.application_deadline || null,
        city: r.city || null,
        state: r.state || null,
        educationLevel: r.education_level || null,
        roleType: String(r.role_type || '').trim() || null,
        isFeatured: Number(r.is_featured) === 1,
        tags: parseTags(r.tags_json),
        applicationPage: sanitizeApplicationPageJson(parseMetadata(r.application_page_json)) || null,
        isActive: r.is_active === 1 || r.is_active === true,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    );
  } catch (e) {
    next(e);
  }
};

export const createJobDescription = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const title = String(req.body?.title || '').trim().slice(0, 255);
    const descriptionTextRaw = req.body?.descriptionText !== undefined ? String(req.body.descriptionText || '') : '';
    let descriptionText = descriptionTextRaw.trim();
    const postedDate = req.body?.postedDate !== undefined ? normalizeDateOnly(req.body.postedDate) : null;
    const applicationDeadline = req.body?.applicationDeadline !== undefined ? normalizeDateOnly(req.body.applicationDeadline) : null;
    const city = req.body?.city !== undefined ? String(req.body.city || '').trim().slice(0, 120) : null;
    const state = req.body?.state !== undefined ? String(req.body.state || '').trim().slice(0, 120) : null;
    const educationLevel = req.body?.educationLevel !== undefined ? String(req.body.educationLevel || '').trim().slice(0, 80) : null;
    const roleType = req.body?.roleType !== undefined ? String(req.body.roleType || '').trim().slice(0, 80) || null : null;
    const isFeatured = String(req.body?.isFeatured || '').trim() === '1' || req.body?.isFeatured === true;
    const tagsJsonRaw = req.body?.tagsJson !== undefined ? req.body.tagsJson : null;
    let tagsJson = null;
    if (tagsJsonRaw !== null && tagsJsonRaw !== undefined) {
      try {
        const parsed = typeof tagsJsonRaw === 'string' ? JSON.parse(tagsJsonRaw) : tagsJsonRaw;
        tagsJson = Array.isArray(parsed) ? parsed.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 20) : null;
      } catch { tagsJson = null; }
    }
    if (!title) return res.status(400).json({ error: { message: 'title is required' } });

    let applicationPageJson = getApplicationPageJsonFromBody(req.body);
    applicationPageJson = await saveJobHeroImageUpload({ req, agencyId, applicationPageJson });
    applicationPageJson = await saveJobIconImageUpload({ req, agencyId, applicationPageJson });

    let storagePath = null;
    let originalName = null;
    let mimeType = null;

    const descriptionFile = getUploadedFile(req, 'file');
    if (descriptionFile) {
      const fileBuffer = descriptionFile.buffer;
      originalName = descriptionFile.originalname || 'job-description';
      mimeType = descriptionFile.mimetype || 'application/octet-stream';

      // If the upload is plain text and no description was provided, use its content.
      if (!descriptionText && mimeType === 'text/plain') {
        try {
          descriptionText = String(fileBuffer.toString('utf8') || '').trim().slice(0, 60000);
        } catch {
          // ignore
        }
      }

      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const safeExt = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
      const filename = `job-desc-${agencyId}-${uniqueSuffix}${safeExt}`;
      const storageResult = await StorageService.saveAdminDoc(fileBuffer, filename, mimeType);
      storagePath = storageResult.relativePath;
    }

    const created = await HiringJobDescription.create({
      agencyId,
      title,
      descriptionText: descriptionText || null,
      postedDate,
      applicationDeadline,
      city: city || null,
      state: state || null,
      educationLevel: educationLevel || null,
      roleType: roleType || null,
      isFeatured,
      tagsJson,
      applicationPageJson,
      storagePath,
      originalName,
      mimeType,
      createdByUserId: req.user.id,
      isActive: true
    });

    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
};

export const updateJobDescription = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const jdId = parseIntParam(req.params.jobDescriptionId);
    if (!jdId) return res.status(400).json({ error: { message: 'Invalid jobDescriptionId' } });

    const existing = await HiringJobDescription.findById(jdId);
    if (!existing || Number(existing.agency_id) !== Number(agencyId)) {
      return res.status(404).json({ error: { message: 'Job description not found' } });
    }

    const titleRaw = req.body?.title;
    const title = titleRaw !== undefined ? String(titleRaw || '').trim().slice(0, 255) : String(existing.title || '').trim();
    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    const isActiveRaw = req.body?.isActive;
    const isActive = isActiveRaw === undefined
      ? undefined
      : (String(isActiveRaw).trim() === '1' || String(isActiveRaw).trim().toLowerCase() === 'true');

    const descriptionFile = getUploadedFile(req, 'file');
    const hasUploadedFile = !!descriptionFile;
    const replaceWithNewVersion = String(req.body?.createNewVersion || '').trim() === '1' || hasUploadedFile;

    // Uploaded JDs should be versioned by creating a new row; pasted JDs can be edited in-place.
    if (replaceWithNewVersion && Number(existing.is_active) === 1) {
      let storagePath = existing.storage_path || null;
      let originalName = existing.original_name || null;
      let mimeType = existing.mime_type || null;

      const descriptionTextRaw = req.body?.descriptionText !== undefined
        ? String(req.body.descriptionText || '')
        : String(existing.description_text || '');
      let descriptionText = descriptionTextRaw.trim();
      const postedDate = req.body?.postedDate !== undefined
        ? normalizeDateOnly(req.body.postedDate)
        : normalizeDateOnly(existing.posted_date);
      const applicationDeadline = req.body?.applicationDeadline !== undefined
        ? normalizeDateOnly(req.body.applicationDeadline)
        : normalizeDateOnly(existing.application_deadline);
      const city = req.body?.city !== undefined ? String(req.body.city || '').trim().slice(0, 120) : String(existing.city || '').trim();
      const state = req.body?.state !== undefined ? String(req.body.state || '').trim().slice(0, 120) : String(existing.state || '').trim();
      const educationLevel = req.body?.educationLevel !== undefined
        ? String(req.body.educationLevel || '').trim().slice(0, 80)
        : String(existing.education_level || '').trim();
      let applicationPageJson = req.body?.applicationPageJson !== undefined || req.body?.application_page_json !== undefined
        ? getApplicationPageJsonFromBody(req.body)
        : sanitizeApplicationPageJson(parseMetadata(existing.application_page_json));
      applicationPageJson = await saveJobHeroImageUpload({ req, agencyId, applicationPageJson });
      applicationPageJson = await saveJobIconImageUpload({ req, agencyId, applicationPageJson });

      if (hasUploadedFile) {
        const fileBuffer = descriptionFile.buffer;
        originalName = descriptionFile.originalname || 'job-description';
        mimeType = descriptionFile.mimetype || 'application/octet-stream';

        if (!descriptionText && mimeType === 'text/plain') {
          try {
            descriptionText = String(fileBuffer.toString('utf8') || '').trim().slice(0, 60000);
          } catch {
            // ignore
          }
        }

        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const safeExt = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
        const filename = `job-desc-${agencyId}-${uniqueSuffix}${safeExt}`;
        const storageResult = await StorageService.saveAdminDoc(fileBuffer, filename, mimeType);
        storagePath = storageResult.relativePath;
      }

      const vRoleType = req.body?.roleType !== undefined ? (String(req.body.roleType || '').trim().slice(0, 80) || null) : (String(existing.role_type || '').trim() || null);
      const vIsFeatured = req.body?.isFeatured !== undefined ? (String(req.body.isFeatured).trim() === '1' || req.body.isFeatured === true) : Number(existing.is_featured) === 1;
      let vTagsJson = (() => {
        try { const t = typeof existing.tags_json === 'string' ? JSON.parse(existing.tags_json) : (existing.tags_json || []); return Array.isArray(t) ? t : null; } catch { return null; }
      })();
      if (req.body?.tagsJson !== undefined) {
        try {
          const parsed = typeof req.body.tagsJson === 'string' ? JSON.parse(req.body.tagsJson) : req.body.tagsJson;
          vTagsJson = Array.isArray(parsed) ? parsed.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 20) : null;
        } catch { vTagsJson = null; }
      }
      const created = await HiringJobDescription.create({
        agencyId,
        title,
        descriptionText: descriptionText || null,
        postedDate,
        applicationDeadline,
        city: city || null,
        state: state || null,
        educationLevel: educationLevel || null,
        roleType: vRoleType,
        isFeatured: vIsFeatured,
        tagsJson: vTagsJson,
        applicationPageJson,
        storagePath: storagePath || null,
        originalName: originalName || null,
        mimeType: mimeType || null,
        createdByUserId: req.user.id,
        isActive: true
      });
      await HiringJobDescription.deactivateById(existing.id);
      return res.json({
        ...created,
        replacedJobDescriptionId: existing.id
      });
    }

    // For uploaded-file jobs: metadata fields (title, city, state, education level,
    // description, dates) can always be edited in-place. Only the document itself
    // requires uploading a replacement file, which is handled above via createNewVersion.

    const descriptionText = req.body?.descriptionText !== undefined
      ? String(req.body.descriptionText || '').trim()
      : existing.description_text;
    const postedDate = req.body?.postedDate !== undefined ? normalizeDateOnly(req.body.postedDate) : undefined;
    const applicationDeadline = req.body?.applicationDeadline !== undefined
      ? normalizeDateOnly(req.body.applicationDeadline)
      : undefined;
    const city = req.body?.city !== undefined ? String(req.body.city || '').trim().slice(0, 120) : undefined;
    const state = req.body?.state !== undefined ? String(req.body.state || '').trim().slice(0, 120) : undefined;
    const educationLevel = req.body?.educationLevel !== undefined
      ? String(req.body.educationLevel || '').trim().slice(0, 80)
      : undefined;
    const roleType = req.body?.roleType !== undefined ? (String(req.body.roleType || '').trim().slice(0, 80) || null) : undefined;
    const isFeatured = req.body?.isFeatured !== undefined
      ? (String(req.body.isFeatured).trim() === '1' || req.body.isFeatured === true)
      : undefined;
    let tagsJson = undefined;
    if (req.body?.tagsJson !== undefined) {
      try {
        const parsed = typeof req.body.tagsJson === 'string' ? JSON.parse(req.body.tagsJson) : req.body.tagsJson;
        tagsJson = Array.isArray(parsed) ? parsed.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 20) : null;
      } catch { tagsJson = null; }
    }
    let applicationPageJson = req.body?.applicationPageJson !== undefined || req.body?.application_page_json !== undefined
      ? getApplicationPageJsonFromBody(req.body)
      : undefined;
    if (applicationPageJson !== undefined || getUploadedFile(req, 'heroImage') || getUploadedFile(req, 'jobIcon')) {
      const baseJson = applicationPageJson !== undefined
        ? applicationPageJson
        : sanitizeApplicationPageJson(parseMetadata(existing.application_page_json));
      applicationPageJson = await saveJobHeroImageUpload({ req, agencyId, applicationPageJson: baseJson });
      applicationPageJson = await saveJobIconImageUpload({ req, agencyId, applicationPageJson });
    }

    const updated = await HiringJobDescription.updateById(jdId, {
      title,
      descriptionText: descriptionText || null,
      postedDate,
      applicationDeadline,
      city: city !== undefined ? (city || null) : undefined,
      state: state !== undefined ? (state || null) : undefined,
      educationLevel: educationLevel !== undefined ? (educationLevel || null) : undefined,
      roleType,
      isFeatured,
      tagsJson,
      applicationPageJson,
      ...(isActive !== undefined ? { isActive } : {})
    });

    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const deleteJobDescription = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const jdId = parseIntParam(req.params.jobDescriptionId);
    if (!jdId) return res.status(400).json({ error: { message: 'Invalid jobDescriptionId' } });

    const existing = await HiringJobDescription.findById(jdId);
    if (!existing || Number(existing.agency_id) !== Number(agencyId)) {
      return res.status(404).json({ error: { message: 'Job description not found' } });
    }

    await HiringJobDescription.deactivateById(jdId);
    res.json({ ok: true, id: jdId });
  } catch (e) {
    next(e);
  }
};

export const viewJobDescriptionFile = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const jdId = parseIntParam(req.params.jobDescriptionId);
    if (!jdId) return res.status(400).json({ error: { message: 'Invalid jobDescriptionId' } });

    const jd = await HiringJobDescription.findById(jdId);
    if (!jd || Number(jd.agency_id) !== Number(agencyId)) {
      return res.status(404).json({ error: { message: 'Job description not found' } });
    }
    if (!jd.storage_path) {
      return res.status(404).json({ error: { message: 'No file uploaded for this job description' } });
    }

    const url = await StorageService.getSignedUrl(jd.storage_path, 10);
    res.json({
      url,
      expiresInMinutes: 10,
      originalName: jd.original_name || null,
      mimeType: jd.mime_type || null
    });
  } catch (e) {
    next(e);
  }
};

async function ensureAssignedJobDescriptionDocument(candidateUserId, reqUserId) {
  try {
    const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
    const jdId = parseIntParam(profile?.job_description_id || profile?.jobDescriptionId);
    if (!jdId) return null;

    const jd = await HiringJobDescription.findById(jdId);
    if (!jd) return null;

    const docType = 'job_description_assignment';
    const marker = `hiring_job_description_id:${jd.id}`;
    const [existingRows] = await pool.execute(
      `SELECT id
       FROM user_admin_docs
       WHERE user_id = ?
         AND doc_type = ?
         AND note_text LIKE ?
       ORDER BY id DESC
       LIMIT 1`,
      [candidateUserId, docType, `%${marker}%`]
    );
    if (existingRows?.length) return existingRows[0];

    const assignedAt = new Date().toISOString();
    const parts = [
      'source:hiring_promote',
      marker,
      `hiring_job_description_title:${String(jd.title || '').trim()}`,
      `hiring_job_description_updated_at:${jd.updated_at ? new Date(jd.updated_at).toISOString() : ''}`,
      `assigned_at:${assignedAt}`,
      '',
      '--- Snapshot ---',
      String(jd.description_text || '').trim()
    ];
    const noteText = parts.join('\n').slice(0, 600000);

    const [result] = await pool.execute(
      `INSERT INTO user_admin_docs (
        user_id, title, doc_type, note_text,
        storage_path, original_name, mime_type,
        created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        candidateUserId,
        `Job Description - ${String(jd.title || '').trim() || 'Assigned'}`,
        docType,
        noteText || null,
        jd.storage_path || null,
        jd.original_name || null,
        jd.mime_type || null,
        reqUserId
      ]
    );

    return { id: result.insertId };
  } catch {
    // Non-blocking for hiring flow.
    return null;
  }
}

export const createCandidateNote = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'message is required' } });

    const ratingRaw = req.body?.rating;
    const rating = ratingRaw === null || ratingRaw === undefined || ratingRaw === ''
      ? null
      : parseInt(ratingRaw, 10);

    const parentNoteId = parseIntParam(req.body?.parentNoteId);
    const note = await HiringNote.create({
      candidateUserId,
      authorUserId: req.user.id,
      message,
      rating: Number.isFinite(rating) ? rating : null,
      parentNoteId: parentNoteId || null
    });

    res.status(201).json(note);
  } catch (e) {
    next(e);
  }
};

export const requestCandidateResearch = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    // Placeholder: future agent/automation will fill this in.
    const report = await HiringResearchReport.create({
      candidateUserId,
      status: 'pending',
      reportText: `Research requested by user ${req.user.id} at ${new Date().toISOString()}.`,
      reportJson: null,
      createdByUserId: req.user.id
    });

    res.status(201).json(report);
  } catch (e) {
    next(e);
  }
};

async function createFailedAiReport({ candidateUserId, createdByUserId, error }) {
  const safeMessage = String(error?.message || 'AI research failed').slice(0, 400);
  const safeDetails = error?.details ? String(error.details).slice(0, 1800) : null;
  try {
    return await HiringResearchReport.create({
      candidateUserId,
      status: 'failed',
      reportText: `AI pre-screen report failed: ${safeMessage}`,
      reportJson: {
        kind: 'prescreen',
        error: {
          message: safeMessage,
          status: error?.status || null,
          details: safeDetails
        }
      },
      createdByUserId,
      isAiGenerated: true
    });
  } catch {
    return null;
  }
}

export const generateCandidatePreScreenReport = async (req, res, next) => {
  let candidateUserId = null;
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.body?.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const user = await User.findById(candidateUserId);
    if (!user) return res.status(404).json({ error: { message: 'Candidate not found' } });

    const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
    let jobDescription = null;
    if (profile?.job_description_id) {
      const jd = await HiringJobDescription.findById(profile.job_description_id);
      if (jd && Number(jd.agency_id) === Number(agencyId) && (jd.is_active === 1 || jd.is_active === true)) {
        jobDescription = jd;
      }
    }

    const candidateNameFromDb = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const candidateName = String(req.body?.candidateName || candidateNameFromDb || '').trim();
    // Prefer extracted resume text from uploaded resume(s).
    // Allow manual override via req.body.resumeText, but default should “just work” after upload.
    let resumeText = String(req.body?.resumeText || '').trim();
    if (!resumeText) {
      try {
        const latest = await HiringResumeParse.findLatestCompletedTextByCandidateUserId(candidateUserId);
        resumeText = String(latest?.extracted_text || '').trim();
      } catch (e) {
        // If the table isn't migrated yet, fall back to requiring manual paste.
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }
    resumeText = resumeText.slice(0, 20000);
    const linkedInUrl = String(req.body?.linkedInUrl || '').trim().slice(0, 800);
    const psychologyTodayUrl = String(req.body?.psychologyTodayUrl || '').trim().slice(0, 900);
    const candidateLocation = String(req.body?.candidateLocation || '').trim().slice(0, 180);
    const coverLetterText = String(req.body?.coverLetterText || profile?.cover_letter_text || '').trim().slice(0, 20000);

    // Prefer job description associated with the candidate profile; allow override via request.
    const jobTitle = String(req.body?.jobTitle || jobDescription?.title || '').trim().slice(0, 255);
    const jobDescriptionText = String(req.body?.jobDescriptionText || jobDescription?.description_text || '').trim().slice(0, 60000);

    if (!resumeText) {
      return res.status(400).json({
        error: {
          message:
            'No resume text available yet. Upload a resume PDF (with selectable text) so we can extract it, or paste resume text manually.'
        }
      });
    }

    const started = Date.now();
    let ai;
    try {
      try {
        // Preferred (grounded) path: Vertex AI with Google Search tool.
        ai = await generatePreScreenReportWithGoogleSearch({
          candidateName,
          resumeText,
          linkedInUrl,
          psychologyTodayUrl,
          candidateLocation,
          jobTitle,
          jobDescriptionText,
          coverLetterText
        });
      } catch (e) {
        // Common in some environments: Vertex+Search grounding is not permitted (403),
        // or the Vertex project/env is not configured yet (503). Fall back gracefully:
        // 1) Try Vertex without Search tool
        // 2) If GEMINI_API_KEY configured, try the API key path
        const status = e?.status;
        const canFallbackStatus = status === 403 || status === 401 || status === 503;
        if (!canFallbackStatus) throw e;

        try {
          ai = await generatePreScreenReportWithVertexNoSearch({
            candidateName,
            resumeText,
            linkedInUrl,
            psychologyTodayUrl,
            candidateLocation,
            jobTitle,
            jobDescriptionText,
            coverLetterText
          });
        } catch (e2) {
          ai = await generatePreScreenReportWithGeminiApiKey({
            candidateName,
            resumeText,
            linkedInUrl,
            psychologyTodayUrl,
            candidateLocation,
            jobTitle,
            jobDescriptionText,
            coverLetterText
          });
        }
      }
    } catch (e) {
      await createFailedAiReport({ candidateUserId, createdByUserId: req.user.id, error: e });
      if (e?.status) {
        return res.status(e.status).json({ error: { message: e.message || 'AI research failed', ...(e.details ? { details: e.details } : null) } });
      }
      throw e;
    }

    const warnings = [];
    if (!ai.isGrounded) {
      warnings.push('No source links were returned by Google Search grounding. Treat this output as unverified and review manually.');
    }

    const reportText = [
      warnings.length ? `## Warnings\n- ${warnings.join('\n- ')}\n` : '',
      ai.text
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim()
      .slice(0, 50000);

    const report = await HiringResearchReport.create({
      candidateUserId,
      status: 'completed',
      reportText,
      reportJson: {
        kind: 'prescreen',
        model: ai.modelId,
        latencyMs: ai.latencyMs,
        totalMs: Date.now() - started,
        isGrounded: ai.isGrounded,
        input: {
          candidateName: String(candidateName || '').slice(0, 180) || null,
          linkedInUrl: linkedInUrl || null,
          resumeTextLength: resumeText.length,
          coverLetterTextLength: coverLetterText ? coverLetterText.length : 0,
          jobTitle: jobTitle || null,
          jobDescriptionTextLength: jobDescriptionText ? jobDescriptionText.length : 0,
          jobDescriptionId: jobDescription?.id || null
        },
        grounding: ai.groundingMetadata || null
      },
      createdByUserId: req.user.id,
      isAiGenerated: true
    });

    res.status(201).json(report);
  } catch (e) {
    // Best-effort: if we got far enough to identify a candidate, write a failed record.
    if (candidateUserId && req.user?.id) {
      await createFailedAiReport({ candidateUserId, createdByUserId: req.user.id, error: e });
    }
    next(e);
  }
};

export const promoteCandidateToPendingSetup = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const user = await User.findById(candidateUserId);
    if (!user) return res.status(404).json({ error: { message: 'Candidate not found' } });

    // Move candidate into the existing onboarding pipeline entry point.
    const updated = await User.updateStatus(candidateUserId, 'PENDING_SETUP', req.user.id);

    // Best-effort: mark the hiring profile as hired so it no longer appears in the PROSPECTIVE list.
    try {
      const existing = await HiringProfile.findByCandidateUserId(candidateUserId);
      await HiringProfile.upsert({
        candidateUserId,
        stage: 'hired',
        appliedRole: existing?.applied_role || existing?.appliedRole || null,
        source: existing?.source || null
      });
    } catch {
      // ignore (older DBs or missing table)
    }

    // Generate a passwordless token for initial setup (7 days).
    const tokenResult = await User.generatePasswordlessToken(candidateUserId, 7 * 24);
    const tokenLink = `${config.frontendUrl}/passwordless-login/${tokenResult.token}`;

    // Preserve the exact job-description version this person was hired against.
    await ensureAssignedJobDescriptionDocument(candidateUserId, req.user.id);

    res.json({
      user: updated,
      passwordlessToken: tokenResult.token,
      passwordlessTokenLink: tokenLink
    });
  } catch (e) {
    next(e);
  }
};

export const listCandidateTasks = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const [rows] = await pool.execute(
      `SELECT *
       FROM tasks
       WHERE task_type = 'hiring'
         AND assigned_to_agency_id = ?
         AND CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.candidateUserId')) AS UNSIGNED) = ?
       ORDER BY
         CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
         due_date ASC,
         created_at DESC`,
      [agencyId, candidateUserId]
    );

    res.json((rows || []).map((r) => ({ ...r, metadata: parseMetadata(r.metadata) })));
  } catch (e) {
    next(e);
  }
};

export const createCandidateTask = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const title = String(req.body?.title || '').trim();
    const description = req.body?.description !== undefined ? String(req.body.description || '').trim() : null;
    const assignedToUserId = parseIntParam(req.body?.assignedToUserId);
    const dueDate = req.body?.dueDate || null;
    const kind = req.body?.kind !== undefined ? String(req.body.kind || '').trim() : 'call';

    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    if (!assignedToUserId) return res.status(400).json({ error: { message: 'assignedToUserId is required' } });

    // Ensure the assignee is part of the agency (keeps role-wide access consistent).
    if (req.user?.role !== 'super_admin') {
      const assigneeAgencies = await User.getAgencies(assignedToUserId);
      const ok = (assigneeAgencies || []).some((a) => Number(a.id) === Number(agencyId));
      if (!ok) {
        return res.status(400).json({ error: { message: 'Assigned user is not a member of this agency' } });
      }
    }

    const metadata = {
      entityType: 'candidate',
      candidateUserId,
      kind: kind || 'call'
    };

    const task = await Task.create({
      taskType: 'hiring',
      title,
      description: description || null,
      assignedToUserId,
      assignedToRole: null,
      assignedToAgencyId: agencyId,
      assignedByUserId: req.user.id,
      dueDate: dueDate || null,
      referenceId: null,
      metadata
    });

    await TaskAuditLog.logAction({
      taskId: task.id,
      actionType: 'assigned',
      actorUserId: req.user.id,
      targetUserId: assignedToUserId,
      metadata: { agencyId, candidateUserId, kind: kind || 'call' }
    });

    try {
      const assignee = await User.findById(assignedToUserId);
      const candidate = await User.findById(candidateUserId);
      const candName = [candidate?.first_name, candidate?.last_name].filter(Boolean).join(' ') || `User ${candidateUserId}`;
      await Notification.create({
        type: 'hiring_task_assigned',
        severity: 'info',
        title: 'Applicant task assigned',
        message: `${title} — ${candName}`,
        userId: assignedToUserId,
        agencyId,
        relatedEntityType: 'hiring_task',
        relatedEntityId: task.id,
        actorUserId: req.user.id
      });
    } catch {
      // ignore notification failures
    }

    res.status(201).json({ ...task, metadata });
  } catch (e) {
    next(e);
  }
};

export const listHiringAssignees = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const [rows] = await pool.execute(
      `SELECT DISTINCT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.role,
         u.has_hiring_access
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE u.status != 'ARCHIVED'
         AND (
           u.role IN ('admin', 'super_admin', 'support', 'staff')
           OR u.has_hiring_access = 1
         )
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [agencyId]
    );

    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const listCandidateResumes = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    // Migration safety: if hiring_resume_parses is not present yet, fall back to
    // listing resumes without parse status instead of failing the page.
    let rows = [];
    try {
      const [withParse] = await pool.execute(
        `SELECT d.*,
                rp.status AS resume_parse_status,
                rp.method AS resume_parse_method,
                rp.error_text AS resume_parse_error_text,
                rp.updated_at AS resume_parse_updated_at,
                cb.first_name AS created_by_first_name,
                cb.last_name AS created_by_last_name,
                cb.email AS created_by_email
         FROM user_admin_docs d
         LEFT JOIN hiring_resume_parses rp ON rp.resume_doc_id = d.id
         LEFT JOIN users cb ON cb.id = d.created_by_user_id
         WHERE d.user_id = ? AND d.doc_type = 'resume'
         ORDER BY d.created_at DESC`,
        [candidateUserId]
      );
      rows = withParse || [];
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      const [basic] = await pool.execute(
        `SELECT d.*,
                cb.first_name AS created_by_first_name,
                cb.last_name AS created_by_last_name,
                cb.email AS created_by_email
         FROM user_admin_docs d
         LEFT JOIN users cb ON cb.id = d.created_by_user_id
         WHERE d.user_id = ? AND d.doc_type = 'resume'
         ORDER BY d.created_at DESC`,
        [candidateUserId]
      );
      rows = basic || [];
    }

    const out = (rows || []).map((d) => ({
      id: d.id,
      userId: d.user_id,
      title: d.title,
      docType: d.doc_type,
      createdAt: d.created_at,
      createdByUserId: d.created_by_user_id,
      createdByName: [d.created_by_first_name, d.created_by_last_name].filter(Boolean).join(' ') || d.created_by_email || `User ${d.created_by_user_id}`,
      hasFile: !!d.storage_path,
      originalName: d.original_name || null,
      mimeType: d.mime_type || null,
      resumeParseStatus: d.resume_parse_status || null,
      resumeParseMethod: d.resume_parse_method || null,
      resumeParseErrorText: d.resume_parse_error_text || null,
      resumeParseUpdatedAt: d.resume_parse_updated_at || null
    }));

    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const uploadCandidateResume = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });

    const title = String(req.body?.title || 'Resume').trim() || 'Resume';
    const noteText = req.body?.noteText !== undefined ? String(req.body.noteText || '').trim() : null;

    const fileBuffer = req.file.buffer;
    const originalName = req.file.originalname || 'resume';
    const mimeType = req.file.mimetype || 'application/octet-stream';

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeExt = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
    const filename = `resume-${candidateUserId}-${uniqueSuffix}${safeExt}`;

    const storageResult = await StorageService.saveAdminDoc(fileBuffer, filename, mimeType);

    const [result] = await pool.execute(
      `INSERT INTO user_admin_docs (
        user_id, title, doc_type, note_text,
        storage_path, original_name, mime_type,
        created_by_user_id
      ) VALUES (?, ?, 'resume', ?, ?, ?, ?, ?)`,
      [
        candidateUserId,
        title,
        noteText || null,
        storageResult.relativePath,
        originalName,
        mimeType,
        req.user.id
      ]
    );

    // Extract resume text (cheapest path: PDF selectable text or plain text).
    // Best-effort: if hiring_resume_parses table isn't present yet, skip silently.
    try {
      const extraction = await extractResumeTextFromUpload({ buffer: fileBuffer, mimeType });
      await HiringResumeParse.upsertByResumeDocId({
        candidateUserId,
        resumeDocId: result.insertId,
        method: extraction.method,
        status: extraction.status,
        extractedText: extraction.text || null,
        extractedJson: null,
        errorText: extraction.errorText || null,
        createdByUserId: req.user.id
      });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // Best-effort: extract an embedded headshot image from resume PDFs and store it as an internal admin doc.
    // NOTE: we intentionally do NOT scrape LinkedIn due to brittleness/ToS concerns.
    try {
      if (String(mimeType || '').toLowerCase() === 'application/pdf') {
        const photo = await extractResumePhotoPngFromPdf({ buffer: fileBuffer });
        if (photo?.status === 'completed' && photo.pngBuffer) {
          // Remove old stored resume photos to avoid clutter.
          try {
            const [old] = await pool.execute(
              `SELECT id, storage_path
               FROM user_admin_docs
               WHERE user_id = ? AND doc_type = 'resume_photo'
               ORDER BY created_at DESC
               LIMIT 10`,
              [candidateUserId]
            );
            for (const d of old || []) {
              if (d?.storage_path) {
                try { await StorageService.deleteAdminDoc(d.storage_path); } catch { /* ignore */ }
              }
              try { await pool.execute(`DELETE FROM user_admin_docs WHERE id = ? LIMIT 1`, [d.id]); } catch { /* ignore */ }
            }
          } catch {
            // ignore cleanup
          }

          const photoName = `resume-photo-${candidateUserId}-${uniqueSuffix}.png`;
          const photoStorage = await StorageService.saveAdminDoc(photo.pngBuffer, photoName, 'image/png');
          await pool.execute(
            `INSERT INTO user_admin_docs (
              user_id, title, doc_type, note_text,
              storage_path, original_name, mime_type,
              created_by_user_id
            ) VALUES (?, ?, 'resume_photo', ?, ?, ?, ?, ?)`,
            [
              candidateUserId,
              'Resume photo',
              `source_resume_doc_id:${result.insertId}`,
              photoStorage.relativePath,
              photoName,
              'image/png',
              req.user.id
            ]
          );
        }
      }
    } catch {
      // best-effort only; never block resume upload
    }

    const [rows] = await pool.execute(
      `SELECT * FROM user_admin_docs WHERE id = ? LIMIT 1`,
      [result.insertId]
    );

    res.status(201).json(rows[0] || null);
  } catch (e) {
    next(e);
  }
};

export const viewCandidateResume = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    const docId = parseIntParam(req.params.docId);
    if (!candidateUserId || !docId) return res.status(400).json({ error: { message: 'Invalid userId or docId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const [rows] = await pool.execute(
      `SELECT * FROM user_admin_docs
       WHERE id = ? AND user_id = ? AND doc_type = 'resume'
       LIMIT 1`,
      [docId, candidateUserId]
    );
    const doc = rows[0] || null;
    if (!doc) return res.status(404).json({ error: { message: 'Resume not found' } });
    if (!doc.storage_path) return res.status(404).json({ error: { message: 'No file for this resume entry' } });

    const url = await StorageService.getSignedUrl(doc.storage_path, 10);
    res.json({
      url,
      expiresInMinutes: 10,
      originalName: doc.original_name || null,
      mimeType: doc.mime_type || null,
      noteText: doc.note_text || null,
      title: doc.title || null
    });
  } catch (e) {
    next(e);
  }
};

export const deleteCandidateResume = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    const docId = parseIntParam(req.params.docId);
    if (!candidateUserId || !docId) return res.status(400).json({ error: { message: 'Invalid userId or docId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const [rows] = await pool.execute(
      `SELECT * FROM user_admin_docs
       WHERE id = ? AND user_id = ? AND doc_type = 'resume'
       LIMIT 1`,
      [docId, candidateUserId]
    );
    const doc = rows[0] || null;
    if (!doc) return res.status(404).json({ error: { message: 'Resume not found' } });

    // Best-effort delete file from storage first.
    if (doc.storage_path) {
      await StorageService.deleteAdminDoc(doc.storage_path);
    }

    // Deleting the doc will cascade-delete hiring_resume_parses via FK (if migrated).
    await pool.execute(`DELETE FROM user_admin_docs WHERE id = ? LIMIT 1`, [docId]);

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getCandidatePhoto = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const [rows] = await pool.execute(
      `SELECT * FROM user_admin_docs
       WHERE user_id = ? AND doc_type = 'resume_photo' AND storage_path IS NOT NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [candidateUserId]
    );
    const doc = rows?.[0] || null;
    if (!doc) return res.json({ url: null });

    const url = await StorageService.getSignedUrl(doc.storage_path, 10);
    res.json({
      url,
      expiresInMinutes: 10,
      docId: doc.id,
      createdAt: doc.created_at || null
    });
  } catch (e) {
    next(e);
  }
};

export const getCandidateResumeSummary = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const latestText = await HiringResumeParse.findLatestCompletedTextByCandidateUserId(candidateUserId);
    const latestStructured = await HiringResumeParse.findLatestStructuredByCandidateUserId(candidateUserId);

    res.json({
      latestResumeDocId: latestText?.resume_doc_id || null,
      hasExtractedText: !!(latestText?.extracted_text && String(latestText.extracted_text).trim()),
      summary: latestStructured?.extracted_json || null,
      summaryUpdatedAt: latestStructured?.updated_at || null
    });
  } catch (e) {
    next(e);
  }
};

export const generateCandidateResumeSummary = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.body?.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const user = await User.findById(candidateUserId);
    if (!user) return res.status(404).json({ error: { message: 'Candidate not found' } });

    let latest = await HiringResumeParse.findLatestCompletedTextByCandidateUserId(candidateUserId);
    let resumeText = String(latest?.extracted_text || '').trim();
    let resumeDocId = Number(latest?.resume_doc_id || 0) || null;
    if (!resumeText || !resumeDocId) {
      // Fallback for pasted/plain-text resumes: read latest stored text resume docs directly.
      const [docs] = await pool.execute(
        `SELECT id, storage_path, mime_type, original_name
         FROM user_admin_docs
         WHERE user_id = ? AND doc_type = 'resume' AND storage_path IS NOT NULL
         ORDER BY created_at DESC, id DESC
         LIMIT 6`,
        [candidateUserId]
      );
      for (const doc of docs || []) {
        const mime = String(doc?.mime_type || '').trim().toLowerCase();
        const name = String(doc?.original_name || '').trim().toLowerCase();
        const isTextLike = mime.startsWith('text/') || name.endsWith('.txt');
        if (!isTextLike) continue;
        try {
          const buf = await StorageService.readObject(doc.storage_path);
          const raw = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
          const trimmed = String(raw || '').trim();
          if (!trimmed) continue;
          resumeText = trimmed.slice(0, 20000);
          resumeDocId = Number(doc.id || 0) || null;
          if (resumeDocId) {
            try {
              await HiringResumeParse.upsertByResumeDocId({
                candidateUserId,
                resumeDocId,
                method: 'pdf_text',
                status: 'completed',
                extractedText: resumeText,
                extractedJson: null,
                errorText: null,
                createdByUserId: req.user?.id || null
              });
              latest = await HiringResumeParse.findLatestCompletedTextByCandidateUserId(candidateUserId);
              resumeDocId = Number(latest?.resume_doc_id || resumeDocId);
            } catch (e) {
              if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
            }
          }
          break;
        } catch {
          // try next resume doc
        }
      }
    }
    if (!resumeText || !resumeDocId) {
      return res.status(400).json({
        error: {
          message:
            'No extracted resume text available yet. Upload a text-based resume file or use pasted resume text to generate a resume summary.'
        }
      });
    }

    const candidateName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const ai = await generateResumeSummaryJson({ candidateName, resumeText });

    const extractedJson = {
      kind: 'resume_structured_v1',
      model: ai.modelId,
      latencyMs: ai.latencyMs,
      generatedAt: new Date().toISOString(),
      summary: ai.summary
    };

    const updated = await HiringResumeParse.updateExtractedJsonByResumeDocId(resumeDocId, extractedJson);

    res.status(201).json({
      resumeDocId,
      summary: updated?.extracted_json || extractedJson
    });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message || 'Resume summary failed', ...(e.details ? { details: e.details } : null) } });
    }
    next(e);
  }
};

export const transferCandidateAgency = async (req, res, next) => {
  let conn = null;
  try {
    const fromAgencyId = parseIntParam(req.query.agencyId || req.body?.fromAgencyId || req.user?.agencyId);
    const toAgencyId = parseIntParam(req.body?.toAgencyId || req.body?.agencyId);
    if (!fromAgencyId) return res.status(400).json({ error: { message: 'from agencyId is required' } });
    if (!toAgencyId) return res.status(400).json({ error: { message: 'toAgencyId is required' } });
    if (Number(fromAgencyId) === Number(toAgencyId)) {
      return res.status(400).json({ error: { message: 'Applicant is already in that agency' } });
    }

    await ensureAgencyAccess(req, fromAgencyId);
    await ensureAgencyAccess(req, toAgencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inFromAgency = await ensureCandidateInAgency(candidateUserId, fromAgencyId);
    if (!inFromAgency) {
      return res.status(404).json({ error: { message: 'Candidate not found in the source agency' } });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Move membership (remove from source, add to target).
    await conn.execute('DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?', [candidateUserId, fromAgencyId]);
    await conn.execute(
      'INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id',
      [candidateUserId, toAgencyId]
    );

    // Keep hiring tasks visible after transfer by moving agency-scoped assignments.
    await conn.execute(
      `UPDATE tasks
       SET assigned_to_agency_id = ?
       WHERE task_type = 'hiring'
         AND assigned_to_agency_id = ?
         AND CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.candidateUserId')) AS UNSIGNED) = ?`,
      [toAgencyId, fromAgencyId, candidateUserId]
    );

    await conn.commit();

    res.json({ ok: true, candidateUserId, fromAgencyId, toAgencyId });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore
      }
    }
    next(e);
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch {
        // ignore
      }
    }
  }
};

function ensureCanArchiveOrDelete(req) {
  const role = String(req.user?.role || '').toLowerCase();
  // Hiring helpers/providers can view/manage hiring, but should not archive/delete users.
  if (role !== 'admin' && role !== 'super_admin' && role !== 'support') {
    const err = new Error('Insufficient permissions to archive/delete applicants');
    err.status = 403;
    throw err;
  }
}

export const archiveCandidate = async (req, res, next) => {
  try {
    ensureCanArchiveOrDelete(req);

    const agencyId = parseIntParam(req.query.agencyId || req.body?.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const ok = await User.archive(candidateUserId, req.user.id, agencyId);
    if (!ok) return res.status(404).json({ error: { message: 'Candidate not found' } });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const markCandidateNotHired = async (req, res, next) => {
  try {
    ensureCanArchiveOrDelete(req);

    const agencyId = parseIntParam(req.query.agencyId || req.body?.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const existing = await HiringProfile.findByCandidateUserId(candidateUserId);
    await HiringProfile.upsert({
      candidateUserId,
      stage: 'not_hired',
      appliedRole: existing?.applied_role || existing?.appliedRole || null,
      source: existing?.source || null,
      jobDescriptionId: existing?.job_description_id || existing?.jobDescriptionId || null,
      coverLetterText: existing?.cover_letter_text || existing?.coverLetterText || null
    });

    res.json({ ok: true, stage: 'not_hired' });
  } catch (e) {
    next(e);
  }
};

export const deleteCandidate = async (req, res, next) => {
  let conn = null;
  try {
    // Hard delete is super_admin only (too risky otherwise).
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super_admin can permanently delete applicants' } });
    }

    const agencyId = parseIntParam(req.query.agencyId || req.body?.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Delete resume files + rows (best effort on storage; DB is source of truth).
    const [docs] = await conn.execute(
      `SELECT id, storage_path
       FROM user_admin_docs
       WHERE user_id = ? AND doc_type IN ('resume','resume_photo')`,
      [candidateUserId]
    );

    for (const d of docs || []) {
      if (d?.storage_path) {
        try {
          await StorageService.deleteAdminDoc(d.storage_path);
        } catch {
          // best effort
        }
      }
    }

    // Delete docs (will cascade delete hiring_resume_parses if migration 312 exists).
    await conn.execute(`DELETE FROM user_admin_docs WHERE user_id = ? AND doc_type IN ('resume','resume_photo')`, [candidateUserId]);

    // Delete hiring records (best effort if tables not present).
    try {
      const [pList] = await conn.execute(`SELECT id FROM hiring_profiles WHERE candidate_user_id = ?`, [candidateUserId]);
      for (const p of pList || []) {
        try {
          await conn.execute(`DELETE FROM time_capsule_entries WHERE subject_type = 'hiring_interview' AND subject_id = ?`, [p.id]);
        } catch {
          /* ignore */
        }
        try {
          await conn.execute(`DELETE FROM hiring_interview_splash_state WHERE hiring_profile_id = ?`, [p.id]);
        } catch {
          /* ignore */
        }
      }
      try {
        await conn.execute(`DELETE FROM hiring_candidate_views WHERE candidate_user_id = ?`, [candidateUserId]);
      } catch {
        /* ignore */
      }
      try {
        await conn.execute(`DELETE FROM hiring_candidate_reviews WHERE candidate_user_id = ?`, [candidateUserId]);
      } catch {
        /* ignore */
      }
      await conn.execute(`DELETE FROM hiring_notes WHERE candidate_user_id = ?`, [candidateUserId]);
      await conn.execute(`DELETE FROM hiring_research_reports WHERE candidate_user_id = ?`, [candidateUserId]);
      await conn.execute(`DELETE FROM hiring_profiles WHERE candidate_user_id = ?`, [candidateUserId]);
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // Delete hiring tasks for this candidate.
    await conn.execute(
      `DELETE FROM tasks
       WHERE task_type = 'hiring'
         AND CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.candidateUserId')) AS UNSIGNED) = ?`,
      [candidateUserId]
    );

    // Remove agency memberships.
    await conn.execute(`DELETE FROM user_agencies WHERE user_id = ?`, [candidateUserId]);

    // Finally delete the user row.
    await conn.execute(`DELETE FROM users WHERE id = ? LIMIT 1`, [candidateUserId]);

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // ignore
      }
    }
    const msg = String(e?.message || '');
    const fk = msg.toLowerCase().includes('foreign key') || e?.code === 'ER_ROW_IS_REFERENCED_2';
    if (fk) {
      return res.status(409).json({
        error: {
          message:
            'This applicant cannot be permanently deleted because other records reference them. Archive instead.'
        }
      });
    }
    next(e);
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch {
        // ignore
      }
    }
  }
};

export const patchCandidateInterview = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const statusRaw = req.body?.interviewStatus !== undefined ? String(req.body.interviewStatus || '').trim().toLowerCase() : null;
    const interviewStatus = statusRaw === 'cancelled' ? 'cancelled' : statusRaw === 'scheduled' ? 'scheduled' : null;

    let interviewStartsAt = undefined;
    if (req.body?.interviewStartsAt !== undefined) {
      const raw = String(req.body.interviewStartsAt || '').trim();
      if (!raw) interviewStartsAt = null;
      else {
        const d = new Date(raw);
        if (!Number.isFinite(d.getTime())) {
          return res.status(400).json({ error: { message: 'Invalid interviewStartsAt' } });
        }
        interviewStartsAt = d.toISOString().slice(0, 19).replace('T', ' ');
      }
    }

    const interviewTimezone =
      req.body?.interviewTimezone !== undefined ? String(req.body.interviewTimezone || '').trim().slice(0, 64) || null : undefined;

    let interviewerIds = undefined;
    if (req.body?.interviewerUserIds !== undefined) {
      const arr = Array.isArray(req.body.interviewerUserIds) ? req.body.interviewerUserIds : [];
      const cleaned = [...new Set(arr.map((x) => parseIntParam(x)).filter((n) => n))];
      for (const uid of cleaned) {
        if (req.user?.role !== 'super_admin') {
          const ags = await User.getAgencies(uid);
          const ok = (ags || []).some((a) => Number(a.id) === Number(agencyId));
          if (!ok) {
            return res.status(400).json({ error: { message: `User ${uid} is not in this agency` } });
          }
        }
      }
      interviewerIds = JSON.stringify(cleaned);
    }

    const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
    if (!profile?.id) {
      return res.status(404).json({ error: { message: 'Hiring profile not found' } });
    }

    const sets = [];
    const vals = [];
    if (interviewStartsAt !== undefined) {
      sets.push('interview_starts_at = ?');
      vals.push(interviewStartsAt);
    }
    if (interviewTimezone !== undefined) {
      sets.push('interview_timezone = ?');
      vals.push(interviewTimezone);
    }
    if (req.body?.interviewStatus !== undefined) {
      sets.push('interview_status = ?');
      vals.push(interviewStatus);
    }
    if (interviewerIds !== undefined) {
      sets.push('interview_interviewer_user_ids = ?');
      vals.push(interviewerIds);
    }
    if (interviewStatus === 'cancelled') {
      sets.push('interview_starts_at = NULL');
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: { message: 'No interview fields to update' } });
    }
    sets.push('interview_scheduled_by_user_id = ?');
    vals.push(req.user.id);
    vals.push(profile.id);

    try {
      await pool.execute(
        `UPDATE hiring_profiles SET ${sets.join(', ')}, interview_updated_at = CURRENT_TIMESTAMP WHERE id = ? LIMIT 1`,
        vals
      );
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(503).json({ error: { message: 'Interview scheduling requires migration 705' } });
      }
      throw e;
    }

    const updated = await HiringProfile.findByCandidateUserId(candidateUserId);
    const sendRefs =
      req.body?.sendReferenceRequests === true
      || String(req.body?.sendReferenceRequests || '').trim().toLowerCase() === 'true';
    let referenceSendResult = null;
    if (sendRefs) {
      const p = updated;
      if (!p?.interview_starts_at) {
        return res.status(400).json({
          error: {
            message: 'Interview date and time are required before sending reference requests.'
          }
        });
      }
      try {
        const result = await createAndSendReferenceRequests({
          agencyId,
          candidateUserId,
          profile: p,
          sentByUserId: req.user.id,
          intakeSubmissionId: null,
          onlyIfNotSent: false
        });
        referenceSendResult = { sent: result.sent, skipped: result.skipped, errors: result.errors };
        if ((result.errors || []).length && !(result.sent || []).length) {
          return res.status(400).json({
            error: { message: result.errors.join(' ') },
            profile: p
              ? {
                  ...p,
                  stage_label: hiringStageLabel(p.stage)
                }
              : p,
            referenceSendResult
          });
        }
      } catch (err) {
        return res.status(400).json({
          error: { message: String(err?.message || err) },
          profile: updated
            ? {
                ...updated,
                stage_label: hiringStageLabel(updated.stage)
              }
            : updated
        });
      }
    }

    const finalProfile = await HiringProfile.findByCandidateUserId(candidateUserId);
    res.json({
      profile: finalProfile
        ? {
            ...finalProfile,
            stage_label: hiringStageLabel(finalProfile.stage)
          }
        : finalProfile,
      ...(referenceSendResult ? { referenceSendResult } : {})
    });
  } catch (e) {
    next(e);
  }
};

export const listCandidateReferenceRequests = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
    if (!profile?.id) return res.status(404).json({ error: { message: 'Hiring profile not found' } });

    try {
      const rows = await HiringReferenceRequest.listByProfileAndAgency(profile.id, agencyId);
      const sanitized = (rows || []).map((r) => {
        const { public_link_token: _t, open_track_token: _o, ...rest } = r || {};
        return rest;
      });
      res.json(sanitized);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'Reference requests require migration 707' } });
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

export const listCandidateReferenceActivity = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
    if (!profile?.id) return res.status(404).json({ error: { message: 'Hiring profile not found' } });

    const lim = parseIntParam(req.query.limit) || 100;
    try {
      const rows = await UserActivityLog.getHiringReferenceEventsForUser(candidateUserId, agencyId, lim);
      res.json(rows);
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        return res.json([]);
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

export const postCandidateReferenceRequestsSend = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
    if (!profile?.id) return res.status(404).json({ error: { message: 'Hiring profile not found' } });
    if (!profile.interview_starts_at) {
      return res.status(400).json({ error: { message: 'Interview date and time are required before sending reference requests.' } });
    }

    const onlyIfNotSent =
      req.body?.onlyIfNotSent === true || String(req.body?.onlyIfNotSent || '').trim() === '1';

    const result = await createAndSendReferenceRequests({
      agencyId,
      candidateUserId,
      profile,
      sentByUserId: req.user.id,
      intakeSubmissionId: null,
      onlyIfNotSent
    });

    if ((result.errors || []).length && !(result.sent || []).length) {
      return res.status(400).json({
        error: { message: result.errors.join(' ') },
        sent: result.sent,
        skipped: result.skipped
      });
    }

    res.json({
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors
    });
  } catch (e) {
    next(e);
  }
};

export const listCandidateReviews = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const rows = await listHiringCandidateReviews(agencyId, candidateUserId);
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const createCandidateReview = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const body = String(req.body?.body || '').trim();
    const rating = parseInt(req.body?.rating, 10);
    if (!body) return res.status(400).json({ error: { message: 'body is required' } });
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: { message: 'rating must be 1-5' } });
    }

    try {
      const [result] = await pool.execute(
        `INSERT INTO hiring_candidate_reviews (agency_id, candidate_user_id, author_user_id, rating, body)
         VALUES (?, ?, ?, ?, ?)`,
        [agencyId, candidateUserId, req.user.id, rating, body.slice(0, 20000)]
      );
      const [rows] = await pool.execute(
        `SELECT r.*, u.first_name AS author_first_name, u.last_name AS author_last_name,
                u.email AS author_email
         FROM hiring_candidate_reviews r
         JOIN users u ON u.id = r.author_user_id
         WHERE r.id = ? LIMIT 1`,
        [result.insertId]
      );
      res.status(201).json(rows[0] || null);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(503).json({ error: { message: 'Reviews require migration 705' } });
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

export const toggleHiringNoteKudos = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    const noteId = parseIntParam(req.params.noteId);
    if (!candidateUserId || !noteId) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const note = await HiringNote.findById(noteId);
    if (!note || Number(note.candidate_user_id) !== Number(candidateUserId)) {
      return res.status(404).json({ error: { message: 'Note not found' } });
    }

    const [existing] = await pool.execute(
      `SELECT id FROM hiring_note_kudos WHERE note_id = ? AND user_id = ? LIMIT 1`,
      [noteId, req.user.id]
    );
    if (existing.length) {
      await pool.execute(`DELETE FROM hiring_note_kudos WHERE note_id = ? AND user_id = ? LIMIT 1`, [noteId, req.user.id]);
    } else {
      await pool.execute(`INSERT INTO hiring_note_kudos (note_id, user_id) VALUES (?, ?)`, [noteId, req.user.id]);
    }
    const notesRaw = await HiringNote.listByCandidateUserId(candidateUserId, { limit: 200 });
    const notes = await enrichHiringNotesWithEngagement(notesRaw, req.user.id);
    const n = notes.find((x) => Number(x.id) === Number(noteId));
    res.json(n || { ok: true });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Note kudos require migration 705' } });
    }
    next(e);
  }
};

export const setHiringNoteReaction = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    const noteId = parseIntParam(req.params.noteId);
    const emoji = String(req.body?.emoji || '').trim().slice(0, 16);
    if (!candidateUserId || !noteId || !emoji) {
      return res.status(400).json({ error: { message: 'candidate, note, and emoji are required' } });
    }

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const note = await HiringNote.findById(noteId);
    if (!note || Number(note.candidate_user_id) !== Number(candidateUserId)) {
      return res.status(404).json({ error: { message: 'Note not found' } });
    }

    await pool.execute(
      `INSERT INTO hiring_note_reactions (note_id, user_id, emoji) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE emoji = VALUES(emoji)`,
      [noteId, req.user.id, emoji]
    );
    const notesRaw = await HiringNote.listByCandidateUserId(candidateUserId, { limit: 200 });
    const notes = await enrichHiringNotesWithEngagement(notesRaw, req.user.id);
    res.json(notes.find((x) => Number(x.id) === Number(noteId)) || { ok: true });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ error: { message: 'Note reactions require migration 705' } });
    }
    next(e);
  }
};

export const deleteHiringNoteReaction = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    const noteId = parseIntParam(req.params.noteId);
    const emoji = decodeURIComponent(String(req.query.emoji || '').trim()).slice(0, 16);
    if (!candidateUserId || !noteId || !emoji) {
      return res.status(400).json({ error: { message: 'Invalid ids' } });
    }

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    await pool.execute(`DELETE FROM hiring_note_reactions WHERE note_id = ? AND user_id = ? AND emoji = ? LIMIT 1`, [
      noteId,
      req.user.id,
      emoji
    ]);
    const notesRaw = await HiringNote.listByCandidateUserId(candidateUserId, { limit: 200 });
    const notes = await enrichHiringNotesWithEngagement(notesRaw, req.user.id);
    res.json(notes.find((x) => Number(x.id) === Number(noteId)) || { ok: true });
  } catch (e) {
    next(e);
  }
};

export const getMyPendingInterviewSplashes = async (req, res, next) => {
  try {
    const rows = await listPendingInterviewSplashesForUser(req.user.id);
    res.json(rows);
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.json([]);
    }
    next(e);
  }
};

export const getMyPendingTimeCapsuleReveals = async (req, res, next) => {
  try {
    const rows = await listPendingTimeCapsuleRevealsForUser(req.user.id);
    res.json(rows);
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.json([]);
    }
    next(e);
  }
};

export const postTimeCapsuleRevealOpen = async (req, res, next) => {
  try {
    const entryId = parseIntParam(req.params.entryId);
    if (!entryId) return res.status(400).json({ error: { message: 'Invalid entryId' } });
    const out = await openTimeCapsuleReveal(entryId, req.user.id);
    res.json(out);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postTimeCapsuleRevealAcknowledge = async (req, res, next) => {
  try {
    const entryId = parseIntParam(req.params.entryId);
    if (!entryId) return res.status(400).json({ error: { message: 'Invalid entryId' } });
    await acknowledgeTimeCapsuleReveal(entryId, req.user.id);
    res.json({ ok: true });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const postTimeCapsuleRevealSnooze = async (req, res, next) => {
  try {
    const entryId = parseIntParam(req.params.entryId);
    if (!entryId) return res.status(400).json({ error: { message: 'Invalid entryId' } });
    const days = req.body?.days != null ? parseInt(req.body.days, 10) : 1;
    const out = await snoozeTimeCapsuleReveal(entryId, req.user.id, days);
    res.json(out);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const submitMyInterviewSplash = async (req, res, next) => {
  try {
    const hiringProfileId = parseIntParam(req.body?.hiringProfileId);
    if (!hiringProfileId) return res.status(400).json({ error: { message: 'hiringProfileId is required' } });

    const attendedRaw = req.body?.attended;
    if (attendedRaw === undefined) {
      return res.status(400).json({ error: { message: 'attended is required (true/false)' } });
    }
    const attended = attendedRaw === true || String(attendedRaw).toLowerCase() === 'true' || attendedRaw === 1;

    await submitInterviewSplashAttendance({
      hiringProfileId,
      interviewerUserId: req.user.id,
      attended
    });

    if (!attended) {
      return res.json({ ok: true, dismissed: true });
    }

    const impression = String(req.body?.impression || '').trim();
    const rating = parseInt(req.body?.rating, 10);
    const prediction6m = String(req.body?.prediction6m || '').trim();
    const prediction12m = String(req.body?.prediction12m || '').trim();

    if (!impression || !Number.isFinite(rating) || !prediction6m || !prediction12m) {
      return res.json({ ok: true, awaitingCapsule: true });
    }

    await submitInterviewSplashCapsule({
      hiringProfileId,
      interviewerUserId: req.user.id,
      impression,
      rating,
      prediction6m,
      prediction12m
    });

    res.json({ ok: true, completed: true });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

// ─── Pre-Hire Settings (per agency) ────────────────────────────────────────

export const getHiringSettings = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const [rows] = await pool.execute(
      'SELECT prehire_settings FROM agencies WHERE id = ? LIMIT 1',
      [agencyId]
    );
    const raw = rows[0]?.prehire_settings;
    const settings = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    res.json({ agencyId, settings });
  } catch (e) { next(e); }
};

export const updateHiringSettings = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const allowed = [
      'default_prehire_package_id',
      'default_onboarding_package_id',
      'default_contract_template_id',
      'token_expiry_hours',
      'invite_email_subject',
      'invite_email_body',
      'role_package_mappings'
    ];
    const patch = {};
    for (const key of allowed) {
      if (key in req.body) {
        // Validate role_package_mappings is an array
        if (key === 'role_package_mappings') {
          patch[key] = Array.isArray(req.body[key]) ? req.body[key] : [];
        } else {
          patch[key] = req.body[key] ?? null;
        }
      }
    }

    const [existingRows] = await pool.execute(
      'SELECT prehire_settings FROM agencies WHERE id = ? LIMIT 1',
      [agencyId]
    );
    const rawExisting = existingRows[0]?.prehire_settings;
    const existing = typeof rawExisting === 'string' ? JSON.parse(rawExisting) : (rawExisting || {});
    const merged = { ...existing, ...patch };

    await pool.execute(
      'UPDATE agencies SET prehire_settings = ? WHERE id = ?',
      [JSON.stringify(merged), agencyId]
    );
    res.json({ agencyId, settings: merged });
  } catch (e) { next(e); }
};

// ─── Hiring Signer Roles ────────────────────────────────────────────────────

export const listSignerRoles = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const [rows] = await pool.execute(
      `SELECT hsr.*, u.first_name, u.last_name, u.email
       FROM hiring_signer_roles hsr
       LEFT JOIN users u ON u.id = hsr.default_user_id
       WHERE hsr.agency_id = ?
       ORDER BY hsr.sort_order ASC, hsr.id ASC`,
      [agencyId]
    );
    res.json(rows || []);
  } catch (e) { next(e); }
};

export const createSignerRole = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const { roleLabel, defaultUserId, sortOrder } = req.body;
    if (!roleLabel || !String(roleLabel).trim()) {
      return res.status(400).json({ error: { message: 'roleLabel is required' } });
    }

    const [result] = await pool.execute(
      `INSERT INTO hiring_signer_roles (agency_id, role_label, default_user_id, sort_order)
       VALUES (?, ?, ?, ?)`,
      [agencyId, String(roleLabel).trim(), defaultUserId ?? null, sortOrder ?? 0]
    );
    const [newRows] = await pool.execute(
      `SELECT hsr.*, u.first_name, u.last_name, u.email
       FROM hiring_signer_roles hsr
       LEFT JOIN users u ON u.id = hsr.default_user_id
       WHERE hsr.id = ?`,
      [result.insertId]
    );
    res.status(201).json(newRows[0]);
  } catch (e) { next(e); }
};

export const updateSignerRole = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const roleId = parseIntParam(req.params.roleId);
    const { roleLabel, defaultUserId, sortOrder } = req.body;

    const [existing] = await pool.execute(
      'SELECT id FROM hiring_signer_roles WHERE id = ? AND agency_id = ?',
      [roleId, agencyId]
    );
    if (!existing.length) return res.status(404).json({ error: { message: 'Signer role not found' } });

    await pool.execute(
      `UPDATE hiring_signer_roles
       SET role_label = ?, default_user_id = ?, sort_order = ?
       WHERE id = ? AND agency_id = ?`,
      [String(roleLabel).trim(), defaultUserId ?? null, sortOrder ?? 0, roleId, agencyId]
    );
    const [updated] = await pool.execute(
      `SELECT hsr.*, u.first_name, u.last_name, u.email
       FROM hiring_signer_roles hsr
       LEFT JOIN users u ON u.id = hsr.default_user_id
       WHERE hsr.id = ?`,
      [roleId]
    );
    res.json(updated[0]);
  } catch (e) { next(e); }
};

export const deleteSignerRole = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const roleId = parseIntParam(req.params.roleId);
    await pool.execute(
      'DELETE FROM hiring_signer_roles WHERE id = ? AND agency_id = ?',
      [roleId, agencyId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// ─── Send Pre-Hire (unified: promote + assign docs + countersign tasks) ─────

export const sendPreHire = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const user = await User.findById(candidateUserId);
    if (!user) return res.status(404).json({ error: { message: 'Candidate not found' } });

    // 1. Promote to PENDING_SETUP (or keep if already there)
    let tokenResult = null;
    if (user.status === 'PROSPECTIVE' || user.status === 'PENDING_SETUP') {
      await User.updateStatus(candidateUserId, 'PENDING_SETUP', req.user.id);
      // Best-effort: stamp hired_at if the column exists
      try {
        await pool.execute(
          `UPDATE users SET hired_at = NOW() WHERE id = ? AND hired_at IS NULL`,
          [candidateUserId]
        );
      } catch { /* column may not exist yet */ }
      try {
        const existing = await HiringProfile.findByCandidateUserId(candidateUserId);
        await HiringProfile.upsert({
          candidateUserId,
          stage: 'hired',
          appliedRole: existing?.applied_role || existing?.appliedRole || null,
          source: existing?.source || null
        });
      } catch { /* ignore */ }
      tokenResult = await User.generatePasswordlessToken(candidateUserId, 7 * 24);
      await ensureAssignedJobDescriptionDocument(candidateUserId, req.user.id);
    } else {
      // Already promoted — just regenerate token so modal always surfaces a fresh link
      try { tokenResult = await User.generatePasswordlessToken(candidateUserId, 7 * 24); } catch { /* ignore */ }
    }

    // Link goes directly to the pre-hire portal, not the regular passwordless login
    const tokenLink = tokenResult
      ? `${config.frontendUrl}/pre-hire/${tokenResult.token}`
      : null;

    // Send invite email using the agency's People Operations sender identity
    if (tokenLink && user.personal_email) {
      setImmediate(async () => {
        try {
          const [agencyRows] = await pool.execute(
            `SELECT prehire_settings, name FROM agencies WHERE id = ? LIMIT 1`,
            [agencyId]
          );
          const rawSettings = agencyRows[0]?.prehire_settings;
          const settings = typeof rawSettings === 'string' ? JSON.parse(rawSettings) : (rawSettings || {});
          const agencyName = agencyRows[0]?.name || 'People Operations';

          const firstName = user.first_name || 'there';
          const jobTitle = user.applied_role || settings.default_job_title || '';

          // Priority order: per-hire custom message → agency settings → built-in default
          const customSubject = String(req.body?.msgSubject || '').trim();
          const customBody = String(req.body?.msgBody || '').trim();

          const resolvedSubject = customSubject
            || settings.invite_email_subject
            || `Welcome to ${agencyName} — complete your pre-hire documents`;

          const resolvedBodyText = customBody
            ? customBody.replace(/\{first_name\}/gi, firstName).replace(/\{link\}/gi, tokenLink)
            : settings.invite_email_body
              ? settings.invite_email_body.replace(/\{first_name\}/gi, firstName).replace(/\{link\}/gi, tokenLink)
              : [
                  `Hi ${firstName},`,
                  ``,
                  `We're thrilled to welcome you to the ${agencyName} team${jobTitle ? ` as ${jobTitle}` : ''}!`,
                  ``,
                  `To complete your pre-hire process, please click the link below to access your secure pre-hire portal. You'll find documents to review and sign, as well as any other items required before your start date.`,
                  ``,
                  `Your pre-hire portal: ${tokenLink}`,
                  ``,
                  `This link is valid for 7 days. If it expires, please contact your HR coordinator for a new one.`,
                  ``,
                  `Once all items are completed, a member of our People Operations team will review and reach out with next steps.`,
                  ``,
                  `We look forward to having you on the team!`,
                  ``,
                  `— ${agencyName} People Operations`
                ].join('\n');

          const resolvedBodyHtml = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:600px;">
            <p>Hi ${firstName},</p>
            <p>We're thrilled to welcome you to the <strong>${agencyName}</strong> team${jobTitle ? ` as <strong>${jobTitle}</strong>` : ''}!</p>
            <p>To complete your pre-hire process, please click the button below to access your secure pre-hire portal. You'll find documents to review and sign, as well as any other items required before your start date.</p>
            <p style="margin:24px 0;">
              <a href="${tokenLink}" style="background:#1a5c38;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Access Your Pre-Hire Portal →</a>
            </p>
            <p style="color:#555;font-size:13px;">Or copy this link: <a href="${tokenLink}" style="color:#1a5c38;">${tokenLink}</a></p>
            <p style="color:#555;font-size:13px;">This link is valid for 7 days. If it expires, please contact your HR coordinator for a new one.</p>
            <p>Once all items are completed, a member of our People Operations team will review and reach out with next steps.</p>
            <p>We look forward to having you on the team!</p>
            <p style="color:#6b7280;font-size:13px;">— ${agencyName} People Operations</p>
          </div>`;

          // Try to send via the agency's configured sender identity (e.g. po@itsco.health)
          try {
            const { resolveJobApplicationSenderIdentity } = await import('../services/hiringReferenceIdentity.service.js');
            const { sendEmailFromIdentity } = await import('../services/unifiedEmail/unifiedEmailSender.service.js');
            const identity = await resolveJobApplicationSenderIdentity(agencyId);
            if (identity?.id) {
              await sendEmailFromIdentity({
                senderIdentityId: identity.id,
                to: user.personal_email,
                subject: resolvedSubject,
                text: resolvedBodyText,
                html: resolvedBodyHtml,
                source: 'auto'
              });
              return;
            }
          } catch (identityErr) {
            console.warn('[sendPreHire] Identity sender failed, falling back:', identityErr?.message);
          }

          // Fallback: plain EmailService
          await EmailService.sendEmail({
            to: user.personal_email,
            subject: resolvedSubject,
            text: resolvedBodyText
          });
        } catch (emailErr) {
          console.error('[sendPreHire] Failed to send invite email:', emailErr);
        }
      });
    }

    // 2. Assign selected document templates as tasks
    const { documentTemplateIds = [], signerAssignments = [] } = req.body;
    const { default: TaskAssignmentService } = await import('../services/taskAssignment.service.js');
    const { default: DocumentTemplate } = await import('../models/DocumentTemplate.model.js');
    const assignedTasks = [];

    for (const templateId of documentTemplateIds) {
      try {
        const tmpl = await DocumentTemplate.findById(templateId);
        if (!tmpl) continue;
        const task = await TaskAssignmentService.assignDocumentTask({
          title: tmpl.name,
          description: tmpl.description || '',
          documentTemplateId: templateId,
          assignedByUserId: req.user.id,
          assignedToUserId: candidateUserId,
          assignedToAgencyId: agencyId,
          documentActionType: tmpl.document_action_type || 'signature',
          isRequired: tmpl.is_required ? 1 : 0,
          metadata: { prehire: true }
        });
        assignedTasks.push(task);

        // 3. Create a countersign task for each internal signer on this document
        for (const sa of signerAssignments) {
          if (!sa.userId) continue;
          await pool.execute(
            `INSERT INTO tasks (
              task_type, document_action_type, title, description,
              assigned_to_user_id, assigned_to_agency_id, assigned_by_user_id,
              reference_id, metadata,
              countersign_signer_user_id, countersign_role_label, countersign_field_key
            ) VALUES (?, 'countersignature', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              'document',
              `Countersign: ${tmpl.name}`,
              `Please countersign ${(user.first_name || '')} ${(user.last_name || '')} — ${tmpl.name}`.trim(),
              sa.userId,
              agencyId,
              req.user.id,
              task.id,
              JSON.stringify({ prehire: true, candidateUserId, countersign: true }),
              sa.userId,
              sa.roleLabel || null,
              sa.fieldKey || null
            ]
          );
        }
      } catch (docErr) {
        console.error('sendPreHire: failed to assign document task', templateId, docErr);
      }
    }

    res.json({
      ok: true,
      passwordlessToken: tokenResult?.token || null,
      passwordlessTokenLink: tokenLink,
      assignedTaskCount: assignedTasks.length,
      signerTaskCount: signerAssignments.length * assignedTasks.length
    });
  } catch (e) { next(e); }
};

// ─── Send onboarding invite to existing ONBOARDING user ──────────────────────
// POST /api/hiring/candidates/:userId/send-onboarding-invite
// Sends a magic link or workspace login email to an already-promoted employee.
export const sendOnboardingInvite = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    if (agencyId) await ensureAgencyAccess(req, agencyId);
    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const user = await User.findById(candidateUserId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });
    if (user.status !== 'ONBOARDING') {
      return res.status(400).json({ error: { message: 'User is not in ONBOARDING status' } });
    }

    const { sendMethod = 'token' } = req.body || {};
    const frontendUrl = config.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000';

    if (sendMethod === 'token') {
      const tokenResult = await User.generatePasswordlessToken(candidateUserId, 7 * 24);
      const tokenLink = `${frontendUrl}/passwordless-login/${tokenResult.token}`;
      if (user.personal_email) {
        setImmediate(async () => {
          try {
            await EmailService.sendEmail({
              to: user.personal_email,
              subject: 'Your onboarding access — action required',
              text: `Hi ${user.first_name || 'there'},\n\nHere is your onboarding access link:\n\n${tokenLink}\n\nThis link is valid for 7 days. Log in to view your onboarding checklist and complete any assigned tasks.`
            });
          } catch (e) { console.error('[sendOnboardingInvite] Email failed:', e); }
        });
      }
      return res.json({ ok: true, sendMethod, tokenLink });
    } else if (sendMethod === 'login') {
      const loginEmail = user.work_email || user.personal_email;
      if (!loginEmail) return res.status(400).json({ error: { message: 'No email address found for this user' } });
      setImmediate(async () => {
        try {
          await EmailService.sendEmail({
            to: loginEmail,
            subject: 'Your workspace account is ready',
            text: `Hi ${user.first_name || 'there'},\n\nYour onboarding account is now active. Log in at:\n\n${frontendUrl}/login\n\nEmail: ${loginEmail}\n\nIf you need to reset your password, use the "Forgot password" link on the login page.`
          });
        } catch (e) { console.error('[sendOnboardingInvite] Login email failed:', e); }
      });
      return res.json({ ok: true, sendMethod });
    }

    return res.status(400).json({ error: { message: 'Invalid sendMethod. Must be "token" or "login".' } });
  } catch (e) { next(e); }
};

// ─── Pre-hire candidates with progress ───────────────────────────────────────
// GET /api/hiring/prehire-candidates?agencyId=X
// Returns PENDING_SETUP, PREHIRE_OPEN, PREHIRE_REVIEW users enriched with
// task progress counts and hiring profile data.
export const listPrehireCandidates = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    if (agencyId) await ensureAgencyAccess(req, agencyId);

    const agencyClause = agencyId ? `AND ua.agency_id = ${agencyId}` : '';
    const statuses = ['PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW'];
    const placeholders = statuses.map(() => '?').join(',');

    const [rows] = await pool.execute(
      `SELECT
         u.id, u.first_name, u.last_name, u.email, u.personal_email,
         u.status, u.phone_number, u.hired_at, u.created_at,
         u.passwordless_token, u.passwordless_token_expires_at,
         hp.applied_role, hp.source, hp.interview_date,
         hp.created_at AS applied_at,
         (
           SELECT COUNT(*) FROM tasks t
           WHERE t.assigned_to_user_id = u.id
             AND t.document_action_type != 'countersignature'
             AND t.status != 'deleted'
         ) AS task_total,
         (
           SELECT COUNT(*) FROM tasks t
           WHERE t.assigned_to_user_id = u.id
             AND t.document_action_type != 'countersignature'
             AND t.status = 'completed'
         ) AS task_completed,
         (
           SELECT COUNT(*) FROM tasks t
           WHERE t.assigned_to_user_id = u.id
             AND t.is_required = 1
             AND t.document_action_type != 'countersignature'
             AND t.status != 'deleted'
         ) AS required_total,
         (
           SELECT COUNT(*) FROM tasks t
           WHERE t.assigned_to_user_id = u.id
             AND t.is_required = 1
             AND t.document_action_type != 'countersignature'
             AND t.status = 'completed'
         ) AS required_completed
       FROM users u
       INNER JOIN user_agencies ua ON u.id = ua.user_id
       LEFT JOIN hiring_profiles hp ON hp.candidate_user_id = u.id
       WHERE u.status IN (${placeholders})
         AND u.is_active = TRUE
         AND u.role NOT IN ('client_guardian', 'client', 'guardian')
         AND (
           hp.id IS NOT NULL
           OR u.hired_at IS NOT NULL
         )
         ${agencyClause}
       GROUP BY u.id, hp.id
       ORDER BY u.hired_at DESC, u.created_at DESC`,
      statuses
    );

    const candidates = rows.map((r) => {
      const total = parseInt(r.task_total, 10) || 0;
      const completed = parseInt(r.task_completed, 10) || 0;
      const reqTotal = parseInt(r.required_total, 10) || 0;
      const reqCompleted = parseInt(r.required_completed, 10) || 0;
      const tokenExpiry = r.passwordless_token_expires_at ? new Date(r.passwordless_token_expires_at) : null;
      const tokenExpired = tokenExpiry ? tokenExpiry < new Date() : true;
      return {
        ...r,
        task_total: total,
        task_completed: completed,
        required_total: reqTotal,
        required_completed: reqCompleted,
        progress_pct: total > 0 ? Math.round((completed / total) * 100) : 0,
        required_progress_pct: reqTotal > 0 ? Math.round((reqCompleted / reqTotal) * 100) : 0,
        prehire_portal_link: r.passwordless_token && !tokenExpired
          ? `${config.frontendUrl}/pre-hire/${r.passwordless_token}`
          : null,
        prehire_token_expires_at: r.passwordless_token_expires_at || null,
        prehire_token_expired: tokenExpired,
      };
    });

    res.json(candidates);
  } catch (e) { next(e); }
};

// ─── Onboarding candidates with progress ─────────────────────────────────────
// GET /api/hiring/onboarding-candidates?agencyId=X
// Returns ONBOARDING status users with task progress.
export const listOnboardingCandidates = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    if (agencyId) await ensureAgencyAccess(req, agencyId);

    const agencyClause = agencyId ? `AND ua.agency_id = ${agencyId}` : '';

    const [rows] = await pool.execute(
      `SELECT
         u.id, u.first_name, u.last_name, u.email, u.personal_email, u.work_email,
         u.status, u.hired_at, u.created_at,
         hp.applied_role AS job_title,
         (
           SELECT COUNT(*) FROM tasks t
           WHERE t.assigned_to_user_id = u.id
             AND t.document_action_type != 'countersignature'
             AND t.status != 'deleted'
         ) AS task_total,
         (
           SELECT COUNT(*) FROM tasks t
           WHERE t.assigned_to_user_id = u.id
             AND t.document_action_type != 'countersignature'
             AND t.status = 'completed'
         ) AS task_completed,
         (
           SELECT COUNT(*) FROM tasks t
           WHERE t.assigned_to_user_id = u.id
             AND t.due_date IS NOT NULL
             AND t.due_date < NOW()
             AND t.status != 'completed'
             AND t.status != 'deleted'
         ) AS overdue_count
       FROM users u
       INNER JOIN user_agencies ua ON u.id = ua.user_id
       LEFT JOIN hiring_profiles hp ON hp.candidate_user_id = u.id
       WHERE u.status = 'ONBOARDING'
         AND u.is_active = TRUE
         AND u.role NOT IN ('client_guardian', 'client', 'guardian')
         ${agencyClause}
       GROUP BY u.id, hp.id
       ORDER BY u.hired_at DESC, u.created_at DESC`,
      []
    );

    const result = rows.map((r) => {
      const total = parseInt(r.task_total, 10) || 0;
      const completed = parseInt(r.task_completed, 10) || 0;
      return {
        ...r,
        task_total: total,
        task_completed: completed,
        overdue_count: parseInt(r.overdue_count, 10) || 0,
        progress_pct: total > 0 ? Math.round((completed / total) * 100) : 0
      };
    });

    res.json(result);
  } catch (e) { next(e); }
};
