/**
 * Collaborative School Fall Re-Initiation Workflow
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import {
  listSchoolEventsForOrg,
  schoolYearBounds,
} from './schoolPortalEvents.service.js';
import { notifySchoolCollaborativeYearUpdateCompleted } from './yearUpdateNotifications.service.js';

const PROVIDER_DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const SECTION_KEYS = [
  'school_events',
  'assigned_providers',
  'school_staff',
  'materials',
  'needs_assessment',
  'fall_check_in',
  'growth_feedback',
];

/** Surface school-facing UI starting August 1 of the cycle calendar year. */
export const REINIT_OPENS_MONTH = 8; // August
export const REINIT_OPENS_DAY = 1;
/** Temporary "View fall summary" button until September 1. */
export const RECEIPT_BUTTON_UNTIL_MONTH = 9;
export const RECEIPT_BUTTON_UNTIL_DAY = 1;

export const DEFAULT_QUESTIONS = [
  {
    question_key: 'need_paper_packets',
    section_key: 'materials',
    label: 'We need printed paper packets.',
    help_text: 'Check this if you need paper packets for families or staff.',
    input_type: 'boolean',
    required: 0,
    sort_order: 10,
  },
  {
    question_key: 'need_trifolds',
    section_key: 'materials',
    label: 'We need trifold brochures.',
    help_text: 'Check this if you need printed trifold brochures about our services.',
    input_type: 'boolean',
    required: 0,
    sort_order: 20,
  },
  {
    question_key: 'materials_delivery_required',
    section_key: 'materials',
    label: 'We need materials delivered to our school.',
    help_text: 'Check this if delivery / drop-off is required for materials.',
    input_type: 'boolean',
    required: 0,
    sort_order: 30,
  },
  {
    question_key: 'materials_notes',
    section_key: 'materials',
    label: 'Anything else we should know about your materials needs?',
    help_text: 'Quantities, timing, or other requests.',
    input_type: 'textarea',
    required: 0,
    sort_order: 40,
  },
  {
    question_key: 'days_per_week_onsite',
    section_key: 'needs_assessment',
    label: 'How many days per week will you need {agencyName} on-site?',
    help_text: 'Each full day on-site, a provider can typically see 5–7 clients. Example: 2 days ≈ 10–14 clients per week.',
    input_type: 'number',
    required: 1,
    sort_order: 10,
  },
  {
    question_key: 'provider_preferences',
    section_key: 'needs_assessment',
    label: 'Anything else about your provider or schedule needs?',
    help_text: 'e.g. need more/fewer days, Spanish-speaking clinician, preferred days, or other special requests.',
    input_type: 'textarea',
    required: 0,
    sort_order: 20,
  },
  {
    question_key: 'overall_satisfaction',
    section_key: 'growth_feedback',
    label: 'Overall, how satisfied are you with {agencyName}?',
    help_text: '1 = Poor · 5 = Excellent',
    input_type: 'likert',
    required: 1,
    sort_order: 5,
    options_json: [
      { value: 1, label: '1' },
      { value: 2, label: '2' },
      { value: 3, label: '3' },
      { value: 4, label: '4' },
      { value: 5, label: '5' },
    ],
  },
  {
    question_key: 'recommend_nps',
    section_key: 'growth_feedback',
    label: 'How likely are you to recommend {agencyName} to a colleague?',
    help_text: '0 = Not at all likely · 10 = Extremely likely',
    input_type: 'nps',
    required: 0,
    sort_order: 8,
    options_json: Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) })),
  },
  {
    question_key: 'looking_forward_to',
    section_key: 'growth_feedback',
    label: 'What are you looking forward to this year?',
    help_text: null,
    input_type: 'textarea',
    required: 0,
    sort_order: 10,
  },
  {
    question_key: 'marketing_quote',
    section_key: 'growth_feedback',
    label: 'Marketing quote we may share',
    help_text: 'A short quote about working with {agencyName}.',
    input_type: 'textarea',
    required: 0,
    sort_order: 20,
  },
  {
    question_key: 'marketing_quote_named',
    section_key: 'growth_feedback',
    label: 'Attribute this quote with your name?',
    help_text: 'If no, we will share it anonymously.',
    input_type: 'boolean',
    required: 0,
    sort_order: 30,
  },
  {
    question_key: 'district_contacts',
    section_key: 'growth_feedback',
    label: 'Internal or external district contacts to help {agencyName} grow',
    help_text: 'Names, roles, and emails if available.',
    input_type: 'textarea',
    required: 0,
    sort_order: 40,
  },
  {
    question_key: 'annual_feedback_more',
    section_key: 'growth_feedback',
    label: 'What should {agencyName} do more of?',
    help_text: 'Mark “All good” below if you have nothing to add.',
    input_type: 'textarea',
    required: 0,
    sort_order: 50,
  },
  {
    question_key: 'annual_feedback_less',
    section_key: 'growth_feedback',
    label: 'What should {agencyName} do less of?',
    help_text: null,
    input_type: 'textarea',
    required: 0,
    sort_order: 60,
  },
  {
    question_key: 'annual_feedback_all_good',
    section_key: 'growth_feedback',
    label: 'All good — nothing to add for annual feedback',
    help_text: 'Check this if you viewed the feedback prompts and have no notes.',
    input_type: 'boolean',
    required: 0,
    sort_order: 70,
  },
  {
    question_key: 'bts_partner_invited',
    section_key: 'school_events',
    label: 'Is {agencyName} invited to the Back-to-School event?',
    help_text: null,
    input_type: 'boolean',
    required: 0,
    sort_order: 10,
  },
  {
    question_key: 'bts_marketing_table',
    section_key: 'school_events',
    label: 'Can {agencyName} set up a marketing table?',
    help_text: null,
    input_type: 'boolean',
    required: 0,
    sort_order: 20,
  },
  {
    question_key: 'bts_active_signups',
    section_key: 'school_events',
    label: 'Are active sign-ups permitted at the event?',
    help_text: null,
    input_type: 'boolean',
    required: 0,
    sort_order: 30,
  },
  {
    question_key: 'first_day_of_school',
    section_key: 'school_events',
    label: 'First day of school',
    help_text: 'Confirm or update the first day of school (YYYY-MM-DD).',
    input_type: 'text',
    required: 1,
    sort_order: 5,
  },
  {
    question_key: 'fall_checkin_modality',
    section_key: 'fall_check_in',
    label: 'Check-in format',
    help_text: 'In person at the school is the default. Request virtual if needed.',
    input_type: 'select',
    required: 1,
    sort_order: 5,
    options_json: [
      { value: 'in_person', label: 'In person (at school)' },
      { value: 'virtual', label: 'Request virtual' },
    ],
  },
  {
    question_key: 'fall_checkin_slot_id',
    section_key: 'fall_check_in',
    label: 'Book a Fall School Check-In slot',
    help_text: 'Select an available pre-slot for your chosen format.',
    input_type: 'select',
    required: 1,
    sort_order: 10,
  },
  {
    question_key: 'fall_checkin_preferred_week',
    section_key: 'fall_check_in',
    label: 'Preferred week (if no preset slot)',
    help_text: 'e.g. week of Sept 8',
    input_type: 'text',
    required: 0,
    sort_order: 20,
  },
  {
    question_key: 'fall_checkin_preferred_day',
    section_key: 'fall_check_in',
    label: 'Preferred day',
    help_text: null,
    input_type: 'text',
    required: 0,
    sort_order: 30,
  },
  {
    question_key: 'fall_checkin_preferred_time',
    section_key: 'fall_check_in',
    label: 'Preferred time',
    help_text: null,
    input_type: 'text',
    required: 0,
    sort_order: 40,
  },
];

export function currentSchoolYear(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  // Fall year-update targets the school year starting the coming August.
  // From July onward we're prepping for that year (e.g. Jul 2026 → 2026-27).
  if (m >= 7) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

export function reinitWindowOpen(d = new Date()) {
  // Calendar hint only — staff splash is gated by campaign push, not this date.
  const year = currentSchoolYear(d);
  const startYear = Number(String(year).slice(0, 4));
  const openAt = new Date(startYear, REINIT_OPENS_MONTH - 1, REINIT_OPENS_DAY, 0, 0, 0);
  return d.getTime() >= openAt.getTime();
}

/** Avoid collation clash between connection (0900) and school_reinit tables (unicode_ci until mig 1035). */
function yearEq(columnSql = 'school_year') {
  return `${columnSql} COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
}

export async function getCampaign(agencyId, schoolYear) {
  const year = schoolYear || currentSchoolYear();
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_campaigns
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
    `INSERT INTO school_reinit_campaigns (agency_id, school_year, status)
     VALUES (?, ?, 'draft')`,
    [agencyId, year]
  );
  const [rows] = await pool.execute(`SELECT * FROM school_reinit_campaigns WHERE id = ? LIMIT 1`, [
    result.insertId,
  ]);
  return rows[0];
}

/** Enable Year Update — unlock questionnaire prep for the school year. */
export async function enableCampaign({ agencyId, schoolYear, userId }) {
  const year = schoolYear || currentSchoolYear();
  await ensureDefaultQuestions(agencyId, year);
  const campaign = await getOrCreateCampaign(agencyId, year);
  if (campaign.status === 'pushed') {
    return { campaign, alreadyPushed: true };
  }
  if (campaign.status === 'enabled') {
    return { campaign, alreadyEnabled: true };
  }
  await pool.execute(
    `UPDATE school_reinit_campaigns
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

/** Disable School Year Update for the school year — hides splash and School Management tab. */
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
    `UPDATE school_reinit_campaigns
     SET status = 'disabled',
         disabled_at = NOW(),
         disabled_by_user_id = ?
     WHERE id = ?`,
    [userId || null, campaign.id]
  );
  return { campaign: await getCampaign(agencyId, year), alreadyDisabled: false };
}

/**
 * Push to Schools — create cycles + share tokens for all affiliated schools
 * and activate the login splash (dismissible).
 */
export async function pushCampaign({ agencyId, schoolYear, userId }) {
  const year = schoolYear || currentSchoolYear();
  let campaign = await getCampaign(agencyId, year);
  if (campaignIsDisabled(campaign)) {
    const err = new Error('Re-enable School Year Update before pushing to schools.');
    err.status = 400;
    throw err;
  }
  if (!campaign || campaign.status === 'draft') {
    const enabled = await enableCampaign({ agencyId, schoolYear: year, userId });
    campaign = enabled.campaign;
  }

  await ensureDefaultQuestions(agencyId, year);

  const affiliated = await OrganizationAffiliation.listActiveOrganizationsForAgency(agencyId);
  const schools = (affiliated || []).filter((o) => {
    const t = String(o.organization_type || o.type || '').toLowerCase();
    return !t || t === 'school' || t === 'program' || t === 'learning';
  });

  let tokensCreated = 0;
  let schoolsReady = 0;
  for (const school of schools) {
    const schoolId = Number(school.id || school.organization_id);
    if (!schoolId) continue;
    const { cycle, tokenRow, created } = await ensureShareableToken({
      agencyId,
      schoolOrganizationId: schoolId,
      schoolYear: year,
      createdByUserId: userId,
    });
    if (cycle?.id) await markCyclePushed(cycle.id, userId);
    schoolsReady += 1;
    if (created) tokensCreated += 1;
    if (tokenRow) {
      /* token ensured */
    }
  }

  await pool.execute(
    `UPDATE school_reinit_campaigns
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
    schoolsReady,
    tokensCreated,
    schoolCount: schools.length,
  };
}

export function campaignIsPushed(campaign) {
  return String(campaign?.status || '') === 'pushed';
}

export function campaignIsDisabled(campaign) {
  return String(campaign?.status || '') === 'disabled';
}

export function campaignIsEnabled(campaign) {
  const s = String(campaign?.status || '');
  return s === 'enabled' || s === 'pushed';
}

/** School staff see the collaborative update splash when bulk-pushed or this cycle was pushed. */
export function cycleIsPushed(cycle, campaign = null) {
  if (campaignIsDisabled(campaign)) return false;
  if (String(cycle?.status || '') === 'finalized') return false;
  if (cycle?.pushed_at) return true;
  if (campaignIsPushed(campaign)) return true;
  return false;
}

export async function markCyclePushed(cycleId, userId) {
  await pool.execute(
    `UPDATE school_reinit_cycles
     SET pushed_at = COALESCE(pushed_at, NOW()),
         pushed_by_user_id = COALESCE(pushed_by_user_id, ?)
     WHERE id = ?`,
    [userId || null, cycleId]
  );
  return getCycleById(cycleId);
}

export async function getCycle({ agencyId, schoolOrganizationId, schoolYear }) {
  const year = schoolYear || currentSchoolYear();
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_cycles
     WHERE agency_id = ? AND school_organization_id = ? AND ${yearEq()}
     LIMIT 1`,
    [agencyId, schoolOrganizationId, year]
  );
  return rows?.[0] || null;
}

/**
 * Push collaborative Year Update to a single school (login splash visible).
 * Requires campaign enabled and an existing shareable link (generate link first).
 */
export async function pushSchool({ agencyId, schoolOrganizationId, schoolYear, userId }) {
  const year = schoolYear || currentSchoolYear();
  const campaign = await getCampaign(agencyId, year);
  if (campaignIsDisabled(campaign)) {
    const err = new Error('School Year Update is disabled for this school year.');
    err.status = 400;
    throw err;
  }
  if (!campaignIsEnabled(campaign)) {
    const err = new Error('Enable School Year Update first before pushing to a school.');
    err.status = 400;
    throw err;
  }
  const affiliated = await assertSchoolAffiliated(agencyId, schoolOrganizationId);
  if (!affiliated) {
    const err = new Error('School is not affiliated with this agency.');
    err.status = 400;
    throw err;
  }

  const cycle = await getOrCreateCycle({ agencyId, schoolOrganizationId, schoolYear: year });
  const [tokRows] = await pool.execute(
    `SELECT id FROM school_reinit_tokens
     WHERE cycle_id = ?
       AND expires_at > NOW()
     ORDER BY (locked_at IS NULL) DESC, id DESC
     LIMIT 1`,
    [cycle.id]
  );
  if (!tokRows?.[0]) {
    const err = new Error('Generate a shareable link before pushing to this school.');
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

export function receiptButtonVisible(d = new Date()) {
  const year = currentSchoolYear(d);
  const startYear = Number(String(year).slice(0, 4));
  const until = new Date(startYear, RECEIPT_BUTTON_UNTIL_MONTH - 1, RECEIPT_BUTTON_UNTIL_DAY, 0, 0, 0);
  // Button visible from finalize through Sep 1 of the school-year start calendar year
  // e.g. 2026-27 cycle → until Sep 1 2026. If we're past that, hide.
  // Actually plan says "until September 1" after finalize for fall — so for fall 2026, Sep 1 2026.
  return d.getTime() < until.getTime() || (d.getMonth() + 1 < RECEIPT_BUTTON_UNTIL_MONTH);
}

/** Receipt retrieval button: show if finalized and today is on/before Sep 1 of the cycle start year. */
export function canShowReceiptButton(cycle, d = new Date()) {
  if (!cycle || cycle.status !== 'finalized') return false;
  const startYear = Number(String(cycle.school_year || '').slice(0, 4));
  if (!startYear) return false;
  const until = new Date(startYear, RECEIPT_BUTTON_UNTIL_MONTH - 1, RECEIPT_BUTTON_UNTIL_DAY, 23, 59, 59);
  return d.getTime() <= until.getTime();
}

export function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

export async function assertSchoolAffiliated(agencyId, schoolOrganizationId) {
  const affiliated = await OrganizationAffiliation.listActiveOrganizationsForAgency(agencyId);
  return (affiliated || []).some((o) => Number(o.id || o.organization_id) === Number(schoolOrganizationId));
}

export async function getOrCreateCycle({ agencyId, schoolOrganizationId, schoolYear }) {
  const year = schoolYear || currentSchoolYear();
  const [existing] = await pool.execute(
    `SELECT * FROM school_reinit_cycles
     WHERE agency_id = ? AND school_organization_id = ? AND ${yearEq()}
     LIMIT 1`,
    [agencyId, schoolOrganizationId, year]
  );
  if (existing?.[0]) return existing[0];

  const [result] = await pool.execute(
    `INSERT INTO school_reinit_cycles (agency_id, school_organization_id, school_year, status)
     VALUES (?, ?, ?, 'not_started')`,
    [agencyId, schoolOrganizationId, year]
  );
  const [rows] = await pool.execute(`SELECT * FROM school_reinit_cycles WHERE id = ? LIMIT 1`, [
    result.insertId,
  ]);
  return rows[0];
}

export async function getCycleById(cycleId) {
  const [rows] = await pool.execute(`SELECT * FROM school_reinit_cycles WHERE id = ? LIMIT 1`, [
    Number(cycleId),
  ]);
  return rows?.[0] || null;
}

export async function createToken({ cycleId, agencyId, schoolOrganizationId, createdByUserId, expiresAt }) {
  const token = makeToken();
  const expires =
    expiresAt ||
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  await pool.execute(
    `INSERT INTO school_reinit_tokens
      (token, cycle_id, agency_id, school_organization_id, created_by_user_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [token, cycleId, agencyId, schoolOrganizationId, createdByUserId || null, expires]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_tokens
     WHERE BINARY token = BINARY ?
     LIMIT 1`,
    [token]
  );
  return rows[0];
}

/** Return latest unlocked token for a cycle, or create one. */
export async function ensureShareableToken({
  agencyId,
  schoolOrganizationId,
  schoolYear,
  createdByUserId,
}) {
  const cycle = await getOrCreateCycle({ agencyId, schoolOrganizationId, schoolYear });
  await ensureDefaultQuestions(agencyId, cycle.school_year);
  const [existing] = await pool.execute(
    `SELECT * FROM school_reinit_tokens
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
    schoolOrganizationId,
    createdByUserId,
  });
  return { cycle, tokenRow, created: true };
}

export async function listTokensForCycle(cycleId) {
  const [rows] = await pool.execute(
    `SELECT id, token, marked_sent_at, locked_at, click_count, last_viewed_at, created_at, expires_at
     FROM school_reinit_tokens WHERE cycle_id = ? ORDER BY id DESC`,
    [cycleId]
  );
  return rows || [];
}

export async function validateToken(tokenRaw) {
  const token = String(tokenRaw || '').trim();
  if (!token) return { valid: false, reason: 'missing' };
  const [rows] = await pool.execute(
    `SELECT t.*, c.status AS cycle_status, c.school_year, c.snapshot_json,
            a.name AS school_name, a.portal_url, a.slug, a.logo_url AS school_logo_url,
            ag.name AS agency_name, ag.logo_url AS agency_logo_url
     FROM school_reinit_tokens t
     JOIN school_reinit_cycles c ON c.id = t.cycle_id
     JOIN agencies a ON a.id = t.school_organization_id
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

/** Move unlocked in-progress token links onto the active school year cycle. */
export async function resolveTokenCycle(tokenRow) {
  if (!tokenRow) return null;
  const expectedYear = currentSchoolYear();
  if (String(tokenRow.cycle_status) === 'finalized') {
    return getCycleById(tokenRow.cycle_id);
  }
  if (String(tokenRow.school_year || '') === expectedYear) {
    return getCycleById(tokenRow.cycle_id);
  }
  const cycle = await getOrCreateCycle({
    agencyId: tokenRow.agency_id,
    schoolOrganizationId: tokenRow.school_organization_id,
    schoolYear: expectedYear,
  });
  if (!tokenRow.locked_at) {
    await pool.execute(`UPDATE school_reinit_tokens SET cycle_id = ? WHERE id = ?`, [
      cycle.id,
      tokenRow.id,
    ]);
    tokenRow.cycle_id = cycle.id;
    tokenRow.school_year = cycle.school_year;
    tokenRow.cycle_status = cycle.status;
  }
  return cycle;
}

export async function recordTokenClick(tokenRow, actorDisplayName = null) {
  await pool.execute(
    `UPDATE school_reinit_tokens
     SET click_count = click_count + 1, last_viewed_at = NOW()
     WHERE id = ?`,
    [tokenRow.id]
  );
  await pool.execute(
    `INSERT INTO school_reinit_view_events
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
    `INSERT INTO school_reinit_view_events
      (cycle_id, token_id, user_id, actor_display_name, section_key, event_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [cycleId, tokenId, userId, actorDisplayName, sectionKey, eventType]
  );
}

export async function markTokenSent(tokenId, userId, sent = true) {
  if (sent) {
    await pool.execute(
      `UPDATE school_reinit_tokens
       SET marked_sent_at = NOW(), marked_sent_by_user_id = ?
       WHERE id = ?`,
      [userId, tokenId]
    );
  } else {
    await pool.execute(
      `UPDATE school_reinit_tokens
       SET marked_sent_at = NULL, marked_sent_by_user_id = NULL
       WHERE id = ?`,
      [tokenId]
    );
  }
}

export async function lockTokensForCycle(cycleId) {
  await pool.execute(
    `UPDATE school_reinit_tokens SET locked_at = NOW()
     WHERE cycle_id = ? AND locked_at IS NULL`,
    [cycleId]
  );
}

async function resolveAgencyDisplayName(agencyId) {
  const [rows] = await pool.execute(`SELECT name FROM agencies WHERE id = ? LIMIT 1`, [agencyId]);
  const name = String(rows?.[0]?.name || '').trim();
  return name || 'our team';
}

function withAgencyName(text, agencyName) {
  if (text == null) return text;
  return String(text).split('{agencyName}').join(agencyName);
}

export async function ensureDefaultQuestions(agencyId, schoolYear) {
  const year = schoolYear || currentSchoolYear();
  const [existing] = await pool.execute(
    `SELECT question_key FROM school_reinit_question_configs
     WHERE agency_id = ? AND ${yearEq()}`,
    [agencyId, year]
  );
  const have = new Set((existing || []).map((r) => r.question_key));
  const agencyName = await resolveAgencyDisplayName(agencyId);
  for (const q of DEFAULT_QUESTIONS) {
    if (have.has(q.question_key)) continue;
    await pool.execute(
      `INSERT INTO school_reinit_question_configs
        (agency_id, school_year, question_key, section_key, label, help_text, input_type, options_json, enabled, required, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        agencyId,
        year,
        q.question_key,
        q.section_key,
        withAgencyName(q.label, agencyName),
        withAgencyName(q.help_text, agencyName),
        q.input_type,
        q.options_json != null ? JSON.stringify(q.options_json) : null,
        q.required ? 1 : 0,
        q.sort_order,
      ]
    );
  }
}

export async function listQuestionConfigs(agencyId, schoolYear) {
  const year = schoolYear || currentSchoolYear();
  await ensureDefaultQuestions(agencyId, year);
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_question_configs
     WHERE agency_id = ? AND ${yearEq()}
     ORDER BY section_key ASC, sort_order ASC, id ASC`,
    [agencyId, year]
  );
  return rows;
}

export async function upsertQuestionConfig(agencyId, schoolYear, questionKey, patch) {
  const [existing] = await pool.execute(
    `SELECT id FROM school_reinit_question_configs
     WHERE agency_id = ? AND ${yearEq()} AND question_key COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
     LIMIT 1`,
    [agencyId, schoolYear, questionKey]
  );
  if (!existing?.[0]) {
    const def = DEFAULT_QUESTIONS.find((q) => q.question_key === questionKey);
    if (!def) throw new Error('Unknown question_key');
    const agencyName = await resolveAgencyDisplayName(agencyId);
    await pool.execute(
      `INSERT INTO school_reinit_question_configs
        (agency_id, school_year, question_key, section_key, label, help_text, input_type, options_json, enabled, required, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        schoolYear,
        questionKey,
        patch.section_key || def.section_key,
        patch.label ?? withAgencyName(def.label, agencyName),
        patch.help_text !== undefined ? patch.help_text : withAgencyName(def.help_text, agencyName),
        patch.input_type || def.input_type,
        patch.options_json != null
          ? JSON.stringify(patch.options_json)
          : def.options_json != null
            ? JSON.stringify(def.options_json)
            : null,
        patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : 1,
        patch.required !== undefined ? (patch.required ? 1 : 0) : def.required ? 1 : 0,
        patch.sort_order ?? def.sort_order,
      ]
    );
  } else {
    const fields = [];
    const vals = [];
    for (const key of ['label', 'help_text', 'input_type', 'section_key', 'sort_order']) {
      if (patch[key] !== undefined) {
        fields.push(`${key} = ?`);
        vals.push(patch[key]);
      }
    }
    if (patch.enabled !== undefined) {
      fields.push('enabled = ?');
      vals.push(patch.enabled ? 1 : 0);
    }
    if (patch.required !== undefined) {
      fields.push('required = ?');
      vals.push(patch.required ? 1 : 0);
    }
    if (patch.options_json !== undefined) {
      fields.push('options_json = ?');
      vals.push(patch.options_json ? JSON.stringify(patch.options_json) : null);
    }
    if (fields.length) {
      vals.push(existing[0].id);
      await pool.execute(
        `UPDATE school_reinit_question_configs SET ${fields.join(', ')} WHERE id = ?`,
        vals
      );
    }
  }
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_question_configs
     WHERE agency_id = ? AND ${yearEq()} AND question_key COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci LIMIT 1`,
    [agencyId, schoolYear, questionKey]
  );
  return rows[0];
}

export async function resetQuestionConfigs(agencyId, schoolYear) {
  await pool.execute(
    `DELETE FROM school_reinit_question_configs WHERE agency_id = ? AND ${yearEq()}`,
    [agencyId, schoolYear]
  );
  await ensureDefaultQuestions(agencyId, schoolYear);
  return listQuestionConfigs(agencyId, schoolYear);
}

export async function getSectionProgress(cycleId) {
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_section_progress WHERE cycle_id = ?`,
    [cycleId]
  );
  const byKey = new Map((rows || []).map((r) => [r.section_key, r]));
  return SECTION_KEYS.map((key) => {
    const row = byKey.get(key);
    let data = null;
    if (row?.data_json) {
      try {
        data = typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json;
      } catch {
        data = null;
      }
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
  if (!SECTION_KEYS.includes(sectionKey)) throw new Error('Invalid section_key');
  const [existing] = await pool.execute(
    `SELECT id FROM school_reinit_section_progress WHERE cycle_id = ? AND section_key = ? LIMIT 1`,
    [cycleId, sectionKey]
  );
  const dataJson = data !== undefined ? JSON.stringify(data) : null;
  const reviewedVal = reviewed ? 1 : 0;
  const completedVal = completed !== undefined ? (completed ? 1 : 0) : reviewedVal;

  if (existing?.[0]) {
    await pool.execute(
      `UPDATE school_reinit_section_progress
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
      `INSERT INTO school_reinit_section_progress
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

  // Mark cycle in progress
  await pool.execute(
    `UPDATE school_reinit_cycles SET status = 'in_progress'
     WHERE id = ? AND status = 'not_started'`,
    [cycleId]
  );

  return getSectionProgress(cycleId);
}

export async function loadProvidersForSchool(schoolOrganizationId) {
  const orgId = parseInt(schoolOrganizationId, 10);
  if (!orgId) return [];

  let rows = [];
  try {
    const [r] = await pool.execute(
      `SELECT psa.id,
              psa.provider_user_id,
              psa.day_of_week,
              psa.slots_total,
              psa.slots_available,
              psa.start_time,
              psa.end_time,
              psa.is_active,
              u.first_name,
              u.last_name,
              u.email,
              u.profile_photo_path,
              COALESCE(psa.accepting_new_clients_override, u.provider_accepting_new_clients, TRUE) AS accepting_new_clients_effective,
              COALESCE(u.provider_school_info_blurb, psp.school_info_blurb) AS school_info_blurb,
              u.psychology_today_url
       FROM provider_school_assignments psa
       JOIN users u ON u.id = psa.provider_user_id
       JOIN user_agencies ua
         ON ua.user_id = psa.provider_user_id
        AND ua.agency_id = psa.school_organization_id
       LEFT JOIN provider_school_profiles psp
         ON psp.school_organization_id = psa.school_organization_id
        AND psp.provider_user_id = psa.provider_user_id
       WHERE psa.school_organization_id = ?
         AND psa.is_active = TRUE
         AND (u.is_archived IS NULL OR u.is_archived = FALSE)
         AND UPPER(COALESCE(u.status, '')) NOT IN ('ARCHIVED', 'INACTIVE_EMPLOYEE', 'PROSPECTIVE')
       ORDER BY u.last_name ASC, u.first_name ASC, psa.day_of_week ASC`,
      [orgId]
    );
    rows = r || [];
  } catch (e) {
    const msg = String(e?.message || '');
    const canFallback =
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR') ||
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE');
    if (!canFallback) throw e;
    const [r2] = await pool.execute(
      `SELECT psa.id,
              psa.provider_user_id,
              psa.day_of_week,
              psa.slots_total,
              psa.slots_available,
              psa.start_time,
              psa.end_time,
              psa.is_active,
              u.first_name,
              u.last_name,
              u.email,
              u.profile_photo_path
       FROM provider_school_assignments psa
       JOIN users u ON u.id = psa.provider_user_id
       WHERE psa.school_organization_id = ?
         AND (psa.is_active = 1 OR psa.is_active IS NULL)
       ORDER BY u.last_name, u.first_name, psa.day_of_week`,
      [orgId]
    );
    rows = (r2 || []).map((x) => ({
      ...x,
      accepting_new_clients_effective: true,
      school_info_blurb: null,
    }));
  }

  const byProvider = new Map();
  for (const r of rows || []) {
    const pid = r.provider_user_id;
    if (!byProvider.has(pid)) {
      byProvider.set(pid, {
        providerUserId: pid,
        firstName: r.first_name,
        lastName: r.last_name,
        name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email,
        email: r.email,
        photoUrl: publicUploadsUrlFromStoredPath(r.profile_photo_path),
        schoolInfoBlurb: r.school_info_blurb || null,
        psychologyTodayUrl: r.psychology_today_url || null,
        acceptingNewClients: r.accepting_new_clients_effective !== undefined ? !!r.accepting_new_clients_effective : true,
        assignments: [],
      });
    }
    byProvider.get(pid).assignments.push({
      id: r.id,
      dayOfWeek: r.day_of_week,
      slotsTotal: r.slots_total,
      slotsAvailable: r.slots_available,
      startTime: r.start_time,
      endTime: r.end_time,
      isActive: !!r.is_active,
    });
  }

  const providerIds = Array.from(byProvider.keys()).map((v) => parseInt(v, 10)).filter(Boolean);
  if (providerIds.length > 0) {
    try {
      const placeholders = providerIds.map(() => '?').join(',');
      const dayPlaceholders = PROVIDER_DAY_ORDER.map(() => '?').join(',');
      const usedMap = new Map();
      const [cpaCounts] = await pool.execute(
        `SELECT cpa.provider_user_id, cpa.service_day, COUNT(*) AS cnt
         FROM client_provider_assignments cpa
         JOIN clients c ON c.id = cpa.client_id
         WHERE cpa.organization_id = ?
           AND cpa.is_active = TRUE
           AND c.status <> 'ARCHIVED'
           AND cpa.provider_user_id IN (${placeholders})
           AND cpa.service_day IN (${dayPlaceholders})
         GROUP BY cpa.provider_user_id, cpa.service_day`,
        [orgId, ...providerIds, ...PROVIDER_DAY_ORDER]
      );
      for (const row of cpaCounts || []) {
        usedMap.set(`${Number(row.provider_user_id)}:${String(row.service_day)}`, Number(row.cnt || 0));
      }
      for (const obj of byProvider.values()) {
        obj.assignments = (obj.assignments || []).map((a) => {
          const used = usedMap.get(`${Number(obj.providerUserId)}:${String(a.dayOfWeek)}`) || 0;
          const total = Number(a.slotsTotal);
          const totalOk = Number.isFinite(total) && total > 0;
          return {
            ...a,
            slotsUsed: used,
            slotsAvailableCalculated: totalOk ? Math.max(0, total - used) : null,
          };
        });
      }
    } catch {
      // Best-effort slot counts only.
    }
  }

  return Array.from(byProvider.values()).sort((a, b) =>
    String(a.lastName || '').localeCompare(String(b.lastName || ''))
  );
}

export async function loadSchoolStaff(schoolOrganizationId) {
  const orgId = Number(schoolOrganizationId || 0);
  if (!orgId) return [];

  const [rows] = await pool.execute(
    `SELECT sc.id, sc.full_name, sc.email, sc.role_title, sc.is_primary, sc.is_school_admin, sc.is_scheduler
     FROM school_contacts sc
     WHERE sc.school_organization_id = ?
     ORDER BY sc.is_primary DESC, sc.full_name ASC`,
    [orgId]
  );
  if (!rows?.length) return [];

  const emails = Array.from(
    new Set(
      (rows || [])
        .map((r) => String(r.email || '').trim().toLowerCase())
        .filter((e) => e.includes('@'))
    )
  );

  const emailToUser = new Map();
  if (emails.length) {
    const placeholders = emails.map(() => '?').join(',');
    // Prefer a school_staff user who is already on this school's user_agencies roster.
    try {
      const [affiliated] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, LOWER(TRIM(u.email)) AS email
         FROM users u
         INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
         WHERE u.role = 'school_staff'
           AND (u.status IS NULL OR UPPER(u.status) <> 'ARCHIVED')
           AND LOWER(TRIM(u.email)) IN (${placeholders})`,
        [orgId, ...emails]
      );
      for (const u of affiliated || []) {
        const em = String(u.email || '').trim().toLowerCase();
        if (em && !emailToUser.has(em)) emailToUser.set(em, u);
      }
    } catch {
      // best-effort
    }

    // Fall back: any school_staff user matching contact email / work_email / login alias.
    try {
      const [matched] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name,
                LOWER(TRIM(u.email)) AS email,
                LOWER(TRIM(COALESCE(u.work_email, ''))) AS work_email
         FROM users u
         LEFT JOIN user_login_emails ule ON ule.user_id = u.id
         WHERE u.role = 'school_staff'
           AND (u.status IS NULL OR UPPER(u.status) <> 'ARCHIVED')
           AND (
             LOWER(TRIM(u.email)) IN (${placeholders})
             OR LOWER(TRIM(COALESCE(u.work_email, ''))) IN (${placeholders})
             OR LOWER(TRIM(COALESCE(ule.email, ''))) IN (${placeholders})
           )`,
        [...emails, ...emails, ...emails]
      );
      for (const u of matched || []) {
        for (const key of [u.email, u.work_email]) {
          const em = String(key || '').trim().toLowerCase();
          if (em && emails.includes(em) && !emailToUser.has(em)) emailToUser.set(em, u);
        }
      }
      // Also map login aliases from a second pass when the contact email is only on ule.
      for (const u of matched || []) {
        const primary = String(u.email || '').trim().toLowerCase();
        if (!primary) continue;
        for (const contactEmail of emails) {
          if (!emailToUser.has(contactEmail) && (contactEmail === primary || contactEmail === String(u.work_email || '').trim().toLowerCase())) {
            emailToUser.set(contactEmail, u);
          }
        }
      }
    } catch {
      // best-effort
    }

    // Login-alias → contact email mapping (covers contacts that only match ule).
    try {
      const [aliasRows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, LOWER(TRIM(ule.email)) AS alias_email
         FROM user_login_emails ule
         INNER JOIN users u ON u.id = ule.user_id
         WHERE u.role = 'school_staff'
           AND (u.status IS NULL OR UPPER(u.status) <> 'ARCHIVED')
           AND LOWER(TRIM(ule.email)) IN (${placeholders})`,
        emails
      );
      for (const u of aliasRows || []) {
        const em = String(u.alias_email || '').trim().toLowerCase();
        if (em && !emailToUser.has(em)) emailToUser.set(em, u);
      }
    } catch {
      // user_login_emails may not exist on older DBs
    }
  }

  return (rows || []).map((r) => {
    const em = String(r.email || '').trim().toLowerCase();
    const user = emailToUser.get(em) || null;
    return {
      id: r.id,
      userId: user?.id || null,
      name: r.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || r.email,
      email: r.email,
      title: r.role_title || null,
      isPrimary: Boolean(r.is_primary),
      isSchoolAdmin: Boolean(r.is_school_admin),
      isScheduler: Boolean(r.is_scheduler),
    };
  });
}

export async function loadSchoolEventsContext(agencyId, schoolOrganizationId, schoolYear) {
  const bounds = schoolYearBounds(schoolYear);
  let events = [];
  try {
    events = await listSchoolEventsForOrg(schoolOrganizationId);
  } catch {
    events = [];
  }

  const inYear = (events || []).filter((e) => {
    const d = e?.startsAt ? new Date(e.startsAt) : null;
    if (!d || Number.isNaN(d.getTime())) return false;
    const t = d.getTime();
    return t >= bounds.startDate.getTime() && t <= bounds.endDate.getTime();
  });

  const pick = (category, eventType) =>
    inYear.find((e) => e.category === category || e.eventType === eventType) || null;

  const firstDayEvents = inYear
    .filter((e) => e.category === 'first_day' || e.eventType === 'school_first_day')
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const firstDay = firstDayEvents[0] || pick('first_day', 'school_first_day');
  const bts = pick('back_to_school', 'school_back_to_school');
  const fallCheckIn = pick('fall_check_in', 'school_fall_check_in');

  const mapLite = (e) =>
    e
      ? {
          id: e.id,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          title: e.title,
          description: e.description || '',
          category: e.category,
          eventType: e.eventType,
          timezone: e.timezone,
          outreachTableInvited: Boolean(e.outreachTableInvited),
          employeeReportTime: e.employeeReportTime,
          minProvidersPerSession: e.minProvidersPerSession,
          detailsUrl: e.detailsUrl || '',
          flierFileUrl: e.flierFileUrl || '',
          eventImageUrl: e.eventImageUrl || '',
          schoolEventStatus: e.schoolEventStatus,
        }
      : null;

  const calendarOnly = new Set(['holiday', 'day_off', 'first_day', 'fall_check_in', 'spring']);
  const attendableEvents = inYear
    .filter((e) => !calendarOnly.has(String(e.category || '').toLowerCase()))
    .map(mapLite)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return {
    firstDay: mapLite(firstDay),
    firstDays: firstDayEvents.map(mapLite),
    backToSchool: mapLite(bts),
    fallCheckIn: mapLite(fallCheckIn),
    attendableEvents,
  };
}

export async function listCheckinSlots(agencyId, schoolYear) {
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_checkin_slots
     WHERE agency_id = ? AND ${yearEq()} AND is_active = 1
     ORDER BY starts_at ASC`,
    [agencyId, schoolYear]
  );
  return rows || [];
}

export async function createChangeRequest({
  cycleId,
  entityType,
  entityId,
  action,
  beforeJson,
  afterJson,
  actor,
}) {
  const [result] = await pool.execute(
    `INSERT INTO school_reinit_change_requests
      (cycle_id, entity_type, entity_id, action, status, before_json, after_json,
       submitted_by_actor_type, submitted_by_user_id, submitted_by_display_name)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [
      cycleId,
      entityType,
      entityId || null,
      action,
      beforeJson ? JSON.stringify(beforeJson) : null,
      afterJson ? JSON.stringify(afterJson) : null,
      actor?.actorType || null,
      actor?.userId || null,
      actor?.displayName || null,
    ]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_change_requests WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  return rows[0];
}

export async function listChangeRequests(cycleId, status = null) {
  if (status) {
    const [rows] = await pool.execute(
      `SELECT * FROM school_reinit_change_requests WHERE cycle_id = ? AND status = ? ORDER BY id DESC`,
      [cycleId, status]
    );
    return rows;
  }
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_change_requests WHERE cycle_id = ? ORDER BY id DESC`,
    [cycleId]
  );
  return rows;
}

export async function resolveChangeRequest({ requestId, status, resolvedByUserId, note }) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('Invalid status');
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_change_requests WHERE id = ? LIMIT 1`,
    [requestId]
  );
  const req = rows?.[0];
  if (!req) throw new Error('Change request not found');
  if (req.status !== 'pending') throw new Error('Change request already resolved');

  if (status === 'approved') {
    await applyChangeRequest(req);
  }

  await pool.execute(
    `UPDATE school_reinit_change_requests
     SET status = ?, resolved_by_user_id = ?, resolved_at = NOW(), resolution_note = ?
     WHERE id = ?`,
    [status, resolvedByUserId, note || null, requestId]
  );
  const [updated] = await pool.execute(
    `SELECT * FROM school_reinit_change_requests WHERE id = ? LIMIT 1`,
    [requestId]
  );
  return updated[0];
}

async function applyChangeRequest(req) {
  const entityType = String(req.entity_type || '');
  const action = String(req.action || '');
  let after = null;
  try {
    after = typeof req.after_json === 'string' ? JSON.parse(req.after_json) : req.after_json;
  } catch {
    after = null;
  }

  if (entityType === 'provider_assignment') {
    if (action === 'delete' && req.entity_id) {
      await pool.execute(`UPDATE provider_school_assignments SET is_active = 0 WHERE id = ?`, [
        req.entity_id,
      ]);
    } else if (action === 'modify' && req.entity_id && after) {
      await pool.execute(
        `UPDATE provider_school_assignments
         SET day_of_week = COALESCE(?, day_of_week),
             slots_total = COALESCE(?, slots_total),
             start_time = COALESCE(?, start_time),
             end_time = COALESCE(?, end_time)
         WHERE id = ?`,
        [
          after.dayOfWeek ?? after.day_of_week ?? null,
          after.slotsTotal ?? after.slots_total ?? null,
          after.startTime ?? after.start_time ?? null,
          after.endTime ?? after.end_time ?? null,
          req.entity_id,
        ]
      );
    }
  } else if (entityType === 'school_staff') {
    if (action === 'delete' && req.entity_id) {
      await pool.execute(`DELETE FROM school_contacts WHERE id = ?`, [req.entity_id]);
    } else if (action === 'modify' && req.entity_id && after) {
      const updates = [];
      const params = [];
      if (after.name !== undefined || after.full_name !== undefined) {
        updates.push('full_name = COALESCE(?, full_name)');
        params.push(after.name ?? after.full_name ?? null);
      }
      if (after.title !== undefined || after.role_title !== undefined) {
        updates.push('role_title = ?');
        params.push(after.title ?? after.role_title ?? null);
      }
      if (after.email !== undefined) {
        updates.push('email = COALESCE(?, email)');
        params.push(after.email ?? null);
      }
      if (after.is_primary !== undefined) {
        updates.push('is_primary = ?');
        params.push(after.is_primary ? 1 : 0);
      }
      if (after.is_school_admin !== undefined) {
        updates.push('is_school_admin = ?');
        params.push(after.is_school_admin ? 1 : 0);
      }
      if (after.is_scheduler !== undefined) {
        updates.push('is_scheduler = ?');
        params.push(after.is_scheduler ? 1 : 0);
      }
      if (updates.length) {
        params.push(req.entity_id);
        await pool.execute(
          `UPDATE school_contacts SET ${updates.join(', ')} WHERE id = ?`,
          params
        );
      }
    }
  }
}

/** Auto-apply additions (new provider day or staff contact). */
export async function applyAddition({ entityType, payload, schoolOrganizationId }) {
  if (entityType === 'provider_assignment') {
    const [result] = await pool.execute(
      `INSERT INTO provider_school_assignments
        (provider_user_id, school_organization_id, day_of_week, slots_total, start_time, end_time, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        payload.providerUserId,
        schoolOrganizationId,
        payload.dayOfWeek,
        payload.slotsTotal ?? 1,
        payload.startTime || null,
        payload.endTime || null,
      ]
    );
    return { id: result.insertId };
  }
  if (entityType === 'school_staff') {
    const [result] = await pool.execute(
      `INSERT INTO school_contacts
        (school_organization_id, full_name, email, role_title, is_primary, is_school_admin, is_scheduler)
       VALUES (?, ?, ?, ?, 0, 0, 0)`,
      [schoolOrganizationId, payload.name || null, payload.email || null, payload.title || null]
    );
    return { id: result.insertId };
  }
  throw new Error('Unsupported entity type for addition');
}

export async function buildSnapshot(cycle) {
  const sections = await getSectionProgress(cycle.id);
  const providers = await loadProvidersForSchool(cycle.school_organization_id);
  const staff = await loadSchoolStaff(cycle.school_organization_id);
  const events = await loadSchoolEventsContext(
    cycle.agency_id,
    cycle.school_organization_id,
    cycle.school_year
  );
  const byKey = Object.fromEntries(sections.map((s) => [s.sectionKey, s]));
  return {
    schoolYear: cycle.school_year,
    finalizedAt: new Date().toISOString(),
    schoolInformation: byKey.school_information?.data || null,
    events: {
      ...events,
      answers: byKey.school_events?.data || null,
    },
    providers,
    assignedProviders: byKey.assigned_providers?.data || null,
    staff,
    materials: byKey.materials?.data || null,
    needsAssessment: byKey.needs_assessment?.data || null,
    fallCheckIn: byKey.fall_check_in?.data || null,
    growthFeedback: byKey.growth_feedback?.data || null,
    // clients intentionally omitted
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

  const questions = await listQuestionConfigs(cycle.agency_id, cycle.school_year);
  const bySection = Object.fromEntries(sections.map((s) => [s.sectionKey, s.data || {}]));
  for (const q of questions) {
    if (!q.enabled || !q.required) continue;
    // Slot booking is enforced via booking row + invite step below
    if (['fall_checkin_slot_id', 'fall_checkin_modality'].includes(q.question_key)) continue;
    const val = bySection[q.section_key]?.[q.question_key];
    if (val === undefined || val === null || val === '') {
      throw new Error(`Required answer missing: ${q.label}`);
    }
  }

  // Require booked check-in and invite all school_staff as of finalize time
  const Checkin = await import('./schoolReinitCheckin.service.js');
  const booking = await Checkin.inviteSchoolStaffOnFinalize(cycleId);

  const snapshot = await buildSnapshot(cycle);
  snapshot.fallCheckInBooking = {
    id: booking?.id || null,
    slotId: booking?.slot_id || null,
    modality: booking?.modality || null,
    startsAt: booking?.starts_at || null,
    endsAt: booking?.ends_at || null,
    meetLink: booking?.meet_link || null,
    locationText: booking?.location_text || null,
    invitedSchoolStaff: parseJsonField(booking?.invited_school_staff_json) || [],
    invitedAt: booking?.invited_at || null,
  };

  await pool.execute(
    `UPDATE school_reinit_cycles
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
  const finalized = await getCycleById(cycleId);
  await notifySchoolCollaborativeYearUpdateCompleted({
    cycle: finalized,
    actorUserId: actor?.userId || null
  });
  return finalized;
}

export async function createAddendum({ cycleId, summaryText, changes, actor }) {
  const cycle = await getCycleById(cycleId);
  if (!cycle || cycle.status !== 'finalized') {
    throw new Error('Addendums only allowed after finalization');
  }
  const [result] = await pool.execute(
    `INSERT INTO school_reinit_addendums
      (cycle_id, summary_text, changes_json, submitted_by_actor_type, submitted_by_user_id, submitted_by_display_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      cycleId,
      String(summaryText || '').slice(0, 1000),
      JSON.stringify(changes || {}),
      actor?.actorType || null,
      actor?.userId || null,
      actor?.displayName || null,
    ]
  );
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_addendums WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  return rows[0];
}

export async function listAddendums(cycleId) {
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_addendums WHERE cycle_id = ? ORDER BY submitted_at DESC`,
    [cycleId]
  );
  return rows;
}

export async function listViewEvents(cycleId, limit = 40) {
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const [rows] = await pool.execute(
    `SELECT actor_display_name, user_id, created_at, event_type, section_key
     FROM school_reinit_view_events
     WHERE cycle_id = ?
     ORDER BY created_at DESC
     LIMIT ${lim}`,
    [cycleId]
  );
  return rows || [];
}

export async function dismissForUser(cycleId, userId, dismissUntil = null) {
  await pool.execute(
    `INSERT INTO school_reinit_dismissals (cycle_id, user_id, dismissed_at, dismiss_until)
     VALUES (?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE dismissed_at = NOW(), dismiss_until = VALUES(dismiss_until)`,
    [cycleId, userId, dismissUntil]
  );
}

export async function getDismissal(cycleId, userId) {
  const [rows] = await pool.execute(
    `SELECT * FROM school_reinit_dismissals WHERE cycle_id = ? AND user_id = ? LIMIT 1`,
    [cycleId, userId]
  );
  return rows?.[0] || null;
}

export async function listAgencyReport(agencyId, schoolYear) {
  const year = schoolYear || currentSchoolYear();
  await ensureDefaultQuestions(agencyId, year);

  const affiliated = await OrganizationAffiliation.listActiveOrganizationsForAgency(agencyId);
  const schools = (affiliated || []).filter((o) => {
    const t = String(o.organization_type || o.type || '').toLowerCase();
    return !t || t === 'school' || t === 'program' || t === 'learning';
  });

  // ── Bulk-fetch everything in 6 queries instead of N×6 ────────────────────
  const schoolIds = schools.map((o) => Number(o.id || o.organization_id)).filter(Boolean);

  // 1. All cycles for this agency + year
  const [allCycleRows] = schoolIds.length
    ? await pool.execute(
        `SELECT * FROM school_reinit_cycles
         WHERE agency_id = ? AND ${yearEq()}`,
        [agencyId, year]
      )
    : [[]];
  const cycleBySchoolId = new Map();
  for (const c of allCycleRows || []) {
    cycleBySchoolId.set(Number(c.school_organization_id), c);
  }
  const cycleIds = (allCycleRows || []).map((c) => c.id).filter(Boolean);

  // 2. Section progress for all cycles
  const allSectionRows = cycleIds.length
    ? (await pool.query(
        `SELECT * FROM school_reinit_section_progress WHERE cycle_id IN (${cycleIds.map(() => '?').join(',')})`,
        cycleIds
      ))[0]
    : [];
  const sectionsByCycleId = new Map();
  for (const row of allSectionRows || []) {
    const cid = Number(row.cycle_id);
    if (!sectionsByCycleId.has(cid)) sectionsByCycleId.set(cid, []);
    sectionsByCycleId.get(cid).push(row);
  }

  // 3. Tokens for all cycles
  const allTokenRows = cycleIds.length
    ? (await pool.query(
        `SELECT id, cycle_id, token, marked_sent_at, locked_at, click_count, last_viewed_at, created_at, expires_at
         FROM school_reinit_tokens WHERE cycle_id IN (${cycleIds.map(() => '?').join(',')}) ORDER BY id DESC`,
        cycleIds
      ))[0]
    : [];
  const tokensByCycleId = new Map();
  for (const row of allTokenRows || []) {
    const cid = Number(row.cycle_id);
    if (!tokensByCycleId.has(cid)) tokensByCycleId.set(cid, []);
    tokensByCycleId.get(cid).push(row);
  }

  // 4. Unique viewers for all cycles
  const allViewRows = cycleIds.length
    ? (await pool.query(
        `SELECT cycle_id, COALESCE(user_id, 0) AS user_id, actor_display_name
         FROM school_reinit_view_events WHERE cycle_id IN (${cycleIds.map(() => '?').join(',')})`,
        cycleIds
      ))[0]
    : [];
  const viewersByCycleId = new Map();
  for (const row of allViewRows || []) {
    const cid = Number(row.cycle_id);
    if (!viewersByCycleId.has(cid)) viewersByCycleId.set(cid, new Map());
    viewersByCycleId.get(cid).set(Number(row.user_id), row);
  }

  // 5. Pending change request counts grouped by cycle
  const allCrRows = cycleIds.length
    ? (await pool.query(
        `SELECT cycle_id, COUNT(*) AS n FROM school_reinit_change_requests
         WHERE cycle_id IN (${cycleIds.map(() => '?').join(',')}) AND status = 'pending'
         GROUP BY cycle_id`,
        cycleIds
      ))[0]
    : [];
  const pendingByCycleId = new Map();
  for (const row of allCrRows || []) {
    pendingByCycleId.set(Number(row.cycle_id), Number(row.n || 0));
  }

  // 6. Addendum counts grouped by cycle
  const allAdRows = cycleIds.length
    ? (await pool.query(
        `SELECT cycle_id, COUNT(*) AS n FROM school_reinit_addendums
         WHERE cycle_id IN (${cycleIds.map(() => '?').join(',')})
         GROUP BY cycle_id`,
        cycleIds
      ))[0]
    : [];
  const addendumsByCycleId = new Map();
  for (const row of allAdRows || []) {
    addendumsByCycleId.set(Number(row.cycle_id), Number(row.n || 0));
  }
  // ── End bulk fetch ────────────────────────────────────────────────────────

  const out = [];
  for (const school of schools) {
    const schoolId = Number(school.id || school.organization_id);
    if (!schoolId) continue;

    const cycle = cycleBySchoolId.get(schoolId) || null;

    let sections = [];
    let tokens = [];
    let viewers = [];
    let pendingChanges = 0;
    let clickCount = 0;
    let sectionData = {};

    if (cycle) {
      // Assemble section progress from bulk data
      const rawSections = sectionsByCycleId.get(Number(cycle.id)) || [];
      const byKey = new Map(rawSections.map((r) => [r.section_key, r]));
      sections = SECTION_KEYS.map((key) => {
        const row = byKey.get(key);
        let data = null;
        if (row?.data_json) {
          try { data = typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json; } catch { data = null; }
        }
        return { sectionKey: key, reviewed: Boolean(row?.reviewed), reviewedAt: row?.reviewed_at || null, reviewedByDisplayName: row?.reviewed_by_display_name || null, completed: Boolean(row?.completed), data };
      });

      tokens = tokensByCycleId.get(Number(cycle.id)) || [];
      clickCount = tokens.reduce((n, t) => n + Number(t.click_count || 0), 0);
      viewers = [...(viewersByCycleId.get(Number(cycle.id))?.values() || [])];
      pendingChanges = pendingByCycleId.get(Number(cycle.id)) || 0;
      for (const s of sections) {
        if (s.data) sectionData[s.sectionKey] = s.data;
      }
    }

    const reviewedCount = sections.filter((s) => s.reviewed || s.completed).length;
    const pct = Math.round((reviewedCount / SECTION_KEYS.length) * 100);
    const needs = sectionData.needs_assessment || {};
    const materials = sectionData.materials || {};
    const growth = sectionData.growth_feedback || {};
    const eventsAnswers = sectionData.school_events || {};
    const fall = sectionData.fall_check_in || {};

    const addendumCount = cycle ? (addendumsByCycleId.get(Number(cycle.id)) || 0) : 0;

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

    const overallSatisfaction = toScoreNumber(
      growth.overall_satisfaction ?? growth.overallSatisfaction
    );
    const recommendNps = toScoreNumber(growth.recommend_nps ?? growth.recommendNps);

    out.push({
      schoolOrganizationId: schoolId,
      schoolName: school.name || school.organization_name || `School ${schoolId}`,
      schoolSlug: school.portal_url || school.slug || null,
      logoUrl: school.logo_url || null,
      logoPath: school.logo_path || school.icon_file_path || null,
      cycleId: cycle?.id || null,
      status: cycle?.status || 'not_started',
      started: Boolean(cycle && cycle.status !== 'not_started'),
      finalizedAt: cycle?.finalized_at || null,
      pushedAt: cycle?.pushed_at || null,
      isPushed: false,
      sectionPercent: pct,
      reviewedCount,
      sectionTotal: SECTION_KEYS.length,
      sections,
      sectionKeys: SECTION_KEYS,
      tokenClickCount: clickCount,
      tokens,
      viewerCount: viewers.length,
      viewers,
      pendingChangeRequests: pendingChanges,
      addendumCount,
      lastActivityAt,
      daysPerWeekRequested: needs.days_per_week_onsite ?? needs.daysPerWeekOnsite ?? null,
      providerPreferences: needs.provider_preferences || needs.providerPreferences || null,
      hasMarketingQuote: Boolean(growth.marketing_quote || growth.marketingQuote),
      marketingQuote: growth.marketing_quote || growth.marketingQuote || null,
      materialsDeliveryRequired: Boolean(
        materials.materials_delivery_required || materials.materialsDeliveryRequired
      ),
      needPaperPackets: Boolean(materials.need_paper_packets || materials.needPaperPackets),
      needTrifolds: Boolean(materials.need_trifolds || materials.needTrifolds),
      btsPartnerInvited: Boolean(
        eventsAnswers.bts_partner_invited ?? eventsAnswers.bts_itsco_invited
      ),
      btsMarketingTable: Boolean(eventsAnswers.bts_marketing_table),
      btsActiveSignups: Boolean(eventsAnswers.bts_active_signups),
      firstDayOfSchool: eventsAnswers.first_day_of_school || null,
      fallCheckIn: {
        preferredWeek: fall.fall_checkin_preferred_week || null,
        preferredDay: fall.fall_checkin_preferred_day || null,
        preferredTime: fall.fall_checkin_preferred_time || null,
        slotId: fall.fall_checkin_slot_id || null,
        modality: fall.fall_checkin_modality || null,
        startsAt: fall.fall_checkin_starts_at || null,
        endsAt: fall.fall_checkin_ends_at || null,
        meetLink: fall.fall_checkin_meet_link || null,
        location: fall.fall_checkin_location || null,
        bookingId: fall.fall_checkin_booking_id || null,
      },
      scores: {
        overallSatisfaction,
        recommendNps,
      },
      markedSent: tokens.some((t) => t.marked_sent_at),
    });
  }

  const satisfactionScores = out
    .map((r) => r.scores?.overallSatisfaction)
    .filter((n) => n != null);
  const npsScores = out.map((r) => r.scores?.recommendNps).filter((n) => n != null);
  const satisfactionAtLeast4Count = satisfactionScores.filter((n) => n >= 4).length;
  const npsPromoters = npsScores.filter((n) => n >= 9).length;
  const npsPassives = npsScores.filter((n) => n >= 7 && n <= 8).length;
  const npsDetractors = npsScores.filter((n) => n <= 6).length;

  const summary = {
    totalSchools: out.length,
    finalized: out.filter((r) => r.status === 'finalized').length,
    inProgress: out.filter((r) => r.status === 'in_progress').length,
    notStarted: out.filter((r) => r.status === 'not_started' || !r.status).length,
    totalTokenViews: out.reduce((n, r) => n + Number(r.tokenClickCount || 0), 0),
    avgSatisfaction: avgOrNull(satisfactionScores),
    avgNps: avgOrNull(npsScores),
    satisfactionRespondedCount: satisfactionScores.length,
    satisfactionAtLeast4Count,
    npsRespondedCount: npsScores.length,
    npsPromoters,
    npsPassives,
    npsDetractors,
  };

  const campaign = await getOrCreateCampaign(agencyId, year);
  for (const row of out) {
    row.isPushed = cycleIsPushed({ pushed_at: row.pushedAt, status: row.status }, campaign);
    if (campaignIsPushed(campaign) && !row.pushedAt && row.status !== 'finalized') {
      row.pushedAt = campaign.pushed_at || null;
    }
  }
  return {
    agencyId,
    schoolYear: year,
    schools: out,
    summary,
    windowOpen: reinitWindowOpen(),
    campaign: {
      status: campaign.status,
      enabledAt: campaign.enabled_at,
      pushedAt: campaign.pushed_at,
      isEnabled: campaignIsEnabled(campaign),
      isPushed: campaignIsPushed(campaign),
    },
  };
}

function toScoreNumber(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function avgOrNull(arr) {
  if (!arr.length) return null;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
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
