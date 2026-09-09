import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import {
  getMyRoomMe,
  getMyRoomLobby,
  getMyRoomPublic,
  joinMyRoomLobby,
  getMyRoomLobbyGuestStatus,
  admitMyRoomLobbyGuest,
  dismissMyRoomLobbyGuest,
  myRoomPhotoUpload
} from '../controllers/providerMyRoom.controller.js';

const router = express.Router();

// Authenticated host routes first (avoid /:slug capturing "me")
router.get('/me', authenticate, requireActiveStatus, getMyRoomMe);
router.get('/me/lobby', authenticate, requireActiveStatus, getMyRoomLobby);
router.post('/lobby/:lobbyId/admit', authenticate, requireActiveStatus, admitMyRoomLobbyGuest);
router.post('/lobby/:lobbyId/dismiss', authenticate, requireActiveStatus, dismissMyRoomLobbyGuest);

// Public (no auth) — room name only; joining never auto-admits
router.get('/:slug/public', getMyRoomPublic);
router.get('/:slug/lobby/:lobbyId', getMyRoomLobbyGuestStatus);
router.post('/:slug/lobby', myRoomPhotoUpload, joinMyRoomLobby);

export default router;
