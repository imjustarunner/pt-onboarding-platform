import crypto from 'node:crypto';
import pool from '../config/database.js';
import { encryptFamilyBilling as seal, decryptFamilyBilling as open } from './familyBillingEncryption.service.js';
import { validateFile } from './finance/documents.js';
import { fail, hash, text } from './auricwell/policy.js';
import { validDate } from './supervisedBillingPolicy.service.js';
import * as agreements from './auricwell/agreements.js';
import { agreementHtml } from './organizationAgreementHtml.js';
import { partnerAgreementSuggestion } from './organizationAgreementTemplates.js';
import { isIndependentPracticeOwner } from '../utils/independentPracticeOwner.js';
import { isNoteworthyPractice } from './noteworthyRoster.service.js';

const adminRoles = ['admin', 'agency_admin'];
const activeUser = "u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE')";
// PlotTwistCo administrators act for explicitly managed companies. Employment
// at another tenant never grants access to its business agreements.
const managedOperator = (user='u',agency='a') => `(${user}.role IN ('admin','agency_admin') AND EXISTS (
  SELECT 1 FROM user_agencies om JOIN agencies manager ON manager.id=om.agency_id
  WHERE om.user_id=${user}.id AND om.is_active=1 AND manager.slug='plottwistco'
    AND manager.is_active=1 AND COALESCE(manager.is_archived,0)=0
    AND (manager.id=${agency}.id OR EXISTS(SELECT 1 FROM agency_billing_management bm
      WHERE bm.agency_id=${agency}.id AND bm.manager_agency_id=manager.id AND bm.is_active=1))))`;
const aad = (agencyId, kind, id) => `organization-agreement:${agencyId}:${kind}:${id}`;
const recordId = value => {
  if (!/^[a-f0-9-]{36}$/i.test(String(value || ''))) throw fail(400, 'Choose a valid agreement.');
  return value;
};
const decode = row => ({ id: row.id, kind: row.kind, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at, data: open(row.payload, aad(row.agency_id, row.kind, row.id)) });
export function assertAdministrator(user, member, {owner=false,operator=false}={}) {
  if (!user || !(user.role === 'super_admin' || (adminRoles.includes(user.role) && member) || (owner && member) || operator)) throw fail(403, 'Active organization administrator access is required.');
}
export async function scopeFor(userId, agencyId, db = pool) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1) throw fail(400, 'Choose an organization.');
  const [[user]] = await db.execute(`SELECT u.id,u.role,u.first_name,u.last_name,${managedOperator()} AS operator_admin FROM users u JOIN agencies a ON a.id=? WHERE u.id=? AND ${activeUser}`, [agencyId,userId]);
  const [[agency]] = await db.execute('SELECT id,name,slug FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0', [agencyId]);
  if (!agency) throw fail(404, 'Organization unavailable.');
  const [[member]] = await db.execute('SELECT user_id FROM user_agencies WHERE agency_id=? AND user_id=? AND is_active=1', [agencyId, userId]);
  let noteworthyOwner=false;
  if(user && member && await isNoteworthyPractice(agencyId,db)) {
    const [[record]]=await db.execute('SELECT agency_id FROM noteworthy_practices WHERE agency_id=? AND owner_user_id=?',[agencyId,userId]);
    noteworthyOwner=!!record;
  }
  const owner=noteworthyOwner || (user && member && !adminRoles.includes(user.role) && user.role!=='super_admin' ? await isIndependentPracticeOwner(userId,agencyId,db) : false);
  const operator=!!user?.operator_admin;
  assertAdministrator(user, !!member,{owner,operator});
  return { agencyId: Number(agency.id), organization: agency, userId: Number(user.id), accountId: String(user.id), actorType: 'staff', permissions: ['agreements'], patientIds: [], profile: { operator: user.role === 'super_admin' || operator, name: [user.first_name,user.last_name].filter(Boolean).join(' ') } };
}
export async function organizations(userId, db = pool) {
  const [rows] = await db.execute(`SELECT DISTINCT a.id,a.name,a.slug FROM agencies a JOIN users u ON u.id=? WHERE a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND ${activeUser} AND (u.role='super_admin' OR ${managedOperator()} OR (EXISTS (SELECT 1 FROM user_agencies m WHERE m.agency_id=a.id AND m.user_id=u.id AND m.is_active=1) AND (u.role IN ('admin','agency_admin') OR (a.account_owner_user_id=u.id AND a.organization_type IN ('life_coach','consultant'))))) ORDER BY a.name`, [userId]);
  // Keep the original business-administration policy and add only practices this
  // payroll customer owns. Employees receive no organization agreement access.
  let noteworthy=[];
  try { [noteworthy]=await db.execute(`SELECT a.id,a.name,a.slug FROM noteworthy_practices n JOIN agencies a ON a.id=n.agency_id
    JOIN user_agencies m ON m.agency_id=a.id AND m.user_id=n.owner_user_id JOIN users u ON u.id=n.owner_user_id
    WHERE n.owner_user_id=? AND m.is_active=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND ${activeUser}`,[userId]); }
  catch(error) {if(error.code!=='ER_NO_SUCH_TABLE')throw error;}
  return Array.from(new Map([...rows,...noteworthy].map(row=>[row.id,row])).values()).sort((a,b)=>a.name.localeCompare(b.name));
}
export async function signerOptions(ctx, db = pool) {
  const [rows] = await db.execute(`SELECT u.id,u.role,CONCAT_WS(' ',u.first_name,u.last_name) name, (u.role='super_admin' OR ${managedOperator()}) operator_admin,
    (EXISTS(SELECT 1 FROM user_agencies m WHERE m.agency_id=a.id AND m.user_id=u.id AND m.is_active=1) AND (u.role IN ('super_admin','admin','agency_admin') OR (a.account_owner_user_id=u.id AND a.organization_type IN ('life_coach','consultant')))) organization_member
    FROM users u JOIN agencies a ON a.id=? WHERE ${activeUser} HAVING operator_admin=1 OR organization_member=1 ORDER BY name`, [ctx.agencyId]);
  const result=rows.map(r => ({ id: String(r.id), name: r.name, operator: !!r.operator_admin, organization: !!r.organization_member }));
  if(await isNoteworthyPractice(ctx.agencyId,db)) {
    const [[owner]]=await db.execute(`SELECT u.id,CONCAT_WS(' ',u.first_name,u.last_name) name FROM noteworthy_practices n
      JOIN users u ON u.id=n.owner_user_id JOIN user_agencies m ON m.user_id=u.id AND m.agency_id=n.agency_id
      WHERE n.agency_id=? AND m.is_active=1 AND ${activeUser}`,[ctx.agencyId]);
    if(owner && !result.some(s=>s.id===String(owner.id)))result.push({id:String(owner.id),name:owner.name,operator:false,organization:true});
  }
  return result;
}
async function transaction(work) {
  const db = await pool.getConnection();
  try { await db.beginTransaction(); const result = await work(db); await db.commit(); return result; }
  catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
async function audit(ctx, action, id, details = {}, db = pool) {
  await db.execute('INSERT INTO organization_agreement_audit (agency_id,record_id,actor_user_id,action,details) VALUES (?,?,?,?,?)', [ctx.agencyId,id || null,ctx.userId,action,seal(details,`organization-agreement-audit:${ctx.agencyId}`)]);
}
async function get(ctx, kind, id, db = pool, lock = false) {
  const [[row]] = await db.execute(`SELECT * FROM organization_agreement_records WHERE agency_id=? AND kind=? AND id=?${lock ? ' FOR UPDATE' : ''}`, [ctx.agencyId,kind,recordId(id)]);
  if (!row) throw fail(404, 'Document unavailable in this organization.');
  return decode(row);
}
async function create(ctx, kind, data, {sourceKey = null, id = crypto.randomUUID()} = {}, db = pool) {
  await db.execute('INSERT INTO organization_agreement_records (id,agency_id,kind,source_key,payload) VALUES (?,?,?,?,?)',[id,ctx.agencyId,kind,sourceKey,seal(data,aad(ctx.agencyId,kind,id))]);
  await audit(ctx,`${kind}.created`,id,{},db);
  return get(ctx,kind,id,db);
}
async function update(ctx, record, data, db = pool) {
  const [result] = await db.execute('UPDATE organization_agreement_records SET payload=?,revision=revision+1 WHERE agency_id=? AND kind=? AND id=? AND revision=?',[seal(data,aad(ctx.agencyId,record.kind,record.id)),ctx.agencyId,record.kind,record.id,record.revision]);
  if (!result.affectedRows) throw fail(409,'This document changed. Refresh before continuing.');
  await audit(ctx,`${record.kind}.updated`,record.id,{status:data.status},db);
  return get(ctx,record.kind,record.id,db);
}
export const organizationAgreementStore = {
  create,get,update,transaction,audit,
  async lockPractice(ctx,db) { await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[ctx.agencyId]); },
  async signerAuthority(ctx, signer, data, db = pool) {
    const option = (await signerOptions(ctx,db)).find(s => s.id === signer.accountId);
    if (!option) throw fail(400,'Select an active authorized organization or operator signer.');
    return { operator: option.operator && signer.accountId === data.signers[0].accountId, practice: option.organization && signer.accountId === data.signers[1].accountId };
  },
  signatureEvidence(ctx) { return { userId:ctx.userId, authenticatedName:ctx.profile.name, ipAddress:ctx.signatureRequest?.ipAddress || null, userAgent:ctx.signatureRequest?.userAgent || null }; }
};
export function completedParties(input,type='baa',{draft=false}={}) {
  const result={};
  for(const side of ['practice','operator']) {
    const p=input?.[side] || {};
    const field=(value,label,max,optional=false)=>draft || optional?String(value || '').trim().slice(0,max):text(value,label,max);
    result[side]={legalName:field(p.legalName,'Actual contracting legal entity',255),address:field(p.address,'Legal address',1000),noticeContact:field(p.noticeContact,type==='management_agreement'?'Business notice contact':'Privacy / incident notice contact',1000),hipaaRole:field(p.hipaaRole,'Contracting HIPAA role',200,type==='management_agreement')};
    if(/^(schoolcarebridge|auricwell|plotline)$/i.test(result[side].legalName)) throw fail(400,'Use the actual legal entity, not a product brand (SchoolCareBridge is operated by MH4Kidz).');
  }
  if(result.practice.legalName && result.practice.legalName.toLowerCase()===result.operator.legalName.toLowerCase()) throw fail(400,'Identify distinct contracting legal entities.');
  return result;
}
export const agreementActions = Object.fromEntries(['issue','revise'].map(action => [action, (ctx,...args) => agreements[`${action}Agreement`](ctx,...args,organizationAgreementStore)]));
agreementActions.create=async(ctx,input={})=> {
  const type=input.type || 'baa';
  if(!['baa','management_agreement'].includes(type)) throw fail(400,'Choose a BAA or management agreement.');
  const initial=await agreements.createAgreement(ctx,{type},organizationAgreementStore);
  const record=await update(ctx,initial,{...initial.data,branding:{operator:'Plot Twist Co.',practice:ctx.organization.name}});
  if(type==='management_agreement') return record;
  const suggestion=partnerAgreementSuggestion(ctx.organization);
  if(!suggestion) return record;
  return update(ctx,record,{...record.data,parties:{practice:{legalName:suggestion.suggestedLegalName,address:'',noticeContact:'',hipaaRole:''},operator:{legalName:'',address:'',noticeContact:'',hipaaRole:''}},templateSuggestion:{key:suggestion.key,note:suggestion.note,sources:suggestion.sources,requiresLegalReview:true}});
};
agreementActions.sign=(ctx,id,input)=>agreements.signAgreement(ctx,id,input,organizationAgreementStore);
agreementActions.approve=async(ctx,id,input)=> {
  if(input?.legalApproved!==true || typeof input.reviewHash!=='string') throw fail(409,'Review and approve this exact completed document before issuance.');
  const record=await get(ctx,'agreement',id);
  completedParties(record.data.parties,record.data.type);
  return agreements.approveAgreement(ctx,id,organizationAgreementStore,input.reviewHash);
};
agreementActions.save=async(ctx,id,input)=> {
  const record=await get(ctx,'agreement',id);
  const parties=completedParties(input.parties,record.data.type,{draft:true});
  if(input.signers?.length!==2) throw fail(400,'Select one operator signer and one organization signer.');
  const options=await signerOptions(ctx);
  if(!options.some(s=>s.id===input.signers[0].accountId && s.operator) || !options.some(s=>s.id===input.signers[1].accountId && s.organization)) throw fail(400,'Select active authorized signers for their respective organizations.');
  return agreements.saveAgreement(ctx,id,{...input,parties},organizationAgreementStore);
};
export async function listArchive(ctx, db = pool) {
  const [rows] = await db.execute("SELECT * FROM organization_agreement_records WHERE agency_id=? AND kind IN ('agreement','agreement_upload') ORDER BY created_at DESC LIMIT 1000",[ctx.agencyId]);
  return rows.map(decode).map(r => { const {base64,...data}=r.data; return {...r,data,...(r.kind==='agreement'?{reviewHash:agreements.agreementHash(r.data)}:{})}; });
}
export async function downloadAgreement(ctx,id) {
  const record = await get(ctx,'agreement',id);
  await audit(ctx,'agreement.downloaded',id);
  if (record.data.status === 'completed') {
    const [[row]] = await pool.execute("SELECT * FROM organization_agreement_records WHERE agency_id=? AND kind='agreement_pdf' AND source_key=?",[ctx.agencyId,record.id]);
    if (!row) throw fail(409,'The retained executed copy is unavailable; contact the operator.');
    const retained=decode(row).data,bytes=Buffer.from(retained.base64,'base64');
    if (hash(bytes)!==retained.pdfHash) throw fail(409,'The retained copy needs integrity review.');
    return bytes;
  }
  return agreements.agreementPdf(record);
}
export async function downloadHtml(ctx,id) {
  const record=await get(ctx,'agreement',id);
  await audit(ctx,'agreement.html_downloaded',id,{contentHash:record.data.contentHash || agreements.agreementHash(record.data)});
  return agreementHtml(record);
}
export async function uploadOriginal(ctx,input,file) {
  const validated=validateFile(file);
  if (validated.mime!=='application/pdf') throw fail(400,'Upload the original signed PDF (up to 5 MB).');
  return transaction(async db => {
    const agreementId=input.agreementId || null;
    if(agreementId) await get(ctx,'agreement',agreementId,db);
    const record=await create(ctx,'agreement_upload',{ title:text(input.title,'Document title',255),type:'baa',status:'uploaded_unverified',agreementId,...validated,uploadedBy:ctx.userId,uploadedAt:new Date().toISOString() },{},db);
    await create(ctx,'agreement_original',{uploadId:record.id,base64:file.buffer.toString('base64'),sha256:validated.hash},{sourceKey:record.id},db);
    return record;
  });
}
export async function downloadOriginal(ctx,id) {
  const record=await get(ctx,'agreement_upload',id);
  const [[row]]=await pool.execute("SELECT * FROM organization_agreement_records WHERE agency_id=? AND kind='agreement_original' AND source_key=?",[ctx.agencyId,record.id]);
  if(!row) throw fail(409,'The retained original is unavailable; contact the operator.');
  const original=decode(row).data,bytes=Buffer.from(original.base64,'base64');
  if(hash(bytes)!==record.data.hash) throw fail(409,'The original needs integrity review.');
  await audit(ctx,'agreement_upload.downloaded',id,{sha256:record.data.hash});
  return {bytes,name:record.data.name};
}
export function validateExternalReview(input,original) {
  if (input.sha256!==original.hash) throw fail(409,'Review this exact uploaded original before verification.');
  if(!validDate(input.effectiveDate)) throw fail(400,'Enter the agreement effective date.');
  const parties=['practice','operator'].map(side => {
    const p=input.parties?.[side] || {};
    if(!validDate(p.signedDate) || p.signedDate>new Date().toISOString().slice(0,10)) throw fail(400,'Enter each actual signature date.');
    return [side,{legalName:text(p.legalName,'Legal entity',255),signerName:text(p.signerName,'Actual signer',200),capacity:text(p.capacity,'Signer title / authority',200),signedDate:p.signedDate}];
  });
  if(parties[0][1].legalName.toLowerCase()===parties[1][1].legalName.toLowerCase()) throw fail(400,'Identify distinct contracting legal entities; a product brand is not a separate counterparty.');
  return {parties:Object.fromEntries(parties),effectiveDate:input.effectiveDate,reviewNotes:text(input.reviewNotes,'Verification notes',5000)};
}
export async function verifyExternal(ctx,id,input) {
  if(!ctx.profile.operator) throw fail(403,'Operator review is required for externally signed copies.');
  return transaction(async db => {
    await organizationAgreementStore.lockPractice(ctx,db);
    const record=await get(ctx,'agreement_upload',id,db,true);
    if(record.data.status!=='uploaded_unverified') throw fail(409,'This original has already been reviewed. Upload a separate original for a new version.');
    const review=validateExternalReview(input,record.data);
    for(const party of Object.values(review.parties)) if(/^(schoolcarebridge|auricwell|plotline)$/i.test(party.legalName)) throw fail(400,'Record the actual contracting legal entity shown in the original, not a product brand.');
    const result=await update(ctx,record,{...record.data,...review,status:'verified_external',verifiedBy:ctx.userId,verifiedAt:new Date().toISOString()},db);
    await audit(ctx,'agreement_upload.externally_verified',id,{sha256:record.data.hash,...review},db);
    return result;
  });
}
export async function auditTrail(ctx,id) {
  recordId(id);
  const [rows]=await pool.execute('SELECT * FROM organization_agreement_audit WHERE agency_id=? AND record_id=? ORDER BY id',[ctx.agencyId,id]);
  return rows.map(r=>({action:r.action,actorUserId:r.actor_user_id,at:r.created_at,details:open(r.details,`organization-agreement-audit:${ctx.agencyId}`)}));
}
