import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { sharedLoginLimiter } from '../middleware/loginProtection.middleware.js';
import { mobileSessions } from '../services/mobile/session.service.js';
import {identifyMobileContext,auditMobileAction} from '../services/mobile/audit.service.js';
import { MOBILE_COOKIE, failure } from '../services/mobile/policy.js';
import { touchSession } from '../services/quickViewAuth.service.js';
import { registerMobilePush, pushConfiguration, createMobilePushWorker } from '../services/mobile/push.service.js';

const router=express.Router();
const secureCookie={httpOnly:true,secure:true,sameSite:'strict',path:'/api/mobile',maxAge:90*86400000};
const rawDevice=req=>req.get('X-Auricwell-Device') || req.cookies?.[MOBILE_COOKIE];
function refreshBrowserDevice(req,res){const raw=rawDevice(req);if(!req.get('X-Auricwell-Device') && raw)res.cookie(MOBILE_COOKIE,raw,secureCookie);}
const handle=work=>async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try{
    if(!['GET','HEAD'].includes(req.method) && req.get('X-Auricwell-Mobile')!=='1')throw failure(403,'MOBILE_REQUEST_INVALID','Use the mobile app to continue.');
    await work(req,res,next);
  }catch(error){
    if(error.code?.startsWith('MOBILE_') || ['ACCOUNT_DISABLED','ACCOUNT_UNAVAILABLE','PRODUCT_SESSION_MISMATCH','HIRE_ACTIVATION_REQUIRED'].includes(error.code))return res.status(error.status || 400).json({error:{code:error.code,message:error.message}});
    if(['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(error.code))return res.status(503).json({error:{code:'MOBILE_NOT_READY',message:'Mobile setup is not complete. Please try again later.'}});
    next(error);
  }
};
const limiter=sharedLoginLimiter({identify:true,namespace:'auricwell-mobile',sourceOnly:true});
async function unlocked(req){
  const session=await touchSession(req.get('X-Quick-View-Session'));
  if(!session?.mobileDeviceSessionId)throw failure(423,'MOBILE_LOCKED','Unlock Auricwell to continue.');
  const context=await mobileSessions.access(session.mobileDeviceSessionId,session.userId,session.agencyId,session.credentialVersion ?? null);await identifyMobileContext(req,context);return context;
}
router.get('/account',authenticate,handle(async(req,res)=>{
  if(req.user.switchedFromUserId || req.authClaims?.demoMode || req.authClaims?.testAccountSwitch)throw failure(403,'MOBILE_PRIMARY_REQUIRED','Use your own staff account to connect a device.');
  res.json(mobileSessions.publicProfile(await mobileSessions.actor(req.user.id,null,{loginHint:req.query.username || null})));
}));
router.post('/authorize',limiter,authenticate,handle(async(req,res)=>{
  if(req.user.switchedFromUserId || req.authClaims?.demoMode || req.authClaims?.testAccountSwitch || Number(req.body.expectedUserId)!==Number(req.user.id))throw failure(403,'MOBILE_PRIMARY_REQUIRED','Confirm your own account before connecting a device.');
  res.json(await mobileSessions.authorize({userId:req.user.id,agencyId:req.body.agencyId,clientId:req.body.clientId,redirectUri:req.body.redirectUri,challenge:req.body.challenge,primaryAuthentication:req.sessionSecurity?.key?{sessionKey:req.sessionSecurity.key,authMethod:req.authClaims?.authMethod==='google'?'google':'account',issuedAt:Number(req.authClaims?.iat)||Math.floor(Date.now()/1000)}:null}));
}));
router.post('/exchange',limiter,handle(async(req,res)=>{
  const result=await mobileSessions.exchange(req.body || {},rawDevice(req));
  const context=await mobileSessions.device(result.deviceToken);await identifyMobileContext(req,context);await auditMobileAction(req,'connected',context);
  if(req.body.clientId==='web'){
    res.cookie(MOBILE_COOKIE,result.deviceToken,secureCookie);
    delete result.deviceToken;
  }
  res.json(result);
}));
router.get('/session',handle(async(req,res)=>{
  const context=await mobileSessions.device(rawDevice(req));await identifyMobileContext(req,context);
  res.json({signedIn:true,userId:Number(context.user.id),needsCode:false,appLock:mobileSessions.lockInfo(context.device),workspace:context.workspace});
}));
router.post('/code',limiter,handle(async(req,res)=>{const result=await mobileSessions.setCode(rawDevice(req),req.body.passcode);refreshBrowserDevice(req,res);res.json(result);}));
router.post('/unlock',limiter,handle(async(req,res)=>{
  const native=!!req.get('X-Auricwell-Device');
  // Attribute failed code attempts to the verified retained device as well.
  // This identifies audit evidence; it grants no unlocked application access.
  const context=await mobileSessions.device(rawDevice(req));await identifyMobileContext(req,context);
  const result=await mobileSessions.unlock(rawDevice(req),{code:req.body.passcode,biometric:native && req.body.biometric===true});
  await auditMobileAction(req,'unlocked',context);
  refreshBrowserDevice(req,res);res.json(result);
}));
router.post('/resume',handle(async(req,res)=>{const result=await mobileSessions.resume(rawDevice(req),{sessionToken:req.get('X-Quick-View-Session') || null});refreshBrowserDevice(req,res);res.json(result);}));
router.post('/lock',handle(async(req,res)=>{const context=await mobileSessions.device(rawDevice(req));await identifyMobileContext(req,context);const result=await mobileSessions.lock(rawDevice(req));await auditMobileAction(req,'locked',context);res.json(result);}));
router.post('/app-lock',limiter,handle(async(req,res)=>{
  const context=await unlocked(req),device=await mobileSessions.device(rawDevice(req));
  if(Number(context.device.id)!==Number(device.device.id))throw failure(403,'MOBILE_DEVICE_MISMATCH','Use this device’s current sign-in.');
  const result=await mobileSessions.configureLock(context,{method:req.body.method,code:req.body.passcode,biometricVerified:!!req.get('X-Auricwell-Device') && req.body.biometric===true});
  await auditMobileAction(req,'lock_configured',context);refreshBrowserDevice(req,res);res.json(result);
}));
router.post('/logout',handle(async(req,res)=>{
  let context;try{context=await mobileSessions.device(rawDevice(req));await identifyMobileContext(req,context);}catch{/* An already revoked grant can still clear its cookie. */}
  await mobileSessions.logout(rawDevice(req));await auditMobileAction(req,'signed_out',context);res.clearCookie(MOBILE_COOKIE,{...secureCookie,maxAge:undefined});res.json({signedOut:true});
}));
router.post('/activity',handle(async(req,res)=>{await unlocked(req);const session=await touchSession(req.get('X-Quick-View-Session'),{activity:true});if(!session)throw failure(423,'MOBILE_LOCKED','Unlock Auricwell to continue.');res.json({expiresAt:session.expiresAt});}));
router.get('/profile',handle(async(req,res)=>{
  const context=await unlocked(req);
  res.json({...mobileSessions.publicProfile(context),notifications:{enabled:!!context.device.push_enabled,...pushConfiguration()}});
}));
router.post('/workspace',handle(async(req,res)=>{const context=await unlocked(req),result=await mobileSessions.switchWorkspace(context,req.body.agencyId);await auditMobileAction(req,'workspace_changed',{...context,workspace:result.profile?.workspace || context.workspace});res.json(result);}));
router.post('/notifications',handle(async(req,res)=>res.json(await registerMobilePush(await unlocked(req),req.body || {}))));
const notificationHandler=async(req,res,next)=>{const {createMobileNotificationHandler}=await import('../services/mobile/notifications.service.js');return createMobileNotificationHandler({unlock:unlocked})(req,res,next);};
router.get('/notification-feed',handle(notificationHandler));
router.get('/notification-count',handle(notificationHandler));
router.patch('/notification-feed/:id',handle(notificationHandler));
router.get('/notification-settings',handle(notificationHandler));
router.patch('/notification-settings/:type',handle(notificationHandler));

router.get('/notification-target/:kind/:id',handle(async(req,res)=>{
  const context=await unlocked(req),kind=req.params.kind,id=Number(req.params.id);
  if(!Number.isSafeInteger(id) || id<=0)throw failure(404,'MOBILE_TARGET_UNAVAILABLE','This message is unavailable.');
  // Reading an already received update is independent of the current delivery
  // subscription or Live Chat online state. Fresh recipient/role access remains required.
  const target=await createMobilePushWorker().permitted(context.device,kind,id,context,{forDelivery:false});
  if(!target)throw failure(404,'MOBILE_TARGET_UNAVAILABLE','This message is unavailable.');
  if(kind==='chat'){
    const {default:pool}=await import('../config/database.js');
    const [[message]]=await pool.execute('SELECT m.parent_message_id,t.message_channel FROM chat_messages m JOIN chat_threads t ON t.id=m.thread_id WHERE m.id=? AND m.thread_id=?',[id,target]);
    return res.json({threadId:String(target),messageId:String(id),...(message?.parent_message_id?{parentId:String(message.parent_message_id)}:{}),...(message?.message_channel==='secure'?{suite:'secure',secure:'1'}:{})});
  }
  if(kind==='email')return res.json({conversationId:String(target)});
  if(['notification','websitechat'].includes(kind)){
    // permitted() checked personal recipient, fresh agency/role, preferences and
    // online Live Chat state. Return only fields needed by normal app navigation.
    const {default:pool}=await import('../config/database.js');
    const [[notification]]=await pool.execute(`SELECT id,type,title,message,agency_id,related_entity_type,related_entity_id,audience_json
      FROM notifications WHERE id=? AND user_id=? LIMIT 1`,[target,context.user.id]);
    if(!notification)throw failure(404,'MOBILE_TARGET_UNAVAILABLE','This notification is unavailable.');
    return res.json({notification});
  }
  const {default:pool}=await import('../config/database.js');
  const [[conversation]]=await pool.execute(`SELECT c.id FROM communication_conversations c JOIN message_logs m ON m.agency_id=c.agency_id AND m.sms_thread_key=c.external_thread_id WHERE m.id=? AND c.channel='sms' LIMIT 1`,[id]);
  res.json(conversation?{conversationId:String(conversation.id)}:{});
}));
export default router;
