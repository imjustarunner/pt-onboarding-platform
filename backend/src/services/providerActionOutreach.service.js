import crypto from 'crypto';
import pool from '../config/database.js';
import config from '../config/config.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import { listOnboardingQueue } from './clientOnboardingChecklist.service.js';
import { renderProviderActionPdf } from './providerActionPdf.service.js';
import {
  SECONDS_PER_CLIENT,
  LINK_TTL_HOURS,
  ACTION_TOKEN_BYTES,
  ACTION_TOKEN_MIN_PREFIX,
  estimateSeconds,
  formatEstimateLabel,
  formatActiveDuration,
  pdfFilenameForProvider,
  normalizeActionToken
} from '../utils/providerActionOutreach.js';

const HEARTBEAT_CAP_SEC = 120;
const SESSION_GAP_SEC = 30 * 60;

function mysqlDt(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function makeToken() {
  return crypto.randomBytes(ACTION_TOKEN_BYTES).toString('hex');
}

function providerIdsForRow(row) {
  const ids = new Set();
  const primary = Number(row?.provider_id || 0);
  if (primary > 0) ids.add(primary);
  String(row?.provider_ids || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .forEach((n) => ids.add(n));
  return [...ids];
}

function rowAssignedTo(row, providerUserId) {
  return providerIdsForRow(row).includes(Number(providerUserId));
}

export async function listProviderActionClients({ agencyId, providerUserId, scope = 'school' }) {
  const rows = await listOnboardingQueue({
    agencyId: Number(agencyId),
    scope: scope || 'school',
    limit: 2000
  });
  return (rows || []).filter(
    (row) => row.waiting_on_provider && rowAssignedTo(row, providerUserId)
  );
}

async function loadUserName(userId) {
  const user = await User.findById(userId);
  if (!user) return { firstName: '', lastName: 'Provider', email: null, role: 'provider' };
  return {
    firstName: user.first_name || user.firstName || '',
    lastName: user.last_name || user.lastName || '',
    email: user.email || null,
    role: user.role || 'provider',
    user
  };
}

function publicActionUrl(token) {
  const base = String(config.frontendUrl || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/ca/${encodeURIComponent(token)}`;
}

function googleSsoUrl(orgSlug) {
  const base = String(config.frontendUrl || 'http://localhost:5173').replace(/\/+$/, '');
  const slug = String(orgSlug || '').trim();
  if (!slug) return null;
  return `${base}/api/auth/google/start?orgSlug=${encodeURIComponent(slug)}&next=${encodeURIComponent('/provider/client-onboarding')}`;
}

export async function summarizeProviders({ agencyId, scope = 'school' }) {
  const aid = Number(agencyId);
  const rows = (await listOnboardingQueue({ agencyId: aid, scope, limit: 2000 }))
    .filter((row) => row.waiting_on_provider);
  const byProvider = new Map();
  for (const row of rows) {
    const ids = providerIdsForRow(row);
    if (!ids.length) {
      const key = 0;
      if (!byProvider.has(key)) byProvider.set(key, { providerUserId: null, clients: [] });
      byProvider.get(key).clients.push(row);
      continue;
    }
    for (const pid of ids) {
      if (!byProvider.has(pid)) byProvider.set(pid, { providerUserId: pid, clients: [] });
      byProvider.get(pid).clients.push(row);
    }
  }

  const [linkRows] = await pool.execute(
    `SELECT l.*
     FROM provider_action_links l
     INNER JOIN (
       SELECT provider_user_id, MAX(id) AS max_id
       FROM provider_action_links
       WHERE agency_id = ?
       GROUP BY provider_user_id
     ) latest ON latest.max_id = l.id
     WHERE l.agency_id = ?`,
    [aid, aid]
  );
  const linkByProvider = new Map((linkRows || []).map((r) => [Number(r.provider_user_id), r]));

  const out = [];
  for (const [pid, bucket] of byProvider.entries()) {
    const count = bucket.clients.length;
    const estimatedSeconds = estimateSeconds(count);
    let name = { firstName: '', lastName: pid ? 'Provider' : 'Unassigned', email: null };
    if (pid) name = await loadUserName(pid);
    const link = pid ? linkByProvider.get(Number(pid)) : null;
    const expired = link?.expires_at ? new Date(link.expires_at).getTime() < Date.now() : true;
    out.push({
      providerUserId: pid || null,
      firstName: name.firstName,
      lastName: pid ? name.lastName : 'Unassigned',
      email: name.email,
      displayName: pid
        ? [name.firstName, name.lastName].filter(Boolean).join(' ') || name.email || `Provider ${pid}`
        : 'Unassigned',
      clientCount: count,
      secondsPerClient: SECONDS_PER_CLIENT,
      estimatedSeconds,
      estimatedLabel: formatEstimateLabel(estimatedSeconds),
      clients: bucket.clients.map((c) => ({
        id: c.id,
        label: c.full_name || c.initials || c.identifier_code || `Client ${c.id}`,
        school: c.organization_name || null,
        actionKey: c.provider_lifecycle_action?.actionKey || null,
        actionLabel: c.provider_lifecycle_action?.label || c.action_stage || 'Action needed'
      })),
      latestLink: link
        ? serializeLink(link, { includeUrl: true })
        : null,
      linkExpired: !link || expired || !!link.revoked_at
    });
  }
  out.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  return out;
}

function serializeLink(row, { includeUrl = false } = {}) {
  if (!row) return null;
  const expired = new Date(row.expires_at).getTime() < Date.now() || !!row.revoked_at;
  return {
    id: Number(row.id),
    token: includeUrl ? row.token : undefined,
    url: includeUrl ? publicActionUrl(row.token) : undefined,
    expiresAt: row.expires_at,
    expired,
    firstOpenedAt: row.first_opened_at,
    lastSeenAt: row.last_seen_at,
    openCount: Number(row.open_count || 0),
    activeSeconds: Number(row.active_seconds || 0),
    activeLabel: formatActiveDuration(row.active_seconds || 0),
    completedCount: Number(row.completed_count || 0),
    remainingCount: row.remaining_count == null ? null : Number(row.remaining_count),
    clientCount: Number(row.client_count || 0),
    createdAt: row.created_at,
    lastPdfDownloadedAt: row.last_pdf_downloaded_at
  };
}

async function insertSnapshot(linkId, clients) {
  for (const c of clients) {
    await pool.execute(
      `INSERT INTO provider_action_link_clients
        (link_id, client_id, action_key, action_label, started_status_key)
       VALUES (?, ?, ?, ?, ?)`,
      [
        linkId,
        c.id,
        c.provider_lifecycle_action?.actionKey || null,
        c.provider_lifecycle_action?.label || c.action_stage || null,
        c.client_status_key || null
      ]
    );
  }
}

export async function createProviderActionLink({
  agencyId,
  providerUserId,
  createdByUserId,
  scope = 'school'
}) {
  const clients = await listProviderActionClients({ agencyId, providerUserId, scope });
  const clientCount = clients.length;
  const estimatedSeconds = estimateSeconds(clientCount);
  const token = makeToken();
  const expiresAt = new Date(Date.now() + LINK_TTL_HOURS * 60 * 60 * 1000);
  const [result] = await pool.execute(
    `INSERT INTO provider_action_links
      (token, agency_id, provider_user_id, created_by_user_id, client_count,
       seconds_per_client, estimated_seconds, expires_at, remaining_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      token,
      Number(agencyId),
      Number(providerUserId),
      createdByUserId || null,
      clientCount,
      SECONDS_PER_CLIENT,
      estimatedSeconds,
      mysqlDt(expiresAt),
      clientCount
    ]
  );
  const linkId = result.insertId;
  await insertSnapshot(linkId, clients);
  const [rows] = await pool.execute(`SELECT * FROM provider_action_links WHERE id = ?`, [linkId]);
  return { link: rows[0], clients };
}

export async function getLinkByToken(token) {
  const cleaned = normalizeActionToken(token);
  if (!cleaned) return null;
  const [exact] = await pool.execute(
    `SELECT * FROM provider_action_links WHERE BINARY token = BINARY ? LIMIT 1`,
    [cleaned]
  );
  if (exact?.[0]) return exact[0];
  // Recover truncated copy/paste from a wrapped PDF URL when the prefix is unique.
  if (cleaned.length < ACTION_TOKEN_MIN_PREFIX) return null;
  const [prefixRows] = await pool.execute(
    `SELECT * FROM provider_action_links
     WHERE token LIKE ? AND revoked_at IS NULL AND expires_at > NOW()
     LIMIT 3`,
    [`${cleaned}%`]
  );
  return prefixRows?.length === 1 ? prefixRows[0] : null;
}

export function isLinkUsable(link) {
  if (!link || link.revoked_at) return false;
  return new Date(link.expires_at).getTime() > Date.now();
}

async function addEvent(linkId, { eventType, clientId = null, actionKey = null, outcome = null, meta = null }) {
  await pool.execute(
    `INSERT INTO provider_action_link_events
      (link_id, event_type, client_id, action_key, outcome, meta_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [linkId, eventType, clientId, actionKey, outcome, meta ? JSON.stringify(meta) : null]
  );
}

export async function recordLinkOpen(link) {
  await pool.execute(
    `UPDATE provider_action_links
     SET open_count = open_count + 1,
         first_opened_at = COALESCE(first_opened_at, NOW()),
         last_seen_at = NOW()
     WHERE id = ?`,
    [link.id]
  );
  await addEvent(link.id, { eventType: 'opened' });
}

export async function recordLinkHeartbeat(link) {
  const lastHb = link.last_heartbeat_at ? new Date(link.last_heartbeat_at) : null;
  const now = new Date();
  let delta = 0;
  if (lastHb) {
    delta = Math.max(0, Math.floor((now - lastHb) / 1000));
    if (delta > SESSION_GAP_SEC) delta = 0;
    else delta = Math.min(delta, HEARTBEAT_CAP_SEC);
  }
  const active = Number(link.active_seconds || 0) + delta;
  await pool.execute(
    `UPDATE provider_action_links
     SET active_seconds = ?, last_heartbeat_at = ?, last_seen_at = NOW()
     WHERE id = ?`,
    [active, mysqlDt(now), link.id]
  );
  return { activeSeconds: active, deltaSec: delta };
}

export async function recordClientCompleted(link, { clientId, actionKey, outcome }) {
  await pool.execute(
    `UPDATE provider_action_link_clients
     SET completed_at = NOW(), outcome = ?, action_key = COALESCE(?, action_key)
     WHERE link_id = ? AND client_id = ?`,
    [outcome || null, actionKey || null, link.id, clientId]
  );
  const [done] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM provider_action_link_clients
     WHERE link_id = ? AND completed_at IS NOT NULL`,
    [link.id]
  );
  const completed = Number(done?.[0]?.cnt || 0);
  const remaining = Math.max(0, Number(link.client_count || 0) - completed);
  await pool.execute(
    `UPDATE provider_action_links SET completed_count = ?, remaining_count = ? WHERE id = ?`,
    [completed, remaining, link.id]
  );
  await addEvent(link.id, {
    eventType: 'completed_client',
    clientId,
    actionKey,
    outcome
  });
  return { completedCount: completed, remainingCount: remaining };
}

export async function getPublicBundle(token) {
  const link = await getLinkByToken(token);
  if (!link) {
    const err = new Error('This link is invalid.');
    err.status = 404;
    throw err;
  }
  if (!isLinkUsable(link)) {
    const err = new Error('This link has expired. Ask your admin to send a new one.');
    err.status = 410;
    err.code = 'expired';
    throw err;
  }
  const name = await loadUserName(link.provider_user_id);
  const liveClients = await listProviderActionClients({
    agencyId: link.agency_id,
    providerUserId: link.provider_user_id,
    scope: 'school'
  });
  const [snap] = await pool.execute(
    `SELECT * FROM provider_action_link_clients WHERE link_id = ? ORDER BY id ASC`,
    [link.id]
  );
  return {
    link: serializeLink(link, { includeUrl: true }),
    provider: {
      id: Number(link.provider_user_id),
      firstName: name.firstName,
      lastName: name.lastName,
      displayName: [name.firstName, name.lastName].filter(Boolean).join(' ') || 'there'
    },
    secondsPerClient: SECONDS_PER_CLIENT,
    estimatedSeconds: estimateSeconds(liveClients.length),
    estimatedLabel: formatEstimateLabel(estimateSeconds(liveClients.length)),
    clients: liveClients,
    snapshot: snap || []
  };
}

export async function assertClientOnLink(link, clientId) {
  const cid = Number(clientId);
  const live = await listProviderActionClients({
    agencyId: link.agency_id,
    providerUserId: link.provider_user_id,
    scope: 'school'
  });
  if (live.some((c) => Number(c.id) === cid)) return true;
  const [rows] = await pool.execute(
    `SELECT 1 FROM provider_action_link_clients WHERE link_id = ? AND client_id = ? LIMIT 1`,
    [link.id, cid]
  );
  if (rows?.[0]) return true;
  const err = new Error('That client is not on this action list.');
  err.status = 403;
  throw err;
}

export async function buildPdfForProvider({
  agencyId,
  providerUserId,
  createdByUserId,
  scope = 'school'
}) {
  const { link, clients } = await createProviderActionLink({
    agencyId,
    providerUserId,
    createdByUserId,
    scope
  });
  await pool.execute(
    `UPDATE provider_action_links SET last_pdf_downloaded_at = NOW() WHERE id = ?`,
    [link.id]
  );
  const name = await loadUserName(providerUserId);
  const agency = await Agency.findById(agencyId).catch(() => null);
  const actionUrl = publicActionUrl(link.token);
  const pdfBytes = await renderProviderActionPdf({
    firstName: name.firstName,
    clientCount: clients.length,
    secondsPerClient: SECONDS_PER_CLIENT,
    estimatedSeconds: Number(link.estimated_seconds || estimateSeconds(clients.length)),
    actionUrl,
    expiresAt: link.expires_at,
    googleSsoUrl: googleSsoUrl(agency?.portal_url || agency?.slug || ''),
    agency
  });
  return {
    pdfBytes,
    filename: pdfFilenameForProvider(name),
    link: serializeLink({ ...link, last_pdf_downloaded_at: new Date() }, { includeUrl: true }),
    clientCount: clients.length
  };
}

export async function getLinkDetail({ agencyId, providerUserId }) {
  const [rows] = await pool.execute(
    `SELECT * FROM provider_action_links
     WHERE agency_id = ? AND provider_user_id = ?
     ORDER BY id DESC LIMIT 8`,
    [Number(agencyId), Number(providerUserId)]
  );
  const latest = rows?.[0] || null;
  let clients = [];
  let events = [];
  if (latest) {
    const [cRows] = await pool.execute(
      `SELECT palc.*, c.initials, c.full_name, c.identifier_code
       FROM provider_action_link_clients palc
       LEFT JOIN clients c ON c.id = palc.client_id
       WHERE palc.link_id = ?
       ORDER BY palc.id ASC`,
      [latest.id]
    );
    clients = cRows || [];
    const [eRows] = await pool.execute(
      `SELECT * FROM provider_action_link_events WHERE link_id = ? ORDER BY id DESC LIMIT 50`,
      [latest.id]
    );
    events = eRows || [];
  }
  return {
    latestLink: serializeLink(latest, { includeUrl: true }),
    history: (rows || []).map((r) => serializeLink(r, { includeUrl: false })),
    clients,
    events
  };
}

export { publicActionUrl, serializeLink };
