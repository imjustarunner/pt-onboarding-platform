import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import MessageLog from '../models/MessageLog.model.js';
import TwilioService from '../services/twilio.service.js';
import { resolveOutboundNumber } from '../services/twilioNumberRouting.service.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';
import {
  parseJsonMaybe,
  normalizeRecurrence,
  makeGoogleCalendarUrl,
  buildEventIcs,
  computeNextOccurrence
} from '../services/companyEvents.service.js';

const DEFAULT_RSVP_OPTIONS = [
  { key: '1', label: 'Yes' },
  { key: '2', label: 'No' },
  { key: '3', label: 'Maybe' }
];

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
  const startsAt = row.starts_at;
  const endsAt = row.ends_at;
  const id = Number(row.id);
  const agencyId = Number(row.agency_id);
  const base = {
    id,
    agencyId,
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
    votingClosedAt: row.voting_closed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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
      map.set(eventId, { all: false, userIds: [], groupIds: [] });
    }
    const entry = map.get(eventId);
    if (row.audience_type === 'user') entry.userIds.push(Number(row.target_id));
    if (row.audience_type === 'group') entry.groupIds.push(Number(row.target_id));
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

async function setEventAudience(eventId, { userIds, groupIds }) {
  await pool.execute('DELETE FROM company_event_audiences WHERE company_event_id = ?', [eventId]);
  const users = normalizeIds(userIds);
  const groups = normalizeIds(groupIds);
  const inserts = [];
  for (const userId of users) inserts.push([eventId, 'user', userId]);
  for (const groupId of groups) inserts.push([eventId, 'group', groupId]);
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
  const votingClosedAtRaw = body.votingClosedAt || body.voting_closed_at || null;
  const votingClosedAt = votingClosedAtRaw ? new Date(votingClosedAtRaw) : null;
  const smsCodeRaw = String(body.smsCode || body.sms_code || '').trim();
  const smsCode = smsCodeRaw ? smsCodeRaw.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase().slice(0, 32) : null;

  if (!title) return { error: 'title is required' };
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    return { error: 'startsAt and endsAt are required and must be valid dates' };
  }
  if (endsAt <= startsAt) return { error: 'endsAt must be after startsAt' };
  if (votingClosedAtRaw && !Number.isFinite(votingClosedAt?.getTime())) return { error: 'Invalid votingClosedAt value' };
  if (votingConfig.viaSms && !smsCode) return { error: 'smsCode is required when SMS voting is enabled' };

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
    votingClosedAt,
    smsCode,
    audience: {
      userIds: normalizeIds(audience.userIds),
      groupIds: normalizeIds(audience.groupIds)
    }
  };
}

async function getAudienceForEvent(eventId) {
  const map = await fetchAudienceMap([eventId]);
  return map.get(eventId) || { all: true, userIds: [], groupIds: [] };
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
  if (!audience || (audience.userIds.length === 0 && audience.groupIds.length === 0)) return true;
  if (audience.userIds.includes(userId)) return true;
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

  return rows.filter((row) => {
    const audience = audienceMap.get(Number(row.id));
    if (!audience) return true;
    if (audience.userIds.includes(userId)) return true;
    return audience.groupIds.some((groupId) => userGroupIds.has(Number(groupId)));
  }).map((row) => ({
    row,
    audience: audienceMap.get(Number(row.id)) || { all: true, userIds: [], groupIds: [] }
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
  if (!currentAudience.userIds.length && !currentAudience.groupIds.length) {
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
  return [...result].filter((id) => id > 0);
}

async function resolveUsersFromOverride({ agencyId, userIds = [], groupIds = [] }) {
  const directUsers = normalizeIds(userIds);
  const targetGroupIds = normalizeIds(groupIds);
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
    const candidate = String(flags.company_events_short_code || flags.company_events_shortcode || flags.agency_campaigns_short_code || flags.agency_campaigns_shortcode || '')
      .replace(/[^\d]/g, '');
    if (candidate && candidate === normalizedTo) {
      return Number(row.id);
    }
  }
  return null;
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
    for (const eventId of eventIds) {
      summaries.set(eventId, await listEventResponseSummary(eventId));
    }
    const withAudience = events.map((event) => ({
      ...event,
      audience: audienceMap.get(event.id) || { all: true, userIds: [], groupIds: [] },
      responseSummary: summaries.get(event.id) || []
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
      }))
    });
  } catch (error) {
    next(error);
  }
};

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

    const [insertResult] = await pool.execute(
      `INSERT INTO company_events
       (agency_id, created_by_user_id, updated_by_user_id, title, description, event_type, splash_content, starts_at, ends_at, timezone, recurrence_json, is_active, rsvp_mode, voting_config_json, voting_closed_at, sms_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        userId,
        userId,
        parsed.title,
        parsed.description || null,
        parsed.eventType || null,
        parsed.splashContent || null,
        parsed.startsAt,
        parsed.endsAt,
        parsed.timezone,
        JSON.stringify(parsed.recurrence),
        parsed.isActive ? 1 : 0,
        parsed.rsvpMode || 'none',
        JSON.stringify(parsed.votingConfig),
        parsed.votingClosedAt || null,
        parsed.smsCode
      ]
    );
    const eventId = Number(insertResult.insertId);
    await setEventAudience(eventId, parsed.audience);

    const row = await loadEventByIdForAgency(eventId, agencyId);
    const event = mapEventRow(row || {}, req);
    const audience = await getAudienceForEvent(eventId);
    res.status(201).json({ ...event, audience, responseSummary: [] });
  } catch (error) {
    next(error);
  }
};

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

    const existing = await loadEventByIdForAgency(eventId, agencyId);
    if (!existing) return res.status(404).json({ error: { message: 'Company event not found' } });

    const parsed = parseEventPayload(req.body || {});
    if (parsed.error) return res.status(400).json({ error: { message: parsed.error } });

    await pool.execute(
      `UPDATE company_events
       SET updated_by_user_id = ?, title = ?, description = ?, event_type = ?, splash_content = ?, starts_at = ?, ends_at = ?, timezone = ?, recurrence_json = ?, is_active = ?, rsvp_mode = ?, voting_config_json = ?, voting_closed_at = ?, sms_code = ?
       WHERE id = ? AND agency_id = ?`,
      [
        userId,
        parsed.title,
        parsed.description || null,
        parsed.eventType || null,
        parsed.splashContent || null,
        parsed.startsAt,
        parsed.endsAt,
        parsed.timezone,
        JSON.stringify(parsed.recurrence),
        parsed.isActive ? 1 : 0,
        parsed.rsvpMode || 'none',
        JSON.stringify(parsed.votingConfig),
        parsed.votingClosedAt || null,
        parsed.smsCode,
        eventId,
        agencyId
      ]
    );
    await setEventAudience(eventId, parsed.audience);

    const row = await loadEventByIdForAgency(eventId, agencyId);
    const event = mapEventRow(row || {}, req);
    const audience = await getAudienceForEvent(eventId);
    const responseSummary = await listEventResponseSummary(eventId);
    res.json({ ...event, audience, responseSummary });
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
    const outbound = await resolveOutboundNumber({ userId: req.user?.id });
    const fromNumber = outbound?.number?.phone_number || null;
    if (!fromNumber) return res.status(400).json({ error: { message: 'No outbound number configured' } });

    const question = event.votingConfig.question || event.title;
    const body = `${question}\n${companyEventSmsInstructions(event)}`;
    let sentCount = 0;
    for (const userId of recipientIds) {
      const recipient = recipientMap.get(Number(userId));
      if (!recipient) continue;
      const toRaw = recipient.phone_number || recipient.personal_phone || recipient.work_phone || null;
      const to = MessageLog.normalizePhone(toRaw);
      if (!to) continue;
      try {
        await TwilioService.sendSms({ to, from: fromNumber, body });
        sentCount += 1;
      } catch {
        // best-effort delivery
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
    const hasOverrideAudience = overrideUserIds.length > 0 || overrideGroupIds.length > 0;
    const audience = await getAudienceForEvent(eventId);
    const recipientIds = hasOverrideAudience
      ? await resolveUsersFromOverride({ agencyId, userIds: overrideUserIds, groupIds: overrideGroupIds })
      : await resolveRecipientUserIds(agencyId, eventId, audience);
    if (!recipientIds.length) return res.status(400).json({ error: { message: 'No recipients found for this event audience' } });

    const title = String(req.body?.title || event.title || 'Company message').trim().slice(0, 255);
    const message = String(req.body?.message || event.splashContent || event.description || '').trim();
    if (!message) return res.status(400).json({ error: { message: 'message is required' } });
    const sendInApp = req.body?.sendInApp !== false;
    const sendSms = req.body?.sendSms !== false;

    let inAppCount = 0;
    if (sendInApp) {
      for (const userId of recipientIds) {
        try {
          await createNotificationAndDispatch({
            type: 'company_event_message',
            title,
            message,
            userId,
            agencyId,
            relatedEntityType: 'company_event',
            relatedEntityId: eventId
          });
          inAppCount += 1;
        } catch {
          // best-effort delivery
        }
      }
    }

    let smsCount = 0;
    if (sendSms) {
      const users = await listEligibleSmsUsersForAgency(agencyId);
      const recipientMap = new Map(users.map((user) => [Number(user.id), user]));
      const outbound = await resolveOutboundNumber({ userId: req.user?.id });
      const fromNumber = outbound?.number?.phone_number || null;
      if (fromNumber) {
        const smsBody = `${title}\n${message}`.slice(0, 480);
        for (const userId of recipientIds) {
          const recipient = recipientMap.get(Number(userId));
          if (!recipient) continue;
          const toRaw = recipient.phone_number || recipient.personal_phone || recipient.work_phone || null;
          const to = MessageLog.normalizePhone(toRaw);
          if (!to) continue;
          try {
            await TwilioService.sendSms({ to, from: fromNumber, body: smsBody });
            smsCount += 1;
          } catch {
            // best-effort delivery
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
