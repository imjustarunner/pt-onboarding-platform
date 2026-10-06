import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import User from '../models/User.model.js';
import { getSessionSecurity } from '../services/sessionSecurity.service.js';
import { recordAccountSession } from '../services/personalSessionHistory.service.js';
import * as passkeys from '../services/passkeys.service.js';

const handle = work => async(req,res,next)=>{
 res.set('Cache-Control','no-store');
 try {
  if(req.method!=='GET' && req.get('X-Account-Security')!=='1')return res.status(403).json({error:{message:'Use the portal sign-in or security screen.'}});
  if(req.method!=='GET')passkeys.currentPasskeySite(req);
  await work(req,res);
 }catch(e){
  if(e.code?.startsWith('PASSKEY_') || ['PRIMARY_VERIFICATION_REQUIRED','ACCOUNT_SESSION_REQUIRED','SSO_REQUIRED'].includes(e.code))return res.status(e.status||400).json({error:{code:e.code,message:e.message}});
  next(e);
 }
};
export const status=handle(async(req,res)=>res.json(await passkeys.passkeyStatus(req)));
export const registerOptions=handle(async(req,res)=>res.json(await passkeys.beginPasskeyRegistration(req,res)));
export const registerVerify=handle(async(req,res)=>{const result=await passkeys.finishPasskeyRegistration(req);res.clearCookie(passkeys.PASSKEY_COOKIE,config.authCookie.clear());res.json({registered:result.registered,recoveryCodes:result.recoveryCodes});});
export const verificationOptions=handle(async(req,res)=>res.json(await passkeys.beginPasskeyAuthentication(req,res,'verify')));
export const verificationFinish=handle(async(req,res)=>{await passkeys.finishPasskeyAuthentication(req,'verify');res.clearCookie(passkeys.PASSKEY_COOKIE,config.authCookie.clear());res.json({verified:true});});
export const remove=handle(async(req,res)=>{await passkeys.removePasskey(req);res.json({removed:true});});
export const recover=handle(async(req,res)=>{const result=await passkeys.recoverPasskeys(req);res.json({recovered:result.recovered,remainingCodes:result.remainingCodes});});
export const loginOptions=handle(async(req,res)=>res.json(await passkeys.beginPasskeyAuthentication(req,res)));
export const loginVerify=handle(async(req,res)=>{
 const {user,credentialId}=await passkeys.finishPasskeyAuthentication(req);
 const sessionId=crypto.randomUUID();
 // Respect a time-limited account even if a browser remains open.
 const duration=user.status_expires_at?Math.min(12*3600,Math.floor((new Date(user.status_expires_at).getTime()-Date.now())/1000)):12*3600;
 if(duration<=0)return res.status(403).json({error:{message:'This account access has expired.'}});
 const token=jwt.sign({id:user.id,email:user.email,role:user.role,sessionId,authMethod:'passkey',passkeyId:credentialId},config.jwt.secret,{expiresIn:duration});
 const claims=jwt.verify(token,config.jwt.secret);
 req.user={id:user.id,email:user.email,role:user.role,sessionId};req.authClaims=claims;
 req.sessionSecurity=await getSessionSecurity(claims,token);
 await recordAccountSession(claims,req);
 await passkeys.recordPasskeyLoginProof(req,credentialId);
 await req.auditIdentify?.(claims,'session_issued');
 const agencies=await User.getAgencies(user.id);
 res.cookie('authToken',token,{...config.authCookie.set(),maxAge:duration*1000});
 res.clearCookie(passkeys.PASSKEY_COOKIE,config.authCookie.clear());
 res.json({sessionId,user:{id:user.id,email:user.email,role:user.role,status:user.status,firstName:user.first_name,lastName:user.last_name,authMethod:'passkey',requiresPasswordChange:false},agencies});
});
