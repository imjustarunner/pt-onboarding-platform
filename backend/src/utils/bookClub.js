import pool from '../config/database.js';
import User from '../models/User.model.js';
import { canUserManageClub } from './sscClubAccess.js';

export const BOOK_CLUB_ELIGIBLE_ROLES = [
  'admin',
  'assistant_admin',
  'super_admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'supervisor',
  'school_staff',
  'clinical_practice_assistant',
  'intern',
  'facilitator',
  'club_manager'
];

export const BOOK_CLUB_INTEREST_STATUSES = ['interested', 'never'];
export const BOOK_CLUB_RESPONSE_STATUSES = ['enrolled', 'skipped'];
export const BOOK_CLUB_EVENT_AUDIENCE_KEYS = ['current_book_enrolled', 'all_book_club_members'];

export const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export const isBookClubEligibleRole = (role) =>
  BOOK_CLUB_ELIGIBLE_ROLES.includes(String(role || '').trim().toLowerCase());

export const isBookClubEnabled = (agency) =>
  parseFeatureFlags(agency?.feature_flags || agency?.featureFlags).bookClubEnabled === true;

/** Book club affiliation row: reader-facing /{portal}/bookclub is hidden until this is true. */
export const isBookClubPortalPublished = (bookClubRow) => {
  if (!bookClubRow) return false;
  const v = bookClubRow.book_club_portal_published;
  // Column missing (pre-migration) or NULL: behave as published so deploy order does not take the portal down.
  if (v === undefined || v === null) return true;
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true';
};

export async function getAgencySummaryById(agencyId) {
  const id = parsePositiveInt(agencyId);
  if (!id) return null;
  const [rows] = await pool.execute(
    `SELECT id, name, slug, portal_url, organization_type, club_kind, logo_url, color_palette, feature_flags,
            is_active, is_archived, official_name
     FROM agencies
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows?.[0] || null;
}

export async function getAgencySummaryByPortalSlug(portalSlug) {
  const slug = String(portalSlug || '').trim().toLowerCase();
  if (!slug) return null;
  const [rows] = await pool.execute(
    `SELECT id, name, slug, portal_url, organization_type, club_kind, logo_url, color_palette, feature_flags,
            is_active, is_archived, official_name
     FROM agencies
     WHERE LOWER(COALESCE(portal_url, slug)) = ?
        OR LOWER(slug) = ?
     ORDER BY CASE WHEN LOWER(COALESCE(portal_url, '')) = ? THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    [slug, slug, slug]
  );
  return rows?.[0] || null;
}

export async function findBookClubForTenant(tenantAgencyId) {
  const tenantId = parsePositiveInt(tenantAgencyId);
  if (!tenantId) return null;
  const [rows] = await pool.execute(
    `SELECT bc.*,
            oa.agency_id AS tenant_agency_id,
            tenant.name AS tenant_name,
            tenant.slug AS tenant_slug,
            tenant.portal_url AS tenant_portal_url,
            tenant.logo_url AS tenant_logo_url,
            tenant.color_palette AS tenant_color_palette,
            tenant.feature_flags AS tenant_feature_flags
     FROM organization_affiliations oa
     INNER JOIN agencies bc ON bc.id = oa.organization_id
     INNER JOIN agencies tenant ON tenant.id = oa.agency_id
     WHERE oa.agency_id = ?
       AND oa.is_active = TRUE
       AND LOWER(COALESCE(bc.organization_type, '')) = 'affiliation'
       AND LOWER(COALESCE(bc.club_kind, '')) = 'book_club'
       AND (bc.is_archived = FALSE OR bc.is_archived IS NULL)
     ORDER BY bc.id ASC
     LIMIT 1`,
    [tenantId]
  );
  return rows?.[0] || null;
}

export async function getTenantForBookClub(bookClubAgencyId) {
  const bookClubId = parsePositiveInt(bookClubAgencyId);
  if (!bookClubId) return null;
  const [rows] = await pool.execute(
    `SELECT tenant.id, tenant.name, tenant.slug, tenant.portal_url, tenant.logo_url, tenant.color_palette, tenant.feature_flags
     FROM organization_affiliations oa
     INNER JOIN agencies tenant ON tenant.id = oa.agency_id
     INNER JOIN agencies bc ON bc.id = oa.organization_id
     WHERE oa.organization_id = ?
       AND oa.is_active = TRUE
       AND LOWER(COALESCE(bc.club_kind, '')) = 'book_club'
     ORDER BY oa.id ASC
     LIMIT 1`,
    [bookClubId]
  );
  return rows?.[0] || null;
}

export async function userHasTenantAccess(userId, tenantAgencyId) {
  const uid = parsePositiveInt(userId);
  const tenantId = parsePositiveInt(tenantAgencyId);
  if (!uid || !tenantId) return false;
  const agencies = await User.getAgencies(uid);
  return (agencies || []).some((agency) => Number(agency?.id) === tenantId);
}

export async function canUserManageBookClub({ user, tenantAgencyId = null, bookClubAgencyId = null }) {
  const role = String(user?.role || '').trim().toLowerCase();
  if (!user?.id) return false;
  if (role === 'super_admin') return true;

  const tenantId = parsePositiveInt(tenantAgencyId)
    || (bookClubAgencyId ? Number((await getTenantForBookClub(bookClubAgencyId))?.id || 0) : null);
  const bookClubId = parsePositiveInt(bookClubAgencyId)
    || (tenantId ? Number((await findBookClubForTenant(tenantId))?.id || 0) : null);

  if (tenantId && ['admin', 'support'].includes(role) && await userHasTenantAccess(user.id, tenantId)) {
    return true;
  }
  if (bookClubId) {
    return canUserManageClub({ user, clubId: bookClubId });
  }
  return false;
}

export async function listTenantEligibleBookClubUsers(tenantAgencyId) {
  const tenantId = parsePositiveInt(tenantAgencyId);
  if (!tenantId) return [];
  const placeholders = BOOK_CLUB_ELIGIBLE_ROLES.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT DISTINCT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        ua.is_active,
        pref.interest_status,
        pref.updated_at AS preference_updated_at
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id
     LEFT JOIN book_club_user_preferences pref
       ON pref.tenant_agency_id = ua.agency_id
      AND pref.user_id = u.id
     WHERE ua.agency_id = ?
       AND (ua.is_active = 1 OR ua.is_active IS NULL)
       AND (u.is_active = TRUE OR u.is_active IS NULL)
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND LOWER(TRIM(COALESCE(u.role, ''))) IN (${placeholders})
     ORDER BY u.first_name ASC, u.last_name ASC, u.email ASC`,
    [tenantId, ...BOOK_CLUB_ELIGIBLE_ROLES]
  );
  return (rows || []).map((row) => ({
    id: Number(row.id),
    firstName: String(row.first_name || '').trim(),
    lastName: String(row.last_name || '').trim(),
    name: `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim() || String(row.email || '').trim(),
    email: String(row.email || '').trim(),
    role: String(row.role || '').trim().toLowerCase(),
    isActive: row.is_active === undefined || row.is_active === null ? true : Number(row.is_active) === 1,
    interestStatus: String(row.interest_status || '').trim().toLowerCase() || 'interested',
    preferenceUpdatedAt: row.preference_updated_at || null
  }));
}

export async function listBookClubManagers(bookClubAgencyId) {
  const bookClubId = parsePositiveInt(bookClubAgencyId);
  if (!bookClubId) return [];
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, COALESCE(ua.club_role, 'member') AS club_role
     FROM user_agencies ua
     INNER JOIN users u ON u.id = ua.user_id
     WHERE ua.agency_id = ?
       AND COALESCE(ua.club_role, 'member') IN ('manager', 'assistant_manager')
       AND (ua.is_active = 1 OR ua.is_active IS NULL)
     ORDER BY CASE COALESCE(ua.club_role, 'member')
       WHEN 'manager' THEN 0
       WHEN 'assistant_manager' THEN 1
       ELSE 2 END,
       u.first_name ASC, u.last_name ASC`,
    [bookClubId]
  );
  return (rows || []).map((row) => ({
    userId: Number(row.id),
    name: `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim() || String(row.email || '').trim(),
    email: String(row.email || '').trim(),
    clubRole: String(row.club_role || 'member').trim().toLowerCase()
  }));
}

function mapBookRow(row) {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    className: String(row.class_name || '').trim(),
    description: String(row.description || '').trim(),
    bookAuthor: String(row.book_author || '').trim(),
    bookCoverUrl: String(row.book_cover_url || '').trim(),
    bookMonthLabel: String(row.book_month_label || '').trim(),
    programKind: String(row.program_kind || 'season').trim().toLowerCase(),
    status: String(row.status || 'draft').trim().toLowerCase(),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    enrollmentOpensAt: row.enrollment_opens_at || null,
    enrollmentClosesAt: row.enrollment_closes_at || null,
    timezone: row.timezone || 'America/New_York',
    createdAt: row.created_at || null,
    enrollmentCount: Number(row.enrollment_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    totalResponseCount: Number(row.total_response_count || 0)
  };
}

export async function listBookClubBooks(bookClubAgencyId, { includeArchived = true } = {}) {
  const bookClubId = parsePositiveInt(bookClubAgencyId);
  if (!bookClubId) return [];
  const [rows] = await pool.execute(
    `SELECT c.*,
            SUM(CASE WHEN pm.membership_status IN ('active', 'completed') THEN 1 ELSE 0 END) AS enrollment_count,
            SUM(CASE WHEN r.response_status = 'skipped' THEN 1 ELSE 0 END) AS skipped_count,
            COUNT(DISTINCT r.user_id) AS total_response_count
     FROM learning_program_classes c
     LEFT JOIN learning_class_provider_memberships pm ON pm.learning_class_id = c.id
     LEFT JOIN book_club_book_responses r ON r.learning_class_id = c.id
     WHERE c.organization_id = ?
       AND LOWER(COALESCE(c.program_kind, 'season')) = 'monthly_book'
       AND (? = TRUE OR c.status <> 'archived')
     GROUP BY c.id
     ORDER BY COALESCE(c.starts_at, c.created_at) DESC, c.id DESC`,
    [bookClubId, includeArchived ? 1 : 0]
  );
  return (rows || []).map(mapBookRow);
}

export function pickBookClubTimeline(books = []) {
  const now = Date.now();
  const sorted = [...(Array.isArray(books) ? books : [])].sort((a, b) => {
    const aTime = new Date(a?.startsAt || a?.createdAt || 0).getTime() || 0;
    const bTime = new Date(b?.startsAt || b?.createdAt || 0).getTime() || 0;
    return aTime - bTime;
  });
  let currentBook = null;
  let upcomingBook = null;
  let latestPastBook = null;
  for (const book of sorted) {
    const startMs = new Date(book?.startsAt || book?.createdAt || 0).getTime();
    const endMs = book?.endsAt ? new Date(book.endsAt).getTime() : null;
    const isArchived = String(book?.status || '').toLowerCase() === 'archived';
    if (isArchived) {
      latestPastBook = book;
      continue;
    }
    if ((startMs && startMs <= now) && (!endMs || endMs >= now)) {
      currentBook = book;
      continue;
    }
    if (startMs && startMs > now && !upcomingBook) {
      upcomingBook = book;
      continue;
    }
    if (startMs && startMs < now) {
      latestPastBook = book;
    }
  }
  if (!currentBook && !upcomingBook && latestPastBook) currentBook = latestPastBook;
  return { currentBook, upcomingBook };
}

export async function getBookClubCurrentBook(bookClubAgencyId) {
  const books = await listBookClubBooks(bookClubAgencyId, { includeArchived: false });
  return pickBookClubTimeline(books).currentBook || null;
}

export async function listBookClubAudienceUserIds(bookClubAgencyId, audienceKey) {
  const key = String(audienceKey || '').trim().toLowerCase();
  const bookClubId = parsePositiveInt(bookClubAgencyId);
  if (!bookClubId || !BOOK_CLUB_EVENT_AUDIENCE_KEYS.includes(key)) return [];
  if (key === 'all_book_club_members') {
    const [rows] = await pool.execute(
      `SELECT DISTINCT pref.user_id
       FROM organization_affiliations oa
       INNER JOIN book_club_user_preferences pref ON pref.tenant_agency_id = oa.agency_id
       WHERE oa.organization_id = ?
         AND oa.is_active = TRUE
         AND pref.interest_status = 'interested'`,
      [bookClubId]
    );
    return (rows || []).map((row) => Number(row.user_id)).filter((id) => id > 0);
  }
  const currentBook = await getBookClubCurrentBook(bookClubId);
  if (!currentBook?.id) return [];
  const [rows] = await pool.execute(
    `SELECT DISTINCT provider_user_id AS user_id
     FROM learning_class_provider_memberships
     WHERE learning_class_id = ?
       AND membership_status IN ('active', 'completed')`,
    [currentBook.id]
  );
  return (rows || []).map((row) => Number(row.user_id)).filter((id) => id > 0);
}

export async function getNextBookClubEvent(bookClubAgencyId) {
  const bookClubId = parsePositiveInt(bookClubAgencyId);
  if (!bookClubId) return null;
  const [rows] = await pool.execute(
    `SELECT id, title, description, splash_content, event_type, starts_at, ends_at, timezone,
            event_location_name, event_location_address, voting_config_json
     FROM company_events
     WHERE agency_id = ?
       AND is_active = 1
       AND starts_at >= DATE_SUB(NOW(), INTERVAL 45 DAY)
     ORDER BY
       CASE WHEN starts_at >= NOW() THEN 0 ELSE 1 END,
       starts_at ASC,
       id ASC
     LIMIT 1`,
    [bookClubId]
  );
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    title: String(row.title || '').trim(),
    description: String(row.description || '').trim(),
    splashContent: String(row.splash_content || '').trim(),
    eventType: String(row.event_type || '').trim().toLowerCase() || 'company_event',
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    timezone: row.timezone || 'America/New_York',
    eventLocationName: String(row.event_location_name || '').trim(),
    eventLocationAddress: String(row.event_location_address || '').trim()
  };
}
