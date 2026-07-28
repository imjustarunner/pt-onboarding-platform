import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import * as Onboarding from './schoolOnboarding.service.js';
import {
  listSchoolEventsForOrg,
  getMissingCategoriesForOrg
} from './schoolPortalEvents.service.js';

export const PUBLIC_STANDALONE_DEMO_TOKEN = 'public';
/** Demo "logged-in" school admin identity (Minerva McGonagall). */
export const DEMO_SCHOOL_ADMIN_USER_ID = 1015;

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const REMOVED_DEMO_PROVIDER_IDS = new Set([595, 596, 601]);
const REMOVED_DEMO_STAFF_EMAILS = new Set(['skyler@d11.org', 'filius.flitwick@hogwarts.edu']);

export async function resolveHogwartsCore() {
  const [rows] = await pool.execute(
    `SELECT id, name, slug, portal_url, organization_type
     FROM agencies
     WHERE slug = 'hogwarts' AND organization_type = 'school'
     LIMIT 1`
  );
  const hogwarts = rows?.[0];
  if (!hogwarts) {
    throw Object.assign(new Error('Demo school (Hogwarts) is not available in this environment'), { status: 404 });
  }
  const agency = await Agency.findById(hogwarts.id);
  if (!agency) {
    throw Object.assign(new Error('Demo school not found'), { status: 404 });
  }
  const demo = {
    id: hogwarts.id,
    name: hogwarts.name || 'Hogwarts',
    slug: hogwarts.portal_url || hogwarts.slug || 'hogwarts',
    viewOnly: true,
    publicShell: true
  };
  return { demo, agency, schoolId: Number(hogwarts.id) };
}

async function resolveHogwartsForInvite(token) {
  const normalized = String(token || '').trim();
  if (normalized && normalized !== PUBLIC_STANDALONE_DEMO_TOKEN) {
    await Onboarding.resolveDemoSchool(normalized);
  }
  return resolveHogwartsCore();
}

function scrubEmail() {
  return null;
}

function parseFlags(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function resolveDemoBrandingAgency(agency) {
  if (!agency?.id) return agency;
  const orgType = String(agency.organization_type || 'agency').toLowerCase();
  if (!['school', 'program', 'learning'].includes(orgType)) return agency;
  const linkedAgencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(agency.id).catch(() => null);
  if (!linkedAgencyId) return agency;
  const linked = await Agency.findById(linkedAgencyId);
  return linked || agency;
}

export async function getDemoPortalTheme(token) {
  const { agency, schoolId } = await resolveHogwartsForInvite(token);
  const brandingOrg = await resolveDemoBrandingAgency(agency);
  const colorPalette = parseFlags(brandingOrg.color_palette) || {};
  const themeSettings = parseFlags(brandingOrg.theme_settings) || {};
  const terminologySettings = parseFlags(brandingOrg.terminology_settings) || {};
  return {
    brandingAgencyId: brandingOrg.id,
    portalOrganizationId: schoolId,
    agencyName: brandingOrg.name || agency.name || 'Hogwarts',
    colorPalette,
    themeSettings,
    terminologySettings,
    logoUrl: brandingOrg.logo_url || brandingOrg.logo_path || agency.logo_url || agency.logo_path || null,
    iconUrl: brandingOrg.icon_file_path || brandingOrg.icon_path || null
  };
}

export async function getDemoSchoolMeta(token) {
  const { demo, agency, schoolId } = await resolveHogwartsForInvite(token);
  const portalTheme = await getDemoPortalTheme(token);
  // Prefer affiliated tenant branding (ITSCO) so standalone demo matches onboarding.
  return {
    id: schoolId,
    name: agency.name || demo.name || 'Hogwarts',
    official_name: agency.official_name || agency.name || 'Hogwarts School of Witchcraft and Wizardry',
    slug: agency.portal_url || agency.slug || 'hogwarts',
    portal_url: agency.portal_url || agency.slug || 'hogwarts',
    organization_type: 'school',
    is_active: true,
    logo_url: portalTheme.logoUrl || agency.logo_url || null,
    logo_path: agency.logo_path || null,
    color_palette: portalTheme.colorPalette || parseFlags(agency.color_palette),
    theme_settings: portalTheme.themeSettings || parseFlags(agency.theme_settings),
    terminology_settings: portalTheme.terminologySettings || parseFlags(agency.terminology_settings),
    portal_theme: portalTheme,
    demo_user: {
      id: DEMO_SCHOOL_ADMIN_USER_ID,
      firstName: 'Minerva',
      lastName: 'McGonagall',
      email: 'minerva.mcgonagall@hogwarts.edu',
      role: 'school_staff',
      isSchoolAdmin: true
    }
  };
}

export async function getDemoStats(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  let assigned_weekdays_count = 0;
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(DISTINCT a.weekday) AS cnt
       FROM school_day_provider_assignments a
       JOIN user_agencies ua ON ua.user_id = a.provider_user_id AND ua.agency_id = a.school_organization_id
       WHERE a.school_organization_id = ? AND a.is_active = TRUE`,
      [schoolId]
    );
    assigned_weekdays_count = Number(rows?.[0]?.cnt || 0);
  } catch {
    assigned_weekdays_count = 0;
  }

  let slots_total = 0;
  try {
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(COALESCE(psa.slots_total, 0)), 0) AS slots_total
       FROM provider_school_assignments psa
       WHERE psa.school_organization_id = ? AND psa.is_active = TRUE
         AND psa.day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday')`,
      [schoolId]
    );
    slots_total = Number(rows?.[0]?.slots_total || 0);
  } catch {
    slots_total = 0;
  }

  let slots_used = 0;
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM client_provider_assignments cpa
       JOIN clients c ON c.id = cpa.client_id
       WHERE cpa.organization_id = ? AND cpa.is_active = TRUE
         AND UPPER(c.status) <> 'ARCHIVED'
         AND cpa.service_day IN ('Monday','Tuesday','Wednesday','Thursday','Friday')`,
      [schoolId]
    );
    slots_used = Number(rows?.[0]?.cnt || 0);
  } catch {
    slots_used = 0;
  }

  let clients_total = 0;
  let clients_assigned = 0;
  let clients_pending = 0;
  let clients_waitlist = 0;
  try {
    const [rows] = await pool.execute(
      `SELECT
         COUNT(*) AS clients_total,
         SUM(CASE WHEN provider_id IS NOT NULL THEN 1 ELSE 0 END) AS clients_assigned,
         SUM(CASE WHEN UPPER(status) = 'PENDING' THEN 1 ELSE 0 END) AS clients_pending,
         SUM(CASE WHEN UPPER(status) = 'WAITLIST' THEN 1 ELSE 0 END) AS clients_waitlist
       FROM clients
       WHERE organization_id = ? AND UPPER(COALESCE(status,'')) <> 'ARCHIVED'`,
      [schoolId]
    );
    clients_total = Number(rows?.[0]?.clients_total || 0);
    clients_assigned = Number(rows?.[0]?.clients_assigned || 0);
    clients_pending = Number(rows?.[0]?.clients_pending || 0);
    clients_waitlist = Number(rows?.[0]?.clients_waitlist || 0);
  } catch {
    // ignore
  }

  let school_staff_count = 0;
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM user_agencies ua
       JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ? AND LOWER(COALESCE(u.role,'')) = 'school_staff'`,
      [schoolId]
    );
    school_staff_count = Number(rows?.[0]?.cnt || 0);
  } catch {
    school_staff_count = 0;
  }

  return {
    assigned_weekdays_count,
    clients_total,
    clients_assigned,
    clients_pending,
    clients_waitlist,
    slots_total,
    slots_used,
    slots_available: slots_total - slots_used,
    school_staff_count
  };
}

export async function getDemoDays(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const [dayRows] = await pool.execute(
    `SELECT weekday, is_active FROM school_day_schedules WHERE school_organization_id = ?`,
    [schoolId]
  ).catch(() => [[]]);
  const dayMap = new Map((dayRows || []).map((r) => [String(r.weekday), !!r.is_active]));
  const [provRows] = await pool.execute(
    `SELECT a.weekday, COUNT(*) AS provider_count
     FROM school_day_provider_assignments a
     JOIN user_agencies ua ON ua.user_id = a.provider_user_id AND ua.agency_id = a.school_organization_id
     WHERE a.school_organization_id = ? AND a.is_active = TRUE
     GROUP BY a.weekday`,
    [schoolId]
  ).catch(() => [[]]);
  const provMap = new Map((provRows || []).map((r) => [String(r.weekday), Number(r.provider_count || 0)]));
  return WEEKDAYS.map((weekday) => ({
    weekday,
    is_active: dayMap.get(weekday) || (provMap.get(weekday) || 0) > 0,
    has_providers: (provMap.get(weekday) || 0) > 0
  }));
}

export async function getDemoDayProviders(token, weekdayRaw) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const weekday = WEEKDAYS.find((d) => d.toLowerCase() === String(weekdayRaw || '').toLowerCase());
  if (!weekday) return [];
  const [rows] = await pool.execute(
    `SELECT a.id AS day_provider_assignment_id,
            a.provider_user_id,
            u.first_name,
            u.last_name,
            u.profile_photo_path,
            psa.slots_total,
            psa.slots_available,
            psa.start_time,
            psa.end_time
     FROM school_day_provider_assignments a
     JOIN user_agencies ua ON ua.user_id = a.provider_user_id AND ua.agency_id = a.school_organization_id
     JOIN users u ON u.id = a.provider_user_id
     LEFT JOIN provider_school_assignments psa
       ON psa.school_organization_id = a.school_organization_id
      AND psa.provider_user_id = a.provider_user_id
      AND psa.day_of_week COLLATE utf8mb4_unicode_ci = a.weekday COLLATE utf8mb4_unicode_ci
      AND psa.is_active = TRUE
     WHERE a.school_organization_id = ?
       AND a.weekday = ? COLLATE utf8mb4_unicode_ci
       AND a.is_active = TRUE
       AND a.provider_user_id NOT IN (595, 596, 601)
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [schoolId, weekday]
  ).catch(() => [[]]);
  return (rows || []).map((r) => ({
    ...r,
    email: scrubEmail(),
    slots_used: Math.max(0, Number(r.slots_total || 0) - Number(r.slots_available || 0)),
    slots_available_calculated: Number(r.slots_available || 0),
    profile_photo_path: r.profile_photo_path || null,
    profile_photo_url: publicUploadsUrlFromStoredPath(r.profile_photo_path || null)
  }));
}

export async function getDemoSchedulingProviders(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const [rows] = await pool.execute(
    `SELECT psa.provider_user_id,
            u.first_name,
            u.last_name,
            u.profile_photo_path,
            psa.day_of_week,
            psa.slots_total,
            psa.slots_available,
            psa.start_time,
            psa.end_time,
            psa.is_active
     FROM provider_school_assignments psa
     JOIN users u ON u.id = psa.provider_user_id
     JOIN user_agencies ua ON ua.user_id = psa.provider_user_id AND ua.agency_id = psa.school_organization_id
     WHERE psa.school_organization_id = ? AND psa.is_active = TRUE
       AND psa.provider_user_id NOT IN (595, 596, 601)
     ORDER BY u.last_name ASC, u.first_name ASC, psa.day_of_week ASC`,
    [schoolId]
  ).catch(() => [[]]);

  const byProvider = new Map();
  for (const r of rows || []) {
    const pid = Number(r.provider_user_id);
    if (REMOVED_DEMO_PROVIDER_IDS.has(pid)) continue;
    if (!byProvider.has(pid)) {
      byProvider.set(pid, {
        provider_user_id: pid,
        first_name: r.first_name,
        last_name: r.last_name,
        email: scrubEmail(),
        accepting_new_clients: true,
        provider_accepting_new_clients: true,
        profile_photo_path: r.profile_photo_path || null,
        profile_photo_url: publicUploadsUrlFromStoredPath(r.profile_photo_path || null),
        school_info_blurb: null,
        leaveType: null,
        isOnLeave: false,
        leaveLabel: null,
        assignments: []
      });
    }
    byProvider.get(pid).assignments.push({
      day_of_week: r.day_of_week,
      slots_total: Number(r.slots_total || 0),
      slots_available: Number(r.slots_available || 0),
      slots_used: Math.max(0, Number(r.slots_total || 0) - Number(r.slots_available || 0)),
      slots_available_calculated: Number(r.slots_available || 0),
      start_time: r.start_time,
      end_time: r.end_time,
      is_active: !!r.is_active,
      accepting_new_clients_override: null,
      accepting_new_clients_effective: true
    });
  }
  return [...byProvider.values()];
}

export async function getDemoClients(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const [rows] = await pool.execute(
    `SELECT c.id,
            c.initials,
            c.identifier_code,
            c.status,
            c.provider_id,
            c.service_day,
            c.document_status,
            c.submission_date,
            CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')) AS provider_name
     FROM clients c
     LEFT JOIN users u ON u.id = c.provider_id
     WHERE c.organization_id = ?
       AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'
     ORDER BY c.initials ASC
     LIMIT 200`,
    [schoolId]
  ).catch(() => [[]]);

  return (rows || []).map((r) => {
    const status = String(r.status || 'ACTIVE').toUpperCase();
    const statusKey = status.toLowerCase();
    return {
      id: r.id,
      initials: r.initials,
      identifier_code: r.identifier_code,
      status,
      client_status_key: statusKey,
      client_status_label: status.charAt(0) + status.slice(1).toLowerCase(),
      provider_id: r.provider_id || null,
      provider_ids: r.provider_id ? [r.provider_id] : [],
      provider_name: String(r.provider_name || '').trim() || null,
      service_day: r.service_day || null,
      provider_day_pairs: r.provider_id && r.service_day
        ? [{ provider_user_id: r.provider_id, service_day: r.service_day }]
        : [],
      document_status: r.document_status || null,
      paperwork_status_key: null,
      paperwork_status_label: null,
      skills: false,
      unread_notes_count: 0,
      unread_ticket_messages_count: [1181, 1326, 1331].includes(Number(r.id)) ? 1 : 0,
      unread_updates_count: 0,
      open_ticket_count: [1181, 1326].includes(Number(r.id)) ? 1 : 0,
      answered_ticket_count: [1331].includes(Number(r.id)) ? 1 : 0,
      school_staff_access_level: 'full',
      school_staff_effective_access_state: 'active',
      school_portal_can_open: true,
      school_portal_force_code: false,
      school_portal_gray: false,
      school_portal_force_placeholder: false,
      submission_date: r.submission_date || null,
      user_is_assigned_provider: false
    };
  });
}

export async function getDemoSchoolStaff(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.status, u.created_at, u.profile_photo_path,
            sc.id AS school_contact_id, sc.is_primary, sc.is_school_admin, sc.is_scheduler
     FROM user_agencies ua
     JOIN users u ON u.id = ua.user_id
     LEFT JOIN school_contacts sc
       ON sc.school_organization_id = ua.agency_id
      AND LOWER(sc.email) COLLATE utf8mb4_unicode_ci = LOWER(u.email) COLLATE utf8mb4_unicode_ci
     WHERE ua.agency_id = ?
       AND LOWER(COALESCE(u.role,'')) = 'school_staff'
       AND UPPER(COALESCE(u.status,'')) <> 'ARCHIVED'
     ORDER BY u.last_name ASC, u.first_name ASC
     LIMIT 100`,
    [schoolId]
  ).catch(() => [[]]);
  return (rows || [])
    .filter((r) => !REMOVED_DEMO_STAFF_EMAILS.has(String(r.email || '').toLowerCase()))
    .map((r) => {
      const isDemoAdmin = Number(r.id) === DEMO_SCHOOL_ADMIN_USER_ID || !!r.is_school_admin;
      return {
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: scrubEmail(),
        status: r.status,
        created_at: r.created_at,
        last_login: null,
        profile_photo_path: r.profile_photo_path || null,
        profile_photo_url: publicUploadsUrlFromStoredPath(r.profile_photo_path || null),
        is_primary: Number(r.id) === DEMO_SCHOOL_ADMIN_USER_ID || !!r.is_primary,
        is_school_admin: isDemoAdmin,
        is_scheduler: !!r.is_scheduler && Number(r.id) !== DEMO_SCHOOL_ADMIN_USER_ID,
        school_contact_id: r.school_contact_id || null,
        has_active_temporary_password: false,
        password_reset_expires_at: null
      };
    });
}

const SCHOOL_PORTAL_ICON_ID_FIELDS = [
  'school_portal_providers_icon_id',
  'school_portal_days_icon_id',
  'school_portal_roster_icon_id',
  'school_portal_skills_groups_icon_id',
  'school_portal_contact_admin_icon_id',
  'school_portal_school_staff_icon_id',
  'school_portal_parent_qr_icon_id',
  'school_portal_parent_sign_icon_id',
  'school_portal_upload_packet_icon_id',
  'school_portal_public_documents_icon_id',
  'school_portal_faq_icon_id',
  'school_portal_announcements_icon_id',
  'school_portal_events_icon_id',
  'school_portal_digital_forms_icon_id',
  'school_portal_calendar_icon_id'
];

async function resolveIconPathsById(ids) {
  const list = [...new Set((ids || []).map((n) => Number(n)).filter(Boolean))];
  if (!list.length) return new Map();
  const placeholders = list.map(() => '?').join(',');
  const [rows] = await pool
    .execute(`SELECT id, file_path FROM icons WHERE id IN (${placeholders}) AND is_active = TRUE`, list)
    .catch(() => [[]]);
  return new Map((rows || []).map((r) => [Number(r.id), r.file_path || null]));
}

async function buildDemoActiveAgency(agencyId) {
  const id = Number(agencyId || 0);
  if (!id) return null;
  const agency = await Agency.findById(id);
  if (!agency) return null;

  const iconIds = SCHOOL_PORTAL_ICON_ID_FIELDS.map((f) => agency[f]).filter(Boolean);
  const pathById = await resolveIconPathsById(iconIds);
  const iconPaths = {};
  for (const field of SCHOOL_PORTAL_ICON_ID_FIELDS) {
    const iconId = agency[field];
    const pathField = field.replace(/_icon_id$/, '_icon_path');
    iconPaths[field] = iconId || null;
    iconPaths[pathField] = iconId ? pathById.get(Number(iconId)) || null : null;
  }

  return {
    id: agency.id,
    name: agency.name,
    organization_type: agency.organization_type,
    slug: agency.portal_url || agency.slug || null,
    portal_url: agency.portal_url || agency.slug || null,
    logo_path: agency.logo_path || null,
    logo_url: agency.logo_url || null,
    icon_file_path: agency.icon_file_path || null,
    color_palette: parseFlags(agency.color_palette),
    theme_settings: parseFlags(agency.theme_settings),
    feature_flags: parseFlags(agency.feature_flags),
    review_prompt_config: parseFlags(agency.review_prompt_config),
    ...iconPaths
  };
}

export async function getDemoAffiliation(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  let activeAgencyId = null;
  try {
    const [rows] = await pool.execute(
      `SELECT agency_id FROM organization_affiliations
       WHERE organization_id = ? AND (is_active = TRUE OR is_active IS NULL)
       ORDER BY id ASC LIMIT 1`,
      [schoolId]
    );
    activeAgencyId = rows?.[0]?.agency_id || null;
  } catch {
    activeAgencyId = null;
  }
  const activeAgency = await buildDemoActiveAgency(activeAgencyId);
  return {
    school_organization_id: schoolId,
    active_agency_id: activeAgencyId,
    active_agency: activeAgency,
    user_has_school_access: true,
    user_has_agency_access: true,
    can_edit_clients: true,
    is_school_admin: true,
    demo_user_id: DEMO_SCHOOL_ADMIN_USER_ID
  };
}

export async function getDemoAssignedClients(token, providerUserId, dayOfWeek) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const pid = Number(providerUserId || 0);
  if (!pid) return [];
  const day = WEEKDAYS.find((d) => d.toLowerCase() === String(dayOfWeek || '').toLowerCase()) || null;
  let sql = `
    SELECT c.id, c.initials, c.identifier_code, c.status, cpa.service_day
    FROM client_provider_assignments cpa
    JOIN clients c ON c.id = cpa.client_id
    WHERE cpa.organization_id = ?
      AND cpa.provider_user_id = ?
      AND cpa.is_active = TRUE
      AND UPPER(COALESCE(c.status,'')) <> 'ARCHIVED'`;
  const params = [schoolId, pid];
  if (day) {
    sql += ` AND cpa.service_day = ?`;
    params.push(day);
  }
  sql += ` ORDER BY c.initials ASC LIMIT 100`;
  const [rows] = await pool.execute(sql, params).catch(() => [[]]);
  return (rows || []).map((r) => ({
    id: r.id,
    initials: r.initials,
    identifier_code: r.identifier_code,
    status: r.status,
    service_day: r.service_day,
    school_portal_can_open: true,
    school_portal_force_placeholder: false
  }));
}

export async function getDemoSoftSlots() {
  return { persisted: false, slots: [] };
}

export async function getDemoSchoolEvents(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  return listSchoolEventsForOrg(schoolId, { viewerUserId: DEMO_SCHOOL_ADMIN_USER_ID }).catch(() => []);
}

export async function getDemoSchoolEventsMissing(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const missing = await getMissingCategoriesForOrg(schoolId).catch(() => []);
  return { missing: missing || [], categories: missing || [] };
}

export async function getDemoPublicDocuments(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const [rows] = await pool
    .execute(
      `SELECT id, school_organization_id, kind, title, category_key, file_path, link_url,
              mime_type, original_filename, uploaded_by_user_id, created_at, updated_at
       FROM school_public_documents
       WHERE school_organization_id = ?
       ORDER BY updated_at DESC, id DESC`,
      [schoolId]
    )
    .catch(() => [[]]);
  return { schoolOrganizationId: schoolId, documents: rows || [] };
}

export async function getDemoIntakeLinks(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const [rows] = await pool
    .execute(
      `SELECT id, public_key, title, description, language_code, scope_type, organization_id,
              program_id, is_active, created_at, updated_at
       FROM intake_links
       WHERE scope_type = 'school'
         AND organization_id = ?
         AND is_active = 1
       ORDER BY updated_at DESC, id DESC`,
      [schoolId]
    )
    .catch(() => [[]]);
  return { scopeType: 'school', organizationId: schoolId, links: rows || [] };
}

export async function getDemoAnnouncementsBanner(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const [rows] = await pool
    .execute(
      `SELECT id, title, message, display_type, audience, starts_at, ends_at, created_at
       FROM school_portal_announcements
       WHERE organization_id = ?
         AND NOW() >= starts_at
         AND NOW() <= ends_at
       ORDER BY starts_at ASC, id DESC
       LIMIT 20`,
      [schoolId]
    )
    .catch(() => [[]]);
  return (rows || []).map((r) => ({
    id: r.id,
    title: r.title || 'Announcement',
    message: r.message || '',
    display_type: r.display_type || 'announcement',
    audience: r.audience || 'everyone',
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    created_at: r.created_at
  }));
}

export async function getDemoNotificationsFeed(token) {
  const banner = await getDemoAnnouncementsBanner(token);
  const docs = await getDemoPublicDocuments(token);
  const items = [];
  for (const a of banner || []) {
    items.push({
      id: `announcement:${a.id}`,
      kind: 'announcement',
      title: a.title,
      message: a.message,
      created_at: a.created_at || a.starts_at,
      actor_name: 'Minerva McGonagall'
    });
  }
  for (const d of docs?.documents || []) {
    const isLink = !!String(d.link_url || '').trim();
    items.push({
      id: `public_doc:${d.id}`,
      kind: 'doc',
      title: isLink ? 'New link added' : 'New document added',
      message: String(d.title || '').trim() || (isLink ? 'Link added' : 'Document added'),
      created_at: d.created_at,
      actor_name: 'School Admin'
    });
  }
  // Extra demo-only notifications so the panel looks populated even before migration seeds.
  if (!items.length) {
    const now = Date.now();
    items.push(
      {
        id: 'demo:welcome',
        kind: 'announcement',
        title: 'Welcome to the Hogwarts school portal demo',
        message: 'Browse freely — this is a view-only preview of what your school portal will look like.',
        created_at: new Date(now - 2 * 86400000).toISOString(),
        actor_name: 'Minerva McGonagall'
      },
      {
        id: 'demo:schedule',
        kind: 'announcement',
        title: 'Provider schedule updated for this week',
        message: 'Monday and Friday have two providers on campus. Wednesday has no school-based coverage.',
        created_at: new Date(now - 86400000).toISOString(),
        actor_name: 'Minerva McGonagall'
      }
    );
  }
  items.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  return items;
}

function demoIso(daysAgo = 0, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

export async function getDemoChatThreads(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  return [
    {
      thread_id: 90001,
      agency_id: schoolId,
      agency_name: 'Hogwarts',
      organization_id: schoolId,
      thread_type: 'direct',
      updated_at: demoIso(0, 14),
      unread_count: 1,
      last_message: {
        id: 900011,
        body: 'Harry is doing well with fine motor work this week.',
        created_at: demoIso(0, 14),
        sender_user_id: 1007
      },
      other_participant: {
        id: 1007,
        first_name: 'Sirius',
        last_name: 'Black',
        email: null,
        role: 'provider'
      },
      participants: [
        { id: 1007, first_name: 'Sirius', last_name: 'Black', email: null, role: 'provider' }
      ]
    },
    {
      thread_id: 90002,
      agency_id: schoolId,
      agency_name: 'Hogwarts',
      organization_id: schoolId,
      thread_type: 'direct',
      updated_at: demoIso(1, 11),
      unread_count: 0,
      last_message: {
        id: 900021,
        body: 'Can we confirm Thursday coverage for Hermione?',
        created_at: demoIso(1, 11),
        sender_user_id: DEMO_SCHOOL_ADMIN_USER_ID
      },
      other_participant: {
        id: 1009,
        first_name: 'Kingsley',
        last_name: 'Shacklebolt',
        email: null,
        role: 'provider'
      },
      participants: [
        { id: 1009, first_name: 'Kingsley', last_name: 'Shacklebolt', email: null, role: 'provider' }
      ]
    },
    {
      thread_id: 90003,
      agency_id: schoolId,
      agency_name: 'Hogwarts',
      organization_id: schoolId,
      thread_type: 'direct',
      updated_at: demoIso(3, 9),
      unread_count: 0,
      last_message: {
        id: 900031,
        body: 'I updated Neville’s goal notes in the roster.',
        created_at: demoIso(3, 9),
        sender_user_id: 1017
      },
      other_participant: {
        id: 1017,
        first_name: 'Pomona',
        last_name: 'Sprout',
        email: null,
        role: 'school_staff'
      },
      participants: [
        { id: 1017, first_name: 'Pomona', last_name: 'Sprout', email: null, role: 'school_staff' }
      ]
    }
  ];
}

export async function getDemoChatMessages(token, threadIdRaw) {
  const threadId = Number(threadIdRaw || 0);
  const me = DEMO_SCHOOL_ADMIN_USER_ID;
  const byThread = {
    90001: [
      {
        id: 900010,
        thread_id: 90001,
        sender_user_id: me,
        sender_first_name: 'Minerva',
        sender_last_name: 'McGonagall',
        body: 'Hi Sirius — any updates on Harry this week?',
        created_at: demoIso(1, 9),
        is_read_by_other: true
      },
      {
        id: 900011,
        thread_id: 90001,
        sender_user_id: 1007,
        sender_first_name: 'Sirius',
        sender_last_name: 'Black',
        body: 'Harry is doing well with fine motor work this week.',
        created_at: demoIso(0, 14),
        is_read_by_other: false
      }
    ],
    90002: [
      {
        id: 900020,
        thread_id: 90002,
        sender_user_id: 1009,
        sender_first_name: 'Kingsley',
        sender_last_name: 'Shacklebolt',
        body: 'Thursday looks light — I can take one more student.',
        created_at: demoIso(2, 10),
        is_read_by_other: true
      },
      {
        id: 900021,
        thread_id: 90002,
        sender_user_id: me,
        sender_first_name: 'Minerva',
        sender_last_name: 'McGonagall',
        body: 'Can we confirm Thursday coverage for Hermione?',
        created_at: demoIso(1, 11),
        is_read_by_other: true
      }
    ],
    90003: [
      {
        id: 900031,
        thread_id: 90003,
        sender_user_id: 1017,
        sender_first_name: 'Pomona',
        sender_last_name: 'Sprout',
        body: 'I updated Neville’s goal notes in the roster.',
        created_at: demoIso(3, 9),
        is_read_by_other: true
      },
      {
        id: 900032,
        thread_id: 90003,
        sender_user_id: me,
        sender_first_name: 'Minerva',
        sender_last_name: 'McGonagall',
        body: 'Perfect — thank you!',
        created_at: demoIso(3, 10),
        is_read_by_other: true
      }
    ]
  };
  return byThread[threadId] || [];
}

const DEMO_TICKETS = [
  {
    id: 91001,
    school_organization_id: 376,
    client_id: 1181,
    topic: 'scheduling',
    subject: 'Make-up session request',
    question: 'Harry missed Monday — can we schedule a make-up?',
    status: 'open',
    answer: null,
    created_at: demoIso(2, 8),
    updated_at: demoIso(2, 8),
    created_by_user_id: DEMO_SCHOOL_ADMIN_USER_ID
  },
  {
    id: 91002,
    school_organization_id: 376,
    client_id: 1326,
    topic: 'general',
    subject: 'IEP meeting notes',
    question: 'Where should I upload Hermione’s latest IEP addendum?',
    status: 'answered',
    answer: 'Upload it under Docs / Links, or attach it on the client profile Messages tab.',
    answered_at: demoIso(4, 15),
    created_at: demoIso(5, 9),
    updated_at: demoIso(4, 15),
    created_by_user_id: DEMO_SCHOOL_ADMIN_USER_ID
  },
  {
    id: 91003,
    school_organization_id: 376,
    client_id: 1331,
    topic: 'general',
    subject: 'Progress update',
    question: 'Can we get a quick progress note for Ron before conferences?',
    status: 'answered',
    answer: 'Yes — Kingsley will add a note by Thursday.',
    answered_at: demoIso(1, 16),
    created_at: demoIso(3, 11),
    updated_at: demoIso(1, 16),
    created_by_user_id: DEMO_SCHOOL_ADMIN_USER_ID
  }
];

export async function getDemoSupportTicketsMine(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  return DEMO_TICKETS.map((t) => ({ ...t, school_organization_id: schoolId }));
}

export async function getDemoClientTickets(token, query = {}) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const clientId = Number(query.clientId || query.client_id || 0);
  const tickets = DEMO_TICKETS.map((t) => ({ ...t, school_organization_id: schoolId })).filter(
    (t) => !clientId || Number(t.client_id) === clientId
  );
  return { tickets };
}

export async function getDemoTicketMessages(token, ticketIdRaw) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const ticketId = Number(ticketIdRaw || 0);
  const ticket =
    DEMO_TICKETS.map((t) => ({ ...t, school_organization_id: schoolId })).find(
      (t) => Number(t.id) === ticketId
    ) || null;
  if (!ticket) return { ticket: null, messages: [] };
  const messages = [];
  if (ticket.status === 'answered' || ticket.answer) {
    messages.push({
      id: ticketId * 10 + 1,
      ticket_id: ticketId,
      author_user_id: 2,
      body: ticket.answer || 'Thanks — we are looking into this.',
      created_at: ticket.answered_at || ticket.updated_at
    });
  } else {
    messages.push({
      id: ticketId * 10 + 1,
      ticket_id: ticketId,
      author_user_id: 1007,
      body: 'I can offer a Thursday afternoon make-up slot.',
      created_at: demoIso(1, 13)
    });
  }
  return { ticket, messages };
}

export async function getDemoUserPreferences() {
  return {
    school_portal_notifications_progress: {
      by_org: {},
      by_org_kind: {},
      by_org_client_kind: {},
      dismissed_by_org: {}
    }
  };
}

/**
 * Route a rewritten school-portal GET path to demo handlers.
 * pathRest examples: "stats", "days", "days/Monday/providers", "clients", "school-staff"
 * Also handles rewritten chat / support-tickets / users preferences paths.
 */
export async function handleDemoPortalGet(token, pathRest, query = {}) {
  const rest = String(pathRest || '').replace(/^\/+|\/+$/g, '');
  const parts = rest ? rest.split('/') : [];

  if (!rest || rest === '') {
    return getDemoSchoolMeta(token);
  }
  if (parts[0] === 'stats') return getDemoStats(token);
  if (parts[0] === 'days' && parts.length === 1) return getDemoDays(token);
  if (parts[0] === 'days' && parts[2] === 'providers' && parts.length === 3) {
    return getDemoDayProviders(token, parts[1]);
  }
  if (parts[0] === 'days' && parts[2] === 'providers' && parts[4] === 'soft-slots') {
    return getDemoSoftSlots();
  }
  if (parts[0] === 'providers' && parts[1] === 'scheduling') return getDemoSchedulingProviders(token);
  if (parts[0] === 'providers' && parts[2] === 'assigned-clients') {
    return getDemoAssignedClients(token, parts[1], query.dayOfWeek || query.day_of_week);
  }
  if (parts[0] === 'providers' && parts[2] === 'profile') {
    const providers = await getDemoSchedulingProviders(token);
    const p = providers.find((x) => Number(x.provider_user_id) === Number(parts[1]));
    return p || { provider_user_id: Number(parts[1]), first_name: 'Demo', last_name: 'Provider', assignments: [] };
  }
  if (parts[0] === 'providers' && parts[2] === 'caseload-slots') {
    return { slots: [] };
  }
  if (parts[0] === 'clients') return getDemoClients(token);
  if (parts[0] === 'school-staff') return getDemoSchoolStaff(token);
  if (parts[0] === 'affiliation') return getDemoAffiliation(token);
  if (parts[0] === 'notifications' && parts[1] === 'feed') {
    return getDemoNotificationsFeed(token);
  }
  if (parts[0] === 'announcements' && parts[1] === 'banner') {
    return getDemoAnnouncementsBanner(token);
  }
  if (parts[0] === 'school-events' && parts[1] === 'missing') {
    return getDemoSchoolEventsMissing(token);
  }
  if (parts[0] === 'school-events') return getDemoSchoolEvents(token);
  if (parts[0] === 'faq') return [];
  if (parts[0] === 'public-documents') return getDemoPublicDocuments(token);
  if (parts[0] === 'intake-links') return getDemoIntakeLinks(token);
  if (parts[0] === 'school-staff-waiver' && parts[1] === 'status') {
    return { required: false, isSigned: true, taskId: null };
  }
  if (parts[0] === 'client-assignment-search') return [];
  if (parts[0] === 'my-roster') return [];
  if (parts[0] === 'skill-builders-program') return { linked: false };
  if (parts[0] === 'skills-groups') return [];

  // Rewritten non-school-portal APIs used by Messages / Contact Admin / notifications.
  if (parts[0] === 'chat' && parts[1] === 'threads' && parts.length === 2) {
    return getDemoChatThreads(token);
  }
  if (parts[0] === 'chat' && parts[1] === 'threads' && parts[3] === 'messages') {
    return getDemoChatMessages(token, parts[2]);
  }
  if (parts[0] === 'chat' && parts[1] === 'threads' && parts[3] === 'meta') {
    const threads = await getDemoChatThreads(token);
    return threads.find((t) => Number(t.thread_id) === Number(parts[2])) || { thread_id: Number(parts[2]) };
  }
  if (parts[0] === 'support-tickets' && parts[1] === 'mine') {
    return getDemoSupportTicketsMine(token);
  }
  if (parts[0] === 'support-tickets' && parts[1] === 'client-tickets') {
    return getDemoClientTickets(token, query);
  }
  if (parts[0] === 'support-tickets' && parts[1] === 'client-thread') {
    return getDemoClientTickets(token, query);
  }
  if (parts[0] === 'support-tickets' && parts[2] === 'messages') {
    return getDemoTicketMessages(token, parts[1]);
  }
  if (parts[0] === 'support-tickets' && parts.length === 1) {
    return getDemoSupportTicketsMine(token);
  }
  if (parts[0] === 'users' && parts[2] === 'preferences') {
    return getDemoUserPreferences();
  }

  // Unknown GET: empty-safe payload so panels still open.
  return [];
}

export async function handleDemoPortalMutation() {
  return { ok: true, demo: true, message: 'Demo only — changes are not saved.' };
}
