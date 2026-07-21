import multer from 'multer';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import StorageService from '../services/storage.service.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { isSupervisorActor, supervisorHasSuperviseeInSchool } from '../utils/supervisorSchoolAccess.js';
import { userHasAgencyOrAffiliatedOrgAccessForRequest } from '../utils/userAgencyAffiliationAccess.js';
import EmailService from '../services/email.service.js';
import {
  SCHOOL_EVENT_CATEGORIES,
  categoryToEventType,
  createDistrictSchoolEvents,
  createPostToken,
  createSchoolPortalEvent,
  currentSchoolYearLabel,
  getMissingCategoriesForOrg,
  getSchoolEventOverviewForAgency,
  getSchoolYearCoverageForAgency,
  listDistrictsForAgency,
  listSchoolEventsForOrg,
  markPostTokenUsed,
  parseSchoolEventWallTime,
  resolveAgencyIdForSchoolOrg,
  schoolEventCategoryLabel,
  schoolYearBounds,
  updateDistrictSchoolEvents,
  updateSchoolPortalEvent,
  validatePostToken
} from '../services/schoolPortalEvents.service.js';
import KioskModel from '../models/Kiosk.model.js';
import crypto from 'crypto';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);
    if (allowed.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Invalid file type. Allowed: PDF, JPG, PNG.'), false);
  }
});

async function resolveActiveAgencyIdForOrg(orgId) {
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
}

function roleCanUseAgencyAffiliation(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'support' || r === 'staff' || r === 'supervisor';
}

async function providerHasSchoolAccess({ providerUserId, schoolOrganizationId }) {
  const uid = parseInt(providerUserId, 10);
  const orgId = parseInt(schoolOrganizationId, 10);
  if (!uid || !orgId) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM provider_school_assignments psa
       WHERE psa.school_organization_id = ? AND psa.provider_user_id = ? AND psa.is_active = TRUE
       LIMIT 1`,
      [orgId, uid]
    );
    if (rows?.[0]) return true;
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes("doesn't exist") && !msg.includes('ER_NO_SUCH_TABLE')) throw e;
  }
  return false;
}

async function userHasOrgOrAffiliatedAgencyAccess({ userId, role, user = null, schoolOrganizationId }) {
  if (!userId) return false;
  const roleNorm = String(role || '').toLowerCase();
  const userOrgs = await User.getAgencies(userId);
  const hasDirect = (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(schoolOrganizationId, 10));
  if (hasDirect) return true;
  const hasSupervisorCapability = await isSupervisorActor({ userId, role, user });
  const providerLikeRoles = new Set(['provider', 'intern', 'intern_plus', 'provider_plus']);
  if (providerLikeRoles.has(roleNorm)) {
    const hasProviderAccess = await providerHasSchoolAccess({ providerUserId: userId, schoolOrganizationId });
    if (hasProviderAccess) return true;
    if (!hasSupervisorCapability) return false;
  }
  if (hasSupervisorCapability) {
    const hasSuperviseeSchoolAccess = await supervisorHasSuperviseeInSchool(userId, schoolOrganizationId);
    if (hasSuperviseeSchoolAccess) return true;
  }
  if (!roleCanUseAgencyAffiliation(role)) return false;
  const activeAgencyId = await resolveActiveAgencyIdForOrg(schoolOrganizationId);
  if (!activeAgencyId) return false;
  return (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(activeAgencyId, 10));
}

async function assertSchoolPortalReadAccess(req, organizationId) {
  const orgId = parseInt(String(organizationId || ''), 10);
  if (!orgId) {
    const err = new Error('Invalid organizationId');
    err.status = 400;
    throw err;
  }
  const userId = req.user?.id;
  const role = String(req.user?.role || '').toLowerCase();
  if (!userId) {
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }
  if (role === 'super_admin') return { orgId, userId, role };
  const ok = await userHasOrgOrAffiliatedAgencyAccess({
    userId,
    role,
    user: req.user,
    schoolOrganizationId: orgId
  });
  if (!ok) {
    const err = new Error('Not authorized for this school portal');
    err.status = 403;
    throw err;
  }
  return { orgId, userId, role };
}

/** Roles that may create/update school portal events (school staff + assigned providers + agency managers). */
const SCHOOL_EVENT_MANAGE_ROLES = new Set([
  'school_staff',
  'super_admin',
  'admin',
  'support',
  'staff',
  'clinical_practice_assistant',
  'provider_plus',
  'provider',
  'intern',
  'intern_plus'
]);

/** Provider-like roles must be assigned to the school (or have direct school membership). */
const SCHOOL_EVENT_PROVIDER_CREATE_ROLES = new Set([
  'provider',
  'intern',
  'intern_plus',
  'provider_plus'
]);

async function assertSchoolStaffPortalAccess(req, organizationId) {
  const { orgId, userId, role } = await assertSchoolPortalReadAccess(req, organizationId);
  if (!SCHOOL_EVENT_MANAGE_ROLES.has(role)) {
    const err = new Error('Not authorized to manage school events');
    err.status = 403;
    throw err;
  }
  if (SCHOOL_EVENT_PROVIDER_CREATE_ROLES.has(role) && role !== 'super_admin') {
    const userOrgs = await User.getAgencies(userId);
    const hasDirect = (userOrgs || []).some((org) => parseInt(org.id, 10) === parseInt(orgId, 10));
    if (!hasDirect) {
      const assigned = await providerHasSchoolAccess({ providerUserId: userId, schoolOrganizationId: orgId });
      if (!assigned) {
        const err = new Error('Not authorized to manage school events for this school');
        err.status = 403;
        throw err;
      }
    }
  }
  return { orgId, userId, role };
}

async function assertAgencyAdminAccess(req, agencyId) {
  const aid = parseInt(String(agencyId || ''), 10);
  if (!aid) {
    const err = new Error('agencyId is required');
    err.status = 400;
    throw err;
  }
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return aid;
  const allowed = ['admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'];
  if (!allowed.includes(role)) {
    const err = new Error('Admin access required');
    err.status = 403;
    throw err;
  }
  const ok = await userHasAgencyOrAffiliatedOrgAccessForRequest(req, aid);
  if (!ok) {
    const err = new Error('Not authorized for this agency');
    err.status = 403;
    throw err;
  }
  return aid;
}

function getFrontendBaseUrl() {
  return String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function categoryLabel(category) {
  return schoolEventCategoryLabel(category);
}

async function listSchoolStaffRecipients(schoolOrganizationId) {
  const sid = parseInt(schoolOrganizationId, 10);
  if (!sid) return [];
  const [rows] = await pool.execute(
    `SELECT u.id, u.email, u.work_email, u.first_name, u.last_name
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND LOWER(COALESCE(u.role, '')) = 'school_staff'
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'`,
    [sid]
  );
  return rows || [];
}

function pickRecipientEmail(userRow) {
  const work = String(userRow?.work_email || '').trim();
  const personal = String(userRow?.email || '').trim();
  return work || personal || '';
}

async function userCanEditSchoolEventPayrollFields({ userId, role, agencyId }) {
  const r = String(role || '').toLowerCase();
  if (r === 'super_admin' || r === 'admin') return true;
  const uid = parseInt(String(userId || ''), 10);
  const aid = parseInt(String(agencyId || ''), 10);
  if (!uid || !aid) return false;
  try {
    const [rows] = await pool.execute(
      'SELECT has_payroll_access FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [uid, aid]
    );
    const flag = rows?.[0]?.has_payroll_access;
    return flag === 1 || flag === true || flag === '1';
  } catch {
    return false;
  }
}

function parseSchoolEventBody(body) {
  const category = String(body?.category || body?.eventCategory || '').trim().toLowerCase();
  const title = String(body?.title || body?.name || '').trim();
  const description = String(body?.description || body?.details || '').trim();
  const startsAtRaw = body?.startsAt ?? body?.starts_at;
  const endsAtRaw = body?.endsAt ?? body?.ends_at;
  const outreachTableInvited =
    body?.outreachTableInvited === true ||
    body?.outreach_table_invited === true ||
    body?.outreachTableInvited === 1 ||
    body?.outreach_table_invited === 1 ||
    String(body?.outreachTableInvited || body?.outreach_table_invited || '').toLowerCase() === 'true';
  const eventImageUrl = body?.eventImageUrl ?? body?.event_image_url;
  const flierFileUrl = body?.flierFileUrl ?? body?.flier_file_url;
  const timezone = body?.timezone;
  const statusRaw = body?.schoolEventStatus ?? body?.school_event_status ?? body?.status;
  const reportRaw = body?.employeeReportTime ?? body?.employee_report_time;
  // School portal events are always paid as indirect — never accept a direct hours cap.
  const skillBuilderDirectHours = 0;
  const minRaw = body?.minProvidersPerSession ?? body?.min_providers_per_session;
  let minProvidersPerSession;
  if (minRaw !== undefined && minRaw !== null && minRaw !== '') {
    const n = Number(minRaw);
    minProvidersPerSession = Number.isFinite(n) && n >= 1 ? Math.min(99, Math.floor(n)) : undefined;
  }
  const detailsUrlRaw = body?.detailsUrl ?? body?.details_url;
  let detailsUrl;
  if (detailsUrlRaw !== undefined) {
    detailsUrl = detailsUrlRaw === null || detailsUrlRaw === ''
      ? null
      : String(detailsUrlRaw).trim().slice(0, 1000) || null;
  }
  return {
    category,
    title,
    description,
    startsAt: startsAtRaw ? new Date(startsAtRaw) : null,
    endsAt: endsAtRaw ? new Date(endsAtRaw) : null,
    outreachTableInvited,
    eventImageUrl: eventImageUrl !== undefined ? String(eventImageUrl || '').trim() || null : undefined,
    flierFileUrl: flierFileUrl !== undefined ? String(flierFileUrl || '').trim() || null : undefined,
    detailsUrl,
    timezone,
    schoolEventStatus: statusRaw !== undefined && statusRaw !== null && statusRaw !== ''
      ? String(statusRaw).trim().toLowerCase()
      : undefined,
    employeeReportTime: reportRaw !== undefined
      ? (reportRaw === null || reportRaw === '' ? null : parseSchoolEventWallTime(reportRaw))
      : undefined,
    skillBuilderDirectHours,
    minProvidersPerSession
  };
}

export const listSchoolPortalEvents = async (req, res, next) => {
  try {
    const { orgId, userId } = await assertSchoolPortalReadAccess(req, req.params.organizationId);
    const events = await listSchoolEventsForOrg(orgId, { viewerUserId: userId });
    const schoolYear = currentSchoolYearLabel();
    const missingCategories = await getMissingCategoriesForOrg(orgId, schoolYear);
    const bounds = schoolYearBounds(schoolYear);
    res.json({
      events,
      missingCategories,
      year: bounds.startYear,
      schoolYear,
      range: { start: bounds.start, end: bounds.end }
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getSchoolPortalEventsMissing = async (req, res, next) => {
  try {
    const { orgId } = await assertSchoolStaffPortalAccess(req, req.params.organizationId);
    const schoolYear =
      String(req.query?.schoolYear || req.query?.school_year || '').trim() ||
      (req.query?.year
        ? `${parseInt(String(req.query.year), 10)}-${parseInt(String(req.query.year), 10) + 1}`
        : currentSchoolYearLabel());
    const missingCategories = await getMissingCategoriesForOrg(orgId, schoolYear);
    const bounds = schoolYearBounds(schoolYear);
    res.json({
      missingCategories,
      year: bounds.startYear,
      schoolYear: bounds.label,
      range: { start: bounds.start, end: bounds.end }
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const createSchoolPortalEventHandler = async (req, res, next) => {
  try {
    const { orgId, userId, role } = await assertSchoolStaffPortalAccess(req, req.params.organizationId);
    const agencyId = await resolveAgencyIdForSchoolOrg(orgId);
    if (!agencyId) return res.status(400).json({ error: { message: 'School is not linked to an agency' } });

    const parsed = parseSchoolEventBody(req.body || {});
    if (!parsed.category || !SCHOOL_EVENT_CATEGORIES.includes(parsed.category)) {
      return res.status(400).json({
        error: { message: `category must be one of: ${SCHOOL_EVENT_CATEGORIES.join(', ')}` }
      });
    }
    if (!parsed.title) return res.status(400).json({ error: { message: 'title is required' } });
    if (!parsed.startsAt || !parsed.endsAt) {
      return res.status(400).json({ error: { message: 'startsAt and endsAt are required' } });
    }

    const canEditPayroll = await userCanEditSchoolEventPayrollFields({ userId, role, agencyId });
    if (parsed.skillBuilderDirectHours !== undefined && !canEditPayroll) {
      return res.status(403).json({
        error: { message: 'Only payroll or admin can set direct hours for school events' }
      });
    }

    const event = await createSchoolPortalEvent({
      agencyId,
      organizationId: orgId,
      userId,
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      timezone: parsed.timezone,
      outreachTableInvited: parsed.outreachTableInvited,
      eventImageUrl: parsed.eventImageUrl,
      flierFileUrl: parsed.flierFileUrl,
      detailsUrl: parsed.detailsUrl ?? null,
      schoolEventStatus: parsed.schoolEventStatus || 'scheduled',
      employeeReportTime: parsed.employeeReportTime,
      skillBuilderDirectHours: canEditPayroll && parsed.skillBuilderDirectHours !== undefined
        ? parsed.skillBuilderDirectHours
        : 0,
      minProvidersPerSession: parsed.minProvidersPerSession ?? 2
    });

    const postToken = String(req.body?.postToken || req.body?.setk || '').trim();
    if (postToken) {
      await markPostTokenUsed(postToken, event.id);
    }

    res.status(201).json(event);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const updateSchoolPortalEventHandler = async (req, res, next) => {
  try {
    const { orgId, userId, role } = await assertSchoolStaffPortalAccess(req, req.params.organizationId);
    const eventId = parseInt(String(req.params.eventId || ''), 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid eventId' } });
    const agencyId = await resolveAgencyIdForSchoolOrg(orgId);
    if (!agencyId) return res.status(400).json({ error: { message: 'School is not linked to an agency' } });

    const parsed = parseSchoolEventBody(req.body || {});
    if (parsed.category && !SCHOOL_EVENT_CATEGORIES.includes(parsed.category)) {
      return res.status(400).json({ error: { message: 'Invalid category' } });
    }

    const canEditPayroll = await userCanEditSchoolEventPayrollFields({ userId, role, agencyId });
    if (parsed.skillBuilderDirectHours !== undefined && !canEditPayroll) {
      return res.status(403).json({
        error: { message: 'Only payroll or admin can set direct hours for school events' }
      });
    }

    const event = await updateSchoolPortalEvent({
      eventId,
      organizationId: orgId,
      agencyId,
      userId,
      title: parsed.title || undefined,
      description: parsed.description,
      category: parsed.category || undefined,
      startsAt: parsed.startsAt || undefined,
      endsAt: parsed.endsAt || undefined,
      timezone: parsed.timezone,
      outreachTableInvited: req.body?.outreachTableInvited ?? req.body?.outreach_table_invited,
      eventImageUrl: parsed.eventImageUrl,
      flierFileUrl: parsed.flierFileUrl,
      clearFlier: req.body?.clearFlier === true || req.body?.clear_flier === true,
      detailsUrl: parsed.detailsUrl,
      schoolEventStatus: parsed.schoolEventStatus,
      employeeReportTime: parsed.employeeReportTime,
      skillBuilderDirectHours: canEditPayroll ? parsed.skillBuilderDirectHours : undefined,
      minProvidersPerSession: parsed.minProvidersPerSession
    });
    res.json(event);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const uploadSchoolEventFlier = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const { orgId } = await assertSchoolStaffPortalAccess(req, req.params.organizationId);
      if (!req.file) return res.status(400).json({ error: { message: 'No file uploaded' } });

      const saved = await StorageService.saveSchoolPublicDocument({
        schoolOrganizationId: orgId,
        uploadedByUserId: req.user?.id || null,
        fileBuffer: req.file.buffer,
        filename: req.file.originalname || `school-event-flier-${Date.now()}`,
        contentType: req.file.mimetype
      });

      const isImage = String(req.file.mimetype || '').startsWith('image/');
      res.status(201).json({
        url: saved?.path || null,
        flierFileUrl: saved?.path || null,
        eventImageUrl: isImage ? (saved?.path || null) : null,
        mimeType: req.file.mimetype
      });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: { message: e.message } });
      next(e);
    }
  }
];

export const getSchoolEventsOverview = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdminAccess(req, req.query?.agencyId);
    const schoolYear =
      String(req.query?.schoolYear || req.query?.school_year || '').trim() ||
      (req.query?.year
        ? `${parseInt(String(req.query.year), 10)}-${parseInt(String(req.query.year), 10) + 1}`
        : currentSchoolYearLabel());
    const overview = await getSchoolEventOverviewForAgency(agencyId, schoolYear);
    res.json(overview);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** GET /api/school-portal/school-events/school-year-coverage?agencyId=&schoolYear=2026-2027 */
export const getSchoolYearCoverage = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdminAccess(req, req.query?.agencyId);
    const schoolYear =
      String(req.query?.schoolYear || req.query?.school_year || '').trim() || currentSchoolYearLabel();
    const coverage = await getSchoolYearCoverageForAgency(agencyId, schoolYear);
    res.json(coverage);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** GET /api/school-portal/school-events/districts?agencyId= */
export const listSchoolEventDistricts = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdminAccess(req, req.query?.agencyId);
    const districts = await listDistrictsForAgency(agencyId);
    res.json({ agencyId, districts });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** PUT /api/school-portal/school-events/district/:broadcastId — edit all schools in a district broadcast */
export const updateDistrictSchoolEventHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdminAccess(req, req.body?.agencyId ?? req.query?.agencyId);
    const broadcastId = String(req.params.broadcastId || req.body?.districtBroadcastId || '').trim();
    if (!broadcastId) {
      return res.status(400).json({ error: { message: 'districtBroadcastId is required' } });
    }
    const parsed = parseSchoolEventBody(req.body || {});
    if (parsed.category && !SCHOOL_EVENT_CATEGORIES.includes(parsed.category)) {
      return res.status(400).json({ error: { message: 'Invalid category' } });
    }

    const canEditPayroll = await userCanEditSchoolEventPayrollFields({
      userId: req.user?.id,
      role: req.user?.role,
      agencyId
    });
    if (parsed.skillBuilderDirectHours !== undefined && !canEditPayroll) {
      return res.status(403).json({
        error: { message: 'Only payroll or admin can set direct hours for school events' }
      });
    }

    const result = await updateDistrictSchoolEvents({
      agencyId,
      districtBroadcastId: broadcastId,
      userId: req.user?.id,
      title: parsed.title || undefined,
      description: parsed.description,
      category: parsed.category || undefined,
      startsAt: parsed.startsAt || undefined,
      endsAt: parsed.endsAt || undefined,
      timezone: parsed.timezone,
      outreachTableInvited: req.body?.outreachTableInvited ?? req.body?.outreach_table_invited,
      detailsUrl: parsed.detailsUrl,
      schoolEventStatus: parsed.schoolEventStatus,
      employeeReportTime: parsed.employeeReportTime,
      skillBuilderDirectHours: canEditPayroll ? parsed.skillBuilderDirectHours : undefined,
      minProvidersPerSession: parsed.minProvidersPerSession
    });
    res.json(result);
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: { message: e.message, details: e.details } });
    }
    next(e);
  }
};

/** POST /api/school-portal/school-events/district — fan-out to all schools in a district */
export const createDistrictSchoolEventHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdminAccess(req, req.body?.agencyId ?? req.query?.agencyId);
    const districtName = String(req.body?.districtName || req.body?.district_name || '').trim();
    if (!districtName) {
      return res.status(400).json({ error: { message: 'districtName is required' } });
    }
    const parsed = parseSchoolEventBody(req.body || {});
    if (!parsed.category || !SCHOOL_EVENT_CATEGORIES.includes(parsed.category)) {
      return res.status(400).json({
        error: { message: `category must be one of: ${SCHOOL_EVENT_CATEGORIES.join(', ')}` }
      });
    }
    if (!parsed.title) return res.status(400).json({ error: { message: 'title is required' } });
    if (!parsed.startsAt || !parsed.endsAt) {
      return res.status(400).json({ error: { message: 'startsAt and endsAt are required' } });
    }

    const canEditPayroll = await userCanEditSchoolEventPayrollFields({
      userId: req.user?.id,
      role: req.user?.role,
      agencyId
    });

    const result = await createDistrictSchoolEvents({
      agencyId,
      userId: req.user?.id,
      districtName,
      category: parsed.category,
      title: parsed.title,
      description: parsed.description,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      timezone: parsed.timezone,
      employeeReportTime: parsed.employeeReportTime,
      skillBuilderDirectHours: canEditPayroll && parsed.skillBuilderDirectHours !== undefined
        ? parsed.skillBuilderDirectHours
        : 0,
      minProvidersPerSession: parsed.minProvidersPerSession ?? 2,
      detailsUrl: parsed.detailsUrl ?? null,
      schoolEventStatus: parsed.schoolEventStatus || 'scheduled'
    });
    res.status(201).json(result);
  } catch (e) {
    if (e.status) {
      return res.status(e.status).json({ error: { message: e.message, details: e.details } });
    }
    next(e);
  }
};

export const validateSchoolEventPostToken = async (req, res, next) => {
  try {
    const result = await validatePostToken(req.params.token);
    if (!result) return res.status(404).json({ error: { message: 'Token not found' } });
    if (!result.valid) {
      return res.status(410).json({ error: { message: result.reason === 'used' ? 'This link has already been used' : 'This link has expired' } });
    }
    res.json({
      valid: true,
      schoolOrganizationId: result.schoolOrganizationId,
      agencyId: result.agencyId,
      eventCategory: result.eventCategory,
      schoolName: result.schoolName,
      schoolSlug: result.schoolSlug
    });
  } catch (e) {
    next(e);
  }
};

export const requestSchoolEventSubmissions = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdminAccess(req, req.body?.agencyId ?? req.query?.agencyId);
    const category = String(req.body?.category || req.body?.eventCategory || 'back_to_school').trim().toLowerCase();
    if (!SCHOOL_EVENT_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: { message: `category must be one of: ${SCHOOL_EVENT_CATEGORIES.join(', ')}` }
      });
    }
    const schoolYear =
      String(req.body?.schoolYear || req.body?.school_year || '').trim() ||
      (req.body?.year
        ? `${parseInt(String(req.body.year), 10)}-${parseInt(String(req.body.year), 10) + 1}`
        : currentSchoolYearLabel());
    const year = schoolYearBounds(schoolYear).startYear;
    const customMessage = String(req.body?.message || '').trim();
    const eventType = categoryToEventType(category);
    const overview = await getSchoolEventOverviewForAgency(agencyId, schoolYear);
    const targetSchools = overview.schools.filter((school) =>
      (overview.missingBySchool[school.id] || []).includes(category)
    );

    if (!targetSchools.length) {
      return res.json({ ok: true, emailedSchools: 0, emailedRecipients: 0, message: 'All schools have already posted this event type.' });
    }

    const frontendBase = getFrontendBaseUrl();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    let emailedRecipients = 0;
    let emailedSchools = 0;

    for (const school of targetSchools) {
      const token = await createPostToken({
        agencyId,
        schoolOrganizationId: school.id,
        eventCategory: category,
        createdByUserId: req.user?.id || null,
        expiresAt
      });
      const slug = school.slug;
      if (!slug) continue;
      const link = `${frontendBase}/${slug}/dashboard?postSchoolEvent=${encodeURIComponent(category)}&setk=${encodeURIComponent(token)}`;
      const recipients = await listSchoolStaffRecipients(school.id);
      const emails = recipients.map(pickRecipientEmail).filter(Boolean);
      if (!emails.length) continue;

      const label = categoryLabel(category);
      const subject = `Please share your school's ${label} event`;
      const bodyLines = [
        customMessage || `Please input your school's ${label.toLowerCase()} event info so our team can coordinate outreach support.`,
        '',
        `School: ${school.name}`,
        '',
        `Post your event: ${link}`,
        '',
        'This link expires in 30 days.'
      ];
      const html = bodyLines.map((line) => `<p>${line || '&nbsp;'}</p>`).join('');

      for (const email of [...new Set(emails)]) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await EmailService.sendEmail({
            to: email,
            subject,
            text: bodyLines.join('\n'),
            html
          });
          emailedRecipients += 1;
        } catch {
          /* best-effort per recipient */
        }
      }
      emailedSchools += 1;
    }

    res.json({
      ok: true,
      emailedSchools,
      emailedRecipients,
      targetSchoolCount: targetSchools.length,
      category,
      year
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

function generateSixDigitPin() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function normalizeSchoolEventsHubPin(pin) {
  const p = String(pin || '').trim();
  return /^\d{4,6}$/.test(p) ? p : null;
}

/** GET /api/school-portal/school-events/kiosk-settings?agencyId= */
export const getSchoolEventsKioskSettings = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdminAccess(req, req.query?.agencyId);
    const [rows] = await pool.execute(
      `SELECT school_events_kiosk_pin_code, school_events_kiosk_pin_hash, portal_url, slug
       FROM agencies WHERE id = ? LIMIT 1`,
      [agencyId]
    ).catch((e) => {
      if (e?.code === 'ER_BAD_FIELD_ERROR') return [[{}]];
      throw e;
    });
    const row = rows?.[0] || {};
    const pinSet = !!(row.school_events_kiosk_pin_hash);
    const slug = String(row.portal_url || row.slug || '').trim().toLowerCase();
    const frontendBase = getFrontendBaseUrl();
    res.json({
      agencyId,
      pinSet,
      pinCode: pinSet && row.school_events_kiosk_pin_code
        ? String(row.school_events_kiosk_pin_code).trim()
        : null,
      kioskPath: slug ? `/${slug}/school-events/kiosk` : null,
      kioskUrl: slug ? `${frontendBase}/${slug}/school-events/kiosk` : null
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** POST /api/school-portal/school-events/kiosk-settings/rotate-pin { agencyId, pin? } */
export const rotateSchoolEventsKioskPin = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdminAccess(req, req.body?.agencyId ?? req.query?.agencyId);
    const requested = normalizeSchoolEventsHubPin(req.body?.pin);
    if (req.body?.pin != null && req.body?.pin !== '' && !requested) {
      return res.status(400).json({ error: { message: 'PIN must be 4–6 digits' } });
    }
    const pin = requested || generateSixDigitPin();
    const pinHash = KioskModel.hashPin(pin);
    try {
      await pool.execute(
        `UPDATE agencies
         SET school_events_kiosk_pin_hash = ?, school_events_kiosk_pin_code = ?
         WHERE id = ?`,
        [pinHash, pin, agencyId]
      );
    } catch (e) {
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(503).json({
          error: { message: 'Run migration 957 for school events kiosk PIN columns' }
        });
      }
      throw e;
    }
    const [rows] = await pool.execute(
      `SELECT portal_url, slug FROM agencies WHERE id = ? LIMIT 1`,
      [agencyId]
    );
    const slug = String(rows?.[0]?.portal_url || rows?.[0]?.slug || '').trim().toLowerCase();
    const frontendBase = getFrontendBaseUrl();
    res.json({
      ok: true,
      agencyId,
      pinSet: true,
      pinCode: pin,
      kioskPath: slug ? `/${slug}/school-events/kiosk` : null,
      kioskUrl: slug ? `${frontendBase}/${slug}/school-events/kiosk` : null
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
