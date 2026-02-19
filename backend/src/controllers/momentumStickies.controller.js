import MomentumSticky from '../models/MomentumSticky.model.js';
import Task from '../models/Task.model.js';
import TaskAuditLog from '../models/TaskAuditLog.model.js';

function ensureOwnUser(req, res, next) {
  const userId = parseInt(req.params.userId, 10);
  if (userId !== req.user?.id) {
    return res.status(403).json({ error: { message: 'You can only access your own Momentum Stickies' } });
  }
  next();
}

export const listStickies = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const stickies = await MomentumSticky.listByUserId(userId);
    res.json(stickies);
  } catch (err) {
    next(err);
  }
};

export const getSticky = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const stickyId = parseInt(req.params.stickyId, 10);
    const sticky = await MomentumSticky.findById(stickyId, userId);
    if (!sticky) {
      return res.status(404).json({ error: { message: 'Momentum Sticky not found' } });
    }
    res.json(sticky);
  } catch (err) {
    next(err);
  }
};

export const createSticky = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { title, is_pinned, position_x, position_y, is_collapsed, sort_order, color } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: { message: 'title is required' } });
    }
    const sticky = await MomentumSticky.create({
      userId,
      title: title.trim(),
      isPinned: !!is_pinned,
      positionX: typeof position_x === 'number' ? position_x : 0,
      positionY: typeof position_y === 'number' ? position_y : 0,
      isCollapsed: !!is_collapsed,
      sortOrder: typeof sort_order === 'number' ? sort_order : 0,
      color: color || 'yellow'
    });
    res.status(201).json(sticky);
  } catch (err) {
    next(err);
  }
};

export const updateSticky = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const stickyId = parseInt(req.params.stickyId, 10);
    const { title, is_pinned, position_x, position_y, is_collapsed, sort_order, color } = req.body;
    const sticky = await MomentumSticky.update(stickyId, userId, {
      title: title !== undefined ? String(title).trim() : undefined,
      isPinned: is_pinned !== undefined ? !!is_pinned : undefined,
      positionX: position_x !== undefined ? position_x : undefined,
      positionY: position_y !== undefined ? position_y : undefined,
      isCollapsed: is_collapsed !== undefined ? !!is_collapsed : undefined,
      sortOrder: sort_order !== undefined ? sort_order : undefined,
      color: color !== undefined ? color : undefined
    });
    if (!sticky) {
      return res.status(404).json({ error: { message: 'Momentum Sticky not found' } });
    }
    res.json(sticky);
  } catch (err) {
    next(err);
  }
};

export const updateStickyPosition = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const stickyId = parseInt(req.params.stickyId, 10);
    const { position_x, position_y, is_collapsed } = req.body;
    const sticky = await MomentumSticky.updatePosition(stickyId, userId, {
      positionX: position_x,
      positionY: position_y,
      isCollapsed: is_collapsed
    });
    if (!sticky) {
      return res.status(404).json({ error: { message: 'Momentum Sticky not found' } });
    }
    res.json(sticky);
  } catch (err) {
    next(err);
  }
};

export const deleteSticky = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const stickyId = parseInt(req.params.stickyId, 10);
    const deleted = await MomentumSticky.delete(stickyId, userId);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Momentum Sticky not found' } });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const addEntry = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const stickyId = parseInt(req.params.stickyId, 10);
    const { text, is_checked, is_expanded, sort_order } = req.body;
    const entry = await MomentumSticky.addEntry(stickyId, userId, {
      text: text != null ? String(text) : '',
      isChecked: !!is_checked,
      isExpanded: is_expanded !== false,
      sortOrder: typeof sort_order === 'number' ? sort_order : 0
    });
    if (!entry) {
      return res.status(404).json({ error: { message: 'Momentum Sticky not found' } });
    }
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
};

export const updateEntry = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const stickyId = parseInt(req.params.stickyId, 10);
    const entryId = parseInt(req.params.entryId, 10);
    const { text, is_checked, is_expanded, sort_order } = req.body;
    const entry = await MomentumSticky.updateEntry(entryId, stickyId, userId, {
      text: text !== undefined ? String(text) : undefined,
      isChecked: is_checked !== undefined ? !!is_checked : undefined,
      isExpanded: is_expanded !== undefined ? !!is_expanded : undefined,
      sortOrder: sort_order !== undefined ? sort_order : undefined
    });
    if (!entry) {
      return res.status(404).json({ error: { message: 'Entry or Momentum Sticky not found' } });
    }
    res.json(entry);
  } catch (err) {
    next(err);
  }
};

export const deleteEntry = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const stickyId = parseInt(req.params.stickyId, 10);
    const entryId = parseInt(req.params.entryId, 10);
    const deleted = await MomentumSticky.deleteEntry(entryId, stickyId, userId);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Entry or Momentum Sticky not found' } });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const promoteEntryToTask = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const stickyId = parseInt(req.params.stickyId, 10);
    const entryId = parseInt(req.params.entryId, 10);

    const sticky = await MomentumSticky.findById(stickyId, userId);
    if (!sticky) {
      return res.status(404).json({ error: { message: 'Momentum Sticky not found' } });
    }
    const entry = sticky.entries?.find((e) => e.id === entryId);
    if (!entry) {
      return res.status(404).json({ error: { message: 'Entry not found' } });
    }

    const title = String(entry.text || '').trim() || 'Task from sticky';
    const task = await Task.create({
      taskType: 'custom',
      title,
      description: `Promoted from Momentum Sticky: ${sticky.title || 'Untitled'}`,
      assignedToUserId: userId,
      assignedByUserId: userId,
      dueDate: null,
      referenceId: null
    });

    await TaskAuditLog.logAction({
      taskId: task.id,
      actionType: 'assigned',
      actorUserId: userId,
      targetUserId: userId,
      metadata: { source: 'momentum_promote_sticky', stickyId, entryId }
    });

    const markChecked = req.body?.markChecked !== false;
    if (markChecked) {
      await MomentumSticky.updateEntry(entryId, stickyId, userId, { isChecked: true });
    }

    res.status(201).json({
      task,
      entryUpdated: markChecked
    });
  } catch (err) {
    next(err);
  }
};

export { ensureOwnUser };
