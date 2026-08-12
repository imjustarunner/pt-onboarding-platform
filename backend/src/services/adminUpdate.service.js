import pool from '../config/database.js';
import crypto from 'crypto';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolveSenderIdentityForSend } from './emailSenderIdentityResolver.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import EmailTemplateService from './emailTemplate.service.js';
import {
  ADMIN_UPDATE_BUILTIN_TOPICS,
  ADMIN_UPDATE_COLORS,
  ADMIN_UPDATE_ICONS,
  ADMIN_UPDATE_TEMPLATE_TYPE,
  EXCLUDED_STAFF_ROLES,
  farewellBlurbForUserId,
  formatTenure,
  iconByKey
} from '../constants/adminUpdateCatalog.js';

const EXCLUDED_ROLE_SQL = EXCLUDED_STAFF_ROLES.map(() => '?').join(',');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function toMysqlDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function toDateOnly(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function backendPublicBase() {
  return String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || process.env.PUBLIC_URL || '')
    .trim()
    .replace(/\/$/, '');
}

function viewUrlForToken(agency, token) {
  const portal = EmailTemplateService.buildPortalUrl(agency);
  return `${String(portal || '').replace(/\/$/, '')}/admin-update/${encodeURIComponent(token)}`;
}

function publicApiBase() {
  const base = backendPublicBase();
  return base ? `${base}/api/public/admin-updates` : '/api/public/admin-updates';
}

function safeRedirectUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return null;
  if (u.startsWith('/') && !u.startsWith('//')) return u;
  try {
    const parsed = new URL(u);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {
    return null;
  }
  return null;
}

async function ensurePublicToken(updateId) {
  const [rows] = await pool.execute('SELECT public_token FROM admin_updates WHERE id = ? LIMIT 1', [updateId]);
  if (rows[0]?.public_token) return rows[0].public_token;
  const token = newToken();
  await pool.execute('UPDATE admin_updates SET public_token = ? WHERE id = ? AND public_token IS NULL', [token, updateId]);
  const [again] = await pool.execute('SELECT public_token FROM admin_updates WHERE id = ? LIMIT 1', [updateId]);
  return again[0]?.public_token || token;
}

export async function recordActivity({
  updateId,
  sendId = null,
  userId = null,
  channel,
  eventType,
  eventKey = null,
  durationMs = null,
  scrollPct = null
}) {
  await pool.execute(
    `INSERT INTO admin_update_activity
      (update_id, send_id, user_id, channel, event_type, event_key, duration_ms, scroll_pct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      updateId,
      sendId || null,
      userId || null,
      String(channel || 'public').slice(0, 32),
      String(eventType || 'view').slice(0, 32),
      eventKey ? String(eventKey).slice(0, 500) : null,
      durationMs == null ? null : Number(durationMs) || 0,
      scrollPct == null ? null : Math.max(0, Math.min(100, Number(scrollPct) || 0))
    ]
  );
}

async function resolveViewToken(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  const [sends] = await pool.execute(
    `SELECT s.*, u.agency_id, u.title, u.status, u.sent_html, u.public_token
     FROM admin_update_sends s
     JOIN admin_updates u ON u.id = s.update_id
     WHERE s.view_token = ? OR s.open_track_token = ?
     LIMIT 1`,
    [t, t]
  );
  if (sends[0]) {
    return { kind: 'send', send: sends[0], updateId: sends[0].update_id, agencyId: sends[0].agency_id };
  }
  const [updates] = await pool.execute(
    'SELECT * FROM admin_updates WHERE public_token = ? LIMIT 1',
    [t]
  );
  if (updates[0]) {
    return { kind: 'shared', update: updates[0], updateId: updates[0].id, agencyId: updates[0].agency_id };
  }
  return null;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+=(".*?"|'.*?'|[^\s>]+)/gi, '');
}

function parsePalette(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function brandColors(agency) {
  const palette = parsePalette(agency?.color_palette);
  const primary = palette.primary || palette.primaryColor || palette.primary_color || '#0f172a';
  const secondary = palette.secondary || palette.secondaryColor || '#0f766e';
  const accent = palette.accent || palette.accentColor || '#14b8a6';
  return { primary, secondary, accent };
}

function displayName(user) {
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || 'Team member';
}

function pickRecipientEmail(user) {
  const candidates = [user?.email, user?.username, user?.work_email, user?.personal_email]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => v.includes('@'));
  return candidates[0] || null;
}

async function getUpdateRow(agencyId, updateId) {
  const [rows] = await pool.execute(
    'SELECT * FROM admin_updates WHERE id = ? AND agency_id = ? LIMIT 1',
    [updateId, agencyId]
  );
  return rows[0] || null;
}

async function loadTopics(updateId) {
  const [rows] = await pool.execute(
    'SELECT * FROM admin_update_topics WHERE update_id = ? ORDER BY sort_order ASC, id ASC',
    [updateId]
  );
  return rows || [];
}

async function loadItemsForTopics(topicIds) {
  if (!topicIds.length) return [];
  const placeholders = topicIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT * FROM admin_update_items WHERE topic_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`,
    topicIds
  );
  return rows || [];
}

export async function hydrateUpdate(row) {
  if (!row) return null;
  const topics = await loadTopics(row.id);
  const items = await loadItemsForTopics(topics.map((t) => t.id));
  const itemsByTopic = new Map();
  for (const item of items) {
    const list = itemsByTopic.get(item.topic_id) || [];
    list.push(item);
    itemsByTopic.set(item.topic_id, list);
  }
  return {
    ...row,
    topics: topics.map((topic) => ({
      ...topic,
      enabled: Number(topic.enabled) === 1,
      is_builtin: Number(topic.is_builtin) === 1,
      items: itemsByTopic.get(topic.id) || []
    }))
  };
}

async function seedBuiltinTopics(updateId) {
  for (let i = 0; i < ADMIN_UPDATE_BUILTIN_TOPICS.length; i += 1) {
    const topic = ADMIN_UPDATE_BUILTIN_TOPICS[i];
    await pool.execute(
      `INSERT INTO admin_update_topics
        (update_id, topic_key, enabled, title, description, icon_key, color, sort_order, body_html, is_builtin)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, '', 1)`,
      [updateId, topic.key, topic.title, topic.description, topic.iconKey, topic.color, i]
    );
  }
}

export async function listUpdates(agencyId) {
  const [rows] = await pool.execute(
    `SELECT id, agency_id, title, status, scheduled_at, sent_at, created_at, updated_at
     FROM admin_updates
     WHERE agency_id = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT 50`,
    [agencyId]
  );
  return rows || [];
}

export async function getUpdate(agencyId, updateId) {
  const row = await getUpdateRow(agencyId, updateId);
  if (!row) throw httpError(404, 'Admin Update not found');
  return hydrateUpdate(row);
}

export async function createUpdate({ agencyId, createdByUserId, title } = {}) {
  const [result] = await pool.execute(
    `INSERT INTO admin_updates
      (agency_id, created_by_user_id, title, subtitle, greeting, intro_html,
       featured_enabled, support_enabled, support_title, support_body,
       footer_tagline, staffing_since, departures_since, public_token, delivery_mode, push_splash, status)
     VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, 'link', 1, 'draft')`,
    [
      agencyId,
      createdByUserId,
      String(title || 'Admin Updates').trim() || 'Admin Updates',
      'Company news, reminders, and key operational updates in one place.',
      'Hi team,',
      `Here’s your roundup of important updates and reminders across the organization. Thanks for all you do!`,
      'Questions or need help?',
      'We’re here for you.',
      'Stronger together. One team. One mission.',
      firstOfMonth(),
      firstOfMonth(),
      newToken()
    ]
  );
  const updateId = result.insertId;
  await seedBuiltinTopics(updateId);
  const created = await getUpdate(agencyId, updateId);
  await refreshPeople(agencyId, updateId);
  return getUpdate(agencyId, updateId) || created;
}

export async function updateDraft(agencyId, updateId, patch = {}) {
  const row = await getUpdateRow(agencyId, updateId);
  if (!row) throw httpError(404, 'Admin Update not found');
  if (row.status === 'sent') throw httpError(400, 'This Admin Update has already been sent');

  const map = {
    title: 'title',
    subtitle: 'subtitle',
    greeting: 'greeting',
    introHtml: 'intro_html',
    intro_html: 'intro_html',
    featuredEnabled: 'featured_enabled',
    featured_enabled: 'featured_enabled',
    featuredTitle: 'featured_title',
    featured_title: 'featured_title',
    featuredBody: 'featured_body',
    featured_body: 'featured_body',
    featuredCtaLabel: 'featured_cta_label',
    featured_cta_label: 'featured_cta_label',
    featuredCtaUrl: 'featured_cta_url',
    featured_cta_url: 'featured_cta_url',
    supportEnabled: 'support_enabled',
    support_enabled: 'support_enabled',
    supportTitle: 'support_title',
    support_title: 'support_title',
    supportBody: 'support_body',
    support_body: 'support_body',
    supportEmail: 'support_email',
    support_email: 'support_email',
    footerTagline: 'footer_tagline',
    footer_tagline: 'footer_tagline',
    staffingSince: 'staffing_since',
    staffing_since: 'staffing_since',
    departuresSince: 'departures_since',
    departures_since: 'departures_since',
    senderIdentityId: 'sender_identity_id',
    sender_identity_id: 'sender_identity_id',
    deliveryMode: 'delivery_mode',
    delivery_mode: 'delivery_mode',
    pushSplash: 'push_splash',
    push_splash: 'push_splash'
  };

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(map)) {
    if (patch[key] === undefined) continue;
    let value = patch[key];
    if (column.endsWith('_enabled')) value = value ? 1 : 0;
    if (column === 'staffing_since' || column === 'departures_since') value = toDateOnly(value);
    if (column === 'sender_identity_id') value = Number(value || 0) || null;
    if (column === 'delivery_mode') value = String(value || 'link').toLowerCase() === 'html' ? 'html' : 'link';
    if (column === 'push_splash') value = value ? 1 : 0;
    sets.push(`${column} = ?`);
    values.push(value);
  }
  if (!sets.length) return hydrateUpdate(row);
  values.push(updateId, agencyId);
  await pool.execute(
    `UPDATE admin_updates SET ${sets.join(', ')} WHERE id = ? AND agency_id = ?`,
    values
  );
  const datesChanged = patch.staffingSince !== undefined || patch.staffing_since !== undefined
    || patch.departuresSince !== undefined || patch.departures_since !== undefined;
  if (datesChanged) {
    await refreshPeople(agencyId, updateId);
  }
  return getUpdate(agencyId, updateId);
}

export async function deleteUpdate(agencyId, updateId) {
  const row = await getUpdateRow(agencyId, updateId);
  if (!row) throw httpError(404, 'Admin Update not found');
  if (row.status === 'sending') throw httpError(400, 'Cannot delete an Admin Update that is sending');
  await pool.execute('DELETE FROM admin_updates WHERE id = ? AND agency_id = ?', [updateId, agencyId]);
  return { ok: true };
}

export async function addTopic(agencyId, updateId, payload = {}) {
  const row = await getUpdateRow(agencyId, updateId);
  if (!row) throw httpError(404, 'Admin Update not found');
  const [countRows] = await pool.execute(
    'SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM admin_update_topics WHERE update_id = ?',
    [updateId]
  );
  const sortOrder = Number(countRows[0]?.max_sort || 0) + 1;
  const key = String(payload.topicKey || payload.topic_key || `custom_${Date.now()}`).trim().slice(0, 64);
  const [result] = await pool.execute(
    `INSERT INTO admin_update_topics
      (update_id, topic_key, enabled, title, description, icon_key, color, sort_order, body_html, is_builtin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      updateId,
      key,
      payload.enabled === false ? 0 : 1,
      String(payload.title || 'New topic').trim() || 'New topic',
      String(payload.description || '').trim(),
      String(payload.iconKey || payload.icon_key || 'spark').trim() || 'spark',
      String(payload.color || ADMIN_UPDATE_COLORS[0]).trim(),
      sortOrder,
      String(payload.bodyHtml || payload.body_html || '')
    ]
  );
  const [topics] = await pool.execute('SELECT * FROM admin_update_topics WHERE id = ?', [result.insertId]);
  return { ...topics[0], enabled: true, is_builtin: false, items: [] };
}

export async function updateTopic(agencyId, updateId, topicId, patch = {}) {
  await getUpdate(agencyId, updateId);
  const [existing] = await pool.execute(
    'SELECT * FROM admin_update_topics WHERE id = ? AND update_id = ? LIMIT 1',
    [topicId, updateId]
  );
  if (!existing[0]) throw httpError(404, 'Topic not found');
  const map = {
    enabled: 'enabled',
    title: 'title',
    description: 'description',
    iconKey: 'icon_key',
    icon_key: 'icon_key',
    color: 'color',
    sortOrder: 'sort_order',
    sort_order: 'sort_order',
    bodyHtml: 'body_html',
    body_html: 'body_html'
  };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(map)) {
    if (patch[key] === undefined) continue;
    let value = patch[key];
    if (column === 'enabled') value = value ? 1 : 0;
    sets.push(`${column} = ?`);
    values.push(value);
  }
  if (sets.length) {
    values.push(topicId, updateId);
    await pool.execute(
      `UPDATE admin_update_topics SET ${sets.join(', ')} WHERE id = ? AND update_id = ?`,
      values
    );
  }
  const [rows] = await pool.execute('SELECT * FROM admin_update_topics WHERE id = ?', [topicId]);
  return rows[0];
}

export async function deleteTopic(agencyId, updateId, topicId) {
  await getUpdate(agencyId, updateId);
  const [existing] = await pool.execute(
    'SELECT * FROM admin_update_topics WHERE id = ? AND update_id = ? LIMIT 1',
    [topicId, updateId]
  );
  if (!existing[0]) throw httpError(404, 'Topic not found');
  if (Number(existing[0].is_builtin) === 1) {
    throw httpError(400, 'Built-in topics cannot be deleted. Turn them off instead.');
  }
  await pool.execute('DELETE FROM admin_update_topics WHERE id = ? AND update_id = ?', [topicId, updateId]);
  return { ok: true };
}

export async function addItem(agencyId, updateId, topicId, payload = {}) {
  await getUpdate(agencyId, updateId);
  const [topics] = await pool.execute(
    'SELECT id FROM admin_update_topics WHERE id = ? AND update_id = ? LIMIT 1',
    [topicId, updateId]
  );
  if (!topics[0]) throw httpError(404, 'Topic not found');
  const [countRows] = await pool.execute(
    'SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM admin_update_items WHERE topic_id = ?',
    [topicId]
  );
  const [result] = await pool.execute(
    `INSERT INTO admin_update_items
      (topic_id, user_id, kind, display_name, role_title, photo_url, item_date, status_label,
       body_text, destination, tenure_text, link_url, link_label, included, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      topicId,
      payload.userId || payload.user_id || null,
      String(payload.kind || 'custom').slice(0, 32),
      String(payload.displayName || payload.display_name || 'New item').trim(),
      payload.roleTitle || payload.role_title || null,
      payload.photoUrl || payload.photo_url || null,
      toDateOnly(payload.itemDate || payload.item_date),
      payload.statusLabel || payload.status_label || null,
      payload.bodyText || payload.body_text || '',
      payload.destination || null,
      payload.tenureText || payload.tenure_text || null,
      payload.linkUrl || payload.link_url || null,
      payload.linkLabel || payload.link_label || null,
      Number(countRows[0]?.max_sort || 0) + 1
    ]
  );
  const [rows] = await pool.execute('SELECT * FROM admin_update_items WHERE id = ?', [result.insertId]);
  return rows[0];
}

export async function updateItem(agencyId, updateId, itemId, patch = {}) {
  await getUpdate(agencyId, updateId);
  const [existing] = await pool.execute(
    `SELECT i.* FROM admin_update_items i
     JOIN admin_update_topics t ON t.id = i.topic_id
     WHERE i.id = ? AND t.update_id = ? LIMIT 1`,
    [itemId, updateId]
  );
  if (!existing[0]) throw httpError(404, 'Item not found');
  const map = {
    included: 'included',
    displayName: 'display_name',
    display_name: 'display_name',
    roleTitle: 'role_title',
    role_title: 'role_title',
    photoUrl: 'photo_url',
    photo_url: 'photo_url',
    itemDate: 'item_date',
    item_date: 'item_date',
    statusLabel: 'status_label',
    status_label: 'status_label',
    bodyText: 'body_text',
    body_text: 'body_text',
    destination: 'destination',
    tenureText: 'tenure_text',
    tenure_text: 'tenure_text',
    linkUrl: 'link_url',
    link_url: 'link_url',
    linkLabel: 'link_label',
    link_label: 'link_label',
    sortOrder: 'sort_order',
    sort_order: 'sort_order'
  };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(map)) {
    if (patch[key] === undefined) continue;
    let value = patch[key];
    if (column === 'included') value = value ? 1 : 0;
    if (column === 'item_date') value = toDateOnly(value);
    sets.push(`${column} = ?`);
    values.push(value);
  }
  if (sets.length) {
    values.push(itemId);
    await pool.execute(`UPDATE admin_update_items SET ${sets.join(', ')} WHERE id = ?`, values);
  }
  const [rows] = await pool.execute('SELECT * FROM admin_update_items WHERE id = ?', [itemId]);
  return rows[0];
}

export async function deleteItem(agencyId, updateId, itemId) {
  await getUpdate(agencyId, updateId);
  const [existing] = await pool.execute(
    `SELECT i.* FROM admin_update_items i
     JOIN admin_update_topics t ON t.id = i.topic_id
     WHERE i.id = ? AND t.update_id = ? LIMIT 1`,
    [itemId, updateId]
  );
  if (!existing[0]) throw httpError(404, 'Item not found');
  await pool.execute('DELETE FROM admin_update_items WHERE id = ?', [itemId]);
  return { ok: true };
}

async function listInternalStaff(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT
        u.id, u.email, u.first_name, u.last_name, u.title, u.role, u.profile_photo_path,
        u.completed_at, u.created_at, u.terminated_at
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE LOWER(COALESCE(u.role, '')) NOT IN (${EXCLUDED_ROLE_SQL})
       AND (u.is_archived = 0 OR u.is_archived IS NULL)
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [agencyId, ...EXCLUDED_STAFF_ROLES]
  );
  return rows || [];
}

function topicByKey(topics, key) {
  return (topics || []).find((t) => t.topic_key === key) || null;
}

export async function refreshPeople(agencyId, updateId) {
  const update = await getUpdate(agencyId, updateId);
  const staffingTopic = topicByKey(update.topics, 'staffing');
  const departuresTopic = topicByKey(update.topics, 'departures');
  if (!staffingTopic && !departuresTopic) return update;

  const staff = await listInternalStaff(agencyId);
  const staffingSince = toDateOnly(update.staffing_since) || firstOfMonth();
  const departuresSince = toDateOnly(update.departures_since) || firstOfMonth();

  if (staffingTopic) {
    const existing = staffingTopic.items || [];
    const existingByUser = new Map(existing.filter((i) => i.user_id).map((i) => [Number(i.user_id), i]));
    const hires = staff.filter((u) => {
      if (u.terminated_at) return false;
      const start = toDateOnly(u.completed_at || u.created_at);
      return start && start >= staffingSince;
    });
    const keepIds = new Set();
    for (const user of hires) {
      const photo = publicUploadsUrlFromStoredPath(user.profile_photo_path);
      const existingRow = existingByUser.get(Number(user.id));
      if (existingRow) {
        keepIds.add(existingRow.id);
        await pool.execute(
          `UPDATE admin_update_items
           SET display_name = ?, role_title = ?, photo_url = ?, item_date = ?, status_label = ?
           WHERE id = ?`,
          [
            displayName(user),
            user.title || null,
            photo,
            toDateOnly(user.completed_at || user.created_at),
            'New hire',
            existingRow.id
          ]
        );
      } else {
        await pool.execute(
          `INSERT INTO admin_update_items
            (topic_id, user_id, kind, display_name, role_title, photo_url, item_date, status_label,
             body_text, included, sort_order)
           VALUES (?, ?, 'hire', ?, ?, ?, ?, 'New hire', '', 1, ?)`,
          [
            staffingTopic.id,
            user.id,
            displayName(user),
            user.title || null,
            photo,
            toDateOnly(user.completed_at || user.created_at),
            existing.length
          ]
        );
      }
    }
    for (const item of existing) {
      if (item.kind === 'hire' && item.user_id && !hires.some((u) => Number(u.id) === Number(item.user_id))) {
        await pool.execute('DELETE FROM admin_update_items WHERE id = ?', [item.id]);
      }
    }
  }

  if (departuresTopic) {
    const existing = departuresTopic.items || [];
    const existingByUser = new Map(existing.filter((i) => i.user_id).map((i) => [Number(i.user_id), i]));
    const leavers = staff.filter((u) => {
      const left = toDateOnly(u.terminated_at);
      return left && left >= departuresSince;
    });
    for (const user of leavers) {
      const photo = publicUploadsUrlFromStoredPath(user.profile_photo_path);
      const tenure = formatTenure(user.completed_at || user.created_at, user.terminated_at);
      const blurb = farewellBlurbForUserId(user.id);
      const existingRow = existingByUser.get(Number(user.id));
      if (existingRow) {
        await pool.execute(
          `UPDATE admin_update_items
           SET display_name = ?, role_title = ?, photo_url = ?, item_date = ?, status_label = ?,
               tenure_text = ?, body_text = CASE WHEN body_text IS NULL OR body_text = '' THEN ? ELSE body_text END
           WHERE id = ?`,
          [
            displayName(user),
            user.title || null,
            photo,
            toDateOnly(user.terminated_at),
            'Departure',
            tenure,
            blurb,
            existingRow.id
          ]
        );
      } else {
        await pool.execute(
          `INSERT INTO admin_update_items
            (topic_id, user_id, kind, display_name, role_title, photo_url, item_date, status_label,
             body_text, tenure_text, included, sort_order)
           VALUES (?, ?, 'departure', ?, ?, ?, ?, 'Departure', ?, ?, 1, ?)`,
          [
            departuresTopic.id,
            user.id,
            displayName(user),
            user.title || null,
            photo,
            toDateOnly(user.terminated_at),
            blurb,
            tenure,
            existing.length
          ]
        );
      }
    }
    for (const item of existing) {
      if (item.kind === 'departure' && item.user_id && !leavers.some((u) => Number(u.id) === Number(item.user_id))) {
        await pool.execute('DELETE FROM admin_update_items WHERE id = ?', [item.id]);
      }
    }
  }

  return getUpdate(agencyId, updateId);
}

function topicAnchor(topic) {
  return `au-${String(topic.topic_key || topic.id).replace(/[^a-z0-9_-]/gi, '')}`;
}

function renderPeopleCards(items, color) {
  return (items || []).filter((i) => Number(i.included) !== 0).map((item) => {
    const photo = item.photo_url
      ? `<img src="${escapeHtml(item.photo_url)}" alt="" width="56" height="56" style="width:56px;height:56px;border-radius:50%;object-fit:cover;display:block;" />`
      : `<div style="width:56px;height:56px;border-radius:50%;background:${escapeHtml(color)}22;color:${escapeHtml(color)};font-weight:700;font-size:18px;line-height:56px;text-align:center;">${escapeHtml((item.display_name || '?').slice(0, 1))}</div>`;
    const dest = item.destination ? `<div style="color:#64748b;font-size:13px;margin-top:4px;">Next: ${escapeHtml(item.destination)}</div>` : '';
    const tenure = item.tenure_text ? `<div style="color:#64748b;font-size:13px;">With us ${escapeHtml(item.tenure_text)}</div>` : '';
    const date = item.item_date ? `<div style="color:#94a3b8;font-size:12px;margin-top:2px;">${escapeHtml(String(item.item_date).slice(0, 10))}</div>` : '';
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="68" valign="top">${photo}</td>
            <td valign="top">
              <div style="font-weight:700;color:#0f172a;font-size:16px;">${escapeHtml(item.display_name)}</div>
              <div style="color:#475569;font-size:13px;">${escapeHtml(item.role_title || item.status_label || '')}</div>
              ${tenure}${dest}${date}
              ${item.body_text ? `<div style="margin-top:8px;color:#334155;font-size:14px;line-height:1.5;">${escapeHtml(item.body_text)}</div>` : ''}
            </td>
          </tr></table>
        </td>
      </tr>`;
  }).join('');
}

function renderCustomItems(items, color) {
  return (items || []).filter((i) => Number(i.included) !== 0).map((item) => {
    const cta = item.link_url
      ? `<a href="${escapeHtml(item.link_url)}" style="display:inline-block;margin-top:8px;padding:8px 14px;border:1px solid ${escapeHtml(color)};border-radius:999px;color:${escapeHtml(color)};text-decoration:none;font-size:13px;font-weight:700;">${escapeHtml(item.link_label || 'View')}</a>`
      : '';
    return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #e2e8f0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="28" valign="top" style="color:${escapeHtml(color)};font-size:18px;">📄</td>
            <td>
              <div style="font-weight:700;color:#0f172a;font-size:16px;">${escapeHtml(item.display_name)}</div>
              <div style="color:#64748b;font-size:13px;">${escapeHtml(item.status_label || item.item_date || '')}</div>
              ${item.body_text ? `<div style="margin-top:6px;color:#334155;font-size:14px;line-height:1.5;">${escapeHtml(item.body_text)}</div>` : ''}
              ${cta}
            </td>
          </tr></table>
        </td>
      </tr>`;
  }).join('');
}

export function renderAdminUpdateHtml(update, agency, { viewUrl } = {}) {
  const { primary, secondary, accent } = brandColors(agency);
  const logo = agency?.logo_url || '';
  const agencyName = agency?.name || 'Our team';
  const enabledTopics = (update.topics || []).filter((t) => Number(t.enabled) === 1);
  const title = update.title || 'Admin Updates';
  const subtitle = update.subtitle || '';
  const greeting = update.greeting || 'Hi team,';
  const intro = update.intro_html || '';
  const tagline = update.footer_tagline || 'Stronger together. One team. One mission.';
  const year = new Date().getFullYear();

  const topicRows = [];
  for (let i = 0; i < enabledTopics.length; i += 2) {
    topicRows.push(`<tr>${topicCards.slice ? '' : ''}${enabledTopics.slice(i, i + 2).map((topic, idx) => {
      const icon = iconByKey(topic.icon_key);
      const isLastOdd = i + 1 >= enabledTopics.length;
      return `
        <td width="${isLastOdd ? '100%' : '50%'}" valign="top" style="padding:6px;" ${isLastOdd ? 'colspan="2"' : ''}>
          <a href="#${topicAnchor(topic)}" style="text-decoration:none;display:block;border:1px solid ${escapeHtml(topic.color)}33;border-radius:14px;padding:14px 12px;background:#fff;">
            <div style="width:36px;height:36px;border-radius:50%;background:${escapeHtml(topic.color)};color:#fff;text-align:center;line-height:36px;font-size:18px;">${icon.emoji}</div>
            <div style="margin-top:8px;font-weight:800;color:#0f172a;font-size:14px;">${escapeHtml(topic.title)}</div>
            <div style="margin-top:4px;color:#64748b;font-size:12px;line-height:1.4;">${escapeHtml(topic.description || '')}</div>
          </a>
        </td>`;
    }).join('')}</tr>`);
  }

  const sections = enabledTopics.map((topic) => {
    const icon = iconByKey(topic.icon_key);
    const peopleKinds = topic.topic_key === 'staffing' || topic.topic_key === 'departures';
    const itemHtml = peopleKinds ? renderPeopleCards(topic.items, topic.color) : renderCustomItems(topic.items, topic.color);
    const body = topic.body_html ? `<div style="color:#334155;font-size:14px;line-height:1.6;margin:8px 0 12px;">${sanitizeHtml(topic.body_html)}</div>` : '';
    return `
      <tr>
        <td style="padding:0 28px 28px;" id="${topicAnchor(topic)}">
          <a name="${topicAnchor(topic)}"></a>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:16px;overflow:hidden;border:1px solid ${escapeHtml(topic.color)}22;">
            <tr>
              <td style="background:${escapeHtml(topic.color)};padding:18px 20px;color:#fff;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.18);text-align:center;line-height:44px;font-size:22px;">${icon.emoji}</td>
                  <td style="padding-left:12px;">
                    <div style="font-size:20px;font-weight:800;">${escapeHtml(topic.title)}</div>
                    <div style="opacity:.9;font-size:13px;">${escapeHtml(topic.description || '')}</div>
                  </td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="background:#fff;padding:16px 20px;">
                ${body}
                <table width="100%" cellpadding="0" cellspacing="0">${itemHtml || '<tr><td style="color:#94a3b8;font-size:14px;padding:8px 0;">No items in this section yet.</td></tr>'}</table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }).join('');

  const featured = Number(update.featured_enabled) === 1 && (update.featured_title || update.featured_body)
    ? `
      <tr>
        <td style="padding:0 28px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfeff;border-radius:16px;">
            <tr>
              <td width="56" valign="top" style="padding:18px 0 18px 18px;">
                <div style="width:40px;height:40px;border-radius:50%;background:${escapeHtml(accent)};color:#fff;text-align:center;line-height:40px;">⭐</div>
              </td>
              <td style="padding:18px 12px;">
                <div style="font-size:11px;letter-spacing:.08em;font-weight:800;color:${escapeHtml(secondary)};">FEATURED THIS MONTH</div>
                <div style="font-size:18px;font-weight:800;color:#0f172a;margin-top:4px;">${escapeHtml(update.featured_title || '')}</div>
                <div style="color:#475569;font-size:14px;margin-top:4px;">${escapeHtml(update.featured_body || '')}</div>
              </td>
              ${update.featured_cta_url ? `<td style="padding:18px 18px 18px 0;" valign="middle"><a href="${escapeHtml(update.featured_cta_url)}" style="display:inline-block;background:${escapeHtml(secondary)};color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700;font-size:13px;">${escapeHtml(update.featured_cta_label || 'View details')}</a></td>` : ''}
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  const support = Number(update.support_enabled) === 1
    ? `
      <tr>
        <td style="padding:8px 28px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdfa;border-radius:16px;">
            <tr>
              <td style="padding:18px 20px;">
                <div style="font-weight:800;color:#0f172a;font-size:16px;">${escapeHtml(update.support_title || 'Questions or need help?')}</div>
                <div style="color:#475569;font-size:14px;margin-top:4px;">${escapeHtml(update.support_body || 'We’re here for you.')}</div>
                ${update.support_email ? `<div style="margin-top:8px;"><a href="mailto:${escapeHtml(update.support_email)}" style="color:${escapeHtml(secondary)};font-weight:700;text-decoration:none;">${escapeHtml(update.support_email)}</a></div>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#e2e8f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#e2e8f0;padding:24px 12px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:18px;overflow:hidden;">
        <tr>
          <td style="background:${escapeHtml(primary)};padding:28px 28px 24px;color:#fff;">
            ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(agencyName)}" height="40" style="display:block;margin-bottom:14px;max-height:40px;" />` : ''}
            <div style="font-size:28px;font-weight:800;letter-spacing:-0.03em;">${escapeHtml(title)}</div>
            ${subtitle ? `<div style="margin-top:6px;opacity:.88;font-size:14px;">${escapeHtml(subtitle)}</div>` : ''}
          </td>
        </tr>
        ${viewUrl ? `
        <tr>
          <td style="padding:12px 28px 0;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
            <a href="${escapeHtml(viewUrl)}" style="display:inline-block;padding:10px 0 12px;color:${escapeHtml(secondary)};font-weight:800;font-size:14px;text-decoration:none;">View this Admin Update in the app →</a>
          </td>
        </tr>` : ''}
        <tr>
          <td style="padding:24px 28px 8px;">
            <div style="font-size:18px;font-weight:800;color:#0f172a;">${escapeHtml(greeting)}</div>
            <div style="margin-top:8px;color:#334155;font-size:15px;line-height:1.6;">${sanitizeHtml(intro)}</div>
          </td>
        </tr>
        ${featured}
        <tr>
          <td style="padding:8px 22px 12px;">
            <div style="padding:0 6px 8px;font-size:12px;letter-spacing:.08em;font-weight:800;color:${escapeHtml(secondary)};">THIS MONTH'S TOPICS</div>
            <table width="100%" cellpadding="0" cellspacing="0">${topicRows.join('')}</table>
          </td>
        </tr>
        ${sections}
        ${support}
        <tr>
          <td style="background:${escapeHtml(primary)};padding:22px 28px;color:#fff;">
            <div style="font-weight:700;">${escapeHtml(tagline)}</div>
            <div style="margin-top:8px;opacity:.8;font-size:12px;">© ${year} ${escapeHtml(agencyName)}. All rights reserved.</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function previewHtml(agencyId, updateId) {
  const update = await getUpdate(agencyId, updateId);
  const agency = await Agency.findById(agencyId);
  const token = await ensurePublicToken(updateId);
  const viewUrl = viewUrlForToken(agency, token);
  const pageHtml = renderAdminUpdateHtml(update, agency, { viewUrl });
  const emailHtml = renderLinkOnlyHtml(update, agency, viewUrl);
  const mode = String(update.delivery_mode || 'link').toLowerCase() === 'html' ? 'html' : 'link';
  return {
    html: pageHtml,
    pageHtml,
    emailHtml,
    inboxHtml: mode === 'html' ? pageHtml : emailHtml,
    subject: `${update.title || 'Admin Updates'} — ${agency?.name || ''}`.trim(),
    viewUrl,
    publicToken: token,
    deliveryMode: mode,
    splash: {
      title: update.title || 'Admin Updates',
      subtitle: update.subtitle || 'This month’s Admin Update is ready in the app. Open it to read the full newsletter.',
      agencyName: agency?.name || 'Our team',
      logoUrl: agency?.logo_url || ''
    }
  };
}

function wrapTrackedLinks(html, viewToken) {
  const apiBase = publicApiBase();
  return String(html || '').replace(/href="(https?:[^"]+|\/[^"]+)"/gi, (match, url) => {
    if (String(url).includes('/api/public/admin-updates/') || String(url).includes('/admin-update/')) {
      return match;
    }
    const tracked = `${apiBase}/click/${encodeURIComponent(viewToken)}?u=${encodeURIComponent(url)}`;
    return `href="${tracked}"`;
  });
}

function injectOpenPixel(html, openToken) {
  const apiBase = publicApiBase();
  if (!openToken || !html) return html;
  const pixel = `<img src="${apiBase}/open/${encodeURIComponent(openToken)}.gif" alt="" width="1" height="1" style="display:none !important;width:1px;height:1px;border:0;" />`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${pixel}</body>`);
  return `${html}${pixel}`;
}

function renderLinkOnlyHtml(update, agency, viewUrl) {
  const { primary, secondary } = brandColors(agency);
  const logo = agency?.logo_url || '';
  const agencyName = agency?.name || 'Our team';
  const month = new Date().toLocaleString('en-US', { month: 'long' });
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(update.title || 'Admin Updates')}</title></head>
<body style="margin:0;padding:0;background:#e2e8f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#e2e8f0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08);">
        <tr><td style="background:${escapeHtml(primary)};padding:22px 26px;color:#fff;">
          ${logo ? `<img src="${escapeHtml(logo)}" alt="" height="32" style="display:block;margin-bottom:10px;max-height:32px;" />` : ''}
          <div style="font-size:13px;letter-spacing:.08em;font-weight:800;opacity:.85;text-transform:uppercase;">${escapeHtml(month)}</div>
          <div style="font-size:26px;font-weight:800;margin-top:4px;">${escapeHtml(update.title || 'Admin Updates')}</div>
        </td></tr>
        <tr><td style="padding:26px 26px 8px;">
          <div style="font-size:18px;font-weight:800;color:#0f172a;">${escapeHtml(update.greeting || 'Hi team,')}</div>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:10px 0 0;">Your ${escapeHtml(month)} Admin Update is ready in the app. Sign in if asked — then you’ll land right on it.</p>
        </td></tr>
        <tr><td style="padding:8px 26px 28px;" align="center">
          <a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:${escapeHtml(secondary)};color:#fff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 22px;border-radius:999px;">Click here for this Admin Update</a>
          <div style="margin-top:12px;color:#94a3b8;font-size:12px;">Opens in ${escapeHtml(agencyName)} after you log in</div>
        </td></tr>
        <tr><td style="background:${escapeHtml(primary)};padding:14px 26px;color:#fff;font-size:12px;">© ${new Date().getFullYear()} ${escapeHtml(agencyName)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function resolveSender(agencyId, senderIdentityId) {
  const explicitId = Number(senderIdentityId || 0);
  if (explicitId > 0) {
    const identity = await EmailSenderIdentity.findById(explicitId);
    if (identity && identity.is_active !== 0 && identity.is_active !== false) {
      return identity;
    }
  }
  const resolved = await resolveSenderIdentityForSend({
    agencyId,
    templateType: ADMIN_UPDATE_TEMPLATE_TYPE,
    preferredKeys: ['notifications']
  });
  return resolved?.identity || null;
}

function textFallback(update, agencyName) {
  const topics = (update.topics || []).filter((t) => Number(t.enabled) === 1).map((t) => t.title).join(', ');
  return `${update.greeting || 'Hi team,'}\n\n${String(update.intro_html || '').replace(/<[^>]+>/g, '')}\n\nTopics: ${topics}\n\n— ${agencyName}`;
}

export async function sendTest({ agencyId, updateId, to, actorUserId }) {
  const update = await getUpdate(agencyId, updateId);
  const agency = await Agency.findById(agencyId);
  const identity = await resolveSender(agencyId, update.sender_identity_id);
  if (!identity?.id) {
    throw httpError(400, 'Assign a From address on this Admin Update before sending a test.');
  }
  const token = await ensurePublicToken(updateId);
  const viewUrl = viewUrlForToken(agency, token);
  const mode = String(update.delivery_mode || 'link').toLowerCase() === 'html' ? 'html' : 'link';
  const html = mode === 'link'
    ? renderLinkOnlyHtml(update, agency, viewUrl)
    : renderAdminUpdateHtml(update, agency, { viewUrl });
  const subject = `[TEST] ${update.title || 'Admin Updates'} — ${agency?.name || ''}`.trim();
  await sendEmailFromIdentity({
    senderIdentityId: identity.id,
    to,
    subject,
    text: textFallback(update, agency?.name || ''),
    html,
    source: 'manual',
    generatedByUserId: actorUserId,
    templateType: ADMIN_UPDATE_TEMPLATE_TYPE
  });
  return { ok: true };
}

export async function scheduleUpdate(agencyId, updateId, scheduledAt) {
  const row = await getUpdateRow(agencyId, updateId);
  if (!row) throw httpError(404, 'Admin Update not found');
  if (row.status === 'sent') throw httpError(400, 'This Admin Update has already been sent');
  const when = toMysqlDateTime(scheduledAt);
  if (!when) throw httpError(400, 'scheduledAt is required');
  await pool.execute(
    `UPDATE admin_updates SET status = 'scheduled', scheduled_at = ? WHERE id = ? AND agency_id = ?`,
    [when, updateId, agencyId]
  );
  return getUpdate(agencyId, updateId);
}

export async function cancelSchedule(agencyId, updateId) {
  const row = await getUpdateRow(agencyId, updateId);
  if (!row) throw httpError(404, 'Admin Update not found');
  if (row.status === 'sent' || row.status === 'sending') {
    throw httpError(400, 'Cannot cancel a send that is already in progress or complete');
  }
  await pool.execute(
    `UPDATE admin_updates SET status = 'draft', scheduled_at = NULL WHERE id = ? AND agency_id = ?`,
    [updateId, agencyId]
  );
  return getUpdate(agencyId, updateId);
}

async function queueRecipients(updateId, agencyId) {
  const staff = await listInternalStaff(agencyId);
  const seen = new Set();
  let queued = 0;
  for (const user of staff) {
    if (user.terminated_at) continue;
    const email = pickRecipientEmail(user);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    await pool.execute(
      `INSERT INTO admin_update_sends (update_id, recipient_email, user_id, view_token, open_track_token, status)
       VALUES (?, ?, ?, ?, ?, 'queued')`,
      [updateId, email, user.id, newToken(), newToken()]
    );
    queued += 1;
  }
  return queued;
}

export async function processDueAdminUpdates() {
  const [due] = await pool.execute(
    `SELECT * FROM admin_updates
     WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= UTC_TIMESTAMP()
     ORDER BY scheduled_at ASC
     LIMIT 5`
  );
  for (const row of due || []) {
    try {
      await pool.execute(`UPDATE admin_updates SET status = 'sending' WHERE id = ? AND status = 'scheduled'`, [row.id]);
      const [existing] = await pool.execute(
        'SELECT COUNT(*) AS c FROM admin_update_sends WHERE update_id = ?',
        [row.id]
      );
      if (!Number(existing[0]?.c)) {
        await queueRecipients(row.id, row.agency_id);
      }
      const update = await hydrateUpdate(row);
      const agency = await Agency.findById(row.agency_id);
      const identity = await resolveSender(row.agency_id, row.sender_identity_id);
      if (!identity?.id) {
        await pool.execute(
          `UPDATE admin_updates SET status = 'scheduled' WHERE id = ?`,
          [row.id]
        );
        continue;
      }
      const publicToken = await ensurePublicToken(row.id);
      const baseHtml = renderAdminUpdateHtml(update, agency, {
        viewUrl: viewUrlForToken(agency, publicToken)
      });
      if (!update.sent_html) {
        await pool.execute('UPDATE admin_updates SET sent_html = ? WHERE id = ?', [baseHtml, row.id]);
      }
      const mode = String(update.delivery_mode || row.delivery_mode || 'link').toLowerCase() === 'html' ? 'html' : 'link';
      const subject = `${update.title || 'Admin Updates'} — ${agency?.name || ''}`.trim();
      const [queued] = await pool.execute(
        `SELECT * FROM admin_update_sends WHERE update_id = ? AND status = 'queued' LIMIT 40`,
        [row.id]
      );
      for (const send of queued || []) {
        try {
          if (!send.view_token || !send.open_track_token) {
            await pool.execute(
              `UPDATE admin_update_sends SET view_token = COALESCE(view_token, ?), open_track_token = COALESCE(open_track_token, ?) WHERE id = ?`,
              [newToken(), newToken(), send.id]
            );
            const [fresh] = await pool.execute('SELECT * FROM admin_update_sends WHERE id = ?', [send.id]);
            Object.assign(send, fresh[0] || {});
          }
          const recipientViewUrl = viewUrlForToken(agency, send.view_token);
          const rawHtml = mode === 'link'
            ? renderLinkOnlyHtml(update, agency, recipientViewUrl)
            : renderAdminUpdateHtml(update, agency, { viewUrl: recipientViewUrl });
          const html = injectOpenPixel(wrapTrackedLinks(rawHtml, send.view_token), send.open_track_token);
          await sendEmailFromIdentity({
            senderIdentityId: identity.id,
            to: send.recipient_email,
            subject,
            text: `${textFallback(update, agency?.name || '')}\n\nView in the app: ${recipientViewUrl}`,
            html,
            source: 'manual',
            userId: send.user_id,
            templateType: ADMIN_UPDATE_TEMPLATE_TYPE,
            linkUrl: recipientViewUrl
          });
          await pool.execute(
            `UPDATE admin_update_sends SET status = 'sent', sent_at = UTC_TIMESTAMP(), error_message = NULL WHERE id = ?`,
            [send.id]
          );
          if (Number(update.push_splash ?? row.push_splash) === 1 && send.user_id) {
            await pool.execute(
              `INSERT INTO admin_update_splashes (update_id, user_id, view_token)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE view_token = VALUES(view_token)`,
              [row.id, send.user_id, send.view_token]
            );
          }
        } catch (err) {
          await pool.execute(
            `UPDATE admin_update_sends SET status = 'failed', error_message = ? WHERE id = ?`,
            [String(err?.message || 'Send failed').slice(0, 500), send.id]
          );
        }
      }
      const [left] = await pool.execute(
        `SELECT COUNT(*) AS c FROM admin_update_sends WHERE update_id = ? AND status = 'queued'`,
        [row.id]
      );
      if (!Number(left[0]?.c)) {
        await pool.execute(
          `UPDATE admin_updates SET status = 'sent', sent_at = UTC_TIMESTAMP() WHERE id = ?`,
          [row.id]
        );
      } else {
        await pool.execute(`UPDATE admin_updates SET status = 'scheduled' WHERE id = ?`, [row.id]);
      }
    } catch (err) {
      console.error('[adminUpdate] processor error:', err?.message);
      await pool.execute(
        `UPDATE admin_updates SET status = 'scheduled' WHERE id = ? AND status = 'sending'`,
        [row.id]
      ).catch(() => {});
    }
  }
}

export async function getPublicView(token) {
  const resolved = await resolveViewToken(token);
  if (!resolved) throw httpError(404, 'This Admin Update link is invalid or expired');
  const update = await hydrateUpdate(await getUpdateRow(resolved.agencyId, resolved.updateId));
  if (!update || (update.status !== 'sent' && update.status !== 'sending' && update.status !== 'scheduled' && update.status !== 'draft')) {
    throw httpError(404, 'Admin Update not found');
  }
  const agency = await Agency.findById(resolved.agencyId);
  const viewToken = resolved.send?.view_token || update.public_token;
  const html = update.sent_html || renderAdminUpdateHtml(update, agency, {
    viewUrl: viewUrlForToken(agency, viewToken)
  });
  if (resolved.send?.id && !resolved.send.viewed_at) {
    await pool.execute('UPDATE admin_update_sends SET viewed_at = UTC_TIMESTAMP() WHERE id = ? AND viewed_at IS NULL', [resolved.send.id]);
  }
  await recordActivity({
    updateId: resolved.updateId,
    sendId: resolved.send?.id || null,
    userId: resolved.send?.user_id || null,
    channel: 'public',
    eventType: 'view'
  });
  return {
    title: update.title,
    subtitle: update.subtitle,
    html,
    agencyName: agency?.name || '',
    logoUrl: agency?.logo_url || '',
    token: viewToken
  };
}

export async function recordPublicActivity(token, payload = {}) {
  const resolved = await resolveViewToken(token);
  if (!resolved) throw httpError(404, 'Invalid token');
  const eventType = String(payload.eventType || payload.event_type || 'dwell').slice(0, 32);
  await recordActivity({
    updateId: resolved.updateId,
    sendId: resolved.send?.id || null,
    userId: resolved.send?.user_id || payload.userId || null,
    channel: String(payload.channel || 'public').slice(0, 32),
    eventType,
    eventKey: payload.eventKey || payload.event_key || null,
    durationMs: payload.durationMs ?? payload.duration_ms,
    scrollPct: payload.scrollPct ?? payload.scroll_pct
  });
  return { ok: true };
}

export async function trackOpenByToken(token) {
  const resolved = await resolveViewToken(token);
  if (!resolved?.send?.id) return;
  await pool.execute(
    'UPDATE admin_update_sends SET opened_at = UTC_TIMESTAMP() WHERE id = ? AND opened_at IS NULL',
    [resolved.send.id]
  );
  await recordActivity({
    updateId: resolved.updateId,
    sendId: resolved.send.id,
    userId: resolved.send.user_id,
    channel: 'email',
    eventType: 'open'
  });
}

export async function trackClickByToken(token, rawUrl) {
  const resolved = await resolveViewToken(token);
  const dest = safeRedirectUrl(rawUrl);
  if (!dest) return '/';
  if (resolved) {
    await recordActivity({
      updateId: resolved.updateId,
      sendId: resolved.send?.id || null,
      userId: resolved.send?.user_id || null,
      channel: 'email',
      eventType: 'click',
      eventKey: dest
    });
  }
  return dest;
}

export async function pendingSplashForUser(userId) {
  const [rows] = await pool.execute(
    `SELECT s.id, s.update_id, s.view_token, s.opened_at, u.title, u.subtitle, u.intro_html, u.sent_at, a.name AS agency_name, a.logo_url, a.slug, a.portal_url
     FROM admin_update_splashes s
     JOIN admin_updates u ON u.id = s.update_id
     JOIN agencies a ON a.id = u.agency_id
     WHERE s.user_id = ? AND s.dismissed_at IS NULL AND s.opened_at IS NULL AND u.status = 'sent'
     ORDER BY u.sent_at DESC, s.id DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function markSplashOpened(userId, splashId) {
  const [rows] = await pool.execute(
    'SELECT * FROM admin_update_splashes WHERE id = ? AND user_id = ? LIMIT 1',
    [splashId, userId]
  );
  if (!rows[0]) throw httpError(404, 'Splash not found');
  await pool.execute(
    'UPDATE admin_update_splashes SET opened_at = COALESCE(opened_at, UTC_TIMESTAMP()) WHERE id = ?',
    [splashId]
  );
  await recordActivity({
    updateId: rows[0].update_id,
    userId,
    channel: 'splash',
    eventType: 'splash_open'
  });
  return { ok: true, viewToken: rows[0].view_token };
}

export async function dismissSplash(userId, splashId) {
  const [rows] = await pool.execute(
    'SELECT * FROM admin_update_splashes WHERE id = ? AND user_id = ? LIMIT 1',
    [splashId, userId]
  );
  if (!rows[0]) throw httpError(404, 'Splash not found');
  await pool.execute(
    'UPDATE admin_update_splashes SET dismissed_at = UTC_TIMESTAMP() WHERE id = ?',
    [splashId]
  );
  await recordActivity({
    updateId: rows[0].update_id,
    userId,
    channel: 'splash',
    eventType: 'splash_dismiss'
  });
  return { ok: true };
}

export async function markSplashOpenedByViewToken(userId, token) {
  const t = String(token || '').trim();
  if (!t) return { ok: true, matched: false };
  const [byView] = await pool.execute(
    'SELECT * FROM admin_update_splashes WHERE user_id = ? AND view_token = ? LIMIT 1',
    [userId, t]
  );
  let splash = byView[0] || null;
  if (!splash) {
    const [byPublic] = await pool.execute(
      `SELECT s.*
       FROM admin_update_splashes s
       JOIN admin_updates u ON u.id = s.update_id
       WHERE s.user_id = ? AND u.public_token = ?
       LIMIT 1`,
      [userId, t]
    );
    splash = byPublic[0] || null;
  }
  if (!splash) return { ok: true, matched: false };
  await pool.execute(
    'UPDATE admin_update_splashes SET opened_at = COALESCE(opened_at, UTC_TIMESTAMP()) WHERE id = ?',
    [splash.id]
  );
  return { ok: true, matched: true, viewToken: splash.view_token };
}

export async function publicLinkForUpdate(agencyId, updateId) {
  const update = await getUpdate(agencyId, updateId);
  const agency = await Agency.findById(agencyId);
  const token = await ensurePublicToken(updateId);
  return {
    publicToken: token,
    viewUrl: viewUrlForToken(agency, token),
    deliveryMode: update.delivery_mode || 'link',
    pushSplash: Number(update.push_splash) === 1
  };
}

export async function activitySummary(agencyId, updateId) {
  await getUpdate(agencyId, updateId);
  const [[counts]] = await pool.execute(
    `SELECT
        (SELECT COUNT(*) FROM admin_update_sends WHERE update_id = ?) AS recipients,
        (SELECT COUNT(*) FROM admin_update_sends WHERE update_id = ? AND opened_at IS NOT NULL) AS email_opened,
        (SELECT COUNT(*) FROM admin_update_sends WHERE update_id = ? AND viewed_at IS NOT NULL) AS viewed,
        (SELECT COUNT(*) FROM admin_update_splashes WHERE update_id = ? AND opened_at IS NOT NULL) AS splash_opened,
        (SELECT COUNT(*) FROM admin_update_splashes WHERE update_id = ? AND dismissed_at IS NOT NULL) AS splash_dismissed`,
    [updateId, updateId, updateId, updateId, updateId]
  );
  const [dwell] = await pool.execute(
    `SELECT AVG(duration_ms) AS avg_dwell_ms, AVG(scroll_pct) AS avg_scroll_pct
     FROM admin_update_activity
     WHERE update_id = ? AND event_type IN ('dwell', 'scroll')`,
    [updateId]
  );
  const [clicks] = await pool.execute(
    `SELECT event_key AS url, COUNT(*) AS clicks
     FROM admin_update_activity
     WHERE update_id = ? AND event_type = 'click' AND event_key IS NOT NULL
     GROUP BY event_key
     ORDER BY clicks DESC
     LIMIT 20`,
    [updateId]
  );
  const [people] = await pool.execute(
    `SELECT s.user_id, s.recipient_email, s.opened_at, s.viewed_at, s.status,
            u.first_name, u.last_name,
            (SELECT MAX(duration_ms) FROM admin_update_activity a WHERE a.send_id = s.id AND a.event_type = 'dwell') AS dwell_ms,
            (SELECT MAX(scroll_pct) FROM admin_update_activity a WHERE a.send_id = s.id AND a.event_type = 'scroll') AS scroll_pct,
            (SELECT COUNT(*) FROM admin_update_activity a WHERE a.send_id = s.id AND a.event_type = 'click') AS clicks
     FROM admin_update_sends s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.update_id = ?
     ORDER BY s.viewed_at IS NULL, s.opened_at IS NULL, s.recipient_email`,
    [updateId]
  );
  return {
    recipients: Number(counts?.recipients || 0),
    emailOpened: Number(counts?.email_opened || 0),
    viewed: Number(counts?.viewed || 0),
    splashOpened: Number(counts?.splash_opened || 0),
    splashDismissed: Number(counts?.splash_dismissed || 0),
    avgDwellMs: Number(dwell[0]?.avg_dwell_ms || 0),
    avgScrollPct: Number(dwell[0]?.avg_scroll_pct || 0),
    clicks: clicks || [],
    people: (people || []).map((p) => ({
      userId: p.user_id,
      email: p.recipient_email,
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.recipient_email,
      openedAt: p.opened_at,
      viewedAt: p.viewed_at,
      status: p.status,
      dwellMs: p.dwell_ms,
      scrollPct: p.scroll_pct,
      clicks: Number(p.clicks || 0)
    }))
  };
}

export function catalogOptions() {
  return {
    icons: ADMIN_UPDATE_ICONS,
    colors: ADMIN_UPDATE_COLORS,
    builtinTopics: ADMIN_UPDATE_BUILTIN_TOPICS
  };
}
