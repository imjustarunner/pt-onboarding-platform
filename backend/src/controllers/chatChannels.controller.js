/**
 * Team Channels (Slack-style) — Phase 3 foundation.
 * Reuses chat_threads / chat_messages / participants. Team employees only.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import {
  isTeamEmployeeRole,
  isSchoolStaffRole,
  normalizeRole
} from '../utils/presenceAudience.js';

const CHANNEL_CREATE_ROLES = new Set([
  'admin',
  'super_admin',
  'support',
  'staff',
  'clinical_practice_assistant'
]);

async function hasChannelColumns() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'chat_threads'
         AND column_name = 'slug'
       LIMIT 1`
    );
    return rows?.length > 0;
  } catch {
    return false;
  }
}

function slugify(raw, fallback = 'channel') {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || fallback;
}

async function assertAgencyAccess(reqUser, agencyId) {
  if (reqUser.role === 'super_admin') return true;
  const [direct] = await pool.execute(
    'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
    [reqUser.id, agencyId]
  );
  if (direct?.length) return true;
  const agencies = await User.getAgencies(reqUser.id);
  const ok = (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
  if (!ok) {
    const err = new Error('Access denied to this agency');
    err.status = 403;
    throw err;
  }
  return true;
}

function assertCanUseChannels(reqUser) {
  if (isSchoolStaffRole(reqUser?.role)) {
    const err = new Error('Channels are available to team employees only');
    err.status = 403;
    throw err;
  }
  if (!isTeamEmployeeRole(reqUser?.role) && reqUser?.role !== 'super_admin') {
    const err = new Error('Channels are available to team employees only');
    err.status = 403;
    throw err;
  }
}

async function ensureParticipant(threadId, userId) {
  await pool.execute(
    `INSERT IGNORE INTO chat_thread_participants (thread_id, user_id) VALUES (?, ?)`,
    [threadId, userId]
  );
  try {
    await pool.execute('DELETE FROM chat_thread_deletes WHERE thread_id = ? AND user_id = ?', [
      threadId,
      userId
    ]);
  } catch {
    /* table may not exist */
  }
}

async function removeParticipant(threadId, userId) {
  await pool.execute('DELETE FROM chat_thread_participants WHERE thread_id = ? AND user_id = ?', [
    threadId,
    userId
  ]);
}

async function loadChannelOrThrow(threadId) {
  const [[t]] = await pool.execute(
    `SELECT id, agency_id, organization_id, thread_type, name, slug, description,
            visibility, archived_at, created_by_user_id, updated_at, created_at
       FROM chat_threads WHERE id = ? LIMIT 1`,
    [threadId]
  );
  if (!t || String(t.thread_type) !== 'channel') {
    const err = new Error('Channel not found');
    err.status = 404;
    throw err;
  }
  if (t.archived_at) {
    const err = new Error('This channel is archived');
    err.status = 400;
    throw err;
  }
  return t;
}

async function isChannelMember(threadId, userId) {
  const [rows] = await pool.execute(
    'SELECT 1 FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? LIMIT 1',
    [threadId, userId]
  );
  return rows?.length > 0;
}

async function assertChannelMember(threadId, userId) {
  if (!(await isChannelMember(threadId, userId))) {
    const err = new Error('You are not a member of this channel');
    err.status = 403;
    throw err;
  }
}

function canManageChannelMembers(reqUser, channel) {
  const role = normalizeRole(reqUser?.role);
  if (CHANNEL_CREATE_ROLES.has(role)) return true;
  const creatorId = channel?.created_by_user_id != null ? Number(channel.created_by_user_id) : null;
  return creatorId != null && creatorId === Number(reqUser?.id);
}

function assertCanManageChannelMembers(reqUser, channel) {
  if (!canManageChannelMembers(reqUser, channel)) {
    const err = new Error('You cannot manage members of this channel');
    err.status = 403;
    throw err;
  }
}

async function memberCount(threadId) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS c FROM chat_thread_participants WHERE thread_id = ?',
    [threadId]
  );
  return Number(rows?.[0]?.c || 0);
}

/** Parse and normalize invitee ids from request body. */
function parseUserIds(raw) {
  const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const ids = [
    ...new Set(
      list
        .map((v) => parseInt(v, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  ];
  return ids;
}

/**
 * Validate invitees are team employees with access to the agency.
 * Returns { okIds, skipped: [{ userId, reason }] }.
 */
async function filterInvitableTeamUsers(agencyId, userIds, excludeUserId = null) {
  const okIds = [];
  const skipped = [];
  if (!userIds.length) return { okIds, skipped };

  const placeholders = userIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT u.id, u.role,
            EXISTS (
              SELECT 1 FROM user_agencies ua
               WHERE ua.user_id = u.id AND ua.agency_id = ?
            ) AS in_agency
       FROM users u
      WHERE u.id IN (${placeholders})`,
    [agencyId, ...userIds]
  );
  const byId = new Map((rows || []).map((r) => [Number(r.id), r]));

  for (const uid of userIds) {
    if (excludeUserId != null && Number(uid) === Number(excludeUserId)) {
      skipped.push({ userId: uid, reason: 'self' });
      continue;
    }
    const row = byId.get(Number(uid));
    if (!row) {
      skipped.push({ userId: uid, reason: 'not_found' });
      continue;
    }
    const role = normalizeRole(row.role);
    if (role !== 'super_admin' && !isTeamEmployeeRole(role)) {
      skipped.push({ userId: uid, reason: 'not_team_employee' });
      continue;
    }
    if (role !== 'super_admin' && !row.in_agency) {
      skipped.push({ userId: uid, reason: 'not_in_agency' });
      continue;
    }
    okIds.push(Number(uid));
  }
  return { okIds, skipped };
}

async function findChannelBySlug(agencyId, slug, organizationId = null) {
  const orgClause =
    organizationId == null ? 'AND t.organization_id IS NULL' : 'AND t.organization_id = ?';
  const params =
    organizationId == null ? [agencyId, slug] : [agencyId, slug, organizationId];
  const [rows] = await pool.execute(
    `SELECT t.id, t.agency_id, t.organization_id, t.name, t.slug, t.description,
            t.visibility, t.archived_at, t.created_at, t.updated_at
       FROM chat_threads t
      WHERE t.agency_id = ?
        AND t.thread_type = 'channel'
        AND t.slug = ?
        AND t.archived_at IS NULL
        ${orgClause}
      LIMIT 1`,
    params
  );
  return rows?.[0] || null;
}

async function createChannelRow({
  agencyId,
  organizationId = null,
  name,
  slug,
  description = null,
  visibility = 'public',
  createdByUserId = null
}) {
  const [result] = await pool.execute(
    `INSERT INTO chat_threads
      (agency_id, organization_id, thread_type, name, slug, description, visibility, created_by_user_id)
     VALUES (?, ?, 'channel', ?, ?, ?, ?, ?)`,
    [
      agencyId,
      organizationId,
      name,
      slug,
      description,
      visibility === 'private' ? 'private' : 'public',
      createdByUserId
    ]
  );
  return Number(result.insertId);
}

/** Org-wide #general — every team employee joins on open/list. */
export async function ensureGeneralChannel(agencyId, viewerUserId = null) {
  let row = await findChannelBySlug(agencyId, 'general', null);
  if (!row) {
    const id = await createChannelRow({
      agencyId,
      organizationId: null,
      name: 'general',
      slug: 'general',
      description: 'Organization-wide team channel',
      visibility: 'public',
      createdByUserId: null
    });
    row = await findChannelBySlug(agencyId, 'general', null);
    if (!row) row = { id, agency_id: agencyId, slug: 'general', name: 'general', visibility: 'public' };
  }
  if (viewerUserId) await ensureParticipant(row.id, viewerUserId);
  return row;
}

async function listAffiliatedSchools(agencyId) {
  try {
    const [rows] = await pool.execute(
      `SELECT child.id, child.name
         FROM organization_affiliations oa
         JOIN agencies child ON child.id = oa.organization_id
        WHERE oa.agency_id = ?
          AND oa.is_active = TRUE
          AND LOWER(COALESCE(child.organization_type, '')) = 'school'
          AND (child.is_archived = FALSE OR child.is_archived IS NULL)
        ORDER BY child.name ASC
        LIMIT 80`,
      [agencyId]
    );
    return rows || [];
  } catch {
    return [];
  }
}

/** One public channel per affiliated school (slug school-{id}). */
export async function ensureSchoolChannels(agencyId, viewerUserId = null) {
  const schools = await listAffiliatedSchools(agencyId);
  const out = [];
  for (const school of schools) {
    const orgId = Number(school.id);
    const slug = `school-${orgId}`;
    let row = await findChannelBySlug(agencyId, slug, orgId);
    if (!row) {
      const name = String(school.name || `School ${orgId}`).trim().slice(0, 120);
      const id = await createChannelRow({
        agencyId,
        organizationId: orgId,
        name,
        slug,
        description: `Team channel for ${name}`,
        visibility: 'public',
        createdByUserId: null
      });
      row = {
        id,
        agency_id: agencyId,
        organization_id: orgId,
        name,
        slug,
        description: `Team channel for ${name}`,
        visibility: 'public'
      };
    }
    if (viewerUserId) await ensureParticipant(row.id, viewerUserId);
    out.push(row);
  }
  return out;
}

async function unreadCountForThread(threadId, userId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c
       FROM chat_messages m
       LEFT JOIN chat_thread_reads r ON r.thread_id = m.thread_id AND r.user_id = ?
       LEFT JOIN chat_message_deletes d ON d.message_id = m.id AND d.user_id = ?
      WHERE m.thread_id = ?
        AND d.message_id IS NULL
        AND m.sender_user_id <> ?
        AND (r.last_read_message_id IS NULL OR m.id > r.last_read_message_id)`,
    [userId, userId, threadId, userId]
  );
  return Number(rows?.[0]?.c || 0);
}

async function lastMessagePreview(threadId, userId) {
  const [rows] = await pool.execute(
    `SELECT m.id, m.body, m.created_at, m.sender_user_id
       FROM chat_messages m
       LEFT JOIN chat_message_deletes d ON d.message_id = m.id AND d.user_id = ?
      WHERE m.thread_id = ? AND d.message_id IS NULL
      ORDER BY m.id DESC
      LIMIT 1`,
    [userId, threadId]
  );
  const m = rows?.[0];
  if (!m) return null;
  return {
    id: Number(m.id),
    body: m.body,
    created_at: m.created_at,
    sender_user_id: Number(m.sender_user_id)
  };
}

function mapChannelRow(row, { isMember, unreadCount, lastMessage } = {}) {
  return {
    thread_id: Number(row.id || row.thread_id),
    agency_id: Number(row.agency_id),
    organization_id: row.organization_id != null ? Number(row.organization_id) : null,
    thread_type: 'channel',
    name: row.name || row.slug || 'channel',
    slug: row.slug,
    description: row.description || null,
    visibility: row.visibility || 'public',
    kind: row.slug === 'general' ? 'general' : String(row.slug || '').startsWith('school-') ? 'school' : 'custom',
    is_member: Boolean(isMember),
    unread_count: Number(unreadCount || 0),
    last_message: lastMessage || null,
    updated_at: row.updated_at || null
  };
}

/**
 * GET /api/chat/channels?agencyId=
 * Ensures #general + school auto-channels, returns list for team employees.
 */
export const listChannels = async (req, res, next) => {
  try {
    assertCanUseChannels(req.user);
    const agencyId = parseInt(req.query.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await assertAgencyAccess(req.user, agencyId);

    if (!(await hasChannelColumns())) {
      return res.status(503).json({
        error: { message: 'Channels are not available yet — run migration 963' }
      });
    }

    const me = req.user.id;
    await ensureGeneralChannel(agencyId, me);
    await ensureSchoolChannels(agencyId, me);

    const [rows] = await pool.execute(
      `SELECT t.id, t.agency_id, t.organization_id, t.name, t.slug, t.description,
              t.visibility, t.updated_at, t.created_at,
              (SELECT 1 FROM chat_thread_participants tp
                WHERE tp.thread_id = t.id AND tp.user_id = ? LIMIT 1) AS is_member
         FROM chat_threads t
        WHERE t.agency_id = ?
          AND t.thread_type = 'channel'
          AND t.archived_at IS NULL
          AND (
            t.visibility = 'public'
            OR EXISTS (
              SELECT 1 FROM chat_thread_participants tp2
               WHERE tp2.thread_id = t.id AND tp2.user_id = ?
            )
          )
        ORDER BY
          CASE WHEN t.slug = 'general' THEN 0
               WHEN t.slug LIKE 'school-%' THEN 1
               ELSE 2 END,
          t.name ASC`,
      [me, agencyId, me]
    );

    const channels = [];
    for (const row of rows || []) {
      const isMember = Boolean(row.is_member);
      const unread = isMember ? await unreadCountForThread(row.id, me) : 0;
      const last = isMember ? await lastMessagePreview(row.id, me) : null;
      channels.push(mapChannelRow(row, { isMember, unreadCount: unread, lastMessage: last }));
    }

    res.json({ channels });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/chat/channels
 * Create a custom public/private channel (privileged team roles).
 */
export const createChannel = async (req, res, next) => {
  try {
    assertCanUseChannels(req.user);
    if (!CHANNEL_CREATE_ROLES.has(String(req.user.role || '').toLowerCase())) {
      return res.status(403).json({ error: { message: 'You cannot create channels' } });
    }
    if (!(await hasChannelColumns())) {
      return res.status(503).json({
        error: { message: 'Channels are not available yet — run migration 963' }
      });
    }

    const agencyId = parseInt(req.body?.agencyId, 10);
    const name = String(req.body?.name || '').trim().slice(0, 120);
    const description = req.body?.description
      ? String(req.body.description).trim().slice(0, 500)
      : null;
    const visibility = String(req.body?.visibility || 'public').toLowerCase() === 'private'
      ? 'private'
      : 'public';
    if (!agencyId || !name) {
      return res.status(400).json({ error: { message: 'agencyId and name are required' } });
    }
    await assertAgencyAccess(req.user, agencyId);

    let slug = slugify(req.body?.slug || name);
    if (slug === 'general' || slug.startsWith('school-')) {
      return res.status(400).json({ error: { message: 'That channel slug is reserved' } });
    }

    // Ensure unique slug within agency
    let attempt = slug;
    for (let i = 0; i < 8; i++) {
      const existing = await findChannelBySlug(agencyId, attempt, null);
      if (!existing) {
        slug = attempt;
        break;
      }
      attempt = `${slug}-${i + 2}`.slice(0, 80);
      if (i === 7) {
        return res.status(409).json({ error: { message: 'Channel slug already exists' } });
      }
    }

    const threadId = await createChannelRow({
      agencyId,
      organizationId: null,
      name,
      slug,
      description,
      visibility,
      createdByUserId: req.user.id
    });
    await ensureParticipant(threadId, req.user.id);

    // Optional seed members (private channels especially). Creator always included above.
    const seedIds = parseUserIds(req.body?.memberUserIds ?? req.body?.userIds);
    let invited = [];
    let skipped = [];
    if (seedIds.length) {
      const filtered = await filterInvitableTeamUsers(agencyId, seedIds, req.user.id);
      skipped = filtered.skipped;
      for (const uid of filtered.okIds) {
        await ensureParticipant(threadId, uid);
        invited.push(uid);
      }
    }

    res.status(201).json({
      threadId,
      invited,
      skipped,
      channel: mapChannelRow(
        {
          id: threadId,
          agency_id: agencyId,
          organization_id: null,
          name,
          slug,
          description,
          visibility,
          created_by_user_id: req.user.id
        },
        { isMember: true, unreadCount: 0, lastMessage: null }
      )
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/chat/channels/:threadId/join
 * Join a public channel (or already-member private).
 */
export const joinChannel = async (req, res, next) => {
  try {
    assertCanUseChannels(req.user);
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });

    const [[t]] = await pool.execute(
      `SELECT id, agency_id, organization_id, thread_type, name, slug, description,
              visibility, archived_at
         FROM chat_threads WHERE id = ? LIMIT 1`,
      [threadId]
    );
    if (!t || String(t.thread_type) !== 'channel') {
      return res.status(404).json({ error: { message: 'Channel not found' } });
    }
    if (t.archived_at) {
      return res.status(400).json({ error: { message: 'This channel is archived' } });
    }
    await assertAgencyAccess(req.user, t.agency_id);

    const [memberRows] = await pool.execute(
      'SELECT 1 FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? LIMIT 1',
      [threadId, req.user.id]
    );
    const already = memberRows?.length > 0;
    if (!already && String(t.visibility) === 'private') {
      return res.status(403).json({ error: { message: 'This channel is private — ask an admin to add you' } });
    }
    await ensureParticipant(threadId, req.user.id);

    res.json({
      ok: true,
      threadId,
      channel: mapChannelRow(t, { isMember: true })
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/chat/channels/:threadId/open
 * Join if needed and return thread id for the message UI.
 */
export const openChannel = async (req, res, next) => {
  try {
    assertCanUseChannels(req.user);
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });

    const [[t]] = await pool.execute(
      `SELECT id, agency_id, organization_id, thread_type, name, slug, description,
              visibility, archived_at
         FROM chat_threads WHERE id = ? LIMIT 1`,
      [threadId]
    );
    if (!t || String(t.thread_type) !== 'channel') {
      return res.status(404).json({ error: { message: 'Channel not found' } });
    }
    if (t.archived_at) {
      return res.status(400).json({ error: { message: 'This channel is archived' } });
    }
    await assertAgencyAccess(req.user, t.agency_id);

    const [memberRows] = await pool.execute(
      'SELECT 1 FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? LIMIT 1',
      [threadId, req.user.id]
    );
    if (!memberRows?.length) {
      if (String(t.visibility) === 'private') {
        return res.status(403).json({ error: { message: 'This channel is private' } });
      }
      await ensureParticipant(threadId, req.user.id);
    } else {
      await ensureParticipant(threadId, req.user.id); // clears hide-for-me
    }

    res.json({
      threadId,
      agencyId: Number(t.agency_id),
      channel: mapChannelRow(t, { isMember: true })
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/chat/channels/:threadId/members
 * List channel participants. Caller must be a member, or a create-role manager for the agency.
 */
export const listChannelMembers = async (req, res, next) => {
  try {
    assertCanUseChannels(req.user);
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });

    const channel = await loadChannelOrThrow(threadId);
    await assertAgencyAccess(req.user, channel.agency_id);

    const isMember = await isChannelMember(threadId, req.user.id);
    const isManager = canManageChannelMembers(req.user, channel);
    if (!isMember && !isManager) {
      return res.status(403).json({ error: { message: 'You are not a member of this channel' } });
    }

    let rows = [];
    try {
      // Chat presence only: heartbeat + session_extend Idle. Never Team Board status/reason labels.
      const [withPresence] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.username,
                tp.created_at AS joined_at,
                up.last_heartbeat_at,
                up.availability_level,
                ups.session_extend_until
           FROM chat_thread_participants tp
           JOIN users u ON u.id = tp.user_id
           LEFT JOIN user_presence up ON up.user_id = u.id
           LEFT JOIN user_presence_status ups ON ups.user_id = u.id
          WHERE tp.thread_id = ?
          ORDER BY u.first_name ASC, u.last_name ASC, u.id ASC`,
        [threadId]
      );
      rows = withPresence || [];
    } catch {
      const [basic] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.username,
                tp.created_at AS joined_at
           FROM chat_thread_participants tp
           JOIN users u ON u.id = tp.user_id
          WHERE tp.thread_id = ?
          ORDER BY u.first_name ASC, u.last_name ASC, u.id ASC`,
        [threadId]
      );
      rows = basic || [];
    }

    const creatorId =
      channel.created_by_user_id != null ? Number(channel.created_by_user_id) : null;
    const OFFLINE_AFTER_MS = 6 * 60 * 1000;
    const now = Date.now();
    const peerLabel = (status) =>
      status === 'online' ? 'Active' : status === 'idle' ? 'Idle' : 'Inactive';
    const chatStatusForRow = (r) => {
      const extendUntil = r.session_extend_until ? new Date(r.session_extend_until).getTime() : null;
      if (Number.isFinite(extendUntil) && extendUntil > now) return 'idle';
      const avail = String(r.availability_level || 'everyone').toLowerCase();
      if (avail === 'offline') return 'offline';
      const hb = r.last_heartbeat_at ? new Date(r.last_heartbeat_at).getTime() : null;
      if (hb && now - hb <= OFFLINE_AFTER_MS) return 'online';
      return 'offline';
    };

    const members = (rows || []).map((r) => {
      const status = chatStatusForRow(r);
      return {
        user_id: Number(r.id),
        first_name: r.first_name || '',
        last_name: r.last_name || '',
        email: r.email || null,
        username: r.username || null,
        role: r.role || null,
        joined_at: r.joined_at || null,
        is_creator: creatorId != null && Number(r.id) === creatorId,
        presence: {
          status,
          display_label: peerLabel(status),
          reason: null,
          session_extend_until: status === 'idle' ? r.session_extend_until || null : null
        }
      };
    });

    res.json({
      threadId,
      channel: mapChannelRow(channel, { isMember }),
      canManage: isManager,
      members
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/chat/channels/:threadId/members
 * Invite team employees. Body: { userIds: number[] }. Managers only.
 */
export const inviteChannelMembers = async (req, res, next) => {
  try {
    assertCanUseChannels(req.user);
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });

    const channel = await loadChannelOrThrow(threadId);
    await assertAgencyAccess(req.user, channel.agency_id);
    await assertChannelMember(threadId, req.user.id);
    assertCanManageChannelMembers(req.user, channel);

    const userIds = parseUserIds(req.body?.userIds ?? req.body?.memberUserIds);
    if (!userIds.length) {
      return res.status(400).json({ error: { message: 'userIds is required' } });
    }

    const { okIds, skipped } = await filterInvitableTeamUsers(
      channel.agency_id,
      userIds,
      req.user.id
    );

    const invited = [];
    const already = [];
    for (const uid of okIds) {
      if (await isChannelMember(threadId, uid)) {
        already.push(uid);
        continue;
      }
      await ensureParticipant(threadId, uid);
      invited.push(uid);
    }

    res.json({
      ok: true,
      threadId,
      invited,
      already,
      skipped
    });
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/chat/channels/:threadId/members/:userId
 * Remove a member. Managers only. Cannot remove the last remaining member.
 */
export const removeChannelMember = async (req, res, next) => {
  try {
    assertCanUseChannels(req.user);
    const threadId = parseInt(req.params.threadId, 10);
    const targetUserId = parseInt(req.params.userId, 10);
    if (!threadId || !targetUserId) {
      return res.status(400).json({ error: { message: 'threadId and userId are required' } });
    }

    const channel = await loadChannelOrThrow(threadId);
    await assertAgencyAccess(req.user, channel.agency_id);
    await assertChannelMember(threadId, req.user.id);
    assertCanManageChannelMembers(req.user, channel);

    if (!(await isChannelMember(threadId, targetUserId))) {
      return res.status(404).json({ error: { message: 'User is not a member of this channel' } });
    }

    const count = await memberCount(threadId);
    if (count <= 1) {
      return res.status(400).json({
        error: { message: 'Cannot remove the last remaining member of this channel' }
      });
    }

    await removeParticipant(threadId, targetUserId);

    res.json({ ok: true, threadId, removedUserId: targetUserId });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/chat/channels/:threadId/leave
 * Leave the channel. Cannot leave if you are the sole remaining member.
 */
export const leaveChannel = async (req, res, next) => {
  try {
    assertCanUseChannels(req.user);
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });

    const channel = await loadChannelOrThrow(threadId);
    await assertAgencyAccess(req.user, channel.agency_id);
    await assertChannelMember(threadId, req.user.id);

    const count = await memberCount(threadId);
    if (count <= 1) {
      return res.status(400).json({
        error: {
          message: 'Cannot leave as the sole remaining member — invite someone else first'
        }
      });
    }

    await removeParticipant(threadId, req.user.id);

    res.json({ ok: true, threadId });
  } catch (e) {
    next(e);
  }
};
