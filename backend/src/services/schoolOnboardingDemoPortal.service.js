import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import * as Onboarding from './schoolOnboarding.service.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

async function resolveHogwartsForInvite(token) {
  const demo = await Onboarding.resolveDemoSchool(token);
  const agency = await Agency.findById(demo.id);
  if (!agency) {
    throw Object.assign(new Error('Demo school not found'), { status: 404 });
  }
  return { demo, agency, schoolId: Number(demo.id) };
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
  return {
    id: schoolId,
    name: agency.name || demo.name || 'Hogwarts',
    official_name: agency.official_name || agency.name || 'Hogwarts School of Witchcraft and Wizardry',
    slug: agency.portal_url || agency.slug || 'hogwarts',
    portal_url: agency.portal_url || agency.slug || 'hogwarts',
    organization_type: 'school',
    is_active: true,
    logo_url: agency.logo_url || null,
    logo_path: agency.logo_path || null,
    color_palette: parseFlags(agency.color_palette),
    theme_settings: parseFlags(agency.theme_settings),
    terminology_settings: parseFlags(agency.terminology_settings),
    portal_theme: portalTheme
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
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [schoolId, weekday]
  ).catch(() => [[]]);
  return (rows || []).map((r) => ({
    ...r,
    email: scrubEmail(),
    slots_used: Math.max(0, Number(r.slots_total || 0) - Number(r.slots_available || 0)),
    slots_available_calculated: Number(r.slots_available || 0),
    profile_photo_url: null
  }));
}

export async function getDemoSchedulingProviders(token) {
  const { schoolId } = await resolveHogwartsForInvite(token);
  const [rows] = await pool.execute(
    `SELECT psa.provider_user_id,
            u.first_name,
            u.last_name,
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
     ORDER BY u.last_name ASC, u.first_name ASC, psa.day_of_week ASC`,
    [schoolId]
  ).catch(() => [[]]);

  const byProvider = new Map();
  for (const r of rows || []) {
    const pid = Number(r.provider_user_id);
    if (!byProvider.has(pid)) {
      byProvider.set(pid, {
        provider_user_id: pid,
        first_name: r.first_name,
        last_name: r.last_name,
        email: scrubEmail(),
        accepting_new_clients: true,
        provider_accepting_new_clients: true,
        profile_photo_url: null,
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
      unread_ticket_messages_count: 0,
      unread_updates_count: 0,
      open_ticket_count: 0,
      answered_ticket_count: 0,
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
    `SELECT u.id, u.first_name, u.last_name, u.status, u.created_at, u.profile_photo_path
     FROM user_agencies ua
     JOIN users u ON u.id = ua.user_id
     WHERE ua.agency_id = ?
       AND LOWER(COALESCE(u.role,'')) = 'school_staff'
       AND UPPER(COALESCE(u.status,'')) <> 'ARCHIVED'
     ORDER BY u.last_name ASC, u.first_name ASC
     LIMIT 100`,
    [schoolId]
  ).catch(() => [[]]);
  return (rows || []).map((r, idx) => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    email: scrubEmail(),
    status: r.status,
    created_at: r.created_at,
    last_login: null,
    profile_photo_path: r.profile_photo_path || null,
    profile_photo_url: null,
    is_primary: idx === 0,
    is_school_admin: idx === 0,
    is_scheduler: false,
    school_contact_id: null,
    has_active_temporary_password: false,
    password_reset_expires_at: null
  }));
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
    can_edit_clients: false
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

/**
 * Route a rewritten school-portal GET path to demo handlers.
 * pathRest examples: "stats", "days", "days/Monday/providers", "clients", "school-staff"
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
    return { items: [], unread_count: 0 };
  }
  if (parts[0] === 'announcements' && parts[1] === 'banner') return [];
  if (parts[0] === 'school-events' && parts[1] === 'missing') {
    return { missing: [], categories: [] };
  }
  if (parts[0] === 'school-events') return [];
  if (parts[0] === 'faq') return [];
  if (parts[0] === 'public-documents') return [];
  if (parts[0] === 'intake-links') return [];
  if (parts[0] === 'school-staff-waiver' && parts[1] === 'status') {
    return { required: false, isSigned: true, taskId: null };
  }
  if (parts[0] === 'client-assignment-search') return [];
  if (parts[0] === 'my-roster') return [];
  if (parts[0] === 'skill-builders-program') return { linked: false };
  if (parts[0] === 'skills-groups') return [];

  // Unknown GET: empty-safe payload so panels still open.
  return [];
}

export async function handleDemoPortalMutation() {
  return { ok: true, demo: true, message: 'Demo only — changes are not saved.' };
}
