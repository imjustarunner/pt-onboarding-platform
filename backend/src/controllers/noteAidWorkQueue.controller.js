import { validationResult } from 'express-validator';
import NoteAidWorkQueueItem from '../models/NoteAidWorkQueueItem.model.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function listNoteAidWorkQueue(req, res) {
  try {
    const userId = safeInt(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const items = await NoteAidWorkQueueItem.listForUser(userId);
    return res.json({ items });
  } catch (error) {
    console.error('listNoteAidWorkQueue:', error);
    return res.status(500).json({ error: { message: error.message || 'Failed to load work queue' } });
  }
}

/** Full reconcile — source of truth for Clear / paste / lifecycle persist. */
export async function syncNoteAidWorkQueue(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Invalid work queue payload', details: errors.array() } });
    }
    const userId = safeInt(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length > 500) {
      return res.status(400).json({ error: { message: 'Work queue too large (max 500 items)' } });
    }
    const saved = await NoteAidWorkQueueItem.syncForUser(userId, items);
    return res.json({ items: saved });
  } catch (error) {
    console.error('syncNoteAidWorkQueue:', error);
    return res.status(500).json({ error: { message: error.message || 'Failed to sync work queue' } });
  }
}

/** Append / upsert without deleting other rows (Tasks hub handoff, Todo import). */
export async function appendNoteAidWorkQueue(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Invalid work queue payload', details: errors.array() } });
    }
    const userId = safeInt(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.json({ items: [] });
    if (items.length > 200) {
      return res.status(400).json({ error: { message: 'Too many items (max 200)' } });
    }
    const saved = await NoteAidWorkQueueItem.appendForUser(userId, items);
    return res.json({ items: saved });
  } catch (error) {
    console.error('appendNoteAidWorkQueue:', error);
    return res.status(500).json({ error: { message: error.message || 'Failed to append work queue' } });
  }
}

export async function patchNoteAidWorkQueueItem(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Invalid patch', details: errors.array() } });
    }
    const userId = safeInt(req.user?.id);
    const id = safeInt(req.params?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const item = await NoteAidWorkQueueItem.patchForUser({ id, userId, patch: req.body || {} });
    if (!item) return res.status(404).json({ error: { message: 'Work queue item not found' } });
    return res.json({ item });
  } catch (error) {
    console.error('patchNoteAidWorkQueueItem:', error);
    return res.status(500).json({ error: { message: error.message || 'Failed to update work queue item' } });
  }
}

export async function deleteNoteAidWorkQueueItem(req, res) {
  try {
    const userId = safeInt(req.user?.id);
    const id = safeInt(req.params?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const deleted = await NoteAidWorkQueueItem.deleteForUser({ id, userId });
    return res.json({ deleted });
  } catch (error) {
    console.error('deleteNoteAidWorkQueueItem:', error);
    return res.status(500).json({ error: { message: error.message || 'Failed to delete work queue item' } });
  }
}

export async function clearNoteAidWorkQueue(req, res) {
  try {
    const userId = safeInt(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const deleted = await NoteAidWorkQueueItem.clearForUser(userId);
    return res.json({ deleted });
  } catch (error) {
    console.error('clearNoteAidWorkQueue:', error);
    return res.status(500).json({ error: { message: error.message || 'Failed to clear work queue' } });
  }
}
