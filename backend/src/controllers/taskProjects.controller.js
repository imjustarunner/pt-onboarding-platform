import TaskProject from '../models/TaskProject.model.js';
import TaskList from '../models/TaskList.model.js';
import User from '../models/User.model.js';

function canManageRole(role) {
  return ['admin', 'super_admin', 'support', 'supervisor'].includes(String(role || '').toLowerCase())
    || !!role; // capabilities checked separately
}

function isManager(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return ['admin', 'super_admin', 'support', 'supervisor'].includes(role)
    || !!req.user?.capabilities?.canManageHiring;
}

async function ensureInAgency(userId, agencyId) {
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
}

export const listProjects = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const teamBrowse = String(req.query.teamBrowse || '') === '1' && isManager(req);
    const projects = await TaskProject.listForUser(userId, { agencyId, teamBrowse });
    res.json(projects);
  } catch (err) {
    next(err);
  }
};

export const createProject = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { agencyId, name, description, dueDate } = req.body || {};
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const aid = parseInt(agencyId, 10);
    if (!aid) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const nameStr = String(name || '').trim();
    if (!nameStr) return res.status(400).json({ error: { message: 'name is required' } });
    if (!(await ensureInAgency(userId, aid)) && !isManager(req)) {
      return res.status(403).json({ error: { message: 'You must be in this agency' } });
    }
    const project = await TaskProject.create({
      agencyId: aid,
      name: nameStr,
      description: description || null,
      createdByUserId: userId,
      dueDate: dueDate || null
    });
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
};

export const getProject = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const access = await TaskProject.canView(id, userId, {
      canViewAll: isManager(req),
      agencyId
    });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });
    const overview = await TaskProject.getOverview(id, userId);
    res.json({ ...access.project, my_role: access.role, overview });
  } catch (err) {
    next(err);
  }
};

export const updateProject = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });
    if (!['admin', 'editor'].includes(access.role) && !isManager(req)) {
      return res.status(403).json({ error: { message: 'Editor access required' } });
    }
    const { name, description, dueDate, status, isStarred } = req.body || {};
    const updated = await TaskProject.update(id, { name, description, dueDate, status, isStarred });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

export const attachList = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const taskListId = parseInt(req.body?.taskListId, 10);
    if (!taskListId) return res.status(400).json({ error: { message: 'taskListId required' } });
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok || (!['admin', 'editor'].includes(access.role) && !isManager(req))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const list = await TaskList.findById(taskListId);
    if (!list) return res.status(404).json({ error: { message: 'List not found' } });
    await TaskProject.attachList(id, taskListId);
    res.json({ ok: true, lists: await TaskProject.listAttachedLists(id) });
  } catch (err) {
    next(err);
  }
};

export const detachList = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const taskListId = parseInt(req.params.listId, 10);
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok || (!['admin', 'editor'].includes(access.role) && !isManager(req))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    await TaskProject.detachList(id, taskListId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const listProjectTasks = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const access = await TaskProject.canView(id, userId, {
      canViewAll: isManager(req),
      agencyId: req.query.agencyId ? parseInt(req.query.agencyId, 10) : null
    });
    if (!access.ok) return res.status(403).json({ error: { message: 'Forbidden' } });
    const tasks = await TaskProject.listTasks(id, userId);
    res.json(tasks);
  } catch (err) {
    next(err);
  }
};

export const addProjectMember = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.body?.userId, 10);
    const role = req.body?.role || 'viewer';
    const access = await TaskProject.canView(id, userId, { canViewAll: isManager(req) });
    if (!access.ok || (access.role !== 'admin' && !isManager(req))) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    if (!targetUserId) return res.status(400).json({ error: { message: 'userId required' } });
    await TaskProject.addMember(id, targetUserId, role);
    res.json({ members: await TaskProject.listMembers(id) });
  } catch (err) {
    next(err);
  }
};

// silence unused
void canManageRole;
