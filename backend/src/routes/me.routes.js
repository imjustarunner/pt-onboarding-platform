import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { downloadCompanyEventIcsForMe, listMyCompanyEvents, respondToMyCompanyEvent } from '../controllers/companyEvents.controller.js';
import { sendReminderSms } from '../controllers/reminderSms.controller.js';
import { createCustomTask, updateCustomTask, deleteCustomTask } from '../controllers/meTasks.controller.js';
import { listNotesToSign, getNotesToSignCount, signNote } from '../controllers/notesToSign.controller.js';

const router = express.Router();

router.get('/notes-to-sign', authenticate, listNotesToSign);
router.get('/notes-to-sign/count', authenticate, getNotesToSignCount);
router.post('/notes-to-sign/:id/sign', authenticate, signNote);
router.post('/tasks', authenticate, createCustomTask);
router.put('/tasks/:id', authenticate, updateCustomTask);
router.delete('/tasks/:id', authenticate, deleteCustomTask);
router.post('/send-reminder-sms', authenticate, sendReminderSms);
router.get('/company-events', authenticate, listMyCompanyEvents);
router.get('/company-events/:eventId/ics', authenticate, downloadCompanyEventIcsForMe);
router.post('/company-events/:eventId/respond', authenticate, respondToMyCompanyEvent);

export default router;
