import {createHash} from 'node:crypto';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import {isNluTutoringQaAgency} from '../utils/nluTutoringQaPolicy.js';
import {hireAccountModeForUser} from '../utils/hireAccountMode.js';
import {assertAccountEnabled} from '../utils/accountAccess.js';
import {HIRE_ACTIVATION_MESSAGE} from '../utils/hirePortalToken.js';
import {validatePasswordStrength} from '../utils/passwordValidation.js';
import {isStaffAccount} from '../utils/staffEligibility.js';

const flagsFor = agency => {try{return typeof agency?.feature_flags==='string'?JSON.parse(agency.feature_flags):agency?.feature_flags||{};}catch{return {};}};
const enabled = value => [true,1,'1'].includes(value);
const emailFor = value => String(value||'').trim().toLowerCase();
const fail = (message,status=409,code='APP_HIRE_NOT_READY') => Object.assign(new Error(message),{status,code});

// This explicit synthetic mode reserves an app identity, never a real mailbox.
// Ordinary employers keep their configured account process, including Workspace.
export function appOnlyHireDomain(agency) {
 const flags=flagsFor(agency);
 if(hireAccountModeForUser(agency)!=='app_only')return null;
 if(!isNluTutoringQaAgency(agency)||Number(flags.qaSandbox?.sourceAgencyId)!==6
  ||!enabled(agency.is_active)||enabled(agency.is_archived)
  ||emailFor(flags.workspaceEmailDomain)!=='example.com')throw fail('App-only hiring requires the approved synthetic QA organization and example.com identity namespace.',400,'APP_HIRE_CONFIGURATION');
 return 'example.com';
}

export async function checkAppHireEmail({email,userId,agency,database=pool}) {
 const domain=appOnlyHireDomain(agency);
 if(!domain)throw fail('App-only hiring is not configured.',400,'APP_HIRE_CONFIGURATION');
 const normalized=emailFor(email),local=normalized.split('@')[0];
 if(!/^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@example\.com$/.test(normalized)||normalized.length>254||local.length>64||local.includes('..'))return {available:false,email:normalized,reason:normalized.endsWith('@example.com')?'invalid_email':'wrong_domain',expectedDomain:domain};
 const [[collision]]=await database.execute(`SELECT id FROM users WHERE id<>? AND (LOWER(TRIM(email))=? OR LOWER(TRIM(work_email))=? OR LOWER(TRIM(username))=? OR LOWER(TRIM(personal_email))=?) LIMIT 1`,[userId,normalized,normalized,normalized,normalized]);
 const [[alias]]=await database.execute('SELECT user_id FROM user_login_emails WHERE LOWER(email)=? AND user_id<>? LIMIT 1',[normalized,userId]);
 const [[route]]=await database.execute('SELECT id FROM email_inbound_routes WHERE LOWER(TRIM(email_address))=? AND is_active=1 LIMIT 1',[normalized]);
 return {available:!collision&&!alias&&!route,email:normalized,domain,...(collision||alias||route?{reason:'taken_in_app'}:{})};
}

export async function suggestAppHireEmails({user,agency,limit=8}) {
 const domain=appOnlyHireDomain(agency),name=String(user.first_name||'hire').toLowerCase().replace(/[^a-z0-9]/g,'')||'hire';
 const suggestions=[];
 for(let suffix=0;suffix<50&&suggestions.length<limit;suffix++) {
  const email=`qa.nlu.${name}.work${suffix||''}@${domain}`;
  if((await checkAppHireEmail({email,userId:user.id,agency})).available)suggestions.push({email,local:email.split('@')[0],domain,available:true});
 }
 return {domain,hireAccountMode:'app_only',appIdentityOnly:true,directoryConfigured:false,suggestions};
}

async function appOnlyAgencyForUser(user,database=pool) {
 if(!isStaffAccount(user)||enabled(user.login_is_group_email))return null;
 // The saved hiring owner survives offboarding and membership removal. A QA
 // membership alone must never reclassify an unrelated employer's hire.
 const [agencies]=await database.execute(`SELECT a.id,a.slug,a.is_active,a.is_archived,a.feature_flags,j.onboarding_completed_at AS hire_onboarding_completed_at FROM agencies a LEFT JOIN hire_journeys j ON j.user_id=? LEFT JOIN hiring_profiles hp ON hp.candidate_user_id=? LEFT JOIN hiring_job_descriptions jd ON jd.id=hp.job_description_id WHERE a.id=COALESCE(j.agency_id,jd.agency_id)`,[user.id,user.id]);
 const agency=agencies.find(a=>hireAccountModeForUser(a)==='app_only');
 if(agency)appOnlyHireDomain(agency);
 return agency||null;
}

export async function recordAppHireJourney({user,agencyId,newApplicant=false,database=pool}) {
 if(![453,454].includes(Number(agencyId))||!isStaffAccount(user))return;
 if(!newApplicant&&!['PROSPECTIVE','ARCHIVED'].includes(String(user.status||'').toUpperCase()))return;
 const [[agency]]=await database.execute('SELECT id,slug,is_active,is_archived,feature_flags FROM agencies WHERE id=?',[agencyId]);
 if(hireAccountModeForUser(agency)!=='app_only')return;
 appOnlyHireDomain(agency);
 if(!newApplicant){
  const [[owner]]=await database.execute(`SELECT j.agency_id AS journey_agency_id,jd.agency_id AS job_agency_id FROM users u LEFT JOIN hire_journeys j ON j.user_id=u.id LEFT JOIN hiring_profiles hp ON hp.candidate_user_id=u.id LEFT JOIN hiring_job_descriptions jd ON jd.id=hp.job_description_id WHERE u.id=?`,[user.id]);
  if((owner?.journey_agency_id&&Number(owner.journey_agency_id)!==Number(agencyId))||(owner?.job_agency_id&&Number(owner.job_agency_id)!==Number(agencyId)))return;
  const [[otherMembership]]=await database.execute('SELECT agency_id FROM user_agencies WHERE user_id=? AND agency_id NOT IN(453,454) LIMIT 1',[user.id]);
  if(otherMembership)return;
 }
 // Ownership only; no signatures, work, submission or activation are inferred.
 await database.execute('INSERT INTO hire_journeys(user_id,agency_id) VALUES (?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)',[user.id,agencyId]);
}

const preparedPassword = user => !!(user?.password_hash||enabled(user?.app_password_ready))&&enabled(user?.sso_password_override)&&!!user?.work_email;
const approvedHire = (user,agency) => !!user?.completed_at&&!!agency?.hire_onboarding_completed_at&&preparedPassword(user);

export async function assertAppHireStaffAccess(user,database=pool) {
 const agency=await appOnlyAgencyForUser(user,database);
 if(agency&&(!approvedHire(user,agency)||!['ACTIVE_EMPLOYEE','TERMINATED_PENDING'].includes(user.status)))throw fail(HIRE_ACTIVATION_MESSAGE,403,'HIRE_ACTIVATION_REQUIRED');
}

export async function assertAppHirePasswordEntry(user,database=pool) {
 if(await appOnlyAgencyForUser(user,database)) {
  if(!user.password_hash||!enabled(user.sso_password_override))throw fail('Complete required onboarding and set your app password in the personal hiring portal.',409,'USE_HIRING_PORTAL');
 }
}

export async function assertAppHireLegacyActivationRoute(user,database=pool) {
 const agency=await appOnlyAgencyForUser(user,database);
 if(agency&&!approvedHire(user,agency))throw fail('Review submitted onboarding and use the normal employee activation control. This app account does not use legacy temporary-password activation.',409,'APP_HIRE_ACTIVATION_ROUTE');
}

export async function assertAppHireActivationReady(user,database=pool) {
 const agency=await appOnlyAgencyForUser(user,database);
 if(!agency)return;
 if((user.status!=='ONBOARDING'&&!user.completed_at)||!preparedPassword(user))throw fail('Complete app account setup and submit onboarding before People Operations activates this employee.');
 const [[journey]]=await database.execute('SELECT onboarding_completed_at FROM hire_journeys WHERE user_id=? AND agency_id=?',[user.id,agency.id]);
 if(!journey?.onboarding_completed_at)throw fail('Submit completed onboarding before People Operations activates this employee.');
 return agency;
}

export async function finalizeAppHirePassword({user,agency,password}) {
 appOnlyHireDomain(agency);
 if(!agency||hireAccountModeForUser(agency,user)!=='app_only')throw fail('App-only hiring is not configured.',400,'APP_HIRE_CONFIGURATION');
 const workEmail=emailFor(user.work_email),personalEmail=emailFor(user.personal_email||user.email);
 if(!workEmail||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)||workEmail===personalEmail)throw fail('Choose a distinct app username and retain a valid personal recovery identity before setting a password.',400,'USERNAME_REQUIRED');
 const strength=await validatePasswordStrength(password,{accountId:workEmail});
 if(!strength.valid)throw fail(strength.message,400,'INVALID_PASSWORD');
 const {assertOnboardingPasswordReady}=await import('./hirePortalWorkflow.service.js');
 await assertOnboardingPasswordReady(user.id,agency.id);
 const hash=await bcrypt.hash(password,10),db=await pool.getConnection();
 const locks=[...new Set([workEmail,personalEmail].map(email=>`hire-username:${createHash('sha256').update(email).digest('hex').slice(0,40)}`))].sort();
 const heldLocks=[];
 try {
  for(const lock of locks){const [[result]]=await db.execute('SELECT GET_LOCK(?,5) AS acquired',[lock]);if(!result?.acquired)throw fail('An account identity is being updated. Try again.');heldLocks.push(lock);}
  await db.beginTransaction();
  const [[current]]=await db.execute('SELECT * FROM users WHERE id=? FOR UPDATE',[user.id]);
  assertAccountEnabled(current);
  if(!isStaffAccount(current))throw fail('Employee onboarding is required for this account.',403);
  if(current.identity_product!=='full_suite')throw fail('Use the sign-in for your account product.',403,'PRODUCT_SESSION_MISMATCH');
  const [[currentAgency]]=await db.execute(`SELECT a.* FROM agencies a JOIN user_agencies ua ON ua.agency_id=a.id WHERE a.id=? AND ua.user_id=? AND ua.is_active=1`,[agency.id,user.id]);
  appOnlyHireDomain(currentAgency);
  if(!currentAgency||hireAccountModeForUser(currentAgency,current)!=='app_only')throw fail('App-only hiring is no longer configured.');
  const [[journey]]=await db.execute('SELECT onboarding_completed_at FROM hire_journeys WHERE user_id=? AND agency_id=?',[user.id,agency.id]);
  if(current?.status!=='ONBOARDING'||!journey||journey.onboarding_completed_at||emailFor(current.work_email)!==workEmail||emailFor(current.personal_email||current.email)!==personalEmail)throw fail('Onboarding or the selected username changed. Refresh before setting a password.');
  if(current.password_hash)throw fail('A password is already prepared. Use the normal recovery process if a correction is needed.',409,'PASSWORD_ALREADY_SET');
  await assertOnboardingPasswordReady(user.id,agency.id);
  if(!(await checkAppHireEmail({email:workEmail,userId:user.id,agency:currentAgency,database:db})).available)throw fail('That app username is no longer available.',409,'EMAIL_UNAVAILABLE');
  const [[personalOwner]]=await db.execute(`SELECT id FROM users WHERE id<>? AND (LOWER(TRIM(email))=? OR LOWER(TRIM(work_email))=? OR LOWER(TRIM(username))=? OR LOWER(TRIM(personal_email))=?) LIMIT 1`,[user.id,personalEmail,personalEmail,personalEmail,personalEmail]);
  const [[personalAlias]]=await db.execute('SELECT user_id FROM user_login_emails WHERE LOWER(email)=? LIMIT 1',[personalEmail]);
  if(personalOwner||(personalAlias&&Number(personalAlias.user_id)!==Number(user.id)))throw fail('The recovery identity belongs to another account.',409,'EMAIL_UNAVAILABLE');
  await db.execute(`UPDATE users SET password_hash=?,password_changed_at=UTC_TIMESTAMP(),temporary_password_hash=NULL,temporary_password_expires_at=NULL,temporary_password_set_at=NULL,sso_password_override=1,login_is_group_email=0,email=?,username=?,personal_email=? WHERE id=?`,[hash,workEmail,workEmail,personalEmail,user.id]);
  if(!personalAlias)await db.execute('INSERT INTO user_login_emails(user_id,agency_id,email) VALUES (?,?,?)',[user.id,agency.id,personalEmail]);
  await db.execute('INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)',['hire_app_password_prepared',user.id,agency.id,JSON.stringify({appIdentityOnly:true,employeeActivated:false})]);
  await db.commit();
 }catch(error){await db.rollback();throw error;}finally{try{for(const lock of heldLocks.reverse())await db.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{db.release();}}
 const {recordCredentialChangeNotice}=await import('./credentialChangeNotification.service.js');
 await recordCredentialChangeNotice({userId:user.id,kind:'password',initialSetup:true});
 return {workEmail,username:workEmail,personalEmail,recoveryEmail:personalEmail,passwordSet:true,ssoPasswordOverride:true,appIdentityOnly:true};
}
