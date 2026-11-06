import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { sharedLoginLimiter } from '../middleware/loginProtection.middleware.js';
import { mobileSessions } from '../services/mobile/session.service.js';
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
    await work(req,res);
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
  return mobileSessions.access(session.mobileDeviceSessionId,session.userId,session.agencyId);
}
router.get('/account',authenticate,handle(async(req,res)=>{
  if(req.user.switchedFromUserId || req.authClaims?.demoMode)throw failure(403,'MOBILE_PRIMARY_REQUIRED','Use your own staff account to connect a device.');
  res.json(mobileSessions.publicProfile(await mobileSessions.actor(req.user.id)));
}));
router.post('/authorize',limiter,authenticate,handle(async(req,res)=>{
  if(req.user.switchedFromUserId || req.authClaims?.demoMode || Number(req.body.expectedUserId)!==Number(req.user.id))throw failure(403,'MOBILE_PRIMARY_REQUIRED','Confirm your own account before connecting a device.');
  res.json(await mobileSessions.authorize({userId:req.user.id,agencyId:req.body.agencyId,clientId:req.body.clientId,redirectUri:req.body.redirectUri,challenge:req.body.challenge}));
}));
router.post('/exchange',limiter,handle(async(req,res)=>{
  const result=await mobileSessions.exchange(req.body || {},rawDevice(req));
  if(req.body.clientId==='web'){
    res.cookie(MOBILE_COOKIE,result.deviceToken,secureCookie);
    delete result.deviceToken;
  }
  res.json(result);
}));
router.get('/session',handle(async(req,res)=>{
  const context=await mobileSessions.device(rawDevice(req));
  res.json({signedIn:true,needsCode:false,appLock:mobileSessions.lockInfo(context.device),workspace:context.workspace});
}));
router.post('/code',limiter,handle(async(req,res)=>{const result=await mobileSessions.setCode(rawDevice(req),req.body.passcode);refreshBrowserDevice(req,res);res.json(result);}));
router.post('/unlock',limiter,handle(async(req,res)=>{
  const native=!!req.get('X-Auricwell-Device');
  const result=await mobileSessions.unlock(rawDevice(req),{code:req.body.passcode,biometric:native && req.body.biometric===true});
  refreshBrowserDevice(req,res);res.json(result);
}));
router.post('/resume',limiter,handle(async(req,res)=>{const result=await mobileSessions.resume(rawDevice(req));refreshBrowserDevice(req,res);res.json(result);}));
router.post('/app-lock',limiter,handle(async(req,res)=>{
  const context=await unlocked(req),device=await mobileSessions.device(rawDevice(req));
  if(Number(context.device.id)!==Number(device.device.id))throw failure(403,'MOBILE_DEVICE_MISMATCH','Use this device’s current sign-in.');
  const result=await mobileSessions.configureLock(context,{method:req.body.method,code:req.body.passcode,biometricVerified:!!req.get('X-Auricwell-Device') && req.body.biometric===true});
  refreshBrowserDevice(req,res);res.json(result);
}));
router.post('/logout',handle(async(req,res)=>{
  await mobileSessions.logout(rawDevice(req));res.clearCookie(MOBILE_COOKIE,{...secureCookie,maxAge:undefined});res.json({signedOut:true});
}));
router.get('/profile',handle(async(req,res)=>{
  const context=await unlocked(req);
  res.json({...mobileSessions.publicProfile(context),notifications:{enabled:!!context.device.push_enabled,...pushConfiguration()}});
}));
router.post('/workspace',handle(async(req,res)=>res.json(await mobileSessions.switchWorkspace(await unlocked(req),req.body.agencyId))));
router.post('/notifications',handle(async(req,res)=>res.json(await registerMobilePush(await unlocked(req),req.body || {}))));
router.get('/notification-target/:kind/:id',handle(async(req,res)=>{
  const context=await unlocked(req),kind=req.params.kind,id=Number(req.params.id);
  if(!Number.isSafeInteger(id) || id<=0)throw failure(404,'MOBILE_TARGET_UNAVAILABLE','This message is unavailable.');
  const target=await createMobilePushWorker().permitted(context.device,kind,id);
  if(!target)throw failure(404,'MOBILE_TARGET_UNAVAILABLE','This message is unavailable.');
  if(kind==='chat'){
    const {default:pool}=await import('../config/database.js');
    const [[message]]=await pool.execute('SELECT m.parent_message_id,t.message_channel FROM chat_messages m JOIN chat_threads t ON t.id=m.thread_id WHERE m.id=? AND m.thread_id=?',[id,target]);
    return res.json({threadId:String(target),messageId:String(id),...(message?.parent_message_id?{parentId:String(message.parent_message_id)}:{}),...(message?.message_channel==='secure'?{suite:'secure',secure:'1'}:{})});
  }
  if(kind==='email')return res.json({conversationId:String(target)});
  const {default:pool}=await import('../config/database.js');
  const [[conversation]]=await pool.execute(`SELECT c.id FROM communication_conversations c JOIN message_logs m ON m.agency_id=c.agency_id AND m.sms_thread_key=c.external_thread_id WHERE m.id=? AND c.channel='sms' LIMIT 1`,[id]);
  res.json(conversation?{conversationId:String(conversation.id)}:{});
}));
export default router;
