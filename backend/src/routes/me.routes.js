import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { downloadCompanyEventIcsForMe, listMyCompanyEvents, listMyCompanyEventsCalendar, respondToMyCompanyEvent } from '../controllers/companyEvents.controller.js';
import { sendReminderSms } from '../controllers/reminderSms.controller.js';
import {
  createCustomTask,
  updateCustomTask,
  deleteCustomTask,
  claimTask,
  revealTaskPhi,
  getTaskAssignees,
  setTaskAssignees,
  getTaskCollaborators,
  setTaskCollaborators,
  getTaskLinks,
  addTaskLink,
  deleteTaskLink,
  syncMyClientLifecycleTasks
} from '../controllers/meTasks.controller.js';
import {
  requireTaskAccess,
  uploadMiddleware,
  uploadAttachment,
  listAttachments,
  deleteAttachment
} from '../controllers/taskAttachments.controller.js';
import {
  requireTaskCommentAccess,
  listComments,
  createComment
} from '../controllers/taskComments.controller.js';
import { listNotesToSign, getNotesToSignCount, signNote, getClinicalNotesEligible } from '../controllers/notesToSign.controller.js';
import TaskDependency from '../models/TaskDependency.model.js';
import pool from '../config/database.js';
import { resolveAssignmentNotificationForWaiting } from '../services/taskNotifications.service.js';
import { getMyBookClubStatus, respondToMyBookClubPrompt } from '../controllers/bookClub.controller.js';
import {
  getMyClubEmployerSharePrompts,
  postMyClubEmployerSharePromptRespond
} from '../controllers/clubEmployerShare.controller.js';

const router = express.Router();

router.get('/clinical-notes-eligible', authenticate, getClinicalNotesEligible);
router.get('/notes-to-sign', authenticate, listNotesToSign);
router.get('/notes-to-sign/count', authenticate, getNotesToSignCount);
router.post('/notes-to-sign/:id/sign', authenticate, signNote);
router.post('/tasks', authenticate, createCustomTask);
router.post('/tasks/sync-client-lifecycle', authenticate, syncMyClientLifecycleTasks);
router.put('/tasks/:id', authenticate, updateCustomTask);
router.post('/tasks/:id/claim', authenticate, claimTask);
router.delete('/tasks/:id', authenticate, deleteCustomTask);
router.post('/tasks/:id/reveal-phi', authenticate, revealTaskPhi);
router.get('/tasks/:id/assignees', authenticate, getTaskAssignees);
router.put('/tasks/:id/assignees', authenticate, setTaskAssignees);
router.get('/tasks/:id/collaborators', authenticate, getTaskCollaborators);
router.put('/tasks/:id/collaborators', authenticate, setTaskCollaborators);
router.get('/tasks/:id/links', authenticate, getTaskLinks);
router.post('/tasks/:id/links', authenticate, addTaskLink);
router.delete('/tasks/:id/links/:linkId', authenticate, deleteTaskLink);
router.get('/tasks/:id/attachments', authenticate, requireTaskAccess, listAttachments);
router.post('/tasks/:id/attachments', authenticate, requireTaskAccess, uploadMiddleware, uploadAttachment);
router.delete('/tasks/:id/attachments/:attachmentId', authenticate, requireTaskAccess, deleteAttachment);
router.get('/tasks/:id/comments', authenticate, requireTaskCommentAccess, listComments);
router.post('/tasks/:id/comments', authenticate, requireTaskCommentAccess, createComment);

// Task dependencies
router.get('/tasks/:id/dependencies', authenticate, async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const [blockers, dependents] = await Promise.all([
      TaskDependency.listBlockers(taskId),
      TaskDependency.listDependents(taskId),
    ]);
    res.json({ blockers, dependents });
  } catch (err) { next(err); }
});

router.post('/tasks/:id/dependencies', authenticate, async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const dependsOnId = parseInt(req.body?.dependsOnId, 10);
    if (!dependsOnId) return res.status(400).json({ error: { message: 'dependsOnId required' } });
    if (dependsOnId === taskId) return res.status(400).json({ error: { message: 'A task cannot depend on itself' } });
    await TaskDependency.add({ taskId, dependsOnId, createdBy: req.user?.id });
    // Mark the waiting task as 'waiting' if the blocker is not yet done
    const [[blocker]] = await pool.execute('SELECT status FROM tasks WHERE id = ?', [dependsOnId]);
    if (blocker && blocker.status !== 'completed' && blocker.status !== 'overridden') {
      await pool.execute(
        `UPDATE tasks SET status = 'waiting' WHERE id = ? AND status NOT IN ('completed','overridden')`,
        [taskId]
      );
      // Resolve any pending assignment notification since this task is now waiting
      resolveAssignmentNotificationForWaiting(taskId, null).catch(() => {});
    }
    const blockers = await TaskDependency.listBlockers(taskId);
    res.status(201).json({ blockers });
  } catch (err) { next(err); }
});

router.delete('/tasks/:id/dependencies/:blockerId', authenticate, async (req, res, next) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const dependsOnId = parseInt(req.params.blockerId, 10);
    await TaskDependency.remove({ taskId, dependsOnId });
    // Re-check if task should remain waiting
    await TaskDependency.unlockDependents(dependsOnId);
    // If no more blockers, set back to pending
    const blockers = await TaskDependency.listBlockers(taskId);
    if (!blockers.length) {
      await pool.execute(
        `UPDATE tasks SET status = 'pending' WHERE id = ? AND status = 'waiting'`,
        [taskId]
      );
    }
    res.json({ blockers });
  } catch (err) { next(err); }
});

router.post('/send-reminder-sms', authenticate, sendReminderSms);
router.get('/company-events', authenticate, listMyCompanyEvents);
router.get('/company-events/calendar', authenticate, listMyCompanyEventsCalendar);
router.get('/company-events/:eventId/ics', authenticate, downloadCompanyEventIcsForMe);
router.post('/company-events/:eventId/respond', authenticate, respondToMyCompanyEvent);
router.get('/book-club/status', authenticate, getMyBookClubStatus);
router.post('/book-club/respond', authenticate, respondToMyBookClubPrompt);
router.get('/club-employer-share-prompts', authenticate, getMyClubEmployerSharePrompts);
router.post('/club-employer-share-prompts/:broadcastId/respond', authenticate, postMyClubEmployerSharePromptRespond);

export default router;
