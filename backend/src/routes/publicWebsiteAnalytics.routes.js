import express from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../config/database.js';
import config from '../config/config.js';
import {authenticate} from '../middleware/auth.middleware.js';
import {getClientIpAddress} from '../utils/ipAddress.util.js';
import {createPublicWebsiteAnalyticsService} from '../services/publicWebsiteAnalytics.service.js';
const service=createPublicWebsiteAnalyticsService(pool,config.jwt.secret);
export const publicAnalyticsIngestLimiter=rateLimit({windowMs:60000,max:90,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>`website:${getClientIpAddress(req)||req.ip}`});
export async function ingestPublicWebsiteAnalytics(req,res,next){
  // Exclude signed-in browsers (including sessions still hydrating on the frontend), bots and previews.
  if(req.cookies?.authToken||req.headers.authorization||/bot|spider|crawler|headless/i.test(req.get('user-agent')||''))return res.sendStatus(204);
  try{await service.ingest(String(req.params.slug||''),req.body);res.sendStatus(204);}catch(e){if(e.status)return res.status(e.status).json({error:{message:e.message}});next(e);}
}
const router=express.Router();
// Reports must live outside /api/public: the shared authenticate middleware deliberately skips public paths.
router.use(authenticate);
router.use(rateLimit({windowMs:60000,max:120,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>`website-report:${req.user?.id}`}));
router.get('/:slug/access',async(req,res,next)=>{try{await service.authorize(req.user,req.params.slug);res.set('Cache-Control','no-store').json({allowed:true});}catch(e){if(e.status)return res.status(e.status).json({error:{message:e.message}});next(e);}});
router.get('/:slug',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await service.report(req.user,req.params.slug,req.query));}catch(e){if(e.status)return res.status(e.status).json({error:{message:e.message}});next(e);}});
export default router;
