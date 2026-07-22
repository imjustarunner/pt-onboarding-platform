import pool from '../config/database.js';
import User from '../models/User.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import Notification from '../models/Notification.model.js';
import { decryptChatText, encryptChatText, isChatEncryptionConfigured } from '../services/chatEncryption.service.js';
import { startAdhocTeamMeeting } from '../services/teamMeetingStart.service.js';

async function hasChatMessageEncryptionColumns() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'chat_messages' AND column_name = 'body_ciphertext'
       LIMIT 1`
    );
    return rows?.length > 0;
  } catch {
    return false;
  }
}

async function hasChatMessagesAnnouncementColumn() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'chat_messages' AND column_name = 'announcement_id'
       LIMIT 1`
    );
    return rows?.length > 0;
  } catch {
    return false;
  }
}

async function hasChatMessageAttachmentsTable() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'chat_message_attachments'
       LIMIT 1`
    );
    return rows?.length > 0;
  } catch {
    return false;
  }
}

async function hasChatMessageReactionsTable() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'chat_message_reactions'
       LIMIT 1`
    );
    return rows?.length > 0;
  } catch {
    return false;
  }
}

async function hasParentMessageColumn() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'chat_messages' AND column_name = 'parent_message_id'
       LIMIT 1`
    );
    return rows?.length > 0;
  } catch {
    return false;
  }
}

async function hasChatMessageMentionsTable() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'chat_message_mentions'
       LIMIT 1`
    );
    return rows?.length > 0;
  } catch {
    return false;
  }
}

/** Resolve a parent id to the root message id (Slack-style: no nested trees). */
async function resolveRootMessageId(threadId, parentMessageId) {
  const pid = parseInt(parentMessageId, 10);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  const [[msg]] = await pool.execute(
    `SELECT id, thread_id, parent_message_id
       FROM chat_messages
      WHERE id = ? AND thread_id = ?
      LIMIT 1`,
    [pid, threadId]
  );
  if (!msg) {
    const err = new Error('Parent message not found in this conversation');
    err.status = 400;
    throw err;
  }
  return msg.parent_message_id ? Number(msg.parent_message_id) : Number(msg.id);
}

/**
 * Parse @username and @First Last mentions against thread participants.
 * Returns unique user ids (excluding sender).
 */
function resolveMentionedUserIds(body, participants, senderUserId) {
  const text = String(body || '');
  if (!text.includes('@')) return [];
  const lower = text.toLowerCase();
  const hit = new Set();
  for (const p of participants || []) {
    const uid = Number(p.user_id || p.id);
    if (!uid || uid === Number(senderUserId)) continue;
    const username = String(p.username || '').trim();
    const first = String(p.first_name || '').trim();
    const last = String(p.last_name || '').trim();
    const full = `${first} ${last}`.trim();
    const candidates = [];
    if (username) candidates.push(`@${username.toLowerCase()}`);
    if (full) candidates.push(`@${full.toLowerCase()}`);
    if (first && !last) candidates.push(`@${first.toLowerCase()}`);
    for (const c of candidates) {
      if (!c || c === '@') continue;
      // Word-ish boundary: mention not followed by more name letters
      const idx = lower.indexOf(c);
      if (idx === -1) continue;
      const after = lower[idx + c.length];
      if (after && /[a-z0-9._-]/.test(after)) continue;
      hit.add(uid);
      break;
    }
  }
  return [...hit];
}

async function loadMentionsForMessages(messageIds) {
  const out = new Map();
  if (!messageIds.length) return out;
  if (!(await hasChatMessageMentionsTable())) return out;
  const placeholders = messageIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT message_id, mentioned_user_id
       FROM chat_message_mentions
      WHERE message_id IN (${placeholders})`,
    messageIds
  );
  for (const r of rows || []) {
    const mid = Number(r.message_id);
    const arr = out.get(mid) || [];
    arr.push(Number(r.mentioned_user_id));
    out.set(mid, arr);
  }
  return out;
}

async function loadReplyCountsForRoots(rootIds) {
  const out = new Map();
  if (!rootIds.length) return out;
  if (!(await hasParentMessageColumn())) return out;
  const placeholders = rootIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT parent_message_id AS root_id, COUNT(*) AS c
       FROM chat_messages
      WHERE parent_message_id IN (${placeholders})
      GROUP BY parent_message_id`,
    rootIds
  );
  for (const r of rows || []) {
    out.set(Number(r.root_id), Number(r.c || 0));
  }
  return out;
}

async function insertMessageMentions(messageId, mentionedUserIds) {
  if (!mentionedUserIds?.length) return;
  if (!(await hasChatMessageMentionsTable())) return;
  const values = mentionedUserIds.map(() => '(?, ?)').join(',');
  const params = [];
  for (const uid of mentionedUserIds) {
    params.push(messageId, uid);
  }
  await pool.execute(
    `INSERT IGNORE INTO chat_message_mentions (message_id, mentioned_user_id) VALUES ${values}`,
    params
  );
}

const ATTACHMENT_KIND_WHITELIST = new Set(['image', 'gif', 'video', 'file']);

function normalizeIncomingAttachment(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const filePath = String(raw.filePath || raw.file_path || '').trim();
  if (!filePath || filePath.length > 512) return null;
  const mimeType = raw.mimeType || raw.mime_type || null;
  const kindRaw = String(raw.kind || raw.file_kind || 'file').toLowerCase();
  const kind = ATTACHMENT_KIND_WHITELIST.has(kindRaw) ? kindRaw : 'file';
  const width = Number.isFinite(Number(raw.width)) ? Number(raw.width) : null;
  const height = Number.isFinite(Number(raw.height)) ? Number(raw.height) : null;
  const byteSize = Number.isFinite(Number(raw.byteSize ?? raw.byte_size)) ? Number(raw.byteSize ?? raw.byte_size) : null;
  const originalFilename = raw.originalFilename || raw.original_filename || null;
  return { filePath, mimeType, kind, width, height, byteSize, originalFilename };
}

async function loadAttachmentsForMessages(messageIds) {
  if (!messageIds.length) return new Map();
  if (!(await hasChatMessageAttachmentsTable())) return new Map();
  const placeholders = messageIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, message_id, file_path, mime_type, file_kind, width, height, byte_size, original_filename, created_at
       FROM chat_message_attachments
       WHERE message_id IN (${placeholders})
       ORDER BY id ASC`,
    messageIds
  );
  const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
  const out = new Map();
  for (const r of rows || []) {
    const arr = out.get(Number(r.message_id)) || [];
    arr.push({
      id: Number(r.id),
      file_path: r.file_path,
      file_url: `${baseUrl}/uploads/${r.file_path}`,
      mime_type: r.mime_type || null,
      file_kind: r.file_kind || 'file',
      width: r.width != null ? Number(r.width) : null,
      height: r.height != null ? Number(r.height) : null,
      byte_size: r.byte_size != null ? Number(r.byte_size) : null,
      original_filename: r.original_filename || null,
      created_at: r.created_at
    });
    out.set(Number(r.message_id), arr);
  }
  return out;
}

async function loadReactionsForMessages(messageIds, viewerUserId) {
  if (!messageIds.length) return new Map();
  if (!(await hasChatMessageReactionsTable())) return new Map();
  const placeholders = messageIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT r.message_id, r.reaction_code, r.user_id,
            u.first_name, u.last_name,
            ic.file_path AS icon_file_path
       FROM chat_message_reactions r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN icons ic ON ic.id = r.reaction_icon_id
      WHERE r.message_id IN (${placeholders})
      ORDER BY r.created_at ASC`,
    messageIds
  );
  const baseUrl = String(process.env.BACKEND_PUBLIC_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
  const buckets = new Map(); // message_id -> Map(code -> { iconUrl, users[] })
  for (const r of rows || []) {
    const mid = Number(r.message_id);
    let perMsg = buckets.get(mid);
    if (!perMsg) { perMsg = new Map(); buckets.set(mid, perMsg); }
    let entry = perMsg.get(r.reaction_code);
    if (!entry) {
      entry = {
        iconUrl: r.icon_file_path ? `${baseUrl}/uploads/${r.icon_file_path}` : null,
        users: []
      };
      perMsg.set(r.reaction_code, entry);
    }
    entry.users.push({
      userId: Number(r.user_id),
      firstName: r.first_name,
      lastName: r.last_name
    });
  }
  const out = new Map();
  for (const [mid, perMsg] of buckets.entries()) {
    const arr = [];
    for (const [code, { iconUrl, users }] of perMsg.entries()) {
      arr.push({
        code,
        iconUrl,
        count: users.length,
        users,
        sampleUserNames: users.slice(0, 5).map((u) => `${u.firstName || ''} ${u.lastName || ''}`.trim()).filter(Boolean),
        mineActive: users.some((u) => Number(u.userId) === Number(viewerUserId))
      });
    }
    arr.sort((a, b) => b.count - a.count);
    out.set(mid, arr);
  }
  return out;
}

async function assertAgencyOrOrgAccess(reqUser, agencyId, organizationId = null) {
  if (reqUser.role === 'super_admin') return true;
  // Direct user_agencies check (handles club managers in affiliation-type orgs)
  const [direct] = await pool.execute(
    'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
    [reqUser.id, agencyId]
  );
  if (direct?.length > 0) return true;
  const agencies = await User.getAgencies(reqUser.id);
  const ids = (agencies || []).map((a) => Number(a?.id)).filter(Boolean);
  const okAgency = ids.includes(Number(agencyId));
  const okOrg = organizationId ? ids.includes(Number(organizationId)) : false;
  if (!okAgency && !okOrg) {
    const err = new Error('Access denied to this agency');
    err.status = 403;
    throw err;
  }
  return true;
}

async function assertThreadAccess(reqUserId, threadId) {
  const [rows] = await pool.execute(
    'SELECT 1 FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? LIMIT 1',
    [threadId, reqUserId]
  );
  const ok = rows.length > 0;
  if (!ok) {
    const err = new Error('Access denied to this chat thread');
    err.status = 403;
    throw err;
  }
  return true;
}

async function otherUserAllowedInAgency(otherUserId, agencyId, organizationId = null) {
  const [inAgency] = await pool.execute(
    'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
    [otherUserId, agencyId]
  );
  if (inAgency.length > 0) return true;
  const [onManagementTeam] = await pool.execute(
    'SELECT 1 FROM agency_management_team WHERE user_id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1',
    [otherUserId, agencyId]
  );
  if (onManagementTeam.length > 0) return true;
  if (organizationId) {
    const [inChildOrg] = await pool.execute(
      'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [otherUserId, organizationId]
    );
    if (inChildOrg.length > 0) return true;
  }
  return false;
}

/** Pick an agency both users can use for a direct thread (shared membership preferred). */
async function resolveDirectThreadAgencyId(meUserId, otherUserId, requestedAgencyId, organizationId = null) {
  const reqAgency = Number(requestedAgencyId || 0);
  if (!reqAgency || !otherUserId || !meUserId) return null;
  if (await otherUserAllowedInAgency(otherUserId, reqAgency, organizationId)) return reqAgency;

  const [shared] = await pool.execute(
    `SELECT ua1.agency_id AS id
     FROM user_agencies ua1
     INNER JOIN user_agencies ua2 ON ua2.agency_id = ua1.agency_id
     INNER JOIN agencies a ON a.id = ua1.agency_id
     WHERE ua1.user_id = ? AND ua2.user_id = ?
       AND LOWER(COALESCE(a.organization_type, 'agency')) IN ('agency', 'organization', '')
     ORDER BY CASE WHEN ua1.agency_id = ? THEN 0 ELSE 1 END, a.name ASC
     LIMIT 1`,
    [meUserId, otherUserId, reqAgency]
  );
  if (shared.length) return Number(shared[0].id);

  const [otherAgency] = await pool.execute(
    `SELECT ua.agency_id AS id
     FROM user_agencies ua
     INNER JOIN agencies a ON a.id = ua.agency_id
     WHERE ua.user_id = ?
       AND LOWER(COALESCE(a.organization_type, 'agency')) IN ('agency', 'organization', '')
     ORDER BY CASE WHEN ua.agency_id = ? THEN 0 ELSE 1 END, a.name ASC
     LIMIT 1`,
    [otherUserId, reqAgency]
  );
  if (otherAgency.length) return Number(otherAgency[0].id);

  return null;
}

async function guardianCanPostSkillBuilderEventChat(userId, companyEventId) {
  const uid = Number(userId);
  const eid = Number(companyEventId);
  if (!uid || !eid) return false;
  try {
    const linked = await ClientGuardian.listClientsForGuardian({ guardianUserId: uid });
    const allowed = new Set((linked || []).map((c) => Number(c.client_id)).filter((n) => n > 0));
    if (!allowed.size) return false;
    const ids = [...allowed];
    const ph = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT 1
       FROM skills_group_clients sgc
       INNER JOIN skills_groups sg ON sg.id = sgc.skills_group_id
       INNER JOIN clients c ON c.id = sgc.client_id AND c.agency_id = sg.agency_id AND c.skills = TRUE
       WHERE sg.company_event_id = ?
         AND sgc.client_id IN (${ph})
       LIMIT 1`,
      [eid, ...ids]
    );
    return !!rows?.[0];
  } catch {
    return false;
  }
}

async function assertUsersInAgency(agencyId, userIds) {
  const ids = [...new Set((userIds || []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT user_id
     FROM user_agencies
     WHERE agency_id = ? AND user_id IN (${placeholders})`,
    [agencyId, ...ids]
  );
  const ok = new Set((rows || []).map((r) => Number(r.user_id)));
  const missing = ids.filter((id) => !ok.has(id));
  if (missing.length) {
    const err = new Error('One or more users are not in the selected agency');
    err.status = 400;
    throw err;
  }
  return ids;
}

export async function findOrCreateDirectThread(agencyId, organizationId, userAId, userBId) {
  if (Number(userAId) === Number(userBId)) {
    const err = new Error('Cannot create a chat with yourself');
    err.status = 400;
    throw err;
  }
  // Find a direct thread in this agency that has exactly these 2 participants.
  const [rows] = await pool.execute(
    `SELECT tp.thread_id
     FROM chat_threads t
     JOIN chat_thread_participants tp ON tp.thread_id = t.id
     WHERE t.agency_id = ?
       AND (t.organization_id <=> ?)
       AND t.thread_type = 'direct'
       AND tp.user_id IN (?, ?)
     GROUP BY tp.thread_id
     HAVING COUNT(DISTINCT tp.user_id) = 2
     LIMIT 1`,
    [agencyId, organizationId || null, userAId, userBId]
  );
  if (rows.length) return rows[0].thread_id;

  const [ins] = await pool.execute(
    'INSERT INTO chat_threads (agency_id, organization_id, thread_type) VALUES (?, ?, ?)',
    [agencyId, organizationId || null, 'direct']
  );
  const threadId = ins.insertId;
  await pool.execute(
    'INSERT IGNORE INTO chat_thread_participants (thread_id, user_id) VALUES (?, ?), (?, ?)',
    [threadId, userAId, threadId, userBId]
  );
  return threadId;
}

export async function createGroupThreadInDb(agencyId, organizationId, participantUserIds) {
  const unique = [...new Set(participantUserIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (unique.length < 3) {
    const err = new Error('Group threads require at least 3 participants (including you)');
    err.status = 400;
    throw err;
  }

  const [ins] = await pool.execute(
    'INSERT INTO chat_threads (agency_id, organization_id, thread_type) VALUES (?, ?, ?)',
    [agencyId, organizationId || null, 'group']
  );
  const threadId = ins.insertId;

  const values = unique.map(() => '(?, ?)').join(',');
  const params = [];
  for (const uid of unique) {
    params.push(threadId, uid);
  }
  await pool.execute(
    `INSERT INTO chat_thread_participants (thread_id, user_id) VALUES ${values}`,
    params
  );

  return threadId;
}

async function hasChatThreadsTeamColumn() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'chat_threads' AND column_name = 'team_id'
       LIMIT 1`
    );
    return rows?.length > 0;
  } catch {
    return false;
  }
}

/**
 * Find or lazily create the persistent team-wide chat thread for a given
 * (clubId, teamId). Adds all current team members + the team manager as
 * participants. Safe to call repeatedly - O(1) once the row exists.
 *
 * Returns { threadId, isNew, participantIds }.
 */
export async function getOrCreateTeamThread({ clubId, teamId }) {
  const club = Number(clubId);
  const tid = Number(teamId);
  if (!club || !tid) {
    const err = new Error('clubId and teamId are required');
    err.status = 400;
    throw err;
  }

  const hasTeamCol = await hasChatThreadsTeamColumn();
  if (!hasTeamCol) {
    const err = new Error('Team chat threads require migration 720');
    err.status = 500;
    throw err;
  }

  const [existing] = await pool.execute(
    `SELECT id FROM chat_threads
     WHERE agency_id = ? AND team_id = ? AND thread_type = 'team'
     LIMIT 1`,
    [club, tid]
  );

  let threadId;
  let isNew = false;
  if (existing?.length) {
    threadId = Number(existing[0].id);
  } else {
    const [ins] = await pool.execute(
      `INSERT INTO chat_threads (agency_id, organization_id, thread_type, team_id)
       VALUES (?, ?, 'team', ?)`,
      [club, null, tid]
    );
    threadId = Number(ins.insertId);
    isNew = true;
  }

  const [memberRows] = await pool.execute(
    `SELECT DISTINCT provider_user_id AS user_id
       FROM challenge_team_members
       WHERE team_id = ?
     UNION
     SELECT team_manager_user_id AS user_id
       FROM challenge_teams
       WHERE id = ? AND team_manager_user_id IS NOT NULL`,
    [tid, tid]
  );
  const participantIds = [...new Set((memberRows || []).map((r) => Number(r.user_id)).filter(Boolean))];
  if (participantIds.length) {
    const values = participantIds.map(() => '(?, ?)').join(',');
    const params = [];
    for (const uid of participantIds) {
      params.push(threadId, uid);
    }
    await pool.execute(
      `INSERT IGNORE INTO chat_thread_participants (thread_id, user_id) VALUES ${values}`,
      params
    );
  }

  return { threadId, isNew, participantIds };
}

/**
 * Find or lazily create the persistent club-wide chat thread for a given clubId.
 * Adds every user_agencies row for this club as a participant. Heavy clubs
 * (200+ members) are still cheap because participants are inserted with
 * INSERT IGNORE.
 *
 * Returns { threadId, isNew, participantIds }.
 */
export async function getOrCreateClubThread({ clubId }) {
  const club = Number(clubId);
  if (!club) {
    const err = new Error('clubId is required');
    err.status = 400;
    throw err;
  }

  const hasTeamCol = await hasChatThreadsTeamColumn();
  if (!hasTeamCol) {
    const err = new Error('Club chat threads require migration 720');
    err.status = 500;
    throw err;
  }

  const [existing] = await pool.execute(
    `SELECT id FROM chat_threads
     WHERE agency_id = ? AND team_id IS NULL AND thread_type = 'club'
     LIMIT 1`,
    [club]
  );

  let threadId;
  let isNew = false;
  if (existing?.length) {
    threadId = Number(existing[0].id);
  } else {
    const [ins] = await pool.execute(
      `INSERT INTO chat_threads (agency_id, organization_id, thread_type, team_id)
       VALUES (?, ?, 'club', NULL)`,
      [club, null]
    );
    threadId = Number(ins.insertId);
    isNew = true;
  }

  const [memberRows] = await pool.execute(
    `SELECT DISTINCT user_id FROM user_agencies WHERE agency_id = ?`,
    [club]
  );
  const participantIds = [...new Set((memberRows || []).map((r) => Number(r.user_id)).filter(Boolean))];
  if (participantIds.length) {
    // Batch insert in chunks of 200 to keep statement size reasonable.
    const CHUNK = 200;
    for (let i = 0; i < participantIds.length; i += CHUNK) {
      const chunk = participantIds.slice(i, i + CHUNK);
      const values = chunk.map(() => '(?, ?)').join(',');
      const params = [];
      for (const uid of chunk) {
        params.push(threadId, uid);
      }
      await pool.execute(
        `INSERT IGNORE INTO chat_thread_participants (thread_id, user_id) VALUES ${values}`,
        params
      );
    }
  }

  return { threadId, isNew, participantIds };
}

/**
 * Best-effort: ensure userId is a participant of the team thread for (clubId, teamId).
 * Used when someone joins / is added to a team after the thread already exists.
 */
export async function ensureUserInTeamThread({ clubId, teamId, userId }) {
  const club = Number(clubId);
  const tid = Number(teamId);
  const uid = Number(userId);
  if (!club || !tid || !uid) return;
  try {
    const hasTeamCol = await hasChatThreadsTeamColumn();
    if (!hasTeamCol) return;
    const [rows] = await pool.execute(
      `SELECT id FROM chat_threads
       WHERE agency_id = ? AND team_id = ? AND thread_type = 'team'
       LIMIT 1`,
      [club, tid]
    );
    const threadId = rows?.[0]?.id ? Number(rows[0].id) : null;
    if (!threadId) return;
    await pool.execute(
      `INSERT IGNORE INTO chat_thread_participants (thread_id, user_id) VALUES (?, ?)`,
      [threadId, uid]
    );
  } catch {
    // Best-effort; callers should never fail because of thread sync.
  }
}

/**
 * Best-effort: ensure userId is a participant of the club-wide thread for clubId.
 * Used when someone is added to a club after the thread already exists.
 */
export async function ensureUserInClubThread({ clubId, userId }) {
  const club = Number(clubId);
  const uid = Number(userId);
  if (!club || !uid) return;
  try {
    const hasTeamCol = await hasChatThreadsTeamColumn();
    if (!hasTeamCol) return;
    const [rows] = await pool.execute(
      `SELECT id FROM chat_threads
       WHERE agency_id = ? AND team_id IS NULL AND thread_type = 'club'
       LIMIT 1`,
      [club]
    );
    const threadId = rows?.[0]?.id ? Number(rows[0].id) : null;
    if (!threadId) return;
    await pool.execute(
      `INSERT IGNORE INTO chat_thread_participants (thread_id, user_id) VALUES (?, ?)`,
      [threadId, uid]
    );
  } catch {
    // Best-effort
  }
}

async function resolveActiveAgencyIdForOrg(orgId) {
  // Prefer organization_affiliations; fall back to legacy agency_schools.
  const [rows] = await pool.execute(
    `SELECT agency_id
     FROM organization_affiliations
     WHERE organization_id = ? AND is_active = TRUE
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [orgId]
  );
  if (rows?.[0]?.agency_id) return Number(rows[0].agency_id);
  try {
    const [legacy] = await pool.execute(
      `SELECT agency_id
       FROM agency_schools
       WHERE school_organization_id = ? AND (is_active = TRUE OR is_active IS NULL)
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [orgId]
    );
    return legacy?.[0]?.agency_id ? Number(legacy[0].agency_id) : null;
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
    if (missing) return null;
    throw e;
  }
}

export const listMyThreads = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;

    let agencyIds = [];
    if (agencyId) {
      await assertAgencyOrOrgAccess(req.user, agencyId);
      agencyIds = [agencyId];
    } else {
      if (req.user.role === 'super_admin') {
        const [a] = await pool.execute(
          `SELECT id
           FROM agencies
           WHERE (is_archived = FALSE OR is_archived IS NULL)`
        );
        agencyIds = (a || []).map((r) => r.id);
      } else {
        const agencies = await User.getAgencies(req.user.id);
        agencyIds = (agencies || []).map((a) => a.id);
      }
    }

    const userId = req.user.id;
    if (!agencyIds.length) return res.json([]);
    const placeholders = agencyIds.map(() => '?').join(',');
    const hasTeamCol = await hasChatThreadsTeamColumn();
    const teamCol = hasTeamCol ? ', t.team_id' : '';
    let channelCols = '';
    try {
      const [colCheck] = await pool.execute(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'chat_threads' AND column_name = 'slug' LIMIT 1`
      );
      if (colCheck?.length) channelCols = ', t.name AS channel_name, t.slug AS channel_slug';
    } catch {
      /* ignore */
    }
    const [rows] = await pool.execute(
      `SELECT t.id AS thread_id,
              t.agency_id,
              a.name AS agency_name,
              t.organization_id,
              t.thread_type${teamCol}${channelCols},
              t.updated_at,
              lm.id AS last_message_id,
              lm.body AS last_message_body,
              lm.created_at AS last_message_at,
              lm.sender_user_id AS last_message_sender_user_id,
              r.last_read_message_id,
              td.deleted_at AS thread_deleted_at,
              (
                SELECT COUNT(*)
                FROM chat_messages m2
                WHERE m2.thread_id = t.id
                  AND (r.last_read_message_id IS NULL OR m2.id > r.last_read_message_id)
                  AND m2.sender_user_id <> ?
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_message_deletes d2
                    WHERE d2.user_id = ? AND d2.message_id = m2.id
                  )
              ) AS unread_count
       FROM chat_threads t
       JOIN chat_thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?
       LEFT JOIN agencies a ON a.id = t.agency_id
       LEFT JOIN chat_thread_reads r ON r.thread_id = t.id AND r.user_id = ?
       LEFT JOIN chat_thread_deletes td ON td.thread_id = t.id AND td.user_id = ?
       LEFT JOIN chat_messages lm ON lm.id = (
         SELECT m.id
         FROM chat_messages m
         LEFT JOIN chat_message_deletes d ON d.message_id = m.id AND d.user_id = ?
         WHERE m.thread_id = t.id AND d.message_id IS NULL
         ORDER BY m.id DESC
         LIMIT 1
       )
       WHERE t.agency_id IN (${placeholders})
         AND (td.deleted_at IS NULL OR (lm.created_at IS NOT NULL AND lm.created_at > td.deleted_at))
       ORDER BY t.updated_at DESC`,
      [userId, userId, userId, userId, userId, userId, ...agencyIds]
    );

    // Enrich with "other participant" for direct threads
    const threadIds = (rows || []).map((r) => r.thread_id);
    let participantsByThread = {};
    if (threadIds.length) {
      const placeholders2 = threadIds.map(() => '?').join(',');
      const [parts] = await pool.execute(
        `SELECT tp.thread_id, u.id AS user_id, u.first_name, u.last_name, u.email, u.role
         FROM chat_thread_participants tp
         JOIN users u ON u.id = tp.user_id
         WHERE tp.thread_id IN (${placeholders2})`,
        threadIds
      );
      participantsByThread = (parts || []).reduce((acc, p) => {
        acc[p.thread_id] = acc[p.thread_id] || [];
        acc[p.thread_id].push(p);
        return acc;
      }, {});
    }

    // For team / club threads, look up labels (team name or agency name).
    const teamThreadRows = hasTeamCol
      ? (rows || []).filter((r) => String(r.thread_type || '').toLowerCase() === 'team' && Number(r.team_id) > 0)
      : [];
    const clubThreadRows = (rows || []).filter((r) => String(r.thread_type || '').toLowerCase() === 'club');
    const teamLabelById = new Map();
    if (teamThreadRows.length) {
      const teamIds = [...new Set(teamThreadRows.map((r) => Number(r.team_id)).filter(Boolean))];
      const ph = teamIds.map(() => '?').join(',');
      const [trs] = await pool.execute(
        `SELECT t.id, t.team_name, t.learning_class_id, c.organization_id, c.class_name AS class_title
           FROM challenge_teams t
           LEFT JOIN learning_program_classes c ON c.id = t.learning_class_id
          WHERE t.id IN (${ph})`,
        teamIds
      );
      for (const tr of trs || []) {
        teamLabelById.set(Number(tr.id), {
          label: `${tr.team_name || 'Team'}`,
          season_id: tr.learning_class_id ? Number(tr.learning_class_id) : null,
          season_name: tr.class_title || null,
          club_id: tr.organization_id ? Number(tr.organization_id) : null
        });
      }
    }
    const clubLabelById = new Map();
    if (clubThreadRows.length) {
      const clubIds = [...new Set(clubThreadRows.map((r) => Number(r.agency_id)).filter(Boolean))];
      const ph = clubIds.map(() => '?').join(',');
      const [crs] = await pool.execute(
        `SELECT id, name FROM agencies WHERE id IN (${ph})`,
        clubIds
      );
      for (const cr of crs || []) {
        clubLabelById.set(Number(cr.id), { label: `${cr.name || 'Club'} — Everyone` });
      }
    }

    const threads = (rows || []).map((r) => {
      const participants = participantsByThread[r.thread_id] || [];
      const others = participants.filter((p) => p.user_id !== userId);
      const other = others[0] || null;
      const tType = String(r.thread_type || 'direct').toLowerCase();
      let teamMeta = null;
      let label = null;
      if (tType === 'team' && hasTeamCol && Number(r.team_id) > 0) {
        teamMeta = teamLabelById.get(Number(r.team_id)) || null;
        label = teamMeta?.label || 'Team thread';
      } else if (tType === 'club') {
        const c = clubLabelById.get(Number(r.agency_id));
        label = c?.label || 'Club thread';
      } else if (tType === 'channel') {
        label = r.channel_name || r.channel_slug || 'Channel';
      }
      return {
        thread_id: r.thread_id,
        agency_id: r.agency_id,
        agency_name: r.agency_name || null,
        organization_id: r.organization_id || null,
        thread_type: tType,
        team_id: hasTeamCol ? (r.team_id || null) : null,
        thread_label: label,
        channel_name: r.channel_name || null,
        channel_slug: r.channel_slug || null,
        team_meta: teamMeta,
        updated_at: r.updated_at,
        unread_count: Number(r.unread_count || 0),
        last_message: r.last_message_id
          ? {
              id: r.last_message_id,
              body: r.last_message_body,
              created_at: r.last_message_at,
              sender_user_id: r.last_message_sender_user_id
            }
          : null,
        participants: (others || []).map((p) => ({
          id: p.user_id,
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
          role: p.role
        })),
        other_participant: other
          ? {
              id: other.user_id,
              first_name: other.first_name,
              last_name: other.last_name,
              email: other.email,
              role: other.role
            }
          : null
      };
    });

    res.json(threads);
  } catch (e) {
    next(e);
  }
};

export const createOrGetDirectThread = async (req, res, next) => {
  try {
    const agencyId = req.body.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const otherUserId = req.body.otherUserId ? parseInt(req.body.otherUserId, 10) : null;
    const organizationId = req.body.organizationId ? parseInt(req.body.organizationId, 10) : null;
    if (!agencyId || !otherUserId) {
      return res.status(400).json({ error: { message: 'agencyId and otherUserId are required' } });
    }
    // Allow org-scoped chat creation for school portal users who have org access
    // (even if they are not directly in the agency), but require the org to be affiliated to the agency.
    if (organizationId) {
      const active = await resolveActiveAgencyIdForOrg(organizationId);
      if (active && Number(active) !== Number(agencyId)) {
        return res.status(400).json({ error: { message: 'organizationId is not affiliated to this agency' } });
      }
    }
    await assertAgencyOrOrgAccess(req.user, agencyId, organizationId);

    const me = req.user.id;
    if (me === otherUserId) {
      return res.status(400).json({ error: { message: 'Cannot create a chat with yourself' } });
    }

    let resolvedAgencyId = await resolveDirectThreadAgencyId(me, otherUserId, agencyId, organizationId);
    let allowed = !!resolvedAgencyId;

    // Provider/staff ↔ guardian: allow when the other user is a guardian linked to a client
    // assigned to the actor (or actor is agency admin).
    if (!allowed) {
      try {
        const [[otherUser]] = await pool.execute(
          `SELECT role FROM users WHERE id = ? LIMIT 1`,
          [otherUserId]
        );
        const otherRole = String(otherUser?.role || '').toLowerCase();
        const myRole = String(req.user?.role || '').toLowerCase();
        if (otherRole === 'client_guardian') {
          const [linkRows] = await pool.execute(
            `SELECT 1
             FROM client_guardians cg
             INNER JOIN clients c ON c.id = cg.client_id
             WHERE cg.guardian_user_id = ?
               AND cg.access_enabled = 1
               AND c.agency_id = ?
               AND (
                 c.provider_id = ?
                 OR EXISTS (
                   SELECT 1 FROM client_provider_assignments cpa
                   WHERE cpa.client_id = c.id
                     AND cpa.provider_user_id = ?
                     AND cpa.is_active = TRUE
                 )
                 OR ? IN ('admin', 'super_admin', 'support', 'clinical_practice_assistant', 'staff')
               )
             LIMIT 1`,
            [otherUserId, agencyId, me, me, myRole]
          );
          allowed = (linkRows || []).length > 0;
          if (allowed) resolvedAgencyId = agencyId;
        }
      } catch {
        allowed = false;
      }
    }
    if (!allowed || !resolvedAgencyId) {
      return res.status(400).json({ error: { message: 'User is not in the selected agency' } });
    }

    await assertAgencyOrOrgAccess(req.user, resolvedAgencyId, organizationId);

    const threadId = await findOrCreateDirectThread(resolvedAgencyId, organizationId, me, otherUserId);
    // If the user previously deleted/hid this thread, reopen it.
    try {
      await pool.execute('DELETE FROM chat_thread_deletes WHERE thread_id = ? AND user_id = ?', [threadId, me]);
    } catch {
      // ignore (table may not exist yet in some envs)
    }
    res.status(201).json({ threadId, agencyId: resolvedAgencyId });
  } catch (e) {
    next(e);
  }
};

export const createGroupThread = async (req, res, next) => {
  try {
    const agencyId = req.body.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const organizationId = req.body.organizationId ? parseInt(req.body.organizationId, 10) : null;
    const raw = req.body?.userIds ?? req.body?.participantUserIds ?? [];
    if (!agencyId || !Array.isArray(raw)) {
      return res.status(400).json({ error: { message: 'agencyId and userIds are required' } });
    }

    // Allow org-scoped group creation (same guard as direct threads)
    if (organizationId) {
      const active = await resolveActiveAgencyIdForOrg(organizationId);
      if (active && Number(active) !== Number(agencyId)) {
        return res.status(400).json({ error: { message: 'organizationId is not affiliated to this agency' } });
      }
    }
    await assertAgencyOrOrgAccess(req.user, agencyId, organizationId);

    const me = Number(req.user.id);
    const others = [...new Set(raw.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0 && n !== me))];
    if (others.length < 2) {
      return res.status(400).json({ error: { message: 'Select at least 2 other users to start a group' } });
    }
    if (others.length > 30) {
      return res.status(400).json({ error: { message: 'Group size is too large' } });
    }

    // Ensure ALL participants are in the agency (including me).
    await assertUsersInAgency(agencyId, [me, ...others]);

    const threadId = await createGroupThreadInDb(agencyId, organizationId, [me, ...others]);

    // If the creator previously deleted/hid this thread (unlikely on create), ensure it is visible.
    try {
      await pool.execute('DELETE FROM chat_thread_deletes WHERE thread_id = ? AND user_id = ?', [threadId, me]);
    } catch {
      // ignore
    }

    res.status(201).json({ threadId });
  } catch (e) {
    next(e);
  }
};

export const deleteThreadForMe = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });
    await assertThreadAccess(req.user.id, threadId);

    await pool.execute(
      `INSERT INTO chat_thread_deletes (thread_id, user_id, deleted_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE deleted_at = NOW()`,
      [threadId, req.user.id]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listMessages = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });
    await assertThreadAccess(req.user.id, threadId);

    // Read receipts (direct threads): determine what the other participant has read.
    // For now, we support "read by other" by using the max last_read_message_id among all other participants.
    let otherLastReadMessageId = null;
    try {
      const [parts] = await pool.execute(
        'SELECT user_id FROM chat_thread_participants WHERE thread_id = ? AND user_id <> ?',
        [threadId, req.user.id]
      );
      const otherIds = (parts || []).map((p) => Number(p.user_id)).filter(Boolean);
      if (otherIds.length) {
        const placeholders = otherIds.map(() => '?').join(',');
        const [reads] = await pool.execute(
          `SELECT last_read_message_id
           FROM chat_thread_reads
           WHERE thread_id = ? AND user_id IN (${placeholders})`,
          [threadId, ...otherIds]
        );
        for (const r of reads || []) {
          const v = r?.last_read_message_id ? Number(r.last_read_message_id) : null;
          if (!v) continue;
          if (!otherLastReadMessageId || v > otherLastReadMessageId) otherLastReadMessageId = v;
        }
      }
    } catch {
      // Best-effort; do not fail message loading if receipts can't be computed.
      otherLastReadMessageId = null;
    }

    // NOTE: Some MySQL/CloudSQL setups reject prepared-statement params for LIMIT,
    // yielding "Incorrect arguments to mysqld_stmt_execute". We inline a validated integer.
    const parsed = req.query.limit ? parseInt(req.query.limit, 10) : null;
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : 60;
    const hasEncryptionCols = await hasChatMessageEncryptionColumns();
    const hasAnnouncementCol = await hasChatMessagesAnnouncementColumn();
    const hasParentCol = await hasParentMessageColumn();
    const parentMessageIdQ = req.query.parentMessageId
      ? parseInt(req.query.parentMessageId, 10)
      : null;
    const encCols = hasEncryptionCols
      ? ', m.body_ciphertext, m.body_iv, m.body_auth_tag, m.encryption_key_id'
      : '';
    const annCol = hasAnnouncementCol ? ', m.announcement_id' : '';
    const parentCol = hasParentCol ? ', m.parent_message_id' : '';
    let parentClause = '';
    const sqlParams = [req.user.id, threadId];
    if (hasParentCol) {
      if (Number.isFinite(parentMessageIdQ) && parentMessageIdQ > 0) {
        parentClause = 'AND m.parent_message_id = ?';
        sqlParams.push(parentMessageIdQ);
      } else {
        // Main timeline: root messages only (replies load via parentMessageId).
        parentClause = 'AND m.parent_message_id IS NULL';
      }
    }
    const [rows] = await pool.execute(
      `SELECT m.id, m.thread_id, m.sender_user_id, m.body${encCols}${annCol}${parentCol}, m.created_at,
              u.first_name AS sender_first_name, u.last_name AS sender_last_name,
              u.profile_photo_path AS sender_profile_photo_path
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_user_id
       LEFT JOIN chat_message_deletes d ON d.message_id = m.id AND d.user_id = ?
       WHERE m.thread_id = ?
         AND d.message_id IS NULL
         ${parentClause}
       ORDER BY m.id DESC
       LIMIT ${limit}`,
      sqlParams
    );
    const ordered = (rows || []).reverse();
    const me = Number(req.user.id);
    const messageIds = ordered.map((m) => Number(m.id)).filter(Boolean);
    const [attachmentsByMessage, reactionsByMessage, mentionsByMessage, replyCounts] =
      await Promise.all([
        loadAttachmentsForMessages(messageIds),
        loadReactionsForMessages(messageIds, me),
        loadMentionsForMessages(messageIds),
        // Reply counts only meaningful for root timeline
        !parentMessageIdQ ? loadReplyCountsForRoots(messageIds) : Promise.resolve(new Map())
      ]);
    const enriched = ordered.map((m) => {
      const id = m?.id ? Number(m.id) : null;
      const isMine = Number(m?.sender_user_id) === me;
      const isReadByOther = !!(isMine && id && otherLastReadMessageId && id <= otherLastReadMessageId);
      let body = m?.body;
      if (!body && m?.body_ciphertext && m?.body_iv && m?.body_auth_tag) {
        try {
          body = decryptChatText({
            ciphertextB64: m.body_ciphertext,
            ivB64: m.body_iv,
            authTagB64: m.body_auth_tag,
            keyId: m.encryption_key_id || null
          });
        } catch {
          body = '[Unable to decrypt message]';
        }
      }
      const attachments = attachmentsByMessage.get(Number(m?.id)) || [];
      const reactions = reactionsByMessage.get(Number(m?.id)) || [];
      const mentioned = mentionsByMessage.get(Number(m?.id)) || [];
      return {
        ...m,
        body: body || '',
        parent_message_id: m.parent_message_id != null ? Number(m.parent_message_id) : null,
        reply_count: replyCounts.get(Number(m?.id)) || 0,
        mentioned_user_ids: mentioned,
        is_read_by_other: isReadByOther,
        attachments,
        reactions
      };
    });
    res.json(enriched);
  } catch (e) {
    next(e);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    const body = (req.body?.body || '').trim();
    const incomingAttachments = Array.isArray(req.body?.attachments)
      ? req.body.attachments.map(normalizeIncomingAttachment).filter(Boolean).slice(0, 10)
      : [];
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });
    if (!body && incomingAttachments.length === 0) {
      return res.status(400).json({ error: { message: 'body or attachments required' } });
    }
    await assertThreadAccess(req.user.id, threadId);

    // Resolve agency + participants
    const [[t]] = await pool.execute(
      'SELECT id, agency_id, organization_id, company_event_id, thread_type FROM chat_threads WHERE id = ?',
      [threadId]
    );
    if (!t) return res.status(404).json({ error: { message: 'Thread not found' } });
    const agencyId = t.agency_id;
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const evId = t.company_event_id ? Number(t.company_event_id) : null;
    const isSbEventThread =
      String(t.thread_type || '').toLowerCase() === 'skill_builders_event' && evId && Number.isFinite(evId) && evId > 0;
    if (roleNorm === 'client_guardian' && isSbEventThread) {
      const okG = await guardianCanPostSkillBuilderEventChat(req.user.id, evId);
      if (!okG) {
        return res.status(403).json({ error: { message: 'Access denied to this chat' } });
      }
    } else {
      await assertAgencyOrOrgAccess(req.user, agencyId, t.organization_id || null);
    }

    const hasParentCol = await hasParentMessageColumn();
    let rootParentId = null;
    if (hasParentCol && (req.body?.parentMessageId != null || req.body?.parent_message_id != null)) {
      rootParentId = await resolveRootMessageId(
        threadId,
        req.body?.parentMessageId ?? req.body?.parent_message_id
      );
    }

    let bodyPlain = body;
    let bodyCipher = null;
    let bodyIv = null;
    let bodyTag = null;
    let bodyKeyId = null;
    const hasEncCols = await hasChatMessageEncryptionColumns();
    const senderNeedsEncrypt = roleNorm === 'school_staff' || roleNorm === 'client_guardian';
    let threadNeedsEncrypt = senderNeedsEncrypt;
    if (!threadNeedsEncrypt) {
      try {
        const [ssRows] = await pool.execute(
          `SELECT 1
           FROM chat_thread_participants p
           INNER JOIN users u ON u.id = p.user_id
           WHERE p.thread_id = ?
             AND LOWER(u.role) IN ('school_staff', 'client_guardian')
           LIMIT 1`,
          [threadId]
        );
        threadNeedsEncrypt = (ssRows || []).length > 0;
      } catch {
        threadNeedsEncrypt = senderNeedsEncrypt;
      }
    }
    const requireEncrypt = threadNeedsEncrypt && String(process.env.NODE_ENV || '').toLowerCase() === 'production';

    if (hasEncCols && isChatEncryptionConfigured()) {
      try {
        const enc = encryptChatText(body);
        bodyCipher = enc.ciphertextB64;
        bodyIv = enc.ivB64;
        bodyTag = enc.authTagB64;
        bodyKeyId = enc.keyId;
        bodyPlain = null;
      } catch (e) {
        if (requireEncrypt) {
          return res.status(503).json({
            error: { message: 'Message encryption required for this conversation is unavailable' }
          });
        }
        console.warn('[chat] Encryption failed, storing plaintext:', e?.message || e);
      }
    } else if (requireEncrypt) {
      return res.status(503).json({
        error: {
          message:
            'Message encryption is required for school staff / guardian conversations. Configure CLIENT_CHAT_ENCRYPTION_KEY_BASE64.'
        }
      });
    }

    let ins;
    if (hasParentCol && hasEncCols && bodyCipher) {
      [ins] = await pool.execute(
        `INSERT INTO chat_messages
           (thread_id, sender_user_id, body, body_ciphertext, body_iv, body_auth_tag, encryption_key_id, parent_message_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [threadId, req.user.id, bodyPlain, bodyCipher, bodyIv, bodyTag, bodyKeyId, rootParentId]
      );
    } else if (hasParentCol) {
      [ins] = await pool.execute(
        `INSERT INTO chat_messages (thread_id, sender_user_id, body, parent_message_id)
         VALUES (?, ?, ?, ?)`,
        [threadId, req.user.id, body || '', rootParentId]
      );
    } else if (hasEncCols && bodyCipher) {
      [ins] = await pool.execute(
        `INSERT INTO chat_messages (thread_id, sender_user_id, body, body_ciphertext, body_iv, body_auth_tag, encryption_key_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [threadId, req.user.id, bodyPlain, bodyCipher, bodyIv, bodyTag, bodyKeyId]
      );
    } else {
      [ins] = await pool.execute(
        'INSERT INTO chat_messages (thread_id, sender_user_id, body) VALUES (?, ?, ?)',
        [threadId, req.user.id, body || '']
      );
    }
    const insertedMessageId = Number(ins.insertId);

    if (incomingAttachments.length && (await hasChatMessageAttachmentsTable())) {
      const values = incomingAttachments.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      const params = [];
      for (const a of incomingAttachments) {
        params.push(
          insertedMessageId,
          a.filePath,
          a.mimeType || null,
          a.kind,
          a.width,
          a.height,
          a.byteSize,
          a.originalFilename
        );
      }
      await pool.execute(
        `INSERT INTO chat_message_attachments
           (message_id, file_path, mime_type, file_kind, width, height, byte_size, original_filename)
         VALUES ${values}`,
        params
      );
    }
    await pool.execute('UPDATE chat_threads SET updated_at = NOW() WHERE id = ?', [threadId]);

    // Mentions: resolve against thread participants (exclude sender)
    const [partRows] = await pool.execute(
      `SELECT tp.user_id, u.username, u.first_name, u.last_name
         FROM chat_thread_participants tp
         JOIN users u ON u.id = tp.user_id
        WHERE tp.thread_id = ?`,
      [threadId]
    );
    const mentionedIds = resolveMentionedUserIds(body, partRows || [], req.user.id);
    await insertMessageMentions(insertedMessageId, mentionedIds);

    // Notifications: notify other participant if they are away/offline
    const recipients = (partRows || []).map((p) => p.user_id).filter((id) => id !== req.user.id);

    const senderUser = await User.findById(req.user.id);
    const senderName = `${senderUser?.first_name || ''} ${senderUser?.last_name || ''}`.trim() || 'Someone';
    const notificationBody = body || (incomingAttachments.length ? '[attachment]' : '');
    const snippet = notificationBody.length > 120 ? notificationBody.slice(0, 117) + '…' : notificationBody;

    for (const rid of recipients) {
      // Avoid spamming: only notify if this message is newer than last_notified_message_id
      const messageId = insertedMessageId;
      const [[readState]] = await pool.execute(
        'SELECT last_notified_message_id FROM chat_thread_reads WHERE thread_id = ? AND user_id = ?',
        [threadId, rid]
      );
      if (readState?.last_notified_message_id && messageId <= readState.last_notified_message_id) {
        continue;
      }

      await pool.execute(
        `INSERT INTO chat_thread_reads (thread_id, user_id, last_notified_message_id, last_notified_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE last_notified_message_id = VALUES(last_notified_message_id), last_notified_at = NOW()`,
        [threadId, rid, messageId]
      );

      await Notification.create({
        type: 'chat_message',
        severity: 'info',
        title: 'New chat message',
        message: `${senderName}: ${snippet}`,
        userId: rid,
        agencyId,
        relatedEntityType: 'chat_thread',
        relatedEntityId: threadId,
        actorUserId: req.user.id
      });
    }

    const hasAnnouncementCol = await hasChatMessagesAnnouncementColumn();
    const annCol = hasAnnouncementCol ? ', m.announcement_id' : '';
    const parentCol = hasParentCol ? ', m.parent_message_id' : '';
    const [row] = await pool.execute(
      `SELECT m.id, m.thread_id, m.sender_user_id, m.body${annCol}${parentCol}, m.created_at,
              u.first_name AS sender_first_name, u.last_name AS sender_last_name,
              u.profile_photo_path AS sender_profile_photo_path
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_user_id
       WHERE m.id = ?`,
      [insertedMessageId]
    );
    const out = row[0] || {};
    if (!out.body && body) out.body = body;
    out.parent_message_id = out.parent_message_id != null ? Number(out.parent_message_id) : rootParentId;
    out.mentioned_user_ids = mentionedIds;
    out.reply_count = 0;
    out.attachments = (await loadAttachmentsForMessages([insertedMessageId])).get(insertedMessageId) || [];
    out.reactions = (await loadReactionsForMessages([insertedMessageId], req.user.id)).get(insertedMessageId) || [];
    res.status(201).json(out);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/chat/inbox/threads
 * Roots where the viewer participates in a reply thread (sent or received a reply).
 */
export const listThreadsInbox = async (req, res, next) => {
  try {
    if (!(await hasParentMessageColumn())) {
      return res.json({ items: [] });
    }
    const me = req.user.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const agencyClause = Number.isFinite(agencyId) && agencyId > 0 ? 'AND t.agency_id = ?' : '';
    // Param order matches `?` placeholders in the SQL below.
    const sqlParams = [me, me, me, me, me];
    if (agencyClause) sqlParams.push(agencyId);

    const [rows] = await pool.execute(
      `SELECT
          root.id AS root_message_id,
          root.thread_id,
          root.body AS root_body,
          root.created_at AS root_created_at,
          root.sender_user_id AS root_sender_user_id,
          ru.first_name AS root_sender_first_name,
          ru.last_name AS root_sender_last_name,
          t.agency_id,
          a.name AS agency_name,
          t.thread_type,
          t.name AS channel_name,
          t.slug AS channel_slug,
          latest.id AS latest_reply_id,
          latest.body AS latest_reply_body,
          latest.created_at AS latest_reply_at,
          latest.sender_user_id AS latest_reply_sender_user_id,
          lu.first_name AS latest_reply_first_name,
          lu.last_name AS latest_reply_last_name,
          (
            SELECT COUNT(*)
              FROM chat_messages r2
              LEFT JOIN chat_thread_reads tr
                ON tr.thread_id = r2.thread_id AND tr.user_id = ?
             WHERE r2.parent_message_id = root.id
               AND r2.sender_user_id <> ?
               AND (tr.last_read_message_id IS NULL OR r2.id > tr.last_read_message_id)
          ) AS unread_reply_count,
          (
            SELECT COUNT(*) FROM chat_messages r3 WHERE r3.parent_message_id = root.id
          ) AS reply_count
       FROM chat_messages root
       JOIN chat_threads t ON t.id = root.thread_id
       LEFT JOIN agencies a ON a.id = t.agency_id
       JOIN chat_thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?
       JOIN users ru ON ru.id = root.sender_user_id
       JOIN (
         SELECT parent_message_id, MAX(id) AS max_id
           FROM chat_messages
          WHERE parent_message_id IS NOT NULL
          GROUP BY parent_message_id
       ) mx ON mx.parent_message_id = root.id
       JOIN chat_messages latest ON latest.id = mx.max_id
       JOIN users lu ON lu.id = latest.sender_user_id
      WHERE root.parent_message_id IS NULL
        AND (
          root.sender_user_id = ?
          OR EXISTS (
            SELECT 1 FROM chat_messages r
             WHERE r.parent_message_id = root.id AND r.sender_user_id = ?
          )
        )
        ${agencyClause}
      ORDER BY latest.created_at DESC
      LIMIT 80`,
      sqlParams
    );

    const items = (rows || []).map((r) => ({
      root_message_id: Number(r.root_message_id),
      thread_id: Number(r.thread_id),
      agency_id: Number(r.agency_id),
      agency_name: r.agency_name || null,
      thread_type: r.thread_type || null,
      channel_name: r.channel_name || null,
      channel_slug: r.channel_slug || null,
      root_body: r.root_body || '',
      root_created_at: r.root_created_at,
      root_sender: {
        id: Number(r.root_sender_user_id),
        first_name: r.root_sender_first_name || '',
        last_name: r.root_sender_last_name || ''
      },
      latest_reply: {
        id: Number(r.latest_reply_id),
        body: r.latest_reply_body || '',
        created_at: r.latest_reply_at,
        sender: {
          id: Number(r.latest_reply_sender_user_id),
          first_name: r.latest_reply_first_name || '',
          last_name: r.latest_reply_last_name || ''
        }
      },
      reply_count: Number(r.reply_count || 0),
      unread_reply_count: Number(r.unread_reply_count || 0)
    }));

    res.json({ items });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/chat/inbox/mentions
 * Messages that @mention the viewer.
 */
export const listMentionsInbox = async (req, res, next) => {
  try {
    if (!(await hasChatMessageMentionsTable())) {
      return res.json({ items: [] });
    }
    const me = req.user.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const agencyClause = Number.isFinite(agencyId) && agencyId > 0 ? 'AND t.agency_id = ?' : '';
    const hasParentCol = await hasParentMessageColumn();
    const parentCol = hasParentCol ? 'm.parent_message_id,' : '';
    const sqlParams = [me, me, me];
    if (agencyClause) sqlParams.push(agencyId);

    const [rows] = await pool.execute(
      `SELECT
          m.id AS message_id,
          m.thread_id,
          m.body,
          m.created_at,
          ${parentCol}
          m.sender_user_id,
          u.first_name AS sender_first_name,
          u.last_name AS sender_last_name,
          t.agency_id,
          t.thread_type,
          t.name AS channel_name,
          t.slug AS channel_slug,
          mn.created_at AS mentioned_at,
          (
            SELECT 1
              FROM chat_thread_reads tr
             WHERE tr.thread_id = m.thread_id
               AND tr.user_id = ?
               AND tr.last_read_message_id IS NOT NULL
               AND tr.last_read_message_id >= m.id
             LIMIT 1
          ) AS is_read
       FROM chat_message_mentions mn
       JOIN chat_messages m ON m.id = mn.message_id
       JOIN chat_threads t ON t.id = m.thread_id
       JOIN chat_thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?
       JOIN users u ON u.id = m.sender_user_id
      WHERE mn.mentioned_user_id = ?
        ${agencyClause}
      ORDER BY mn.created_at DESC
      LIMIT 80`,
      sqlParams
    );

    const items = (rows || []).map((r) => ({
      message_id: Number(r.message_id),
      thread_id: Number(r.thread_id),
      agency_id: Number(r.agency_id),
      thread_type: r.thread_type || null,
      channel_name: r.channel_name || null,
      channel_slug: r.channel_slug || null,
      body: r.body || '',
      created_at: r.created_at,
      mentioned_at: r.mentioned_at,
      parent_message_id: r.parent_message_id != null ? Number(r.parent_message_id) : null,
      is_read: Boolean(r.is_read),
      sender: {
        id: Number(r.sender_user_id),
        first_name: r.sender_first_name || '',
        last_name: r.sender_last_name || ''
      }
    }));

    res.json({ items });
  } catch (e) {
    next(e);
  }
};

export const unsendMessage = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    const messageId = parseInt(req.params.messageId, 10);
    if (!threadId || !messageId) {
      return res.status(400).json({ error: { message: 'threadId and messageId are required' } });
    }
    await assertThreadAccess(req.user.id, threadId);

    const hasEncCols = await hasChatMessageEncryptionColumns();
    const encCols = hasEncCols ? ', body_ciphertext, body_iv, body_auth_tag, encryption_key_id' : '';
    const [[msg]] = await pool.execute(
      `SELECT id, thread_id, sender_user_id, body${encCols}, created_at FROM chat_messages WHERE id = ? AND thread_id = ? LIMIT 1`,
      [messageId, threadId]
    );
    if (!msg) return res.status(404).json({ error: { message: 'Message not found' } });
    let msgBody = msg.body;
    if (!msgBody && msg.body_ciphertext && msg.body_iv && msg.body_auth_tag) {
      try {
        msgBody = decryptChatText({
          ciphertextB64: msg.body_ciphertext,
          ivB64: msg.body_iv,
          authTagB64: msg.body_auth_tag,
          keyId: msg.encryption_key_id || null
        });
      } catch {
        msgBody = '';
      }
    }
    if (Number(msg.sender_user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Only allow unsend if the recipient has not read this message.
    let otherLastReadMessageId = null;
    const [parts] = await pool.execute(
      'SELECT user_id FROM chat_thread_participants WHERE thread_id = ? AND user_id <> ?',
      [threadId, req.user.id]
    );
    const recipientIds = (parts || []).map((p) => Number(p.user_id)).filter(Boolean);
    if (recipientIds.length) {
      const placeholders = recipientIds.map(() => '?').join(',');
      const [reads] = await pool.execute(
        `SELECT last_read_message_id
         FROM chat_thread_reads
         WHERE thread_id = ? AND user_id IN (${placeholders})`,
        [threadId, ...recipientIds]
      );
      for (const r of reads || []) {
        const v = r?.last_read_message_id ? Number(r.last_read_message_id) : null;
        if (!v) continue;
        if (!otherLastReadMessageId || v > otherLastReadMessageId) otherLastReadMessageId = v;
      }
    }
    if (otherLastReadMessageId && Number(messageId) <= Number(otherLastReadMessageId)) {
      return res.status(409).json({ error: { message: 'Cannot unsend: message was already read' } });
    }

    await pool.execute('DELETE FROM chat_messages WHERE id = ? AND thread_id = ?', [messageId, threadId]);
    await pool.execute('UPDATE chat_threads SET updated_at = NOW() WHERE id = ?', [threadId]);

    // Best-effort: delete the notification that contains this message snippet (if it was created).
    try {
      const senderUser = await User.findById(req.user.id);
      const senderName = `${senderUser?.first_name || ''} ${senderUser?.last_name || ''}`.trim() || 'Someone';
      const b = String(msgBody || '');
      const snippet = b.length > 120 ? b.slice(0, 117) + '…' : b;
      const notificationMessage = `${senderName}: ${snippet}`;
      for (const rid of recipientIds) {
        // Delete the most specific match (thread + recipient + exact message text).
        await pool.execute(
          `DELETE FROM notifications
           WHERE user_id = ?
             AND type = 'chat_message'
             AND related_entity_type = 'chat_thread'
             AND related_entity_id = ?
             AND message = ?`,
          [rid, threadId, notificationMessage]
        );
      }
    } catch {
      // ignore
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const deleteForMe = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    const messageId = parseInt(req.params.messageId, 10);
    if (!threadId || !messageId) {
      return res.status(400).json({ error: { message: 'threadId and messageId are required' } });
    }
    await assertThreadAccess(req.user.id, threadId);

    const hasEncCols = await hasChatMessageEncryptionColumns();
    const encCols = hasEncCols ? ', body_ciphertext, body_iv, body_auth_tag, encryption_key_id' : '';
    const [[msg]] = await pool.execute(
      `SELECT id, thread_id, sender_user_id, body${encCols} FROM chat_messages WHERE id = ? AND thread_id = ? LIMIT 1`,
      [messageId, threadId]
    );
    if (!msg) return res.status(404).json({ error: { message: 'Message not found' } });
    let msgBody = msg.body;
    if (!msgBody && msg.body_ciphertext && msg.body_iv && msg.body_auth_tag) {
      try {
        msgBody = decryptChatText({
          ciphertextB64: msg.body_ciphertext,
          ivB64: msg.body_iv,
          authTagB64: msg.body_auth_tag,
          keyId: msg.encryption_key_id || null
        });
      } catch {
        msgBody = '';
      }
    }

    await pool.execute(
      `INSERT INTO chat_message_deletes (message_id, user_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE deleted_at = CURRENT_TIMESTAMP`,
      [messageId, req.user.id]
    );

    // Ensure the hidden message doesn't stay counted as "unread" for this user.
    await pool.execute(
      `INSERT INTO chat_thread_reads (thread_id, user_id, last_read_message_id, last_read_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), VALUES(last_read_message_id)),
         last_read_at = NOW()`,
      [threadId, req.user.id, messageId]
    );

    // Best-effort: remove the associated notification for THIS user (if present).
    try {
      const senderUser = await User.findById(msg.sender_user_id);
      const senderName = `${senderUser?.first_name || ''} ${senderUser?.last_name || ''}`.trim() || 'Someone';
      const b = String(msgBody || '');
      const snippet = b.length > 120 ? b.slice(0, 117) + '…' : b;
      const notificationMessage = `${senderName}: ${snippet}`;
      await pool.execute(
        `DELETE FROM notifications
         WHERE user_id = ?
           AND type = 'chat_message'
           AND related_entity_type = 'chat_thread'
           AND related_entity_id = ?
           AND message = ?`,
        [req.user.id, threadId, notificationMessage]
      );
    } catch {
      // ignore
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const bulkDeleteForMe = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });
    await assertThreadAccess(req.user.id, threadId);

    const idsRaw = req.body?.messageIds;
    if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
      return res.status(400).json({ error: { message: 'messageIds must be a non-empty array' } });
    }
    const messageIds = [...new Set(idsRaw.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))].slice(0, 500);
    if (messageIds.length === 0) {
      return res.status(400).json({ error: { message: 'No valid messageIds provided' } });
    }

    // Only delete messages that belong to this thread.
    const placeholders = messageIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id
       FROM chat_messages
       WHERE thread_id = ? AND id IN (${placeholders})`,
      [threadId, ...messageIds]
    );
    const validIds = (rows || []).map((r) => Number(r.id)).filter(Boolean);
    if (validIds.length === 0) return res.json({ ok: true, deletedCount: 0 });

    const placeholders2 = validIds.map(() => '?').join(',');
    // Insert per-user deletes.
    await pool.execute(
      `INSERT INTO chat_message_deletes (message_id, user_id)
       SELECT id, ?
       FROM chat_messages
       WHERE thread_id = ? AND id IN (${placeholders2})
       ON DUPLICATE KEY UPDATE deleted_at = CURRENT_TIMESTAMP`,
      [req.user.id, threadId, ...validIds]
    );

    // Ensure the newest deleted message doesn't remain counted as unread.
    const maxId = Math.max(...validIds);
    await pool.execute(
      `INSERT INTO chat_thread_reads (thread_id, user_id, last_read_message_id, last_read_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), VALUES(last_read_message_id)),
         last_read_at = NOW()`,
      [threadId, req.user.id, maxId]
    );

    res.json({ ok: true, deletedCount: validIds.length });
  } catch (e) {
    next(e);
  }
};

export const markRead = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    const lastReadMessageId = req.body?.lastReadMessageId ? parseInt(req.body.lastReadMessageId, 10) : null;
    if (!threadId || !lastReadMessageId) {
      return res.status(400).json({ error: { message: 'lastReadMessageId is required' } });
    }
    await assertThreadAccess(req.user.id, threadId);

    await pool.execute(
      `INSERT INTO chat_thread_reads (thread_id, user_id, last_read_message_id, last_read_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id), last_read_at = NOW()`,
      [threadId, req.user.id, lastReadMessageId]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getThreadMeta = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });
    await assertThreadAccess(req.user.id, threadId);

    const [[t]] = await pool.execute(
      `SELECT t.id AS thread_id,
              t.agency_id,
              t.organization_id,
              t.company_event_id,
              t.thread_type,
              org.slug AS organization_slug,
              org.name AS organization_name
       FROM chat_threads t
       LEFT JOIN agencies org ON org.id = t.organization_id
       WHERE t.id = ?
       LIMIT 1`,
      [threadId]
    );
    if (!t) return res.status(404).json({ error: { message: 'Thread not found' } });
    const roleNorm2 = String(req.user?.role || '').toLowerCase();
    const evMeta = t.company_event_id ? Number(t.company_event_id) : null;
    const sbThread =
      String(t.thread_type || '').toLowerCase() === 'skill_builders_event' &&
      evMeta &&
      Number.isFinite(evMeta) &&
      evMeta > 0;
    if (roleNorm2 === 'client_guardian' && sbThread) {
      const okG = await guardianCanPostSkillBuilderEventChat(req.user.id, evMeta);
      if (!okG) return res.status(403).json({ error: { message: 'Access denied' } });
    } else {
      await assertAgencyOrOrgAccess(req.user, t.agency_id, t.organization_id || null);
    }

    res.json({
      thread_id: t.thread_id,
      agency_id: t.agency_id,
      organization_id: t.organization_id || null,
      organization_slug: t.organization_slug || null,
      organization_name: t.organization_name || null
    });
  } catch (e) {
    next(e);
  }
};

async function tableExists(name) {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?
       LIMIT 1`,
      [name]
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

/** GET /api/chat/inbox/files */
export const listFilesInbox = async (req, res, next) => {
  try {
    if (!(await tableExists('chat_message_attachments'))) {
      return res.json({ files: [] });
    }
    const limitRaw = parseInt(req.query?.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 50;
    const [rows] = await pool.execute(
      `SELECT a.id, a.message_id, a.file_path, a.mime_type, a.file_kind, a.original_filename,
              a.byte_size, a.created_at,
              m.thread_id, m.body, m.sender_user_id, m.created_at AS message_created_at,
              t.thread_type, t.name AS channel_name,
              u.first_name AS sender_first_name, u.last_name AS sender_last_name
       FROM chat_message_attachments a
       INNER JOIN chat_messages m ON m.id = a.message_id
       INNER JOIN chat_threads t ON t.id = m.thread_id
       INNER JOIN chat_thread_participants p ON p.thread_id = t.id AND p.user_id = ?
       LEFT JOIN users u ON u.id = m.sender_user_id
       LEFT JOIN chat_message_deletes d ON d.message_id = m.id AND d.user_id = ?
       WHERE d.message_id IS NULL
       ORDER BY a.created_at DESC
       LIMIT ${limit}`,
      [req.user.id, req.user.id]
    );
    const files = (rows || []).map((r) => {
      let body = r.body;
      // best-effort: leave encrypted body blank in list preview
      if (!body) body = '';
      return {
        id: r.id,
        message_id: r.message_id,
        thread_id: r.thread_id,
        file_path: r.file_path,
        mime_type: r.mime_type,
        file_kind: r.file_kind,
        original_filename: r.original_filename,
        byte_size: r.byte_size,
        created_at: r.created_at,
        thread_type: r.thread_type,
        channel_name: r.channel_name,
        sender: {
          id: r.sender_user_id,
          first_name: r.sender_first_name,
          last_name: r.sender_last_name
        },
        body_preview: String(body || '').slice(0, 80)
      };
    });
    res.json({ files });
  } catch (e) {
    next(e);
  }
};

/** GET /api/chat/inbox/bookmarks */
export const listBookmarksInbox = async (req, res, next) => {
  try {
    if (!(await tableExists('chat_message_bookmarks'))) {
      return res.json({ bookmarks: [] });
    }
    const [rows] = await pool.execute(
      `SELECT b.message_id, b.created_at AS bookmarked_at,
              m.thread_id, m.body, m.sender_user_id, m.created_at,
              t.thread_type, t.name AS channel_name,
              u.first_name AS sender_first_name, u.last_name AS sender_last_name
       FROM chat_message_bookmarks b
       INNER JOIN chat_messages m ON m.id = b.message_id
       INNER JOIN chat_threads t ON t.id = m.thread_id
       INNER JOIN chat_thread_participants p ON p.thread_id = t.id AND p.user_id = ?
       LEFT JOIN users u ON u.id = m.sender_user_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC
       LIMIT 100`,
      [req.user.id, req.user.id]
    );
    res.json({
      bookmarks: (rows || []).map((r) => ({
        message_id: r.message_id,
        thread_id: r.thread_id,
        bookmarked_at: r.bookmarked_at,
        body: r.body || '',
        created_at: r.created_at,
        thread_type: r.thread_type,
        channel_name: r.channel_name,
        sender: {
          id: r.sender_user_id,
          first_name: r.sender_first_name,
          last_name: r.sender_last_name
        }
      }))
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/chat/messages/:messageId/bookmark */
export const bookmarkMessage = async (req, res, next) => {
  try {
    if (!(await tableExists('chat_message_bookmarks'))) {
      return res.status(409).json({ error: { message: 'Bookmarks not enabled (run migration 1003)' } });
    }
    const messageId = parseInt(req.params.messageId, 10);
    if (!messageId) return res.status(400).json({ error: { message: 'Invalid message id' } });
    const [[msg]] = await pool.execute(
      `SELECT m.id, m.thread_id FROM chat_messages m WHERE m.id = ? LIMIT 1`,
      [messageId]
    );
    if (!msg) return res.status(404).json({ error: { message: 'Message not found' } });
    await assertThreadAccess(req.user.id, msg.thread_id);
    await pool.execute(
      `INSERT INTO chat_message_bookmarks (user_id, message_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE created_at = created_at`,
      [req.user.id, messageId]
    );
    res.json({ ok: true, message_id: messageId });
  } catch (e) {
    next(e);
  }
};

/** DELETE /api/chat/messages/:messageId/bookmark */
export const unbookmarkMessage = async (req, res, next) => {
  try {
    if (!(await tableExists('chat_message_bookmarks'))) {
      return res.status(409).json({ error: { message: 'Bookmarks not enabled' } });
    }
    const messageId = parseInt(req.params.messageId, 10);
    if (!messageId) return res.status(400).json({ error: { message: 'Invalid message id' } });
    await pool.execute(
      `DELETE FROM chat_message_bookmarks WHERE user_id = ? AND message_id = ?`,
      [req.user.id, messageId]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/** GET /api/chat/inbox/pins — pins across threads the user can access */
export const listPinsInbox = async (req, res, next) => {
  try {
    if (!(await tableExists('chat_thread_pins'))) {
      return res.json({ pins: [] });
    }
    const [rows] = await pool.execute(
      `SELECT pin.thread_id, pin.message_id, pin.pinned_by_user_id, pin.created_at AS pinned_at,
              m.body, m.sender_user_id, m.created_at,
              t.thread_type, t.name AS channel_name,
              u.first_name AS sender_first_name, u.last_name AS sender_last_name
       FROM chat_thread_pins pin
       INNER JOIN chat_messages m ON m.id = pin.message_id
       INNER JOIN chat_threads t ON t.id = pin.thread_id
       INNER JOIN chat_thread_participants p ON p.thread_id = t.id AND p.user_id = ?
       LEFT JOIN users u ON u.id = m.sender_user_id
       ORDER BY pin.created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    res.json({
      pins: (rows || []).map((r) => ({
        thread_id: r.thread_id,
        message_id: r.message_id,
        pinned_at: r.pinned_at,
        pinned_by_user_id: r.pinned_by_user_id,
        body: r.body || '',
        created_at: r.created_at,
        thread_type: r.thread_type,
        channel_name: r.channel_name,
        sender: {
          id: r.sender_user_id,
          first_name: r.sender_first_name,
          last_name: r.sender_last_name
        }
      }))
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/chat/messages/:messageId/pin */
export const pinMessage = async (req, res, next) => {
  try {
    if (!(await tableExists('chat_thread_pins'))) {
      return res.status(409).json({ error: { message: 'Pins not enabled (run migration 1003)' } });
    }
    const messageId = parseInt(req.params.messageId, 10);
    if (!messageId) return res.status(400).json({ error: { message: 'Invalid message id' } });
    const [[msg]] = await pool.execute(
      `SELECT m.id, m.thread_id FROM chat_messages m WHERE m.id = ? LIMIT 1`,
      [messageId]
    );
    if (!msg) return res.status(404).json({ error: { message: 'Message not found' } });
    await assertThreadAccess(req.user.id, msg.thread_id);
    await pool.execute(
      `INSERT INTO chat_thread_pins (thread_id, message_id, pinned_by_user_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE pinned_by_user_id = VALUES(pinned_by_user_id)`,
      [msg.thread_id, messageId, req.user.id]
    );
    res.json({ ok: true, message_id: messageId, thread_id: msg.thread_id });
  } catch (e) {
    next(e);
  }
};

/** DELETE /api/chat/messages/:messageId/pin */
export const unpinMessage = async (req, res, next) => {
  try {
    if (!(await tableExists('chat_thread_pins'))) {
      return res.status(409).json({ error: { message: 'Pins not enabled' } });
    }
    const messageId = parseInt(req.params.messageId, 10);
    if (!messageId) return res.status(400).json({ error: { message: 'Invalid message id' } });
    const [[msg]] = await pool.execute(
      `SELECT m.id, m.thread_id FROM chat_messages m WHERE m.id = ? LIMIT 1`,
      [messageId]
    );
    if (!msg) return res.status(404).json({ error: { message: 'Message not found' } });
    await assertThreadAccess(req.user.id, msg.thread_id);
    await pool.execute(
      `DELETE FROM chat_thread_pins WHERE thread_id = ? AND message_id = ?`,
      [msg.thread_id, messageId]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/chat/threads/:threadId/start-meeting
 * body: { kind?: 'TEAM_MEETING' | 'HUDDLE', title?, durationMinutes? }
 */
export const startMeetingFromThread = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });
    await assertThreadAccess(req.user.id, threadId);

    const [[t]] = await pool.execute(
      `SELECT id, agency_id, organization_id, thread_type FROM chat_threads WHERE id = ? LIMIT 1`,
      [threadId]
    );
    if (!t) return res.status(404).json({ error: { message: 'Thread not found' } });
    if (String(t.thread_type || '').toLowerCase() !== 'direct') {
      return res.status(400).json({ error: { message: 'Meetings can only be started from direct messages' } });
    }

    const [parts] = await pool.execute(
      `SELECT user_id FROM chat_thread_participants WHERE thread_id = ?`,
      [threadId]
    );
    const other = (parts || []).map((p) => Number(p.user_id)).find((id) => id && id !== Number(req.user.id));
    if (!other) {
      return res.status(400).json({ error: { message: 'Could not find the other participant' } });
    }

    const meeting = await startAdhocTeamMeeting({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      agencyId: t.agency_id,
      withUserId: other,
      kind: req.body?.kind || 'TEAM_MEETING',
      title: req.body?.title || null,
      durationMinutes: req.body?.durationMinutes,
      description: `Started from Messages thread #${threadId}`
    });

    // Post join link into the thread (best-effort)
    try {
      const linkBody = `${meeting.kind === 'HUDDLE' ? 'Huddle' : 'Video meeting'} started: ${meeting.joinUrl}`;
      let bodyPlain = linkBody;
      let bodyCipher = null;
      let bodyIv = null;
      let bodyTag = null;
      let bodyKeyId = null;
      const hasEncCols = await hasChatMessageEncryptionColumns();
      if (hasEncCols && isChatEncryptionConfigured()) {
        try {
          const enc = encryptChatText(linkBody);
          bodyCipher = enc.ciphertextB64;
          bodyIv = enc.ivB64;
          bodyTag = enc.authTagB64;
          bodyKeyId = enc.keyId;
          bodyPlain = null;
        } catch {
          bodyPlain = linkBody;
        }
      }
      if (hasEncCols && bodyCipher) {
        await pool.execute(
          `INSERT INTO chat_messages (thread_id, sender_user_id, body, body_ciphertext, body_iv, body_auth_tag, encryption_key_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [threadId, req.user.id, bodyPlain, bodyCipher, bodyIv, bodyTag, bodyKeyId]
        );
      } else {
        await pool.execute(
          'INSERT INTO chat_messages (thread_id, sender_user_id, body) VALUES (?, ?, ?)',
          [threadId, req.user.id, linkBody]
        );
      }
    } catch {
      // ignore link post failure
    }

    res.status(201).json(meeting);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
