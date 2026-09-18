import pool from '../config/database.js';
import { networkEvidence } from '../utils/securityEvidence.js';
import { resourceReference, recordProtectionAlert } from '../services/activityProtection.service.js';
import { mirrorSecurityEvidence } from '../services/securityEvidence.service.js';

export async function reserveLoginAttempts(req,{identify=false}={}) {
 const network=networkEvidence(req);
 const source=network.ipSource==='verified_google_lb'||network.ipSource==='direct_peer'?network.clientIp:network.peerIp;
 const identifier=String(req.body?.username||req.body?.email||'').trim().toLowerCase().slice(0,320);
 const prefix=identify?'identify':'password';
 const buckets=[{key:`${prefix}:source:${source||'unknown'}`,max:identify?150:100},
  {key:`${prefix}:account:${identifier}`,max:identify?50:20},
  {key:`${prefix}:pair:${source}:${identifier}`,max:identify?30:5}].map(b=>({...b,key:resourceReference(b.key)})).sort((a,b)=>a.key.localeCompare(b.key));
 const db=await pool.getConnection();let committed=false,denied=false,alert;
 try{
  await db.beginTransaction();
  for(const b of buckets){
   await db.execute('INSERT INTO auth_attempt_windows (bucket_key,attempts,expires_at) VALUES (?,0,UTC_TIMESTAMP(3)+INTERVAL 15 MINUTE) ON DUPLICATE KEY UPDATE bucket_key=VALUES(bucket_key)',[b.key]);
   const [[row]]=await db.execute('SELECT attempts,expires_at,expires_at<=UTC_TIMESTAMP(3) expired FROM auth_attempt_windows WHERE bucket_key=? FOR UPDATE',[b.key]);
   const attempts=row.expired?1:Math.min(Number(row.attempts)+1,1000000);
   await db.execute('UPDATE auth_attempt_windows SET attempts=?,expires_at=IF(expires_at<=UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)+INTERVAL 15 MINUTE,expires_at) WHERE bucket_key=?',[attempts,b.key]);
   if(attempts>b.max)denied=true;
  }
  if(denied)alert=await recordProtectionAlert(db,req,{kind:'login',reason:'login_throttled',units:1});
  await db.commit();committed=true;if(alert)mirrorSecurityEvidence(alert,alert.eventId);
 }catch(e){if(!committed)await db.rollback();throw e;}finally{db.release();}
 return !denied;
}
export const sharedLoginLimiter = (options={}) => async(req,res,next)=>{try{
 if(!await reserveLoginAttempts(req,options)){res.setHeader('Retry-After','900');return res.status(429).json({error:{code:'LOGIN_THROTTLED',message:'Too many sign-in attempts. Please try again later.'}});}next();
}catch(e){next(Object.assign(new Error('Sign-in protection is unavailable. Please retry shortly.'),{status:503,code:'LOGIN_PROTECTION_UNAVAILABLE'}));}};

export async function accountPasswordLocked(userId){
 const [[row]]=await pool.execute('SELECT locked_until>UTC_TIMESTAMP(3) locked FROM users WHERE id=?',[userId]);
 return !!row?.locked;
}
export async function recordPasswordResult(userId,valid){
 const db=await pool.getConnection();try{await db.beginTransaction();
 const [[row]]=await db.execute('SELECT failed_login_attempts,locked_until,locked_until>UTC_TIMESTAMP(3) locked FROM users WHERE id=? FOR UPDATE',[userId]);
 if(!row)throw new Error('Account not found');
 if(row.locked){await db.commit();return false;}
 const count=valid?0:row.locked_until?1:Number(row.failed_login_attempts||0)+1;
 await db.execute('UPDATE users SET failed_login_attempts=?,locked_until=? WHERE id=?',[count,count>=10?new Date(Date.now()+24*3600000):null,userId]);
 await db.commit();return count<10;
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
