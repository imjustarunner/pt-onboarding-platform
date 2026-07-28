/**
 * Provider Year Update — fall checklist / campaign for school-assigned providers.
 * Parallel to school collaborative year update (school_reinit_*), keyed by provider.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import {
  getUserPreferences,
  listUserAssignments,
  setUserPreferences,
} from './gearInventory.service.js';
import { listSchoolEventsForOrg } from './schoolPortalEvents.service.js';
import { consolidateLicenseFieldAliasesForUser } from './licenseCredentialSync.service.js';
import {
  computeExpiresAt,
  expirationStatus,
  FEDERAL_BG_ITEM_KEY,
  getExpirationYearsForUser,
  syncFederalBackgroundExpiration,
} from './federalBackgroundCheck.service.js';
import { requiresProviderYearUpdateLicensesSection } from '../utils/credentialNormalization.js';

export const SECTION_KEYS = [
  'reminders',
  'school_events',
  'materials',
  'licenses',
  'provider_schedule',
  'clients',
];

const LICENSE_INFO_FIELD_KEYS = {
  typeNumber: ['provider_credential_license_type_number', 'license_type_number'],
  issuedDate: [
    'provider_credential_license_issued_date',
    'license_issued',
    'license_issued_date',
  ],
  expirationDate: [
    'provider_credential_license_expiration_date',
    'license_expires',
    'license_expiration_date',
    'license_expires_date',
  ],
  upload: ['license_upload'],
};

export const SCHOOL_CART_DISCLAIMER =
  'This cart is a rolling cart filled with basic supplies to help with school therapy sessions. It includes craft supplies, games, a timer, and other basic supplies to help with your session. The clinician is responsible for the cart and its contents, and will be required to return the cart at the end of the school year. If the cart is damaged, lost or stolen, the clinician is required to let Kaitlyn O’Connell and Megan CG know.';

export function defaultMaterialsData(provider = null) {
  const first = provider?.firstName || provider?.first_name || '';
  const last = provider?.lastName || provider?.last_name || '';
  const full = [first, last].filter(Boolean).join(' ').trim();
  return {
    school_cart: null, // 'need' | 'do_not_need'
    need_school_cart: false, // legacy mirror
    materials_notes: '',
    itsco_name_tag: false,
    itsco_name_tag_name: full,
    itsco_name_tag_title: '',
    office_nametag: false,
    office_nametag_name: full,
    itsco_lanyard: false,
    business_cards: false,
    has_office_key: null, // 'yes' | 'no'
    has_shirt: null, // 'yes' | 'no'
    has_itsco_name_tag: null,
    has_office_nametag: null,
    has_itsco_lanyard: null,
    has_business_cards: null,
    has_canvas_bag: null,
    shirt_gender: '',
    shirt_size: '',
    shirt_size_secondary: '',
    itsco_polo: false, // legacy mirror when has_shirt === 'no'
    polo_sex: '',
    polo_size: '',
    polo_size_secondary: '',
    itsco_canvas_bag: false,
  };
}

const SHIRT_GEAR_NAME_SQL = `(
  LOWER(t.name) LIKE '%shirt%'
  OR LOWER(t.name) LIKE '%t-shirt%'
  OR LOWER(t.name) LIKE '%tshirt%'
  OR LOWER(COALESCE(t.category, '')) LIKE '%shirt%'
  OR LOWER(t.name) LIKE '%polo%'
  OR LOWER(COALESCE(t.category, '')) LIKE '%polo%'
)`;

function normalizeYesNo(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'yes' || v === 'true' || v === '1') return 'yes';
  if (v === 'no' || v === 'false' || v === '0') return 'no';
  return null;
}

function legacyPoloGenderToShirt(gender) {
  const g = String(gender || '').trim().toUpperCase();
  if (g === 'M') return 'men';
  if (g === 'F') return 'women';
  return String(gender || '').trim().toLowerCase();
}

function shirtGenderToLegacyPolo(gender) {
  const g = String(gender || '').trim().toLowerCase();
  if (g === 'men') return 'M';
  if (g === 'women') return 'F';
  return '';
}

function materialHasAnswer(materials, hasKey, legacyNeedKey = null) {
  const direct = normalizeYesNo(materials?.[hasKey]);
  if (direct) return direct;
  if (legacyNeedKey && materials?.[legacyNeedKey]) return 'no';
  return null;
}

function shirtSizeDetail(materials) {
  const parts = [
    materials.shirt_gender ? legacyPoloGenderToShirt(materials.shirt_gender) : '',
    materials.shirt_size,
    materials.shirt_size_secondary ? `alt ${materials.shirt_size_secondary}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || null;
}

export const PYU_GEAR_ITEM_DEFS = [
  { key: 'school_cart', label: 'School cart' },
  { key: 'office_key', label: 'Office key' },
  { key: 'itsco_name_tag', label: 'ITSCO name tag' },
  { key: 'office_nametag', label: 'Office nametag' },
  { key: 'itsco_lanyard', label: 'ITSCO lanyard' },
  { key: 'business_cards', label: 'Business cards' },
  { key: 'shirt', label: 'ITSCO shirt' },
  { key: 'canvas_bag', label: 'ITSCO canvas bag' },
];

function assignmentMatchesGearKey(assignment, key) {
  const name = String(assignment?.typeName || '').toLowerCase();
  const asset = String(assignment?.assetCode || '').toLowerCase();
  const hay = `${name} ${asset}`;
  switch (key) {
    case 'school_cart':
      return /cart/.test(hay);
    case 'office_key':
      return /key|badge/.test(hay);
    case 'itsco_name_tag':
      return /name.?tag|nametag/.test(hay) && !/office/.test(hay);
    case 'office_nametag':
      return /office/.test(hay) && /name|tag/.test(hay);
    case 'itsco_lanyard':
      return /lanyard/.test(hay);
    case 'business_cards':
      return /business/.test(hay) && /card/.test(hay);
    case 'shirt':
      return /shirt|polo|t-?shirt/.test(hay);
    case 'canvas_bag':
      return /bag|canvas/.test(hay);
    default:
      return false;
  }
}

function materialsStatusForGearKey(normalized, key) {
  switch (key) {
    case 'school_cart':
      if (normalized.school_cart === 'need') {
        return { status: 'requested', detail: 'Requested via Year Update' };
      }
      if (normalized.school_cart === 'do_not_need') {
        return { status: 'has', detail: 'Does not need a cart' };
      }
      return { status: 'unknown', detail: null };
    case 'office_key':
      if (normalized.has_office_key === 'yes') return { status: 'has', detail: 'Self-reported' };
      if (normalized.has_office_key === 'no') return { status: 'requested', detail: 'Needs office key' };
      return { status: 'unknown', detail: null };
    case 'shirt':
      if (normalized.has_shirt === 'yes') return { status: 'has', detail: 'Self-reported' };
      if (normalized.has_shirt === 'no') {
        return {
          status: 'requested',
          detail: shirtSizeDetail(normalized) || 'Needs shirt',
        };
      }
      return { status: 'unknown', detail: null };
    case 'itsco_name_tag': {
      const has = materialHasAnswer(normalized, 'has_itsco_name_tag', 'itsco_name_tag');
      if (has === 'yes') return { status: 'has', detail: 'Self-reported' };
      if (has === 'no') {
        const name = String(normalized.itsco_name_tag_name || '').trim();
        const title = String(normalized.itsco_name_tag_title || '').trim();
        return {
          status: 'requested',
          detail: [name, title].filter(Boolean).join(' · ') || 'Needs name tag',
        };
      }
      return { status: 'unknown', detail: null };
    }
    case 'office_nametag': {
      const has = materialHasAnswer(normalized, 'has_office_nametag', 'office_nametag');
      if (has === 'yes') return { status: 'has', detail: 'Self-reported' };
      if (has === 'no') {
        const name = String(normalized.office_nametag_name || '').trim();
        return { status: 'requested', detail: name || 'Needs office nametag' };
      }
      return { status: 'unknown', detail: null };
    }
    case 'itsco_lanyard': {
      const has = materialHasAnswer(normalized, 'has_itsco_lanyard', 'itsco_lanyard');
      if (has === 'yes') return { status: 'has', detail: 'Self-reported' };
      if (has === 'no') return { status: 'requested', detail: 'Needs lanyard' };
      return { status: 'unknown', detail: null };
    }
    case 'business_cards': {
      const has = materialHasAnswer(normalized, 'has_business_cards', 'business_cards');
      if (has === 'yes') return { status: 'has', detail: 'Self-reported' };
      if (has === 'no') return { status: 'requested', detail: 'Needs business cards' };
      return { status: 'unknown', detail: null };
    }
    case 'canvas_bag': {
      const has = materialHasAnswer(normalized, 'has_canvas_bag', 'itsco_canvas_bag');
      if (has === 'yes') return { status: 'has', detail: 'Self-reported' };
      if (has === 'no') return { status: 'requested', detail: 'Needs canvas bag' };
      return { status: 'unknown', detail: null };
    }
    default:
      return { status: 'unknown', detail: null };
  }
}

function gearStatusLabel(status) {
  switch (status) {
    case 'issued':
      return 'Issued';
    case 'has':
      return 'Has one';
    case 'requested':
      return 'Requested';
    case 'not_needed':
      return 'Not needed';
    default:
      return 'Not set';
  }
}

export function buildGearItemStatuses({ assignments = [], materials = null, savedGearItems = null } = {}) {
  const normalized = materials ? normalizeMaterialsPayload(materials) : null;
  const byKey = {};
  for (const def of PYU_GEAR_ITEM_DEFS) {
    const issued = (assignments || []).find((a) => assignmentMatchesGearKey(a, def.key));
    if (issued) {
      byKey[def.key] = {
        key: def.key,
        label: def.label,
        status: 'issued',
        statusLabel: gearStatusLabel('issued'),
        detail: issued.displayLabel || issued.assetCode || issued.sizeLabel || issued.typeName || null,
        issuedAt: issued.issuedAt || null,
      };
      continue;
    }
    const saved = savedGearItems?.[def.key];
    if (saved?.status && saved.status !== 'unknown') {
      byKey[def.key] = {
        key: def.key,
        label: def.label,
        status: saved.status,
        statusLabel: gearStatusLabel(saved.status),
        detail: saved.detail || null,
        issuedAt: null,
      };
      continue;
    }
    if (normalized) {
      const fromMaterials = materialsStatusForGearKey(normalized, def.key);
      byKey[def.key] = {
        key: def.key,
        label: def.label,
        status: fromMaterials.status,
        statusLabel: gearStatusLabel(fromMaterials.status),
        detail: fromMaterials.detail,
        issuedAt: null,
      };
      continue;
    }
    byKey[def.key] = {
      key: def.key,
      label: def.label,
      status: 'unknown',
      statusLabel: gearStatusLabel('unknown'),
      detail: null,
      issuedAt: null,
    };
  }
  return byKey;
}

function normalizeMaterialsPayload(materials = {}) {
  const hasOfficeKey = normalizeYesNo(materials.has_office_key);
  const hasShirt = normalizeYesNo(materials.has_shirt);
  const hasItscoNameTag = materialHasAnswer(materials, 'has_itsco_name_tag', 'itsco_name_tag');
  const hasOfficeNametag = materialHasAnswer(materials, 'has_office_nametag', 'office_nametag');
  const hasLanyard = materialHasAnswer(materials, 'has_itsco_lanyard', 'itsco_lanyard');
  const hasBusinessCards = materialHasAnswer(materials, 'has_business_cards', 'business_cards');
  const hasCanvasBag = materialHasAnswer(materials, 'has_canvas_bag', 'itsco_canvas_bag');
  const shirtGender =
    legacyPoloGenderToShirt(materials.shirt_gender || materials.polo_sex || '') || '';
  const shirtSize = String(materials.shirt_size || materials.polo_size || '').trim();
  const shirtSizeSecondary = String(
    materials.shirt_size_secondary || materials.polo_size_secondary || ''
  ).trim();
  const needShirt = hasShirt === 'no';
  return {
    ...materials,
    has_office_key: hasOfficeKey,
    has_shirt: hasShirt,
    has_itsco_name_tag: hasItscoNameTag,
    has_office_nametag: hasOfficeNametag,
    has_itsco_lanyard: hasLanyard,
    has_business_cards: hasBusinessCards,
    has_canvas_bag: hasCanvasBag,
    shirt_gender: shirtGender,
    shirt_size: shirtSize,
    shirt_size_secondary: shirtSizeSecondary,
    itsco_name_tag: hasItscoNameTag === 'no' || Boolean(materials.itsco_name_tag),
    office_nametag: hasOfficeNametag === 'no' || Boolean(materials.office_nametag),
    itsco_lanyard: hasLanyard === 'no' || Boolean(materials.itsco_lanyard),
    business_cards: hasBusinessCards === 'no' || Boolean(materials.business_cards),
    itsco_canvas_bag: hasCanvasBag === 'no' || Boolean(materials.itsco_canvas_bag),
    itsco_polo: needShirt || Boolean(materials.itsco_polo),
    polo_sex: shirtGenderToLegacyPolo(shirtGender) || String(materials.polo_sex || '').trim(),
    polo_size: shirtSize,
    polo_size_secondary: shirtSizeSecondary,
  };
}

export const DEFAULT_REMINDER_ITEMS = [
  {
    key: 'first_day_dates',
    title: 'First day of school',
    body: 'The first day of school for most D11 and D12 schools is August 12th and the first day of school for DPS is August 25th.',
    mode: 'reviewed',
  },
  {
    key: 'schools_email',
    title: 'School client communications',
    body: 'Please use schools@itsco.health for all communication regarding school clients, schedules, changes, openings, etc.',
    mode: 'reviewed',
  },
  {
    key: 'first_day_back_meeting',
    title: 'First day back meeting',
    body: 'Please email your school group email address (ex. Rudy@itsco.health) to identify your first day back meeting with your clients. This depends on the school, but it is typically 1–2 weeks after the first day back.',
    mode: 'complete',
  },
  {
    key: 'review_days_clients',
    title: 'Review your days and clients',
    body:
      'You will review your school days, times, client spots, and any needed adjustments in the Provider Schedule section of this Year Update (use the left menu when you get there). Assume your schools and days stay the same unless you have discussed a change or submit an adjustment request.',
    mode: 'reviewed',
  },
  {
    key: 'bts_check_events',
    title: 'Back-to-school events',
    body:
      'Back-to-school events start in August — a great way to connect with your school and families. When you reach the School Events section in this Year Update, you can request to work your back-to-school event there (or via your school\'s portal > Events card). Time is tracked via the event kiosk. Sign-ups are first come, first served; if we do not get sign-ups, people may be assigned.',
    mode: 'reviewed',
  },
  {
    key: 'materials_cart',
    title: 'Materials / school cart',
    body:
      'Megan will be putting together carts for back-to-school events. You will submit your school cart choice and any other materials requests in the Materials Request section of this Year Update (use the left menu when you get there).',
    mode: 'reviewed',
  },
];

function yearEq(columnSql = 'school_year') {
  return `${columnSql} COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
}

export function currentSchoolYear(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 7) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

export function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function parseJsonField(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function campaignIsPushed(campaign) {
  return String(campaign?.status || '') === 'pushed';
}

export function campaignIsDisabled(campaign) {
  return String(campaign?.status || '') === 'disabled';
}

/** Enabled for admin link/push work — not draft and not disabled. */
export function campaignIsEnabled(campaign) {
  const s = String(campaign?.status || '');
  return s === 'enabled' || s === 'pushed';
}

/** Provider sees Year Update on My Dashboard when campaign is bulk-pushed or this cycle was pushed. */
export function cycleIsPushed(cycle, campaign = null) {
  if (campaignIsDisabled(campaign)) return false;
  if (String(cycle?.status || '') === 'finalized') return false;
  if (cycle?.pushed_at) return true;
  if (campaignIsPushed(campaign)) return true;
  return false;
}

export async function markCyclePushed(cycleId, userId) {
  await pool.execute(
    `UPDATE provider_year_update_cycles
     SET pushed_at = COALESCE(pushed_at, NOW()),
         pushed_by_user_id = COALESCE(pushed_by_user_id, ?)
     WHERE id = ?`,
    [userId || null, cycleId]
  );
  return getCycleById(cycleId);
}

export async function getCampaign(agencyId, schoolYear) {
  const year = schoolYear || currentSchoolYear();
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_campaigns
     WHERE agency_id = ? AND ${yearEq()}
     LIMIT 1`,
    [agencyId, year]
  );
  return rows?.[0] || null;
}

export async function getOrCreateCampaign(agencyId, schoolYear) {
  const year = schoolYear || currentSchoolYear();
  const existing = await getCampaign(agencyId, year);
  if (existing) return existing;
  const [result] = await pool.execute(
    `INSERT INTO provider_year_update_campaigns (agency_id, school_year, status)
     VALUES (?, ?, 'draft')`,
    [agencyId, year]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_campaigns WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  return rows[0];
}

export async function enableCampaign({ agencyId, schoolYear, userId }) {
  const year = schoolYear || currentSchoolYear();
  const campaign = await getOrCreateCampaign(agencyId, year);
  if (campaign.status === 'pushed') return { campaign, alreadyPushed: true };
  if (campaign.status === 'enabled') return { campaign, alreadyEnabled: true };
  await pool.execute(
    `UPDATE provider_year_update_campaigns
     SET status = 'enabled',
         enabled_at = NOW(),
         enabled_by_user_id = ?,
         disabled_at = NULL,
         disabled_by_user_id = NULL
     WHERE id = ?`,
    [userId || null, campaign.id]
  );
  return { campaign: await getCampaign(agencyId, year), alreadyEnabled: false };
}

/** Disable Year Update for the school year — hides dashboard entry and blocks public links. */
export async function disableCampaign({ agencyId, schoolYear, userId }) {
  const year = schoolYear || currentSchoolYear();
  const campaign = await getOrCreateCampaign(agencyId, year);
  if (campaign.status === 'disabled') {
    return { campaign, alreadyDisabled: true };
  }
  if (campaign.status === 'draft') {
    const err = new Error('Campaign is not enabled yet.');
    err.status = 400;
    throw err;
  }
  await pool.execute(
    `UPDATE provider_year_update_campaigns
     SET status = 'disabled',
         disabled_at = NOW(),
         disabled_by_user_id = ?
     WHERE id = ?`,
    [userId || null, campaign.id]
  );
  return { campaign: await getCampaign(agencyId, year), alreadyDisabled: false };
}

/**
 * Admin mark complete: finalize cycle (bypass section checks) and clear push so
 * My Dashboard / splash no longer show for this provider.
 */
export async function adminMarkComplete({ agencyId, providerUserId, schoolYear, userId }) {
  const year = schoolYear || currentSchoolYear();
  const cycle = await getOrCreateCycle({ agencyId, providerUserId, schoolYear: year });
  const payload = await buildDashboardPayload(cycle);
  const snapshot = {
    schoolYear: year,
    finalizedAt: new Date().toISOString(),
    adminCompleted: true,
    provider: payload.provider,
    sections: payload.sections,
    materials: payload.materials,
    schedule: payload.schedule,
  };
  await pool.execute(
    `UPDATE provider_year_update_cycles
     SET status = 'finalized',
         finalized_at = COALESCE(finalized_at, NOW()),
         snapshot_json = ?,
         admin_completed_at = NOW(),
         admin_completed_by_user_id = ?,
         pushed_at = NULL,
         pushed_by_user_id = NULL
     WHERE id = ?`,
    [JSON.stringify(snapshot), userId || null, cycle.id]
  );
  await lockTokensForCycle(cycle.id);
  return getCycleById(cycle.id);
}

/** Clear push visibility without finalizing (rarely used). */
export async function unpushProvider({ agencyId, providerUserId, schoolYear }) {
  const year = schoolYear || currentSchoolYear();
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_cycles
     WHERE agency_id = ? AND provider_user_id = ? AND ${yearEq()}
     LIMIT 1`,
    [agencyId, providerUserId, year]
  );
  const cycle = rows?.[0];
  if (!cycle) {
    const err = new Error('Provider cycle not found');
    err.status = 404;
    throw err;
  }
  await pool.execute(
    `UPDATE provider_year_update_cycles
     SET pushed_at = NULL, pushed_by_user_id = NULL
     WHERE id = ?`,
    [cycle.id]
  );
  return getCycleById(cycle.id);
}

/** Providers with active school assignments tied to affiliated school orgs of this agency. */
export async function listSchoolAssignedProviders(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT
        u.id AS provider_user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.profile_photo_path,
        u.phone_number,
        u.personal_phone,
        u.work_phone
     FROM provider_school_assignments psa
     JOIN users u ON u.id = psa.provider_user_id
     JOIN agencies sch ON sch.id = psa.school_organization_id
     WHERE psa.is_active = 1
       AND (
         EXISTS (
           SELECT 1
           FROM organization_affiliations oa
           WHERE oa.organization_id = psa.school_organization_id
             AND oa.agency_id = ?
             AND (oa.is_active = 1 OR oa.is_active IS NULL)
         )
         OR EXISTS (
           SELECT 1
           FROM agency_schools asch
           WHERE asch.school_organization_id = psa.school_organization_id
             AND asch.agency_id = ?
             AND asch.is_active = TRUE
         )
       )
       AND (u.is_archived IS NULL OR u.is_archived = 0)
       AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'INACTIVE_EMPLOYEE', 'PROSPECTIVE')
       AND LOWER(COALESCE(sch.organization_type, 'school')) IN ('school', 'program', 'learning', '')
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [agencyId, agencyId]
  );
  return rows || [];
}

export async function loadProviderPendingScheduleAdjustments(providerUserId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT r.id, r.notes, r.preferred_school_org_ids_json, r.created_at,
            b.day_of_week, b.start_time, b.end_time
     FROM provider_school_availability_requests r
     INNER JOIN provider_school_availability_request_blocks b ON b.request_id = r.id
     WHERE r.agency_id = ? AND r.provider_id = ? AND r.status = 'PENDING'
       AND r.request_kind = 'schedule_adjustment'
     ORDER BY r.created_at DESC`,
    [agencyId, providerUserId]
  );
  const out = [];
  for (const r of rows || []) {
    let schoolOrganizationId = null;
    try {
      const ids = r.preferred_school_org_ids_json ? JSON.parse(r.preferred_school_org_ids_json) : [];
      schoolOrganizationId = Number(ids[0]) || null;
    } catch {
      schoolOrganizationId = null;
    }
    const notesStr = String(r.notes || '');
    if (!schoolOrganizationId) {
      const schoolMatch = notesStr.match(/Schedule adjustment request for (.+?) \|/);
      const schoolName = schoolMatch?.[1]?.trim();
      if (schoolName) {
        const [schRows] = await pool.execute(
          `SELECT id FROM agencies WHERE name = ? LIMIT 1`,
          [schoolName]
        );
        schoolOrganizationId = schRows?.[0]?.id ? Number(schRows[0].id) : null;
      }
    }
    const slotsMatch = notesStr.match(/Requested slots total: (\d+)/);
    const notesMatch = notesStr.match(/\| Notes: (.+)$/);
    out.push({
      id: Number(r.id),
      schoolOrganizationId,
      dayOfWeek: r.day_of_week,
      requestedStart: String(r.start_time || '').slice(0, 5),
      requestedEnd: String(r.end_time || '').slice(0, 5),
      requestedSlots: slotsMatch ? Number(slotsMatch[1]) : null,
      notes: notesMatch?.[1]?.trim() || '',
      createdAt: r.created_at,
    });
  }
  return out;
}

export async function loadProviderSchoolSchedule(providerUserId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT psa.id,
            psa.school_organization_id,
            psa.day_of_week,
            psa.slots_total,
            psa.slots_available,
            psa.start_time,
            psa.end_time,
            sch.name AS school_name,
            sch.slug AS school_slug,
            sch.portal_url,
            sch.logo_url,
            sch.logo_path
     FROM provider_school_assignments psa
     JOIN agencies sch ON sch.id = psa.school_organization_id
     WHERE psa.provider_user_id = ?
       AND psa.is_active = 1
       AND (
         EXISTS (
           SELECT 1
           FROM organization_affiliations oa
           WHERE oa.organization_id = psa.school_organization_id
             AND oa.agency_id = ?
             AND (oa.is_active = 1 OR oa.is_active IS NULL)
         )
         OR EXISTS (
           SELECT 1
           FROM agency_schools asch
           WHERE asch.school_organization_id = psa.school_organization_id
             AND asch.agency_id = ?
             AND asch.is_active = TRUE
         )
       )
     ORDER BY sch.name ASC, FIELD(psa.day_of_week, 'Monday','Tuesday','Wednesday','Thursday','Friday'), psa.day_of_week`,
    [providerUserId, agencyId, agencyId]
  );

  const schoolIds = [...new Set((rows || []).map((r) => Number(r.school_organization_id)).filter(Boolean))];
  const clientCounts = new Map();
  if (schoolIds.length) {
    try {
      const placeholders = schoolIds.map(() => '?').join(',');
      const [cRows] = await pool.execute(
        `SELECT cpa.organization_id,
                cpa.service_day,
                COUNT(DISTINCT cpa.client_id) AS client_count
         FROM client_provider_assignments cpa
         WHERE cpa.provider_user_id = ?
           AND cpa.organization_id IN (${placeholders})
           AND (cpa.is_active = 1 OR cpa.is_active IS NULL)
         GROUP BY cpa.organization_id, cpa.service_day`,
        [providerUserId, ...schoolIds]
      );
      for (const r of cRows || []) {
        clientCounts.set(`${r.organization_id}|${r.service_day}`, Number(r.client_count || 0));
      }
    } catch {
      /* table/columns may vary; schedule still useful without counts */
    }
  }

  const bySchool = new Map();
  for (const r of rows || []) {
    const sid = Number(r.school_organization_id);
    if (!bySchool.has(sid)) {
      bySchool.set(sid, {
        schoolOrganizationId: sid,
        schoolName: r.school_name,
        schoolSlug: r.portal_url || r.school_slug || null,
        logoUrl: r.logo_url || publicUploadsUrlFromStoredPath(r.logo_path) || null,
        days: [],
      });
    }
    bySchool.get(sid).days.push({
      assignmentId: r.id,
      dayOfWeek: r.day_of_week,
      slotsTotal: r.slots_total,
      slotsAvailable: r.slots_available,
      startTime: r.start_time,
      endTime: r.end_time,
      clientCount: clientCounts.get(`${sid}|${r.day_of_week}`) ?? null,
    });
  }
  return Array.from(bySchool.values());
}

export async function loadProviderSchoolEvents(providerUserId, agencyId) {
  const schools = await loadProviderSchoolSchedule(providerUserId, agencyId);
  const out = [];
  for (const school of schools) {
    let events = [];
    try {
      events = await listSchoolEventsForOrg(school.schoolOrganizationId, {
        viewerUserId: providerUserId,
      });
    } catch {
      events = [];
    }
    const list = Array.isArray(events) ? events : events?.events || [];
    const bts = list.filter((e) => {
      const cat = String(e.category || e.event_category || '').toLowerCase();
      return cat === 'back_to_school' || /back[\s-]?to[\s-]?school/i.test(String(e.title || ''));
    });
    out.push({
      schoolOrganizationId: school.schoolOrganizationId,
      schoolName: school.schoolName,
      schoolSlug: school.schoolSlug,
      events: list,
      backToSchoolEvents: bts,
      hasBackToSchool: bts.length > 0,
    });
  }
  return out;
}

/** Assigned school clients with no current service day (read-only for Year Update). */
export async function loadProviderClientsWithoutDay(providerUserId, agencyId) {
  try {
    // Active CPA with Unknown day (service_day NULL), plus legacy rows where
    // clients.provider_id is set / service_day NULL but no active weekday CPA remains.
    const [rows] = await pool.execute(
      `SELECT c.id AS client_id,
              c.initials,
              c.identifier_code,
              c.grade,
              c.status AS client_status,
              cs.status_key AS client_status_key,
              sch.id AS school_organization_id,
              sch.name AS school_name
       FROM clients c
       JOIN client_organization_assignments coa
         ON coa.client_id = c.id
        AND coa.is_active = TRUE
       JOIN agencies sch ON sch.id = coa.organization_id
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       WHERE UPPER(COALESCE(c.status, '')) <> 'ARCHIVED'
         AND (cs.status_key IS NULL OR LOWER(cs.status_key) NOT IN ('terminated', 'archived'))
         AND (
           EXISTS (
             SELECT 1
             FROM organization_affiliations oa
             WHERE oa.organization_id = coa.organization_id
               AND oa.agency_id = ?
               AND (oa.is_active = 1 OR oa.is_active IS NULL)
           )
           OR EXISTS (
             SELECT 1
             FROM agency_schools asch
             WHERE asch.school_organization_id = coa.organization_id
               AND asch.agency_id = ?
               AND asch.is_active = TRUE
           )
         )
         AND NOT EXISTS (
           SELECT 1
           FROM client_provider_assignments cpa_day
           WHERE cpa_day.client_id = c.id
             AND cpa_day.organization_id = coa.organization_id
             AND cpa_day.provider_user_id = ?
             AND (cpa_day.is_active = 1 OR cpa_day.is_active IS NULL)
             AND cpa_day.service_day IS NOT NULL
         )
         AND (
           EXISTS (
             SELECT 1
             FROM client_provider_assignments cpa_null
             WHERE cpa_null.client_id = c.id
               AND cpa_null.organization_id = coa.organization_id
               AND cpa_null.provider_user_id = ?
               AND (cpa_null.is_active = 1 OR cpa_null.is_active IS NULL)
               AND cpa_null.service_day IS NULL
           )
           OR (
             c.provider_id = ?
             AND c.service_day IS NULL
           )
         )
       ORDER BY sch.name ASC, c.initials ASC, c.identifier_code ASC`,
      [agencyId, agencyId, providerUserId, providerUserId, providerUserId]
    );
    const bySchool = new Map();
    const seenClient = new Set();
    for (const r of rows || []) {
      const sid = Number(r.school_organization_id);
      const clientId = Number(r.client_id);
      if (!clientId || seenClient.has(`${sid}:${clientId}`)) continue;
      seenClient.add(`${sid}:${clientId}`);
      if (!bySchool.has(sid)) {
        bySchool.set(sid, {
          schoolOrganizationId: sid,
          schoolName: r.school_name,
          clients: [],
        });
      }
      const initials =
        String(r.initials || '').trim() ||
        String(r.identifier_code || '').trim().slice(0, 6) ||
        '—';
      bySchool.get(sid).clients.push({
        clientId,
        initials,
        grade: r.grade || null,
        status: r.client_status_key || r.client_status || null,
        clientCode: r.identifier_code || null,
      });
    }
    return Array.from(bySchool.values());
  } catch (err) {
    console.error('[providerYearUpdate] loadProviderClientsWithoutDay failed:', err?.message || err);
    return [];
  }
}

async function loadShirtInventoryHint(agencyId) {
  try {
    const [types] = await pool.execute(
      `SELECT id, name, is_gendered, size_options_json, tracking_mode
       FROM gear_item_types t
       WHERE agency_id = ? AND is_active = 1
         AND tracking_mode = 'SIZED_STOCK'
         AND ${SHIRT_GEAR_NAME_SQL}
       ORDER BY
         CASE
           WHEN LOWER(name) LIKE '%shirt%' OR LOWER(name) LIKE '%t-shirt%' OR LOWER(name) LIKE '%tshirt%' THEN 0
           WHEN LOWER(name) LIKE '%polo%' THEN 1
           ELSE 2
         END,
         id ASC
       LIMIT 1`,
      [agencyId]
    );
    if (!types?.length) {
      return {
        available: false,
        message: 'Shirt inventory not configured yet — choose your preferred size',
        sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
        stockBySize: {},
        stockByGenderSize: {},
        isGendered: false,
        genders: [],
      };
    }
    const type = types[0];
    let sizes = [];
    let genders = [];
    try {
      const parsed = typeof type.size_options_json === 'string'
        ? JSON.parse(type.size_options_json)
        : type.size_options_json;
      if (Array.isArray(parsed)) sizes = parsed.map(String);
      else if (parsed && typeof parsed === 'object') {
        genders = Object.keys(parsed).filter((k) => Array.isArray(parsed[k]) && parsed[k].length);
        sizes = [...new Set(genders.flatMap((g) => (parsed[g] || []).map(String)))];
      }
    } catch {
      sizes = [];
    }
    const [stockRows] = await pool.execute(
      `SELECT gender, size_label, quantity_on_hand
       FROM gear_stock_levels
       WHERE gear_item_type_id = ?`,
      [type.id]
    ).catch(() => [[]]);
    const stockBySize = {};
    const stockByGenderSize = {};
    for (const s of stockRows || []) {
      const size = String(s.size_label || '');
      const gender = String(s.gender || '').trim().toLowerCase();
      const qty = Number(s.quantity_on_hand || 0);
      if (!size) continue;
      stockBySize[size] = (stockBySize[size] || 0) + qty;
      if (gender) {
        const key = `${gender}:${size}`;
        stockByGenderSize[key] = qty;
      }
    }
    const hasStock = Object.values(stockBySize).some((n) => n > 0);
    const genderOptions = (type.is_gendered ? genders : [])
      .filter((g) => ['women', 'men'].includes(String(g).toLowerCase()))
      .map((g) => ({
        value: String(g).toLowerCase(),
        label: String(g).toLowerCase() === 'women' ? "Women's" : "Men's",
      }));
    return {
      available: hasStock || sizes.length > 0,
      message: hasStock
        ? `Current ${type.name} inventory shown below`
        : `${type.name} — choose preferred cut and sizes (inventory may be restocked soon)`,
      typeId: type.id,
      typeName: type.name,
      isGendered: Boolean(type.is_gendered),
      genders: genderOptions,
      sizes: sizes.length ? sizes : ['XS', 'S', 'M', 'L', 'XL', '2XL'],
      stockBySize,
      stockByGenderSize,
    };
  } catch {
    return {
      available: false,
      message: 'Shirt inventory unavailable — choose your preferred size',
      sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
      stockBySize: {},
      stockByGenderSize: {},
      isGendered: false,
      genders: [],
    };
  }
}

async function loadUserGearMaterialsContext(agencyId, userId) {
  try {
    const [prefsRes, assignments] = await Promise.all([
      getUserPreferences(agencyId, userId).catch(() => ({ preferences: {} })),
      listUserAssignments(agencyId, userId, { activeOnly: true }).catch(() => []),
    ]);
    const prefs = prefsRes?.preferences || {};
    const gearItems = buildGearItemStatuses({
      assignments,
      savedGearItems: prefs.gear_items || null,
    });
    const shirtItem = gearItems.shirt || null;
    const keyItem = gearItems.office_key || null;
    return {
      preferences: prefs,
      gearItems,
      issuedShirt: shirtItem?.status === 'issued'
        ? { typeName: shirtItem.label, displayLabel: shirtItem.detail }
        : null,
      issuedOfficeKey: keyItem?.status === 'issued'
        ? { typeName: keyItem.label, displayLabel: keyItem.detail }
        : null,
      hasOfficeKey:
        keyItem?.status === 'issued' || keyItem?.status === 'has'
          ? 'yes'
          : keyItem?.status === 'requested'
            ? 'no'
            : normalizeYesNo(prefs.has_office_key),
      hasShirt:
        shirtItem?.status === 'issued' || shirtItem?.status === 'has'
          ? 'yes'
          : shirtItem?.status === 'requested'
            ? 'no'
            : normalizeYesNo(prefs.has_shirt),
      shirtGender: legacyPoloGenderToShirt(prefs.shirt_gender || prefs.shirtGender || ''),
      shirtSize: String(prefs.shirt || '').trim(),
      shirtSizeSecondary: String(prefs.shirt_secondary || prefs.shirtSecondary || '').trim(),
    };
  } catch {
    return {
      preferences: {},
      gearItems: buildGearItemStatuses({}),
      issuedShirt: null,
      issuedOfficeKey: null,
      hasOfficeKey: null,
      hasShirt: null,
      shirtGender: '',
      shirtSize: '',
      shirtSizeSecondary: '',
    };
  }
}

function inferMaterialsFromGearContext(gearContext = {}) {
  const out = {};
  const items = gearContext.gearItems || {};
  const applyYesNo = (key, hasField) => {
    const item = items[key];
    if (!item || item.status === 'unknown') return;
    if (item.status === 'issued' || item.status === 'has') out[hasField] = 'yes';
    if (item.status === 'requested') out[hasField] = 'no';
  };
  applyYesNo('office_key', 'has_office_key');
  applyYesNo('shirt', 'has_shirt');
  applyYesNo('itsco_name_tag', 'has_itsco_name_tag');
  applyYesNo('office_nametag', 'has_office_nametag');
  applyYesNo('itsco_lanyard', 'has_itsco_lanyard');
  applyYesNo('business_cards', 'has_business_cards');
  applyYesNo('canvas_bag', 'has_canvas_bag');
  const cart = items.school_cart;
  if (cart?.status === 'requested') out.school_cart = 'need';
  if (cart?.status === 'has' && String(cart.detail || '').includes('Does not need')) {
    out.school_cart = 'do_not_need';
  }
  if (gearContext.shirtGender) out.shirt_gender = gearContext.shirtGender;
  if (gearContext.shirtSize) out.shirt_size = gearContext.shirtSize;
  if (gearContext.shirtSizeSecondary) out.shirt_size_secondary = gearContext.shirtSizeSecondary;
  return out;
}

export async function syncMaterialsToUserGear({ agencyId, userId, materials, actorUserId }) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  if (!aid || !uid || !materials) return;
  const normalized = normalizeMaterialsPayload(materials);
  const existing = await getUserPreferences(aid, uid).catch(() => ({ preferences: {} }));
  const assignments = await listUserAssignments(aid, uid, { activeOnly: true }).catch(() => []);
  const gearItems = buildGearItemStatuses({ assignments, materials: normalized });
  const prefs = { ...(existing.preferences || {}) };
  const hasOfficeKey = normalizeYesNo(normalized.has_office_key);
  const hasShirt = normalizeYesNo(normalized.has_shirt);
  if (hasOfficeKey) {
    prefs.has_office_key = hasOfficeKey;
    prefs.needs_office_key = hasOfficeKey === 'no';
  }
  if (hasShirt) {
    prefs.has_shirt = hasShirt;
    prefs.needs_shirt = hasShirt === 'no';
  }
  if (hasShirt === 'no') {
    if (normalized.shirt_size) prefs.shirt = normalized.shirt_size;
    if (normalized.shirt_size_secondary) prefs.shirt_secondary = normalized.shirt_size_secondary;
    if (normalized.shirt_gender) prefs.shirt_gender = normalized.shirt_gender;
  }
  prefs.has_itsco_name_tag = normalized.has_itsco_name_tag;
  prefs.has_office_nametag = normalized.has_office_nametag;
  prefs.has_itsco_lanyard = normalized.has_itsco_lanyard;
  prefs.has_business_cards = normalized.has_business_cards;
  prefs.has_canvas_bag = normalized.has_canvas_bag;
  prefs.needs_itsco_name_tag = normalized.has_itsco_name_tag === 'no';
  prefs.needs_office_nametag = normalized.has_office_nametag === 'no';
  prefs.needs_itsco_lanyard = normalized.has_itsco_lanyard === 'no';
  prefs.needs_business_cards = normalized.has_business_cards === 'no';
  prefs.needs_canvas_bag = normalized.has_canvas_bag === 'no';
  prefs.gear_items = gearItems;
  prefs.pyu_materials = {
    school_cart: normalized.school_cart || null,
    has_office_key: hasOfficeKey,
    has_shirt: hasShirt,
    has_itsco_name_tag: normalized.has_itsco_name_tag,
    has_office_nametag: normalized.has_office_nametag,
    has_itsco_lanyard: normalized.has_itsco_lanyard,
    has_business_cards: normalized.has_business_cards,
    has_canvas_bag: normalized.has_canvas_bag,
    shirt_gender: normalized.shirt_gender || null,
    shirt_size: normalized.shirt_size || null,
    shirt_size_secondary: normalized.shirt_size_secondary || null,
    itsco_name_tag: Boolean(normalized.itsco_name_tag),
    office_nametag: Boolean(normalized.office_nametag),
    itsco_lanyard: Boolean(normalized.itsco_lanyard),
    business_cards: Boolean(normalized.business_cards),
    itsco_canvas_bag: Boolean(normalized.itsco_canvas_bag),
    materials_notes: String(normalized.materials_notes || '').trim() || null,
    updatedAt: new Date().toISOString(),
  };
  await setUserPreferences(aid, uid, prefs, actorUserId || uid);
}

/** @deprecated use loadShirtInventoryHint */
async function loadPoloInventoryHint(agencyId) {
  return loadShirtInventoryHint(agencyId);
}

export async function getOrCreateCycle({ agencyId, providerUserId, schoolYear }) {
  const year = schoolYear || currentSchoolYear();
  const [existing] = await pool.execute(
    `SELECT * FROM provider_year_update_cycles
     WHERE agency_id = ? AND provider_user_id = ? AND ${yearEq()}
     LIMIT 1`,
    [agencyId, providerUserId, year]
  );
  if (existing?.[0]) return existing[0];

  const [result] = await pool.execute(
    `INSERT INTO provider_year_update_cycles (agency_id, provider_user_id, school_year, status)
     VALUES (?, ?, ?, 'not_started')`,
    [agencyId, providerUserId, year]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_cycles WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  return rows[0];
}

export async function getCycleById(cycleId) {
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_cycles WHERE id = ? LIMIT 1`,
    [Number(cycleId)]
  );
  return rows?.[0] || null;
}

export async function createToken({ cycleId, agencyId, providerUserId, createdByUserId, expiresAt }) {
  const token = makeToken();
  const expires =
    expiresAt ||
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  await pool.execute(
    `INSERT INTO provider_year_update_tokens
      (token, cycle_id, agency_id, provider_user_id, created_by_user_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [token, cycleId, agencyId, providerUserId, createdByUserId || null, expires]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_tokens WHERE BINARY token = BINARY ? LIMIT 1`,
    [token]
  );
  return rows[0];
}

export async function ensureShareableToken({ agencyId, providerUserId, schoolYear, createdByUserId }) {
  const cycle = await getOrCreateCycle({ agencyId, providerUserId, schoolYear });
  const [existing] = await pool.execute(
    `SELECT * FROM provider_year_update_tokens
     WHERE cycle_id = ?
       AND expires_at > NOW()
     ORDER BY (locked_at IS NULL) DESC, id DESC
     LIMIT 1`,
    [cycle.id]
  );
  if (existing?.[0]) {
    return { cycle, tokenRow: existing[0], created: false };
  }
  const tokenRow = await createToken({
    cycleId: cycle.id,
    agencyId,
    providerUserId,
    createdByUserId,
  });
  return { cycle, tokenRow, created: true };
}

export async function pushCampaign({ agencyId, schoolYear, userId }) {
  const year = schoolYear || currentSchoolYear();
  let campaign = await getCampaign(agencyId, year);
  if (campaignIsDisabled(campaign)) {
    const err = new Error('Re-enable Provider Year Update before pushing to providers.');
    err.status = 400;
    throw err;
  }
  if (!campaign || campaign.status === 'draft') {
    const enabled = await enableCampaign({ agencyId, schoolYear: year, userId });
    campaign = enabled.campaign;
  }

  const providers = await listSchoolAssignedProviders(agencyId);
  let tokensCreated = 0;
  let providersReady = 0;
  for (const p of providers) {
    const providerUserId = Number(p.provider_user_id);
    if (!providerUserId) continue;
    const { cycle, created } = await ensureShareableToken({
      agencyId,
      providerUserId,
      schoolYear: year,
      createdByUserId: userId,
    });
    if (cycle?.id) await markCyclePushed(cycle.id, userId);
    providersReady += 1;
    if (created) tokensCreated += 1;
  }

  await pool.execute(
    `UPDATE provider_year_update_campaigns
     SET status = 'pushed',
         pushed_at = NOW(),
         pushed_by_user_id = ?,
         enabled_at = COALESCE(enabled_at, NOW()),
         enabled_by_user_id = COALESCE(enabled_by_user_id, ?)
     WHERE agency_id = ? AND ${yearEq()}`,
    [userId || null, userId || null, agencyId, year]
  );

  return {
    campaign: await getCampaign(agencyId, year),
    providersReady,
    tokensCreated,
    providerCount: providers.length,
  };
}

/**
 * Push Year Update to a single provider (My Dashboard visible).
 * Requires campaign enabled and an existing shareable link (Get link first).
 */
export async function pushProvider({ agencyId, providerUserId, schoolYear, userId }) {
  const year = schoolYear || currentSchoolYear();
  const campaign = await getCampaign(agencyId, year);
  if (campaignIsDisabled(campaign)) {
    const err = new Error('Provider Year Update is disabled for this school year.');
    err.status = 400;
    throw err;
  }
  if (!campaignIsEnabled(campaign)) {
    const err = new Error('Enable Provider Year Update first before pushing to a provider.');
    err.status = 400;
    throw err;
  }

  const cycle = await getOrCreateCycle({ agencyId, providerUserId, schoolYear: year });
  const [tokRows] = await pool.execute(
    `SELECT id FROM provider_year_update_tokens
     WHERE cycle_id = ?
       AND expires_at > NOW()
     ORDER BY (locked_at IS NULL) DESC, id DESC
     LIMIT 1`,
    [cycle.id]
  );
  if (!tokRows?.[0]) {
    const err = new Error('Generate a shareable link (Get link) before pushing to this provider.');
    err.status = 400;
    throw err;
  }

  if (cycle.pushed_at) {
    return {
      alreadyPushed: true,
      cycle,
      campaign,
      tokenId: tokRows[0].id,
    };
  }

  const updated = await markCyclePushed(cycle.id, userId);
  return {
    alreadyPushed: false,
    cycle: updated,
    campaign,
    tokenId: tokRows[0].id,
  };
}

export async function validateToken(tokenRaw) {
  const token = String(tokenRaw || '').trim();
  if (!token) return { valid: false, reason: 'missing' };
  const [rows] = await pool.execute(
    `SELECT t.*, c.status AS cycle_status, c.school_year, c.snapshot_json,
            u.first_name, u.last_name, u.email,
            ag.name AS agency_name, ag.logo_url AS agency_logo_url, ag.slug AS agency_slug
     FROM provider_year_update_tokens t
     JOIN provider_year_update_cycles c ON c.id = t.cycle_id
     JOIN users u ON u.id = t.provider_user_id
     JOIN agencies ag ON ag.id = t.agency_id
     WHERE BINARY t.token = BINARY ?
     LIMIT 1`,
    [token]
  );
  const row = rows?.[0];
  if (!row) return { valid: false, reason: 'not_found' };
  const exp = row.expires_at ? new Date(row.expires_at) : null;
  if (exp && exp.getTime() < Date.now() && row.cycle_status !== 'finalized') {
    return { valid: false, reason: 'expired', row };
  }
  return { valid: true, row };
}

export async function recordTokenClick(tokenRow, actorDisplayName = null) {
  await pool.execute(
    `UPDATE provider_year_update_tokens
     SET click_count = click_count + 1, last_viewed_at = NOW()
     WHERE id = ?`,
    [tokenRow.id]
  );
  await pool.execute(
    `INSERT INTO provider_year_update_view_events
      (cycle_id, token_id, actor_display_name, event_type)
     VALUES (?, ?, ?, 'token_click')`,
    [tokenRow.cycle_id, tokenRow.id, actorDisplayName || null]
  );
}

export async function recordViewEvent({
  cycleId,
  tokenId = null,
  userId = null,
  actorDisplayName = null,
  sectionKey = null,
  eventType = 'view',
}) {
  await pool.execute(
    `INSERT INTO provider_year_update_view_events
      (cycle_id, token_id, user_id, actor_display_name, section_key, event_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [cycleId, tokenId, userId, actorDisplayName, sectionKey, eventType]
  );
}

export async function markTokenSent(tokenId, userId, sent = true) {
  if (sent) {
    await pool.execute(
      `UPDATE provider_year_update_tokens
       SET marked_sent_at = NOW(), marked_sent_by_user_id = ?
       WHERE id = ?`,
      [userId, tokenId]
    );
  } else {
    await pool.execute(
      `UPDATE provider_year_update_tokens
       SET marked_sent_at = NULL, marked_sent_by_user_id = NULL
       WHERE id = ?`,
      [tokenId]
    );
  }
}

export async function lockTokensForCycle(cycleId) {
  await pool.execute(
    `UPDATE provider_year_update_tokens SET locked_at = NOW()
     WHERE cycle_id = ? AND locked_at IS NULL`,
    [cycleId]
  );
}

function defaultRemindersData() {
  return {
    items: DEFAULT_REMINDER_ITEMS.map((item) => ({
      key: item.key,
      title: item.title,
      body: item.body,
      mode: item.mode,
      reviewed: false,
      completed: false,
      reviewedAt: null,
      completedAt: null,
    })),
  };
}

/** Keep saved review state but always use current default copy/mode (e.g. BTS items → review-only). */
function mergeRemindersWithDefaults(savedData) {
  const savedItems = Array.isArray(savedData?.items) ? savedData.items : [];
  const savedByKey = new Map(savedItems.map((item) => [item.key, item]));
  const legacyBtsSignUp = savedByKey.get('bts_sign_up');
  return {
    items: DEFAULT_REMINDER_ITEMS.map((def) => {
      const saved = savedByKey.get(def.key) || {};
      let wasAcknowledged = Boolean(saved.reviewed || saved.completed);
      if (def.key === 'bts_check_events' && legacyBtsSignUp) {
        wasAcknowledged =
          wasAcknowledged || Boolean(legacyBtsSignUp.reviewed || legacyBtsSignUp.completed);
      }
      return {
        key: def.key,
        title: def.title,
        body: def.body,
        mode: def.mode,
        reviewed: def.mode === 'reviewed' ? wasAcknowledged : Boolean(saved.reviewed),
        completed: def.mode === 'complete' ? Boolean(saved.completed) : false,
        reviewedAt: saved.reviewedAt || null,
        completedAt: saved.completedAt || null,
      };
    }),
  };
}

function normalizeLicenseDateYmd(value) {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

async function loadUserInfoFieldsByKeys(userId, fieldKeys) {
  const keys = [...new Set((fieldKeys || []).filter(Boolean))];
  if (!keys.length) return new Map();
  const placeholders = keys.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT uifd.field_key, uiv.value
     FROM user_info_values uiv
     JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
     WHERE uiv.user_id = ? AND uifd.field_key IN (${placeholders})`,
    [userId, ...keys]
  );
  return new Map((rows || []).map((r) => [r.field_key, r.value]));
}

function firstNonEmptyField(map, keys) {
  for (const k of keys || []) {
    const v = String(map.get(k) ?? '').trim();
    if (v) return v;
  }
  return '';
}

export async function loadProviderCredentialContext(userId) {
  const uid = Number(userId);
  const [userRows] = await pool.execute(
    `SELECT id, role, credential FROM users WHERE id = ? LIMIT 1`,
    [uid]
  );
  const user = userRows?.[0];
  const allKeys = [...new Set(Object.values(LICENSE_INFO_FIELD_KEYS).flat())];
  const fields = await loadUserInfoFieldsByKeys(uid, allKeys);
  return {
    userId: uid,
    role: user?.role || null,
    credential: user?.credential || null,
    licenseTypeNumber: firstNonEmptyField(fields, LICENSE_INFO_FIELD_KEYS.typeNumber),
  };
}

export async function providerRequiresLicensesSection(userId, agencyId) {
  const ctx = await loadProviderCredentialContext(userId);
  return requiresProviderYearUpdateLicensesSection(ctx);
}

export async function effectiveSectionKeysForProvider(userId, agencyId) {
  const required = await providerRequiresLicensesSection(userId, agencyId);
  if (!required) return SECTION_KEYS.filter((k) => k !== 'licenses');
  return [...SECTION_KEYS];
}

export async function loadLicenseContextForProvider(userId, agencyId) {
  const ctx = await loadProviderCredentialContext(userId);
  const required = requiresProviderYearUpdateLicensesSection(ctx);
  if (!required) return { required: false };

  const allKeys = [...new Set(Object.values(LICENSE_INFO_FIELD_KEYS).flat())];
  const fieldMap = await loadUserInfoFieldsByKeys(userId, allKeys);
  const licenseTypeNumber = firstNonEmptyField(fieldMap, LICENSE_INFO_FIELD_KEYS.typeNumber);
  const issuedDate = normalizeLicenseDateYmd(
    firstNonEmptyField(fieldMap, LICENSE_INFO_FIELD_KEYS.issuedDate)
  );
  const expirationDate = normalizeLicenseDateYmd(
    firstNonEmptyField(fieldMap, LICENSE_INFO_FIELD_KEYS.expirationDate)
  );
  const uploadPath = firstNonEmptyField(fieldMap, LICENSE_INFO_FIELD_KEYS.upload);

  const [docRows] = await pool.execute(
    `SELECT id, file_path, expiration_date, created_at
     FROM user_compliance_documents
     WHERE user_id = ? AND LOWER(document_type) IN ('license', 'license_upload')
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  const doc = docRows?.[0] || null;
  const hasPdf = Boolean(doc?.file_path || uploadPath);
  const pdfUrl = doc?.file_path
    ? publicUploadsUrlFromStoredPath(doc.file_path)
    : uploadPath
      ? publicUploadsUrlFromStoredPath(uploadPath)
      : null;

  await syncFederalBackgroundExpiration(userId, { preferredAgencyId: agencyId }).catch(() => null);
  const expirationYears = await getExpirationYearsForUser(userId, agencyId);
  const [bgRows] = await pool.execute(
    `SELECT ulci.is_completed, ulci.completed_at, ulci.expires_at
     FROM user_lifecycle_checklist_items ulci
     JOIN lifecycle_checklist_definitions lcd ON lcd.id = ulci.definition_id
     WHERE ulci.user_id = ? AND lcd.item_key = ?
     LIMIT 1`,
    [userId, FEDERAL_BG_ITEM_KEY]
  );
  const bg = bgRows?.[0] || null;
  const completedAt = bg?.completed_at ? normalizeLicenseDateYmd(bg.completed_at) : null;
  let expiresAt = bg?.expires_at ? normalizeLicenseDateYmd(bg.expires_at) : null;
  if (!expiresAt && completedAt) {
    expiresAt = computeExpiresAt(completedAt, expirationYears);
  }
  const bgStatus = expirationStatus(expiresAt);

  const missingFields = [];
  if (!licenseTypeNumber) missingFields.push('license_type_number');
  if (!issuedDate) missingFields.push('issued_date');
  if (!expirationDate) missingFields.push('expiration_date');
  if (!hasPdf) missingFields.push('license_pdf');

  return {
    required: true,
    credential: ctx.credential || null,
    licenseTypeNumber,
    issuedDate,
    expirationDate,
    hasPdf,
    pdfUrl,
    pdfUploadedAt: doc?.created_at || null,
    missingFields,
    backgroundCheck: {
      isCompleted: Boolean(bg?.is_completed),
      completedAt,
      expiresAt,
      expirationYears,
      status: bgStatus?.status || (expiresAt ? 'unknown' : 'missing'),
      label: bgStatus?.label || (expiresAt ? '' : 'Not on file'),
      daysUntilExpiration: bgStatus?.days ?? null,
      capturedAt: new Date().toISOString(),
    },
  };
}

async function upsertUserInfoFieldByKey(userId, fieldKey, value) {
  const [defRows] = await pool.execute(
    `SELECT id FROM user_info_field_definitions WHERE field_key = ? AND agency_id IS NULL LIMIT 1`,
    [fieldKey]
  );
  const defId = defRows?.[0]?.id;
  if (!defId) return false;
  await pool.execute(
    `INSERT INTO user_info_values (user_id, field_definition_id, value)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [userId, defId, String(value ?? '').trim()]
  );
  return true;
}

async function syncLicenseFieldsFromSectionData(userId, data) {
  if (!data || typeof data !== 'object') return;
  const writes = [];
  if (data.licenseTypeNumber != null) {
    writes.push(['provider_credential_license_type_number', data.licenseTypeNumber]);
  }
  if (data.issuedDate != null) {
    writes.push(['provider_credential_license_issued_date', data.issuedDate]);
  }
  if (data.expirationDate != null) {
    writes.push(['provider_credential_license_expiration_date', data.expirationDate]);
  }
  for (const [key, val] of writes) {
    const v = key.includes('date') ? normalizeLicenseDateYmd(val) : String(val ?? '').trim();
    if (!v) continue;
    await upsertUserInfoFieldByKey(userId, key, v);
  }
  await consolidateLicenseFieldAliasesForUser(userId).catch(() => null);
}

function validateLicensesSectionCompletion(data, licenseContext) {
  const errs = [];
  const typeNumber = String(
    data?.licenseTypeNumber ?? licenseContext.licenseTypeNumber ?? ''
  ).trim();
  const issued = normalizeLicenseDateYmd(data?.issuedDate ?? licenseContext.issuedDate);
  const expires = normalizeLicenseDateYmd(data?.expirationDate ?? licenseContext.expirationDate);

  if (!typeNumber) errs.push('License type and number are required.');
  if (!issued) errs.push('License issued date is required.');
  if (!expires) errs.push('License expiration date is required.');
  if (!licenseContext.hasPdf) errs.push('License PDF must be uploaded.');
  if (!data?.licenseConfirmed) {
    errs.push('Please confirm your license information is accurate.');
  }
  if (!data?.backgroundCheckConfirmed) {
    errs.push('Please confirm your federal background check expiration date.');
  }
  if (licenseContext.backgroundCheck?.status === 'expired' && !data?.backgroundCheckRenewalAcknowledged) {
    errs.push(
      'Please acknowledge that you will complete a new background check and submit reimbursement through the app.'
    );
  }
  return errs;
}

export async function getSectionProgress(cycleId) {
  const cycle = await getCycleById(cycleId);
  if (!cycle) return [];
  const keys = await effectiveSectionKeysForProvider(cycle.provider_user_id, cycle.agency_id);
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_section_progress WHERE cycle_id = ?`,
    [cycleId]
  );
  const byKey = new Map((rows || []).map((r) => [r.section_key, r]));
  return keys.map((key) => {
    const row = byKey.get(key);
    let data = null;
    if (row?.data_json) {
      data = parseJsonField(row.data_json);
    }
    if (key === 'reminders' && (!data || !Array.isArray(data.items))) {
      data = defaultRemindersData();
    }
    return {
      sectionKey: key,
      reviewed: Boolean(row?.reviewed),
      reviewedAt: row?.reviewed_at || null,
      reviewedByDisplayName: row?.reviewed_by_display_name || null,
      completed: Boolean(row?.completed),
      data,
    };
  });
}

export async function upsertSectionProgress({
  cycleId,
  sectionKey,
  data,
  reviewed,
  completed,
  actor,
}) {
  const cycle = await getCycleById(cycleId);
  if (!cycle) throw new Error('Cycle not found');
  const effectiveKeys = await effectiveSectionKeysForProvider(
    cycle.provider_user_id,
    cycle.agency_id
  );
  if (!SECTION_KEYS.includes(sectionKey)) throw new Error('Invalid section_key');
  if (!effectiveKeys.includes(sectionKey)) {
    throw Object.assign(new Error('Section not applicable for this provider'), { status: 400 });
  }

  let sectionData = data;
  if (sectionKey === 'licenses') {
    const licenseContext = await loadLicenseContextForProvider(
      cycle.provider_user_id,
      cycle.agency_id
    );
    const markingDone = Boolean(reviewed || completed);
    if (markingDone) {
      const errs = validateLicensesSectionCompletion(data, licenseContext);
      if (errs.length) {
        throw Object.assign(new Error(errs[0]), { status: 400, details: errs });
      }
    }
    if (sectionData && typeof sectionData === 'object') {
      await syncLicenseFieldsFromSectionData(cycle.provider_user_id, sectionData);
      sectionData = {
        ...sectionData,
        backgroundCheckSnapshot: licenseContext.backgroundCheck,
      };
    }
  }

  const [existing] = await pool.execute(
    `SELECT id FROM provider_year_update_section_progress WHERE cycle_id = ? AND section_key = ? LIMIT 1`,
    [cycleId, sectionKey]
  );
  const dataJson = sectionData !== undefined ? JSON.stringify(sectionData) : null;
  const reviewedVal = reviewed ? 1 : 0;
  const completedVal = completed !== undefined ? (completed ? 1 : 0) : reviewedVal;

  if (existing?.[0]) {
    await pool.execute(
      `UPDATE provider_year_update_section_progress
       SET data_json = COALESCE(?, data_json),
           reviewed = ?,
           reviewed_at = CASE WHEN ? = 1 THEN NOW() ELSE reviewed_at END,
           reviewed_by_actor_type = CASE WHEN ? = 1 THEN ? ELSE reviewed_by_actor_type END,
           reviewed_by_user_id = CASE WHEN ? = 1 THEN ? ELSE reviewed_by_user_id END,
           reviewed_by_display_name = CASE WHEN ? = 1 THEN ? ELSE reviewed_by_display_name END,
           completed = ?
       WHERE id = ?`,
      [
        dataJson,
        reviewedVal,
        reviewedVal,
        reviewedVal,
        actor?.actorType || null,
        reviewedVal,
        actor?.userId || null,
        reviewedVal,
        actor?.displayName || null,
        completedVal,
        existing[0].id,
      ]
    );
  } else {
    await pool.execute(
      `INSERT INTO provider_year_update_section_progress
        (cycle_id, section_key, reviewed, reviewed_at, reviewed_by_actor_type, reviewed_by_user_id,
         reviewed_by_display_name, completed, data_json)
       VALUES (?, ?, ?, ${reviewed ? 'NOW()' : 'NULL'}, ?, ?, ?, ?, ?)`,
      [
        cycleId,
        sectionKey,
        reviewedVal,
        actor?.actorType || null,
        actor?.userId || null,
        actor?.displayName || null,
        completedVal,
        dataJson,
      ]
    );
  }

  await pool.execute(
    `UPDATE provider_year_update_cycles SET status = 'in_progress'
     WHERE id = ? AND status = 'not_started'`,
    [cycleId]
  );

  if (sectionKey === 'materials' && data && typeof data === 'object') {
    const cycle = await getCycleById(cycleId);
    if (cycle?.agency_id && cycle?.provider_user_id) {
      const normalized = normalizeMaterialsPayload(data);
      await syncMaterialsToUserGear({
        agencyId: cycle.agency_id,
        userId: cycle.provider_user_id,
        materials: normalized,
        actorUserId: actor?.userId || cycle.provider_user_id,
      });
    }
  }

  return getSectionProgress(cycleId);
}

export async function buildDashboardPayload(cycle) {
  const sections = await getSectionProgress(cycle.id);
  const schedule = await loadProviderSchoolSchedule(cycle.provider_user_id, cycle.agency_id);
  const pendingScheduleAdjustments = await loadProviderPendingScheduleAdjustments(
    cycle.provider_user_id,
    cycle.agency_id
  );
  const eventsBySchool = await loadProviderSchoolEvents(cycle.provider_user_id, cycle.agency_id);
  const clientsWithoutDay = await loadProviderClientsWithoutDay(
    cycle.provider_user_id,
    cycle.agency_id
  );
  const poloInventory = await loadShirtInventoryHint(cycle.agency_id);
  const gearMaterialsContext = await loadUserGearMaterialsContext(
    cycle.agency_id,
    cycle.provider_user_id
  );
  const [agencyRows] = await pool.execute(
    `SELECT a.id, a.name, a.logo_url, a.logo_path, a.color_palette, a.slug, a.portal_url,
            i.file_path AS icon_file_path
     FROM agencies a
     LEFT JOIN icons i ON i.id = a.icon_id
     WHERE a.id = ?
     LIMIT 1`,
    [cycle.agency_id]
  );
  const [userRows] = await pool.execute(
    `SELECT id, first_name, last_name, email, profile_photo_path FROM users WHERE id = ? LIMIT 1`,
    [cycle.provider_user_id]
  );
  const agency = agencyRows?.[0] || null;
  const provider = userRows?.[0] || null;
  const byKey = Object.fromEntries(sections.map((s) => [s.sectionKey, s]));
  const materials = normalizeMaterialsPayload({
    ...defaultMaterialsData(provider),
    ...inferMaterialsFromGearContext(gearMaterialsContext),
    ...(byKey.materials?.data || {}),
  });
  const gearAssignments = await listUserAssignments(cycle.agency_id, cycle.provider_user_id, {
    activeOnly: true,
  }).catch(() => []);
  const gearItems = buildGearItemStatuses({ assignments: gearAssignments, materials });
  const gearContextWithItems = { ...gearMaterialsContext, gearItems };
  const sectionKeys = await effectiveSectionKeysForProvider(
    cycle.provider_user_id,
    cycle.agency_id
  );
  const licenseContext = await loadLicenseContextForProvider(
    cycle.provider_user_id,
    cycle.agency_id
  );

  return {
    cycle: {
      id: cycle.id,
      agencyId: cycle.agency_id,
      providerUserId: cycle.provider_user_id,
      schoolYear: cycle.school_year,
      status: cycle.status,
      finalizedAt: cycle.finalized_at || null,
      snapshot: parseJsonField(cycle.snapshot_json),
    },
    agency: agency
      ? {
          id: agency.id,
          name: agency.name,
          logoUrl: agency.logo_url || null,
          logoPath: agency.logo_path || null,
          iconFilePath: agency.icon_file_path || null,
          colorPalette: agency.color_palette || null,
          slug: agency.slug || agency.portal_url || null,
        }
      : null,
    provider: provider
      ? {
          id: provider.id,
          firstName: provider.first_name,
          lastName: provider.last_name,
          name: [provider.first_name, provider.last_name].filter(Boolean).join(' ') || provider.email,
          email: provider.email,
          photoUrl: publicUploadsUrlFromStoredPath(provider.profile_photo_path),
        }
      : null,
    sections,
    sectionKeys,
    licenseContext,
    reminderDefaults: DEFAULT_REMINDER_ITEMS,
    reminders: mergeRemindersWithDefaults(byKey.reminders?.data),
    materials,
    schoolCartDisclaimer: SCHOOL_CART_DISCLAIMER,
    shirtInventory: poloInventory,
    poloInventory,
    gearMaterialsContext: gearContextWithItems,
    gearItems,
    schedule,
    pendingScheduleAdjustments,
    eventsBySchool,
    clientsWithoutDay,
    kioskPath: '/itsco/school-events/kiosk',
  };
}

export async function finalizeCycle({ cycleId, actor }) {
  const cycle = await getCycleById(cycleId);
  if (!cycle) throw new Error('Cycle not found');
  if (cycle.status === 'finalized') throw new Error('Already finalized');

  const sections = await getSectionProgress(cycleId);
  const incomplete = sections.filter((s) => !s.reviewed && !s.completed);
  if (incomplete.length) {
    throw new Error(`Sections not reviewed: ${incomplete.map((s) => s.sectionKey).join(', ')}`);
  }

  const reminders = sections.find((s) => s.sectionKey === 'reminders')?.data;
  const items = Array.isArray(reminders?.items) ? reminders.items : [];
  for (const item of items) {
    const mode = item.mode || 'complete';
    if (mode === 'reviewed' && !item.reviewed && !item.completed) {
      throw new Error(`Reminder not reviewed: ${item.title || item.key}`);
    }
    if (mode === 'complete' && !item.completed) {
      throw new Error(`Reminder not completed: ${item.title || item.key}`);
    }
  }

  const payload = await buildDashboardPayload(cycle);
  const snapshot = {
    schoolYear: cycle.school_year,
    finalizedAt: new Date().toISOString(),
    reminders: payload.reminders,
    materials: payload.materials,
    licenseContext: payload.licenseContext,
    schedule: payload.schedule,
    eventsBySchool: payload.eventsBySchool,
    sections: Object.fromEntries(sections.map((s) => [s.sectionKey, s.data])),
  };

  await pool.execute(
    `UPDATE provider_year_update_cycles
     SET status = 'finalized',
         finalized_at = NOW(),
         finalized_by_actor_type = ?,
         finalized_by_user_id = ?,
         finalized_by_display_name = ?,
         snapshot_json = ?
     WHERE id = ?`,
    [
      actor?.actorType || null,
      actor?.userId || null,
      actor?.displayName || null,
      JSON.stringify(snapshot),
      cycleId,
    ]
  );
  await lockTokensForCycle(cycleId);
  return getCycleById(cycleId);
}

export async function dismissForUser(cycleId, userId, dismissUntil = null) {
  await pool.execute(
    `INSERT INTO provider_year_update_dismissals (cycle_id, user_id, dismissed_at, dismiss_until)
     VALUES (?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE dismissed_at = NOW(), dismiss_until = VALUES(dismiss_until)`,
    [cycleId, userId, dismissUntil]
  );
}

export async function getDismissal(cycleId, userId) {
  const [rows] = await pool.execute(
    `SELECT * FROM provider_year_update_dismissals WHERE cycle_id = ? AND user_id = ? LIMIT 1`,
    [cycleId, userId]
  );
  return rows?.[0] || null;
}

export async function listAgencyReport(agencyId, schoolYear) {
  const year = schoolYear || currentSchoolYear();
  const providers = await listSchoolAssignedProviders(agencyId);
  const out = [];

  for (const p of providers) {
    const providerUserId = Number(p.provider_user_id);
    if (!providerUserId) continue;

    const [cycles] = await pool.execute(
      `SELECT * FROM provider_year_update_cycles
       WHERE agency_id = ? AND provider_user_id = ? AND ${yearEq()}
       LIMIT 1`,
      [agencyId, providerUserId, year]
    );
    const cycle = cycles?.[0] || null;

    let sections = [];
    let tokens = [];
    let clickCount = 0;
    let sectionData = {};
    let schools = [];
    const effectiveKeys = await effectiveSectionKeysForProvider(providerUserId, agencyId);

    if (cycle) {
      sections = await getSectionProgress(cycle.id);
      const [tokRows] = await pool.execute(
        `SELECT id, token, marked_sent_at, locked_at, click_count, last_viewed_at, created_at, expires_at
         FROM provider_year_update_tokens WHERE cycle_id = ? ORDER BY id DESC`,
        [cycle.id]
      );
      tokens = tokRows || [];
      const tokenClicks = tokens.reduce((n, t) => n + Number(t.click_count || 0), 0);
      const [viewRows] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM provider_year_update_view_events
         WHERE cycle_id = ? AND event_type IN ('view', 'dashboard_view', 'token_click')`,
        [cycle.id]
      );
      const viewEvents = Number(viewRows?.[0]?.cnt || 0);
      // Prefer max so token_click rows do not double-count with click_count.
      clickCount = Math.max(tokenClicks, viewEvents);
      for (const s of sections) {
        if (s.data) sectionData[s.sectionKey] = s.data;
      }
      schools = await loadProviderSchoolSchedule(providerUserId, agencyId);
    } else {
      schools = await loadProviderSchoolSchedule(providerUserId, agencyId);
    }

    const reviewedCount = sections.filter((s) => s.reviewed || s.completed).length;
    const sectionTotal = effectiveKeys.length;
    const pct = sectionTotal ? Math.round((reviewedCount / sectionTotal) * 100) : 0;

    const lastTokenView = tokens.reduce((max, t) => {
      if (!t.last_viewed_at) return max;
      const ts = new Date(t.last_viewed_at).getTime();
      return Number.isNaN(ts) ? max : Math.max(max, ts);
    }, 0);
    const lastSectionReview = sections.reduce((max, s) => {
      if (!s.reviewedAt) return max;
      const ts = new Date(s.reviewedAt).getTime();
      return Number.isNaN(ts) ? max : Math.max(max, ts);
    }, 0);
    const lastActivityAt =
      lastTokenView || lastSectionReview
        ? new Date(Math.max(lastTokenView, lastSectionReview)).toISOString()
        : cycle?.updated_at || cycle?.finalized_at || null;

    const materials = sectionData.materials || {};
    const reminders = sectionData.reminders || {};
    const reminderItems = Array.isArray(reminders.items) ? reminders.items : [];
    const remindersDone = reminderItems.filter((i) => i.completed || i.reviewed).length;

    out.push({
      providerUserId,
      providerName: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      phone: p.personal_phone || p.work_phone || p.phone_number || null,
      photoUrl: publicUploadsUrlFromStoredPath(p.profile_photo_path),
      schools: schools.map((s) => ({
        schoolOrganizationId: s.schoolOrganizationId,
        schoolName: s.schoolName,
        dayCount: s.days?.length || 0,
      })),
      schoolNames: schools.map((s) => s.schoolName).filter(Boolean).join(', '),
      cycleId: cycle?.id || null,
      status: cycle?.status || 'not_started',
      started: Boolean(cycle && cycle.status !== 'not_started'),
      finalizedAt: cycle?.finalized_at || null,
      pushedAt: cycle?.pushed_at || null,
      isPushed: false, // filled below after campaign load
      sectionPercent: pct,
      reviewedCount,
      sectionTotal,
      sections,
      sectionKeys: effectiveKeys,
      tokenClickCount: clickCount,
      tokens,
      lastActivityAt,
      needSchoolCart:
        materials.school_cart === 'need' ||
        Boolean(materials.need_school_cart || materials.needSchoolCart),
      schoolCart: materials.school_cart || null,
      materialsNotes: materials.materials_notes || materials.materialsNotes || null,
      materialsRequests: {
        hasOfficeKey: normalizeYesNo(materials.has_office_key),
        needsOfficeKey: normalizeYesNo(materials.has_office_key) === 'no',
        hasShirt: normalizeYesNo(materials.has_shirt),
        needsShirt: normalizeYesNo(materials.has_shirt) === 'no',
        shirtGender: materials.shirt_gender || materials.polo_sex || null,
        shirtSize: materials.shirt_size || materials.polo_size || null,
        itscoNameTag: Boolean(materials.itsco_name_tag),
        officeNametag: Boolean(materials.office_nametag),
        itscoLanyard: Boolean(materials.itsco_lanyard),
        businessCards: Boolean(materials.business_cards),
        itscoPolo: Boolean(materials.itsco_polo) || normalizeYesNo(materials.has_shirt) === 'no',
        itscoCanvasBag: Boolean(materials.itsco_canvas_bag),
      },
      remindersDone,
      remindersTotal: reminderItems.length || DEFAULT_REMINDER_ITEMS.length,
      markedSent: tokens.some((t) => t.marked_sent_at),
      hasLink: tokens.some((t) => t.token && (!t.expires_at || new Date(t.expires_at) > new Date())),
    });
  }

  const campaign = await getOrCreateCampaign(agencyId, year);
  for (const row of out) {
    row.isPushed = cycleIsPushed({ pushed_at: row.pushedAt, status: row.status }, campaign);
    row.adminCompletedAt = null;
    if (campaignIsPushed(campaign) && !row.pushedAt && row.status !== 'finalized') {
      row.pushedAt = campaign.pushed_at || null;
    }
  }
  return {
    agencyId,
    schoolYear: year,
    providers: out,
    summary: {
      totalProviders: out.length,
      finalized: out.filter((r) => r.status === 'finalized').length,
      inProgress: out.filter((r) => r.status === 'in_progress').length,
      notStarted: out.filter((r) => r.status === 'not_started' || !r.status).length,
      totalTokenViews: out.reduce((n, r) => n + Number(r.tokenClickCount || 0), 0),
      needSchoolCartCount: out.filter((r) => r.needSchoolCart).length,
    },
    campaign: {
      status: campaign.status,
      enabledAt: campaign.enabled_at,
      pushedAt: campaign.pushed_at,
      disabledAt: campaign.disabled_at || null,
      isEnabled: campaignIsEnabled(campaign),
      isPushed: campaignIsPushed(campaign),
      isDisabled: campaignIsDisabled(campaign),
    },
  };
}

/** Status for My Dashboard / provider me endpoint. */
export async function getMyStatus({ agencyId, providerUserId, schoolYear }) {
  const year = schoolYear || currentSchoolYear();
  const campaign = await getCampaign(agencyId, year);
  const schools = await loadProviderSchoolSchedule(providerUserId, agencyId);

  const campaignPayload = campaign
    ? {
        status: campaign.status,
        isEnabled: campaignIsEnabled(campaign),
        isPushed: campaignIsPushed(campaign),
        isDisabled: campaignIsDisabled(campaign),
        pushedAt: campaign.pushed_at || null,
        disabledAt: campaign.disabled_at || null,
      }
    : null;

  if (campaignIsDisabled(campaign)) {
    return {
      available: false,
      reason: 'campaign_disabled',
      campaign: campaignPayload,
    };
  }

  const [cycleRows] = await pool.execute(
    `SELECT * FROM provider_year_update_cycles
     WHERE agency_id = ? AND provider_user_id = ? AND ${yearEq()}
     LIMIT 1`,
    [agencyId, providerUserId, year]
  );
  let cycle = cycleRows?.[0] || null;

  if (cycle?.admin_completed_at) {
    return {
      available: false,
      reason: 'admin_completed',
      campaign: campaignPayload,
      cycle: {
        id: cycle.id,
        status: cycle.status,
        schoolYear: cycle.school_year,
        finalizedAt: cycle.finalized_at || null,
        pushedAt: cycle.pushed_at || null,
        adminCompletedAt: cycle.admin_completed_at || null,
      },
    };
  }

  const userFinalized = cycle?.status === 'finalized';

  if (userFinalized) {
    const sectionTotal = (await effectiveSectionKeysForProvider(providerUserId, agencyId)).length;
    return {
      available: true,
      showPulse: false,
      showSplash: false,
      userFinalized: true,
      dismissed: false,
      allSectionsDone: true,
      campaign: campaignPayload,
      cycle: {
        id: cycle.id,
        status: cycle.status,
        schoolYear: cycle.school_year,
        finalizedAt: cycle.finalized_at || null,
        pushedAt: cycle.pushed_at || null,
        adminCompletedAt: null,
      },
      sectionPercent: 100,
      reviewedCount: sectionTotal,
      sectionTotal,
    };
  }

  const providerPushed = cycleIsPushed(cycle, campaign);

  if (!providerPushed) {
    return {
      available: false,
      reason: 'not_pushed',
      campaign: campaignPayload,
    };
  }

  if (!schools.length) {
    return {
      available: false,
      reason: 'no_school_assignments',
      campaign: campaignPayload,
    };
  }

  // Bulk-pushed campaigns may not have a cycle/token yet for this provider.
  const ensured = await ensureShareableToken({
    agencyId,
    providerUserId,
    schoolYear: year,
  });
  cycle = ensured.cycle;
  const tokenRow = ensured.tokenRow;
  if (campaignIsPushed(campaign) && !cycle.pushed_at) {
    cycle = await markCyclePushed(cycle.id, null);
  }

  const dismissal = await getDismissal(cycle.id, providerUserId);
  const dismissed =
    dismissal &&
    dismissal.dismiss_until &&
    new Date(dismissal.dismiss_until).getTime() > Date.now();

  const effectiveKeys = await effectiveSectionKeysForProvider(providerUserId, agencyId);
  const sections = await getSectionProgress(cycle.id);
  const reviewedCount = sections.filter((s) => s.reviewed || s.completed).length;
  const allSectionsDone =
    sections.length >= effectiveKeys.length &&
    effectiveKeys.every((key) => {
      const s = sections.find((x) => x.sectionKey === key);
      return Boolean(s?.reviewed || s?.completed);
    });

  return {
    available: true,
    showPulse: !allSectionsDone,
    showSplash: true,
    dismissed: Boolean(dismissed),
    userFinalized: false,
    allSectionsDone,
    campaign: {
      ...campaignPayload,
      status: campaign?.status || 'enabled',
      isEnabled: true,
      isPushed: true,
      pushedAt: campaign?.pushed_at || cycle.pushed_at || null,
    },
    cycle: {
      id: cycle.id,
      status: cycle.status,
      schoolYear: cycle.school_year,
      finalizedAt: cycle.finalized_at || null,
      pushedAt: cycle.pushed_at || null,
    },
    sectionPercent: effectiveKeys.length
      ? Math.round((reviewedCount / effectiveKeys.length) * 100)
      : 0,
    reviewedCount,
    sectionTotal: effectiveKeys.length,
    shareToken: tokenRow
      ? {
          token: tokenRow.token,
          tokenId: tokenRow.id,
          path: `/provider-year-update/${tokenRow.token}`,
        }
      : null,
  };
}
