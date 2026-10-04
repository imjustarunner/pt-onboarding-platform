import express from 'express';
import pool from '../config/database.js';
import * as c from '../controllers/providerMyRoom.controller.js';
// Mounted after AuricWell's authenticated, MFA-verified practice context.
const router=express.Router();
router.use(async(req,res,next)=>{
 try{
  if(req.aw?.actorType!=='staff'||!req.aw.permissions?.includes('clinical'))return res.status(403).json({error:{message:'A clinical staff account is required.'}});
  const [rows]=await pool.execute(`SELECT u.id,u.role FROM auricwell_accounts a JOIN users u ON u.id=a.canonical_user_id JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1 WHERE a.id=? AND a.status='active'`,[req.aw.agencyId,req.aw.accountId]);
  if(!rows[0])return res.status(403).json({error:{message:'Connect your provider identity before opening your office.'}});
  // Existing AuricWell accounts retain the launch grant even if their shared identity is connected later.
  await pool.execute(`INSERT IGNORE INTO meeting_access_plans (user_id,tier,source)
   SELECT ?,'premium_plus','existing_account_launch_grant' FROM auricwell_accounts a JOIN meeting_plan_launch_grant g ON g.id=1
   WHERE a.id=? AND a.created_at<=g.created_at`,[rows[0].id,req.aw.accountId]);
  req.user=rows[0];req.query.agencyId=req.aw.agencyId;next();
 }catch(e){next(e);}
});
router.get('/me/plan',c.getMyRoomPlan);
router.get('/me',c.getMyRoomMe);
router.get('/me/lobby',c.getMyRoomLobby);
router.post('/me/video-token',c.getMyRoomHostVideo);
router.post('/me/heartbeat',c.postMyRoomHeartbeat);
router.post('/me/end',c.endMyRoom);
router.post('/lobby/:lobbyId/admit',c.admitMyRoomLobbyGuest);
router.post('/lobby/:lobbyId/dismiss',c.dismissMyRoomLobbyGuest);
router.get('/me/history',c.getMyRoomHistory);
router.get('/me/workspace',c.getOfficeWorkspace);
router.post('/me/workspace/download',c.downloadOfficeArtifact);
router.post('/me/history/:generation/artifacts/download',c.downloadOfficeHistoryArtifact);
router.post('/me/workspace',c.postOfficeWorkspace);
router.get('/me/history/:generation/artifacts',c.getOfficeVisitArtifacts);
export default router;
