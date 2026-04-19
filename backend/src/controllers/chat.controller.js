import pool from '../config/database.js';
import User from '../models/User.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import Notification from '../models/Notification.model.js';
import { decryptChatText, encryptChatText, isChatEncryptionConfigured } from '../services/chatEncryption.service.js';

const ONLINE_ACTIVITY_MS = 5 * 60 * 1000;
const ONLINE_HEARTBEAT_MS = 2 * 60 * 1000;

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

async function isUserAwayForAgency(userId, agencyId) {
  const [rows] = await pool.execute(
    'SELECT last_heartbeat_at, last_activity_at, availability_level FROM user_presence WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (!rows.length) return true;
  const availability = String(rows[0].availability_level || '').toLowerCase();
  if (availability === 'offline') return true;
  const hb = rows[0].last_heartbeat_at ? new Date(rows[0].last_heartbeat_at).getTime() : null;
  const act = rows[0].last_activity_at ? new Date(rows[0].last_activity_at).getTime() : null;
  const now = Date.now();

  // Treat as away if no fresh heartbeat or idle (>=5 min).
  if (!hb || now - hb > ONLINE_HEARTBEAT_MS) return true;
  if (act && now - act >= ONLINE_ACTIVITY_MS) return true;
  return false;
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
    const [rows] = await pool.execute(
      `SELECT t.id AS thread_id,
              t.agency_id,
              t.organization_id,
              t.thread_type${teamCol},
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
      }
      return {
        thread_id: r.thread_id,
        agency_id: r.agency_id,
        organization_id: r.organization_id || null,
        thread_type: tType,
        team_id: hasTeamCol ? (r.team_id || null) : null,
        thread_label: label,
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

    // Ensure the other user is in the agency or on the agency's management team.
    // For org-scoped threads, also allow users assigned only to the child organization (school/program row in `agencies`).
    const [inAgency] = await pool.execute(
      'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [otherUserId, agencyId]
    );
    const [onManagementTeam] = await pool.execute(
      'SELECT 1 FROM agency_management_team WHERE user_id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1',
      [otherUserId, agencyId]
    );
    let inChildOrg = { length: 0 };
    if (organizationId) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [otherUserId, organizationId]
      );
      inChildOrg = rows;
    }
    if (inAgency.length === 0 && onManagementTeam.length === 0 && inChildOrg.length === 0) {
      return res.status(400).json({ error: { message: 'User is not in the selected agency' } });
    }

    const threadId = await findOrCreateDirectThread(agencyId, organizationId, me, otherUserId);
    // If the user previously deleted/hid this thread, reopen it.
    try {
      await pool.execute('DELETE FROM chat_thread_deletes WHERE thread_id = ? AND user_id = ?', [threadId, me]);
    } catch {
      // ignore (table may not exist yet in some envs)
    }
    res.status(201).json({ threadId });
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
    const encCols = hasEncryptionCols
      ? ', m.body_ciphertext, m.body_iv, m.body_auth_tag, m.encryption_key_id'
      : '';
    const annCol = hasAnnouncementCol ? ', m.announcement_id' : '';
    const [rows] = await pool.execute(
      `SELECT m.id, m.thread_id, m.sender_user_id, m.body${encCols}${annCol}, m.created_at,
              u.first_name AS sender_first_name, u.last_name AS sender_last_name,
              u.profile_photo_path AS sender_profile_photo_path
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_user_id
       LEFT JOIN chat_message_deletes d ON d.message_id = m.id AND d.user_id = ?
       WHERE m.thread_id = ?
         AND d.message_id IS NULL
       ORDER BY m.id DESC
       LIMIT ${limit}`,
      [req.user.id, threadId]
    );
    const ordered = (rows || []).reverse();
    const me = Number(req.user.id);
    const messageIds = ordered.map((m) => Number(m.id)).filter(Boolean);
    const [attachmentsByMessage, reactionsByMessage] = await Promise.all([
      loadAttachmentsForMessages(messageIds),
      loadReactionsForMessages(messageIds, me)
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
      return {
        ...m,
        body: body || '',
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

    let bodyPlain = body;
    let bodyCipher = null;
    let bodyIv = null;
    let bodyTag = null;
    let bodyKeyId = null;
    const hasEncCols = await hasChatMessageEncryptionColumns();
    if (hasEncCols && isChatEncryptionConfigured()) {
      try {
        const enc = encryptChatText(body);
        bodyCipher = enc.ciphertextB64;
        bodyIv = enc.ivB64;
        bodyTag = enc.authTagB64;
        bodyKeyId = enc.keyId;
        bodyPlain = null;
      } catch (e) {
        console.warn('[chat] Encryption failed, storing plaintext:', e?.message || e);
      }
    }
    const [ins] = await pool.execute(
      hasEncCols && bodyCipher
        ? `INSERT INTO chat_messages (thread_id, sender_user_id, body, body_ciphertext, body_iv, body_auth_tag, encryption_key_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        : 'INSERT INTO chat_messages (thread_id, sender_user_id, body) VALUES (?, ?, ?)',
      hasEncCols && bodyCipher
        ? [threadId, req.user.id, bodyPlain, bodyCipher, bodyIv, bodyTag, bodyKeyId]
        : [threadId, req.user.id, body || '']
    );
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

    // Notifications: notify other participant if they are away/offline
    const [parts] = await pool.execute('SELECT user_id FROM chat_thread_participants WHERE thread_id = ?', [threadId]);
    const recipients = (parts || []).map((p) => p.user_id).filter((id) => id !== req.user.id);

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
    const [row] = await pool.execute(
      `SELECT m.id, m.thread_id, m.sender_user_id, m.body${annCol}, m.created_at,
              u.first_name AS sender_first_name, u.last_name AS sender_last_name,
              u.profile_photo_path AS sender_profile_photo_path
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_user_id
       WHERE m.id = ?`,
      [insertedMessageId]
    );
    const out = row[0] || {};
    if (!out.body && body) out.body = body;
    out.attachments = (await loadAttachmentsForMessages([insertedMessageId])).get(insertedMessageId) || [];
    out.reactions = (await loadReactionsForMessages([insertedMessageId], req.user.id)).get(insertedMessageId) || [];
    res.status(201).json(out);
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
