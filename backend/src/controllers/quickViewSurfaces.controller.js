/**
 * Quick View surface proxies — reuse chat / tasks / focus-music handlers
 * with the Quick View session user attached as req.user.
 */
import {
  listMyThreads,
  listMessages,
  sendMessage,
  markRead,
  listThreadsInbox,
  listMentionsInbox,
  listFilesInbox,
  createOrGetDirectThread
} from './chat.controller.js';
import { listChannels, openChannel } from './chatChannels.controller.js';
import Task from '../models/Task.model.js';
import TaskList from '../models/TaskList.model.js';
import TaskProject from '../models/TaskProject.model.js';
import TaskAttachment from '../models/TaskAttachment.model.js';
import TaskCollaborator from '../models/TaskCollaborator.model.js';
import TaskListMember from '../models/TaskListMember.model.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';
import { getCatalog, streamTrack } from './focusMusic.controller.js';
import { listNoteAidTools, executeNoteAidTool } from './noteAid.controller.js';

async function attachUser(req) {
  let role = 'provider';
  try {
    const user = await User.findById(req.quickView.userId);
    if (user?.role) role = user.role;
  } catch { /* fall back */ }
  req.user = {
    id: req.quickView.userId,
    role,
    agencyId: req.quickView.agencyId || null,
    agency_id: req.quickView.agencyId || null,
    email: null
  };
  // Channels require agencyId — default to session tenant
  if (!req.query.agencyId && req.quickView.agencyId) {
    req.query.agencyId = String(req.quickView.agencyId);
  }
  // Cross-tenant chat threads: pass agencyId=all to skip force
  if (String(req.query.agencyId || '').toLowerCase() === 'all') {
    delete req.query.agencyId;
  }
  // Focus music entitlement uses x-agency-id
  if (req.quickView.agencyId && !req.headers['x-agency-id']) {
    req.headers['x-agency-id'] = String(req.quickView.agencyId);
  }
}

function wrap(handler) {
  return async (req, res, next) => {
    try {
      await attachUser(req);
      return await handler(req, res, next);
    } catch (e) {
      next(e);
    }
  };
}

export const qvListChatThreads = wrap(listMyThreads);
export const qvListChatChannels = wrap(listChannels);
export const qvOpenChannel = wrap(openChannel);
export const qvListThreadsInbox = wrap(listThreadsInbox);
export const qvListMentions = wrap(listMentionsInbox);
export const qvListFiles = wrap(listFilesInbox);
export const qvListChatMessages = wrap(listMessages);
export const qvSendChatMessage = wrap(sendMessage);
export const qvMarkChatRead = wrap(markRead);

export const qvCreateDirectThread = wrap(async (req, res, next) => {
  if (!req.body) req.body = {};
  if (!req.body.agencyId && req.quickView.agencyId) {
    req.body.agencyId = req.quickView.agencyId;
  }
  return createOrGetDirectThread(req, res, next);
});

import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { classifyPayAndHcbsCategories } from '../utils/credentialNormalization.js';

function mapDirectoryPerson(r, section) {
  const first = r.first_name || r.firstName || '';
  const last = r.last_name || r.lastName || '';
  const preferred = r.preferred_name || r.preferredName || '';
  const displayName = preferred || `${first} ${last}`.trim() || r.email || 'Teammate';
  const axes = classifyPayAndHcbsCategories({
    credential: r.credential,
    title: r.title,
    role: r.role,
    isHourlyWorker: r.is_hourly_worker
  });
  return {
    id: Number(r.id),
    displayName,
    firstName: first,
    lastName: last,
    role: r.role || null,
    email: r.work_email || r.email || null,
    workEmail: r.work_email || null,
    workPhone: r.work_phone || r.phone_number || null,
    profilePhotoUrl: publicUploadsUrlFromStoredPath(r.profile_photo_path) || null,
    hcbsCategory: axes.hcbsCategory,
    hcbsCategoryLabel: axes.hcbsCategoryLabel,
    section
  };
}

export const getQuickDirectory = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const agencyId = req.quickView.agencyId;
    if (!agencyId) {
      return res.json({ ok: true, providers: [], schoolStaff: [], agencyId: null });
    }

    const [providerRows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.preferred_name, u.email, u.work_email,
              u.work_phone, u.phone_number, u.profile_photo_path, u.role, u.credential, u.title,
              u.is_hourly_worker
       FROM user_agencies ua
       JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND u.id != ?
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND LOWER(COALESCE(u.role, '')) NOT IN (
               'client_guardian', 'guardian', 'school_staff',
               'super_admin', 'parent', 'client', 'kiosk'
             )
         AND (
           UPPER(COALESCE(u.status, '')) IN ('ACTIVE_EMPLOYEE', 'ONBOARDING')
           OR u.status IS NULL
         )
       ORDER BY u.first_name ASC, u.last_name ASC
       LIMIT 300`,
      [agencyId, userId]
    ).catch(() => [[]]);

    let schoolRows = [];
    try {
      const [rows] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.preferred_name, u.email, u.work_email,
                u.work_phone, u.phone_number, u.profile_photo_path, u.role, u.credential, u.title,
                u.is_hourly_worker
         FROM users u
         INNER JOIN user_agencies ua ON ua.user_id = u.id
         INNER JOIN agencies school ON school.id = ua.agency_id
           AND LOWER(COALESCE(school.organization_type, '')) = 'school'
         INNER JOIN organization_affiliations oa ON oa.organization_id = school.id
           AND oa.agency_id = ?
           AND oa.is_active = 1
         WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
           AND LOWER(COALESCE(u.role, '')) = 'school_staff'
           AND u.id != ?
         ORDER BY u.first_name ASC, u.last_name ASC
         LIMIT 300`,
        [agencyId, userId]
      );
      schoolRows = rows || [];
    } catch {
      try {
        const [rows] = await pool.execute(
          `SELECT DISTINCT u.id, u.first_name, u.last_name, u.preferred_name, u.email, u.work_email,
                  u.work_phone, u.phone_number, u.profile_photo_path, u.role, u.credential, u.title,
                  u.is_hourly_worker
           FROM users u
           INNER JOIN user_agencies ua ON ua.user_id = u.id
           INNER JOIN agency_schools ash ON ash.school_id = ua.agency_id AND ash.agency_id = ?
           WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
             AND LOWER(COALESCE(u.role, '')) = 'school_staff'
             AND u.id != ?
           ORDER BY u.first_name ASC, u.last_name ASC
           LIMIT 300`,
          [agencyId, userId]
        );
        schoolRows = rows || [];
      } catch {
        schoolRows = [];
      }
    }

    res.json({
      ok: true,
      agencyId,
      providers: (providerRows || []).map((r) => mapDirectoryPerson(r, 'providers')),
      schoolStaff: (schoolRows || []).map((r) => mapDirectoryPerson(r, 'school_staff'))
    });
  } catch (e) {
    next(e);
  }
};

export const qvFocusMusicCatalog = wrap(async (req, res, next) => {
  // Rewrite stream URLs to Quick View proxy
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.tracks) {
      body.tracks = body.tracks.map((t) => ({
        ...t,
        streamUrl: t.streamUrl
          ? String(t.streamUrl).replace('/api/focus-music/', '/api/quick-view/focus-music/')
          : `/api/quick-view/focus-music/stream/${t.id}`
      }));
    }
    return origJson(body);
  };
  return getCatalog(req, res, next);
});

export const qvFocusMusicStream = wrap(streamTrack);

async function assertQuickTaskAccess(userId, task) {
  if (!task) return false;
  const uid = Number(userId);
  if (Number(task.assigned_to_user_id) === uid) return true;
  if (Number(task.assigned_by_user_id) === uid) return true;
  if (Number(task.created_by_user_id) === uid) return true;
  if (task.task_list_id) {
    const lists = await TaskList.listByUserMembership(uid, {});
    if ((lists || []).some((l) => Number(l.id) === Number(task.task_list_id))) return true;
  }
  if (task.project_id) {
    const membership = await TaskProject.findMembership(task.project_id, uid);
    if (membership) return true;
    const project = await TaskProject.findById(task.project_id);
    if (project && Number(project.created_by_user_id) === uid) return true;
  }
  try {
    const [collab] = await pool.execute(
      `SELECT 1 FROM task_collaborators WHERE task_id = ? AND user_id = ? LIMIT 1`,
      [task.id, uid]
    );
    if (collab?.length) return true;
  } catch { /* table may not exist */ }
  return false;
}

export const getQuickTaskDetail = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const id = Number(req.params.id);
    const task = await Task.findById(id, { revealPhi: false });
    if (!task) return res.status(404).json({ error: { message: 'Not found' } });
    if (!(await assertQuickTaskAccess(userId, task))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    let comments = [];
    try {
      const [rows] = await pool.execute(
        `SELECT c.id, c.body, c.created_at, c.user_id,
                u.first_name, u.last_name
         FROM task_comments c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.task_id = ?
         ORDER BY c.created_at ASC
         LIMIT 100`,
        [id]
      );
      comments = rows || [];
    } catch { /* ignore */ }

    let links = [];
    try {
      const [rows] = await pool.execute(
        `SELECT id, url, label FROM task_links WHERE task_id = ? ORDER BY id ASC LIMIT 50`,
        [id]
      );
      links = rows || [];
    } catch { /* ignore */ }

    let attachments = [];
    try {
      attachments = await TaskAttachment.listByTaskId(id);
    } catch { /* ignore */ }

    let collaborators = [];
    try {
      collaborators = await TaskCollaborator.listForTask(id);
    } catch { /* ignore */ }

    let assignee = null;
    if (task.assigned_to_user_id) {
      try {
        const u = await User.findById(task.assigned_to_user_id);
        if (u) {
          assignee = {
            id: u.id,
            name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email
          };
        }
      } catch { /* ignore */ }
    }

    const availableLists = await TaskList.listByUserMembership(userId, {}).catch(() => []);

    const hasPhi = !!task.has_encrypted_description;
    res.json({
      ok: true,
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        urgency: task.urgency,
        due_at: task.due_date || task.due_at || null,
        task_type: task.task_type,
        description: hasPhi ? null : (task.description || null),
        description_locked: hasPhi,
        task_list_id: task.task_list_id,
        task_list_name: task.task_list_name || null,
        project_id: task.project_id,
        project_name: task.project_name || null,
        category: task.category || null,
        is_private: !!task.is_private,
        assigned_to_user_id: task.assigned_to_user_id,
        assignee_first_name: task.assignee_first_name || assignee?.name?.split?.(' ')?.[0] || null,
        assignee_last_name: task.assignee_last_name || null,
        assignee
      },
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        created_at: c.created_at,
        author: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'User'
      })),
      links,
      attachments: (attachments || []).map((a) => ({
        id: a.id,
        filename: a.filename,
        content_type: a.content_type,
        url: a.url,
        created_at: a.created_at
      })),
      collaborators: (collaborators || []).map((c) => ({
        user_id: c.user_id || c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'User',
        role: c.role || null
      })),
      availableLists: (availableLists || []).map((l) => ({ id: l.id, name: l.name, role: l.role }))
    });
  } catch (e) {
    next(e);
  }
};

export const patchQuickTask = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const id = Number(req.params.id);
    const task = await Task.findById(id, { revealPhi: false });
    if (!task) return res.status(404).json({ error: { message: 'Not found' } });
    if (!(await assertQuickTaskAccess(userId, task))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const updates = [];
    const params = [];
    if (req.body?.assignedToUserId !== undefined || req.body?.assigned_to_user_id !== undefined) {
      const aid = req.body.assignedToUserId ?? req.body.assigned_to_user_id;
      updates.push('assigned_to_user_id = ?');
      params.push(aid ? Number(aid) : null);
    }
    if (req.body?.taskListId !== undefined || req.body?.task_list_id !== undefined) {
      const lid = req.body.taskListId ?? req.body.task_list_id;
      if (lid) {
        const lists = await TaskList.listByUserMembership(userId, {});
        if (!(lists || []).some((l) => Number(l.id) === Number(lid))) {
          return res.status(403).json({ error: { message: 'Not a member of that list' } });
        }
      }
      updates.push('task_list_id = ?');
      params.push(lid ? Number(lid) : null);
    }
    if (req.body?.urgency && ['low', 'medium', 'high'].includes(String(req.body.urgency))) {
      updates.push('urgency = ?');
      params.push(String(req.body.urgency));
    }
    if (req.body?.title) {
      updates.push('title = ?');
      params.push(String(req.body.title).slice(0, 255));
    }
    if (!updates.length) {
      return res.status(400).json({ error: { message: 'No updates provided' } });
    }
    params.push(id);
    await pool.execute(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const postQuickTaskComment = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const id = Number(req.params.id);
    const body = String(req.body?.body || req.body?.text || '').trim();
    if (!body) return res.status(400).json({ error: { message: 'Comment required' } });
    const task = await Task.findById(id, { revealPhi: false });
    if (!task) return res.status(404).json({ error: { message: 'Not found' } });
    if (!(await assertQuickTaskAccess(userId, task))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    await pool.execute(
      `INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, ?)`,
      [id, userId, body]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getQuickTaskLists = async (req, res, next) => {
  try {
    const rows = await TaskList.listByUserMembership(req.quickView.userId, {});
    res.json({ ok: true, lists: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const getQuickTaskProjects = async (req, res, next) => {
  try {
    const rows = await TaskProject.listForUser(req.quickView.userId, {});
    res.json({ ok: true, projects: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const getQuickProjectDetail = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const projectId = Number(req.params.id);
    const project = await TaskProject.findById(projectId);
    if (!project) return res.status(404).json({ error: { message: 'Not found' } });
    const membership = await TaskProject.findMembership(projectId, userId);
    const isCreator = Number(project.created_by_user_id) === Number(userId);
    if (!membership && !isCreator) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const overview = await TaskProject.getOverview(projectId, userId).catch(() => null);
    let tasks = [];
    try {
      tasks = await TaskProject.listTasks(projectId, userId);
    } catch {
      const [rows] = await pool.execute(
        `SELECT id, title, status, urgency, due_date, task_type, task_list_id
         FROM tasks
         WHERE project_id = ?
           AND (status IS NULL OR LOWER(status) NOT IN ('cancelled'))
         ORDER BY due_date IS NULL, due_date ASC
         LIMIT 100`,
        [projectId]
      ).catch(() => [[]]);
      tasks = rows || [];
    }
    res.json({
      ok: true,
      project: {
        ...project,
        my_role: membership?.role || (isCreator ? 'admin' : null)
      },
      overview: overview || {},
      members: (overview?.members || []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Member',
        title: m.title || null
      })),
      lists: (overview?.lists || []).map((l) => ({
        id: l.id || l.task_list_id,
        name: l.name,
        task_list_id: l.task_list_id || l.id
      })),
      stats: {
        open: overview?.open_task_count ?? 0,
        completed: overview?.completed_task_count ?? 0,
        total: overview?.total_task_count ?? 0,
        progress: overview?.progress_pct ?? 0,
        documents: overview?.document_count ?? 0,
        actionItems: overview?.open_action_item_count ?? 0
      },
      tasks: (tasks || []).slice(0, 100).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        urgency: t.urgency,
        due_at: t.due_date || t.due_at,
        task_type: t.task_type,
        task_list_id: t.task_list_id,
        task_list_name: t.task_list_name || null,
        assignee: t.assignee_first_name
          ? `${t.assignee_first_name} ${t.assignee_last_name || ''}`.trim()
          : null
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const getQuickListTasks = async (req, res, next) => {
  try {
    const userId = req.quickView.userId;
    const listId = Number(req.params.id);
    const list = await TaskList.findById(listId);
    if (!list) return res.status(404).json({ error: { message: 'Not found' } });
    const lists = await TaskList.listByUserMembership(userId, {});
    if (!(lists || []).some((l) => Number(l.id) === listId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const members = await TaskListMember.listByTaskList(listId).catch(() => []);
    const [rows] = await pool.execute(
      `SELECT id, title, status, urgency, due_date, task_type, assigned_to_user_id
       FROM tasks
       WHERE task_list_id = ?
         AND (status IS NULL OR LOWER(status) NOT IN ('cancelled'))
       ORDER BY
         CASE COALESCE(urgency, 'medium') WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         (due_date IS NULL), due_date ASC
       LIMIT 100`,
      [listId]
    );
    res.json({
      ok: true,
      list: { id: list.id, name: list.name, description: list.description || null },
      members: (members || []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Member'
      })),
      tasks: (rows || []).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        urgency: t.urgency,
        due_at: t.due_date,
        task_type: t.task_type,
        assigned_to_user_id: t.assigned_to_user_id
      }))
    });
  } catch (e) {
    next(e);
  }
};

/** Note Aid — tools + execute; client attach reserved for main app. */
export const qvListNoteAidTools = wrap(async (req, res, next) => {
  if (!req.query.agencyId && req.quickView.agencyId) {
    req.query.agencyId = String(req.quickView.agencyId);
  }
  return listNoteAidTools(req, res, next);
});

export const qvExecuteNoteAid = wrap(async (req, res, next) => {
  if (!req.body) req.body = {};
  if (!req.body.agencyId && req.quickView.agencyId) {
    req.body.agencyId = req.quickView.agencyId;
  }
  // Strip any client attachment attempts from Quick View
  delete req.body.clientId;
  delete req.body.client_id;
  delete req.body.attachClient;
  return executeNoteAidTool(req, res, next);
});
