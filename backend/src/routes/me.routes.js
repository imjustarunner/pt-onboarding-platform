import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { downloadCompanyEventIcsForMe, listMyCompanyEvents, respondToMyCompanyEvent } from '../controllers/companyEvents.controller.js';
import { sendReminderSms } from '../controllers/reminderSms.controller.js';
import { createCustomTask, updateCustomTask, deleteCustomTask, claimTask } from '../controllers/meTasks.controller.js';
import {
  requireTaskAccess,
  uploadMiddleware,
  uploadAttachment,
  listAttachments,
  deleteAttachment
} from '../controllers/taskAttachments.controller.js';
import { listNotesToSign, getNotesToSignCount, signNote, getClinicalNotesEligible } from '../controllers/notesToSign.controller.js';

const router = express.Router();

router.get('/clinical-notes-eligible', authenticate, getClinicalNotesEligible);
router.get('/notes-to-sign', authenticate, listNotesToSign);
router.get('/notes-to-sign/count', authenticate, getNotesToSignCount);
router.post('/notes-to-sign/:id/sign', authenticate, signNote);
router.post('/tasks', authenticate, createCustomTask);
router.put('/tasks/:id', authenticate, updateCustomTask);
router.post('/tasks/:id/claim', authenticate, claimTask);
router.delete('/tasks/:id', authenticate, deleteCustomTask);
router.get('/tasks/:id/attachments', authenticate, requireTaskAccess, listAttachments);
router.post('/tasks/:id/attachments', authenticate, requireTaskAccess, uploadMiddleware, uploadAttachment);
router.delete('/tasks/:id/attachments/:attachmentId', authenticate, requireTaskAccess, deleteAttachment);
router.post('/send-reminder-sms', authenticate, sendReminderSms);
router.get('/company-events', authenticate, listMyCompanyEvents);
router.get('/company-events/:eventId/ics', authenticate, downloadCompanyEventIcsForMe);
router.post('/company-events/:eventId/respond', authenticate, respondToMyCompanyEvent);

export default router;
