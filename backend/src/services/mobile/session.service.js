import bcrypt from 'bcrypt';
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import { assertAccountEnabled } from '../../utils/accountAccess.js';
import { assertHireStaffAccess } from '../hireStaffAccess.service.js';
import { assertFullSuiteIdentity } from '../productIdentity.service.js';
import { buildPublicPortalLoginUrl } from '../../utils/publicPortalUrl.js';
import { startAuthenticatedMobileSession } from '../quickViewAuth.service.js';
import { accountFingerprint, digest, opaqueToken, validClient, validChallenge, verifyChallenge, requireQuickCode, failure, STAFF_ROLES, MAX_CODE_ATTEMPTS, DEVICE_IDLE_MS } from './policy.js';

export function createMobileSessionService({ db=pool, findUser=id=>User.findById(id), assertStaff=assertHireStaffAccess, assertProduct=assertFullSuiteIdentity, issueSession=startAuthenticatedMobileSession, compare=bcrypt.compare, hash=code=>bcrypt.hash(code,12), now=()=>new Date() }={}) {
  async function actor(userId, agencyId=null) {
    if(!Number.isSafeInteger(Number(userId)) || Number(userId)<=0 || agencyId!==null && (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId)<=0))throw failure(400,'MOBILE_WORKSPACE_INVALID','Choose a valid workspace.');
    const user=await findUser(Number(userId));
    assertAccountEnabled(user);
    await assertProduct(userId); await assertStaff({id:Number(userId)});
    if(user.is_demo || !STAFF_ROLES.has(String(user.role || '').toLowerCase()) || user.status_expires_at && new Date(user.status_expires_at)<=now()) throw failure(403,'MOBILE_ACCOUNT_UNAVAILABLE','This account cannot use the staff mobile workspace.');
    const [agencyRows]=await db.execute(`SELECT a.* FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id
      WHERE ua.user_id=? AND ua.is_active=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 ORDER BY a.name`,[Number(userId)]);
    const agencies=agencyRows.map(a=>({id:a.id,name:a.name,portal_url:a.portal_url,loginUrl:buildPublicPortalLoginUrl(a)}));
    const workspace=agencyId ? agencies.find(a=>Number(a.id)===Number(agencyId)) : null;
    if(agencyId && !workspace) throw failure(403,'MOBILE_WORKSPACE_UNAVAILABLE','Your access to this workspace has changed.');
    return {user,agencies,workspace};
  }
  function publicProfile(context) {
    const {user,agencies,workspace}=context;
    return {user:{id:user.id,firstName:user.first_name || '',lastName:user.last_name || '',email:user.email,role:user.role},agencies,workspace};
  }
  async function authorize({userId,agencyId,clientId,redirectUri,challenge}) {
    validClient(clientId,redirectUri);validChallenge(challenge);
    if(!agencyId)throw failure(400,'MOBILE_WORKSPACE_INVALID','Choose a workspace.');
    const context=await actor(userId,agencyId);
    const code=opaqueToken();
    await db.execute(`INSERT INTO mobile_authorization_codes (code_hash,user_id,agency_id,client_id,redirect_uri,code_challenge,account_fingerprint,expires_at)
      VALUES (?,?,?,?,?,?,?,?)`,[digest(code),Number(userId),Number(agencyId),clientId,redirectUri,challenge,accountFingerprint(context.user),new Date(now().getTime()+300000)]);
    return {code,redirectUri};
  }
  async function exchange({code,verifier,clientId,redirectUri,deviceName}) {
    validClient(clientId,redirectUri);
    if(!/^[A-Za-z0-9_-]{43}$/.test(String(code || '')))throw failure(401,'MOBILE_CODE_EXPIRED','Restart sign-in to this device.');
    const connection=await db.getConnection();
    try{
      await connection.beginTransaction();
      const [[grant]]=await connection.execute('SELECT * FROM mobile_authorization_codes WHERE code_hash=? FOR UPDATE',[digest(code)]);
      if(!grant || grant.consumed_at || new Date(grant.expires_at)<=now() || grant.client_id!==clientId || grant.redirect_uri!==redirectUri || !verifyChallenge(verifier,grant.code_challenge))throw failure(401,'MOBILE_CODE_EXPIRED','Restart sign-in to this device.');
      const context=await actor(grant.user_id,grant.agency_id);
      if(grant.account_fingerprint!==accountFingerprint(context.user))throw failure(401,'MOBILE_ACCOUNT_CHANGED','Sign in again after the account security change.');
      const token=opaqueToken();
      const [result]=await connection.execute(`INSERT INTO mobile_device_sessions
        (user_id,agency_id,token_hash,account_fingerprint,client_id,device_name,last_used_at,enrolled_at)
        VALUES (?,?,?,?,?,?,?,?)`,[grant.user_id,grant.agency_id,digest(token),grant.account_fingerprint,clientId,String(deviceName || (clientId==='ios'?'iPhone':'Browser')).slice(0,120),now(),now()]);
      await connection.execute('UPDATE mobile_authorization_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL',[now(),grant.id]);
      await connection.commit();
      return {deviceToken:token,deviceId:result.insertId,needsCode:true,workspace:context.workspace};
    }catch(error){await connection.rollback();throw error;}finally{connection.release();}
  }
  async function revokeById(id, executor=db) {
    await executor.execute('UPDATE mobile_device_sessions SET revoked_at=?,push_enabled=0,push_token=NULL,web_push_subscription=NULL WHERE id=?',[now(),id]);
    await executor.execute('UPDATE quick_view_sessions SET revoked_at=? WHERE mobile_device_session_id=? AND revoked_at IS NULL',[now(),id]);
  }
  async function validateDevice(row) {
    if(!row || row.revoked_at || now().getTime()-new Date(row.last_used_at).getTime()>DEVICE_IDLE_MS)throw failure(401,'MOBILE_SIGN_IN_REQUIRED','Sign in to this device again.');
    let context;
    try{context=await actor(row.user_id,row.agency_id);}catch(error){await revokeById(row.id);throw error;}
    if(row.account_fingerprint!==accountFingerprint(context.user)){await revokeById(row.id);throw failure(401,'MOBILE_ACCOUNT_CHANGED','Sign in again after the account security change.');}
    return {device:row,...context};
  }
  async function device(raw) {
    if(!/^[A-Za-z0-9_-]{43}$/.test(String(raw || '')))throw failure(401,'MOBILE_SIGN_IN_REQUIRED','Sign in to this device.');
    const [[row]]=await db.execute('SELECT * FROM mobile_device_sessions WHERE token_hash=? LIMIT 1',[digest(raw)]);
    return validateDevice(row);
  }
  async function access(deviceId,userId,agencyId) {
    const [[row]]=await db.execute('SELECT * FROM mobile_device_sessions WHERE id=? AND user_id=? AND agency_id=? LIMIT 1',[deviceId,userId,agencyId]);
    return validateDevice(row);
  }
  async function issue(context) {
    const [updated]=await db.execute('UPDATE mobile_device_sessions SET last_used_at=? WHERE id=? AND revoked_at IS NULL',[now(),context.device.id]);
    if(updated.affectedRows!==1)throw failure(401,'MOBILE_SIGN_IN_REQUIRED','Sign in to this device again.');
    const session=await issueSession({userId:context.user.id,agencyId:context.workspace.id,mobileDeviceId:context.device.id});
    return {...session,profile:publicProfile(context)};
  }
  async function setCode(raw,code) {
    const context=await device(raw);requireQuickCode(code);
    if(context.device.quick_code_hash || now().getTime()-new Date(context.device.enrolled_at).getTime()>300000)throw failure(403,'MOBILE_PRIMARY_REQUIRED','Sign in again to change this device’s quick access code.');
    const encoded=await hash(code);
    const [result]=await db.execute('UPDATE mobile_device_sessions SET quick_code_hash=? WHERE id=? AND quick_code_hash IS NULL AND revoked_at IS NULL',[encoded,context.device.id]);
    if(result.affectedRows!==1)throw failure(409,'MOBILE_CODE_ALREADY_SET','This device’s code is already configured.');
    return issue({...context,device:{...context.device,quick_code_hash:encoded}});
  }
  async function unlock(raw,{code,biometric=false}={}) {
    const initial=await device(raw);
    if(biometric){
      if(initial.device.client_id!=='ios')throw failure(403,'MOBILE_NATIVE_ONLY','Use the quick access code in this browser.');
      if(!initial.device.quick_code_hash)throw failure(409,'MOBILE_SETUP_REQUIRED','Set up a quick access code first.');
      return issue(initial);
    }
    requireQuickCode(code);
    const connection=await db.getConnection();
    let accepted=false;
    try{
      await connection.beginTransaction();
      const [[row]]=await connection.execute('SELECT * FROM mobile_device_sessions WHERE id=? FOR UPDATE',[initial.device.id]);
      if(!row || row.revoked_at || row.code_attempts>=MAX_CODE_ATTEMPTS)throw failure(401,'MOBILE_SIGN_IN_REQUIRED','Sign in again to recover this device.');
      if(!row.quick_code_hash)throw failure(409,'MOBILE_SETUP_REQUIRED','Set up a quick access code first.');
      accepted=await compare(code,row.quick_code_hash);
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
    return issue({...next,device:{...context.device,agency_id:Number(agencyId)}});
  }
  return {actor,publicProfile,authorize,exchange,device,access,setCode,unlock,logout,switchWorkspace};
}
export const mobileSessions=createMobileSessionService();
