import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import {
  BOOK_CLUB_EVENT_AUDIENCE_KEYS,
  BOOK_CLUB_INTEREST_STATUSES,
  BOOK_CLUB_RESPONSE_STATUSES,
  canUserManageBookClub,
  findBookClubForTenant,
  getAgencySummaryById,
  getAgencySummaryByPortalSlug,
  getNextBookClubEvent,
  getTenantForBookClub,
  isBookClubEligibleRole,
  isBookClubEnabled,
  isBookClubPortalPublished,
  listBookClubBooks,
  listBookClubManagers,
  listTenantEligibleBookClubUsers,
  parsePositiveInt,
  pickBookClubTimeline
} from '../utils/bookClub.js';

const BOOK_CLUB_DEFAULT_NAME_SUFFIX = 'Book Club';

function toIsoLike(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function toSlugPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function ensureTenant(tenantAgencyId) {
  const tenant = await getAgencySummaryById(tenantAgencyId);
  if (!tenant) return { error: 'Tenant not found', status: 404 };
  if (String(tenant.organization_type || '').toLowerCase() === 'affiliation') {
    return { error: 'Book Club must be configured on a tenant, not an affiliation club', status: 400 };
  }
  if (isBookClubEnabled(tenant) !== true) {
    return { error: 'Book Club is not enabled for this tenant', status: 400 };
  }
  return { tenant };
}

async function assertManageAccess(req, tenantAgencyId, bookClubAgencyId = null) {
  const ok = await canUserManageBookClub({
    user: req.user,
    tenantAgencyId,
    bookClubAgencyId
  });
  if (!ok) return { error: 'Book club manager access required', status: 403 };
  return { ok: true };
}

async function resolveBookClubSnapshot(tenantAgencyId) {
  const tenant = await getAgencySummaryById(tenantAgencyId);
  const bookClub = await findBookClubForTenant(tenantAgencyId);
  const managers = bookClub?.id ? await listBookClubManagers(bookClub.id) : [];
  const books = bookClub?.id ? await listBookClubBooks(bookClub.id) : [];
  const { currentBook, upcomingBook } = pickBookClubTimeline(books);
  const nextEvent = bookClub?.id ? await getNextBookClubEvent(bookClub.id) : null;
  return {
    tenant,
    bookClub,
    managers,
    books,
    currentBook,
    upcomingBook,
    nextEvent
  };
}

async function ensureUserIsEligibleForTenant(userId, tenantAgencyId) {
  const eligibleUsers = await listTenantEligibleBookClubUsers(tenantAgencyId);
  return eligibleUsers.find((entry) => Number(entry.id) === Number(userId)) || null;
}

async function upsertUserPreference({ tenantAgencyId, userId, interestStatus, actorUserId }) {
  await pool.execute(
    `INSERT INTO book_club_user_preferences
     (tenant_agency_id, user_id, interest_status, updated_by_user_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       interest_status = VALUES(interest_status),
       updated_by_user_id = VALUES(updated_by_user_id),
       updated_at = CURRENT_TIMESTAMP`,
    [tenantAgencyId, userId, interestStatus, actorUserId || null]
  );
}

async function upsertBookResponse({ learningClassId, userId, responseStatus, actorUserId }) {
  await pool.execute(
    `INSERT INTO book_club_book_responses
     (learning_class_id, user_id, response_status, responded_by_user_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       response_status = VALUES(response_status),
       responded_by_user_id = VALUES(responded_by_user_id),
       responded_at = CURRENT_TIMESTAMP`,
    [learningClassId, userId, responseStatus, actorUserId || null]
  );
}

async function setCurrentBookEnrollment({ learningClassId, userId, enrolled, actorUserId }) {
  await LearningProgramClass.addProviderMember({
    classId: learningClassId,
    providerUserId: userId,
    membershipStatus: enrolled ? 'active' : 'removed',
    actorUserId
  });
}

async function syncManagerAssignments(bookClubAgencyId, managerUserId, assistantManagerUserIds = []) {
  const bookClubId = parsePositiveInt(bookClubAgencyId);
  if (!bookClubId) return;
  const managerId = parsePositiveInt(managerUserId);
  const assistantIds = [...new Set((Array.isArray(assistantManagerUserIds) ? assistantManagerUserIds : [])
    .map((value) => parsePositiveInt(value))
    .filter((value) => value && value !== managerId))];

  const [existingRows] = await pool.execute(
    `SELECT user_id, COALESCE(club_role, 'member') AS club_role
     FROM user_agencies
     WHERE agency_id = ?
       AND COALESCE(club_role, 'member') IN ('manager', 'assistant_manager')`,
    [bookClubId]
  );
  const currentManagerIds = new Set((existingRows || []).map((row) => Number(row.user_id)).filter((id) => id > 0));
  const desiredIds = new Set([managerId, ...assistantIds].filter((id) => id > 0));

  for (const userId of currentManagerIds) {
    if (desiredIds.has(userId)) continue;
    await User.assignToAgency(userId, bookClubId, { clubRole: 'member', isActive: true });
  }

  if (managerId) {
    await User.assignToAgency(managerId, bookClubId, { clubRole: 'manager', isActive: true });
  }
  for (const assistantId of assistantIds) {
    await User.assignToAgency(assistantId, bookClubId, { clubRole: 'assistant_manager', isActive: true });
  }
}

async function serializeInterestRows(tenantAgencyId, bookClubAgencyId) {
  const users = await listTenantEligibleBookClubUsers(tenantAgencyId);
  const books = await listBookClubBooks(bookClubAgencyId, { includeArchived: true });
  const { currentBook } = pickBookClubTimeline(books);
  const managerMap = new Map((await listBookClubManagers(bookClubAgencyId)).map((entry) => [Number(entry.userId), entry.clubRole]));

  let responseRows = [];
  if (currentBook?.id) {
    const [rows] = await pool.execute(
      `SELECT user_id, response_status, responded_at
       FROM book_club_book_responses
       WHERE learning_class_id = ?`,
      [currentBook.id]
    );
    responseRows = rows || [];
  }
  const responseMap = new Map(responseRows.map((row) => [Number(row.user_id), row]));

  return users.map((user) => {
    const response = responseMap.get(Number(user.id)) || null;
    return {
      userId: Number(user.id),
      name: user.name,
      email: user.email,
      role: user.role,
      clubRole: managerMap.get(Number(user.id)) || 'member',
      interestStatus: user.interestStatus || 'interested',
      currentBookResponseStatus: response ? String(response.response_status || '').trim().toLowerCase() : null,
      currentBookRespondedAt: response?.responded_at || null,
      currentBookId: currentBook?.id || null,
      currentBookTitle: currentBook?.className || null
    };
  });
}

async function createBookClubAffiliation({ tenant, managerUserId, assistantManagerUserIds = [] }) {
  const baseSlug = `${toSlugPart(tenant.portal_url || tenant.slug || tenant.name)}-book-club` || `agency-${tenant.id}-book-club`;
  const [slugRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM agencies WHERE slug = ?`,
    [baseSlug]
  );
  const count = Number(slugRows?.[0]?.total || 0);
  const slug = count > 0 ? `${baseSlug}-${tenant.id}` : baseSlug;
  const created = await Agency.create({
    name: `${tenant.name} ${BOOK_CLUB_DEFAULT_NAME_SUFFIX}`.trim(),
    slug,
    logoUrl: tenant.logo_url || null,
    colorPalette: tenant.color_palette || null,
    organizationType: 'affiliation',
    clubKind: 'book_club',
    isActive: true
  });
  await OrganizationAffiliation.upsert({
    agencyId: tenant.id,
    organizationId: created.id,
    isActive: true
  });
  await syncManagerAssignments(created.id, managerUserId, assistantManagerUserIds);
  return created;
}

function normalizeBooksPayload(body = {}) {
  return {
    className: String(body.className || body.title || '').trim(),
    description: String(body.description || '').trim() || null,
    bookAuthor: String(body.bookAuthor || body.author || '').trim() || null,
    bookCoverUrl: String(body.bookCoverUrl || body.coverUrl || '').trim() || null,
    bookMonthLabel: String(body.bookMonthLabel || body.monthLabel || '').trim() || null,
    timezone: String(body.timezone || 'America/Denver').trim() || 'America/Denver',
    startsAt: body.startsAt || null,
    endsAt: body.endsAt || null,
    enrollmentOpensAt: body.enrollmentOpensAt || null,
    enrollmentClosesAt: body.enrollmentClosesAt || null,
    status: String(body.status || 'draft').trim().toLowerCase() || 'draft',
    isActive: body.isActive !== false
  };
}

export const getBookClub = async (req, res, next) => {
  try {
    const tenantAgencyId = parsePositiveInt(req.params?.agencyId || req.params?.id);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'Invalid tenant agency id' } });
    const checked = await ensureTenant(tenantAgencyId);
    if (checked.error) return res.status(checked.status).json({ error: { message: checked.error } });
    const access = await assertManageAccess(req, tenantAgencyId);
    if (access.error) return res.status(access.status).json({ error: { message: access.error } });
    const snapshot = await resolveBookClubSnapshot(tenantAgencyId);
    const eligibleUsers = await listTenantEligibleBookClubUsers(tenantAgencyId);
    res.json({
      tenant: snapshot.tenant,
      bookClub: snapshot.bookClub,
      managers: snapshot.managers,
      currentBook: snapshot.currentBook,
      upcomingBook: snapshot.upcomingBook,
      nextEvent: snapshot.nextEvent,
      books: snapshot.books,
      eligibleUsers
    });
  } catch (error) {
    next(error);
  }
};

export const setupBookClub = async (req, res, next) => {
  try {
    const tenantAgencyId = parsePositiveInt(req.params?.agencyId || req.params?.id);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'Invalid tenant agency id' } });
    const checked = await ensureTenant(tenantAgencyId);
    if (checked.error) return res.status(checked.status).json({ error: { message: checked.error } });
    const access = await assertManageAccess(req, tenantAgencyId);
    if (access.error) return res.status(access.status).json({ error: { message: access.error } });

    const managerUserId = parsePositiveInt(req.body?.managerUserId);
    if (!managerUserId) return res.status(400).json({ error: { message: 'managerUserId is required' } });
    const manager = await ensureUserIsEligibleForTenant(managerUserId, tenantAgencyId);
    if (!manager) return res.status(400).json({ error: { message: 'Selected manager is not an eligible tenant user' } });
    const assistantManagerUserIds = [...new Set((Array.isArray(req.body?.assistantManagerUserIds) ? req.body.assistantManagerUserIds : [])
      .map((value) => parsePositiveInt(value))
      .filter((value) => value && value !== managerUserId))];

    let bookClub = await findBookClubForTenant(tenantAgencyId);
    if (!bookClub) {
      bookClub = await createBookClubAffiliation({
        tenant: checked.tenant,
        managerUserId,
        assistantManagerUserIds
      });
    } else {
      await syncManagerAssignments(bookClub.id, managerUserId, assistantManagerUserIds);
    }

    const publish =
      req.body?.portalPublished === true ||
      req.body?.portalPublished === 1 ||
      String(req.body?.portalPublished || '').trim().toLowerCase() === 'true';
    if (publish) {
      await Agency.update(bookClub.id, { bookClubPortalPublished: true });
    }

    const snapshot = await resolveBookClubSnapshot(tenantAgencyId);
    res.status(201).json({
      ok: true,
      bookClub: snapshot.bookClub,
      managers: snapshot.managers,
      books: snapshot.books,
      currentBook: snapshot.currentBook,
      upcomingBook: snapshot.upcomingBook,
      nextEvent: snapshot.nextEvent
    });
  } catch (error) {
    next(error);
  }
};

export const updateBookClub = async (req, res, next) => {
  try {
    const tenantAgencyId = parsePositiveInt(req.params?.agencyId || req.params?.id);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'Invalid tenant agency id' } });
    const checked = await ensureTenant(tenantAgencyId);
    if (checked.error) return res.status(checked.status).json({ error: { message: checked.error } });
    const bookClub = await findBookClubForTenant(tenantAgencyId);
    if (!bookClub) return res.status(404).json({ error: { message: 'Book Club has not been set up yet' } });
    const access = await assertManageAccess(req, tenantAgencyId, bookClub.id);
    if (access.error) return res.status(access.status).json({ error: { message: access.error } });

    const patch = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name || '').trim() || `${checked.tenant.name} ${BOOK_CLUB_DEFAULT_NAME_SUFFIX}`;
    if (req.body?.logoUrl !== undefined) patch.logoUrl = String(req.body.logoUrl || '').trim() || null;
    if (req.body?.colorPalette !== undefined) patch.colorPalette = req.body.colorPalette || null;
    if (Object.keys(patch).length) {
      await Agency.update(bookClub.id, patch);
    }

    if (req.body?.managerUserId || Array.isArray(req.body?.assistantManagerUserIds)) {
      await syncManagerAssignments(bookClub.id, req.body.managerUserId, req.body.assistantManagerUserIds || []);
    }

    if (req.body?.portalPublished !== undefined) {
      const on =
        req.body.portalPublished === true ||
        req.body.portalPublished === 1 ||
        String(req.body.portalPublished || '').trim().toLowerCase() === 'true';
      await Agency.update(bookClub.id, { bookClubPortalPublished: on });
    }

    const snapshot = await resolveBookClubSnapshot(tenantAgencyId);
    res.json({
      ok: true,
      bookClub: snapshot.bookClub,
      managers: snapshot.managers,
      currentBook: snapshot.currentBook,
      upcomingBook: snapshot.upcomingBook,
      nextEvent: snapshot.nextEvent,
      books: snapshot.books
    });
  } catch (error) {
    next(error);
  }
};

export const listBookClubBooksForTenant = async (req, res, next) => {
  try {
    const tenantAgencyId = parsePositiveInt(req.params?.agencyId || req.params?.id);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'Invalid tenant agency id' } });
    const checked = await ensureTenant(tenantAgencyId);
    if (checked.error) return res.status(checked.status).json({ error: { message: checked.error } });
    const bookClub = await findBookClubForTenant(tenantAgencyId);
    if (!bookClub) return res.json([]);
    const access = await assertManageAccess(req, tenantAgencyId, bookClub.id);
    if (access.error) return res.status(access.status).json({ error: { message: access.error } });
    const books = await listBookClubBooks(bookClub.id);
    res.json(books);
  } catch (error) {
    next(error);
  }
};

export const createBookClubBook = async (req, res, next) => {
  try {
    const tenantAgencyId = parsePositiveInt(req.params?.agencyId || req.params?.id);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'Invalid tenant agency id' } });
    const checked = await ensureTenant(tenantAgencyId);
    if (checked.error) return res.status(checked.status).json({ error: { message: checked.error } });
    const bookClub = await findBookClubForTenant(tenantAgencyId);
    if (!bookClub) return res.status(404).json({ error: { message: 'Book Club has not been set up yet' } });
    const access = await assertManageAccess(req, tenantAgencyId, bookClub.id);
    if (access.error) return res.status(access.status).json({ error: { message: access.error } });
    const payload = normalizeBooksPayload(req.body || {});
    if (!payload.className) return res.status(400).json({ error: { message: 'className is required' } });
    const created = await LearningProgramClass.create({
      organizationId: bookClub.id,
      className: payload.className,
      programKind: 'monthly_book',
      description: payload.description,
      bookAuthor: payload.bookAuthor,
      bookCoverUrl: payload.bookCoverUrl,
      bookMonthLabel: payload.bookMonthLabel,
      timezone: payload.timezone,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      enrollmentOpensAt: payload.enrollmentOpensAt,
      enrollmentClosesAt: payload.enrollmentClosesAt,
      status: payload.status,
      isActive: payload.isActive,
      createdByUserId: req.user?.id || null
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
};

export const updateBookClubBook = async (req, res, next) => {
  try {
    const tenantAgencyId = parsePositiveInt(req.params?.agencyId || req.params?.id);
    const bookId = parsePositiveInt(req.params?.bookId);
    if (!tenantAgencyId || !bookId) return res.status(400).json({ error: { message: 'Invalid book club request' } });
    const checked = await ensureTenant(tenantAgencyId);
    if (checked.error) return res.status(checked.status).json({ error: { message: checked.error } });
    const bookClub = await findBookClubForTenant(tenantAgencyId);
    if (!bookClub) return res.status(404).json({ error: { message: 'Book Club has not been set up yet' } });
    const access = await assertManageAccess(req, tenantAgencyId, bookClub.id);
    if (access.error) return res.status(access.status).json({ error: { message: access.error } });

    const existing = await LearningProgramClass.findById(bookId);
    if (!existing || Number(existing.organization_id) !== Number(bookClub.id)) {
      return res.status(404).json({ error: { message: 'Book not found' } });
    }

    const payload = normalizeBooksPayload(req.body || {});
    const updated = await LearningProgramClass.update(bookId, {
      className: payload.className || existing.class_name,
      programKind: 'monthly_book',
      description: payload.description,
      bookAuthor: payload.bookAuthor,
      bookCoverUrl: payload.bookCoverUrl,
      bookMonthLabel: payload.bookMonthLabel,
      timezone: payload.timezone,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      enrollmentOpensAt: payload.enrollmentOpensAt,
      enrollmentClosesAt: payload.enrollmentClosesAt,
      status: payload.status,
      isActive: payload.isActive
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const listBookClubInterests = async (req, res, next) => {
  try {
    const tenantAgencyId = parsePositiveInt(req.params?.agencyId || req.params?.id);
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'Invalid tenant agency id' } });
    const checked = await ensureTenant(tenantAgencyId);
    if (checked.error) return res.status(checked.status).json({ error: { message: checked.error } });
    const bookClub = await findBookClubForTenant(tenantAgencyId);
    if (!bookClub) return res.json({ rows: [], currentBook: null });
    const access = await assertManageAccess(req, tenantAgencyId, bookClub.id);
    if (access.error) return res.status(access.status).json({ error: { message: access.error } });
    const books = await listBookClubBooks(bookClub.id);
    const { currentBook } = pickBookClubTimeline(books);
    const rows = await serializeInterestRows(tenantAgencyId, bookClub.id);
    res.json({ rows, currentBook });
  } catch (error) {
    next(error);
  }
};

export const getMyBookClubStatus = async (req, res, next) => {
  try {
    const tenantAgencyId = parsePositiveInt(req.query?.agencyId || req.user?.agencyId);
    if (!tenantAgencyId) return res.json({ enabled: false, reason: 'tenant_required' });
    const tenant = await getAgencySummaryById(tenantAgencyId);
    if (!tenant || isBookClubEnabled(tenant) !== true) return res.json({ enabled: false, reason: 'disabled' });
    if (!isBookClubEligibleRole(req.user?.role)) return res.json({ enabled: true, eligible: false, reason: 'ineligible_role' });

    const hasTenantAccess = await ensureUserIsEligibleForTenant(req.user?.id, tenantAgencyId);
    if (!hasTenantAccess) return res.json({ enabled: true, eligible: false, reason: 'not_in_tenant' });

    const bookClub = await findBookClubForTenant(tenantAgencyId);
    if (!bookClub) {
      return res.json({
        enabled: true,
        eligible: true,
        configured: false,
        portalPublished: false,
        tenant
      });
    }

    const portalPublished = isBookClubPortalPublished(bookClub);
    const books = await listBookClubBooks(bookClub.id);
    const { currentBook, upcomingBook } = pickBookClubTimeline(books);
    const nextEvent = await getNextBookClubEvent(bookClub.id);
    const [prefRows] = await pool.execute(
      `SELECT interest_status, updated_at
       FROM book_club_user_preferences
       WHERE tenant_agency_id = ? AND user_id = ?
       LIMIT 1`,
      [tenantAgencyId, req.user.id]
    );
    const preference = prefRows?.[0] || null;
    let currentResponse = null;
    if (currentBook?.id) {
      const [responseRows] = await pool.execute(
        `SELECT response_status, responded_at
         FROM book_club_book_responses
         WHERE learning_class_id = ? AND user_id = ?
         LIMIT 1`,
        [currentBook.id, req.user.id]
      );
      currentResponse = responseRows?.[0] || null;
    }

    res.json({
      enabled: true,
      eligible: true,
      configured: true,
      portalPublished,
      tenant,
      bookClub,
      currentBook,
      upcomingBook,
      nextEvent,
      interestStatus: String(preference?.interest_status || '').trim().toLowerCase() || 'interested',
      interestUpdatedAt: preference?.updated_at || null,
      currentResponseStatus: String(currentResponse?.response_status || '').trim().toLowerCase() || null,
      currentResponseAt: currentResponse?.responded_at || null,
      hasPendingPrompt:
        portalPublished &&
        Boolean(currentBook?.id) &&
        !currentResponse &&
        String(preference?.interest_status || 'interested').toLowerCase() !== 'never',
      archive: books.filter((book) => Number(book.id) !== Number(currentBook?.id) && Number(book.id) !== Number(upcomingBook?.id)).slice(0, 12)
    });
  } catch (error) {
    next(error);
  }
};

export const respondToMyBookClubPrompt = async (req, res, next) => {
  try {
    const tenantAgencyId = parsePositiveInt(req.body?.agencyId || req.query?.agencyId || req.user?.agencyId);
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!tenantAgencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!['enroll', 'skip', 'never', 'reenable'].includes(action)) {
      return res.status(400).json({ error: { message: 'action must be enroll, skip, never, or reenable' } });
    }
    const tenant = await getAgencySummaryById(tenantAgencyId);
    if (!tenant || isBookClubEnabled(tenant) !== true) return res.status(400).json({ error: { message: 'Book Club is not enabled for this tenant' } });
    const eligibleUser = await ensureUserIsEligibleForTenant(req.user?.id, tenantAgencyId);
    if (!eligibleUser) return res.status(403).json({ error: { message: 'You are not eligible for this tenant book club' } });
    const bookClub = await findBookClubForTenant(tenantAgencyId);
    if (!bookClub) return res.status(404).json({ error: { message: 'Book Club has not been set up yet' } });
    if (!isBookClubPortalPublished(bookClub)) {
      return res.status(400).json({
        error: { message: 'The book club reader portal is not published yet. Ask an admin to publish it in Book Club management.' }
      });
    }
    const books = await listBookClubBooks(bookClub.id);
    const { currentBook } = pickBookClubTimeline(books);

    if (action === 'reenable') {
      await upsertUserPreference({
        tenantAgencyId,
        userId: req.user.id,
        interestStatus: 'interested',
        actorUserId: req.user.id
      });
      return res.json({ ok: true });
    }

    if (action === 'never') {
      await upsertUserPreference({
        tenantAgencyId,
        userId: req.user.id,
        interestStatus: 'never',
        actorUserId: req.user.id
      });
      if (currentBook?.id) {
        await upsertBookResponse({
          learningClassId: currentBook.id,
          userId: req.user.id,
          responseStatus: 'skipped',
          actorUserId: req.user.id
        });
        await setCurrentBookEnrollment({
          learningClassId: currentBook.id,
          userId: req.user.id,
          enrolled: false,
          actorUserId: req.user.id
        });
      }
      return res.json({ ok: true });
    }

    await upsertUserPreference({
      tenantAgencyId,
      userId: req.user.id,
      interestStatus: 'interested',
      actorUserId: req.user.id
    });
    await User.assignToAgency(req.user.id, bookClub.id, { clubRole: 'member', isActive: true });

    if (currentBook?.id) {
      await upsertBookResponse({
        learningClassId: currentBook.id,
        userId: req.user.id,
        responseStatus: action === 'enroll' ? 'enrolled' : 'skipped',
        actorUserId: req.user.id
      });
      await setCurrentBookEnrollment({
        learningClassId: currentBook.id,
        userId: req.user.id,
        enrolled: action === 'enroll',
        actorUserId: req.user.id
      });
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const getPublicBookClubByPortal = async (req, res, next) => {
  try {
    const portalSlug = String(req.params?.portalSlug || req.params?.portalUrl || '').trim();
    if (!portalSlug) return res.status(400).json({ error: { message: 'portalSlug is required' } });
    const tenant = await getAgencySummaryByPortalSlug(portalSlug);
    if (!tenant || isBookClubEnabled(tenant) !== true) return res.status(404).json({ error: { message: 'Book Club not found' } });
    const bookClub = await findBookClubForTenant(tenant.id);
    if (!bookClub) return res.status(404).json({ error: { message: 'Book Club not found' } });
    if (!isBookClubPortalPublished(bookClub)) {
      return res.status(404).json({ error: { message: 'Book Club not found' } });
    }
    const books = await listBookClubBooks(bookClub.id, { includeArchived: true });
    const { currentBook, upcomingBook } = pickBookClubTimeline(books);
    const nextEvent = await getNextBookClubEvent(bookClub.id);
    const managers = await listBookClubManagers(bookClub.id);
    res.json({
      tenant,
      bookClub,
      currentBook,
      upcomingBook,
      nextEvent,
      managers,
      archive: books.filter((book) => Number(book.id) !== Number(currentBook?.id) && Number(book.id) !== Number(upcomingBook?.id)).slice(0, 24),
      joinActions: {
        requiresAuth: true,
        preferredAudienceKeys: BOOK_CLUB_EVENT_AUDIENCE_KEYS
      }
    });
  } catch (error) {
    next(error);
  }
};
