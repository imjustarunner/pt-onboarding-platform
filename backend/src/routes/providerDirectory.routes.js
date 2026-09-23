import express from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import multer from 'multer';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { signupLimiter, authLimiter, recoveryLimiter, publicMarketingPageMetricsLimiter } from '../middleware/rateLimiter.middleware.js';
import EmailService from '../services/email.service.js';
import StorageService from '../services/storage.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { cleanProfile, publicProfile, directorySearchSql, submissionErrors, HERITAGES, json } from '../services/providerDirectoryProfile.service.js';

const router = express.Router();
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const random = () => crypto.randomBytes(32).toString('hex');
const fail = (status,message) => Object.assign(new Error(message),{status});
const run = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
const rows = async (sql,args=[],db=pool) => (await db.execute(sql,args))[0];
const passwordValid = p => typeof p==='string' && p.length>=12 && Buffer.byteLength(p)<=72;
const dto = m => ({id:m.id,email:m.email,username:m.username,role:m.member_role,verified:!!m.email_verified,optIn:!!m.opt_in,heritage:m.heritage||'',status:m.status,profile:json(m.draft_json),revision:m.revision,reviewNote:m.review_note||'',published:!!m.published_json});
const portalDto = p => ({slug:p.slug,name:p.name,website:p.website_url,heritageRequired:!!p.heritage_required,url:`${p.public_origin}${p.slug==='latinx'?'/latinx':`/provider-directory/${p.slug}`}`});
async function transaction(fn) { const db=await pool.getConnection(); try {await db.beginTransaction();const result=await fn(db);await db.commit();return result;} catch(e){await db.rollback();throw e;} finally {db.release();} }
async function tenantAdmin(user,agencyId) {
 if(!user || !['admin','super_admin'].includes(user.role)) throw fail(403,'Directory administration requires a tenant administrator.');
 if(user.role!=='super_admin' && !(await rows('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=?',[user.id,agencyId])).length) throw fail(403,'This directory belongs to another tenant.');
}
async function newSession(m) {
 const token=random();
 await rows('DELETE FROM provider_directory_sessions WHERE expires_at < UTC_TIMESTAMP()');
 await rows('INSERT INTO provider_directory_sessions(token_hash,member_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))',[hash(token),m.id]);
 return {token,member:dto(m)};
}
async function sendToken(p,m,purpose) {
 const token=random();
 await rows('DELETE FROM provider_directory_tokens WHERE member_id=? AND purpose=?',[m.id,purpose]);
 await rows('INSERT INTO provider_directory_tokens(token_hash,member_id,purpose,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))',[hash(token),m.id,purpose]);
 const url=`${portalDto(p).url}?${purpose}=${token}`;
 const result=await EmailService.sendEmail({to:m.email,agencyId:p.agency_id,subject:`${p.name}: ${purpose==='verify'?'verify your email':'reset your directory password'}`,text:`${purpose==='verify'?'Verify your email to submit your provider profile':'Reset your directory password'} using this link (valid for one hour):\n\n${url}\n\nIf you did not request this, you can ignore this email.`,linkUrl:url,templateType:'provider_directory_account'});
 if(result?.skipped || result?.success===false) throw fail(503,'Account email could not be sent. Please retry or contact the directory administrator.');
}

// These routes accept the existing app login only. They cannot be reached with a
// directory session and never grant employment, clinical or other tenant access.
router.get('/manage',authenticate,run(async(req,res)=>{
 if(!['admin','super_admin'].includes(req.user?.role)) throw fail(403,'Administrator access required.');
 const portals=await rows(`SELECT p.* FROM provider_directory_portals p WHERE p.is_active=1 ${req.user.role==='super_admin'?'':'AND p.agency_id IN (SELECT agency_id FROM user_agencies WHERE user_id=?)'}`,req.user.role==='super_admin'?[]:[req.user.id]);
 res.json(portals.map(p=>({...portalDto(p),agencyId:p.agency_id})));
}));
router.post('/manage',authenticate,run(async(req,res)=>{
 const {agencyId,name,slug}=req.body;
 await tenantAdmin(req.user,Number(agencyId));
 if(!/^[a-z][a-z0-9-]{2,60}$/.test(slug||'') || !String(name||'').trim()) throw fail(400,'Provide a directory name and a unique lowercase URL name.');
 await rows('INSERT INTO provider_directory_portals(slug,agency_id,name) VALUES(?,?,?)',[slug,agencyId,String(name).trim().slice(0,255)]);
 res.status(201).json({slug});
}));
router.param('slug',(req,res,next,slug)=>{
 rows('SELECT * FROM provider_directory_portals WHERE slug=? AND is_active=1',[slug]).then(p=>{if(!p[0]) throw fail(404,'Directory not found.');req.portal=p[0];next();}).catch(next);
});
router.post('/:slug/admin-session',authenticate,run(async(req,res)=>{
 await tenantAdmin(req.user,req.portal.agency_id);
 let [m]=await rows('SELECT * FROM provider_directory_members WHERE portal_id=? AND user_id=?',[req.portal.id,req.user.id]);
 if(m && m.member_role!=='admin') throw fail(409,'This account is a provider in this directory. Use a separate administrator account.');
 if(!m){
  const [u]=await rows('SELECT email,username FROM users WHERE id=?',[req.user.id]);
  const result=await rows("INSERT INTO provider_directory_members(portal_id,user_id,email,username,member_role,email_verified) VALUES(?,?,?,?,'admin',1)",[req.portal.id,req.user.id,u.email,`admin-${req.user.id}`]);
  [m]=await rows('SELECT * FROM provider_directory_members WHERE id=?',[result.insertId]);
 }
 if(!m.is_active) throw fail(403,'Directory account is disabled.');
 res.json(await newSession(m));
}));
router.get('/:slug/platform-membership',authenticate,run(async(req,res)=>{
 const [m]=await rows('SELECT * FROM provider_directory_members WHERE portal_id=? AND user_id=?',[req.portal.id,req.user.id]);
 const heritageRows=await rows("SELECT v.value FROM user_info_values v JOIN user_info_field_definitions f ON f.id=v.field_definition_id WHERE v.user_id=? AND f.field_key IN ('provider_marketing_ethnicity','ethnicity','heritage')",[req.user.id]);
 const eligible=heritageRows.some(r=>/hispanic|latin[oaex]/i.test(r.value||''));
 res.json({member:m?dto(m):null,eligible});
}));
router.post('/:slug/platform-membership',authenticate,run(async(req,res)=>{
 const [u]=await rows('SELECT id,email,first_name,last_name,role,has_provider_access,is_active FROM users WHERE id=?',[req.user.id]);
 if(!u?.is_active || (!['provider','provider_plus','intern','intern_plus'].includes(u.role) && !u.has_provider_access)) throw fail(403,'Provider access is required.');
 let [m]=await rows('SELECT * FROM provider_directory_members WHERE portal_id=? AND user_id=?',[req.portal.id,u.id]);
 if(m?.member_role==='admin') throw fail(409,'Use a separate provider account for your listing.');
 if(req.body.optIn!==true){
  if(m) await rows("UPDATE provider_directory_members SET opt_in=0,published_json=NULL,status=IF(status='suspended','suspended','draft'),revision=revision+1 WHERE id=?",[m.id]);
  return res.json({withdrawn:true});
 }
 const heritage=String(req.body.heritage||'');
 if(req.portal.heritage_required && !HERITAGES.includes(heritage)) throw fail(400,'Confirm your self-identified heritage.');
 if(!m){
  const profile=cleanProfile({name:`${u.first_name||''} ${u.last_name||''}`.trim()});
  const result=await rows('INSERT INTO provider_directory_members(portal_id,user_id,email,username,email_verified,opt_in,heritage,draft_json) VALUES(?,?,?,?,1,1,?,?)',[req.portal.id,u.id,u.email,`provider-${u.id}`,heritage,JSON.stringify(profile)]);
  [m]=await rows('SELECT * FROM provider_directory_members WHERE id=?',[result.insertId]);
 } else {
  await rows('UPDATE provider_directory_members SET opt_in=1,heritage=? WHERE id=?',[heritage,m.id]);
  [m]=await rows('SELECT * FROM provider_directory_members WHERE id=?',[m.id]);
 }
 if(!m.is_active || m.status==='suspended') throw fail(403,'Contact the directory administrator about your account.');
 res.json(await newSession(m));
}));

router.use('/:slug',publicMarketingPageMetricsLimiter);
router.get('/:slug',run(async(req,res)=>res.json(portalDto(req.portal))));
router.get('/:slug/providers',run(async(req,res)=>{
 const search=directorySearchSql(req.portal.id,req.query);
 const [count]=await rows(`SELECT COUNT(*) AS total FROM provider_directory_members WHERE ${search.where}`,search.args);
 const members=await rows(`SELECT id,published_json FROM provider_directory_members WHERE ${search.where} ORDER BY JSON_UNQUOTE(JSON_EXTRACT(published_json,'$.name')),id LIMIT 24 OFFSET ${search.offset}`,search.args);
 res.json({total:Number(count.total),providers:members.map(publicProfile)});
}));
router.post('/:slug/register',signupLimiter,run(async(req,res)=>{
 const email=String(req.body.email||'').trim().toLowerCase(),username=String(req.body.username||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||! /^[a-z0-9._-]{3,60}$/.test(username)||!passwordValid(req.body.password)) throw fail(400,'Enter a valid email, a username (3–60 letters, numbers, dots or dashes), and a password of at least 12 characters (maximum 72 bytes).');
 const password=await bcrypt.hash(req.body.password,12);
 let result;
 try{result=await rows('INSERT INTO provider_directory_members(portal_id,email,username,password_hash,draft_json) VALUES(?,?,?,?,?)',[req.portal.id,email,username,password,JSON.stringify(cleanProfile({}))]);}catch(e){if(e.code==='ER_DUP_ENTRY') throw fail(409,'An account already uses that email or username. Sign in or reset your password.');throw e;}
 const [m]=await rows('SELECT * FROM provider_directory_members WHERE id=?',[result.insertId]);
 let emailNotice='Check your email to verify your account.';
 try{await sendToken(req.portal,m,'verify');}catch{emailNotice='Your account was saved, but the verification email could not be sent. Use Resend verification to try again.';}
 res.status(201).json({...await newSession(m),notice:emailNotice});
}));
router.post('/:slug/login',authLimiter,run(async(req,res)=>{
 const identifier=String(req.body.username||'').trim().toLowerCase();
 const [m]=await rows('SELECT * FROM provider_directory_members WHERE portal_id=? AND (username=? OR email=?)',[req.portal.id,identifier,identifier]);
 const valid=await bcrypt.compare(String(req.body.password||'').slice(0,200),m?.password_hash || '$2b$12$JTXIfIB5CdCO8fpifVD49usGOEp5GBVLFR72TyV.j2huIVRQtn.6W');
 if(!m?.is_active || !valid) throw fail(401,'Username or password is incorrect.');
 res.json(await newSession(m));
}));
router.post('/:slug/recover',recoveryLimiter,run(async(req,res)=>{
 const [m]=await rows('SELECT * FROM provider_directory_members WHERE portal_id=? AND email=? AND is_active=1',[req.portal.id,String(req.body.email||'').trim().toLowerCase()]);
 if(m) {try{await sendToken(req.portal,m,'reset');}catch(e){console.warn('[provider-directory] Password recovery delivery failed',e.status||'delivery');}}
 res.json({message:'If an account exists, a password reset link will be emailed to you.'});
}));
router.post('/:slug/token',recoveryLimiter,run(async(req,res)=>{
 const purpose=req.body.purpose;
 if(!['verify','reset'].includes(purpose)||! /^[a-f0-9]{64}$/.test(req.body.token||'')) throw fail(400,'Invalid link.');
 if(purpose==='reset'&&!passwordValid(req.body.password)) throw fail(400,'Use at least 12 characters, up to 72 bytes.');
 const password=purpose==='reset'?await bcrypt.hash(req.body.password,12):null;
 await transaction(async db=>{
  const [t]=await rows('SELECT t.* FROM provider_directory_tokens t JOIN provider_directory_members m ON m.id=t.member_id WHERE t.token_hash=? AND t.purpose=? AND t.expires_at>UTC_TIMESTAMP() AND m.portal_id=? AND m.is_active=1 FOR UPDATE',[hash(req.body.token),purpose,req.portal.id],db);
  if(!t) throw fail(400,'This link has expired or has already been used.');
  if(purpose==='verify') await rows('UPDATE provider_directory_members SET email_verified=1 WHERE id=?',[t.member_id],db);
  else {await rows('UPDATE provider_directory_members SET password_hash=?,email_verified=1 WHERE id=?',[password,t.member_id],db);await rows('DELETE FROM provider_directory_sessions WHERE member_id=?',[t.member_id],db);}
  await rows('DELETE FROM provider_directory_tokens WHERE token_hash=?',[hash(req.body.token)],db);
 });
 res.json({message:purpose==='verify'?'Email verified. You can now submit your profile.':'Password updated. Sign in with your new password.'});
}));
async function loadSession(req,res,next){
 try {
  const token=String(req.get('X-Directory-Session')||'');
  if(!/^[a-f0-9]{64}$/.test(token)) throw fail(401,'Sign in to your directory account.');
  const [m]=await rows('SELECT m.* FROM provider_directory_sessions s JOIN provider_directory_members m ON m.id=s.member_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() AND m.portal_id=? AND m.is_active=1',[hash(token),req.portal.id]);
  if(!m) throw fail(401,'Your session has expired. Please sign in.');
  if(m.member_role==='admin') {
   const [u]=await rows('SELECT id,role,is_active,status FROM users WHERE id=?',[m.user_id]);
   if(!u?.is_active || ['ARCHIVED','INACTIVE_EMPLOYEE','TERMINATED_PENDING'].includes(u.status)) throw fail(403,'Administrator account is inactive.');
   await tenantAdmin(u,req.portal.agency_id);
  }
  req.member=m;next();
 }catch(e){next(e);}
}
router.use('/:slug/me',loadSession);
router.get('/:slug/me',run(async(req,res)=>res.json(dto(req.member))));
router.post('/:slug/me/logout',run(async(req,res)=>{await rows('DELETE FROM provider_directory_sessions WHERE token_hash=?',[hash(req.get('X-Directory-Session'))]);res.json({ok:true});}));
router.post('/:slug/me/verify',recoveryLimiter,run(async(req,res)=>{if(!req.member.email_verified) await sendToken(req.portal,req.member,'verify');res.json({message:'Verification email sent. Check your inbox.'});}));
router.put('/:slug/me/password',recoveryLimiter,run(async(req,res)=>{
 if(!passwordValid(req.body.password)) throw fail(400,'Use at least 12 characters, up to 72 bytes.');
 if(req.member.password_hash && !await bcrypt.compare(String(req.body.currentPassword||''),req.member.password_hash)) throw fail(400,'Current password is incorrect.');
 await transaction(async db=>{await rows('UPDATE provider_directory_members SET password_hash=? WHERE id=?',[await bcrypt.hash(req.body.password,12),req.member.id],db);await rows('DELETE FROM provider_directory_sessions WHERE member_id=?',[req.member.id],db);});
 res.json(await newSession(req.member));
}));
router.put('/:slug/me',run(async(req,res)=>{
 if(req.member.member_role!=='provider') throw fail(403,'Provider profile required.');
 if(req.member.status==='suspended') throw fail(403,'Contact the directory administrator to reactivate your profile.');
 const profile=cleanProfile(req.body.profile,req.member.photo_url),heritage=HERITAGES.includes(req.body.heritage)?req.body.heritage:null;
 const optIn=req.body.optIn===true;
 const result=await rows("UPDATE provider_directory_members SET draft_json=?,heritage=?,opt_in=?,published_json=IF(?=0,NULL,published_json),status='draft',revision=revision+1 WHERE id=? AND revision=? AND status<>'suspended'",[JSON.stringify(profile),heritage,optIn,optIn,req.member.id,Number(req.body.revision)]);
 if(!result.affectedRows) throw fail(409,'Your profile changed in another window. Reload before saving.');
 const [m]=await rows('SELECT * FROM provider_directory_members WHERE id=?',[req.member.id]);res.json(dto(m));
}));
router.post('/:slug/me/submit',run(async(req,res)=>{
 await transaction(async db=>{
  const [m]=await rows('SELECT * FROM provider_directory_members WHERE id=? FOR UPDATE',[req.member.id],db);
  if(m.member_role!=='provider'||m.status==='suspended') throw fail(403,'This profile cannot be submitted.');
  const errors=submissionErrors(cleanProfile(json(m.draft_json),m.photo_url),{heritageRequired:!!req.portal.heritage_required,heritage:m.heritage,optIn:!!m.opt_in,verified:!!m.email_verified});
  if(errors.length) throw fail(400,errors.join(' '));
  await rows("UPDATE provider_directory_members SET status='pending',revision=revision+1 WHERE id=?",[m.id],db);
  await rows("INSERT INTO provider_directory_reviews(member_id,actor_member_id,action,revision) VALUES(?,?,'submitted',?)",[m.id,m.id,m.revision+1],db);
 });
 const [m]=await rows('SELECT * FROM provider_directory_members WHERE id=?',[req.member.id]);res.json(dto(m));
}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}});
router.post('/:slug/me/photo',upload.single('photo'),run(async(req,res)=>{
 if(req.member.member_role!=='provider'||req.member.status==='suspended') throw fail(403,'Provider profile required.');
 const b=req.file?.buffer;
 let ext='';
 if(b?.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ext='png';
 else if(b?.[0]===255&&b?.[1]===216&&b?.[2]===255) ext='jpg';
 else if(b?.toString('ascii',0,4)==='RIFF'&&b?.toString('ascii',8,12)==='WEBP') ext='webp';
 if(!ext) throw fail(400,'Upload a PNG, JPEG or WebP photo under 5 MB.');
 const saved=await StorageService.savePublicMarketingAsset(b,`directory-${random()}.${ext}`,`image/${ext==='jpg'?'jpeg':ext}`);
 const url=publicUploadsUrlFromStoredPath(saved.relativePath);
 await rows('UPDATE provider_directory_members SET photo_url=?,draft_json=JSON_SET(COALESCE(draft_json,JSON_OBJECT()),\'$.photoUrl\',?),revision=revision+1,status=\'draft\' WHERE id=?',[url,url,req.member.id]);
 const [m]=await rows('SELECT * FROM provider_directory_members WHERE id=?',[req.member.id]);res.json(dto(m));
}));
router.use('/:slug/review',loadSession,(req,res,next)=>req.member.member_role==='admin'?next():next(fail(403,'Directory administrator required.')));
router.get('/:slug/review',run(async(req,res)=>{
 const members=await rows("SELECT * FROM provider_directory_members WHERE portal_id=? AND member_role='provider' ORDER BY (status='pending') DESC,updated_at DESC",[req.portal.id]);
 res.json(members.map(dto));
}));
router.post('/:slug/review/:id',run(async(req,res)=>{
 const action=req.body.action;
 if(!['approved','changes_requested','rejected','suspended'].includes(action)) throw fail(400,'Choose a review action.');
 const note=String(req.body.note||'').trim().slice(0,4000);
 if(action!=='approved'&&!note) throw fail(400,'Add a note explaining this decision to the provider.');
 await transaction(async db=>{
  const [m]=await rows("SELECT * FROM provider_directory_members WHERE id=? AND portal_id=? AND member_role='provider' FOR UPDATE",[req.params.id,req.portal.id],db);
  if(!m) throw fail(404,'Provider not found.');
  if(m.revision!==Number(req.body.revision)) throw fail(409,'This profile has changed. Reload the review before deciding.');
  if(action==='approved') {
   if(m.status!=='pending') throw fail(409,'Only submitted profiles can be approved.');
   const errors=submissionErrors(cleanProfile(json(m.draft_json),m.photo_url),{heritageRequired:!!req.portal.heritage_required,heritage:m.heritage,optIn:!!m.opt_in,verified:!!m.email_verified});
   if(errors.length) throw fail(400,errors.join(' '));
  }
  // Asking for changes keeps the previously approved snapshot. Rejection and suspension remove it.
  await rows('UPDATE provider_directory_members SET status=?,published_json=?,review_note=?,reviewed_by=?,revision=revision+1 WHERE id=?',[action,action==='approved'?JSON.stringify(cleanProfile(json(m.draft_json),m.photo_url)):action==='changes_requested'?(m.published_json?JSON.stringify(json(m.published_json)):null):null,note,req.member.id,m.id],db);
  await rows('INSERT INTO provider_directory_reviews(member_id,actor_member_id,action,revision,note) VALUES(?,?,?,?,?)',[m.id,req.member.id,action,m.revision,note],db);
 });
 res.json({ok:true});
}));
router.use((err,req,res,next)=>{
 if(res.headersSent) return next(err);
 const status=err.status||(err.code==='ER_DUP_ENTRY'?409:err.code==='LIMIT_FILE_SIZE'?413:500);
 if(status===500) console.error('[provider-directory]',err.code||err.name);
 res.status(status).json({error:{message:status===500?'The directory could not complete this request. Please try again.':err.code==='ER_DUP_ENTRY'?'That account or URL already exists.':err.message}});
});
export default router;
