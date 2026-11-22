import express from 'express';
import rateLimit from 'express-rate-limit';
import {exchangeTutoringGuest,tutoringGuestAccess} from '../services/tutoringGuest.service.js';
import * as room from '../services/bookedTutoringRoom.service.js';
import materials from './tutoringMaterials.routes.js';
const router=express.Router();
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.post('/exchange',rateLimit({windowMs:60000,max:20,standardHeaders:true,legacyHeaders:false}),async(req,res,next)=>{
 try {
  const grant=await exchangeTutoringGuest(req,req.body?.token);
  res.cookie('tutoring_guest_'+grant.id,grant.proof,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/tutoring-guest',maxAge:Math.max(0,Date.parse(grant.expiresAt)-Date.now())});
  res.json({sessionId:grant.id,agencyId:grant.agencyId,expiresAt:grant.expiresAt});
 }catch(error){next(error);}
});
router.use('/:guestSessionId',async(req,res,next)=>{try{req.tutoringContext=await tutoringGuestAccess(req,req.params.guestSessionId,req.cookies?.['tutoring_guest_'+req.params.guestSessionId]);next();}catch(error){next(error);}});
const handle=fn=>async(req,res,next)=>{try{res.json(await fn(req.tutoringContext,req));}catch(error){next(error);}};
router.use('/:guestSessionId/studio',materials);
router.get('/:guestSessionId',handle(room.tutoringRoomStatus));
router.post('/:guestSessionId/join',handle(room.joinBookedTutoringRoom));
router.post('/:guestSessionId/presence',handle(room.heartbeatBookedTutoringRoom));
router.post('/:guestSessionId/token',handle(room.bookedTutoringToken));
router.post('/:guestSessionId/leave',handle(room.leaveBookedTutoringRoom));
router.get('/:guestSessionId/workspace',handle((ctx,req)=>room.bookedTutoringWorkspace(ctx,'read',req.query)));
router.post('/:guestSessionId/workspace',handle((ctx,req)=>room.bookedTutoringWorkspace(ctx,'append',req.body)));
export default router;
