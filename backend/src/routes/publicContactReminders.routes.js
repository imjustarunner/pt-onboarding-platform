import express from 'express';
import { getPublicContactReminderAction } from '../controllers/clientContactAffiliation.controller.js';

const router = express.Router();

router.get('/:token', getPublicContactReminderAction);

export default router;
