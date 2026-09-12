import { getQuickConversation, postQuickReply, postQuickCompose, getQuickAttachment, postQuickReaction, postQuickUndo } from '../controllers/quickViewMessaging.controller.js';
import express from 'express';
import multer from 'multer';
import { getQuickMeetingLink } from '../controllers/quickViewMeeting.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getMyQuickViewStatus,
  postRegenerateToken,
  postResetPasscode,
  postRevealToken,
  getTokenInfo,
  getDeliveryTokenInfo,
  postUnlock,
  postDeliveryUnlock,
  getTenantQuickViewInfo,
  postTenantUnlock,
  postHeartbeat,
  postExtendSession,
  postLogout,
  requireQuickViewSession,
  getQuickHome,
  getQuickTasks,
  getQuickDayCalendar,
  getQuickOfficeAvailability,
  getQuickContacts,
  postQuickContact,
  postQuickTask,
  postQuickTaskStatus,
  getQuickViewPwaManifest
} from '../controllers/quickView.controller.js';
import {
  qvListChatThreads,
  qvListChatChannels,
  qvOpenChannel,
  qvListThreadsInbox,
  qvListMentions,
  qvListFiles,
  qvListChatMessages,
  qvSendChatMessage,
  qvMarkChatRead,
  qvUploadChatAttachment, qvAddChatReaction, qvRemoveChatReaction,
  qvCreateDirectThread,
  qvFocusMusicCatalog,
  qvFocusMusicStream,
  getQuickTaskDetail,
  patchQuickTask,
  postQuickTaskComment,
  getQuickTaskLists,
  getQuickTaskProjects,
  getQuickProjectDetail,
  getQuickListTasks,
  getQuickDirectory,
  qvListNoteAidTools,
  qvExecuteNoteAid
} from '../controllers/quickViewSurfaces.controller.js';

const router = express.Router();
const chatUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  const allowed = ['image/gif','image/png','image/jpeg','image/jpg','image/webp','video/mp4','video/webm','video/quicktime'];
  cb(allowed.includes(String(file.mimetype || '').toLowerCase()) ? null : Object.assign(new Error('Choose a supported photo or video'), { status: 400 }), allowed.includes(String(file.mimetype || '').toLowerCase()));
} });

// Authenticated: Account Info → Privacy credential management
router.get('/me/status', authenticate, getMyQuickViewStatus);
router.post('/me/regenerate-token', authenticate, postRegenerateToken);
router.post('/me/reset-passcode', authenticate, postResetPasscode);
router.post('/me/reveal-token', authenticate, postRevealToken);

// Public PWA manifest (absolute start_url for iOS Add to Home Screen)
router.get('/pwa-manifest', getQuickViewPwaManifest);

// Tenant home: PIN-only (no setup-link bind required)
router.get('/tenant', getTenantQuickViewInfo);
router.post('/tenant/unlock', postTenantUnlock);

// Public token landing + unlock
router.get('/t/:token', getTokenInfo);
router.post('/t/:token/unlock', postUnlock);
router.get('/d/:token', getDeliveryTokenInfo);
router.post('/d/:token/unlock', postDeliveryUnlock);

// Session
router.post('/session/heartbeat', postHeartbeat);
router.post('/session/extend', postExtendSession);
router.post('/session/logout', postLogout);

// Scoped Quick View data
router.get('/home', requireQuickViewSession, getQuickHome);
router.get('/tasks', requireQuickViewSession, getQuickTasks);
router.post('/tasks', requireQuickViewSession, postQuickTask);
router.get('/tasks/:id', requireQuickViewSession, getQuickTaskDetail);
router.patch('/tasks/:id', requireQuickViewSession, patchQuickTask);
router.post('/tasks/:id/comments', requireQuickViewSession, postQuickTaskComment);
router.patch('/tasks/:id/status', requireQuickViewSession, postQuickTaskStatus);
router.get('/task-lists', requireQuickViewSession, getQuickTaskLists);
router.get('/task-lists/:id/tasks', requireQuickViewSession, getQuickListTasks);
router.get('/task-projects', requireQuickViewSession, getQuickTaskProjects);
router.get('/task-projects/:id', requireQuickViewSession, getQuickProjectDetail);
router.get('/calendar/day', requireQuickViewSession, getQuickDayCalendar);
router.get('/meetings/:type/:ref/link', requireQuickViewSession, getQuickMeetingLink);
router.get('/office', requireQuickViewSession, getQuickOfficeAvailability);
router.get('/conversations/:id', requireQuickViewSession, getQuickConversation);
router.post('/conversations/:id/reply', requireQuickViewSession, postQuickReply);
router.get('/conversations/:id/attachments/:attachmentId', requireQuickViewSession, getQuickAttachment);
router.post('/conversations/:id/messages/:messageId/reaction', requireQuickViewSession, postQuickReaction);
router.post('/conversations/:id/messages/:messageId/undo', requireQuickViewSession, postQuickUndo);
router.post('/compose', requireQuickViewSession, postQuickCompose);
router.get('/contacts', requireQuickViewSession, getQuickContacts);
router.post('/contacts', requireQuickViewSession, postQuickContact);
router.get('/directory', requireQuickViewSession, getQuickDirectory);

// Team chat surfaces (DMs, channels, threads, mentions, files)
router.get('/chat/threads', requireQuickViewSession, qvListChatThreads);
router.get('/chat/channels', requireQuickViewSession, qvListChatChannels);
router.post('/chat/channels/:threadId/open', requireQuickViewSession, qvOpenChannel);
router.post('/chat/direct', requireQuickViewSession, qvCreateDirectThread);
router.get('/chat/inbox/threads', requireQuickViewSession, qvListThreadsInbox);
router.get('/chat/inbox/mentions', requireQuickViewSession, qvListMentions);
router.get('/chat/inbox/files', requireQuickViewSession, qvListFiles);
router.get('/chat/threads/:threadId/messages', requireQuickViewSession, qvListChatMessages);
router.post('/chat/threads/:threadId/messages', requireQuickViewSession, qvSendChatMessage);
router.post('/chat/threads/:threadId/attachments', requireQuickViewSession, chatUpload.single('file'), qvUploadChatAttachment);
router.post('/chat/messages/:messageId/reactions', requireQuickViewSession, qvAddChatReaction);
router.delete('/chat/messages/:messageId/reactions/:code', requireQuickViewSession, qvRemoveChatReaction);
router.post('/chat/threads/:threadId/read', requireQuickViewSession, qvMarkChatRead);

// Focus music (session cookie works for <audio src>)
router.get('/focus-music/catalog', requireQuickViewSession, qvFocusMusicCatalog);
router.get('/focus-music/stream/:slug', requireQuickViewSession, qvFocusMusicStream);

// Note Aid (initials / free text only — no client attach)
router.get('/note-aid/tools', requireQuickViewSession, qvListNoteAidTools);
router.post('/note-aid/execute', requireQuickViewSession, qvExecuteNoteAid);

export default router;
