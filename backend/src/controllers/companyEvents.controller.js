import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import MessageLog from '../models/MessageLog.model.js';
import UserCommunication from '../models/UserCommunication.model.js';
import TwilioService from '../services/twilio.service.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';
import {
  parseJsonMaybe,
  normalizeRecurrence,
  makeGoogleCalendarUrl,
  buildEventIcs,
  computeNextOccurrence
} from '../services/companyEvents.service.js';
import { backfillSkillsGroupCompanyEvents } from '../services/skillBuildersGroupEventBackfill.service.js';
import { syncIntegratedSkillsGroupAfterCompanyEventSave } from '../services/skillBuildersEventSessions.service.js';
import KioskModel from '../models/Kiosk.model.js';
import { geocodeAddressWithGoogle } from '../services/googleGeocode.service.js';
import { ProviderAvailabilityService } from '../services/providerAvailability.service.js';

const DEFAULT_RSVP_OPTIONS = [
  { key: '1', label: 'Yes' },
  { key: '2', label: 'No' },
  { key: '3', label: 'Maybe' }
];

const ROLE_AUDIENCE_CODES = {
  provider: 1,
  supervisor: 2,
  admin: 3,
  support: 4,
  staff: 5,
  school_staff: 6,
  clinical_practice_assistant: 7,
  intern: 8
};

const ROLE_AUDIENCE_LABELS = {
  provider: 'Provider',
  supervisor: 'Supervisor',
  admin: 'Admin',
  support: 'Support',
  staff: 'Staff',
  school_staff: 'School Staff',
  clinical_practice_assistant: 'Clinical Practice Assistant',
  intern: 'Intern'
};

const parsePositiveInt = (raw) => {
  const value = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const normalizeIds = (list) => [...new Set((Array.isArray(list) ? list : [])
  .map((value) => Number.parseInt(String(value), 10))
  .filter((value) => Number.isFinite(value) && value > 0))];

const userHasAgencyAccess = async (req, agencyId) => {
  if (!agencyId) return false;
  if (String(req.user?.role || '').toLowerCase() === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user?.id);
  return (agencies || []).some((agency) => Number(agency?.id) === Number(agencyId));
};

async function getSkillBuilderCoordinatorAccess(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT has_skill_builder_coordinator_access FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const v = rows?.[0]?.has_skill_builder_coordinator_access;
    return v === true || v === 1 || v === '1';
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

/** Affiliated child org suitable for program-scoped events (excludes schools). */
async function validateAffiliatedOrganizationForEvent(agencyId, organizationId) {
  if (!organizationId) return { ok: true, organizationId: null };
  const [rows] = await pool.execute(
    `SELECT child.id, child.organization_type
     FROM organization_affiliations oa
     JOIN agencies child ON child.id = oa.organization_id
     WHERE oa.agency_id = ?
       AND oa.organization_id = ?
       AND oa.is_active = TRUE
       AND (child.is_archived = FALSE OR child.is_archived IS NULL)
       AND (child.is_active = TRUE OR child.is_active IS NULL)
     LIMIT 1`,
    [agencyId, organizationId]
  );
  const row = rows?.[0];
  if (!row) return { error: 'Selected organization is not affiliated with this agency' };
  if (String(row.organization_type || '').toLowerCase() === 'school') {
    return { error: 'School organizations cannot be used for program-scoped company events' };
  }
  return { ok: true, organizationId: Number(row.id) };
}

const userCanManageCompanyEvents = (req) => {
  const role = String(req.user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff';
};

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function normalizeVotingOptions(raw) {
  const base = Array.isArray(raw) ? raw : DEFAULT_RSVP_OPTIONS;
  const out = [];
  for (const option of base) {
    const key = String(option?.key || '').trim().toUpperCase();
    const label = String(option?.label || '').trim();
    if (!key || !label) continue;
    out.push({ key, label });
  }
  return out.length ? out : DEFAULT_RSVP_OPTIONS;
}

function parseVotingConfig(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const enabled = !!value.enabled;
  const viaSms = !!value.viaSms;
  const question = String(value.question || '').trim();
  const options = normalizeVotingOptions(value.options);
  return { enabled, viaSms, question, options };
}

function parseReminderConfig(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const enabled = !!value.enabled;
  const offsetsHours = [...new Set((Array.isArray(value.offsetsHours) ? value.offsetsHours : [24, 2])
    .map((n) => Number.parseInt(String(n), 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 168)
  )].sort((a, b) => b - a);
  const channels = {
    inApp: value.channels?.inApp !== false,
    sms: !!value.channels?.sms
  };
  return { enabled, offsetsHours, channels };
}

function normalizeRoleAudience(list = []) {
  return [...new Set((Array.isArray(list) ? list : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => Object.prototype.hasOwnProperty.call(ROLE_AUDIENCE_CODES, value))
  )];
}

function formatOccurrenceKey(dateLike) {
  const date = new Date(dateLike || 0);
  if (!Number.isFinite(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}Z`;
}

function applyTemplateVariables(template, context = {}) {
  const event = context.event || {};
  const user = context.user || {};
  const agency = context.agency || {};
  const replacements = {
    firstName: String(user.first_name || '').trim(),
    lastName: String(user.last_name || '').trim(),
    fullName: `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim(),
    eventTitle: String(event.title || '').trim(),
    agencyName: String(agency.name || '').trim()
  };
  return String(template || '').replace(/\{(firstName|lastName|fullName|eventTitle|agencyName)\}/g, (_, key) => replacements[key] || '');
}

function parseResponseInput(body, options = []) {
  const raw = String(body || '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const normalizedOptions = normalizeVotingOptions(options);
  for (const option of normalizedOptions) {
    if (upper === option.key.toUpperCase()) return { key: option.key, label: option.label, raw };
    if (upper === option.label.toUpperCase()) return { key: option.key, label: option.label, raw };
  }
  return null;
}

function mapEventRow(row, req, opts = {}) {
  const recurrence = parseJsonMaybe(row.recurrence_json) || { frequency: 'none' };
  const votingConfig = parseVotingConfig(parseJsonMaybe(row.voting_config_json));
  const reminderConfig = parseReminderConfig(parseJsonMaybe(row.reminder_config_json));
  const startsAt = row.starts_at;
  const endsAt = row.ends_at;
  const id = Number(row.id);
  const agencyId = Number(row.agency_id);
  const base = {
    id,
    agencyId,
    organizationId: row.organization_id != null && row.organization_id !== undefined
      ? Number(row.organization_id)
      : null,
    title: row.title,
    description: row.description || '',
    eventType: row.event_type || 'company_event',
    splashContent: row.splash_content || '',
    startsAt,
    endsAt,
    timezone: row.timezone || 'UTC',
    recurrence,
    isActive: !!row.is_active,
    rsvpMode: row.rsvp_mode || 'none',
    smsCode: row.sms_code || null,
    votingConfig,
    reminderConfig,
    votingClosedAt: row.voting_closed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    skillBuilderDirectHours:
      row.skill_builder_direct_hours != null && row.skill_builder_direct_hours !== ''
        ? Number(row.skill_builder_direct_hours)
        : null,
    registrationEligible: !!(row.registration_eligible === 1 || row.registration_eligible === true),
    medicaidEligible: !!(row.medicaid_eligible === 1 || row.medicaid_eligible === true),
    cashEligible: !!(row.cash_eligible === 1 || row.cash_eligible === true),
    clientCheckInDisplayTime: row.client_check_in_display_time != null ? String(row.client_check_in_display_time).slice(0, 8) : null,
    clientCheckOutDisplayTime: row.client_check_out_display_time != null ? String(row.client_check_out_display_time).slice(0, 8) : null,
    employeeReportTime: row.employee_report_time != null ? String(row.employee_report_time).slice(0, 8) : null,
    employeeDepartureTime: row.employee_departure_time != null ? String(row.employee_departure_time).slice(0, 8) : null,
    virtualSessionsEnabled:
      row.virtual_sessions_enabled === undefined || row.virtual_sessions_enabled === null
        ? true
        : !!(row.virtual_sessions_enabled === 1 || row.virtual_sessions_enabled === true),
    kioskEventPinSet: !!(row.kiosk_event_pin_hash && String(row.kiosk_event_pin_hash).trim()),
    publicHeroImageUrl: row.public_hero_image_url ? String(row.public_hero_image_url).trim() : '',
    publicListingDetails: row.public_listing_details ? String(row.public_listing_details) : '',
    inPersonPublic: !!(row.in_person_public === 1 || row.in_person_public === true),
    publicLocationAddress: row.public_location_address ? String(row.public_location_address) : '',
    publicLocationLat: (() => {
      const n = Number(row.public_location_lat);
      return Number.isFinite(n) ? n : null;
    })(),
    publicLocationLng: (() => {
      const n = Number(row.public_location_lng);
      return Number.isFinite(n) ? n : null;
    })(),
    publicAgeMin: (() => {
      const n = Number(row.public_age_min);
      return Number.isFinite(n) && n >= 0 ? n : null;
    })(),
    publicAgeMax: (() => {
      const n = Number(row.public_age_max);
      return Number.isFinite(n) && n >= 0 ? n : null;
    })()
  };
  const nextOccurrence = computeNextOccurrence(base);
  const calendarSource = nextOccurrence || { startsAt, endsAt };
  return {
    ...base,
    nextOccurrenceStart: nextOccurrence?.startsAt || null,
    nextOccurrenceEnd: nextOccurrence?.endsAt || null,
    googleCalendarUrl: makeGoogleCalendarUrl({
      ...base,
      startsAt: calendarSource.startsAt,
      endsAt: calendarSource.endsAt
    }),
    icsUrl: opts.myEndpoint
      ? `/api/me/company-events/${id}/ics`
      : `/api/agencies/${agencyId}/company-events/${id}/ics`
  };
}

async function fetchAudienceMap(eventIds = []) {
  if (!eventIds.length) return new Map();
  const placeholders = eventIds.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT company_event_id, audience_type, target_id
     FROM company_event_audiences
     WHERE company_event_id IN (${placeholders})`,
    eventIds
  );
  const map = new Map();
  for (const row of rows || []) {
    const eventId = Number(row.company_event_id);
    if (!map.has(eventId)) {
      map.set(eventId, { all: false, userIds: [], groupIds: [], roleKeys: [] });
    }
    const entry = map.get(eventId);
    if (row.audience_type === 'user') entry.userIds.push(Number(row.target_id));
    if (row.audience_type === 'group') entry.groupIds.push(Number(row.target_id));
    if (row.audience_type === 'role') {
      const roleKey = Object.keys(ROLE_AUDIENCE_CODES).find((key) => ROLE_AUDIENCE_CODES[key] === Number(row.target_id));
      if (roleKey) entry.roleKeys.push(roleKey);
    }
  }
  return map;
}

async function fetchResponseMap(eventIds = [], userId = null) {
  if (!eventIds.length) return new Map();
  const placeholders = eventIds.map(() => '?').join(', ');
  const params = [...eventIds];
  let whereUser = '';
  if (userId) {
    whereUser = ' AND user_id = ?';
    params.push(userId);
  }
  const [rows] = await pool.execute(
    `SELECT company_event_id, user_id, response_key, response_label, source, received_at
     FROM company_event_responses
     WHERE company_event_id IN (${placeholders})${whereUser}`,
    params
  );
  const map = new Map();
  for (const row of rows || []) {
    const key = `${Number(row.company_event_id)}:${Number(row.user_id)}`;
    map.set(key, {
      responseKey: row.response_key,
      responseLabel: row.response_label,
      source: row.source,
      receivedAt: row.received_at
    });
  }
  return map;
}

async function setEventAudience(eventId, { userIds, groupIds, roleKeys }) {
  await pool.execute('DELETE FROM company_event_audiences WHERE company_event_id = ?', [eventId]);
  const users = normalizeIds(userIds);
  const groups = normalizeIds(groupIds);
  const roles = normalizeRoleAudience(roleKeys);
  const inserts = [];
  for (const userId of users) inserts.push([eventId, 'user', userId]);
  for (const groupId of groups) inserts.push([eventId, 'group', groupId]);
  for (const roleKey of roles) inserts.push([eventId, 'role', ROLE_AUDIENCE_CODES[roleKey]]);
  if (!inserts.length) return;
  const valuesSql = inserts.map(() => '(?, ?, ?)').join(', ');
  const params = inserts.flat();
  await pool.execute(
    `INSERT INTO company_event_audiences (company_event_id, audience_type, target_id)
     VALUES ${valuesSql}`,
    params
  );
}

function parseEventPayload(body = {}) {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const splashContent = String(body.splashContent || body.splash_content || '').trim();
  const eventType = String(body.eventType || body.event_type || 'company_event').trim().toLowerCase();
  const startsAtRaw = body.startsAt || body.starts_at;
  const endsAtRaw = body.endsAt || body.ends_at;
  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);
  const timezone = String(body.timezone || 'UTC').trim() || 'UTC';
  const recurrence = normalizeRecurrence(body.recurrence || body.recurrence_json || null);
  const audience = body.audience && typeof body.audience === 'object' ? body.audience : {};
  const isActive = body.isActive === undefined ? true : !!body.isActive;

  const rsvpMode = String(body.rsvpMode || body.rsvp_mode || 'none').trim().toLowerCase();
  const votingConfig = parseVotingConfig(body.votingConfig || body.voting_config_json || {});
  const reminderConfig = parseReminderConfig(body.reminderConfig || body.reminder_config_json || {});
  const votingClosedAtRaw = body.votingClosedAt || body.voting_closed_at || null;
  const votingClosedAt = votingClosedAtRaw ? new Date(votingClosedAtRaw) : null;
  const smsCodeRaw = String(body.smsCode || body.sms_code || '').trim();
  const smsCode = smsCodeRaw ? smsCodeRaw.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase().slice(0, 32) : null;

  const rawSbHours = body.skillBuilderDirectHours ?? body.skill_builder_direct_hours;
  let skillBuilderDirectHours = null;
  if (rawSbHours !== undefined && rawSbHours !== null && String(rawSbHours).trim() !== '') {
    const n = Number(rawSbHours);
    if (Number.isFinite(n) && n >= 0 && n <= 999) skillBuilderDirectHours = n;
  }

  const triBool = (raw, fallback = false) => {
    if (raw === undefined) return fallback;
    return raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true';
  };
  const registrationEligible = triBool(body.registrationEligible ?? body.registration_eligible, false);
  const medicaidEligible = triBool(body.medicaidEligible ?? body.medicaid_eligible, false);
  const cashEligible = triBool(body.cashEligible ?? body.cash_eligible, false);

  const publicHeroImageUrl = String(body.publicHeroImageUrl ?? body.public_hero_image_url ?? '')
    .trim()
    .slice(0, 2048);
  const publicListingDetails = String(body.publicListingDetails ?? body.public_listing_details ?? '')
    .trim()
    .slice(0, 20000);
  const inPersonPublic = triBool(body.inPersonPublic ?? body.in_person_public, false);
  let publicLocationAddress = String(body.publicLocationAddress ?? body.public_location_address ?? '')
    .trim()
    .slice(0, 2000);
  if (!inPersonPublic) publicLocationAddress = '';

  const parseOptionalAge = (raw) => {
    if (raw === undefined || raw === null || raw === '') return null;
    const n = parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n) || n < 0 || n > 120) return null;
    return n;
  };
  const publicAgeMin = parseOptionalAge(body.publicAgeMin ?? body.public_age_min);
  const publicAgeMax = parseOptionalAge(body.publicAgeMax ?? body.public_age_max);
  if (publicAgeMin != null && publicAgeMax != null && publicAgeMin > publicAgeMax) {
    return { error: 'Minimum age cannot be greater than maximum age' };
  }

  const parseWallTime = (raw) => {
    if (raw === undefined || raw === null || raw === '') return null;
    const s = String(raw).trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const hh = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2, '0');
    const mm = String(Math.min(59, Math.max(0, parseInt(m[2], 10)))).padStart(2, '0');
    const ss = m[3] ? String(Math.min(59, Math.max(0, parseInt(m[3], 10)))).padStart(2, '0') : '00';
    return `${hh}:${mm}:${ss}`;
  };
  const clientCheckInDisplayTime = parseWallTime(body.clientCheckInDisplayTime ?? body.client_check_in_display_time);
  const clientCheckOutDisplayTime = parseWallTime(body.clientCheckOutDisplayTime ?? body.client_check_out_display_time);
  const employeeReportTime = parseWallTime(body.employeeReportTime ?? body.employee_report_time);
  const employeeDepartureTime = parseWallTime(body.employeeDepartureTime ?? body.employee_departure_time);
  const virtualSessionsEnabled = triBool(
    body.virtualSessionsEnabled ?? body.virtual_sessions_enabled,
    true
  );

  let kioskPinOutcome = { mode: 'unchanged' };
  const pinRaw = body.kioskEventPin ?? body.kiosk_event_pin;
  const clearRaw = body.kioskEventPinClear ?? body.kiosk_event_pin_clear;
  const wantsClear =
    clearRaw === true ||
    clearRaw === 1 ||
    String(clearRaw || '').toLowerCase() === 'true';
  const hasPinField = Object.prototype.hasOwnProperty.call(body, 'kioskEventPin')
    || Object.prototype.hasOwnProperty.call(body, 'kiosk_event_pin');
  if (hasPinField) {
    const s = pinRaw === undefined || pinRaw === null ? '' : String(pinRaw).trim();
    if (s === '') {
      kioskPinOutcome = { mode: 'clear' };
    } else if (!/^\d{6}$/.test(s)) {
      return { error: 'Kiosk station PIN must be exactly 6 digits' };
    } else {
      kioskPinOutcome = { mode: 'set', hash: KioskModel.hashPin(s) };
    }
  } else if (wantsClear) {
    kioskPinOutcome = { mode: 'clear' };
  }

  if (!title) return { error: 'title is required' };
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    return { error: 'startsAt and endsAt are required and must be valid dates' };
  }
  if (endsAt <= startsAt) return { error: 'endsAt must be after startsAt' };
  if (votingClosedAtRaw && !Number.isFinite(votingClosedAt?.getTime())) return { error: 'Invalid votingClosedAt value' };
  if (votingConfig.viaSms && !smsCode) return { error: 'smsCode is required when SMS voting is enabled' };

  const rawOrg = body.organizationId ?? body.organization_id;
  let organizationId = null;
  if (rawOrg !== undefined && rawOrg !== null && rawOrg !== '') {
    const n = parsePositiveInt(rawOrg);
    if (!n) return { error: 'organizationId must be a positive integer when provided' };
    organizationId = n;
  }

  return {
    title,
    description,
    splashContent,
    eventType,
    startsAt,
    endsAt,
    timezone,
    recurrence,
    isActive,
    rsvpMode,
    votingConfig,
    reminderConfig,
    votingClosedAt,
    smsCode,
    organizationId,
    audience: {
      userIds: normalizeIds(audience.userIds),
      groupIds: normalizeIds(audience.groupIds),
      roleKeys: normalizeRoleAudience(audience.roleKeys)
    },
    skillBuilderDirectHours,
    registrationEligible,
    medicaidEligible,
    cashEligible,
    publicHeroImageUrl: publicHeroImageUrl || null,
    publicListingDetails: publicListingDetails || null,
    inPersonPublic,
    publicLocationAddress: publicLocationAddress || null,
    publicAgeMin,
    publicAgeMax,
    clientCheckInDisplayTime,
    clientCheckOutDisplayTime,
    employeeReportTime,
    employeeDepartureTime,
    virtualSessionsEnabled,
    kioskPinOutcome
  };
}

async function resolvePublicListingGeocode({
  inPersonPublic,
  publicLocationAddress,
  prevAddress = null,
  prevLat = null,
  prevLng = null
}) {
  if (!inPersonPublic || !String(publicLocationAddress || '').trim()) {
    return { lat: null, lng: null };
  }
  const addr = String(publicLocationAddress).trim();
  const prev = String(prevAddress || '').trim();
  const lat0 = Number(prevLat);
  const lng0 = Number(prevLng);
  if (addr === prev && Number.isFinite(lat0) && Number.isFinite(lng0)) {
    return { lat: lat0, lng: lng0 };
  }
  try {
    const g = await geocodeAddressWithGoogle({ addressText: addr, countryCode: 'US' });
    return { lat: g.latitude, lng: g.longitude };
  } catch {
    return { lat: null, lng: null };
  }
}

/**
 * Station PIN must be unique among active integrated Skill Builders events for this agency so public
 * unlock (scoped by agency portal slug) always resolves to a single event.
 */
async function assertKioskEventPinUnique(conn, { agencyId, eventId, pinHash }) {
  const aid = parsePositiveInt(agencyId);
  const eid = parsePositiveInt(eventId);
  const h = String(pinHash || '').trim();
  if (!aid || !h) return { ok: true };

  const excludeId = eid > 0 ? eid : 0;
  const [hit] = await conn.execute(
    `SELECT id FROM company_events
     WHERE agency_id = ? AND id != ? AND kiosk_event_pin_hash = ?
       AND LOWER(COALESCE(event_type, '')) = 'skills_group'
       AND (is_active = 1 OR is_active IS NULL)
     LIMIT 1`,
    [aid, excludeId, h]
  );
  if (hit?.[0]?.id) {
    return {
      error:
        'This station PIN is already used by another Skill Builders event for your agency. Choose a different PIN.'
    };
  }
  return { ok: true };
}

async function getAudienceForEvent(eventId) {
  const map = await fetchAudienceMap([eventId]);
  return map.get(eventId) || { all: true, userIds: [], groupIds: [], roleKeys: [] };
}

async function getUserGroupIds(userId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT sgp.skills_group_id AS group_id
     FROM skills_group_providers sgp
     WHERE sgp.provider_user_id = ?`,
    [userId]
  );
  return new Set((rows || []).map((row) => Number(row.group_id)));
}

async function userIsInAudience({ userId, audience }) {
  if (!audience || (audience.userIds.length === 0 && audience.groupIds.length === 0 && (audience.roleKeys || []).length === 0)) return true;
  if (audience.userIds.includes(userId)) return true;
  if ((audience.roleKeys || []).length) {
    const [rows] = await pool.execute(
      'SELECT role FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    const role = String(rows?.[0]?.role || '').toLowerCase();
    if (role && audience.roleKeys.includes(role)) return true;
  }
  const userGroupIds = await getUserGroupIds(userId);
  return (audience.groupIds || []).some((groupId) => userGroupIds.has(Number(groupId)));
}

async function listEventsVisibleToUser(userId, agencyIds = []) {
  if (!userId || !agencyIds.length) return [];
  const placeholders = agencyIds.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT ce.*
     FROM company_events ce
     WHERE ce.agency_id IN (${placeholders})
       AND ce.is_active = 1
       AND (
         ce.ends_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
         OR JSON_EXTRACT(ce.recurrence_json, '$.frequency') IN ('weekly', 'monthly')
       )
     ORDER BY ce.starts_at ASC
     LIMIT 400`,
    agencyIds
  );
  if (!rows?.length) return [];
  const eventIds = rows.map((row) => Number(row.id));
  const audienceMap = await fetchAudienceMap(eventIds);
  const userGroupIds = await getUserGroupIds(userId);
  const [userRows] = await pool.execute('SELECT role FROM users WHERE id = ? LIMIT 1', [userId]);
  const userRole = String(userRows?.[0]?.role || '').toLowerCase();

  return rows.filter((row) => {
    const audience = audienceMap.get(Number(row.id));
    if (!audience) return true;
    if (audience.userIds.includes(userId)) return true;
    if ((audience.roleKeys || []).length && userRole && audience.roleKeys.includes(userRole)) return true;
    return audience.groupIds.some((groupId) => userGroupIds.has(Number(groupId)));
  }).map((row) => ({
    row,
    audience: audienceMap.get(Number(row.id)) || { all: true, userIds: [], groupIds: [], roleKeys: [] }
  }));
}

async function listEventResponseSummary(eventId) {
  const [rows] = await pool.execute(
    `SELECT response_key, COALESCE(response_label, response_key) AS response_label, COUNT(*) AS total
     FROM company_event_responses
     WHERE company_event_id = ?
     GROUP BY response_key, response_label
     ORDER BY total DESC, response_key ASC`,
    [eventId]
  );
  return (rows || []).map((row) => ({
    key: row.response_key,
    label: row.response_label,
    total: Number(row.total || 0)
  }));
}

async function loadEventByIdForAgency(eventId, agencyId) {
  const [rows] = await pool.execute(
    'SELECT * FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1',
    [eventId, agencyId]
  );
  return rows?.[0] || null;
}

async function listEligibleSmsUsersForAgency(agencyId) {
  const [columns] = await pool.execute(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('personal_phone','work_phone')"
  );
  const hasPersonal = columns.some((column) => column.COLUMN_NAME === 'personal_phone');
  const hasWork = columns.some((column) => column.COLUMN_NAME === 'work_phone');
  const fields = ['u.phone_number'];
  if (hasPersonal) fields.push('u.personal_phone');
  if (hasWork) fields.push('u.work_phone');
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id, u.first_name, u.last_name, ${fields.join(', ')}
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND u.is_active = TRUE
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
    [agencyId]
  );
  return rows || [];
}

async function resolveRecipientUserIds(agencyId, eventId, audience = null) {
  const currentAudience = audience || await getAudienceForEvent(eventId);
  const roleKeys = normalizeRoleAudience(currentAudience.roleKeys);
  if (!currentAudience.userIds.length && !currentAudience.groupIds.length && !roleKeys.length) {
    const [rows] = await pool.execute(
      `SELECT DISTINCT ua.user_id
       FROM user_agencies ua
       INNER JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ? AND u.is_active = TRUE`,
      [agencyId]
    );
    return [...new Set((rows || []).map((row) => Number(row.user_id)).filter((id) => id > 0))];
  }

  const result = new Set(currentAudience.userIds);
  if (currentAudience.groupIds.length) {
    const placeholders = currentAudience.groupIds.map(() => '?').join(', ');
    const [groupRows] = await pool.execute(
      `SELECT DISTINCT provider_user_id AS user_id
       FROM skills_group_providers
       WHERE skills_group_id IN (${placeholders})`,
      currentAudience.groupIds
    );
    for (const row of groupRows || []) {
      result.add(Number(row.user_id));
    }
  }
  if (roleKeys.length) {
    const placeholders = roleKeys.map(() => '?').join(', ');
    const [roleRows] = await pool.execute(
      `SELECT DISTINCT ua.user_id
       FROM user_agencies ua
       JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND LOWER(u.role) IN (${placeholders})`,
      [agencyId, ...roleKeys]
    );
    for (const row of roleRows || []) {
      result.add(Number(row.user_id));
    }
  }
  return [...result].filter((id) => id > 0);
}

async function resolveUsersFromOverride({ agencyId, userIds = [], groupIds = [], roleKeys = [] }) {
  const directUsers = normalizeIds(userIds);
  const targetGroupIds = normalizeIds(groupIds);
  const targetRoleKeys = normalizeRoleAudience(roleKeys);
  const result = new Set(directUsers);
  if (targetGroupIds.length) {
    const placeholders = targetGroupIds.map(() => '?').join(', ');
    const [groupRows] = await pool.execute(
      `SELECT DISTINCT provider_user_id AS user_id
       FROM skills_group_providers
       WHERE skills_group_id IN (${placeholders})`,
      targetGroupIds
    );
    for (const row of groupRows || []) {
      const userId = Number(row.user_id);
      if (userId > 0) result.add(userId);
    }
  }
  if (targetRoleKeys.length) {
    const placeholders = targetRoleKeys.map(() => '?').join(', ');
    const [roleRows] = await pool.execute(
      `SELECT DISTINCT ua.user_id
       FROM user_agencies ua
       JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND LOWER(u.role) IN (${placeholders})`,
      [agencyId, ...targetRoleKeys]
    );
    for (const row of roleRows || []) {
      const userId = Number(row.user_id);
      if (userId > 0) result.add(userId);
    }
  }
  if (!result.size) return [];
  const ids = [...result];
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT DISTINCT ua.user_id
     FROM user_agencies ua
     WHERE ua.agency_id = ?
       AND ua.user_id IN (${placeholders})`,
    [agencyId, ...ids]
  );
  return [...new Set((rows || []).map((row) => Number(row.user_id)).filter((id) => id > 0))];
}

function companyEventSmsInstructions(event) {
  const config = parseVotingConfig(event?.votingConfig);
  const code = String(event?.smsCode || '').trim();
  const options = config.options.map((option) => `${option.key}=${option.label}`).join(', ');
  if (code) {
    return `Reply "${code} <option>" (${options}).`;
  }
  return `Reply with one option (${options}).`;
}

async function findAgencyByCompanyEventShortCode(toNumber) {
  const normalizedTo = String(toNumber || '').replace(/[^\d]/g, '');
  if (!normalizedTo) return null;
  const [rows] = await pool.execute('SELECT id, feature_flags FROM agencies WHERE is_active = TRUE OR is_active IS NULL');
  for (const row of rows || []) {
    const flags = parseFeatureFlags(row.feature_flags);
    if (flags.smsNumbersEnabled !== true || flags.companyEventsEnabled !== true) continue;
    let senderMatch = '';
    if (flags.companyEventsSenderNumberId) {
      const [senderRows] = await pool.execute(
        `SELECT phone_number
         FROM twilio_numbers
         WHERE id = ?
           AND agency_id = ?
           AND is_active = TRUE
           AND status = 'active'
         LIMIT 1`,
        [Number(flags.companyEventsSenderNumberId), Number(row.id)]
      );
      senderMatch = String(senderRows?.[0]?.phone_number || '').replace(/[^\d]/g, '');
    }
    const candidate = String(flags.company_events_short_code || flags.company_events_shortcode || flags.agency_campaigns_short_code || flags.agency_campaigns_shortcode || '')
      .replace(/[^\d]/g, '');
    if ((senderMatch && senderMatch === normalizedTo) || (candidate && candidate === normalizedTo)) {
      return Number(row.id);
    }
  }
  return null;
}

async function getCompanyEventSmsSettingsForAgency(agencyId) {
  if (!agencyId) return { enabled: false, fromNumber: null, senderNumberId: null, reason: 'agency_required' };
  const agency = await Agency.findById(agencyId);
  if (!agency) return { enabled: false, fromNumber: null, senderNumberId: null, reason: 'agency_not_found' };
  const flags = parseFeatureFlags(agency.feature_flags);
  if (flags.smsNumbersEnabled !== true) {
    return { enabled: false, fromNumber: null, senderNumberId: null, reason: 'sms_numbers_disabled' };
  }
  if (flags.companyEventsEnabled !== true) {
    return { enabled: false, fromNumber: null, senderNumberId: null, reason: 'company_events_sms_disabled' };
  }
  const senderNumberId = flags.companyEventsSenderNumberId ? Number(flags.companyEventsSenderNumberId) : null;
  if (!senderNumberId) {
    return { enabled: true, fromNumber: null, senderNumberId: null, reason: 'sender_number_not_configured' };
  }
  const [rows] = await pool.execute(
    `SELECT phone_number
     FROM twilio_numbers
     WHERE id = ?
       AND agency_id = ?
       AND is_active = TRUE
       AND status = 'active'
     LIMIT 1`,
    [senderNumberId, agencyId]
  );
  const fromNumber = MessageLog.normalizePhone(rows?.[0]?.phone_number || null);
  if (!fromNumber) {
    return { enabled: true, fromNumber: null, senderNumberId, reason: 'sender_number_invalid' };
  }
  return { enabled: true, fromNumber, senderNumberId, reason: null };
}

async function findAgencyUserByPhone(agencyId, phoneNumber) {
  const normalized = MessageLog.normalizePhone(phoneNumber);
  if (!normalized) return null;
  const users = await listEligibleSmsUsersForAgency(agencyId);
  return users.find((user) => (
    MessageLog.normalizePhone(user.phone_number) === normalized
      || MessageLog.normalizePhone(user.personal_phone) === normalized
      || MessageLog.normalizePhone(user.work_phone) === normalized
  )) || null;
}

async function getActiveSmsVotingEvents(agencyId) {
  const [rows] = await pool.execute(
    `SELECT *
     FROM company_events
     WHERE agency_id = ?
       AND is_active = 1
       AND voting_closed_at IS NULL
       AND JSON_EXTRACT(voting_config_json, '$.enabled') = TRUE
       AND JSON_EXTRACT(voting_config_json, '$.viaSms') = TRUE
     ORDER BY starts_at DESC`,
    [agencyId]
  );
  return rows || [];
}

async function writeDispatchLog({
  eventId,
  userId,
  channel,
  dispatchType,
  occurrenceKey = null,
  status = 'queued',
  statusReason = null,
  twilioSid = null,
  payload = null,
  sentAt = null
}) {
  await pool.execute(
    `INSERT INTO company_event_dispatch_logs
     (company_event_id, user_id, channel, dispatch_type, occurrence_key, status, status_reason, twilio_sid, payload_json, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      userId,
      channel,
      dispatchType,
      occurrenceKey,
      status,
      statusReason,
      twilioSid,
      payload ? JSON.stringify(payload) : null,
      sentAt
    ]
  );
}

async function getEventDeliverySummary(eventId) {
  const [rows] = await pool.execute(
    `SELECT channel, status, COUNT(*) AS total
     FROM company_event_dispatch_logs
     WHERE company_event_id = ?
     GROUP BY channel, status`,
    [eventId]
  );
  const summary = {
    inAppSent: 0,
    inAppFailed: 0,
    smsSent: 0,
    smsFailed: 0,
    smsSkipped: 0
  };
  for (const row of rows || []) {
    const channel = String(row.channel || '');
    const status = String(row.status || '');
    const total = Number(row.total || 0);
    if (channel === 'in_app' && status === 'sent') summary.inAppSent += total;
    if (channel === 'in_app' && status === 'failed') summary.inAppFailed += total;
    if (channel === 'sms' && status === 'sent') summary.smsSent += total;
    if (channel === 'sms' && status === 'failed') summary.smsFailed += total;
    if (channel === 'sms' && status === 'skipped') summary.smsSkipped += total;
  }
  return summary;
}

/**
 * POST body: { agencyId } — creates company_events from school skills_groups missing links (same data as CLI backfill).
 * Requires agency access and (Skill Builders sub-coordinator OR staff who can manage company events).
 */
export const postBackfillSkillsGroupCompanyEvents = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId ?? req.query?.agencyId);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    const isCoord = await getSkillBuilderCoordinatorAccess(req.user?.id);
    const isStaff = userCanManageCompanyEvents(req);
    if (!isCoord && !isStaff) {
      return res.status(403).json({
        error: { message: 'Skill Builders sub-coordinator or admin/staff access required' }
      });
    }
    const conn = await pool.getConnection();
    try {
      const result = await backfillSkillsGroupCompanyEvents(conn, {
        agencyId,
        actorUserId: Number(req.user.id)
      });
      res.json({ ok: true, ...result });
    } finally {
      conn.release();
    }
  } catch (error) {
    next(error);
  }
};

export const listProgramCompanyEventsForCoordinator = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.query.agencyId);
    const organizationId = parsePositiveInt(req.query.organizationId);
    if (!agencyId || !organizationId) {
      return res.status(400).json({ error: { message: 'agencyId and organizationId are required' } });
    }
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    if (!(await getSkillBuilderCoordinatorAccess(req.user?.id))) {
      return res.status(403).json({ error: { message: 'Sub-coordinator access required' } });
    }
    const aff = await validateAffiliatedOrganizationForEvent(agencyId, organizationId);
    if (aff.error) return res.status(400).json({ error: { message: aff.error } });

    // Program hub "Events": rows scoped to this program org, plus any company_events
    // referenced by school skills_groups with this program (covers legacy / inconsistent organization_id).
    const [rows] = await pool.execute(
      `SELECT ce.*, sg.id AS skills_group_id, sg.start_date AS skills_group_start_date, sg.end_date AS skills_group_end_date
       FROM (
         SELECT merged.*
         FROM (
           SELECT ce.*
           FROM company_events ce
           WHERE ce.agency_id = ?
             AND ce.organization_id = ?
           UNION
           SELECT ce2.*
           FROM company_events ce2
           INNER JOIN skills_groups sg2
             ON sg2.company_event_id = ce2.id
             AND sg2.agency_id = ce2.agency_id
           WHERE ce2.agency_id = ?
             AND sg2.skill_builders_program_organization_id = ?
         ) AS merged
       ) AS ce
       LEFT JOIN (
         SELECT sg.*
         FROM skills_groups sg
         INNER JOIN (
           SELECT company_event_id, MIN(id) AS pick_id
           FROM skills_groups
           WHERE agency_id = ?
           GROUP BY company_event_id
         ) pick ON pick.pick_id = sg.id
       ) sg ON sg.company_event_id = ce.id AND sg.agency_id = ce.agency_id
       ORDER BY ce.starts_at DESC, ce.id DESC
       LIMIT 200`,
      [agencyId, organizationId, agencyId, organizationId, agencyId]
    );
    const sgIds = [...new Set((rows || []).map((r) => r.skills_group_id).filter((id) => id != null))];
    /** @type {Map<number, { weekday: string, startTime: string, endTime: string }[]>} */
    const meetingsBySkillsGroupId = new Map();
    if (sgIds.length) {
      const ph = sgIds.map(() => '?').join(',');
      const [mrows] = await pool.execute(
        `SELECT skills_group_id, weekday, start_time, end_time
         FROM skills_group_meetings
         WHERE skills_group_id IN (${ph})
         ORDER BY FIELD(weekday,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), start_time`,
        sgIds
      );
      for (const m of mrows || []) {
        const sgid = Number(m.skills_group_id);
        if (!meetingsBySkillsGroupId.has(sgid)) meetingsBySkillsGroupId.set(sgid, []);
        meetingsBySkillsGroupId.get(sgid).push({
          weekday: m.weekday,
          startTime: String(m.start_time || '').slice(0, 8),
          endTime: String(m.end_time || '').slice(0, 8)
        });
      }
    }
    const events = (rows || []).map((row) => {
      const base = mapEventRow(row, req);
      const sgid = row.skills_group_id != null ? Number(row.skills_group_id) : null;
      return {
        ...base,
        skillsGroupStartDate: row.skills_group_start_date || null,
        skillsGroupEndDate: row.skills_group_end_date || null,
        meetings: sgid && meetingsBySkillsGroupId.has(sgid) ? meetingsBySkillsGroupId.get(sgid) : []
      };
    });
    res.json({ ok: true, events });
  } catch (error) {
    next(error);
  }
};

export const listCompanyEventsForAgency = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    if (!userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin or staff access required' } });
    }
    const [rows] = await pool.execute(
      `SELECT *
       FROM company_events
       WHERE agency_id = ?
       ORDER BY starts_at DESC, id DESC
       LIMIT 300`,
      [agencyId]
    );
    const events = (rows || []).map((row) => mapEventRow(row, req));
    const eventIds = events.map((event) => event.id);
    const audienceMap = await fetchAudienceMap(eventIds);
    const summaries = new Map();
    const deliveries = new Map();
    for (const eventId of eventIds) {
      summaries.set(eventId, await listEventResponseSummary(eventId));
      deliveries.set(eventId, await getEventDeliverySummary(eventId));
    }
    const withAudience = events.map((event) => ({
      ...event,
      audience: audienceMap.get(event.id) || { all: true, userIds: [], groupIds: [], roleKeys: [] },
      responseSummary: summaries.get(event.id) || [],
      deliverySummary: deliveries.get(event.id) || { inAppSent: 0, inAppFailed: 0, smsSent: 0, smsFailed: 0, smsSkipped: 0 }
    }));
    res.json(withAudience);
  } catch (error) {
    next(error);
  }
};

export const listCompanyEventAudienceOptions = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    if (!userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin or staff access required' } });
    }

    const [users] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.role
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ? AND u.is_active = 1
       ORDER BY u.first_name ASC, u.last_name ASC`,
      [agencyId]
    );
    const [groups] = await pool.execute(
      `SELECT id, name
       FROM skills_groups
       WHERE agency_id = ?
       ORDER BY name ASC`,
      [agencyId]
    );

    res.json({
      users: (users || []).map((user) => ({
        id: Number(user.id),
        name: `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim() || user.email,
        email: user.email || null,
        role: user.role || null
      })),
      groups: (groups || []).map((group) => ({
        id: Number(group.id),
        name: String(group.name || '').trim()
      })),
      roles: Object.keys(ROLE_AUDIENCE_CODES).map((key) => ({
        key,
        label: ROLE_AUDIENCE_LABELS[key] || key
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Insert company_events + audience. `parsed` must be a successful parseEventPayload result (no .error).
 * @returns {Promise<{ error: string } | { event: object, eventId: number }>}
 */
async function createCompanyEventCore(req, agencyId, userId, parsed) {
  let organizationIdForRow = null;
  if (parsed.organizationId) {
    const v = await validateAffiliatedOrganizationForEvent(agencyId, parsed.organizationId);
    if (v.error) return { error: v.error };
    organizationIdForRow = v.organizationId;
  }

  let createKioskPinHash = null;
  if (parsed.kioskPinOutcome?.mode === 'set') {
    const uq = await assertKioskEventPinUnique(pool, {
      agencyId,
      eventId: 0,
      pinHash: parsed.kioskPinOutcome.hash
    });
    if (uq.error) return { error: uq.error, httpStatus: 409 };
    createKioskPinHash = parsed.kioskPinOutcome.hash;
  }

  const createGeo = await resolvePublicListingGeocode({
    inPersonPublic: parsed.inPersonPublic,
    publicLocationAddress: parsed.publicLocationAddress
  });

  const [insertResult] = await pool.execute(
    `INSERT INTO company_events
     (agency_id, organization_id, created_by_user_id, updated_by_user_id, title, description, event_type, splash_content, public_hero_image_url, public_listing_details, in_person_public, public_location_address, public_location_lat, public_location_lng, public_age_min, public_age_max, starts_at, ends_at, timezone, recurrence_json, is_active, rsvp_mode, voting_config_json, reminder_config_json, voting_closed_at, sms_code, skill_builder_direct_hours, registration_eligible, medicaid_eligible, cash_eligible, kiosk_event_pin_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agencyId,
      organizationIdForRow,
      userId,
      userId,
      parsed.title,
      parsed.description || null,
      parsed.eventType || null,
      parsed.splashContent || null,
      parsed.publicHeroImageUrl,
      parsed.publicListingDetails,
      parsed.inPersonPublic ? 1 : 0,
      parsed.publicLocationAddress,
      createGeo.lat != null ? createGeo.lat : null,
      createGeo.lng != null ? createGeo.lng : null,
      parsed.publicAgeMin != null ? parsed.publicAgeMin : null,
      parsed.publicAgeMax != null ? parsed.publicAgeMax : null,
      parsed.startsAt,
      parsed.endsAt,
      parsed.timezone,
      JSON.stringify(parsed.recurrence),
      parsed.isActive ? 1 : 0,
      parsed.rsvpMode || 'none',
      JSON.stringify(parsed.votingConfig),
      JSON.stringify(parsed.reminderConfig),
      parsed.votingClosedAt || null,
      parsed.smsCode,
      parsed.skillBuilderDirectHours,
      parsed.registrationEligible ? 1 : 0,
      parsed.medicaidEligible ? 1 : 0,
      parsed.cashEligible ? 1 : 0,
      createKioskPinHash
    ]
  );
  const eventId = Number(insertResult.insertId);
  await setEventAudience(eventId, parsed.audience);

  const row = await loadEventByIdForAgency(eventId, agencyId);
  const event = mapEventRow(row || {}, req);
  return { event, eventId };
}

export const createCompanyEvent = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !userId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    if (!userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin or staff access required' } });
    }
    const parsed = parseEventPayload(req.body || {});
    if (parsed.error) return res.status(400).json({ error: { message: parsed.error } });

    const result = await createCompanyEventCore(req, agencyId, userId, parsed);
    if (result.error) {
      return res.status(result.httpStatus || 400).json({ error: { message: result.error } });
    }
    const audience = await getAudienceForEvent(result.eventId);
    res.status(201).json({ ...result.event, audience, responseSummary: [] });
  } catch (error) {
    next(error);
  }
};

/**
 * Program hub: create a company event scoped to an affiliated program org (not from school skills_groups).
 * Sub-coordinators may use this; integrated Skill Builders school events stay on the school/backfill flow.
 */
export const postProgramCompanyEventForCoordinator = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.body?.agencyId ?? req.query?.agencyId);
    const organizationId = parsePositiveInt(req.body?.organizationId ?? req.query?.organizationId);
    if (!agencyId || !organizationId) {
      return res.status(400).json({ error: { message: 'agencyId and organizationId are required' } });
    }
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    const isCoord = await getSkillBuilderCoordinatorAccess(req.user?.id);
    const isStaff = userCanManageCompanyEvents(req);
    if (!isCoord && !isStaff) {
      return res.status(403).json({
        error: { message: 'Sub-coordinator or admin/staff access required' }
      });
    }

    const aff = await validateAffiliatedOrganizationForEvent(agencyId, organizationId);
    if (aff.error) return res.status(400).json({ error: { message: aff.error } });

    let timezone = String(req.body?.timezone || '').trim();
    if (!timezone) {
      try {
        timezone = await ProviderAvailabilityService.resolveAgencyTimeZone({ agencyId });
      } catch {
        timezone = '';
      }
    }
    if (!timezone) timezone = 'America/New_York';

    const mergedBody = {
      title: req.body?.title,
      description: req.body?.description,
      startsAt: req.body?.startsAt ?? req.body?.starts_at,
      endsAt: req.body?.endsAt ?? req.body?.ends_at,
      timezone,
      organizationId: aff.organizationId,
      eventType: 'company_event',
      recurrence: { frequency: 'none' },
      rsvpMode: 'none',
      audience: {}
    };
    const parsed = parseEventPayload(mergedBody);
    if (parsed.error) return res.status(400).json({ error: { message: parsed.error } });
    if (String(parsed.eventType || '').toLowerCase() === 'skills_group') {
      return res.status(400).json({
        error: {
          message:
            'School-integrated Skill Builders events must be created from school groups or the “Create events from school groups” action on the Skill Builders program.'
        }
      });
    }

    const userId = parsePositiveInt(req.user?.id);
    const result = await createCompanyEventCore(req, agencyId, userId, parsed);
    if (result.error) {
      return res.status(result.httpStatus || 400).json({ error: { message: result.error } });
    }
    const audience = await getAudienceForEvent(result.eventId);
    res.status(201).json({ ...result.event, audience, responseSummary: [] });
  } catch (error) {
    next(error);
  }
};

export async function fetchCompanyEventDetailForEdit(req, agencyId, eventId) {
  const row = await loadEventByIdForAgency(eventId, agencyId);
  if (!row) return null;
  const event = mapEventRow(row, req);
  const audience = await getAudienceForEvent(eventId);
  const responseSummary = await listEventResponseSummary(eventId);
  return { ...event, audience, responseSummary };
}

/**
 * Persist company event update (shared by agency admin route and Skill Builders event portal).
 * Caller must enforce authorization.
 */
export async function persistCompanyEventUpdate(req, agencyId, eventId, body) {
  const userId = parsePositiveInt(req.user?.id);
  if (!agencyId || !eventId || !userId) {
    return { error: { status: 400, message: 'Invalid request' } };
  }

  const existing = await loadEventByIdForAgency(eventId, agencyId);
  if (!existing) return { error: { status: 404, message: 'Company event not found' } };

  const parsed = parseEventPayload(body || {});
  if (parsed.error) return { error: { status: 400, message: parsed.error } };

  let organizationIdForRow = null;
  if (parsed.organizationId) {
    const v = await validateAffiliatedOrganizationForEvent(agencyId, parsed.organizationId);
    if (v.error) return { error: { status: 400, message: v.error } };
    organizationIdForRow = v.organizationId;
  }

  let nextKioskPinHash = existing.kiosk_event_pin_hash != null ? String(existing.kiosk_event_pin_hash) : null;
  if (parsed.kioskPinOutcome?.mode === 'clear') {
    nextKioskPinHash = null;
  } else if (parsed.kioskPinOutcome?.mode === 'set') {
    const uq = await assertKioskEventPinUnique(pool, {
      agencyId,
      eventId,
      pinHash: parsed.kioskPinOutcome.hash
    });
    if (uq.error) return { error: { status: 409, message: uq.error } };
    nextKioskPinHash = parsed.kioskPinOutcome.hash;
  }

  const geo = await resolvePublicListingGeocode({
    inPersonPublic: parsed.inPersonPublic,
    publicLocationAddress: parsed.publicLocationAddress,
    prevAddress: existing.public_location_address,
    prevLat: existing.public_location_lat,
    prevLng: existing.public_location_lng
  });

  await pool.execute(
    `UPDATE company_events
     SET updated_by_user_id = ?, organization_id = ?, title = ?, description = ?, event_type = ?, splash_content = ?, public_hero_image_url = ?, public_listing_details = ?, in_person_public = ?, public_location_address = ?, public_location_lat = ?, public_location_lng = ?, public_age_min = ?, public_age_max = ?, starts_at = ?, ends_at = ?, timezone = ?, recurrence_json = ?, is_active = ?, rsvp_mode = ?, voting_config_json = ?, reminder_config_json = ?, voting_closed_at = ?, sms_code = ?, skill_builder_direct_hours = ?, registration_eligible = ?, medicaid_eligible = ?, cash_eligible = ?, client_check_in_display_time = ?, client_check_out_display_time = ?, employee_report_time = ?, employee_departure_time = ?, virtual_sessions_enabled = ?, kiosk_event_pin_hash = ?
     WHERE id = ? AND agency_id = ?`,
    [
      userId,
      organizationIdForRow,
      parsed.title,
      parsed.description || null,
      parsed.eventType || null,
      parsed.splashContent || null,
      parsed.publicHeroImageUrl,
      parsed.publicListingDetails,
      parsed.inPersonPublic ? 1 : 0,
      parsed.publicLocationAddress,
      geo.lat != null ? geo.lat : null,
      geo.lng != null ? geo.lng : null,
      parsed.publicAgeMin != null ? parsed.publicAgeMin : null,
      parsed.publicAgeMax != null ? parsed.publicAgeMax : null,
      parsed.startsAt,
      parsed.endsAt,
      parsed.timezone,
      JSON.stringify(parsed.recurrence),
      parsed.isActive ? 1 : 0,
      parsed.rsvpMode || 'none',
      JSON.stringify(parsed.votingConfig),
      JSON.stringify(parsed.reminderConfig),
      parsed.votingClosedAt || null,
      parsed.smsCode,
      parsed.skillBuilderDirectHours,
      parsed.registrationEligible ? 1 : 0,
      parsed.medicaidEligible ? 1 : 0,
      parsed.cashEligible ? 1 : 0,
      parsed.clientCheckInDisplayTime,
      parsed.clientCheckOutDisplayTime,
      parsed.employeeReportTime,
      parsed.employeeDepartureTime,
      parsed.virtualSessionsEnabled ? 1 : 0,
      nextKioskPinHash,
      eventId,
      agencyId
    ]
  );
  await setEventAudience(eventId, parsed.audience);

  try {
    await syncIntegratedSkillsGroupAfterCompanyEventSave(pool, agencyId, eventId);
  } catch (syncErr) {
    console.error('[persistCompanyEventUpdate] Skill Builders session sync failed', {
      agencyId,
      eventId,
      message: syncErr?.message
    });
    return {
      error: {
        status: Number(syncErr?.statusCode) === 400 ? 400 : 500,
        message:
          syncErr?.message ||
          'Event was saved but Skill Builders sessions (materials / schedule) could not be rebuilt. Try saving again or contact support.'
      }
    };
  }

  const row = await loadEventByIdForAgency(eventId, agencyId);
  const event = mapEventRow(row || {}, req);
  const audience = await getAudienceForEvent(eventId);
  const responseSummary = await listEventResponseSummary(eventId);
  return { ok: true, data: { ...event, audience, responseSummary } };
}

export const updateCompanyEvent = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const eventId = parsePositiveInt(req.params.eventId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !eventId || !userId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    if (!userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin or staff access required' } });
    }

    const result = await persistCompanyEventUpdate(req, agencyId, eventId, req.body);
    if (result.error) {
      return res.status(result.error.status).json({ error: { message: result.error.message } });
    }
    res.json(result.data);
  } catch (error) {
    next(error);
  }
};

export const deleteCompanyEvent = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    if (!userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin or staff access required' } });
    }
    const [result] = await pool.execute(
      'DELETE FROM company_events WHERE id = ? AND agency_id = ?',
      [eventId, agencyId]
    );
    if (!result?.affectedRows) return res.status(404).json({ error: { message: 'Company event not found' } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const listCompanyEventResponses = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    if (!userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin or staff access required' } });
    }
    const event = await loadEventByIdForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Company event not found' } });

    const [rows] = await pool.execute(
      `SELECT cer.*, u.first_name, u.last_name, u.email
       FROM company_event_responses cer
       JOIN users u ON u.id = cer.user_id
       WHERE cer.company_event_id = ?
       ORDER BY cer.received_at DESC, cer.id DESC`,
      [eventId]
    );
    const summary = await listEventResponseSummary(eventId);
    res.json({
      summary,
      responses: (rows || []).map((row) => ({
        userId: Number(row.user_id),
        name: `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim() || row.email,
        responseKey: row.response_key,
        responseLabel: row.response_label || row.response_key,
        source: row.source,
        receivedAt: row.received_at
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const listCompanyEventDeliveryLogs = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId)) || !userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin/staff access required' } });
    }
    const event = await loadEventByIdForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Company event not found' } });
    const [rows] = await pool.execute(
      `SELECT l.*, u.first_name, u.last_name, u.email
       FROM company_event_dispatch_logs l
       JOIN users u ON u.id = l.user_id
       WHERE l.company_event_id = ?
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 2000`,
      [eventId]
    );
    res.json({
      summary: await getEventDeliverySummary(eventId),
      logs: (rows || []).map((row) => ({
        id: Number(row.id),
        userId: Number(row.user_id),
        name: `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim() || row.email,
        channel: row.channel,
        dispatchType: row.dispatch_type,
        occurrenceKey: row.occurrence_key,
        status: row.status,
        statusReason: row.status_reason || null,
        twilioSid: row.twilio_sid || null,
        sentAt: row.sent_at || null,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const getCompanyEventAnalytics = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId)) || !userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin/staff access required' } });
    }
    const row = await loadEventByIdForAgency(eventId, agencyId);
    if (!row) return res.status(404).json({ error: { message: 'Company event not found' } });
    const event = mapEventRow(row, req);
    const audience = await getAudienceForEvent(eventId);
    const recipients = await resolveRecipientUserIds(agencyId, eventId, audience);
    const summary = await listEventResponseSummary(eventId);
    const totalResponses = summary.reduce((acc, item) => acc + Number(item.total || 0), 0);
    const noResponseCount = Math.max(0, recipients.length - totalResponses);
    const deliverySummary = await getEventDeliverySummary(eventId);
    res.json({
      eventId,
      audienceCount: recipients.length,
      totalResponses,
      noResponseCount,
      responseRate: recipients.length ? Number((totalResponses / recipients.length).toFixed(4)) : 0,
      responseSummary: summary,
      deliverySummary,
      votingClosedAt: event.votingClosedAt || null
    });
  } catch (error) {
    next(error);
  }
};

export const exportCompanyEventResponsesCsv = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId)) || !userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin/staff access required' } });
    }
    const event = await loadEventByIdForAgency(eventId, agencyId);
    if (!event) return res.status(404).json({ error: { message: 'Company event not found' } });
    const [rows] = await pool.execute(
      `SELECT cer.response_key, cer.response_label, cer.source, cer.received_at, u.first_name, u.last_name, u.email
       FROM company_event_responses cer
       JOIN users u ON u.id = cer.user_id
       WHERE cer.company_event_id = ?
       ORDER BY cer.received_at DESC`,
      [eventId]
    );
    const header = 'name,email,response_key,response_label,source,received_at';
    const lines = (rows || []).map((row) => {
      const name = `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim();
      const values = [
        name,
        row.email || '',
        row.response_key || '',
        row.response_label || '',
        row.source || '',
        row.received_at ? new Date(row.received_at).toISOString() : ''
      ];
      return values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="company-event-${eventId}-responses.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

export const closeCompanyEventVoting = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    if (!userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin or staff access required' } });
    }
    const [result] = await pool.execute(
      'UPDATE company_events SET voting_closed_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ?',
      [eventId, agencyId]
    );
    if (!result?.affectedRows) return res.status(404).json({ error: { message: 'Company event not found' } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const sendCompanyEventVotingSms = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    if (!userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin or staff access required' } });
    }

    const row = await loadEventByIdForAgency(eventId, agencyId);
    if (!row) return res.status(404).json({ error: { message: 'Company event not found' } });
    const event = mapEventRow(row, req);
    if (!event.votingConfig.enabled || !event.votingConfig.viaSms) {
      return res.status(400).json({ error: { message: 'SMS voting is not enabled for this event' } });
    }
    if (event.votingClosedAt) {
      return res.status(400).json({ error: { message: 'Voting is already closed for this event' } });
    }

    const audience = await getAudienceForEvent(eventId);
    const recipientIds = await resolveRecipientUserIds(agencyId, eventId, audience);
    if (!recipientIds.length) return res.status(400).json({ error: { message: 'No recipients found for this event audience' } });

    const users = await listEligibleSmsUsersForAgency(agencyId);
    const recipientMap = new Map(users.map((user) => [Number(user.id), user]));
    const smsSettings = await getCompanyEventSmsSettingsForAgency(agencyId);
    if (!smsSettings.enabled) {
      return res.status(400).json({ error: { message: 'Company event SMS is disabled for this agency settings' } });
    }
    const fromNumber = smsSettings.fromNumber;
    if (!fromNumber) {
      return res.status(400).json({ error: { message: 'Company event sender number is not configured in agency SMS settings' } });
    }

    const question = event.votingConfig.question || event.title;
    const body = `${question}\n${companyEventSmsInstructions(event)}`;
    const occurrenceKey = formatOccurrenceKey(event.nextOccurrenceStart || event.startsAt);
    let sentCount = 0;
    for (const userId of recipientIds) {
      const recipient = recipientMap.get(Number(userId));
      if (!recipient) continue;
      const toRaw = recipient.phone_number || recipient.personal_phone || recipient.work_phone || null;
      const to = MessageLog.normalizePhone(toRaw);
      if (!to) {
        await writeDispatchLog({
          eventId,
          userId: Number(userId),
          channel: 'sms',
          dispatchType: 'vote_invite',
          occurrenceKey,
          status: 'skipped',
          statusReason: 'no_phone',
          payload: { body }
        });
        continue;
      }
      let comm = null;
      try {
        comm = await UserCommunication.create({
          userId: Number(userId),
          agencyId,
          templateType: 'company_event_vote',
          templateId: eventId,
          subject: null,
          body,
          generatedByUserId: req.user?.id || null,
          channel: 'sms',
          recipientAddress: to,
          deliveryStatus: 'pending'
        });
      } catch (e) {
        console.warn('UserCommunication create (vote SMS) failed:', e?.message);
      }
      try {
        const sendResult = await TwilioService.sendSms({ to, from: fromNumber, body });
        await writeDispatchLog({
          eventId,
          userId: Number(userId),
          channel: 'sms',
          dispatchType: 'vote_invite',
          occurrenceKey,
          status: 'sent',
          twilioSid: sendResult?.sid || null,
          payload: { body, to },
          sentAt: new Date()
        });
        if (comm?.id) {
          await UserCommunication.updateDeliveryStatus(comm.id, 'sent', sendResult?.sid || null);
        }
        sentCount += 1;
      } catch (error) {
        await writeDispatchLog({
          eventId,
          userId: Number(userId),
          channel: 'sms',
          dispatchType: 'vote_invite',
          occurrenceKey,
          status: 'failed',
          statusReason: String(error?.message || 'send_failed').slice(0, 255),
          payload: { body, to }
        });
        if (comm?.id) {
          await UserCommunication.updateDeliveryStatus(
            comm.id,
            'failed',
            null,
            null,
            String(error?.message || 'send_failed').slice(0, 500)
          );
        }
      }
    }
    res.json({ ok: true, sentCount });
  } catch (error) {
    next(error);
  }
};

export const sendCompanyEventDirectMessage = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    if (!userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin or staff access required' } });
    }

    const row = await loadEventByIdForAgency(eventId, agencyId);
    if (!row) return res.status(404).json({ error: { message: 'Company event not found' } });
    const event = mapEventRow(row, req);
    const overrideUserIds = normalizeIds(req.body?.recipientUserIds);
    const overrideGroupIds = normalizeIds(req.body?.recipientGroupIds);
    const overrideRoleKeys = normalizeRoleAudience(req.body?.recipientRoleKeys);
    const hasOverrideAudience = overrideUserIds.length > 0 || overrideGroupIds.length > 0 || overrideRoleKeys.length > 0;
    const audience = await getAudienceForEvent(eventId);
    const recipientIds = hasOverrideAudience
      ? await resolveUsersFromOverride({ agencyId, userIds: overrideUserIds, groupIds: overrideGroupIds, roleKeys: overrideRoleKeys })
      : await resolveRecipientUserIds(agencyId, eventId, audience);
    if (!recipientIds.length) return res.status(400).json({ error: { message: 'No recipients found for this event audience' } });

    let title = String(req.body?.title || event.title || 'Company message').trim().slice(0, 255);
    let message = String(req.body?.message || event.splashContent || event.description || '').trim();
    const templateId = parsePositiveInt(req.body?.templateId);
    if (templateId) {
      const [tplRows] = await pool.execute(
        `SELECT title_template, message_template
         FROM company_event_message_templates
         WHERE id = ? AND agency_id = ? AND is_active = 1
         LIMIT 1`,
        [templateId, agencyId]
      );
      const template = tplRows?.[0];
      if (!template) return res.status(404).json({ error: { message: 'Template not found' } });
      title = String(template.title_template || '').trim().slice(0, 255) || title;
      message = String(template.message_template || '').trim() || message;
    }
    if (!message) return res.status(400).json({ error: { message: 'message is required' } });
    const sendInApp = req.body?.sendInApp !== false;
    const sendSms = req.body?.sendSms !== false;
    const occurrenceKey = formatOccurrenceKey(event.nextOccurrenceStart || event.startsAt);
    const [agencyRows] = await pool.execute('SELECT id, name FROM agencies WHERE id = ? LIMIT 1', [agencyId]);
    const agency = agencyRows?.[0] || { id: agencyId, name: '' };

    let inAppCount = 0;
    if (sendInApp) {
      for (const userId of recipientIds) {
        try {
          const [userRows] = await pool.execute(
            'SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1',
            [userId]
          );
          const userRecord = userRows?.[0] || {};
          const resolvedTitle = applyTemplateVariables(title, { user: userRecord, event, agency });
          const resolvedMessage = applyTemplateVariables(message, { user: userRecord, event, agency });
          await createNotificationAndDispatch({
            type: 'company_event_message',
            title: resolvedTitle,
            message: resolvedMessage,
            userId,
            agencyId,
            relatedEntityType: 'company_event',
            relatedEntityId: eventId,
            actorSource: 'Company Events'
          });
          await writeDispatchLog({
            eventId,
            userId: Number(userId),
            channel: 'in_app',
            dispatchType: 'direct_message',
            occurrenceKey,
            status: 'sent',
            payload: { title: resolvedTitle, message: resolvedMessage },
            sentAt: new Date()
          });
          inAppCount += 1;
        } catch (error) {
          await writeDispatchLog({
            eventId,
            userId: Number(userId),
            channel: 'in_app',
            dispatchType: 'direct_message',
            occurrenceKey,
            status: 'failed',
            statusReason: String(error?.message || 'in_app_failed').slice(0, 255)
          });
        }
      }
    }

    let smsCount = 0;
    if (sendSms) {
      const users = await listEligibleSmsUsersForAgency(agencyId);
      const recipientMap = new Map(users.map((user) => [Number(user.id), user]));
      const smsSettings = await getCompanyEventSmsSettingsForAgency(agencyId);
      const fromNumber = smsSettings.fromNumber;
      if (!fromNumber) {
        return res.status(400).json({ error: { message: 'Company event sender number is not configured in agency SMS settings' } });
      }
      if (fromNumber) {
        for (const userId of recipientIds) {
          const recipient = recipientMap.get(Number(userId));
          if (!recipient) continue;
          const toRaw = recipient.phone_number || recipient.personal_phone || recipient.work_phone || null;
          const to = MessageLog.normalizePhone(toRaw);
          if (!to) {
            await writeDispatchLog({
              eventId,
              userId: Number(userId),
              channel: 'sms',
              dispatchType: 'direct_message',
              occurrenceKey,
              status: 'skipped',
              statusReason: 'no_phone'
            });
            continue;
          }
          try {
            const [userRows] = await pool.execute(
              'SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1',
              [userId]
            );
            const userRecord = userRows?.[0] || {};
            const resolvedTitle = applyTemplateVariables(title, { user: userRecord, event, agency });
            const resolvedMessage = applyTemplateVariables(message, { user: userRecord, event, agency });
            const smsBody = `${resolvedTitle}\n${resolvedMessage}`.slice(0, 480);
            const sendResult = await TwilioService.sendSms({ to, from: fromNumber, body: smsBody });
            await writeDispatchLog({
              eventId,
              userId: Number(userId),
              channel: 'sms',
              dispatchType: 'direct_message',
              occurrenceKey,
              status: 'sent',
              twilioSid: sendResult?.sid || null,
              payload: { body: smsBody, to },
              sentAt: new Date()
            });
            smsCount += 1;
          } catch (error) {
            await writeDispatchLog({
              eventId,
              userId: Number(userId),
              channel: 'sms',
              dispatchType: 'direct_message',
              occurrenceKey,
              status: 'failed',
              statusReason: String(error?.message || 'send_failed').slice(0, 255),
              payload: { to }
            });
          }
        }
      }
    }

    res.json({ ok: true, inAppCount, smsCount });
  } catch (error) {
    next(error);
  }
};

export const listMyCompanyEvents = async (req, res, next) => {
  try {
    const userId = parsePositiveInt(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const agencies = await User.getAgencies(userId);
    const agencyIds = [...new Set((agencies || []).map((agency) => Number(agency?.id)).filter((id) => id > 0))];
    const visible = await listEventsVisibleToUser(userId, agencyIds);
    const events = visible.map(({ row, audience }) => ({
      ...mapEventRow(row, req, { myEndpoint: true }),
      audience
    }));
    const responseMap = await fetchResponseMap(events.map((event) => event.id), userId);
    res.json(events.map((event) => ({
      ...event,
      myResponse: responseMap.get(`${event.id}:${userId}`) || null
    })));
  } catch (error) {
    next(error);
  }
};

export const respondToMyCompanyEvent = async (req, res, next) => {
  try {
    const userId = parsePositiveInt(req.user?.id);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!userId || !eventId) return res.status(400).json({ error: { message: 'Invalid request' } });
    const agencies = await User.getAgencies(userId);
    const agencyIds = [...new Set((agencies || []).map((agency) => Number(agency?.id)).filter((id) => id > 0))];
    const visible = await listEventsVisibleToUser(userId, agencyIds);
    const target = visible.find(({ row }) => Number(row.id) === eventId);
    if (!target) return res.status(404).json({ error: { message: 'Company event not found' } });

    const event = mapEventRow(target.row, req, { myEndpoint: true });
    if (!event.votingConfig.enabled) {
      return res.status(400).json({ error: { message: 'RSVP/Voting is not enabled for this event' } });
    }
    if (event.votingClosedAt) {
      return res.status(400).json({ error: { message: 'Voting is closed for this event' } });
    }
    const parsed = parseResponseInput(req.body?.responseKey || req.body?.response || '', event.votingConfig.options);
    if (!parsed) {
      return res.status(400).json({ error: { message: 'Invalid response option' } });
    }

    await pool.execute(
      `INSERT INTO company_event_responses
       (company_event_id, user_id, response_key, response_label, response_body, source, received_at)
       VALUES (?, ?, ?, ?, ?, 'in_app', NOW())
       ON DUPLICATE KEY UPDATE
         response_key = VALUES(response_key),
         response_label = VALUES(response_label),
         response_body = VALUES(response_body),
         source = VALUES(source),
         received_at = VALUES(received_at)`,
      [eventId, userId, parsed.key, parsed.label, parsed.raw]
    );
    res.json({ ok: true, responseKey: parsed.key, responseLabel: parsed.label });
  } catch (error) {
    next(error);
  }
};

async function resolveIcsEventForUser({ eventId, userId }) {
  const agencies = await User.getAgencies(userId);
  const agencyIds = [...new Set((agencies || []).map((agency) => Number(agency?.id)).filter((id) => id > 0))];
  const visible = await listEventsVisibleToUser(userId, agencyIds);
  const target = visible.find(({ row }) => Number(row.id) === Number(eventId));
  return target?.row || null;
}

export const downloadCompanyEventIcsForMe = async (req, res, next) => {
  try {
    const userId = parsePositiveInt(req.user?.id);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!userId || !eventId) return res.status(400).json({ error: { message: 'Invalid request' } });
    const row = await resolveIcsEventForUser({ eventId, userId });
    if (!row) return res.status(404).json({ error: { message: 'Company event not found' } });
    const event = mapEventRow(row, req, { myEndpoint: true });
    const ics = buildEventIcs(event);
    if (!ics) return res.status(400).json({ error: { message: 'Could not generate calendar file' } });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="company-event-${event.id}.ics"`);
    res.send(ics);
  } catch (error) {
    next(error);
  }
};

export const downloadCompanyEventIcsForAgency = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const eventId = parsePositiveInt(req.params.eventId);
    if (!agencyId || !eventId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Not authorized for this agency' } });
    }
    const row = await loadEventByIdForAgency(eventId, agencyId);
    if (!row) return res.status(404).json({ error: { message: 'Company event not found' } });
    const event = mapEventRow(row, req);
    const ics = buildEventIcs(event);
    if (!ics) return res.status(400).json({ error: { message: 'Could not generate calendar file' } });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="company-event-${event.id}.ics"`);
    res.send(ics);
  } catch (error) {
    next(error);
  }
};

export const listCompanyEventTemplates = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    if (!(await userHasAgencyAccess(req, agencyId)) || !userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin/staff access required' } });
    }
    const [rows] = await pool.execute(
      `SELECT id, name, title_template, message_template, is_active, updated_at
       FROM company_event_message_templates
       WHERE agency_id = ?
       ORDER BY is_active DESC, name ASC`,
      [agencyId]
    );
    res.json((rows || []).map((row) => ({
      id: Number(row.id),
      name: row.name,
      titleTemplate: row.title_template,
      messageTemplate: row.message_template,
      isActive: !!row.is_active,
      updatedAt: row.updated_at
    })));
  } catch (error) {
    next(error);
  }
};

export const createCompanyEventTemplate = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !userId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId)) || !userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin/staff access required' } });
    }
    const name = String(req.body?.name || '').trim().slice(0, 120);
    const titleTemplate = String(req.body?.titleTemplate || '').trim().slice(0, 255);
    const messageTemplate = String(req.body?.messageTemplate || '').trim();
    const isActive = req.body?.isActive !== false;
    if (!name || !titleTemplate || !messageTemplate) {
      return res.status(400).json({ error: { message: 'name, titleTemplate and messageTemplate are required' } });
    }
    const [result] = await pool.execute(
      `INSERT INTO company_event_message_templates
       (agency_id, name, title_template, message_template, is_active, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [agencyId, name, titleTemplate, messageTemplate, isActive ? 1 : 0, userId, userId]
    );
    res.status(201).json({ id: Number(result.insertId), ok: true });
  } catch (error) {
    next(error);
  }
};

export const updateCompanyEventTemplate = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const templateId = parsePositiveInt(req.params.templateId);
    const userId = parsePositiveInt(req.user?.id);
    if (!agencyId || !templateId || !userId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId)) || !userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin/staff access required' } });
    }
    const name = String(req.body?.name || '').trim().slice(0, 120);
    const titleTemplate = String(req.body?.titleTemplate || '').trim().slice(0, 255);
    const messageTemplate = String(req.body?.messageTemplate || '').trim();
    const isActive = req.body?.isActive !== false;
    if (!name || !titleTemplate || !messageTemplate) {
      return res.status(400).json({ error: { message: 'name, titleTemplate and messageTemplate are required' } });
    }
    const [result] = await pool.execute(
      `UPDATE company_event_message_templates
       SET name = ?, title_template = ?, message_template = ?, is_active = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND agency_id = ?`,
      [name, titleTemplate, messageTemplate, isActive ? 1 : 0, userId, templateId, agencyId]
    );
    if (!result?.affectedRows) return res.status(404).json({ error: { message: 'Template not found' } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const deleteCompanyEventTemplate = async (req, res, next) => {
  try {
    const agencyId = parsePositiveInt(req.params.id);
    const templateId = parsePositiveInt(req.params.templateId);
    if (!agencyId || !templateId) return res.status(400).json({ error: { message: 'Invalid request' } });
    if (!(await userHasAgencyAccess(req, agencyId)) || !userCanManageCompanyEvents(req)) {
      return res.status(403).json({ error: { message: 'Admin/staff access required' } });
    }
    const [result] = await pool.execute(
      'DELETE FROM company_event_message_templates WHERE id = ? AND agency_id = ?',
      [templateId, agencyId]
    );
    if (!result?.affectedRows) return res.status(404).json({ error: { message: 'Template not found' } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const processCompanyEventResponseReminders = async () => {
  const [rows] = await pool.execute(
    `SELECT *
     FROM company_events
     WHERE is_active = 1
       AND voting_closed_at IS NULL
       AND JSON_EXTRACT(voting_config_json, '$.enabled') = TRUE
       AND JSON_EXTRACT(reminder_config_json, '$.enabled') = TRUE
     ORDER BY starts_at ASC
     LIMIT 300`
  );
  for (const row of rows || []) {
    const event = mapEventRow(row, null);
    const targetStart = new Date(event.nextOccurrenceStart || event.startsAt);
    if (!Number.isFinite(targetStart.getTime())) continue;
    const reminderConfig = parseReminderConfig(event.reminderConfig);
    if (!reminderConfig.enabled) continue;
    const now = Date.now();
    const occurrenceKey = formatOccurrenceKey(targetStart);
    const audience = await getAudienceForEvent(event.id);
    const recipients = await resolveRecipientUserIds(event.agencyId, event.id, audience);
    if (!recipients.length) continue;
    const placeholders = recipients.map(() => '?').join(', ');
    const [respondedRows] = await pool.execute(
      `SELECT DISTINCT user_id
       FROM company_event_responses
       WHERE company_event_id = ?
         AND user_id IN (${placeholders})`,
      [event.id, ...recipients]
    );
    const responded = new Set((respondedRows || []).map((r) => Number(r.user_id)));
    const pendingUsers = recipients.filter((id) => !responded.has(Number(id)));
    if (!pendingUsers.length) continue;

    for (const offsetHours of reminderConfig.offsetsHours) {
      const fireAt = targetStart.getTime() - (offsetHours * 60 * 60 * 1000);
      if (now < fireAt || now > (fireAt + 10 * 60 * 1000)) continue;
      const dispatchType = `reminder_${offsetHours}h`;
      const pendingPlaceholders = pendingUsers.map(() => '?').join(', ');
      const [alreadyRows] = await pool.execute(
        `SELECT DISTINCT user_id
         FROM company_event_dispatch_logs
         WHERE company_event_id = ?
           AND dispatch_type = ?
           AND occurrence_key = ?
           AND user_id IN (${pendingPlaceholders})
           AND status = 'sent'`,
        [event.id, dispatchType, occurrenceKey, ...pendingUsers]
      );
      const already = new Set((alreadyRows || []).map((r) => Number(r.user_id)));
      const targets = pendingUsers.filter((id) => !already.has(Number(id)));
      if (!targets.length) continue;
      const [agencyRows] = await pool.execute('SELECT id, name FROM agencies WHERE id = ? LIMIT 1', [event.agencyId]);
      const agency = agencyRows?.[0] || {};
      let smsUsers = [];
      let recipientMap = new Map();
      let fromNumber = null;
      if (reminderConfig.channels.sms) {
        smsUsers = await listEligibleSmsUsersForAgency(event.agencyId);
        recipientMap = new Map(smsUsers.map((u) => [Number(u.id), u]));
        const smsSettings = await getCompanyEventSmsSettingsForAgency(event.agencyId);
        fromNumber = smsSettings.fromNumber;
      }
      for (const userId of targets) {
        const [userRows] = await pool.execute('SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1', [userId]);
        const user = userRows?.[0] || {};
        const title = applyTemplateVariables('Reminder: {eventTitle}', { event, user, agency });
        const message = applyTemplateVariables(`Please RSVP for ${event.title}.`, { event, user, agency });
        if (reminderConfig.channels.inApp) {
          try {
            await createNotificationAndDispatch({
              type: 'company_event_message',
              title,
              message,
              userId,
              agencyId: event.agencyId,
              relatedEntityType: 'company_event',
              relatedEntityId: event.id,
              actorSource: 'Company Events'
            });
            await writeDispatchLog({
              eventId: event.id,
              userId: Number(userId),
              channel: 'in_app',
              dispatchType,
              occurrenceKey,
              status: 'sent',
              payload: { title, message },
              sentAt: new Date()
            });
          } catch (error) {
            await writeDispatchLog({
              eventId: event.id,
              userId: Number(userId),
              channel: 'in_app',
              dispatchType,
              occurrenceKey,
              status: 'failed',
              statusReason: String(error?.message || 'in_app_failed').slice(0, 255)
            });
          }
        }
        if (reminderConfig.channels.sms && fromNumber) {
          const recipient = recipientMap.get(Number(userId));
          const to = MessageLog.normalizePhone(recipient?.phone_number || recipient?.personal_phone || recipient?.work_phone || null);
          if (!to) {
            await writeDispatchLog({
              eventId: event.id,
              userId: Number(userId),
              channel: 'sms',
              dispatchType,
              occurrenceKey,
              status: 'skipped',
              statusReason: 'no_phone'
            });
          } else {
            try {
              const smsBody = `${title}\n${message}`.slice(0, 480);
              const sendResult = await TwilioService.sendSms({ to, from: fromNumber, body: smsBody });
              await writeDispatchLog({
                eventId: event.id,
                userId: Number(userId),
                channel: 'sms',
                dispatchType,
                occurrenceKey,
                status: 'sent',
                twilioSid: sendResult?.sid || null,
                payload: { body: smsBody, to },
                sentAt: new Date()
              });
            } catch (error) {
              await writeDispatchLog({
                eventId: event.id,
                userId: Number(userId),
                channel: 'sms',
                dispatchType,
                occurrenceKey,
                status: 'failed',
                statusReason: String(error?.message || 'send_failed').slice(0, 255)
              });
            }
          }
        }
      }
    }
  }
};

export const handleCompanyEventInbound = async ({ from, to, body }) => {
  const agencyId = await findAgencyByCompanyEventShortCode(to);
  if (!agencyId) return null;

  const user = await findAgencyUserByPhone(agencyId, from);
  if (!user) return { handled: true, responseMessage: 'Thanks! We could not match your number.' };

  const activeEvents = await getActiveSmsVotingEvents(agencyId);
  if (!activeEvents.length) return { handled: true, responseMessage: 'Thanks! There is no active event vote right now.' };

  const rawText = String(body || '').trim();
  const [tokenA = '', tokenB = ''] = rawText.split(/\s+/, 2);
  let targetEvent = null;
  let responseToken = '';

  for (const row of activeEvents) {
    const mapped = mapEventRow(row, null);
    if (mapped.smsCode && tokenA.toUpperCase() === mapped.smsCode.toUpperCase()) {
      targetEvent = mapped;
      responseToken = tokenB;
      break;
    }
  }
  if (!targetEvent && activeEvents.length === 1) {
    targetEvent = mapEventRow(activeEvents[0], null);
    responseToken = tokenA;
  }
  if (!targetEvent) {
    const availableCodes = activeEvents.map((row) => mapEventRow(row, null).smsCode).filter(Boolean).join(', ');
    return { handled: true, responseMessage: `Reply with "<code> <option>". Active codes: ${availableCodes}` };
  }

  const audience = await getAudienceForEvent(targetEvent.id);
  const allowed = await userIsInAudience({ userId: Number(user.id), audience });
  if (!allowed) return { handled: true, responseMessage: 'Thanks! You are not in this event audience.' };

  const parsed = parseResponseInput(responseToken, targetEvent.votingConfig.options);
  if (!parsed) {
    return { handled: true, responseMessage: companyEventSmsInstructions(targetEvent) };
  }

  await pool.execute(
    `INSERT INTO company_event_responses
     (company_event_id, user_id, response_key, response_label, response_body, source, from_number, received_at)
     VALUES (?, ?, ?, ?, ?, 'sms', ?, NOW())
     ON DUPLICATE KEY UPDATE
       response_key = VALUES(response_key),
       response_label = VALUES(response_label),
       response_body = VALUES(response_body),
       source = VALUES(source),
       from_number = VALUES(from_number),
       received_at = VALUES(received_at)`,
    [targetEvent.id, Number(user.id), parsed.key, parsed.label, parsed.raw, MessageLog.normalizePhone(from) || from]
  );
  return { handled: true, responseMessage: `Thanks! Recorded: ${parsed.label}.` };
};
