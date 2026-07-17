/**
 * Team Channels (Slack-style) — Phase 3 foundation.
 * Reuses chat_threads / chat_messages / participants. Team employees only.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { isTeamEmployeeRole, isSchoolStaffRole } from '../utils/presenceAudience.js';

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

    res.status(201).json({
      threadId,
      channel: mapChannelRow(
        {
          id: threadId,
          agency_id: agencyId,
          organization_id: null,
          name,
          slug,
          description,
          visibility
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
