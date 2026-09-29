import express from 'express';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User, { invalidateUserAgenciesCache } from '../models/User.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { assertSchoolPortalAccess } from '../controllers/schoolPortalIntakeLinks.controller.js';
import { normalizeAgreementTerms, parseObject, renderSchoolCareBridgeAgreement, agreementHash, issueAgreement, scbError } from '../services/schoolCareBridgeAgreement.service.js';

const router = express.Router();
const wrap = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
const id = value => { const n=Number(value); if(!Number.isSafeInteger(n)||n<1) throw scbError(400,'Invalid identifier.'); return n; };
const slug = value => { const s=String(value||'').trim().toLowerCase(); if(!/^[a-z0-9][a-z0-9-]{1,79}$/.test(s)||['app','partners','admin','api','schoolcarebridge','login'].includes(s)) throw scbError(400,'Choose a unique portal address using letters, numbers and hyphens.'); return s; };
const text = (value,max=255) => String(value||'').trim().slice(0,max);
const image = value => { const v=text(value,1000); if(!v)return ''; if(/^\/(?:assets|uploads)\/[a-zA-Z0-9_./% -]+$/.test(v))return v; try{const u=new URL(v);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{} throw scbError(400,'Use an uploaded image path or HTTPS image URL.'); };
const publicPartner = row => ({ id:row.agency_id, name:row.name, slug:row.portal_url||row.slug, logoUrl:row.logo_url||row.logo_path||(row.slug==='itsco'?'/assets/itsco/logo.png':null), description:parseObject(row.settings_json).description||'' });
const selectPartners = `SELECT p.*, a.name,a.official_name,a.slug,a.portal_url,a.logo_url,a.logo_path,a.color_palette,a.support_team_email,a.feature_flags FROM schoolcarebridge_partners p JOIN agencies a ON a.id=p.agency_id WHERE p.is_active=TRUE AND a.is_active=TRUE AND COALESCE(a.is_archived,0)=0`;
async function partnerFor(req,{admin=false}={}) {
  const [[partner]]=await pool.execute(`${selectPartners} AND (a.portal_url=? OR a.slug=?) LIMIT 1`,[req.params.slug,req.params.slug]);
  if(!partner)throw scbError(404,'This partner workspace is unavailable.');
  if(req.user.role!=='super_admin'){
    const memberships=await User.getAgencies(req.user.id);
    if(!memberships.some(a=>Number(a.id)===Number(partner.agency_id)))throw scbError(403,'You do not have access to this agency.');
    if(admin && req.user.role!=='admin')throw scbError(403,'An agency administrator must make this change.');
  }
  return partner;
}
async function agreementFor(agencyId) {
  const [[row]]=await pool.execute(`SELECT g.*,a.name,a.official_name, op.name AS operator_name, op.official_name AS operator_official_name, EXISTS(SELECT 1 FROM signed_documents sd WHERE sd.task_id=g.agency_task_id AND sd.user_id=g.agency_signer_user_id AND sd.signed_pdf_path IS NOT NULL AND sd.pdf_hash IS NOT NULL) AS agency_signed, EXISTS(SELECT 1 FROM signed_documents sd WHERE sd.task_id=g.operator_task_id AND sd.user_id=g.operator_signer_user_id AND sd.signed_pdf_path IS NOT NULL AND sd.pdf_hash IS NOT NULL) AS operator_signed FROM schoolcarebridge_agreements g JOIN agencies a ON a.id=g.agency_id LEFT JOIN schoolcarebridge_program_config pc ON pc.id=1 LEFT JOIN agencies op ON op.id=pc.operator_agency_id WHERE g.agency_id=?`,[agencyId]);
  if(!row)return null;
  const terms=parseObject(row.terms_json);
  const html=row.rendered_html||renderSchoolCareBridgeAgreement({agencyName:row.official_name||row.name,operatorName:row.operator_official_name||row.operator_name||'MH4Kidz',terms,revision:row.revision});
  return {...row,terms,html,reviewHash:agreementHash(html),agency_signature_status:row.agency_signed?'completed':'pending',operator_signature_status:row.operator_signed?'completed':'pending',fullySigned:!!row.agency_signed&&!!row.operator_signed};
}

router.get('/partners',wrap(async(_req,res)=>{
  const [rows]=await pool.execute(`${selectPartners} AND p.public_listed=TRUE ORDER BY a.name`);
  res.json({partners:rows.map(publicPartner)});
}));
router.get('/partner-brand/:slug',wrap(async(req,res)=>{
  const [[row]]=await pool.execute(`${selectPartners} AND p.public_listed=TRUE AND (a.portal_url=? OR a.slug=?) LIMIT 1`,[req.params.slug,req.params.slug]);
  if(!row)throw scbError(404,'This partner is unavailable.');
  res.json({partner:publicPartner(row)});
}));
router.get('/my-partners',authenticate,wrap(async(req,res)=>{
  const [rows]=await pool.execute(`${selectPartners} ORDER BY a.name`);
  const members=await User.getAgencies(req.user.id);
  res.json({partners:rows.filter(p=>req.user.role==='super_admin'||members.some(a=>Number(a.id)===Number(p.agency_id))).map(p=>({...publicPartner(p),workspaceMode:p.workspace_mode}))});
}));
router.get('/tenants/:slug',authenticate,wrap(async(req,res)=>{
  const partner=await partnerFor(req);
  const candidates=await OrganizationAffiliation.listActiveOrganizationsForAgency(partner.agency_id);
  const schools=[];
  for(const school of candidates.filter(s=>s.organization_type==='school'&&s.is_active&&!s.is_archived)){
    try{await assertSchoolPortalAccess(req,school.id);schools.push({id:school.id,name:school.name,slug:school.portal_url||school.slug,logoUrl:school.logo_url||school.logo_path||school.icon_file_path||null});}catch(e){if(e.statusCode!==403)throw e;}
  }
  // Directory fields only; no personnel, compensation or private provider records.
  const [providers]=await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.credential FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=? AND ua.is_active=TRUE AND u.is_active=TRUE AND u.role IN ('provider','provider_plus','intern','intern_plus') ORDER BY u.last_name,u.first_name`,[partner.agency_id]);
  res.json({partner:{...publicPartner(partner),workspaceMode:partner.workspace_mode,settings:parseObject(partner.settings_json),supportEmail:partner.support_team_email||''},schools,providers,canManage:['admin','super_admin'].includes(req.user.role)});
}));
router.put('/tenants/:slug/settings',authenticate,wrap(async(req,res)=>{
  const partner=await partnerFor(req,{admin:true});
  const allowed=new Set(['supportEmail','description','welcomeMessage']);
  if(Object.keys(req.body||{}).some(k=>!allowed.has(k)))throw scbError(400,'Only the displayed SchoolCareBridge settings may be changed here.');
  const supportEmail=text(req.body.supportEmail);
  if(supportEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail))throw scbError(400,'Enter a valid support email.');
  const settings={...parseObject(partner.settings_json),description:text(req.body.description,600),welcomeMessage:text(req.body.welcomeMessage,600),supportEmail};
  await pool.execute('UPDATE schoolcarebridge_partners SET settings_json=? WHERE agency_id=?',[JSON.stringify(settings),partner.agency_id]);
  res.json({settings});
}));
router.post('/tenants/:slug/schools',authenticate,wrap(async(req,res)=>{
  const partner=await partnerFor(req,{admin:true});
  const name=text(req.body.name),portalSlug=slug(req.body.slug);
  if(!name)throw scbError(400,'Enter the school name.');
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[exists]]=await conn.execute('SELECT id FROM agencies WHERE slug=? OR portal_url=? LIMIT 1',[portalSlug,portalSlug]);
    if(exists)throw scbError(409,'That school address already exists. Ask the program administrator to link the existing school.');
    const [created]=await conn.execute(`INSERT INTO agencies (name,slug,portal_url,organization_type,is_active,color_palette,theme_settings) VALUES (?,?,?,'school',TRUE,?,?)`,[name,portalSlug,portalSlug,JSON.stringify({primary:'#174a6b'}),JSON.stringify({schoolCareBridge:{tagline:'Your school. Connected care.'}})]);
    await conn.execute('INSERT INTO organization_affiliations (agency_id,organization_id,is_active) VALUES (?,?,TRUE)',[partner.agency_id,created.insertId]);
    await conn.commit();res.status(201).json({school:{id:created.insertId,name,slug:portalSlug}});
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}));
router.get('/tenants/:slug/agreement',authenticate,wrap(async(req,res)=>{
  const partner=await partnerFor(req,{admin:true});res.json({agreement:await agreementFor(partner.agency_id)});
}));

router.get('/admin/partners',authenticate,requireSuperAdmin,wrap(async(_req,res)=>{
  const [partners]=await pool.execute(`${selectPartners} ORDER BY a.name`);res.json({partners:partners.map(p=>({...publicPartner(p),workspaceMode:p.workspace_mode,publicListed:!!p.public_listed}))});
}));
router.get('/admin/administrators',authenticate,requireSuperAdmin,wrap(async(_req,res)=>{
  const [users]=await pool.execute("SELECT id,first_name,last_name,email FROM users WHERE role IN ('admin','super_admin') AND is_active=TRUE ORDER BY last_name,first_name");
  res.json({users});
}));
router.post('/admin/tenants',authenticate,requireSuperAdmin,wrap(async(req,res)=>{
  const name=text(req.body.name),portalSlug=slug(req.body.slug),adminUserId=id(req.body.adminUserId);
  if(!name)throw scbError(400,'Enter an agency name.');
  const admin=await User.findById(adminUserId);
  if(!admin||!admin.is_active||!['admin','super_admin'].includes(admin.role))throw scbError(400,'Select an active administrator account as the tenant owner.');
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[exists]]=await conn.execute('SELECT id FROM agencies WHERE slug=? OR portal_url=? LIMIT 1',[portalSlug,portalSlug]);
    if(exists)throw scbError(409,'This agency already exists. Connect it using the existing-agency option.');
    const flags={schoolCareBridgeOnly:true,schoolPortalsEnabled:true,portalVariant:'healthcare_provider',googleSsoEnabled:false,payrollEnabled:false,medicalBillingEnabled:false,onboardingTrainingEnabled:false,clinicalNoteGeneratorEnabled:false};
    const [created]=await conn.execute(`INSERT INTO agencies (name,slug,portal_url,organization_type,is_active,logo_url,feature_flags) VALUES (?,?,?,'agency',TRUE,?,?)`,[name,portalSlug,portalSlug,image(req.body.logoUrl)||null,JSON.stringify(flags)]);
    await conn.execute('INSERT INTO user_agencies (user_id,agency_id,is_active) VALUES (?,?,TRUE)',[adminUserId,created.insertId]);
    await conn.execute(`INSERT INTO schoolcarebridge_partners (agency_id,workspace_mode,public_listed) VALUES (?,'standalone',FALSE)`,[created.insertId]);
    await conn.commit();invalidateUserAgenciesCache(adminUserId);res.status(201).json({agencyId:created.insertId,slug:portalSlug});
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}));
router.put('/admin/partners/:agencyId',authenticate,requireSuperAdmin,wrap(async(req,res)=>{
  const agencyId=id(req.params.agencyId),agency=await Agency.findById(agencyId);
  if(!agency||agency.organization_type!=='agency'||!agency.is_active||agency.is_archived)throw scbError(400,'Select an active agency.');
  // Existing agencies retain their full workspace. Standalone profiles are only
  // created through /admin/tenants, avoiding accidental ITSCO restrictions.
  await pool.execute(`INSERT INTO schoolcarebridge_partners (agency_id,workspace_mode,public_listed) VALUES (?,'connected',?) ON DUPLICATE KEY UPDATE public_listed=VALUES(public_listed),is_active=TRUE`,[agencyId,req.body.publicListed===true]);
  res.json({ok:true});
}));
router.get('/admin/partners/:agencyId/agreement',authenticate,requireSuperAdmin,wrap(async(req,res)=>res.json({agreement:await agreementFor(id(req.params.agencyId))})));
router.put('/admin/partners/:agencyId/agreement',authenticate,requireSuperAdmin,wrap(async(req,res)=>{
  const agencyId=id(req.params.agencyId),terms=normalizeAgreementTerms(req.body.terms);
  const [[partner]]=await pool.execute('SELECT agency_id FROM schoolcarebridge_partners WHERE agency_id=? AND is_active=TRUE',[agencyId]);
  if(!partner)throw scbError(404,'Partner not found.');
  if(req.body.revision==null){
    try{await pool.execute('INSERT INTO schoolcarebridge_agreements (agency_id,terms_json) VALUES (?,?)',[agencyId,JSON.stringify(terms)]);}catch(e){if(e.code==='ER_DUP_ENTRY')throw scbError(409,'A draft already exists. Refresh before editing.');throw e;}
  }else{
    const [result]=await pool.execute(`UPDATE schoolcarebridge_agreements SET terms_json=?,revision=revision+1 WHERE agency_id=? AND revision=? AND status='draft'`,[JSON.stringify(terms),agencyId,id(req.body.revision)]);
    if(!result.affectedRows)throw scbError(409,'The agreement changed or was issued. Refresh before editing.');
  }
  res.json({agreement:await agreementFor(agencyId)});
}));
router.get('/admin/partners/:agencyId/signers',authenticate,requireSuperAdmin,wrap(async(req,res)=>{
  const agencyId=id(req.params.agencyId);
  const [[operator]]=await pool.execute('SELECT operator_agency_id FROM schoolcarebridge_program_config WHERE id=1');
  const [users]=await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.email,ua.agency_id FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id IN (?,?) AND ua.is_active=TRUE AND u.is_active=TRUE AND u.role IN ('admin','super_admin') ORDER BY u.last_name,u.first_name`,[agencyId,operator?.operator_agency_id||0]);
  res.json({agency:users.filter(u=>Number(u.agency_id)===agencyId),operator:users.filter(u=>Number(u.agency_id)===Number(operator?.operator_agency_id))});
}));
router.post('/admin/agreements/:id/issue',authenticate,requireSuperAdmin,wrap(async(req,res)=>{
  res.status(201).json(await issueAgreement(pool,{agreementId:id(req.params.id),expectedRevision:id(req.body.revision),agencySignerId:id(req.body.agencySignerId),operatorSignerId:id(req.body.operatorSignerId),actorUserId:req.user.id,expectedHash:req.body.reviewHash}));
}));
export default router;
