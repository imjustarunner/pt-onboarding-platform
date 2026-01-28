import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getCommunicationsFeed } from '../controllers/communications.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/feed', getCommunicationsFeed);

export default router;

