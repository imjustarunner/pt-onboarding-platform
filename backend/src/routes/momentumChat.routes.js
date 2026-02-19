import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { chat, getDigest, ensureOwnUser } from '../controllers/momentumChat.controller.js';

const router = express.Router();

router.post('/users/:userId/momentum-chat', authenticate, ensureOwnUser, chat);
router.get('/users/:userId/momentum-digest', authenticate, ensureOwnUser, getDigest);

export default router;
