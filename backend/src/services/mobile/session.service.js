import bcrypt from 'bcrypt';
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import { assertAccountEnabled } from '../../utils/accountAccess.js';
import { assertHireStaffAccess } from '../hireStaffAccess.service.js';
import { assertFullSuiteIdentity } from '../productIdentity.service.js';
import { buildPublicPortalLoginUrl } from '../../utils/publicPortalUrl.js';
import { startAuthenticatedMobileSession } from '../quickViewAuth.service.js';
import {FAMILY_ROLES,listMobileFamilyAgencies} from './familyScope.service.js';
import {listMobileAgencies} from './agencyScope.service.js';
import { accountFingerprint, digest, opaqueToken, validClient, validChallenge, verifyChallenge, requireQuickCode, failure, STAFF_ROLES, MAX_CODE_ATTEMPTS, DEVICE_IDLE_MS, PRIMARY_AUTH_MAX_AGE_MS, MOBILE_INACTIVITY_MS } from './policy.js';

export function parsePrimaryAuthentication(value){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed && typeof parsed.sessionKey==='string' && parsed.sessionKey.length<=128?{sessionKey:parsed.sessionKey,authMethod:parsed.authMethod==='google'?'google':'account',issuedAt:Number(parsed.issuedAt)||0}:null;}catch{return null;}}

export function createMobileSessionService({ db=pool, findUser=id=>User.findById(id,{raw:true}), assertStaff=assertHireStaffAccess, assertProduct=assertFullSuiteIdentity, issueSession=startAuthenticatedMobileSession, compare=bcrypt.compare, hash=code=>bcrypt.hash(code,12), now=()=>new Date() }={}) {
  async function actor(userId, agencyId=null,{loginHint=null}={}) {
    if(!Number.isSafeInteger(Number(userId)) || Number(userId)<=0 || agencyId!==null && (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId)<=0))throw failure(400,'MOBILE_WORKSPACE_INVALID','Choose a valid workspace.');
    const user=await findUser(Number(userId));
    assertAccountEnabled(user);
    if(loginHint){
      const hint=String(loginHint).trim().toLowerCase();
      const matched=await User.findByEmail(hint) || await User.findByUsername(hint);
      if(!matched || Number(matched.id)!==Number(userId))throw failure(403,'MOBILE_ACCOUNT_MISMATCH','Sign in with the username you entered, or choose a different account.');
    }
    await assertProduct(userId); await assertStaff({id:Number(userId)});
    if(!STAFF_ROLES.has(String(user.role || '').toLowerCase()) && !FAMILY_ROLES.has(String(user.role || '').toLowerCase()) || user.status_expires_at && new Date(user.status_expires_at)<=now()) throw failure(403,'MOBILE_ACCOUNT_UNAVAILABLE','This account cannot use the staff mobile workspace.');
    const family=FAMILY_ROLES.has(String(user.role).toLowerCase());
    const scoped=family?await listMobileFamilyAgencies(user,{db}):await listMobileAgencies(user,{db});
    const agencies=scoped.agencies.map(a=>({id:a.id,name:a.name,portal_url:a.portal_url,loginUrl:buildPublicPortalLoginUrl(a)}));
    const workspace=agencyId ? agencies.find(a=>Number(a.id)===Number(agencyId)) : null;
    if(agencyId && !workspace) throw failure(403,'MOBILE_WORKSPACE_UNAVAILABLE','Your access to this workspace has changed.');
    return {user,agencies,workspace,surface:family?'family':'staff',qaAgencyIds:scoped.qaAgencyIds};
  }
  function lockInfo(device) { return {method:device.app_lock_method==='biometric'?'biometric':'code',hasCode:true,usesAccountCode:true,inactivityMinutes:MOBILE_INACTIVITY_MS/60000}; }
  function publicProfile(context) {
    const {user,agencies,workspace}=context;
    return {surface:context.surface || 'staff',...(context.device?{appLock:lockInfo(context.device)}:{}),user:{id:user.id,firstName:user.first_name || '',lastName:user.last_name || '',email:user.email,role:user.role,profilePhotoPath:user.profile_photo_path || null},agencies,workspace};
  }
  async function authorize({userId,agencyId,clientId,redirectUri,challenge,primaryAuthentication=null}) {
    validClient(clientId,redirectUri);validChallenge(challenge);
    if(primaryAuthentication?.issuedAt && (now().getTime()-Number(primaryAuthentication.issuedAt)*1000>=PRIMARY_AUTH_MAX_AGE_MS || Number(primaryAuthentication.issuedAt)*1000>now().getTime()+300000))throw failure(403,'MOBILE_PRIMARY_REQUIRED','Sign in with your password, SSO or passkey again. Primary sign-in is required every 30 days.');
    const available=await actor(userId,agencyId || null);
    const selected=available.workspace || available.agencies[0];
    if(!selected)throw failure(403,'MOBILE_WORKSPACE_UNAVAILABLE','No authorized workspace is available.');
    agencyId=selected.id;
    const context={...available,workspace:selected};
    const code=opaqueToken();
    await db.execute(`INSERT INTO mobile_authorization_codes (code_hash,user_id,agency_id,client_id,redirect_uri,code_challenge,account_fingerprint,expires_at,primary_authentication_json)
      VALUES (?,?,?,?,?,?,?,?,?)`,[digest(code),Number(userId),Number(agencyId),clientId,redirectUri,challenge,accountFingerprint(context.user),new Date(now().getTime()+300000),primaryAuthentication?JSON.stringify(primaryAuthentication):null]);
    return {code,redirectUri};
  }
  async function exchange({code,verifier,clientId,redirectUri,deviceName},existingToken=null) {
    validClient(clientId,redirectUri);
    if(!/^[A-Za-z0-9_-]{43}$/.test(String(code || '')))throw failure(401,'MOBILE_CODE_EXPIRED','Restart sign-in to this device.');
    const connection=await db.getConnection();
    let enrollment;
    try{
      await connection.beginTransaction();
      const [[grant]]=await connection.execute('SELECT * FROM mobile_authorization_codes WHERE code_hash=? FOR UPDATE',[digest(code)]);
      if(!grant || grant.consumed_at || new Date(grant.expires_at)<=now() || grant.client_id!==clientId || grant.redirect_uri!==redirectUri || !verifyChallenge(verifier,grant.code_challenge))throw failure(401,'MOBILE_CODE_EXPIRED','Restart sign-in to this device.');
      const context=await actor(grant.user_id,grant.agency_id);
      if(grant.account_fingerprint!==accountFingerprint(context.user))throw failure(401,'MOBILE_ACCOUNT_CHANGED','Sign in again after the account security change.');
      let existing=null;
      if(/^[A-Za-z0-9_-]{43}$/.test(String(existingToken || ''))){
        const [[row]]=await connection.execute('SELECT * FROM mobile_device_sessions WHERE token_hash=? FOR UPDATE',[digest(existingToken)]);
        if(row && !row.revoked_at && Number(row.user_id)===Number(grant.user_id) && row.client_id===clientId && row.account_fingerprint===accountFingerprint(context.user) && now().getTime()-new Date(row.last_used_at).getTime()<=DEVICE_IDLE_MS)existing=row;
        else if(row && !row.revoked_at)await revokeById(row.id,connection);
      }
      const token=existing?existingToken:opaqueToken();
      let deviceId;
      if(existing){
        deviceId=existing.id;
        await connection.execute('UPDATE mobile_device_sessions SET agency_id=?,last_used_at=?,enrolled_at=? WHERE id=?',[grant.agency_id,now(),now(),deviceId]);
        await connection.execute('UPDATE quick_view_sessions SET revoked_at=? WHERE mobile_device_session_id=? AND revoked_at IS NULL',[now(),deviceId]);
      }else{
        const [result]=await connection.execute(`INSERT INTO mobile_device_sessions
          (user_id,agency_id,token_hash,account_fingerprint,client_id,device_name,last_used_at,enrolled_at,app_lock_method)
          VALUES (?,?,?,?,?,?,?,?, 'code')`,[grant.user_id,grant.agency_id,digest(token),grant.account_fingerprint,clientId,String(deviceName || (clientId==='ios'?'iPhone':'Browser')).slice(0,120),now(),now()]);
        deviceId=result.insertId;
      }
      await connection.execute('UPDATE mobile_device_sessions SET primary_authentication_json=? WHERE id=?',[typeof grant.primary_authentication_json==='string'?grant.primary_authentication_json:grant.primary_authentication_json?JSON.stringify(grant.primary_authentication_json):null,deviceId]);
      await connection.execute('UPDATE mobile_authorization_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL',[now(),grant.id]);
      await connection.commit();
      enrollment={deviceToken:token,deviceId,newDevice:!existing};
    }catch(error){await connection.rollback();throw error;}finally{connection.release();}
    const context=await device(enrollment.deviceToken),initialAccountCode=await ensureAccountCode(context);
    return {...enrollment,...await issue(context),needsCode:false,...(initialAccountCode?{initialAccountCode}:{})};
  }
  async function revokeById(id, executor=db) {
    await executor.execute('UPDATE mobile_device_sessions SET revoked_at=?,push_enabled=0,push_token=NULL,web_push_subscription=NULL WHERE id=?',[now(),id]);
    await executor.execute('UPDATE quick_view_sessions SET revoked_at=? WHERE mobile_device_session_id=? AND revoked_at IS NULL',[now(),id]);
  }
  async function validateDevice(row) {
    if(!row || row.revoked_at || now().getTime()-new Date(row.last_used_at).getTime()>DEVICE_IDLE_MS)throw failure(401,'MOBILE_SIGN_IN_REQUIRED','Sign in to this device again.');
    const primary=parsePrimaryAuthentication(row.primary_authentication_json),primaryAt=primary?.issuedAt?primary.issuedAt*1000:new Date(row.enrolled_at).getTime();
    if(!Number.isFinite(primaryAt) || primaryAt>now().getTime()+300000 || now().getTime()-primaryAt>=PRIMARY_AUTH_MAX_AGE_MS){await revokeById(row.id);throw failure(401,'MOBILE_SIGN_IN_REQUIRED','Sign in with your password, SSO or passkey again. Primary sign-in is required every 30 days.');}
    let context;
    try{context=await actor(row.user_id,row.agency_id);}catch(error){await revokeById(row.id);throw error;}
    if(row.account_fingerprint!==accountFingerprint(context.user)){await revokeById(row.id);throw failure(401,'MOBILE_ACCOUNT_CHANGED','Sign in again after the account security change.');}
    if(db===pool){
      const [[revocation]]=await db.execute('SELECT reject_issued_before FROM user_auth_revocations WHERE user_id=?',[row.user_id]);
      const primary=parsePrimaryAuthentication(row.primary_authentication_json);
      const issuedAt=primary?.issuedAt || Math.floor(new Date(row.enrolled_at).getTime()/1000);
      if(Number(revocation?.reject_issued_before)>0 && (!Number.isFinite(issuedAt) || issuedAt<=Number(revocation.reject_issued_before))){await revokeById(row.id);throw failure(401,'MOBILE_ACCOUNT_CHANGED','Sign in again after the account security change.');}
    }
    return {device:row,...context};
  }
  async function device(raw) {
    if(!/^[A-Za-z0-9_-]{43}$/.test(String(raw || '')))throw failure(401,'MOBILE_SIGN_IN_REQUIRED','Sign in to this device.');
    const [[row]]=await db.execute('SELECT * FROM mobile_device_sessions WHERE token_hash=? LIMIT 1',[digest(raw)]);
    return validateDevice(row);
  }
  async function access(deviceId,userId,agencyId,expectedLockVersion=null) {
    const [[row]]=await db.execute('SELECT * FROM mobile_device_sessions WHERE id=? AND user_id=? AND agency_id=? LIMIT 1',[deviceId,userId,agencyId]);
    const context=await validateDevice(row);
    if(expectedLockVersion!==null && Number(expectedLockVersion)!==Number(row.app_lock_version || 0))throw failure(423,'MOBILE_LOCKED','Your app lock preference changed. Reopen this workspace.');
    return context;
  }
  function assertUnlocked(context) {
    const expiresAt=new Date(context.device.unlocked_until || 0);
    if(!Number.isFinite(expiresAt.getTime()) || expiresAt<=now())throw failure(423,'MOBILE_LOCKED','Your activity timer expired. Unlock with your account code, Face ID / Touch ID, or sign in again.');
    return expiresAt;
  }
  function primaryDeadline(row) {
    const primary=parsePrimaryAuthentication(row.primary_authentication_json);
    return new Date((primary?.issuedAt?primary.issuedAt*1000:new Date(row.enrolled_at).getTime())+PRIMARY_AUTH_MAX_AGE_MS);
  }
  async function recordActivity(context,{extendMinutes=null}={}) {
    const current=assertUnlocked(context),at=now();
    const requested=extendMinutes===null?at.getTime()+MOBILE_INACTIVITY_MS:current.getTime()+Math.max(1,Math.min(60,Number(extendMinutes)||10))*60000;
    const expiresAt=new Date(Math.floor(Math.min(Math.max(current.getTime(),requested),primaryDeadline(context.device).getTime())/1000)*1000);
    const [updated]=await db.execute(`UPDATE mobile_device_sessions SET unlocked_until=GREATEST(unlocked_until,?),last_used_at=? WHERE id=? AND revoked_at IS NULL AND app_lock_version=? AND unlocked_until>?`,[expiresAt,at,context.device.id,Number(context.device.app_lock_version||0),at]);
    if(updated.affectedRows!==1)throw failure(423,'MOBILE_LOCKED','Unlock AuricWell to continue.');
    // Return the stored value so overlapping activity/extension requests never shorten it.
    const [[row]]=await db.execute('SELECT unlocked_until FROM mobile_device_sessions WHERE id=?',[context.device.id]);
    return {expiresAt:new Date(row.unlocked_until)};
  }
  async function issue(context,{renewWindow=true}={}) {
    let expiresAt=renewWindow?new Date(Math.floor(Math.min(now().getTime()+MOBILE_INACTIVITY_MS,primaryDeadline(context.device).getTime())/1000)*1000):assertUnlocked(context);
    // Resume/switching context cannot revive a grant cleared by a simultaneous lock.
    const [updated]=renewWindow
      ?await db.execute('UPDATE mobile_device_sessions SET last_used_at=?,unlocked_until=? WHERE id=? AND revoked_at IS NULL AND app_lock_version=?',[now(),expiresAt,context.device.id,Number(context.device.app_lock_version || 0)])
      :await db.execute('UPDATE mobile_device_sessions SET last_used_at=? WHERE id=? AND revoked_at IS NULL AND app_lock_version=? AND unlocked_until>?',[now(),context.device.id,Number(context.device.app_lock_version || 0),now()]);
    if(updated.affectedRows!==1)throw failure(renewWindow?401:423,renewWindow?'MOBILE_SIGN_IN_REQUIRED':'MOBILE_LOCKED',renewWindow?'Sign in to this device again.':'Unlock AuricWell to continue.');
    if(!renewWindow){const [[row]]=await db.execute('SELECT unlocked_until FROM mobile_device_sessions WHERE id=?',[context.device.id]);expiresAt=assertUnlocked({device:row});}
    const session=await issueSession({userId:context.user.id,agencyId:context.workspace.id,mobileDeviceId:context.device.id,mobileDeviceVersion:Number(context.device.app_lock_version || 0),expiresAt});
    return {...session,expiresAt,profile:publicProfile(context)};
  }
  async function ensureAccountCode(context) {
    const [[credential]]=await db.execute('SELECT passcode_hash,passcode_set_at FROM user_quick_view_credentials WHERE user_id=? LIMIT 1',[context.user.id]);
    if(credential?.passcode_hash)return null;
    // The only caller has just exchanged a primary-authenticated PKCE grant.
    // Reuse the existing account credential and show a new random value once.
    if(db===pool){const {createInitialPasscode}=await import('../quickViewAuth.service.js');try{return (await createInitialPasscode({userId:context.user.id,agencyId:context.workspace.id})).passcode;}catch(error){if(error.status===409)return null;throw error;}}
    const {randomInt}=await import('node:crypto');const digits=String(randomInt(0,1000000)).padStart(6,'0'),encoded=await hash(digits);
    await db.execute('INSERT INTO user_quick_view_credentials(user_id,agency_id) VALUES(?,?) ON DUPLICATE KEY UPDATE user_id=user_id',[context.user.id,context.workspace.id]);
    const [saved]=await db.execute('UPDATE user_quick_view_credentials SET passcode_hash=?,passcode_set_at=?,passcode_version=passcode_version+1 WHERE user_id=? AND passcode_hash IS NULL',[encoded,now(),context.user.id]);return saved.affectedRows===1?digits:null;
  }
  async function setCode() {throw failure(403,'MOBILE_ACCOUNT_CODE_REQUIRED','Use your existing account Quick View code. Reset a forgotten code in authenticated account settings.');}
  async function unlock(raw,{code,biometric=false}={}) {
    const initial=await device(raw);
    if(biometric){
      if(initial.device.client_id!=='ios')throw failure(403,'MOBILE_NATIVE_ONLY','Use the quick access code in this browser.');
      if(lockInfo(initial.device).method!=='biometric')throw failure(403,'MOBILE_BIOMETRIC_NOT_ENABLED','Biometric app lock is not enabled on this device.');
      return issue(initial);
    }
    requireQuickCode(code);
    const connection=await db.getConnection();
    let accepted=false;
    try{
      await connection.beginTransaction();
      const [[row]]=await connection.execute('SELECT * FROM mobile_device_sessions WHERE id=? FOR UPDATE',[initial.device.id]);
      if(!row || row.revoked_at || row.code_attempts>=MAX_CODE_ATTEMPTS)throw failure(401,'MOBILE_SIGN_IN_REQUIRED','Sign in again to recover this device.');
      const [[credential]]=await connection.execute('SELECT passcode_hash,failed_passcode_attempts,passcode_locked_until FROM user_quick_view_credentials WHERE user_id=? FOR UPDATE',[row.user_id]);
      if(!credential?.passcode_hash)throw failure(409,'MOBILE_ACCOUNT_CODE_REQUIRED','Sign in and set up your account Quick View code in account settings.');
      if(Number(credential.failed_passcode_attempts || 0)>=3 || credential.passcode_locked_until && new Date(credential.passcode_locked_until)>now())throw failure(409,'MOBILE_ACCOUNT_CODE_LOCKED','Reset your account Quick View code in authenticated account settings.');
      accepted=await compare(code,credential.passcode_hash);
      if(accepted)await connection.execute('UPDATE user_quick_view_credentials SET failed_passcode_attempts=0,passcode_locked_until=NULL,last_passcode_ok_at=? WHERE user_id=?',[now(),row.user_id]);
      else {const failures=Number(credential.failed_passcode_attempts || 0)+1;await connection.execute('UPDATE user_quick_view_credentials SET failed_passcode_attempts=?,passcode_locked_until=? WHERE user_id=?',[failures,failures>=3?new Date('2099-12-31T23:59:59Z'):null,row.user_id]);}
      if(!accepted){
        const attempts=Number(row.code_attempts || 0)+1;
        await connection.execute('UPDATE mobile_device_sessions SET code_attempts=? WHERE id=?',[attempts,row.id]);
        if(attempts>=MAX_CODE_ATTEMPTS)await revokeById(row.id,connection);
      }else await connection.execute('UPDATE mobile_device_sessions SET code_attempts=0 WHERE id=?',[row.id]);
      await connection.commit();
    }catch(error){await connection.rollback();throw error;}finally{connection.release();}
    if(!accepted)throw failure(401,'MOBILE_UNLOCK_FAILED','The quick access code did not match.');
    return issue(await device(raw));
  }
  async function resume(raw,{sessionToken=null}={}) {
    const context=await device(raw),expiresAt=assertUnlocked(context);
    if(sessionToken){
      const [[session]]=await db.execute(`SELECT * FROM quick_view_sessions WHERE session_token_hash=? AND mobile_device_session_id=? AND user_id=? AND revoked_at IS NULL LIMIT 1`,[digest(sessionToken),context.device.id,context.user.id]);
      if(session && Number(session.credential_token_version)===Number(context.device.app_lock_version||0) && Number(session.agency_id)===Number(context.workspace.id) && new Date(session.expires_at)>now())return {sessionToken,userId:context.user.id,agencyId:context.workspace.id,expiresAt,profile:publicProfile(context)};
    }
    return issue(context,{renewWindow:false});
  }
  async function lock(raw) {
    const context=await device(raw);
    await db.execute('UPDATE mobile_device_sessions SET unlocked_until=NULL WHERE id=? AND revoked_at IS NULL',[context.device.id]);
    await db.execute('UPDATE quick_view_sessions SET revoked_at=? WHERE mobile_device_session_id=? AND revoked_at IS NULL',[now(),context.device.id]);
    return {locked:true};
  }
  async function configureLock(context,{method,code,biometricVerified=false}) {
    if(!['code','biometric'].includes(method))throw failure(400,'MOBILE_METHOD_INVALID','App lock is required. Choose your account Quick View code or Face ID / Touch ID.');
    if(method==='biometric' && (context.device.client_id!=='ios' || !biometricVerified))throw failure(403,'MOBILE_NATIVE_ONLY','Confirm Face ID or Touch ID in the native app first.');
    if(method==='code'){
      requireQuickCode(code);const [[credential]]=await db.execute('SELECT passcode_hash,failed_passcode_attempts,passcode_locked_until FROM user_quick_view_credentials WHERE user_id=? LIMIT 1',[context.user.id]);
      if(!credential?.passcode_hash || Number(credential.failed_passcode_attempts || 0)>=3 || credential.passcode_locked_until && new Date(credential.passcode_locked_until)>now() || !await compare(code,credential.passcode_hash))throw failure(403,'MOBILE_ACCOUNT_CODE_REQUIRED','Enter your existing account Quick View code. Reset it in authenticated account settings if forgotten.');
    }
    const [result]=await db.execute('UPDATE mobile_device_sessions SET app_lock_method=?,quick_code_hash=NULL,code_attempts=0,app_lock_version=app_lock_version+1 WHERE id=? AND revoked_at IS NULL',[method,context.device.id]);
    if(result.affectedRows!==1)throw failure(401,'MOBILE_SIGN_IN_REQUIRED','Sign in to this device again.');
    await db.execute('UPDATE quick_view_sessions SET revoked_at=? WHERE mobile_device_session_id=? AND revoked_at IS NULL',[now(),context.device.id]);
    return issue(await access(context.device.id,context.user.id,context.workspace.id));
  }
  async function logout(raw) {
    if(!raw)return;
    const [[row]]=await db.execute('SELECT id FROM mobile_device_sessions WHERE token_hash=? LIMIT 1',[digest(raw)]);
    if(row)await revokeById(row.id);
  }
  async function switchWorkspace(context,agencyId) {
    if(!agencyId)throw failure(400,'MOBILE_WORKSPACE_INVALID','Choose a workspace.');
    const next=await actor(context.user.id,agencyId);
    await db.execute('UPDATE quick_view_sessions SET revoked_at=? WHERE mobile_device_session_id=? AND revoked_at IS NULL',[now(),context.device.id]);
    await db.execute('UPDATE mobile_device_sessions SET agency_id=? WHERE id=? AND revoked_at IS NULL',[Number(agencyId),context.device.id]);
    return issue({...next,device:{...context.device,agency_id:Number(agencyId)}},{renewWindow:false});
  }
  return {actor,publicProfile,lockInfo,authorize,exchange,device,access,assertUnlocked,recordActivity,setCode,unlock,resume,lock,configureLock,logout,switchWorkspace};
}
export const mobileSessions=createMobileSessionService();
