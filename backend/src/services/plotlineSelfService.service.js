import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import {validatePasswordStrength} from '../utils/passwordValidation.js';
import {AGENCY_ACCESS_FIELDS} from '../utils/agencyAccessPolicy.js';
import {isStaffAccount} from '../utils/staffEligibility.js';
import {withQaAutomationAttribution,qaAutomationActorFor} from '../utils/qaAutomationAttribution.js';
import {plotlineBrand,plotlineCopy,preparePlotlineLogo,PLOTLINE_THEMES} from './plotlineBrand.service.js';
import emailService from './plotlineAccountEmail.service.js';

export const PLOTLINE_TRIAL_DAYS=30;
export const PLOTLINE_DAILY_COMPANY_LIMIT=20;
export const plotlineCompanyLimit=userId=>qaAutomationActorFor(userId)?2:1;
export const PLOTLINE_TERMS_VERSION='platform-terms-2026-11-18';
export const plotlineFailure=(status,code,message)=>Object.assign(new Error(message),{status,code});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const json=value=>typeof value==='string'?JSON.parse(value):value;
const sqlDate=date=>date.toISOString().slice(0,19).replace('T',' ');
export const plotlineDate=value=>value instanceof Date?value:new Date(String(value).replace(' ','T')+(/[zZ]$|[+-]\d\d:\d\d$/.test(String(value))?'':'Z'));
const email=value=>{
 const v=String(value||'').trim().toLowerCase();
 if(v.length>254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(v))throw plotlineFailure(400,'INVALID_EMAIL','Enter a valid email address.');
 return v;
};
const text=(value,max,label)=>{
 if(typeof value!=='string' || !value.trim() || value.trim().length>max || /[\u0000-\u001f]/.test(value))throw plotlineFailure(400,'INVALID_FIELD',`Enter ${label}.`);
 return value.trim();
};
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(value||''));
export function plotlineTrial(row,now=new Date()) {
 const end=plotlineDate(row.trial_ends_at),active=!!row.commercial_activated_at,expired=now>=end;
 return {state:active?'active':expired?'read_only':'trial',canWrite:active||!expired,trialDays:30,
  trialStartedAt:plotlineDate(row.trial_started_at).toISOString(),trialEndsAt:end.toISOString(),
  daysRemaining:Math.max(0,Math.ceil((end-now)/86400000)),cardRequired:false,autoCharge:false,
  continuationRequested:!!row.continuation_requested_at};
}
export function plotlineDraft(input={}) {
 if(!input || typeof input!=='object' || Array.isArray(input))throw plotlineFailure(400,'INVALID_DRAFT','Enter your company details.');
 const name=typeof input.name==='string'?input.name.trim():'';
 if(name.length>160 || /[\u0000-\u001f]/.test(name))throw plotlineFailure(400,'INVALID_COMPANY_NAME','Use a business name up to 160 characters.');
 const industry=input.industry||'other';
 if(!['consulting','professional_services','technology','other'].includes(industry))throw plotlineFailure(400,'INVALID_INDUSTRY','Choose your business type.');
 const timezone=input.timezone||'America/Denver';
 try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format();}catch{throw plotlineFailure(400,'INVALID_TIMEZONE','Choose a valid timezone.');}
 return {name,industry,timezone,brand:plotlineBrand(input.brand)};
}

export function createPlotlineSelfService({db=pool,send=message=>emailService.send(message),now=()=>new Date(),
 enabled=()=>process.env.PLOTLINE_SELF_SERVICE_ENABLED||'false',hashPassword=p=>bcrypt.hash(p,12),validatePassword=validatePasswordStrength,resolveSender=()=>emailService.sender()}={}) {
 const rows=async(sql,args=[],executor=db)=>(await executor.execute(sql,args))[0];
 async function transaction(fn){const conn=await db.getConnection();try{await conn.beginTransaction();const result=await fn(conn);await conn.commit();return result;}catch(e){await conn.rollback();throw e;}finally{conn.release();}}
 async function availability(userId=null){
   const mode=enabled();
   if(![true,'true'].includes(mode) && !(mode==='qa_only'&&qaAutomationActorFor(userId)))return {enabled:false,trialDays:30};
   const [schema]=await rows("SELECT COUNT(*) ready FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('plotline_signups','plotline_company_drafts','plotline_companies','plotline_audit_events','plotline_capacity','user_agency_access_profiles')");
   const [rollout]=await rows('SELECT enabled FROM user_agency_access_rollout WHERE id=1');
   return {enabled:Number(schema?.ready)===6 && Number(rollout?.enabled)===1,trialDays:30,qaOnly:mode==='qa_only'};
 }
 async function assertEnabled(userId=null){if(!(await availability(userId)).enabled)throw plotlineFailure(503,'PLOTLINE_SETUP_UNAVAILABLE','Company setup is opening soon. You can request help while we finish preparing it.');}
 async function activeUser(userId,executor=db){
   const [user]=await rows('SELECT id,email,email_verified_at,role FROM users WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[userId],executor);
   if(!user)throw plotlineFailure(403,'ACTIVE_ACCOUNT_REQUIRED','Sign in to your active account.');
   return user;
 }
 async function verifiedUser(userId,executor=db){const user=await activeUser(userId,executor);if(!isStaffAccount(user))throw plotlineFailure(403,'WORK_ACCOUNT_REQUIRED','Sign in with a workforce account to create a company.');if(!user.email_verified_at)throw plotlineFailure(403,'EMAIL_VERIFICATION_REQUIRED','Verify your account email before creating a company.');return user;}
 async function audit(executor,actor,agencyId,action,objectId,metadata={}){
   await rows('INSERT INTO plotline_audit_events(agency_id,actor_user_id,action,object_id,metadata_json,created_at) VALUES(?,?,?,?,?,?)',
    [agencyId,actor,action,objectId,JSON.stringify(withQaAutomationAttribution(metadata,actor)||{}),sqlDate(now())],executor);
 }
 function verificationUrl(token){
   const base=new URL(process.env.PLOTLINE_PUBLIC_URL||'https://plotlinepo.com');
   if(base.protocol!=='https:' && !['localhost','127.0.0.1'].includes(base.hostname))throw plotlineFailure(503,'PLOTLINE_URL_INVALID','Plotline account email is unavailable.');
   return `${base.origin}/verify#token=${token}`;
 }
 async function takeCapacity(conn,key,limit,message='We’ve reached today’s setup limit. Please try tomorrow or request help from Plotline.'){
   // Upsert takes an exclusive record lock. INSERT IGNORE followed by FOR
   // UPDATE can deadlock when multiple instances upgrade shared duplicate-key locks.
   await rows('INSERT INTO plotline_capacity(bucket_key,used) VALUES(?,0) ON DUPLICATE KEY UPDATE used=used',[key],conn);
   const [bucket]=await rows('SELECT used FROM plotline_capacity WHERE bucket_key=? FOR UPDATE',[key],conn);
   if(Number(bucket.used)>=limit)throw plotlineFailure(429,'PLOTLINE_CAPACITY_LIMIT',message);
   await rows('UPDATE plotline_capacity SET used=used+1 WHERE bucket_key=?',[key],conn);
 }
 async function requestVerification(input,authenticatedUserId=null,requestContext={}){
   await assertEnabled(authenticatedUserId);
   const address=email(input?.email),token=crypto.randomBytes(32).toString('hex'),stamp=now();
   if(authenticatedUserId && (await activeUser(authenticatedUserId)).email.toLowerCase()!==address)throw plotlineFailure(403,'EMAIL_ACCOUNT_MISMATCH','Use the email address of your signed-in account.');
   const id=await transaction(async conn=>{
     const day=stamp.toISOString().slice(0,10);
     await takeCapacity(conn,`verification:all:${day}`,200);
     await takeCapacity(conn,`verification:ip:${hash(String(requestContext.ip||'unknown'))}:${day}`,10);
     // The unique email key serializes concurrent initial requests too.
     await rows(`INSERT IGNORE INTO plotline_signups(email,token_hash,expires_at,requested_at)
       VALUES(?,?,?,?)`,[address,hash(token),sqlDate(new Date(stamp.getTime()+86400000)),sqlDate(new Date(0))],conn);
     const [pending]=await rows('SELECT id,requested_at FROM plotline_signups WHERE email=? FOR UPDATE',[address],conn);
     if(stamp-plotlineDate(pending.requested_at)<60000)throw plotlineFailure(429,'VERIFICATION_COOLDOWN','Wait one minute before requesting another email.');
     await rows('UPDATE plotline_signups SET token_hash=?,expires_at=?,requested_at=?,sent_at=NULL,consumed_at=NULL,user_id=NULL WHERE id=?',
       [hash(token),sqlDate(new Date(stamp.getTime()+86400000)),sqlDate(stamp),pending.id],conn);
     return pending.id;
   });
   let result;try{result=await send({email:address,url:verificationUrl(token),qaAutomationUserId:qaAutomationActorFor(authenticatedUserId)?authenticatedUserId:null});}catch{result={sent:false,pending:false};}
   if(result.sent)await rows('UPDATE plotline_signups SET sent_at=? WHERE id=? AND token_hash=?',[sqlDate(now()),id,hash(token)]);
   return {verificationRequired:true,verificationSent:!!result.sent,deliveryPending:!!result.pending,resendAfterSeconds:60,
    message:result.sent?'Verification email sent. Open it to continue.':result.pending?'Your email is awaiting delivery approval. Your trial has not started.':'Your request is saved, but email delivery is not confirmed. Please retry in one minute.'};
 }
 async function verify(input,authenticatedUserId=null){
   await assertEnabled(authenticatedUserId);
   if(!/^[a-f0-9]{64}$/.test(input?.token||''))throw plotlineFailure(400,'INVALID_TOKEN','This verification link is invalid or expired.');
   return transaction(async conn=>{
     const [pending]=await rows('SELECT * FROM plotline_signups WHERE token_hash=? FOR UPDATE',[hash(input.token)],conn);
     if(!pending || pending.consumed_at || plotlineDate(pending.expires_at)<=now())throw plotlineFailure(400,'INVALID_TOKEN','This verification link has expired or was already used. Request a new email.');
     const [existing]=await rows('SELECT id,email FROM users WHERE LOWER(email)=? LIMIT 1',[pending.email],conn);
     let userId=existing?.id;
     if(existing){
       // Mail proof never resets an existing password or bypasses SSO/MFA.
       if(Number(authenticatedUserId)!==Number(existing.id))return {existingAccount:true,signInRequired:true,verified:false};
       const user=await activeUser(existing.id,conn);
       if(user.email.toLowerCase()!==pending.email)throw plotlineFailure(403,'EMAIL_ACCOUNT_MISMATCH','Sign in to the account this email was sent to.');
       await rows('UPDATE users SET email_verified_at=COALESCE(email_verified_at,?) WHERE id=?',[sqlDate(now()),existing.id],conn);
     }else{
       if(!input.password)return {passwordRequired:true,verified:false};
       const first=text(input.firstName,100,'your first name'),last=text(input.lastName,100,'your last name');
       if(typeof input.password!=='string' || input.password.length<12 || Buffer.byteLength(input.password)>72)throw plotlineFailure(400,'INVALID_PASSWORD','Choose a password of at least 12 characters and at most 72 UTF-8 bytes.');
       const valid=await validatePassword(input.password,{accountId:pending.email});
       if(!valid.valid)throw plotlineFailure(400,'INVALID_PASSWORD',valid.message);
       const result=await rows(`INSERT INTO users(email,username,personal_email,password_hash,first_name,last_name,role,status,is_active,email_verified_at,has_provider_access,has_staff_access,has_hiring_access)
         VALUES(?,?,?,?,?,?,'staff','ACTIVE_EMPLOYEE',1,?,0,0,0)`,[pending.email,pending.email,pending.email,await hashPassword(input.password),first,last,sqlDate(now())],conn);
       userId=result.insertId;
     }
     await rows('UPDATE plotline_signups SET consumed_at=?,user_id=? WHERE id=?',[sqlDate(now()),userId,pending.id],conn);
     await audit(conn,userId,null,'plotline.email_verified',String(pending.id));
     return {verified:true,signInRequired:!existing};
   });
 }
 async function readDraft(userId,draftId,executor=db,{lock=false}={}){
   if(!uuid(draftId))throw plotlineFailure(404,'DRAFT_NOT_FOUND','Company draft not found.');
   const [draft]=await rows(`SELECT id,owner_user_id,revision,content_json,logo_sha256 FROM plotline_company_drafts WHERE id=? AND owner_user_id=?${lock?' FOR UPDATE':''}`,[draftId,userId],executor);
   if(!draft)throw plotlineFailure(404,'DRAFT_NOT_FOUND','Company draft not found.');
   return {id:draft.id,revision:draft.revision,...json(draft.content_json),hasLogo:!!draft.logo_sha256,logoVersion:draft.logo_sha256};
 }
 async function startDraft(userId,input={}){
   await assertEnabled(userId);await verifiedUser(userId);
   return transaction(async conn=>{
     await rows('SELECT id FROM users WHERE id=? FOR UPDATE',[userId],conn);
     if(input.newCompany!==true){const [draft]=await rows(`SELECT d.id FROM plotline_company_drafts d LEFT JOIN plotline_companies c ON c.draft_id=d.id WHERE d.owner_user_id=? AND c.agency_id IS NULL ORDER BY d.updated_at DESC LIMIT 1`,[userId],conn);if(draft)return readDraft(userId,draft.id,conn);}
     const [companies]=await rows('SELECT COUNT(*) total FROM plotline_companies WHERE owner_user_id=?',[userId],conn);
     if(Number(companies.total)>=plotlineCompanyLimit(userId))throw plotlineFailure(409,'COMPANY_LIMIT','Your account has reached its company trial limit. Request help from Plotline to add another company.');
     const [count]=await rows('SELECT COUNT(*) total FROM plotline_company_drafts WHERE owner_user_id=?',[userId],conn);
     if(Number(count.total)>=3)throw plotlineFailure(409,'COMPANY_LIMIT','Continue one of your saved drafts, or contact Plotline for help.');
     const draftId=crypto.randomUUID(),content=plotlineDraft();
     await rows('INSERT INTO plotline_company_drafts(id,owner_user_id,content_json,created_at,updated_at) VALUES(?,?,?,?,?)',[draftId,userId,JSON.stringify(content),sqlDate(now()),sqlDate(now())],conn);
     return readDraft(userId,draftId,conn);
   });
 }
 async function saveDraft(userId,draftId,input){
   await assertEnabled(userId);await verifiedUser(userId);const content=plotlineDraft(input);
   return transaction(async conn=>{
     const draft=await readDraft(userId,draftId,conn,{lock:true});
     const [created]=await rows('SELECT agency_id FROM plotline_companies WHERE draft_id=?',[draftId],conn);
     if(created)throw plotlineFailure(409,'COMPANY_ALREADY_CREATED','This company is ready. Open its workspace to edit branding.');
     if(input.revision!==draft.revision)throw plotlineFailure(409,'DRAFT_CHANGED','This draft changed in another window. Reload it before saving.');
     await rows('UPDATE plotline_company_drafts SET content_json=?,revision=revision+1,updated_at=? WHERE id=?',[JSON.stringify(content),sqlDate(now()),draftId],conn);
     return readDraft(userId,draftId,conn);
   });
 }
 async function logo(userId,draftId,file,revision,{companyId=null}={}){
   await assertEnabled(userId);await verifiedUser(userId);await readDraft(userId,draftId);
   if(companyId){const row=await member(userId,companyId,{owner:true});if(!plotlineTrial(row,now()).canWrite)throw plotlineFailure(409,'PLOTLINE_TRIAL_ENDED','This company is read-only.');}
   await transaction(async conn=>{
     const minute=now().toISOString().slice(0,16),day=now().toISOString().slice(0,10);
     await takeCapacity(conn,`logo:minute:${minute}`,4,'Logo processing is busy. Retry in one minute. Your saved brand is unchanged.');
     await takeCapacity(conn,`logo:account:${userId}:${day}`,10);
   });
   const prepared=await preparePlotlineLogo(file);
   return transaction(async conn=>{
     const draft=await readDraft(userId,draftId,conn,{lock:true});
     if(Number(revision)!==draft.revision)throw plotlineFailure(409,'DRAFT_CHANGED','Reload this draft before uploading.');
     const [company]=await rows('SELECT agency_id FROM plotline_companies WHERE draft_id=?',[draftId],conn);
     if(company && Number(company.agency_id)!==Number(companyId))throw plotlineFailure(409,'COMPANY_ALREADY_CREATED','Edit this company’s brand from its workspace.');
     await rows('UPDATE plotline_company_drafts SET logo_webp=?,logo_sha256=?,revision=revision+1,updated_at=? WHERE id=?',[prepared.buffer,prepared.sha256,sqlDate(now()),draftId],conn);
     if(company){const row=await member(userId,companyId,{owner:true,executor:conn});if(!plotlineTrial(row,now()).canWrite)throw plotlineFailure(409,'PLOTLINE_TRIAL_ENDED','This company is read-only.');await rows('UPDATE agencies SET logo_url=? WHERE id=?',[`/api/plotline/logos/${row.slug}.webp`,companyId],conn);await audit(conn,userId,companyId,'plotline.logo_updated',String(companyId));}
     return {...await readDraft(userId,draftId,conn),suggestedColors:{primary:prepared.primary,accent:prepared.accent}};
   });
 }
 async function draftLogo(userId,draftId){await readDraft(userId,draftId);const [row]=await rows('SELECT logo_webp FROM plotline_company_drafts WHERE id=?',[draftId]);if(!row?.logo_webp)throw plotlineFailure(404,'LOGO_NOT_FOUND','Logo not found.');return row.logo_webp;}
 async function member(userId,agencyId,{owner=false,executor=db}={}){
   await activeUser(userId,executor);
   const [row]=await rows(`SELECT p.*,a.name,a.slug,a.feature_flags,a.careers_page_json,a.theme_settings,ua.agency_role
    FROM plotline_companies p JOIN agencies a ON a.id=p.agency_id JOIN user_agencies ua ON ua.agency_id=a.id
    WHERE p.agency_id=? AND ua.user_id=? AND ua.is_active=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`,[agencyId,userId],executor);
   if(!row || owner && Number(row.owner_user_id)!==Number(userId))throw plotlineFailure(403,'COMPANY_ACCESS_REQUIRED','You do not have access to this company.');
   return row;
 }
 const companyView=row=>({agencyId:row.agency_id,name:row.name,slug:row.slug,industry:row.industry,timezone:row.timezone,
   trial:plotlineTrial(row,now()),careersPublished:json(row.feature_flags)?.plotlineCareersPublished===true,brand:json(row.theme_settings)?.plotlineBrand||plotlineBrand()});
 async function company(userId,agencyId){const row=await member(userId,agencyId);return {...companyView(row),isOwner:Number(row.owner_user_id)===Number(userId)};}
 async function workspace(userId){
   const user=await activeUser(userId);
   const companies=await rows(`SELECT p.*,a.name,a.slug,a.careers_page_json,a.theme_settings,a.feature_flags FROM plotline_companies p
    JOIN agencies a ON a.id=p.agency_id JOIN user_agencies ua ON ua.agency_id=a.id
    WHERE ua.user_id=? AND ua.is_active=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 ORDER BY p.created_at`,[userId]);
   return {email:user.email,emailVerified:!!user.email_verified_at,companyLimit:plotlineCompanyLimit(userId),canCreateCompany:companies.filter(row=>Number(row.owner_user_id)===Number(userId)).length<plotlineCompanyLimit(userId),companies:companies.map(row=>({...companyView(row),isOwner:Number(row.owner_user_id)===Number(userId)}))};
 }
 async function createCompany(userId,input){
   await assertEnabled(userId);const ownerIdentity=await verifiedUser(userId);
   if(input.authorized!==true || input.acceptTerms!==true)throw plotlineFailure(400,'CONFIRMATION_REQUIRED','Confirm that you can create this company and accept the platform terms.');
   await readDraft(userId,input.draftId);
   const [retained]=await rows('SELECT agency_id FROM plotline_companies WHERE draft_id=? AND owner_user_id=?',[input.draftId,userId]);
   if(retained)return {...await company(userId,retained.agency_id),alreadyCreated:true};
   // Resolve/verify transport before holding a company transaction or pool slot.
   const platformSender=await resolveSender();
   return transaction(async conn=>{
     await rows('SELECT id FROM users WHERE id=? FOR UPDATE',[userId],conn);
     const draft=await readDraft(userId,input.draftId,conn,{lock:true});
     const [existing]=await rows('SELECT agency_id FROM plotline_companies WHERE draft_id=?',[draft.id],conn);
     if(existing)return {...companyView(await member(userId,existing.agency_id,{executor:conn})),alreadyCreated:true};
     const [count]=await rows('SELECT COUNT(*) total FROM plotline_companies WHERE owner_user_id=?',[userId],conn);
     if(Number(count.total)>=plotlineCompanyLimit(userId))throw plotlineFailure(409,'COMPANY_LIMIT','Your account has reached its company trial limit. Contact Plotline to add another company.');
     if(input.revision!==draft.revision)throw plotlineFailure(409,'DRAFT_CHANGED','Reload and review your latest company details.');
     const name=text(draft.name,160,'your business name'),stamp=now(),end=new Date(stamp.getTime()+30*86400000);
     await takeCapacity(conn,`company:all:${stamp.toISOString().slice(0,10)}`,PLOTLINE_DAILY_COMPANY_LIMIT);
     const slugBase=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||'company';
     const slug=`${slugBase}-${crypto.randomBytes(4).toString('hex')}`;
     const permissions=Object.fromEntries(AGENCY_ACCESS_FIELDS.map(f=>[f.key,f.key==='has_hiring_access']));
     const brand=plotlineBrand(draft.brand),font=PLOTLINE_THEMES[brand.theme];
     const theme={plotlineBrand:brand,fontFamily:font.font,hireFontFamily:font.font,hirePrimaryColor:brand.primary};
     const careers={enabled:false,heroHeadline:brand.headline||'Make meaningful work happen.',lead:brand.introduction||brand.mission,brandWordmark:name,accentColor:brand.primary,fontFamily:font.font,headingFontFamily:font.heading};
     const flags={plotlineOnly:true,plotlineCareersPublished:false,hiringEnabled:true,peopleOpsEnabled:true,onboardingTraining:true,clinicalEnabled:false,medicalBillingEnabled:false,schoolPortalsEnabled:false,tutoringEnabled:false,hireAccountMode:'app_only'};
     const inserted=await rows(`INSERT INTO agencies(name,slug,portal_url,organization_type,is_active,feature_flags,color_palette,theme_settings,careers_page_json,timezone)
       VALUES(?,?,?,'agency',1,?,?,?,?,?)`,[name,slug,slug,JSON.stringify(flags),JSON.stringify({primary:brand.primary,accent:brand.accent}),JSON.stringify(theme),JSON.stringify(careers),draft.timezone],conn);
     const agencyId=inserted.insertId;
     if(draft.hasLogo)await rows('UPDATE agencies SET logo_url=? WHERE id=?',[`/api/plotline/logos/${slug}.webp`,agencyId],conn);
     await rows('INSERT INTO plotline_companies(agency_id,owner_user_id,draft_id,industry,timezone,is_qa,trial_started_at,trial_ends_at,terms_version,terms_accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      [agencyId,userId,draft.id,draft.industry,draft.timezone,qaAutomationActorFor(userId)?1:0,sqlDate(stamp),sqlDate(end),PLOTLINE_TERMS_VERSION,sqlDate(stamp),sqlDate(stamp)],conn);
     await rows("INSERT INTO agency_business_types(agency_id,business_type,is_enabled) VALUES(?,?,1)",[agencyId,draft.industry==='consulting'?'consulting':'other'],conn);
     await rows("INSERT INTO user_agencies(user_id,agency_id,is_active,agency_role) VALUES(?,?,1,'admin')",[userId,agencyId],conn);
     // Reuse an explicitly verified platform From, not a guessed customer alias.
     // The company gets its own scoped identity row and its verified owner's reply address.
     await rows(`INSERT INTO email_sender_identities(agency_id,identity_key,display_name,from_email,reply_to,is_active)
      VALUES(?,'notifications',?,?,?,1)`,[agencyId,`${name} via Plotline`,platformSender.from_email,ownerIdentity.email],conn);
     await rows(`INSERT INTO user_agency_access_profiles(user_id,agency_id,role_baseline,permissions_baseline,role_override,permissions_overrides,effective_role,effective_permissions)
      VALUES(?,?,'admin',?,'admin',?,'admin',?)`,[userId,agencyId,...Array(3).fill(JSON.stringify(permissions))],conn);
     await audit(conn,userId,agencyId,'plotline.company_created',String(agencyId),{industry:draft.industry,trialEndsAt:end.toISOString(),termsVersion:PLOTLINE_TERMS_VERSION,...(qaAutomationActorFor(userId)?{qaCompanyAuthorization:'owner-plotline-self-service-qa-2026-11-18',qaCompanyLimit:2}: {})});
     return {...companyView(await member(userId,agencyId,{executor:conn})),isOwner:true};
   });
 }
 async function continuation(userId,agencyId){await member(userId,agencyId,{owner:true});await rows('UPDATE plotline_companies SET continuation_requested_at=COALESCE(continuation_requested_at,?) WHERE agency_id=?',[sqlDate(now()),agencyId]);await audit(db,userId,agencyId,'plotline.continuation_requested',String(agencyId));return company(userId,agencyId);}
 async function saveBrand(userId,agencyId,input){
   await assertEnabled(userId);const brand=plotlineBrand(input.brand);
   return transaction(async conn=>{
     await rows('SELECT agency_id FROM plotline_companies WHERE agency_id=? FOR UPDATE',[agencyId],conn);
     const row=await member(userId,agencyId,{owner:true,executor:conn});
     if(!plotlineTrial(row,now()).canWrite)throw plotlineFailure(409,'PLOTLINE_TRIAL_ENDED','This company is read-only.');
     const draft=await readDraft(userId,row.draft_id,conn,{lock:true});
     if(input.revision!==draft.revision)throw plotlineFailure(409,'DRAFT_CHANGED','Reload branding before saving.');
     const font=PLOTLINE_THEMES[brand.theme],theme={...json(row.theme_settings),plotlineBrand:brand,fontFamily:font.font,hireFontFamily:font.font,hirePrimaryColor:brand.primary};
     const careers={...json(row.careers_page_json),heroHeadline:brand.headline||'Make meaningful work happen.',lead:brand.introduction||brand.mission,accentColor:brand.primary,fontFamily:font.font,headingFontFamily:font.heading};
     await rows('UPDATE agencies SET theme_settings=?,color_palette=?,careers_page_json=? WHERE id=?',[JSON.stringify(theme),JSON.stringify({primary:brand.primary,accent:brand.accent}),JSON.stringify(careers),agencyId],conn);
     await rows('UPDATE plotline_company_drafts SET content_json=?,revision=revision+1,updated_at=? WHERE id=?',[JSON.stringify({name:draft.name,industry:draft.industry,timezone:draft.timezone,brand}),sqlDate(now()),draft.id],conn);
     await audit(conn,userId,agencyId,'plotline.brand_updated',String(agencyId),{theme:brand.theme});
     return {...await readDraft(userId,draft.id,conn),company:companyView({...row,theme_settings:theme,careers_page_json:careers})};
   });
 }
 async function brandDraft(userId,agencyId){const row=await member(userId,agencyId,{owner:true});return readDraft(userId,row.draft_id);}
 async function companyLogo(userId,agencyId,file,revision){const row=await member(userId,agencyId,{owner:true});return logo(userId,row.draft_id,file,revision,{companyId:agencyId});}
 async function publish(userId,agencyId,input){
   if(typeof input.published!=='boolean' || input.reviewed!==true)throw plotlineFailure(400,'PUBLICATION_CONFIRMATION_REQUIRED','Review the company page before changing publication.');
   await assertEnabled(userId);
   return transaction(async conn=>{
     await rows('SELECT agency_id FROM plotline_companies WHERE agency_id=? FOR UPDATE',[agencyId],conn);
     const row=await member(userId,agencyId,{owner:true,executor:conn});
     if(!plotlineTrial(row,now()).canWrite)throw plotlineFailure(409,'PLOTLINE_TRIAL_ENDED','This company is read-only.');
     await rows('UPDATE agencies SET careers_page_json=?,feature_flags=? WHERE id=?',[JSON.stringify({...json(row.careers_page_json),enabled:input.published}),JSON.stringify({...json(row.feature_flags),plotlineCareersPublished:input.published}),agencyId],conn);
     await audit(conn,userId,agencyId,input.published?'plotline.careers_published':'plotline.careers_unpublished',String(agencyId));
     return {published:input.published};
   });
 }
 async function publicLogo(slug){
   if(!/^[a-z0-9-]{1,100}$/.test(slug))throw plotlineFailure(404,'LOGO_NOT_FOUND','Logo not found.');
   const [row]=await rows('SELECT d.logo_webp FROM plotline_companies p JOIN agencies a ON a.id=p.agency_id JOIN plotline_company_drafts d ON d.id=p.draft_id WHERE a.slug=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0',[slug]);
   if(!row?.logo_webp)throw plotlineFailure(404,'LOGO_NOT_FOUND','Logo not found.');
   return row.logo_webp;
 }
 async function events(userId,agencyId){await member(userId,agencyId,{owner:true});const result=await rows('SELECT id,actor_user_id actorUserId,action,object_id objectId,metadata_json metadata,created_at createdAt FROM plotline_audit_events WHERE agency_id=? ORDER BY id DESC LIMIT 200',[agencyId]);return {events:result.map(e=>({...e,metadata:json(e.metadata)}))};}
 return {availability,assertEnabled,requestVerification,verify,startDraft,readDraft,saveDraft,logo,draftLogo,workspace,company,member,createCompany,continuation,events,saveBrand,brandDraft,publish,publicLogo,companyLogo,copy:plotlineCopy};
}
export default createPlotlineSelfService();
