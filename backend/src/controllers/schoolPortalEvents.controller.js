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
  createPostToken,
  createSchoolPortalEvent,
  currentCalendarYear,
  getMissingCategoriesForOrg,
  getSchoolEventOverviewForAgency,
  listSchoolEventsForOrg,
  markPostTokenUsed,
  resolveAgencyIdForSchoolOrg,
  updateSchoolPortalEvent,
  validatePostToken
} from '../services/schoolPortalEvents.service.js';

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
  if (roleNorm === 'provider') {
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

/** Roles that may create/update school portal events (school staff + agency managers with portal access). */
const SCHOOL_EVENT_MANAGE_ROLES = new Set([
  'school_staff',
  'super_admin',
  'admin',
  'support',
  'staff',
  'clinical_practice_assistant',
  'provider_plus'
]);

async function assertSchoolStaffPortalAccess(req, organizationId) {
  const { orgId, userId, role } = await assertSchoolPortalReadAccess(req, organizationId);
  if (!SCHOOL_EVENT_MANAGE_ROLES.has(role)) {
    const err = new Error('Not authorized to manage school events');
    err.status = 403;
    throw err;
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
  if (category === 'back_to_school') return 'Back to School';
  if (category === 'spring') return 'Spring Event';
  if (category === 'open_house') return 'Open House';
  if (category === 'resource_fair') return 'Resource Fair';
  if (category === 'family_night') return 'Family Night';
  if (category === 'orientation') return 'Orientation';
  if (category === 'other') return 'School Event';
  return 'School Event';
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
  return {
    category,
    title,
    description,
    startsAt: startsAtRaw ? new Date(startsAtRaw) : null,
    endsAt: endsAtRaw ? new Date(endsAtRaw) : null,
    outreachTableInvited,
    eventImageUrl: eventImageUrl !== undefined ? String(eventImageUrl || '').trim() || null : undefined,
    flierFileUrl: flierFileUrl !== undefined ? String(flierFileUrl || '').trim() || null : undefined,
    timezone,
    schoolEventStatus: statusRaw !== undefined && statusRaw !== null && statusRaw !== ''
      ? String(statusRaw).trim().toLowerCase()
      : undefined
  };
}

export const listSchoolPortalEvents = async (req, res, next) => {
  try {
    const { orgId } = await assertSchoolPortalReadAccess(req, req.params.organizationId);
    const events = await listSchoolEventsForOrg(orgId);
    const year = currentCalendarYear();
    const missingCategories = await getMissingCategoriesForOrg(orgId, year);
    res.json({ events, missingCategories, year });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getSchoolPortalEventsMissing = async (req, res, next) => {
  try {
    const { orgId } = await assertSchoolStaffPortalAccess(req, req.params.organizationId);
    const year = parseInt(String(req.query?.year || currentCalendarYear()), 10) || currentCalendarYear();
    const missingCategories = await getMissingCategoriesForOrg(orgId, year);
    res.json({ missingCategories, year });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const createSchoolPortalEventHandler = async (req, res, next) => {
  try {
    const { orgId, userId } = await assertSchoolStaffPortalAccess(req, req.params.organizationId);
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
      schoolEventStatus: parsed.schoolEventStatus || 'scheduled'
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
    const { orgId, userId } = await assertSchoolStaffPortalAccess(req, req.params.organizationId);
    const eventId = parseInt(String(req.params.eventId || ''), 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid eventId' } });
    const agencyId = await resolveAgencyIdForSchoolOrg(orgId);
    if (!agencyId) return res.status(400).json({ error: { message: 'School is not linked to an agency' } });

    const parsed = parseSchoolEventBody(req.body || {});
    if (parsed.category && !SCHOOL_EVENT_CATEGORIES.includes(parsed.category)) {
      return res.status(400).json({ error: { message: 'Invalid category' } });
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
      schoolEventStatus: parsed.schoolEventStatus
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
    const year = parseInt(String(req.query?.year || currentCalendarYear()), 10) || currentCalendarYear();
    const overview = await getSchoolEventOverviewForAgency(agencyId, year);
    res.json(overview);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
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
    const year = parseInt(String(req.body?.year || currentCalendarYear()), 10) || currentCalendarYear();
    const customMessage = String(req.body?.message || '').trim();
    const eventType = categoryToEventType(category);
    const overview = await getSchoolEventOverviewForAgency(agencyId, year);
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
