import express from 'express';import rateLimit from 'express-rate-limit';
import * as c from '../controllers/providerMyRoom.controller.js';
const router=express.Router();
router.get('/:slug/public',c.getMyRoomPublic);
router.post('/:slug/lobby',rateLimit({windowMs:60000,max:6,standardHeaders:true,legacyHeaders:false}),c.joinMyRoomLobby);
router.get('/:slug/lobby/:lobbyId',c.getMyRoomLobbyGuestStatus);
router.post('/:slug/lobby/:lobbyId/video-token',c.getMyRoomGuestVideo);
export default router;
