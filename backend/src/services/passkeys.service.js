import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import pool from '../config/database.js';
import config from '../config/config.js';
import User from '../models/User.model.js';
import { getPasswordRecoverySsoState } from './passwordRecoveryPolicy.service.js';
import { requireAccountSession, accountSecurityState } from './accountSecurity.service.js';
import { assertPasskeyAccount, passkeySite, passkeyRoleAllowed } from '../utils/passkeyPolicy.js';
import { hashSecurityToken, makeRecoveryCodes, recoveryHash, securityError } from '../utils/accountSecurity.js';
import { resolveRequiresPasswordChange } from '../utils/passwordPolicy.js';
import { accountPasswordLocked, recordPasswordResult } from '../middleware/loginProtection.middleware.js';
import { appendSecurityEvidence, mirrorSecurityEvidence } from './securityEvidence.service.js';
import { sessionReference } from '../utils/securityEvidence.js';

const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const invalid = () => securityError('PASSKEY_INVALID', 'Passkey verification failed or expired. Please try again.', 401);
export const PASSKEY_COOKIE = 'ptPasskeyChallenge';
export function currentPasskeySite(req) {
 const allowed = [...new Set([...(Array.isArray(config.cors.origin) ? config.cors.origin : [config.cors.origin]),
  ...(process.env.PASSKEY_ALLOWED_ORIGINS || '').split(',').map(v=>v.trim()).filter(Boolean)])];
 return passkeySite(req.get('origin'), allowed);
}
export async function eligiblePasskeyUser(id,{enrollment=false}={}) {
 const [[user]] = await pool.execute('SELECT * FROM users WHERE id=? LIMIT 1',[id]);
 assertPasskeyAccount(user);
 if (!enrollment && (await getPasswordRecoverySsoState(user)).ssoRequired) throw securityError('SSO_REQUIRED', 'Your organization requires Google sign-in. Continue with Google.', 403);
 return user;
}
async function audit(db, req, action, userId, details={}) {
 const event={...req.evidenceContext,userId,role:req.user?.role,sessionRef:req.user?.sessionId?sessionReference(req.user.sessionId):null,phase:'administrative_action',action,outcome:'succeeded',details};
 const id=await appendSecurityEvidence(event,db,{mirror:false});return ()=>mirrorSecurityEvidence(event,id);
}
async function transaction(work) {
 const db=await pool.getConnection();try {await db.beginTransaction();const result=await work(db);await db.commit();result?.mirror?.();return result;}catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function passkeyProof(req, db=pool) {
 if (!req.sessionSecurity?.key) return null;
 const [[proof]]=await db.execute(`SELECT p.*,k.revoked_at FROM account_passkey_proofs p LEFT JOIN account_passkeys k ON k.id=p.credential_id
 WHERE p.user_id=? AND p.session_key=? AND (p.credential_id IS NULL OR (k.id IS NOT NULL AND k.revoked_at IS NULL))`,[req.user.id,req.sessionSecurity.key]);
 return proof || null;
}
async function saveProof(db,req,credentialId,method='passkey') {
 delete req.accountSecurityState;
 await db.execute(`INSERT INTO account_passkey_proofs (session_key,user_id,credential_id,method,verified_at) VALUES (?,?,?,?,UTC_TIMESTAMP(3))
 ON DUPLICATE KEY UPDATE credential_id=VALUES(credential_id),method=VALUES(method),verified_at=VALUES(verified_at)`,[req.sessionSecurity.key,req.user.id,credentialId,method]);
}
export async function passkeyStatus(req) {
 requireAccountSession(req);
 const ssoSetup=req.authClaims?.authMethod==='google';
 const user=await User.findById(req.user.id);
 if(!passkeyRoleAllowed(user))return {eligible:false};
 try {await eligiblePasskeyUser(user.id,{enrollment:ssoSetup});}catch(e){if(['PASSKEY_ACCOUNT_UNAVAILABLE','SSO_REQUIRED'].includes(e.code))return {eligible:false};throw e;}
 const [[account]]=await pool.execute('SELECT protection_enabled,recovery_hashes FROM account_passkey_accounts WHERE user_id=?',[user.id]);
 const [keys]=await pool.execute('SELECT id,label,rp_id,created_at,last_used_at,backed_up FROM account_passkeys WHERE user_id=? AND revoked_at IS NULL ORDER BY id',[user.id]);
 const proof=await passkeyProof(req);
 return {eligible:true,ssoSetup,enabled:!!account?.protection_enabled,keys,recoveryCodesRemaining:(json(account?.recovery_hashes)||[]).length,
  recentlyVerified:(ssoSetup && Number(req.authClaims.iat)*1000>Date.now()-5*60000)||!!proof && new Date(proof.verified_at).getTime()>Date.now()-5*60000};
}
async function confirmExistingAccount(req,user) {
 if(req.authClaims?.authMethod==='google' && Number(req.authClaims.iat)*1000>Date.now()-5*60000)return;
 const proof=await passkeyProof(req);
 if(proof && new Date(proof.verified_at).getTime()>Date.now()-5*60000)return;
 if(await accountPasswordLocked(user.id))throw securityError('PASSKEY_PASSWORD_LOCKED','Account verification is locked. Contact support.',429);
 const password=req.body?.password;
 const valid=typeof password==='string' && password.length<=256 && !!user.password_hash && await bcrypt.compare(password,user.password_hash);
 if(!await recordPasswordResult(user.id,!!valid) || !valid)throw securityError('PRIMARY_VERIFICATION_REQUIRED','Confirm your current account password.',403);
 if(resolveRequiresPasswordChange(user).requiresPasswordChange)throw securityError('PRIMARY_VERIFICATION_REQUIRED','Finish changing your password before setting up a passkey.',403);
 const [[account]]=await pool.execute('SELECT protection_enabled FROM account_passkey_accounts WHERE user_id=?',[user.id]);
 const state=await accountSecurityState(req);
 if((account?.protection_enabled || state.authenticatorEnabled) && !state.verified)throw securityError('PASSKEY_PROOF_REQUIRED','Verify an existing passkey, your authenticator, or a recovery code first.',403);
}
async function newChallenge(req,res,purpose,options,site,{userId=null,label=null,authorizationEpoch=1}={}) {
 const id=crypto.randomBytes(32).toString('hex'),browser=crypto.randomBytes(32).toString('hex');
 await pool.execute('DELETE FROM account_passkey_challenges WHERE expires_at<UTC_TIMESTAMP(3) LIMIT 200');
 await pool.execute(`INSERT INTO account_passkey_challenges (id,browser_hash,challenge,purpose,user_id,session_key,origin,rp_id,label,authorization_epoch,expires_at)
 VALUES (?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3)+INTERVAL 5 MINUTE)`,[id,hashSecurityToken(browser),options.challenge,purpose,userId,req.sessionSecurity?.key||null,site.origin,site.rpID,label,authorizationEpoch]);
 res.cookie(PASSKEY_COOKIE,browser,{...config.authCookie.set(),maxAge:300000});
 return {challengeId:id,options};
}
async function consumeChallenge(req,purpose) {
 const id=req.body?.challengeId,browser=req.cookies?.[PASSKEY_COOKIE];
 if(!/^[a-f0-9]{64}$/.test(id||'')||!/^[a-f0-9]{64}$/.test(browser||''))throw invalid();
 const site=currentPasskeySite(req);
 return transaction(async db=>{
  const [[row]]=await db.execute('SELECT *,expires_at>UTC_TIMESTAMP(3) fresh FROM account_passkey_challenges WHERE id=? FOR UPDATE',[id]);
  if(!row || row.browser_hash!==hashSecurityToken(browser) || row.purpose!==purpose || row.origin!==site.origin || !row.fresh
   || (purpose!=='login' && (Number(row.user_id)!==Number(req.user.id)||row.session_key!==req.sessionSecurity?.key)))throw invalid();
  await db.execute('DELETE FROM account_passkey_challenges WHERE id=?',[id]);return row;
 });
}
export async function beginPasskeyRegistration(req,res) {
 requireAccountSession(req);
 const user=await eligiblePasskeyUser(req.user.id,{enrollment:req.authClaims?.authMethod==='google'});const site=currentPasskeySite(req);
 await pool.execute('INSERT IGNORE INTO account_passkey_accounts (user_id,user_handle) VALUES (?,?)',[user.id,crypto.randomBytes(32).toString('base64url')]);
 const [[account]]=await pool.execute('SELECT user_handle,authorization_epoch FROM account_passkey_accounts WHERE user_id=?',[user.id]);
 await confirmExistingAccount(req,user);
 const [keys]=await pool.execute('SELECT credential_id,transports FROM account_passkeys WHERE user_id=? AND rp_id=? AND revoked_at IS NULL',[user.id,site.rpID]);
 if(keys.length>=10)throw securityError('PASSKEY_LIMIT','You can save up to 10 passkeys for this portal. Remove an unused one first.',409);
 const options=await generateRegistrationOptions({rpName:'Your care portal',rpID:site.rpID,userName:user.email,userID:Buffer.from(account.user_handle,'base64url'),
  attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},supportedAlgorithmIDs:[-7,-257],
  excludeCredentials:keys.map(k=>({id:k.credential_id,transports:json(k.transports)||[]}))});
 return newChallenge(req,res,'register',options,site,{userId:user.id,authorizationEpoch:account.authorization_epoch,label:String(req.body?.label||'My passkey').trim().slice(0,100)||'My passkey'});
}
export async function finishPasskeyRegistration(req) {
 requireAccountSession(req);const challenge=await consumeChallenge(req,'register');await eligiblePasskeyUser(req.user.id,{enrollment:req.authClaims?.authMethod==='google'});
 let result;try{result=await verifyRegistrationResponse({response:req.body.response,expectedChallenge:challenge.challenge,expectedOrigin:challenge.origin,expectedRPID:challenge.rp_id,requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]});}catch{throw invalid();}
 if(!result.verified)throw invalid();
 const info=result.registrationInfo,key=info.credential;
 return transaction(async db=>{
  const [[account]]=await db.execute('SELECT * FROM account_passkey_accounts WHERE user_id=? FOR UPDATE',[req.user.id]);
  if(Number(account.authorization_epoch)!==Number(challenge.authorization_epoch))throw invalid();
  const [[currentUser]]=await db.execute('SELECT * FROM users WHERE id=? FOR UPDATE',[req.user.id]);
  assertPasskeyAccount(currentUser);
  const authorizedAt=new Date(challenge.expires_at).getTime()-300000;
  if([currentUser.password_changed_at,currentUser.temporary_password_set_at].some(at=>at && new Date(at).getTime()>authorizedAt))throw invalid();
  // A concurrent recovery/password reset cannot complete an older enrollment.
  const [[revocation]]=await db.execute('SELECT reject_issued_before FROM user_auth_revocations WHERE user_id=? FOR UPDATE',[req.user.id]);
  if(revocation && Number(req.authClaims?.iat)<Number(revocation.reject_issued_before))throw invalid();
  const [[count]]=await db.execute('SELECT COUNT(*) total FROM account_passkeys WHERE user_id=? AND rp_id=? AND revoked_at IS NULL',[req.user.id,challenge.rp_id]);
  if(Number(count.total)>=10)throw securityError('PASSKEY_LIMIT','Remove an unused passkey before adding another.',409);
  const [insert]=await db.execute(`INSERT INTO account_passkeys (user_id,credential_id,credential_hash,public_key,signature_counter,rp_id,transports,label,backed_up)
   VALUES (?,?,?,?,?,?,?,?,?)`,[req.user.id,key.id,hashSecurityToken(key.id),Buffer.from(key.publicKey),key.counter,challenge.rp_id,JSON.stringify(key.transports||[]),challenge.label,info.credentialBackedUp?1:0]);
  const recovery=account.protection_enabled?null:makeRecoveryCodes();
  await db.execute('UPDATE account_passkey_accounts SET protection_enabled=1,recovery_hashes=COALESCE(?,recovery_hashes) WHERE user_id=?',[recovery?JSON.stringify(recovery.hashes):null,req.user.id]);
  await saveProof(db,req,insert.insertId);
  return {registered:true,recoveryCodes:recovery?.codes||[],mirror:await audit(db,req,'passkey_registered',req.user.id,{passkeyId:insert.insertId,rpId:challenge.rp_id})};
 });
}
export async function beginPasskeyAuthentication(req,res,purpose='login') {
 const site=currentPasskeySite(req);
 if(purpose==='verify'){requireAccountSession(req);await eligiblePasskeyUser(req.user.id);}
 const options=await generateAuthenticationOptions({rpID:site.rpID,userVerification:'required'});
 return newChallenge(req,res,purpose,options,site,{userId:purpose==='verify'?req.user.id:null});
}
export async function finishPasskeyAuthentication(req,purpose='login') {
 const challenge=await consumeChallenge(req,purpose),response=req.body?.response;
 if(typeof response?.id!=='string'||response.id.length>1400)throw invalid();
 return transaction(async db=>{
  const [[key]]=await db.execute('SELECT k.*,a.user_handle FROM account_passkeys k JOIN account_passkey_accounts a ON a.user_id=k.user_id WHERE credential_hash=? AND revoked_at IS NULL FOR UPDATE',[hashSecurityToken(response.id)]);
  if(!key || key.credential_id!==response.id || key.rp_id!==challenge.rp_id || (purpose==='verify'&&Number(key.user_id)!==Number(req.user.id))
   || response.response?.userHandle!==key.user_handle)throw invalid();
  const user=await eligiblePasskeyUser(key.user_id);
  let result;try{result=await verifyAuthenticationResponse({response,expectedChallenge:challenge.challenge,expectedOrigin:challenge.origin,expectedRPID:challenge.rp_id,
   credential:{id:key.credential_id,publicKey:new Uint8Array(key.public_key),counter:Number(key.signature_counter),transports:json(key.transports)||[]},requireUserVerification:true});}catch{throw invalid();}
  if(!result.verified)throw invalid();
  await db.execute('UPDATE account_passkeys SET signature_counter=?,last_used_at=UTC_TIMESTAMP(3),backed_up=? WHERE id=?',[result.authenticationInfo.newCounter,result.authenticationInfo.credentialBackedUp?1:0,key.id]);
  if(purpose==='verify')await saveProof(db,req,key.id);
  return {user,credentialId:key.id,mirror:await audit(db,req,'passkey_verified',user.id,{passkeyId:key.id})};
 });
}
export async function removePasskey(req) {
 requireAccountSession(req);const user=await eligiblePasskeyUser(req.user.id);await confirmExistingAccount(req,user);
 return transaction(async db=>{
  // Lock the account before credentials to serialize concurrent removals/recovery.
  await db.execute('SELECT user_id FROM account_passkey_accounts WHERE user_id=? FOR UPDATE',[user.id]);
  const [keys]=await db.execute('SELECT id FROM account_passkeys WHERE user_id=? AND revoked_at IS NULL FOR UPDATE',[user.id]);
  if(!keys.some(k=>String(k.id)===String(req.params.id)))throw securityError('PASSKEY_NOT_FOUND','Passkey not found.',404);
  if(keys.length<=1)throw securityError('PASSKEY_LAST','Add a replacement passkey before removing your last one. If it is lost, use account recovery.',409);
  await db.execute('UPDATE account_passkey_accounts SET authorization_epoch=authorization_epoch+1 WHERE user_id=?',[user.id]);
  await db.execute('UPDATE account_passkeys SET revoked_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=?',[req.params.id,user.id]);
  return {removed:true,mirror:await audit(db,req,'passkey_removed',user.id,{passkeyId:String(req.params.id)})};
 });
}
export async function recoverPasskeys(req) {
 requireAccountSession(req);
 if(req.authClaims?.authMethod==='passkey')throw securityError('PASSKEY_RECOVERY_SIGNIN','Sign out and sign in with your account password before using recovery.',403);
 const user=await eligiblePasskeyUser(req.user.id);
 const valid=typeof req.body?.password==='string' && req.body.password.length<=256 && user.password_hash && !await accountPasswordLocked(user.id) && await bcrypt.compare(req.body.password,user.password_hash);
 if(!await recordPasswordResult(user.id,!!valid)||!valid)throw securityError('PRIMARY_VERIFICATION_REQUIRED','Confirm your current account password.',403);
 return transaction(async db=>{
  const [[account]]=await db.execute('SELECT * FROM account_passkey_accounts WHERE user_id=? FOR UPDATE',[user.id]);
  const hashes=json(account?.recovery_hashes)||[],hash=recoveryHash(req.body?.code);
  if(!account?.protection_enabled||!hashes.includes(hash))throw securityError('PASSKEY_RECOVERY_INVALID','That recovery code is invalid or has already been used.',422);
  await db.execute('UPDATE account_passkey_accounts SET recovery_hashes=?,authorization_epoch=authorization_epoch+1 WHERE user_id=?',[JSON.stringify(hashes.filter(h=>h!==hash)),user.id]);
  await db.execute('UPDATE account_passkeys SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL',[user.id]);
  await db.execute('DELETE FROM account_passkey_proofs WHERE user_id=?',[user.id]);
  await db.execute('DELETE FROM account_passkey_challenges WHERE user_id=?',[user.id]);
  await db.execute("UPDATE auth_session_security SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(3)),end_reason=COALESCE(end_reason,'Passkey account recovery') WHERE user_id=? AND session_key<>?",[user.id,req.sessionSecurity.key]);
  await db.execute('UPDATE account_mfa_devices SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL',[user.id]);
  await db.execute('DELETE FROM account_mfa_sessions WHERE user_id=?',[user.id]);
  // Other sessions, including issued-but-never-used JWTs, cannot retain passkey proofs.
  await saveProof(db,req,null,'recovery');
  return {recovered:true,remainingCodes:hashes.length-1,mirror:await audit(db,req,'passkey_recovered',user.id)};
 });
}
export async function assertPasskeySession(decoded) {
 if(decoded.authMethod!=='passkey')return;
 const user=await eligiblePasskeyUser(decoded.id);
 const [[key]]=await pool.execute('SELECT id FROM account_passkeys WHERE id=? AND user_id=? AND revoked_at IS NULL',[decoded.passkeyId||0,user.id]);
 if(!key)throw securityError('SESSION_EXPIRED','This passkey was removed. Sign in again.',401);
}
export async function recordPasskeyLoginProof(req,credentialId) {await saveProof(pool,req,credentialId);}
