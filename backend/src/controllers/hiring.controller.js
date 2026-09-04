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
import Agency from '../models/Agency.model.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import {
  submitInterviewSplashAttendance,
  submitInterviewSplashCapsule,
  listPendingTimeCapsuleRevealsForUser,
  openTimeCapsuleReveal,
  acknowledgeTimeCapsuleReveal,
  snoozeTimeCapsuleReveal,
  listTimeCapsulesForHiringProfile,
  createTimeCapsulePredictions,
  openTimeCapsuleForApplicant
} from '../services/hiringInterviewCapsule.service.js';
import HiringReferenceRequest from '../models/HiringReferenceRequest.model.js';
import EmailService from '../services/email.service.js';
import UserActivityLog from '../models/UserActivityLog.model.js';
import { createAndSendReferenceRequests } from '../services/hiringReferenceRequests.service.js';
import { sanitizeCareersPageJson } from '../utils/careersPageSanitize.js';
import { sanitizePrehireConfig, mergePrehireDocuments } from '../utils/prehireConfigSanitize.js';
import {
  parseJobDescriptionSections,
  sanitizeJobDescriptionSections
} from '../utils/jobDescriptionSectionsSanitize.js';
import {
  listJobApplicationsForUser,
  resolveOrCreateJobApplicantUser
} from '../services/jobApplicantUser.service.js';
import {
  DEFAULT_SCHEDULE_TZ,
  clientScheduleInstantToUtcMysql,
  isValidTimeZone,
  utcMysqlToIso,
  utcMysqlToZonedWallMysql
} from '../utils/zonedWallTime.util.js';

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
  return sanitizeCareersPageJson(raw);
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

async function resolveAgencyTimezone(agencyId) {
  const aid = parseIntParam(agencyId);
  if (!aid) return DEFAULT_SCHEDULE_TZ;
  try {
    const [rows] = await pool.execute(
      `SELECT timezone FROM agencies WHERE id = ? LIMIT 1`,
      [aid]
    );
    const raw = String(rows?.[0]?.timezone || '').trim();
    if (isValidTimeZone(raw)) return raw;
  } catch {
    /* keep default */
  }
  return DEFAULT_SCHEDULE_TZ;
}

function utcToDatetimeLocal(value, timeZone) {
  const wall = utcMysqlToZonedWallMysql(value, timeZone);
  if (!wall) return null;
  return wall.slice(0, 16).replace(' ', 'T');
}

function parseScheduleWindowFromBody(body, timeZone, { existing = null, allowUndefined = false } = {}) {
  const tz = isValidTimeZone(timeZone) ? String(timeZone).trim() : DEFAULT_SCHEDULE_TZ;
  const hasPublish = body?.publishAt !== undefined || body?.publish_at !== undefined;
  const hasUnpublish = body?.unpublishAt !== undefined || body?.unpublish_at !== undefined;

  let publishAt;
  let unpublishAt;

  if (hasPublish) {
    const raw = body?.publishAt !== undefined ? body.publishAt : body.publish_at;
    const trimmed = String(raw ?? '').trim();
    publishAt = trimmed ? clientScheduleInstantToUtcMysql(trimmed, tz) : null;
    if (trimmed && !publishAt) {
      const err = new Error('publishAt must be a valid date and time');
      err.status = 400;
      throw err;
    }
  } else if (allowUndefined) {
    publishAt = undefined;
  } else if (existing) {
    publishAt = existing.publish_at || null;
  } else {
    publishAt = null;
  }

  if (hasUnpublish) {
    const raw = body?.unpublishAt !== undefined ? body.unpublishAt : body.unpublish_at;
    const trimmed = String(raw ?? '').trim();
    unpublishAt = trimmed ? clientScheduleInstantToUtcMysql(trimmed, tz) : null;
    if (trimmed && !unpublishAt) {
      const err = new Error('unpublishAt must be a valid date and time');
      err.status = 400;
      throw err;
    }
  } else if (allowUndefined) {
    unpublishAt = undefined;
  } else if (existing) {
    unpublishAt = existing.unpublish_at || null;
  } else {
    unpublishAt = null;
  }

  const pubCmp = publishAt === undefined ? (existing?.publish_at || null) : publishAt;
  const unpubCmp = unpublishAt === undefined ? (existing?.unpublish_at || null) : unpublishAt;
  if (pubCmp && unpubCmp) {
    const a = new Date(String(pubCmp).includes('T') ? pubCmp : `${String(pubCmp).replace(' ', 'T')}Z`);
    const b = new Date(String(unpubCmp).includes('T') ? unpubCmp : `${String(unpubCmp).replace(' ', 'T')}Z`);
    if (Number.isFinite(a.getTime()) && Number.isFinite(b.getTime()) && b.getTime() <= a.getTime()) {
      const err = new Error('Take-down time must be after the go-live time');
      err.status = 400;
      throw err;
    }
  }

  return { publishAt, unpublishAt, agencyTimezone: tz };
}

function deriveJobScheduleStatus({ isActive, publishAt, unpublishAt }, now = new Date()) {
  if (!isActive) return 'inactive';
  const pubIso = utcMysqlToIso(publishAt);
  const unpubIso = utcMysqlToIso(unpublishAt);
  if (pubIso) {
    const pub = new Date(pubIso);
    if (Number.isFinite(pub.getTime()) && now < pub) return 'scheduled';
  }
  if (unpubIso) {
    const unpub = new Date(unpubIso);
    if (Number.isFinite(unpub.getTime()) && now >= unpub) return 'ended';
  }
  return 'live';
}

function mapJobDescriptionRow(r, agencyTimezone = DEFAULT_SCHEDULE_TZ) {
  const isActive = r.is_active === 1 || r.is_active === true;
  const publishAt = r.publish_at || null;
  const unpublishAt = r.unpublish_at || null;
  const parseTags = (raw) => {
    try {
      const t = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
      return Array.isArray(t) ? t.map((s) => String(s || '').trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  };
  return {
    id: r.id,
    agencyId: r.agency_id,
    title: r.title,
    descriptionText: r.description_text || null,
    descriptionSections: parseJobDescriptionSections(r.description_sections_json),
    hasFile: !!r.storage_path,
    originalName: r.original_name || null,
    mimeType: r.mime_type || null,
    postedDate: r.posted_date || null,
    applicationDeadline: r.application_deadline || null,
    city: r.city || null,
    state: r.state || null,
    scheduleText: String(r.schedule_text || '').trim() || null,
    credentialMode: ['expected', 'mandatory'].includes(String(r.credential_mode || '').trim().toLowerCase())
      ? String(r.credential_mode).trim().toLowerCase()
      : 'none',
    educationLevel: r.education_level || null,
    roleType: String(r.role_type || '').trim() || null,
    isFeatured: Number(r.is_featured) === 1,
    tags: parseTags(r.tags_json),
    applicationPage: sanitizeApplicationPageJson(parseMetadata(r.application_page_json)) || null,
    isActive,
    publishAt: utcMysqlToIso(publishAt),
    unpublishAt: utcMysqlToIso(unpublishAt),
    publishAtLocal: utcToDatetimeLocal(publishAt, agencyTimezone),
    unpublishAtLocal: utcToDatetimeLocal(unpublishAt, agencyTimezone),
    agencyTimezone,
    scheduleStatus: deriveJobScheduleStatus({ isActive, publishAt, unpublishAt }),
    prehireConfig: sanitizePrehireConfig(r.prehire_config_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function parsePrehireConfigFromBody(body) {
  if (!body) return undefined;
  if (body.prehireConfigJson === undefined && body.prehire_config_json === undefined) return undefined;
  const raw = body.prehireConfigJson ?? body.prehire_config_json;
  if (raw == null || raw === '') return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return sanitizePrehireConfig(parsed);
  } catch {
    return null;
  }
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
    } else if (['applied', 'review', 'interview', 'offered'].includes(stageFilter)) {
      whereSql = `
        WHERE (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL))
          AND LOWER(COALESCE(hp.stage, 'applied')) = ?
      `;
      params.push(stageFilter);
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
        COALESCE(app_hist.cnt, 0) AS application_count,
        app_hist.latest_submitted_at AS latest_application_at,
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
          s.guardian_user_id AS user_id,
          COUNT(*) AS cnt,
          MAX(COALESCE(s.submitted_at, s.created_at)) AS latest_submitted_at
        FROM intake_submissions s
        JOIN intake_links il ON il.id = s.intake_link_id
        WHERE LOWER(COALESCE(il.form_type, '')) = 'job_application'
          AND LOWER(COALESCE(s.status, '')) = 'submitted'
          AND il.organization_id = ?
          AND s.guardian_user_id IS NOT NULL
        GROUP BY s.guardian_user_id
      ) app_hist ON app_hist.user_id = u.id
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
      // params: agencyId (ua join), viewerId (view join), agencyId (app_hist), ...filters
      const execParams = [agencyId, viewerId, agencyId, ...params.slice(2)];
      const sql = selectCore
        .replace('__VIEW_COLS__', `, (hcv.first_viewed_at IS NULL) AS is_new_for_me, hcv.first_viewed_at AS hiring_first_viewed_at`)
        .replace(
          '__VIEW_JOIN__',
          `LEFT JOIN hiring_candidate_views hcv
            ON hcv.agency_id = ua.agency_id AND hcv.candidate_user_id = u.id AND hcv.viewer_user_id = ?`
        );
      const exec = await pool.execute(sql, execParams);
      rows = exec[0];
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE' && String(e?.message || '').includes('hiring_candidate_views')) {
        const sqlLegacy = selectCore.replace('__VIEW_COLS__', '').replace('__VIEW_JOIN__', '');
        const legacyParams = [agencyId, agencyId, ...params.slice(2)];
        const execLegacy = await pool.execute(sqlLegacy, legacyParams);
        rows = execLegacy[0];
      } else if (e?.code === 'ER_BAD_FIELD_ERROR' || (e?.code === 'ER_NO_SUCH_TABLE' && String(e?.message || '').includes('intake_'))) {
        // Fallback without application history join (older DBs / missing intake tables).
        const selectFallback = selectCore
          .replace(/COALESCE\(app_hist\.cnt, 0\) AS application_count,\s*/g, '')
          .replace(/app_hist\.latest_submitted_at AS latest_application_at,\s*/g, '')
          .replace(
            /LEFT JOIN \(\s*SELECT[\s\S]*?\) app_hist ON app_hist\.user_id = u\.id\s*/g,
            ''
          );
        try {
          const sql = selectFallback
            .replace('__VIEW_COLS__', `, (hcv.first_viewed_at IS NULL) AS is_new_for_me, hcv.first_viewed_at AS hiring_first_viewed_at`)
            .replace(
              '__VIEW_JOIN__',
              `LEFT JOIN hiring_candidate_views hcv
                ON hcv.agency_id = ua.agency_id AND hcv.candidate_user_id = u.id AND hcv.viewer_user_id = ?`
            );
          const exec = await pool.execute(sql, [agencyId, viewerId, ...params.slice(2)]);
          rows = exec[0];
        } catch (e2) {
          if (e2?.code === 'ER_NO_SUCH_TABLE' && String(e2?.message || '').includes('hiring_candidate_views')) {
            const sqlLegacy = selectFallback.replace('__VIEW_COLS__', '').replace('__VIEW_JOIN__', '');
            const legacyParams = [agencyId, ...params.slice(2)];
            const execLegacy = await pool.execute(sqlLegacy, legacyParams);
            rows = execLegacy[0];
          } else {
            throw e2;
          }
        }
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

const PIPELINE_STAGES = ['applied', 'review', 'interview', 'offered', 'hired', 'not_hired'];

export const getDashboardStats = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);
    const viewerId = parseIntParam(req.user?.id) || 0;

    const stageCounts = {
      applied: 0,
      review: 0,
      interview: 0,
      offered: 0,
      hired: 0,
      not_hired: 0,
      other: 0,
      totalActive: 0,
      totalAll: 0
    };

    try {
      const [stageRows] = await pool.execute(
        `SELECT LOWER(COALESCE(hp.stage, 'applied')) AS stage, COUNT(*) AS cnt
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
         JOIN hiring_profiles hp
           ON hp.id = (
             SELECT hp_latest.id
             FROM hiring_profiles hp_latest
             WHERE hp_latest.candidate_user_id = u.id
             ORDER BY hp_latest.updated_at DESC, hp_latest.id DESC
             LIMIT 1
           )
         WHERE (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL))
         GROUP BY LOWER(COALESCE(hp.stage, 'applied'))`,
        [agencyId]
      );
      for (const row of stageRows || []) {
        const stage = String(row.stage || 'applied').trim().toLowerCase();
        const cnt = Number(row.cnt) || 0;
        stageCounts.totalAll += cnt;
        if (Object.prototype.hasOwnProperty.call(stageCounts, stage)) {
          stageCounts[stage] += cnt;
        } else {
          stageCounts.other += cnt;
        }
        if (!['hired', 'not_hired'].includes(stage)) {
          stageCounts.totalActive += cnt;
        }
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    let openJobs = 0;
    let jobs = [];
    try {
      let jobCountRows;
      try {
        const exec = await pool.execute(
          `SELECT COUNT(*) AS cnt
           FROM hiring_job_descriptions
           WHERE agency_id = ? AND (is_active = 1 OR is_active = TRUE)
             AND (publish_at IS NULL OR publish_at <= UTC_TIMESTAMP())
             AND (unpublish_at IS NULL OR unpublish_at > UTC_TIMESTAMP())`,
          [agencyId]
        );
        jobCountRows = exec[0];
      } catch (e) {
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
        const exec = await pool.execute(
          `SELECT COUNT(*) AS cnt
           FROM hiring_job_descriptions
           WHERE agency_id = ? AND (is_active = 1 OR is_active = TRUE)`,
          [agencyId]
        );
        jobCountRows = exec[0];
      }
      openJobs = Number(jobCountRows?.[0]?.cnt) || 0;

      const [jobRows] = await pool.execute(
        `SELECT
           jd.id,
           jd.title,
           jd.application_deadline,
           COUNT(c.candidate_user_id) AS applicant_count,
           SUM(CASE WHEN c.is_new_for_me = 1 THEN 1 ELSE 0 END) AS new_for_me_count
         FROM hiring_job_descriptions jd
         LEFT JOIN (
           SELECT
             hp.job_description_id,
             hp.candidate_user_id,
             CASE WHEN hcv.first_viewed_at IS NULL THEN 1 ELSE 0 END AS is_new_for_me
           FROM hiring_profiles hp
           JOIN user_agencies ua ON ua.user_id = hp.candidate_user_id AND ua.agency_id = ?
           JOIN users u ON u.id = hp.candidate_user_id
           LEFT JOIN hiring_candidate_views hcv
             ON hcv.agency_id = ua.agency_id
            AND hcv.candidate_user_id = hp.candidate_user_id
            AND hcv.viewer_user_id = ?
           WHERE hp.id = (
               SELECT hp_latest.id
               FROM hiring_profiles hp_latest
               WHERE hp_latest.candidate_user_id = hp.candidate_user_id
               ORDER BY hp_latest.updated_at DESC, hp_latest.id DESC
               LIMIT 1
             )
             AND (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL))
             AND LOWER(COALESCE(hp.stage, 'applied')) NOT IN ('hired', 'not_hired')
             AND hp.job_description_id IS NOT NULL
         ) c ON c.job_description_id = jd.id
         WHERE jd.agency_id = ?
           AND (jd.is_active = 1 OR jd.is_active = TRUE)
         GROUP BY jd.id, jd.title, jd.application_deadline
         ORDER BY applicant_count DESC, jd.title ASC
         LIMIT 20`,
        [agencyId, viewerId, agencyId]
      );
      jobs = (jobRows || []).map((j) => ({
        id: j.id,
        title: j.title,
        applicationDeadline: j.application_deadline || null,
        applicantCount: Number(j.applicant_count) || 0,
        newForMeCount: Number(j.new_for_me_count) || 0
      }));
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE' && String(e?.message || '').includes('hiring_candidate_views')) {
        const [jobRows] = await pool.execute(
          `SELECT
             jd.id,
             jd.title,
             jd.application_deadline,
             COUNT(c.candidate_user_id) AS applicant_count,
             0 AS new_for_me_count
           FROM hiring_job_descriptions jd
           LEFT JOIN (
             SELECT
               hp.job_description_id,
               hp.candidate_user_id
             FROM hiring_profiles hp
             JOIN user_agencies ua ON ua.user_id = hp.candidate_user_id AND ua.agency_id = ?
             JOIN users u ON u.id = hp.candidate_user_id
             WHERE hp.id = (
                 SELECT hp_latest.id
                 FROM hiring_profiles hp_latest
                 WHERE hp_latest.candidate_user_id = hp.candidate_user_id
                 ORDER BY hp_latest.updated_at DESC, hp_latest.id DESC
                 LIMIT 1
               )
               AND (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL))
               AND LOWER(COALESCE(hp.stage, 'applied')) NOT IN ('hired', 'not_hired')
               AND hp.job_description_id IS NOT NULL
           ) c ON c.job_description_id = jd.id
           WHERE jd.agency_id = ?
             AND (jd.is_active = 1 OR jd.is_active = TRUE)
           GROUP BY jd.id, jd.title, jd.application_deadline
           ORDER BY applicant_count DESC, jd.title ASC
           LIMIT 20`,
          [agencyId, agencyId]
        );
        jobs = (jobRows || []).map((j) => ({
          id: j.id,
          title: j.title,
          applicationDeadline: j.application_deadline || null,
          applicantCount: Number(j.applicant_count) || 0,
          newForMeCount: 0
        }));
      } else if (e?.code !== 'ER_NO_SUCH_TABLE') {
        throw e;
      }
    }

    let upcomingInterviewsCount = 0;
    let upcomingInterviews = [];
    try {
      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS cnt
         FROM hiring_interviews hi
         WHERE hi.agency_id = ?
           AND hi.status IN ('scheduled', 'in_progress')
           AND hi.interview_starts_at IS NOT NULL
           AND hi.interview_starts_at >= NOW()
           AND hi.interview_starts_at < DATE_ADD(NOW(), INTERVAL 7 DAY)`,
        [agencyId]
      );
      upcomingInterviewsCount = Number(countRows?.[0]?.cnt) || 0;

      const [ivRows] = await pool.execute(
        `SELECT
           hi.id,
           hi.candidate_user_id,
           hi.status,
           hi.interview_starts_at,
           hi.interview_timezone,
           hi.public_join_url,
           u.first_name,
           u.last_name,
           u.email,
           u.personal_email,
           jd.title AS job_title,
           hp.applied_role,
           hp.stage
         FROM hiring_interviews hi
         JOIN users u ON u.id = hi.candidate_user_id
         LEFT JOIN hiring_profiles hp
           ON hp.id = (
             SELECT hp_latest.id
             FROM hiring_profiles hp_latest
             WHERE hp_latest.candidate_user_id = hi.candidate_user_id
             ORDER BY hp_latest.updated_at DESC, hp_latest.id DESC
             LIMIT 1
           )
         LEFT JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id
         WHERE hi.agency_id = ?
           AND hi.status IN ('scheduled', 'in_progress')
           AND hi.interview_starts_at IS NOT NULL
           AND hi.interview_starts_at >= NOW()
           AND hi.interview_starts_at < DATE_ADD(NOW(), INTERVAL 7 DAY)
         ORDER BY hi.interview_starts_at ASC
         LIMIT 10`,
        [agencyId]
      );
      upcomingInterviews = (ivRows || []).map((r) => ({
        id: r.id,
        candidateUserId: r.candidate_user_id,
        status: r.status,
        startsAt: r.interview_starts_at,
        timezone: r.interview_timezone || null,
        publicJoinUrl: r.public_join_url || null,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.personal_email || r.email,
        jobTitle: r.job_title || r.applied_role || null,
        stage: r.stage || 'applied',
        stageLabel: hiringStageLabel(r.stage)
      }));
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    let recentApplicants = [];
    try {
      const [recentRows] = await pool.execute(
        `SELECT
           u.id,
           u.first_name,
           u.last_name,
           u.email,
           u.personal_email,
           hp.stage,
           hp.applied_role,
           hp.source,
           hp.created_at AS hiring_created_at,
           hp.updated_at AS hiring_updated_at,
           jd.title AS job_title
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
         JOIN hiring_profiles hp
           ON hp.id = (
             SELECT hp_latest.id
             FROM hiring_profiles hp_latest
             WHERE hp_latest.candidate_user_id = u.id
             ORDER BY hp_latest.updated_at DESC, hp_latest.id DESC
             LIMIT 1
           )
         LEFT JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id
         WHERE (u.status != 'ARCHIVED' AND (u.is_archived = FALSE OR u.is_archived IS NULL))
         ORDER BY COALESCE(hp.created_at, hp.updated_at) DESC, u.id DESC
         LIMIT 10`,
        [agencyId]
      );
      recentApplicants = (recentRows || []).map((r) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.personal_email || r.email,
        stage: r.stage || 'applied',
        stageLabel: hiringStageLabel(r.stage),
        jobTitle: r.job_title || r.applied_role || null,
        source: r.source || null,
        createdAt: r.hiring_created_at,
        updatedAt: r.hiring_updated_at
      }));
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    const pendingReviews = stageCounts.applied + stageCounts.review;

    res.json({
      agencyId,
      openJobs,
      totalApplicants: stageCounts.totalActive,
      pendingReviews,
      upcomingInterviewsCount,
      stageCounts,
      jobs,
      upcomingInterviews,
      recentApplicants,
      pipeline: [
        { stage: 'applied', label: 'Applied', count: stageCounts.applied },
        { stage: 'review', label: 'Review', count: stageCounts.review },
        { stage: 'interview', label: 'Interview', count: stageCounts.interview },
        { stage: 'offered', label: 'Offer', count: stageCounts.offered },
        { stage: 'hired', label: 'Hired', count: stageCounts.hired }
      ]
    });
  } catch (e) {
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

export const patchCandidateStage = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const stageRaw = String(req.body?.stage || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!PIPELINE_STAGES.includes(stageRaw)) {
      return res.status(400).json({
        error: { message: `stage must be one of: ${PIPELINE_STAGES.join(', ')}` }
      });
    }

    if (stageRaw === 'hired') {
      return res.status(400).json({
        error: { message: 'Use Mark hired to move a candidate to hired (starts onboarding setup).' }
      });
    }
    if (stageRaw === 'not_hired') {
      return res.status(400).json({
        error: { message: 'Use Not hired to mark a candidate as not hired.' }
      });
    }

    const existing = await HiringProfile.findByCandidateUserId(candidateUserId);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Hiring profile not found' } });
    }

    const safeJson = (value) => {
      if (value == null) return null;
      if (typeof value === 'object') return value;
      if (typeof value !== 'string' || !value.trim()) return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    };

    const updated = await HiringProfile.upsert({
      candidateUserId,
      stage: stageRaw,
      appliedRole: existing.applied_role ?? null,
      source: existing.source ?? null,
      jobDescriptionId: existing.job_description_id ?? null,
      coverLetterText: existing.cover_letter_text ?? null,
      referencesJson: safeJson(existing.references_json),
      referencesConsentJson: safeJson(existing.references_consent_json),
      referencesConsentAt: existing.references_consent_at ?? null,
      jobAcknowledged: !!(existing.job_acknowledged === 1 || existing.job_acknowledged === true),
      fluentLanguagesJson: safeJson(existing.fluent_languages_json)
    });

    res.json({
      profile: updated
        ? {
            ...updated,
            stage_label: hiringStageLabel(updated.stage)
          }
        : updated
    });
  } catch (e) {
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

    // Create or reuse candidate user record (allows re-apply for prior/archived/current employees).
    const { user, reused, wasArchived } = await resolveOrCreateJobApplicantUser({
      email: personalEmail,
      firstName,
      lastName,
      phoneNumber,
      agencyId,
      role
    });

    const profile = await HiringProfile.upsert({
      candidateUserId: user.id,
      stage,
      appliedRole: appliedRole || null,
      source: source || null,
      jobDescriptionId: jobDescriptionId || null,
      coverLetterText: coverLetterText || null
    });

    res.status(reused ? 200 : 201).json({
      user,
      profile,
      reusedExistingAccount: !!reused,
      unarchivedForApplication: !!wasArchived
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
    let jobDescriptionId = Number(profile?.job_description_id || 0) || null;
    if (!jobDescriptionId) {
      // Fall back to the job application intake link (same as portal backfill).
      try {
        const [rows] = await pool.execute(
          `SELECT il.job_description_id
             FROM intake_submissions s
             INNER JOIN intake_links il ON il.id = s.intake_link_id
            WHERE s.guardian_user_id = ?
              AND il.form_type = 'job_application'
              AND il.job_description_id IS NOT NULL
            ORDER BY s.id DESC
            LIMIT 1`,
          [candidateUserId]
        );
        jobDescriptionId = Number(rows?.[0]?.job_description_id || 0) || null;
        if (jobDescriptionId) {
          try {
            await pool.execute(
              `UPDATE hiring_profiles
                  SET job_description_id = COALESCE(job_description_id, ?)
                WHERE candidate_user_id = ?`,
              [jobDescriptionId, candidateUserId]
            );
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }
    if (jobDescriptionId) {
      const jd = await HiringJobDescription.findById(jobDescriptionId);
      if (jd && Number(jd.agency_id) === Number(agencyId)) {
        const agencyTimezone = await resolveAgencyTimezone(agencyId);
        jobDescription = mapJobDescriptionRow(jd, agencyTimezone);
      }
    }

    await markHiringCandidateViewed(agencyId, candidateUserId, req.user.id);

    const hiringProfileId = profile?.id != null ? parseInt(profile.id, 10) : null;
    const myTimeCapsules = await listMySealedCapsulesForProfile(hiringProfileId, req.user.id);
    const applications = await listJobApplicationsForUser(candidateUserId, { agencyId, limit: 50 });

    let coverLetterDocuments = [];
    try {
      const [coverRows] = await pool.execute(
        `SELECT id, title, doc_type, original_name, mime_type, storage_path, created_at
         FROM user_admin_docs
         WHERE user_id = ?
           AND (is_deleted = 0 OR is_deleted IS NULL)
           AND storage_path IS NOT NULL
           AND (
             doc_type = 'cover_letter'
             OR LOWER(COALESCE(title, '')) LIKE '%cover%'
             OR LOWER(COALESCE(original_name, '')) LIKE '%cover%'
           )
         ORDER BY created_at DESC, id DESC
         LIMIT 20`,
        [candidateUserId]
      );
      coverLetterDocuments = (coverRows || []).map((d) => ({
        id: d.id,
        title: d.title || 'Cover letter',
        docType: d.doc_type,
        originalName: d.original_name || null,
        mimeType: d.mime_type || null,
        createdAt: d.created_at || null
      }));
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }

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
      latestPreScreen,
      applications,
      coverLetterDocuments,
      backgroundCheck: await (async () => {
        try {
          const {
            getBackgroundCheckAuthorizationSummary,
            listBackgroundCheckAccessLog
          } = await import('../services/backgroundCheckAuthorization.service.js');
          const summary = await getBackgroundCheckAuthorizationSummary(candidateUserId, agencyId);
          if (!summary?.signed) return summary;
          const accessLog = await listBackgroundCheckAccessLog(candidateUserId, agencyId);
          return { ...summary, accessLog };
        } catch {
          return { signed: false };
        }
      })()
    });
  } catch (e) {
    next(e);
  }
};

export const getBackgroundCheckAuthorization = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);
    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });
    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });
    const {
      getBackgroundCheckAuthorizationSummary,
      listBackgroundCheckAccessLog
    } = await import('../services/backgroundCheckAuthorization.service.js');
    const summary = await getBackgroundCheckAuthorizationSummary(candidateUserId, agencyId);
    const accessLog = summary?.signed
      ? await listBackgroundCheckAccessLog(candidateUserId, agencyId)
      : [];
    res.json({ ...summary, accessLog });
  } catch (e) { next(e); }
};

export const revealBackgroundCheckAuthorization = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.body?.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);
    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });
    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });
    const { revealBackgroundCheckAuthorization: reveal } = await import('../services/backgroundCheckAuthorization.service.js');
    const revealed = await reveal({
      userId: candidateUserId,
      agencyId,
      viewerUserId: req.user.id,
      ipAddress: req.ip || req.get?.('x-forwarded-for') || null
    });
    if (!revealed) return res.status(404).json({ error: { message: 'No background-check authorization on file' } });
    const { listBackgroundCheckAccessLog } = await import('../services/backgroundCheckAuthorization.service.js');
    const accessLog = await listBackgroundCheckAccessLog(candidateUserId, agencyId);
    res.json({ ...revealed, accessLog });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listCandidateApplications = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const applications = await listJobApplicationsForUser(candidateUserId, { agencyId, limit: 100 });
    res.json({ applications });
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
    const agencyTimezone = await resolveAgencyTimezone(agencyId);
    res.json((rows || []).map((r) => mapJobDescriptionRow(r, agencyTimezone)));
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
    const descriptionSectionsJson = (() => {
      const raw = req.body?.descriptionSectionsJson !== undefined
        ? req.body.descriptionSectionsJson
        : req.body?.description_sections_json;
      if (raw === undefined) return null;
      return sanitizeJobDescriptionSections(raw);
    })();
    const postedDate = req.body?.postedDate !== undefined ? normalizeDateOnly(req.body.postedDate) : null;
    const applicationDeadline = req.body?.applicationDeadline !== undefined ? normalizeDateOnly(req.body.applicationDeadline) : null;
    const city = req.body?.city !== undefined ? String(req.body.city || '').trim().slice(0, 120) : null;
    const state = req.body?.state !== undefined ? String(req.body.state || '').trim().slice(0, 120) : null;
    const scheduleText = req.body?.scheduleText !== undefined || req.body?.schedule_text !== undefined
      ? String(req.body.scheduleText ?? req.body.schedule_text ?? '').trim().slice(0, 500) || null
      : null;
    const credentialModeRaw = String(req.body?.credentialMode ?? req.body?.credential_mode ?? 'none').trim().toLowerCase();
    const credentialMode = ['expected', 'mandatory'].includes(credentialModeRaw) ? credentialModeRaw : 'none';
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

    const agencyTimezone = await resolveAgencyTimezone(agencyId);
    const { publishAt, unpublishAt } = parseScheduleWindowFromBody(req.body, agencyTimezone);

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
      descriptionSectionsJson,
      postedDate,
      applicationDeadline,
      city: city || null,
      state: state || null,
      scheduleText,
      credentialMode,
      educationLevel: educationLevel || null,
      roleType: roleType || null,
      isFeatured,
      tagsJson,
      applicationPageJson,
      storagePath,
      originalName,
      mimeType,
      createdByUserId: req.user.id,
      isActive: true,
      publishAt,
      unpublishAt
    });

    const prehireConfigJson = parsePrehireConfigFromBody(req.body);
    if (prehireConfigJson && created?.id) {
      try {
        await HiringJobDescription.updateById(created.id, { prehireConfigJson });
      } catch { /* column may not exist yet */ }
    }
    const saved = created?.id ? (await HiringJobDescription.findById(created.id)) || created : created;
    res.status(201).json(mapJobDescriptionRow(saved, agencyTimezone));
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
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
      const agencyTimezone = await resolveAgencyTimezone(agencyId);
      const { publishAt, unpublishAt } = parseScheduleWindowFromBody(req.body, agencyTimezone, {
        existing,
        allowUndefined: false
      });

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
      const vSections = (() => {
        const raw = req.body?.descriptionSectionsJson !== undefined
          ? req.body.descriptionSectionsJson
          : req.body?.description_sections_json;
        if (raw !== undefined) return sanitizeJobDescriptionSections(raw);
        return parseJobDescriptionSections(existing.description_sections_json);
      })();
      const created = await HiringJobDescription.create({
        agencyId,
        title,
        descriptionText: descriptionText || null,
        descriptionSectionsJson: vSections,
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
        isActive: true,
        publishAt,
        unpublishAt,
        scheduleText: req.body?.scheduleText !== undefined || req.body?.schedule_text !== undefined
          ? String(req.body.scheduleText ?? req.body.schedule_text ?? '').trim().slice(0, 500) || null
          : (existing.schedule_text || null),
        credentialMode: req.body?.credentialMode !== undefined || req.body?.credential_mode !== undefined
          ? (['expected', 'mandatory'].includes(String(req.body.credentialMode ?? req.body.credential_mode ?? '').trim().toLowerCase())
            ? String(req.body.credentialMode ?? req.body.credential_mode).trim().toLowerCase()
            : 'none')
          : (['expected', 'mandatory'].includes(String(existing.credential_mode || '').trim().toLowerCase())
            ? String(existing.credential_mode).trim().toLowerCase()
            : 'none')
      });
      await HiringJobDescription.deactivateById(existing.id);
      return res.json({
        ...mapJobDescriptionRow(created, agencyTimezone),
        replacedJobDescriptionId: existing.id
      });
    }

    // For uploaded-file jobs: metadata fields (title, city, state, education level,
    // description, dates) can always be edited in-place. Only the document itself
    // requires uploading a replacement file, which is handled above via createNewVersion.

    const agencyTimezone = await resolveAgencyTimezone(agencyId);
    const { publishAt, unpublishAt } = parseScheduleWindowFromBody(req.body, agencyTimezone, {
      existing,
      allowUndefined: true
    });

    const descriptionText = req.body?.descriptionText !== undefined
      ? String(req.body.descriptionText || '').trim()
      : existing.description_text;
    const descriptionSectionsJson = (() => {
      const raw = req.body?.descriptionSectionsJson !== undefined
        ? req.body.descriptionSectionsJson
        : req.body?.description_sections_json;
      if (raw === undefined) return undefined;
      return sanitizeJobDescriptionSections(raw);
    })();
    const postedDate = req.body?.postedDate !== undefined ? normalizeDateOnly(req.body.postedDate) : undefined;
    const applicationDeadline = req.body?.applicationDeadline !== undefined
      ? normalizeDateOnly(req.body.applicationDeadline)
      : undefined;
    const city = req.body?.city !== undefined ? String(req.body.city || '').trim().slice(0, 120) : undefined;
    const state = req.body?.state !== undefined ? String(req.body.state || '').trim().slice(0, 120) : undefined;
    const scheduleText = req.body?.scheduleText !== undefined || req.body?.schedule_text !== undefined
      ? String(req.body.scheduleText ?? req.body.schedule_text ?? '').trim().slice(0, 500) || null
      : undefined;
    const credentialMode = req.body?.credentialMode !== undefined || req.body?.credential_mode !== undefined
      ? (['expected', 'mandatory'].includes(String(req.body.credentialMode ?? req.body.credential_mode ?? '').trim().toLowerCase())
        ? String(req.body.credentialMode ?? req.body.credential_mode).trim().toLowerCase()
        : 'none')
      : undefined;
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
      ...(descriptionSectionsJson !== undefined ? { descriptionSectionsJson } : {}),
      postedDate,
      applicationDeadline,
      city: city !== undefined ? (city || null) : undefined,
      state: state !== undefined ? (state || null) : undefined,
      ...(scheduleText !== undefined ? { scheduleText } : {}),
      ...(credentialMode !== undefined ? { credentialMode } : {}),
      educationLevel: educationLevel !== undefined ? (educationLevel || null) : undefined,
      roleType,
      isFeatured,
      tagsJson,
      applicationPageJson,
      ...(isActive !== undefined ? { isActive } : {}),
      ...(publishAt !== undefined ? { publishAt } : {}),
      ...(unpublishAt !== undefined ? { unpublishAt } : {}),
      ...(req.body?.prehireConfigJson !== undefined || req.body?.prehire_config_json !== undefined
        ? { prehireConfigJson: parsePrehireConfigFromBody(req.body) }
        : {})
    });

    res.json(mapJobDescriptionRow(updated, agencyTimezone));
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
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
      parentNoteId: parentNoteId || null,
      isPortalMessage: req.body?.isPortalMessage === true || req.body?.is_portal_message === true
    });

    if (note?.is_portal_message || req.body?.isPortalMessage === true || req.body?.is_portal_message === true) {
      setImmediate(async () => {
        try {
          const { syncStaffPortalReplyToTicket } = await import('../services/prehirePortalChatTicket.service.js');
          await syncStaffPortalReplyToTicket({
            candidateUserId,
            staffUserId: req.user.id,
            message
          });
        } catch (err) {
          console.warn('[createCandidateNote] ticket sync failed:', err?.message);
        }
      });
    }

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

/**
 * Regenerate the pre-hire portal token and email the link (no document re-assignment).
 * POST /api/hiring/candidates/:userId/email-prehire-link
 */
export const emailPrehirePortalLink = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const user = await User.findById(candidateUserId);
    if (!user) return res.status(404).json({ error: { message: 'Candidate not found' } });

    const recipientEmail = String(user.personal_email || user.email || '').trim();
    if (!recipientEmail) {
      return res.status(400).json({
        error: { message: 'Candidate has no personal or login email on file.' }
      });
    }

    const tokenResult = await User.generatePasswordlessToken(candidateUserId, 7 * 24);
    const tokenLink = `${config.frontendUrl}/pre-hire/${tokenResult.token}`;

    const { sendPrehirePortalInviteEmail } = await import('../services/prehireInviteEmail.service.js');
    const emailResult = await sendPrehirePortalInviteEmail({
      agencyId,
      candidateUserId,
      portalLink: tokenLink,
      customSubject: req.body?.msgSubject || null,
      customBody: req.body?.msgBody || null,
      generatedByUserId: req.user?.id || null
    });

    res.json({
      ok: true,
      prehirePortalLink: tokenLink,
      passwordlessTokenLink: tokenLink,
      email: emailResult,
      recipientEmail
    });
  } catch (e) {
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
        source: existing?.source || null,
        jobDescriptionId: existing?.job_description_id || existing?.jobDescriptionId || null,
        coverLetterText: existing?.cover_letter_text || existing?.coverLetterText || null
      });
    } catch {
      // ignore (older DBs or missing table)
    }

    // Generate a fresh token — always links to the pre-hire portal (not the regular login).
    const tokenResult = await User.generatePasswordlessToken(candidateUserId, 7 * 24);
    const tokenLink = `${config.frontendUrl}/pre-hire/${tokenResult.token}`;

    // Preserve the exact job-description version this person was hired against.
    await ensureAssignedJobDescriptionDocument(candidateUserId, req.user.id);

    res.json({
      user: updated,
      passwordlessToken: tokenResult.token,
      passwordlessTokenLink: tokenLink,
      prehirePortalLink: tokenLink
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

export const pasteCandidateResume = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const resumeText = String(req.body?.resumeText || req.body?.text || '').trim().slice(0, 40000);
    if (!resumeText) {
      return res.status(400).json({ error: { message: 'resumeText is required' } });
    }

    const title = String(req.body?.title || 'Resume (pasted text)').trim() || 'Resume (pasted text)';
    const noteText = req.body?.noteText !== undefined ? String(req.body.noteText || '').trim() : null;
    const resumeBuffer = Buffer.from(resumeText, 'utf8');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `resume-${candidateUserId}-${uniqueSuffix}.txt`;

    const storageResult = await StorageService.saveAdminDoc(resumeBuffer, filename, 'text/plain');

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
        'resume.txt',
        'text/plain',
        req.user.id
      ]
    );

    try {
      await HiringResumeParse.upsertByResumeDocId({
        candidateUserId,
        resumeDocId: result.insertId,
        method: 'plain_text',
        status: 'completed',
        extractedText: resumeText,
        extractedJson: null,
        errorText: null,
        createdByUserId: req.user.id
      });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
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
       WHERE id = ? AND user_id = ?
         AND (
           doc_type = 'resume'
           OR doc_type = 'cover_letter'
           OR (doc_type = 'application_material' AND (
             LOWER(COALESCE(title, '')) LIKE '%cover%'
             OR LOWER(COALESCE(original_name, '')) LIKE '%cover%'
           ))
         )
       LIMIT 1`,
      [docId, candidateUserId]
    );
    const doc = rows[0] || null;
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });
    if (!doc.storage_path) return res.status(404).json({ error: { message: 'No file for this document' } });

    const url = await StorageService.getSignedUrl(doc.storage_path, 10);
    res.json({
      url,
      expiresInMinutes: 10,
      originalName: doc.original_name || null,
      mimeType: doc.mime_type || null,
      noteText: doc.note_text || null,
      title: doc.title || null,
      docType: doc.doc_type || null
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

async function tryReextractResumeTextForCandidate(candidateUserId, { preferredDocId = null, createdByUserId = null } = {}) {
  let docs = [];
  if (preferredDocId) {
    const [rows] = await pool.execute(
      `SELECT id, storage_path, mime_type, original_name
       FROM user_admin_docs
       WHERE id = ? AND user_id = ? AND doc_type = 'resume' AND storage_path IS NOT NULL
       LIMIT 1`,
      [preferredDocId, candidateUserId]
    );
    docs = rows || [];
  } else {
    const [rows] = await pool.execute(
      `SELECT id, storage_path, mime_type, original_name
       FROM user_admin_docs
       WHERE user_id = ? AND doc_type = 'resume' AND storage_path IS NOT NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 8`,
      [candidateUserId]
    );
    docs = rows || [];
  }

  for (const doc of docs) {
    try {
      const buf = await StorageService.readObject(doc.storage_path);
      const extraction = await extractResumeTextFromUpload({ buffer: buf, mimeType: doc.mime_type });
      try {
        await HiringResumeParse.upsertByResumeDocId({
          candidateUserId,
          resumeDocId: doc.id,
          method: extraction.method,
          status: extraction.status,
          extractedText: extraction.text || null,
          extractedJson: null,
          errorText: extraction.errorText || null,
          createdByUserId
        });
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
      const text = String(extraction.text || '').trim();
      if (extraction.status === 'completed' && text) {
        return { resumeDocId: doc.id, resumeText: text, method: extraction.method };
      }
    } catch {
      // try next resume doc
    }
  }
  return null;
}

export const reExtractCandidateResume = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    const docId = parseIntParam(req.params.docId);
    if (!candidateUserId || !docId) {
      return res.status(400).json({ error: { message: 'Invalid userId or docId' } });
    }

    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const result = await tryReextractResumeTextForCandidate(candidateUserId, {
      preferredDocId: docId,
      createdByUserId: req.user?.id || null
    });
    if (!result) {
      const parseRow = await HiringResumeParse.findByResumeDocId(docId);
      return res.status(400).json({
        error: {
          message:
            'Could not extract text from this file. If you can select text in the preview, paste it using Paste resume — or upload a text-based PDF/DOCX.',
          details: parseRow?.error_text || parseRow?.status || null
        }
      });
    }

    res.json({
      ok: true,
      resumeDocId: result.resumeDocId,
      method: result.method,
      textLength: result.resumeText.length
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
      const reextracted = await tryReextractResumeTextForCandidate(candidateUserId, {
        createdByUserId: req.user?.id || null
      });
      if (reextracted) {
        resumeText = reextracted.resumeText;
        resumeDocId = reextracted.resumeDocId;
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

    // Pre-hire users stay in PENDING_SETUP / PREHIRE_* until status changes — move them
    // back to PROSPECTIVE so they leave Pre-Hire and appear under Applicants → Not hired.
    const user = await User.findById(candidateUserId);
    const statusUpper = String(user?.status || '').toUpperCase();
    const preHireStatuses = new Set(['PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW']);
    if (user && preHireStatuses.has(statusUpper)) {
      await User.updateStatus(candidateUserId, 'PROSPECTIVE', req.user.id);
      try {
        await pool.execute(
          `UPDATE users
           SET hired_at = NULL,
               passwordless_token = NULL,
               passwordless_token_expires_at = NULL,
               passwordless_token_purpose = NULL
           WHERE id = ?`,
          [candidateUserId]
        );
      } catch {
        await pool.execute(
          `UPDATE users
           SET hired_at = NULL,
               passwordless_token = NULL,
               passwordless_token_expires_at = NULL
           WHERE id = ?`,
          [candidateUserId]
        );
      }
    }

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
    // Interview attendance follow-up splash retired — use End Interview + applicant time capsule instead.
    res.json([]);
  } catch (e) {
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
    // Prefer hours (1 default). Legacy `days` still accepted and converted.
    if (req.body?.hours != null) {
      const hours = parseInt(req.body.hours, 10);
      const out = await snoozeTimeCapsuleReveal(entryId, req.user.id, hours, { unit: 'hours' });
      return res.json(out);
    }
    const days = req.body?.days != null ? parseInt(req.body.days, 10) : null;
    if (days != null) {
      const out = await snoozeTimeCapsuleReveal(entryId, req.user.id, days, { unit: 'days' });
      return res.json(out);
    }
    const out = await snoozeTimeCapsuleReveal(entryId, req.user.id, 1, { unit: 'hours' });
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

export const listCandidateTimeCapsules = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);
    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });
    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
    if (!profile?.id) return res.json([]);

    const stage = String(profile.stage || '').toLowerCase();
    if (stage === 'hired') {
      return res.json({ capsules: [], available: false, reason: 'hired' });
    }

    const capsules = await listTimeCapsulesForHiringProfile(profile.id);
    res.json({ capsules, available: true, hiringProfileId: profile.id });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.json({ capsules: [], available: false });
    }
    next(e);
  }
};

export const createCandidateTimeCapsule = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.body?.agencyId || req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);
    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });
    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
    if (!profile?.id) return res.status(404).json({ error: { message: 'Hiring profile not found' } });
    if (String(profile.stage || '').toLowerCase() === 'hired') {
      return res.status(400).json({ error: { message: 'Time capsules are only available before the candidate is hired.' } });
    }

    const capsules = await createTimeCapsulePredictions({
      hiringProfileId: profile.id,
      authorUserId: req.user.id,
      prediction6m: req.body?.prediction6m,
      prediction12m: req.body?.prediction12m,
      anchorAt: profile.interview_starts_at || profile.created_at || null
    });
    res.status(201).json({ capsules, hiringProfileId: profile.id });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const openCandidateTimeCapsule = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);
    const candidateUserId = parseIntParam(req.params.userId);
    const entryId = parseIntParam(req.params.entryId);
    if (!candidateUserId || !entryId) {
      return res.status(400).json({ error: { message: 'Invalid userId or entryId' } });
    }
    const inAgency = await ensureCandidateInAgency(candidateUserId, agencyId);
    if (!inAgency) return res.status(404).json({ error: { message: 'Candidate not found in this agency' } });

    const opened = await openTimeCapsuleForApplicant(entryId, req.user.id);
    res.json(opened);
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
      'default_contract_config_id',
      'token_expiry_hours',
      'invite_email_subject',
      'invite_email_body',
      'role_package_mappings',
      'handbook_ack_url',
      'handbook_full_url',
      'default_prehire_docs'
    ];
    const patch = {};
    for (const key of allowed) {
      if (key in req.body) {
        // Validate role_package_mappings is an array
        if (key === 'role_package_mappings') {
          patch[key] = Array.isArray(req.body[key]) ? req.body[key] : [];
        } else if (key === 'default_prehire_docs') {
          patch[key] = sanitizePrehireConfig({ documents: req.body[key] }).documents;
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

/**
 * Upload a company-provided pre-hire document file (blank form or document to sign).
 * Stores under GCS and returns metadata to embed in prehire_config_json / agency defaults.
 */
export const uploadPrehireDocFile = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);
    const file = req.file || getUploadedFile(req, 'file');
    if (!file?.buffer) {
      return res.status(400).json({ error: { message: 'file upload is required' } });
    }
    const originalName = String(file.originalname || 'document.pdf').trim().slice(0, 255) || 'document.pdf';
    const mimeType = String(file.mimetype || 'application/octet-stream').trim().slice(0, 120);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeExt = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
    const filename = `prehire-doc-${agencyId}-${uniqueSuffix}${safeExt}`;
    const storageResult = await StorageService.saveAdminDoc(file.buffer, filename, mimeType);
    const filePath = storageResult.relativePath;
    let viewUrl = null;
    try {
      viewUrl = await StorageService.getSignedUrl(filePath, 60);
    } catch { /* ignore */ }
    res.status(201).json({
      filePath,
      fileName: originalName,
      mimeType,
      viewUrl
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/**
 * Append one sanitized pre-hire document into agency default_prehire_docs (by id upsert).
 */
export const addPrehireDocToAgencyDefaults = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);
    const sanitized = sanitizePrehireConfig({ documents: [req.body?.document || req.body] });
    const doc = sanitized.documents[0];
    if (!doc) {
      return res.status(400).json({ error: { message: 'A document with a title is required.' } });
    }

    const [existingRows] = await pool.execute(
      'SELECT prehire_settings FROM agencies WHERE id = ? LIMIT 1',
      [agencyId]
    );
    const rawExisting = existingRows[0]?.prehire_settings;
    const existing = typeof rawExisting === 'string' ? JSON.parse(rawExisting) : (rawExisting || {});
    const currentDocs = Array.isArray(existing.default_prehire_docs) ? existing.default_prehire_docs : [];
    const nextDocs = sanitizePrehireConfig({ documents: currentDocs }).documents;
    const idx = nextDocs.findIndex((d) => d.id === doc.id);
    if (idx >= 0) nextDocs[idx] = doc;
    else nextDocs.push(doc);
    const merged = { ...existing, default_prehire_docs: nextDocs };
    await pool.execute(
      'UPDATE agencies SET prehire_settings = ? WHERE id = ?',
      [JSON.stringify(merged), agencyId]
    );
    res.json({ agencyId, settings: merged, document: doc });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
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

function parsePrehireSettings(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function resolvePrehirePackageId({ candidateUserId, bodyPackageId, settings }) {
  const explicit = parseIntParam(bodyPackageId);
  if (explicit) return explicit;

  try {
    const [hpRows] = await pool.execute(
      'SELECT applied_role FROM hiring_profiles WHERE candidate_user_id = ? LIMIT 1',
      [candidateUserId]
    );
    const appliedRole = hpRows[0]?.applied_role || null;
    if (appliedRole && Array.isArray(settings.role_package_mappings)) {
      const match = settings.role_package_mappings.find(
        (m) => m.role && String(m.role).toLowerCase() === String(appliedRole).toLowerCase()
      );
      if (match?.packageId) return parseIntParam(match.packageId);
    }
  } catch {
    // non-fatal
  }

  return parseIntParam(settings.default_prehire_package_id);
}

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
          source: existing?.source || null,
          jobDescriptionId: existing?.job_description_id || existing?.jobDescriptionId || null,
          coverLetterText: existing?.cover_letter_text || existing?.coverLetterText || null
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

    const recipientEmail = String(user.personal_email || user.email || '').trim();
    if (tokenLink && !recipientEmail) {
      console.warn('[sendPreHire] No personal_email or email for candidate', candidateUserId);
    }

    // 2. Assign selected document templates as tasks
    const { documentTemplateIds, signerAssignments = [], packageId: bodyPackageId } = req.body;
    const { default: TaskAssignmentService } = await import('../services/taskAssignment.service.js');
    const { default: DocumentTemplate } = await import('../models/DocumentTemplate.model.js');
    const { default: OnboardingPackage } = await import('../models/OnboardingPackage.model.js');
    const { scopeFromPackageAssignment } = await import('../services/lifecycleScope.service.js');
    const assignedTasks = [];

    const [prehireSettingsRows] = await pool.execute(
      'SELECT prehire_settings FROM agencies WHERE id = ? LIMIT 1',
      [agencyId]
    );
    const prehireSettings = parsePrehireSettings(prehireSettingsRows[0]?.prehire_settings);

    const resolvedPackageId = await resolvePrehirePackageId({
      candidateUserId,
      bodyPackageId,
      settings: prehireSettings
    });

    let templateIds;
    if (Array.isArray(documentTemplateIds)) {
      // Explicit list (including empty) — do not dump the unused library or package
      templateIds = documentTemplateIds
        .map((id) => parseInt(id, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
    } else {
      templateIds = [];
      if (resolvedPackageId) {
        const docs = await OnboardingPackage.getDocuments(resolvedPackageId);
        templateIds = (docs || []).map((d) => d.document_template_id).filter(Boolean);
      }
    }

    const extraTemplateIds = (req.body?.selectedJobDocs || [])
      .map((d) => Number(d?.templateId || d?.documentTemplateId || 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    for (const id of extraTemplateIds) {
      if (!templateIds.includes(id)) templateIds.push(id);
    }

    for (const templateId of templateIds) {
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
          lifecycleItemKey: tmpl.lifecycle_item_key || null,
          metadata: {
            prehire: true,
            lifecycleItemKey: tmpl.lifecycle_item_key || undefined
          }
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

    if (resolvedPackageId) {
      try {
        await scopeFromPackageAssignment(candidateUserId, resolvedPackageId);
      } catch (scopeErr) {
        console.warn('[sendPreHire] lifecycle scope failed:', scopeErr?.message);
      }
    }

    try {
      const StaffClientComfortPreference = (await import('../models/StaffClientComfortPreference.model.js')).default;
      await StaffClientComfortPreference.promoteDraftToUser(
        { userId: candidateUserId, agencyId, hiringProfileId: null },
        req.user?.id
      );
    } catch (comfortErr) {
      console.warn('[sendPreHire] comfort prefs promote failed:', comfortErr?.message);
    }

    // Auto-generate employment contract when agency has a default contract config/template
    let contractResult = null;
    try {
      const contractTemplateId = Number(prehireSettings?.default_contract_template_id || 0) || null;
      const contractConfigId = Number(prehireSettings?.default_contract_config_id || 0) || null;
      if (contractConfigId || contractTemplateId) {
        const { generateAndAssignCandidateContract } = await import('../services/contractGenerator.service.js');
        contractResult = await generateAndAssignCandidateContract({
          agencyId,
          candidateUserId,
          configId: Number(req.body?.contractConfigId || 0) || contractConfigId || null,
          templateId: Number(req.body?.contractTemplateId || 0) || contractTemplateId || null,
          createdByUserId: req.user.id,
          credentialOverride: String(req.body?.credential || '').trim() || null,
          compensationCategory: req.body?.compensationCategory != null && req.body?.compensationCategory !== ''
            ? Number(req.body.compensationCategory)
            : null,
          tokens: req.body?.contractTokens && typeof req.body.contractTokens === 'object'
            ? req.body.contractTokens
            : {},
          taskMetadata: { prehire: true, autoFromSendPreHire: true, contractGeneration: true }
        });
        if (contractResult?.task) assignedTasks.push(contractResult.task);
      }
    } catch (contractErr) {
      console.warn('[sendPreHire] contract generate failed:', contractErr?.message || contractErr);
    }

    const checklistTitles = [];
    try {
      const tokens = req.body?.contractTokens && typeof req.body.contractTokens === 'object'
        ? req.body.contractTokens
        : {};
      const profile = await HiringProfile.findByCandidateUserId(candidateUserId);
      let jobConfig = null;
      if (profile?.job_description_id) {
        const jd = await HiringJobDescription.findById(profile.job_description_id);
        jobConfig = jd?.prehire_config_json || null;
      }
      const merged = mergePrehireDocuments(jobConfig, {
        documents: Array.isArray(prehireSettings?.default_prehire_docs)
          ? prehireSettings.default_prehire_docs
          : []
      });
      const seedItems = [
        {
          itemKey: 'background_check',
          title: 'Authorization for Background Check',
          instructions: 'Complete the encrypted authorization form in your portal.',
          scheduledOn: null
        },
        {
          itemKey: 'job_description_ack',
          title: 'Acknowledge job description',
          instructions: 'Review the job description and sign to confirm.',
          scheduledOn: null
        },
        ...merged.documents.map((d) => ({
          itemKey: `doc:${d.id}`,
          title: d.title,
          instructions: d.instructions || null,
          scheduledOn: d.scheduledOn || null
        }))
      ];
      if (prehireSettings?.handbook_ack_url) {
        seedItems.push({
          itemKey: 'handbook_ack',
          title: 'Employee Handbook acknowledgement',
          instructions: 'Open and review the handbook acknowledgement.',
          scheduledOn: null
        });
      }
      for (const item of seedItems) {
        checklistTitles.push(item.title);
        try {
          await pool.execute(
            `INSERT INTO hiring_prehire_checklist_items
              (user_id, agency_id, item_key, title, instructions, scheduled_on)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               title = VALUES(title),
               instructions = VALUES(instructions),
               scheduled_on = COALESCE(VALUES(scheduled_on), scheduled_on)`,
            [candidateUserId, agencyId, item.itemKey, item.title, item.instructions, item.scheduledOn]
          );
        } catch (seedErr) {
          if (seedErr?.code !== 'ER_NO_SUCH_TABLE') {
            console.warn('[sendPreHire] checklist seed failed:', seedErr?.message);
          }
        }
      }
    } catch (checkErr) {
      console.warn('[sendPreHire] checklist seed failed:', checkErr?.message);
    }

    if (tokenLink && recipientEmail) {
      const tokens = req.body?.contractTokens && typeof req.body.contractTokens === 'object'
        ? req.body.contractTokens
        : {};
      setImmediate(async () => {
        try {
          const { sendPrehirePortalInviteEmail } = await import('../services/prehireInviteEmail.service.js');
          await sendPrehirePortalInviteEmail({
            agencyId,
            candidateUserId,
            portalLink: tokenLink,
            customSubject: req.body?.msgSubject,
            customBody: req.body?.msgBody,
            generatedByUserId: req.user?.id || null,
            inviteDetails: {
              startDate: tokens.START_DATE || req.body?.startDate || null,
              expirationDate: tokens.EXPIRATION_DATE || tokens.CONTRACT_EXPIRATION || null,
              minDays: tokens.MIN_DAYS_PER_WEEK || tokens.MIN_DAYS || null,
              minHours: tokens.MIN_HOURS || tokens.MIN_HOURS_PER_WEEK || null,
              steps: checklistTitles
            }
          });
        } catch (emailErr) {
          console.error('[sendPreHire] Failed to send invite email:', emailErr);
        }
      });
    }

    res.json({
      ok: true,
      passwordlessToken: tokenResult?.token || null,
      passwordlessTokenLink: tokenLink,
      assignedTaskCount: assignedTasks.length,
      signerTaskCount: signerAssignments.length * assignedTasks.length,
      packageId: resolvedPackageId || null,
      contractTaskId: contractResult?.task?.id || null
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
    const agency = agencyId ? await Agency.findById(agencyId) : null;

    if (sendMethod === 'token') {
      const tokenResult = await User.generatePasswordlessToken(candidateUserId, 7 * 24);
      const tokenLink = buildPublicAppUrl(agency, `passwordless-login/${tokenResult.token}`);
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
            text: `Hi ${user.first_name || 'there'},\n\nYour onboarding account is now active. Log in at:\n\n${buildPublicAppUrl(agency, 'login')}\n\nEmail: ${loginEmail}\n\nIf you need to reset your password, use the "Forgot password" link on the login page.`
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
             AND (t.document_action_type IS NULL OR t.document_action_type != 'countersignature')
             AND t.status = 'completed'
         ) AS task_completed,
         (
           SELECT COUNT(*) FROM tasks t
           WHERE t.assigned_to_user_id = u.id
             AND t.is_required = 1
             AND (t.document_action_type IS NULL OR t.document_action_type != 'countersignature')
             AND t.status != 'deleted'
         ) AS required_total,
         (
           SELECT COUNT(*) FROM tasks t
           WHERE t.assigned_to_user_id = u.id
             AND t.is_required = 1
             AND (t.document_action_type IS NULL OR t.document_action_type != 'countersignature')
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
             AND (t.document_action_type IS NULL OR t.document_action_type != 'countersignature')
             AND t.status != 'deleted'
         ) AS task_total,
         (
           SELECT COUNT(*) FROM tasks t
           WHERE t.assigned_to_user_id = u.id
             AND (t.document_action_type IS NULL OR t.document_action_type != 'countersignature')
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

/**
 * POST /api/hiring/candidates/:userId/send-document
 * Retroactively assign a single document template to an existing pre-hire.
 */
export const sendDocumentToCandidate = async (req, res, next) => {
  try {
    const agencyId = parseIntParam(req.query.agencyId || req.body.agencyId || req.user?.agencyId);
    await ensureAgencyAccess(req, agencyId);

    const candidateUserId = parseIntParam(req.params.userId);
    if (!candidateUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const documentTemplateId = parseIntParam(req.body.documentTemplateId);
    if (!documentTemplateId) return res.status(400).json({ error: { message: 'documentTemplateId is required' } });

    const { default: DocumentTemplate } = await import('../models/DocumentTemplate.model.js');
    const { default: TaskAssignmentService } = await import('../services/taskAssignment.service.js');

    const tmpl = await DocumentTemplate.findById(documentTemplateId);
    if (!tmpl) return res.status(404).json({ error: { message: 'Document template not found' } });

    const task = await TaskAssignmentService.assignDocumentTask({
      title: tmpl.name,
      description: tmpl.description || '',
      documentTemplateId,
      assignedByUserId: req.user.id,
      assignedToUserId: candidateUserId,
      assignedToAgencyId: agencyId,
      documentActionType: tmpl.document_action_type || 'signature',
      isRequired: tmpl.is_required ? 1 : 0,
      lifecycleItemKey: tmpl.lifecycle_item_key || null,
      metadata: {
        prehire: true,
        retroactive: true,
        lifecycleItemKey: tmpl.lifecycle_item_key || undefined
      }
    });

    // Also make sure the JD document is snapshotted for this candidate
    await ensureAssignedJobDescriptionDocument(candidateUserId, req.user.id);

    // Queue a batched notification email (fires 15 min after first addition)
    const { queuePrehireNotification } = await import('../services/prehireNotification.service.js');
    await queuePrehireNotification(candidateUserId, agencyId, {
      type: 'document',
      title: tmpl.name,
    });

    res.status(201).json({ task });
  } catch (e) { next(e); }
};
