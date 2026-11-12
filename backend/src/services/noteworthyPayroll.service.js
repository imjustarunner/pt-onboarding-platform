import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import { validatePasswordStrength } from '../utils/passwordValidation.js';
import { isProBonoServiceCode } from '../utils/clinicalFundingPolicy.js';
import { newNoteworthyToken, noteworthyTokenHash } from './noteworthyRoster.service.js';

const fail = (status, code, message, extra={}) => Object.assign(new Error(message),{status,code,...extra});
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const ymd = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10);
const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const planIntent=value=>{if(value===undefined)return 'essential';if(!['essential','growth','enterprise'].includes(value))throw fail(400,'INVALID_PLAN','Choose a NoteWorthy Payroll plan.');return value;};
export function noteworthyEmail(value) {
  const email=String(value || '').trim().toLowerCase();
  if (email.length>254 || !emailPattern.test(email)) throw fail(400,'INVALID_EMAIL','Enter a valid email address.');
  return email;
}
export function noteworthyText(value,max,label) {
  if (typeof value!=='string' || !value.trim() || value.trim().length>max || /[\u0000-\u001f]/.test(value)) throw fail(400,'INVALID_FIELD',`Enter ${label} (up to ${max} characters).`);
  return value.trim();
}
export function noteworthyDate(value) {
  if (!/^\d{4}-\d\d-\d\d$/.test(String(value || '')) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value) throw fail(400,'INVALID_DATE','Enter a valid date in YYYY-MM-DD format.');
  return value;
}
export function noteworthyRates(input) {
  if (!Array.isArray(input) || !input.length || input.length>150) throw fail(400,'INVALID_RATES','Provide between 1 and 150 service-code rates.');
  const seen=new Set();
  return input.map(r=>{
    if(!r || typeof r!=='object' || Array.isArray(r))throw fail(400,'INVALID_RATE','Enter a valid service-code rate.');
    const serviceCode=noteworthyText(r.serviceCode,64,'a service code');
    if (seen.has(serviceCode.toLowerCase())) throw fail(400,'DUPLICATE_RATE','Each service code must appear once.');
    seen.add(serviceCode.toLowerCase());
    const rateAmount=Number(r.rateAmount);
    if (!['number','string'].includes(typeof r.rateAmount) || String(r.rateAmount).trim()==='' || !Number.isFinite(rateAmount) || rateAmount<0 || rateAmount>100000) throw fail(400,'INVALID_RATE','Enter a rate of zero or greater; zero explicitly means unpaid.');
    const rateUnit=r.rateUnit || 'per_unit';
    if (!['per_unit','per_hour'].includes(rateUnit)) throw fail(400,'INVALID_RATE_UNIT','Choose per unit or per hour.');
    const effectiveStart=noteworthyDate(r.effectiveStart);
    return {serviceCode,rateAmount:isProBonoServiceCode(serviceCode)?0:rateAmount,rateUnit,effectiveStart};
  });
}

async function defaultSend({to,subject,text,templateType}) {
  const { default: accountEmail } = await import('./noteworthyAccountEmail.service.js');
  return accountEmail.send({to,subject,text,templateType});
}

export function createNoteworthyPayrollService({db=pool,send=defaultSend,hashPassword=p=>bcrypt.hash(p,12),validatePassword=validatePasswordStrength,now=()=>new Date()}={}) {
  const rows=async(sql,args=[],executor=db)=>(await executor.execute(sql,args))[0];
  async function transaction(fn) {
    const conn=await db.getConnection();
    try { await conn.beginTransaction(); const result=await fn(conn); await conn.commit(); return result; }
    catch(e) { await conn.rollback(); throw e; } finally {conn.release();}
  }
  const expires=()=>new Date(now().getTime()+24*60*60*1000);
  function portalUrl(path,token) {
    // No request Origin/Host is used: verification links cannot be host-poisoned.
    const configured=process.env.NOTEWORTHY_PUBLIC_URL || 'https://fundthred.com';
    const base=new URL(configured);
    if (base.protocol!=='https:' && !['localhost','127.0.0.1'].includes(base.hostname)) throw fail(503,'PORTAL_URL_INVALID','Account email delivery is not configured.');
    return `${base.origin}/noteworthy/${path}#token=${encodeURIComponent(token)}`;
  }
  async function deliver(to,token,kind,practiceName='') {
    try { return await send({to,subject:kind==='verify'?'Verify your NoteWorthy Payroll account':'Your NoteWorthy Payroll employee invitation',templateType:kind==='verify'?'noteworthy_email_verification':'noteworthy_employee_invitation',text:kind==='verify'
      ?`Confirm the email address you supplied to create your NoteWorthy Payroll workspace:\n\n${portalUrl('verify',token)}\n\nThis link expires in 24 hours. If you did not request an account, ignore this message.`
      :`${practiceName} has invited you to view your own posted payroll statements in NoteWorthy Payroll.\n\n${portalUrl('accept-invite',token)}\n\nThis link expires in 24 hours. Existing account holders must sign in before accepting. No client records are included in this email.`}); }
    catch { return {sent:false,pending:false}; }
  }
  async function signup(input) {
    const email=noteworthyEmail(input.email),practiceName=noteworthyText(input.practiceName,160,'your practice name'),firstName=noteworthyText(input.firstName,100,'your first name'),lastName=noteworthyText(input.lastName,100,'your last name'),plan=planIntent(input.plan);
    if (Buffer.byteLength(String(input.password || ''))>72) throw fail(400,'INVALID_PASSWORD','Use a password of at most 72 bytes.');
    const valid=await validatePassword(input.password,{accountId:email});
    if (!valid.valid) throw fail(400,'INVALID_PASSWORD',valid.message);
    const [existing]=await rows('SELECT id FROM users WHERE LOWER(email)=? LIMIT 1',[email]);
    if (existing) throw fail(409,'ACCOUNT_EXISTS','An account already uses this email. Sign in to create your practice workspace.');
    const token=newNoteworthyToken(),passwordHash=await hashPassword(input.password);
    try { await rows(`INSERT INTO noteworthy_signups(email,practice_name,first_name,last_name,password_hash,token_hash,expires_at,plan_intent)
      VALUES(?,?,?,?,?,?,?,?)`,[email,practiceName,firstName,lastName,passwordHash,noteworthyTokenHash(token),expires(),plan]); }
    catch(e) { if (e.code==='ER_DUP_ENTRY') throw fail(409,'VERIFICATION_PENDING','An account request already exists. Use Resend verification.'); throw e; }
    const delivery=await deliver(email,token,'verify');
    return {verificationRequired:true,verificationSent:!!delivery.sent,deliveryPending:!!delivery.pending,message:delivery.sent?'Check your email to verify your account.':'Your request was saved. Email delivery is not confirmed; use Resend verification to retry.'};
  }
  async function resend(emailInput) {
    const email=noteworthyEmail(emailInput);
    const [pending]=await rows('SELECT id FROM noteworthy_signups WHERE email=? AND verified_agency_id IS NULL',[email]);
    if (pending) { const token=newNoteworthyToken(); await rows('UPDATE noteworthy_signups SET token_hash=?,expires_at=? WHERE id=?',[noteworthyTokenHash(token),expires(),pending.id]); await deliver(email,token,'verify'); }
    return {message:'If a pending request exists, a new verification email has been requested.'};
  }
  async function createPracticeIn(conn,userId,practiceName,plan='essential') {
    const slug=`noteworthy-${crypto.randomBytes(10).toString('hex')}`;
    const r=await rows(`INSERT INTO agencies(name,slug,organization_type,is_active,feature_flags)
      VALUES(?,?,'agency',1,?)`,[practiceName,slug,JSON.stringify({noteworthyPayrollOnly:true})],conn);
    const agencyId=r.insertId;
    await rows('INSERT INTO noteworthy_practices(agency_id,owner_user_id,plan_intent) VALUES(?,?,?)',[agencyId,userId,plan],conn);
    await rows('INSERT INTO user_agencies(user_id,agency_id,is_active,has_payroll_access) VALUES(?,?,1,1)',[userId,agencyId],conn);
    return {agencyId,name:practiceName,slug,role:'owner',plan};
  }
  async function verify(token) {
    if (!/^[a-f0-9]{64}$/.test(token || '')) throw fail(400,'INVALID_TOKEN','This verification link is invalid or expired.');
    return transaction(async conn=>{
      const [pending]=await rows('SELECT * FROM noteworthy_signups WHERE token_hash=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE',[noteworthyTokenHash(token)],conn);
      if(!pending) {
        const [confirmation]=await rows(`SELECT v.user_id FROM noteworthy_email_verifications v JOIN users u ON u.id=v.user_id
          WHERE v.token_hash=? AND v.expires_at>UTC_TIMESTAMP() AND LOWER(u.email)=LOWER(v.email) AND COALESCE(u.is_active,1)=1 FOR UPDATE`,[noteworthyTokenHash(token)],conn);
        if(!confirmation)throw fail(400,'INVALID_TOKEN','This verification link has expired or has already been used.');
        await rows('UPDATE users SET email_verified_at=UTC_TIMESTAMP() WHERE id=?',[confirmation.user_id],conn);
        await rows('DELETE FROM noteworthy_email_verifications WHERE user_id=?',[confirmation.user_id],conn);
        return {verified:true,signInRequired:true};
      }
      if(pending.verified_agency_id) throw fail(400,'INVALID_TOKEN','This verification link has expired or has already been used.');
      const [existing]=await rows('SELECT id FROM users WHERE LOWER(email)=? LIMIT 1',[pending.email],conn);
      if (existing) throw fail(409,'ACCOUNT_EXISTS','Sign in to your existing account to create your practice.');
      const created=await rows(`INSERT INTO users(email,username,personal_email,password_hash,first_name,last_name,role,status,is_active,email_verified_at,has_provider_access)
        VALUES(?,?,?,?,?,?,'provider','ACTIVE_EMPLOYEE',1,UTC_TIMESTAMP(),0)`,[pending.email,pending.email,pending.email,pending.password_hash,pending.first_name,pending.last_name],conn);
      const practice=await createPracticeIn(conn,created.insertId,pending.practice_name,pending.plan_intent);
      await rows("UPDATE noteworthy_signups SET verified_agency_id=?,password_hash='' WHERE id=?",[practice.agencyId,pending.id],conn);
      return {verified:true,signInRequired:true,practice};
    });
  }
  async function requestAccountVerification(userId) {
    const [user]=await rows('SELECT email,email_verified_at FROM users WHERE id=? AND COALESCE(is_active,1)=1',[userId]);
    if(!user)throw fail(403,'ACCOUNT_INACTIVE','Sign in to your active account.');
    if(user.email_verified_at)return {verified:true,verificationSent:false};
    const email=noteworthyEmail(user.email),token=newNoteworthyToken();
    await rows(`INSERT INTO noteworthy_email_verifications(user_id,email,token_hash,expires_at) VALUES(?,?,?,?)
      ON DUPLICATE KEY UPDATE email=VALUES(email),token_hash=VALUES(token_hash),expires_at=VALUES(expires_at)`,[userId,email,noteworthyTokenHash(token),expires()]);
    const delivery=await deliver(email,token,'verify');
    return {verificationRequired:true,verificationSent:!!delivery.sent,deliveryPending:!!delivery.pending};
  }
  async function createPractice(userId,input) {
    const name=noteworthyText(input.practiceName,160,'your practice name'),plan=planIntent(input.plan);
    const [user]=await rows('SELECT email_verified_at FROM users WHERE id=? AND COALESCE(is_active,1)=1',[userId]);
    if (!user?.email_verified_at) throw fail(403,'EMAIL_VERIFICATION_REQUIRED','Verify your account email before creating a payroll practice.');
    return transaction(async conn=>{
      await rows('SELECT id FROM users WHERE id=? FOR UPDATE',[userId],conn);
      const [count]=await rows('SELECT COUNT(*) total FROM noteworthy_practices WHERE owner_user_id=?',[userId],conn);
      if(Number(count.total)>=10) throw fail(409,'PRACTICE_LIMIT','Contact FundThred to add more than 10 practices.');
      return createPracticeIn(conn,userId,name,plan);
    });
  }
  async function owner(userId,agencyId,executor=db) {
    const [practice]=await rows(`SELECT n.agency_id,a.name,a.slug FROM noteworthy_practices n
      JOIN agencies a ON a.id=n.agency_id JOIN user_agencies ua ON ua.agency_id=n.agency_id AND ua.user_id=?
      WHERE n.agency_id=? AND n.owner_user_id=? AND ua.has_payroll_access=1 AND COALESCE(ua.is_active,1)=1 AND a.is_active=1`,[userId,agencyId,userId],executor);
    if (!practice) throw fail(403,'PRACTICE_ACCESS_REQUIRED','Practice owner access is required.');
    return practice;
  }
  async function workspace(userId) {
    const practices=await rows(`SELECT n.agency_id agencyId,a.name,a.slug,'owner' role,n.plan_intent plan FROM noteworthy_practices n
      JOIN agencies a ON a.id=n.agency_id JOIN user_agencies ua ON ua.agency_id=n.agency_id AND ua.user_id=n.owner_user_id
      WHERE n.owner_user_id=? AND a.is_active=1 AND ua.has_payroll_access=1 AND COALESCE(ua.is_active,1)=1
      UNION ALL SELECT r.agency_id agencyId,a.name,a.slug,'employee' role,n.plan_intent plan FROM noteworthy_roster r JOIN agencies a ON a.id=r.agency_id JOIN noteworthy_practices n ON n.agency_id=r.agency_id
      JOIN users u ON u.id=r.payroll_user_id WHERE r.auth_user_id=? AND r.accepted_at IS NOT NULL AND a.is_active=1 AND COALESCE(u.is_archived,0)=0`,[userId,userId]);
    return {practices};
  }
  async function roster(userId,agencyId) {
    await owner(userId,agencyId);
    const employees=await rows(`SELECT r.payroll_user_id userId,u.first_name firstName,u.last_name lastName,r.credential,r.contact_email email,
      r.invited_at invitedAt,r.accepted_at acceptedAt,CASE WHEN r.auth_user_id IS NULL THEN 0 ELSE 1 END portalActive
      FROM noteworthy_roster r JOIN users u ON u.id=r.payroll_user_id WHERE r.agency_id=? AND COALESCE(u.is_archived,0)=0 ORDER BY u.last_name,u.first_name,u.id`,[agencyId]);
    const rates=await rows('SELECT user_id userId,service_code serviceCode,rate_amount rateAmount,rate_unit rateUnit,effective_start effectiveStart,effective_end effectiveEnd FROM payroll_rates WHERE agency_id=? ORDER BY user_id,service_code,effective_start DESC',[agencyId]);
    const codes=await rows('SELECT DISTINCT user_id userId,service_code serviceCode FROM payroll_import_rows WHERE agency_id=? AND user_id IS NOT NULL ORDER BY user_id,service_code',[agencyId]);
    return {employees:employees.map(e=>{const employeeRates=rates.filter(r=>Number(r.userId)===Number(e.userId));const serviceCodes=codes.filter(r=>Number(r.userId)===Number(e.userId)).map(r=>r.serviceCode);return {...e,rates:employeeRates,serviceCodes,missingServiceCodes:serviceCodes.filter(code=>!isProBonoServiceCode(code)&&!employeeRates.some(r=>r.serviceCode.toLowerCase()===code.toLowerCase()))};})};
  }
  async function saveRates(executor,agencyId,payrollUserId,rates,{onlyMissing=false}={}) {
    for (const rate of rates) {
      if (onlyMissing) { const [existing]=await rows('SELECT id FROM payroll_rates WHERE agency_id=? AND user_id=? AND service_code=? LIMIT 1',[agencyId,payrollUserId,rate.serviceCode],executor); if(existing) continue; }
      const [published]=await rows(`SELECT p.id FROM payroll_import_rows i JOIN payroll_periods p ON p.id=i.payroll_period_id
        WHERE i.agency_id=? AND i.user_id=? AND UPPER(i.service_code)=UPPER(?) AND i.service_date>=? AND p.status IN ('posted','finalized') LIMIT 1`,[agencyId,payrollUserId,rate.serviceCode,rate.effectiveStart],executor);
      const paidCarryovers=await rows(`SELECT c.carryover_meta_json FROM payroll_stage_carryovers c JOIN payroll_periods p ON p.id=c.payroll_period_id
        WHERE c.agency_id=? AND c.user_id=? AND UPPER(c.service_code)=UPPER(?) AND c.carryover_finalized_units>0 AND p.status IN ('posted','finalized')`,[agencyId,payrollUserId,rate.serviceCode],executor);
      const publishedCarryover=paidCarryovers.some(c=>{const dates=(json(c.carryover_meta_json)?.rawAuditRows || []).map(r=>String(r.serviceDate || '').slice(0,10));return !dates.length || dates.some(date=>!date || date>=rate.effectiveStart);});
      if(published || publishedCarryover) {
        const [same]=await rows('SELECT rate_amount,rate_unit FROM payroll_rates WHERE agency_id=? AND user_id=? AND service_code=? AND effective_start=?',[agencyId,payrollUserId,rate.serviceCode,rate.effectiveStart],executor);
        if(!same || Number(same.rate_amount)!==rate.rateAmount || same.rate_unit!==rate.rateUnit)throw fail(409,'PUBLISHED_RATE_HISTORY','This effective date covers posted payroll. Choose a later effective date or use the payroll correction review.');
        continue;
      }
      await rows(`INSERT INTO payroll_rates(agency_id,user_id,service_code,rate_amount,rate_unit,effective_start,pay_method)
        VALUES(?,?,?,?,?,?,'fixed_rate') ON DUPLICATE KEY UPDATE rate_amount=VALUES(rate_amount),rate_unit=VALUES(rate_unit),pay_method='fixed_rate'`,[agencyId,payrollUserId,rate.serviceCode,rate.rateAmount,rate.rateUnit,rate.effectiveStart],executor);
      // Keep executed payroll intact; recompute any unpublished affected period.
      await rows(`UPDATE payroll_periods SET status='raw_imported',ran_at=NULL,ran_by_user_id=NULL WHERE agency_id=? AND status='ran'
        AND id IN(SELECT payroll_period_id FROM payroll_import_rows WHERE agency_id=? AND user_id=? AND UPPER(service_code)=UPPER(?) AND service_date>=?)`,[agencyId,agencyId,payrollUserId,rate.serviceCode,rate.effectiveStart],executor);
    }
  }
  async function updateRoster(userId,agencyId,payrollUserId,input) {
    await owner(userId,agencyId);
    const email=input.email===undefined?undefined:(input.email===null || input.email===''?null:noteworthyEmail(input.email));
    const credential=input.credential===undefined?undefined:(input.credential===null || input.credential===''?null:noteworthyText(input.credential,80,'a credential'));
    const rates=input.rates===undefined?null:noteworthyRates(input.rates);
    await transaction(async conn=>{
      const [employee]=await rows('SELECT * FROM noteworthy_roster WHERE agency_id=? AND payroll_user_id=? FOR UPDATE',[agencyId,payrollUserId],conn);
      if(!employee) throw fail(404,'EMPLOYEE_NOT_FOUND','Employee not found in this practice.');
      if(email!==undefined && email!==employee.contact_email) {
        if(employee.auth_user_id) throw fail(409,'EMPLOYEE_EMAIL_CLAIMED','An employee with an active portal must change their own login email.');
        await rows('UPDATE noteworthy_roster SET contact_email=?,invited_at=NULL WHERE agency_id=? AND payroll_user_id=?',[email,agencyId,payrollUserId],conn);
        await rows('DELETE FROM noteworthy_employee_invites WHERE agency_id=? AND payroll_user_id=? AND accepted_at IS NULL',[agencyId,payrollUserId],conn);
      }
      if(credential!==undefined) {
        await rows('UPDATE noteworthy_roster SET credential=? WHERE agency_id=? AND payroll_user_id=?',[credential,agencyId,payrollUserId],conn);
        if(credential) {const [defaults]=await rows('SELECT rates_json FROM noteworthy_credential_rates WHERE agency_id=? AND credential=?',[agencyId,credential],conn);if(defaults)await saveRates(conn,agencyId,payrollUserId,json(defaults.rates_json),{onlyMissing:true});}
      }
      if(rates) await saveRates(conn,agencyId,payrollUserId,rates);
    });
    return {saved:true};
  }
  async function rateDefaults(userId,agencyId,input=null) {
    await owner(userId,agencyId);
    if(input) {
      if(!Array.isArray(input.defaults) || input.defaults.length>50) throw fail(400,'INVALID_DEFAULTS','Provide up to 50 credential defaults.');
      const defaults=input.defaults.map(d=>{if(!d || typeof d!=='object' || Array.isArray(d))throw fail(400,'INVALID_DEFAULTS','Enter a valid credential default.');return {credential:noteworthyText(d.credential,80,'a credential'),rates:noteworthyRates(d.rates)};});
      if(new Set(defaults.map(d=>d.credential.toLowerCase())).size!==defaults.length) throw fail(400,'DUPLICATE_CREDENTIAL','Each credential must appear once.');
      await transaction(async conn=>{
        await rows('SELECT agency_id FROM noteworthy_practices WHERE agency_id=? FOR UPDATE',[agencyId],conn);
        await rows('DELETE FROM noteworthy_credential_rates WHERE agency_id=?',[agencyId],conn);
        for(const d of defaults)await rows('INSERT INTO noteworthy_credential_rates(agency_id,credential,rates_json,updated_by_user_id) VALUES(?,?,?,?)',[agencyId,d.credential,JSON.stringify(d.rates),userId],conn);
      });
    }
    const found=await rows('SELECT credential,rates_json FROM noteworthy_credential_rates WHERE agency_id=? ORDER BY credential',[agencyId]);
    return {defaults:found.map(d=>({credential:d.credential,rates:json(d.rates_json)}))};
  }
  async function invite(userId,agencyId,payrollUserId,input) {
    const practice=await owner(userId,agencyId);
    if(input.confirm!==true) throw fail(400,'INVITATION_CONFIRMATION_REQUIRED','Confirm that this employee email is correct and that you want to send the invitation.');
    const [employee]=await rows('SELECT contact_email,auth_user_id FROM noteworthy_roster WHERE agency_id=? AND payroll_user_id=?',[agencyId,payrollUserId]);
    if(!employee) throw fail(404,'EMPLOYEE_NOT_FOUND','Employee not found.');
    if(employee.auth_user_id) throw fail(409,'EMPLOYEE_PORTAL_ACTIVE','This employee already has portal access.');
    const email=noteworthyEmail(employee.contact_email),token=newNoteworthyToken();
    await transaction(async conn=>{
      await rows('SELECT payroll_user_id FROM noteworthy_roster WHERE agency_id=? AND payroll_user_id=? FOR UPDATE',[agencyId,payrollUserId],conn);
      await rows('DELETE FROM noteworthy_employee_invites WHERE agency_id=? AND payroll_user_id=? AND accepted_at IS NULL',[agencyId,payrollUserId],conn);
      await rows('INSERT INTO noteworthy_employee_invites(agency_id,payroll_user_id,email,token_hash,expires_at,invited_by_user_id) VALUES(?,?,?,?,?,?)',[agencyId,payrollUserId,email,noteworthyTokenHash(token),expires(),userId],conn);
      await rows('UPDATE noteworthy_roster SET invited_at=UTC_TIMESTAMP() WHERE agency_id=? AND payroll_user_id=?',[agencyId,payrollUserId],conn);
    });
    const delivery=await deliver(email,token,'invite',practice.name);
    return {invitationSent:!!delivery.sent,deliveryPending:!!delivery.pending};
  }
  async function acceptInvite(input,sessionUserId=null) {
    if(!/^[a-f0-9]{64}$/.test(input.token || '')) throw fail(400,'INVALID_TOKEN','This invitation is invalid or expired.');
    let passwordHash=null;
    if(input.password) { if(Buffer.byteLength(input.password)>72)throw fail(400,'INVALID_PASSWORD','Use at most 72 bytes.'); const valid=await validatePassword(input.password);if(!valid.valid)throw fail(400,'INVALID_PASSWORD',valid.message);passwordHash=await hashPassword(input.password); }
    return transaction(async conn=>{
      const [invitation]=await rows(`SELECT i.*,u.first_name,u.last_name FROM noteworthy_employee_invites i
        JOIN noteworthy_roster r ON r.agency_id=i.agency_id AND r.payroll_user_id=i.payroll_user_id AND LOWER(r.contact_email)=LOWER(i.email)
        JOIN users u ON u.id=r.payroll_user_id JOIN agencies a ON a.id=r.agency_id
        WHERE i.token_hash=? AND i.accepted_at IS NULL AND i.expires_at>UTC_TIMESTAMP() AND r.auth_user_id IS NULL AND a.is_active=1 FOR UPDATE`,[noteworthyTokenHash(input.token)],conn);
      if(!invitation)throw fail(400,'INVALID_TOKEN','This invitation has expired or has already been used.');
      const [existing]=await rows('SELECT id,is_active,is_archived FROM users WHERE LOWER(email)=? LIMIT 1',[invitation.email],conn);
      let authUserId=existing?.id;
      if(existing) {
        if(Number(sessionUserId)!==Number(existing.id)) throw fail(401,'EXISTING_ACCOUNT_SIGN_IN_REQUIRED','Sign in to the existing account for this email, then accept your invitation.');
        if(existing.is_active===0 || existing.is_archived===1)throw fail(403,'ACCOUNT_INACTIVE','Contact your account administrator.');
      } else {
        if(!passwordHash)throw fail(400,'PASSWORD_REQUIRED','Choose a password to create your employee portal login.');
        const created=await rows(`INSERT INTO users(email,username,personal_email,password_hash,first_name,last_name,role,status,is_active,email_verified_at,has_provider_access)
          VALUES(?,?,?,?,?,?,'provider','ACTIVE_EMPLOYEE',1,UTC_TIMESTAMP(),0)`,[invitation.email,invitation.email,invitation.email,passwordHash,invitation.first_name,invitation.last_name],conn);
        authUserId=created.insertId;
      }
      // Authentication and payroll identities can differ. Historical payroll is never moved.
      await rows('UPDATE noteworthy_roster SET auth_user_id=?,accepted_at=UTC_TIMESTAMP() WHERE agency_id=? AND payroll_user_id=?',[authUserId,invitation.agency_id,invitation.payroll_user_id],conn);
      await rows('UPDATE noteworthy_employee_invites SET accepted_at=UTC_TIMESTAMP() WHERE id=?',[invitation.id],conn);
      return {accepted:true,agencyId:invitation.agency_id,signInRequired:Number(sessionUserId)!==Number(authUserId)};
    });
  }
  async function paystubs(userId,agencyId) {
    const [employee]=await rows(`SELECT r.payroll_user_id FROM noteworthy_roster r JOIN agencies a ON a.id=r.agency_id
      JOIN users u ON u.id=r.payroll_user_id WHERE r.agency_id=? AND r.auth_user_id=? AND r.accepted_at IS NOT NULL AND a.is_active=1 AND COALESCE(u.is_archived,0)=0`,[agencyId,userId]);
    if(!employee)throw fail(403,'EMPLOYEE_PORTAL_REQUIRED','Access to your own employee payroll portal is required.');
    const found=await rows(`SELECT s.id,s.payroll_period_id payrollPeriodId,p.period_start periodStart,p.period_end periodEnd,p.posted_at postedAt,
      s.total_units totalUnits,s.total_amount totalAmount,s.subtotal_amount subtotalAmount,s.adjustments_amount adjustmentsAmount,s.breakdown
      FROM payroll_summaries s JOIN payroll_periods p ON p.id=s.payroll_period_id AND p.agency_id=s.agency_id
      WHERE s.agency_id=? AND s.user_id=? AND p.status IN ('posted','finalized') ORDER BY p.period_start DESC LIMIT 100`,[agencyId,employee.payroll_user_id]);
    // Allowlist code totals. Internal reconciliation snapshots/other employees/client details never leave this endpoint.
    return {paystubs:found.map(r=>{const breakdown=json(r.breakdown) || {};return {...r,breakdown:undefined,periodStart:ymd(r.periodStart),periodEnd:ymd(r.periodEnd),lines:Object.entries(breakdown).filter(([code,v])=>!code.startsWith('__') && v && typeof v==='object' && !Array.isArray(v)).map(([serviceCode,v])=>({serviceCode,units:v.finalizedUnits ?? v.units ?? null,amount:v.amount ?? v.totalAmount ?? null,rateAmount:v.rateAmount ?? null,...(v.datedRateLines?{datedRateLines:v.datedRateLines.map(l=>({serviceDate:l.serviceDate,units:l.units,rateAmount:l.rateAmount,rateUnit:l.rateUnit,amount:l.amount}))}:{})}))};})};
  }
  async function createPeriod(userId,agencyId,input) {
    await owner(userId,agencyId);
    const start=noteworthyDate(input.periodStart),end=noteworthyDate(input.periodEnd);
    const days=(new Date(end)-new Date(start))/86400000;
    if(days!==13)throw fail(400,'BIWEEKLY_PERIOD_REQUIRED','Choose a two-week pay period (14 days, including its start and end).');
    return transaction(async conn=>{
      await rows('SELECT agency_id FROM noteworthy_practices WHERE agency_id=? FOR UPDATE',[agencyId],conn);
      const [existing]=await rows('SELECT * FROM payroll_periods WHERE agency_id=? AND period_start=? AND period_end=?',[agencyId,start,end],conn);
      if(existing)return existing;
      const [overlap]=await rows('SELECT id FROM payroll_periods WHERE agency_id=? AND period_start<=? AND period_end>=? LIMIT 1',[agencyId,end,start],conn);
      if(overlap)throw fail(409,'OVERLAPPING_PERIOD','This period overlaps an existing payroll period. Open that period instead.');
      const made=await rows("INSERT INTO payroll_periods(agency_id,label,period_start,period_end,status,created_by_user_id) VALUES(?,?,?,?,'draft',?)",[agencyId,`${start} → ${end}`,start,end,userId],conn);
      const [period]=await rows('SELECT * FROM payroll_periods WHERE id=?',[made.insertId],conn);return period;
    });
  }
  return {signup,resend,verify,requestAccountVerification,createPractice,workspace,owner,roster,updateRoster,rateDefaults,invite,acceptInvite,paystubs,createPeriod};
}
export default createNoteworthyPayrollService();
