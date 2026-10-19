import crypto from 'node:crypto';
import { pool, seal, open, transaction } from './repository.js';
import { fail, hash } from './policy.js';
import { platformIntegrations, recordNotifyreWebhookVerified } from './platformIntegrations.js';
import { phoneKey, smsCommand } from './clientMessagingPolicy.js';
import { notifyreRequest, notifyreReceipt } from './sessionTransports.js';
import { CONSENT_VERSION, CONSENT_TEXT, VERIFICATION_LINKS, assertVerificationReady, verificationScope, consentPhone, codeDigest, verificationMessage } from './verificationSmsPolicy.js';
const accountContext=id=>`auricwell:auth:sms:${id}`;
const challengeContext=id=>`auricwell:auth:sms:challenge:${id}`;
const genericRecovery='If this account has text verification enabled, a recovery code will be sent to its verified mobile number.';
async function accountSms(id,db=pool) {
  const [[row]]=await db.execute('SELECT * FROM auricwell_auth_sms WHERE account_id=?',[id]);
  return row && {...row,data:open(row.payload,accountContext(id))};
}
async function blocked(key,db=pool,lock=false) {
  if(lock) await db.execute('INSERT IGNORE INTO auricwell_sms_phone_state (phone_key) VALUES (?)',[key]);
  const [[r]]=await db.execute(`SELECT blocked FROM auricwell_sms_phone_state WHERE phone_key=?${lock?' FOR UPDATE':''}`,[key]);
  return !!r?.blocked;
}
export async function verificationInfo() {
  const {settings}=await platformIntegrations(); let available=false;
  try {assertVerificationReady(settings);available=true;}catch{/* Enrollment remains viewable before carrier activation. */}
  return {available,consentVersion:CONSENT_VERSION,consentText:CONSENT_TEXT,...VERIFICATION_LINKS,brand:'AuricWell',supportEmail:'Support@plottwistco.com',supportPhone:'833-756-8894'};
}
export async function verificationStatus(ctx) {
  const info=await verificationInfo(), enrollment=await accountSms(ctx.accountId);
  const {settings}=await platformIntegrations();
  return {...info,enrolled:!!enrollment?.enabled,phone:enrollment?.data.phone||'',stopped:enrollment?await blocked(enrollment.phone_key):false,
    scopeChanged:!!enrollment&&enrollment.data.scope!==verificationScope(settings.verificationSms),verified:ctx.verified,
    needsExistingFactor:!ctx.verified&&(ctx.mfaEnabled||!!enrollment?.enabled)};
}
async function audit(db,id,action) {await db.execute('INSERT INTO auricwell_auth_sms_audit (account_id,action) VALUES (?,?)',[id,action]);}
// Every send is a direct user request. The database claim and cooldown survive retries,
// restarts and additional Cloud Run instances. No worker retries ambiguous OTP sends.
export async function requestVerification(ctx,input,{send}={}) {
  if(!['enroll','signin','recovery'].includes(input.purpose)) throw fail(400,'Choose a verification purpose.');
  const {settings}=await platformIntegrations(), config=assertVerificationReady(settings);
  const enrollment=await accountSms(ctx.accountId);
  let phone;
  if(input.purpose==='enroll') {
    if((ctx.mfaEnabled||enrollment?.enabled)&&!ctx.verified) throw fail(403,'Verify using your existing security method before changing the mobile number.');
    phone=consentPhone(input);
  } else {
    if(!enrollment?.enabled || enrollment.data.scope!==verificationScope(config)) throw fail(409,'Set up text verification from your account first.');
    if(input.consent!==true || input.consentVersion!==CONSENT_VERSION) throw fail(400,'Select the verification-text consent box.');
    phone=enrollment.data.phone;
  }
  const id=crypto.randomUUID(), code=crypto.randomInt(0,1000000).toString().padStart(6,'0'), key=phoneKey(phone);
  const payload={phone,scope:verificationScope(config),consentVersion:CONSENT_VERSION,consentText:CONSENT_TEXT,consentAt:new Date().toISOString(),from:config.from};
  await transaction(async db=>{
    if(await blocked(key,db,true)) throw fail(409,`Verification texts are stopped. Text START to ${config.from} to restore them, or use another security method.`);
    const [[account]]=await db.execute('SELECT status,mfa_counter FROM auricwell_accounts WHERE id=? FOR UPDATE',[ctx.accountId]);
    if(account?.status!=='active') throw fail(403,'Account unavailable.');
    const fresh=await accountSms(ctx.accountId,db);
    if(input.purpose==='enroll' && (Number(account.mfa_counter)>=0||fresh?.enabled) && !ctx.verified) throw fail(403,'Verify your existing security method first.');
    if(input.purpose!=='enroll' && (!fresh?.enabled||fresh.phone_key!==key||fresh.data.scope!==payload.scope)) throw fail(409,'Text verification changed. Start again.');
    const [[limits]]=await db.execute(`SELECT COUNT(*) AS total, SUM(created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 60 SECOND)) AS recent,
      SUM(IF(created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE),attempts,0)) AS failures
      FROM auricwell_auth_sms_challenges WHERE (account_id=? OR phone_key=?) AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY)`,[ctx.accountId,key]);
    if(Number(limits.recent)>0||Number(limits.total)>=10||Number(limits.failures)>=10) throw fail(429,'Please wait before requesting another code. Use another security method if needed.');
    // Retire earlier codes across sessions so a resend cannot leave old codes usable.
    await db.execute('UPDATE auricwell_auth_sms_challenges SET consumed_at=UTC_TIMESTAMP(3) WHERE account_id=? AND consumed_at IS NULL',[ctx.accountId]);
    await db.execute(`INSERT INTO auricwell_auth_sms_challenges (id,account_id,session_hash,phone_key,purpose,code_hash,payload,expires_at)
      VALUES (?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))`,[id,ctx.accountId,input.purpose==='recovery'?null:ctx.sessionHash,key,input.purpose,codeDigest(id,code),seal(payload,challengeContext(id))]);
    await audit(db,ctx.accountId,`sms.${input.purpose}_requested`);
  });
  try {
    const body={From:config.from,Body:verificationMessage(input.purpose,code),Recipients:[{type:'mobile_number',value:phone}],AddUnsubscribeLink:false};
    const receipt=send?await send(body):notifyreReceipt(await notifyreRequest(settings.notifyre.apiToken,'/sms/send',body));
    await pool.execute("UPDATE auricwell_auth_sms_challenges SET status='sent',provider_id=? WHERE id=?",[receipt,id]);
    return {challengeId:id,message:input.purpose==='recovery'?genericRecovery:'Check your phone for a six-digit code. It expires in 10 minutes.'};
  }catch{
    await pool.execute("UPDATE auricwell_auth_sms_challenges SET status='uncertain' WHERE id=? AND status='sending'",[id]);
    // The carrier may have accepted the request. An arriving valid code still works.
    return {challengeId:id,message:'Delivery has not been confirmed. If a code arrives, enter it below. Wait at least a minute before requesting another.'};
  }
}
export async function requestRecovery(input,deps={}) {
  if(input.consent!==true||input.consentVersion!==CONSENT_VERSION) throw fail(400,'Select the verification-text consent box.');
  const {settings}=await platformIntegrations();assertVerificationReady(settings);
  const [[a]]=await pool.execute('SELECT id FROM auricwell_accounts WHERE username=? AND status=?',[String(input.username||'').trim().toLowerCase().slice(0,80),'active']);
  let result;
  if(a)try {result=await requestVerification({accountId:a.id},{...input,purpose:'recovery'},deps);}catch{/* Do not disclose account existence, phone, opt-out or throttling. */}
  return {challengeId:result?.challengeId||crypto.randomUUID(),message:genericRecovery};
}
export async function verifyCode(ctx,input,recovery=false) {
  if(!/^[0-9a-f-]{36}$/i.test(input.challengeId||'')||!/^\d{6}$/.test(input.code||'')) throw fail(400,'Enter the six-digit verification code.');
  const {settings}=await platformIntegrations();const config=assertVerificationReady(settings);
  const result=await transaction(async db=>{
    const [[candidate]]=await db.execute('SELECT account_id,phone_key FROM auricwell_auth_sms_challenges WHERE id=?',[input.challengeId]);
    if(!candidate || (!recovery&&candidate.account_id!==ctx.accountId)) return {error:fail(400,'This code is invalid or expired. Request another code.')};
    // Consistent phone -> account -> challenge lock ordering also serializes STOP.
    if(await blocked(candidate.phone_key,db,true)) return {error:fail(409,'Verification texts are stopped. Use another security method.')};
    const [[a]]=await db.execute('SELECT status,mfa_counter FROM auricwell_accounts WHERE id=? FOR UPDATE',[candidate.account_id]);
    const [[r]]=await db.execute('SELECT * FROM auricwell_auth_sms_challenges WHERE id=? FOR UPDATE',[input.challengeId]);
    if(a?.status!=='active'||r.consumed_at||new Date(r.expires_at)<=new Date()||r.attempts>=5||!['sent','uncertain'].includes(r.status)
      ||(recovery?r.purpose!=='recovery':r.purpose==='recovery'||r.session_hash!==ctx.sessionHash)) return {error:fail(400,'This code is invalid or expired. Request another code.')};
    const data=open(r.payload,challengeContext(r.id));
    if(data.scope!==verificationScope(config)) return {error:fail(409,'Text verification settings changed. Request another code.')};
    const existing=await accountSms(r.account_id,db);
    if(r.purpose==='enroll'&&(Number(a.mfa_counter)>=0||existing?.enabled)&&!ctx.verified) return {error:fail(403,'Verify your existing security method before changing the mobile number.')};
    if(r.purpose!=='enroll'&&(!existing?.enabled||existing.phone_key!==r.phone_key||existing.data.scope!==data.scope)) return {error:fail(409,'Text verification changed. Start again.')};
    if(!crypto.timingSafeEqual(Buffer.from(codeDigest(r.id,input.code),'hex'),Buffer.from(r.code_hash,'hex'))) {
      await db.execute('UPDATE auricwell_auth_sms_challenges SET attempts=attempts+1 WHERE id=?',[r.id]);
      return {error:fail(400,'That code is incorrect. Try again.')};
    }
    if(!recovery) {
      const [[session]]=await db.execute('SELECT token_hash FROM auricwell_sessions WHERE token_hash=? AND account_id=? AND expires_at>UTC_TIMESTAMP(3) AND last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 20 MINUTE)',[ctx.sessionHash,r.account_id]);
      if(!session) return {error:fail(401,'Sign in again before verifying.')};
    }
    await db.execute('UPDATE auricwell_auth_sms_challenges SET consumed_at=UTC_TIMESTAMP(3) WHERE account_id=? AND consumed_at IS NULL',[r.account_id]);
    if(r.purpose==='enroll') await db.execute(`INSERT INTO auricwell_auth_sms (account_id,phone_key,payload) VALUES (?,?,?) ON DUPLICATE KEY UPDATE phone_key=VALUES(phone_key),payload=VALUES(payload),enabled=TRUE,updated_at=UTC_TIMESTAMP(3)`,[r.account_id,r.phone_key,seal({...data,verifiedAt:new Date().toISOString()},accountContext(r.account_id))]);
    await audit(db,r.account_id,`sms.${r.purpose}_verified`);
    if(recovery) {
      const token=crypto.randomBytes(32).toString('hex');
      await db.execute("INSERT INTO auricwell_account_tokens (token_hash,account_id,purpose,expires_at) VALUES (?,?,'recovery',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))",[hash(token),r.account_id]);
      return {accountToken:token}; // Password reset preserves MFA; no signed-in session is created.
    }
    await db.execute('UPDATE auricwell_sessions SET mfa_verified=1 WHERE token_hash=? AND account_id=?',[ctx.sessionHash,r.account_id]);
    return {verified:true};
  });
  if(result.error)throw result.error;return result;
}
export async function disableVerification(ctx) {
  if(!ctx.verified) throw fail(403,'Verify your account before turning off text verification.');
  await transaction(async db=>{
    await db.execute('SELECT id FROM auricwell_accounts WHERE id=? FOR UPDATE',[ctx.accountId]);
    await db.execute('UPDATE auricwell_auth_sms SET enabled=FALSE,updated_at=UTC_TIMESTAMP(3) WHERE account_id=?',[ctx.accountId]);
    await db.execute('UPDATE auricwell_auth_sms_challenges SET consumed_at=UTC_TIMESTAMP(3) WHERE account_id=? AND consumed_at IS NULL',[ctx.accountId]);
    await audit(db,ctx.accountId,'sms.disabled');
  });
  return {disabled:true};
}
export async function acceptVerificationEvent(settings,event) {
  const config=settings.verificationSms;
  if(event.type==='delivery') {
    const [[r]]=await pool.execute('SELECT id FROM auricwell_auth_sms_challenges WHERE provider_id=?',[event.id]);
    if(!r)return false;
    // Receipts must never expose the verification code in the clinical inbox.
    return true;
  }
  if(!config?.from||event.to!==config.from)return false;
  const command=smsCommand(event.body);
  // Notifyre sends the approved standard START/STOP/HELP replies; no duplicate reply.
  // Ignore other text: verification numbers do not create clinical conversations.
  if(['stop','start'].includes(command?.type)) await transaction(async db=>{
    await blocked(phoneKey(event.from),db,true);
    const [[r]]=await db.execute('SELECT command_at FROM auricwell_sms_phone_state WHERE phone_key=?',[phoneKey(event.from)]);
    if(event.at<Number(r.command_at)||(event.at===Number(r.command_at)&&command.type==='start'))return;
    await db.execute('UPDATE auricwell_sms_phone_state SET blocked=?,command_at=?,updated_at=UTC_TIMESTAMP(3) WHERE phone_key=?',[command.type==='stop',event.at,phoneKey(event.from)]);
    if(command.type==='stop') {
      await db.execute('UPDATE auricwell_auth_sms_challenges SET consumed_at=UTC_TIMESTAMP(3) WHERE phone_key=? AND consumed_at IS NULL',[phoneKey(event.from)]);
      await db.execute("UPDATE auricwell_sms_outbox o JOIN auricwell_sms_contacts c ON c.id=o.contact_id SET o.status='suppressed' WHERE c.phone_key=? AND o.status='queued'",[phoneKey(event.from)]);
    }
  });
  await recordNotifyreWebhookVerified();return true;
}
