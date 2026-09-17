import express from 'express';
import rateLimit from 'express-rate-limit';
import {authenticate} from '../middleware/auth.middleware.js';
import {websiteChat} from '../services/publicWebsiteChat.service.js';
// Google LB overwrites these headers from the connection IP. Region is an eligibility hint,
// never an authentication or tenant authorization mechanism.
const ip=req=>req.get('x-website-client-ip')||req.ip||'unknown';
const region=req=>req.get('x-website-region')||'';
const handle=fn=>async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json(await fn(req)||{ok:true});}catch(e){if(e.status)return res.status(e.status).json({error:{message:e.message}});next(e);}};
const publicRouter=express.Router();
publicRouter.use(rateLimit({windowMs:60000,max:100,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>`website-chat:${ip(req)}`}));
publicRouter.get('/:slug/config',handle(req=>websiteChat.publicConfig(req.params.slug,region(req))));
publicRouter.post('/:slug/sessions',handle(req=>websiteChat.start(req.params.slug,{region:region(req),ip:ip(req),captchaToken:req.body.captchaToken,honeypot:req.body.website,userAgent:req.get('user-agent')})));
publicRouter.get('/:slug/sessions/:id',handle(req=>websiteChat.read(req.params.slug,req.params.id,req.get('x-website-chat-token'))));
publicRouter.post('/:slug/sessions/:id/messages',handle(req=>websiteChat.visitorSend(req.params.slug,req.params.id,req.get('x-website-chat-token'),req.body)));
publicRouter.post('/:slug/sessions/:id/presence',handle(req=>websiteChat.visitorPresence(req.params.slug,req.params.id,req.get('x-website-chat-token'),req.body)));
// Body token permits a pagehide beacon without placing credentials in URLs.
publicRouter.post('/:slug/sessions/:id/leave',handle(req=>websiteChat.visitorLeave(req.params.slug,req.params.id,req.get('x-website-chat-token')||req.body.token,req.body.end===true)));
publicRouter.post('/:slug/sessions/:id/referral',handle(req=>websiteChat.visitorReferral(req.params.slug,req.params.id,req.get('x-website-chat-token'))));
// Staff routes deliberately live outside /api/public, which skips app authentication.
const staffRouter=express.Router();
staffRouter.use(authenticate);
staffRouter.use(rateLimit({windowMs:60000,max:150,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>`website-chat-staff:${req.user?.id||req.ip}`}));
staffRouter.post('/presence',handle(req=>websiteChat.staffHeartbeat(req.user,req.body.available===true)));
staffRouter.get('/team',handle(async req=>({team:await websiteChat.team(req.user)})));
staffRouter.get('/sessions',handle(async req=>({sessions:await websiteChat.queue(req.user)})));
staffRouter.get('/sessions/:id',handle(req=>websiteChat.staffRead(req.user,req.params.id)));
staffRouter.post('/sessions/:id/messages',handle(req=>websiteChat.staffSend(req.user,req.params.id,req.body)));
staffRouter.post('/sessions/:id/close',handle(req=>websiteChat.close(req.user,req.params.id)));
staffRouter.post('/sessions/:id/presence',handle(req=>websiteChat.staffPresence(req.user,req.params.id,req.body)));
staffRouter.post('/sessions/:id/claim',handle(req=>websiteChat.claim(req.user,req.params.id,req.body.release===true)));
staffRouter.post('/sessions/:id/standards',handle(req=>websiteChat.flag(req.user,req.params.id,req.body.confirmed)));
staffRouter.post('/sessions/:id/referral',handle(req=>websiteChat.referral(req.user,req.params.id,req.body.category||'')));
export {publicRouter,staffRouter};
