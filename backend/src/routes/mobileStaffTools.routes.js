import express from 'express';
import { mobileSupportMessages } from '../services/mobile/supportMessages.service.js';
import { mobileLiveChat } from '../services/mobile/liveChat.service.js';

const router = express.Router();
const support = operation => (req, res, next) => { req.mobileSupportOperation = operation; return mobileSupportMessages(req, res, next); };
const chat = operation => (req, res, next) => { req.mobileLiveChatOperation = operation; return mobileLiveChat(req, res, next); };

// Mounted behind the existing primary-device Quick View middleware by the parent router.
router.get('/support/feed', support('feed'));
router.get('/support/:kind/:id', support('detail'));
for (const action of ['reply', 'claim', 'unclaim', 'close']) router.post(`/support/:kind/:id/${action}`, support(action));
router.get('/live-chat', chat('queue'));
router.post('/live-chat/availability', chat('availability'));
router.get('/live-chat/:chatId', chat('detail'));
for (const [path, action] of Object.entries({ presence: 'presence', messages: 'send', claim: 'claim', close: 'close', dismiss: 'dismiss', referral: 'referral' })) {
  router.post(`/live-chat/:chatId/${path}`, chat(action));
}
export default router;
