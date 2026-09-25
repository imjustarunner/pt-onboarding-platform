import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { encryptFamilyBilling } from './familyBillingEncryption.service.js';
import { dateOnly, validDate, validNpi, policyError } from './supervisedBillingPolicy.service.js';

const fields = { place_of_service:'placeOfService', billing_npi:'billingNpi', taxonomy_code:'taxonomyCode', modifiers:'modifiers' };
export function applyOverrideRules(input, rules) {
  const result={placeOfService:input.placeOfService || null,billingNpi:input.billingNpi || null,taxonomyCode:input.taxonomyCode || null,modifiers:input.modifiers || null,applied:[],payerName:input.payerName || null};
  const applied=new Set(),dos=dateOnly(input.dateOfService);
  for(const rule of rules) {
    const field=fields[rule.field_key];if(!field || applied.has(field))continue;
    const matches=rule.scope==='claim'?Number(rule.claim_id)===Number(input.claimId)&&!!input.claimId
      :rule.scope==='client'?Number(rule.client_id)===Number(input.clientId)&&!!input.clientId
      :rule.scope==='payer'?!!rule.payer_id&&rule.payer_id===input.payerId&&rule.plan_type===input.planType:false;
    if(!matches)continue;
    if(!rule.notes || !rule.policy_reference || !rule.effective_from || !rule.effective_through)throw policyError(409,`Review legacy billing override #${rule.id}: reason, reference and effective dates are required`);
    if(!dos || dos<dateOnly(rule.effective_from)||dos>dateOnly(rule.effective_through))continue;
    const from=String(rule.from_value || ''),to=String(rule.to_value || '');
    if(from && from!==String(result[field] || ''))continue;
    result.applied.push({overrideId:rule.id,scope:rule.scope,field:rule.field_key,from:result[field],to,reason:rule.notes,policyReference:rule.policy_reference,effectiveFrom:dateOnly(rule.effective_from),effectiveThrough:dateOnly(rule.effective_through)});
    result[field]=to;applied.add(field);
  }
  return result;
}
export async function applyBillingClaimOverrides(input={}) {
  if(!input.agencyId)return applyOverrideRules(input,[]);
  const [rules]=await pool.execute(`SELECT * FROM billing_claim_overrides WHERE agency_id = ? AND is_active = 1
    ORDER BY CASE scope WHEN 'claim' THEN 1 WHEN 'client' THEN 2 WHEN 'payer' THEN 3 ELSE 9 END,id DESC`,[input.agencyId]);
  return applyOverrideRules(input,rules);
}
export async function listBillingClaimOverrides(agencyId) {
  const [rows]=await pool.execute('SELECT * FROM billing_claim_overrides WHERE agency_id = ? ORDER BY is_active DESC,id DESC',[agencyId]);return rows;
}
export async function upsertBillingClaimOverride(row={}) {
  const agencyId=Number(row.agencyId),id=Number(row.id)||null,scope=String(row.scope),field=String(row.fieldKey),to=String(row.toValue || '').trim(),reason=String(row.notes || row.reason || '').trim(),reference=String(row.policyReference || '').trim();
  if(!Number.isSafeInteger(agencyId)||agencyId<1||!['claim','client','payer'].includes(scope)||!fields[field])throw policyError(400,'Valid agency, scope and billing field are required');
  if(reason.length<10||reason.length>1000||reference.length<5||reference.length>1000)throw policyError(400,'Document the reason and supporting record/payer reference');
  if(!validDate(row.effectiveFrom)||!validDate(row.effectiveThrough)||row.effectiveThrough<row.effectiveFrom)throw policyError(400,'Valid effective dates are required');
  if((field==='place_of_service'&&!/^\d{2}$/.test(to))||(field==='billing_npi'&&!validNpi(to))||(field==='taxonomy_code'&&!/^[A-Z0-9]{10}$/.test(to))||(field==='modifiers'&&!/^[A-Z0-9]{2}(?:[, ]+[A-Z0-9]{2}){0,3}$/.test(to)))throw policyError(400,'The replacement billing value is invalid');
  if(scope==='payer'&&(!/^[A-Za-z0-9_-]{1,32}$/.test(row.payerId||'')||!String(row.planType||'').trim()||String(row.planType).length>100))throw policyError(400,'Payer overrides require an exact payer ID and plan type');
  if(scope==='client') {
    const [[client]]=await pool.execute('SELECT id FROM clients WHERE id = ? AND agency_id = ?',[Number(row.clientId)||0,agencyId]);
    if(!client)throw policyError(404,'Client is not in this agency');
  }
  if(scope==='claim') {
    const [[claim]]=await clinicalPool.execute('SELECT id,claim_lifecycle FROM clinical_claims WHERE id = ? AND agency_id = ? AND is_deleted = 0',[Number(row.claimId)||0,agencyId]);
    if(!claim)throw policyError(404,'Claim is not in this agency');
    if(!['draft','ready','rejected'].includes(claim.claim_lifecycle))throw policyError(409,'Reconcile the submitted claim before changing its overrides');
  }
  const actor=Number(row.updatedByUserId||row.createdByUserId);if(!actor)throw policyError(403,'An authenticated billing actor is required');
  const payload={agency_id:agencyId,scope,payer_name:scope==='payer'?String(row.payerName||'').slice(0,255):null,payer_id:scope==='payer'?row.payerId:null,plan_type:scope==='payer'?row.planType.trim():null,
    client_id:scope==='client'?Number(row.clientId):null,claim_id:scope==='claim'?Number(row.claimId):null,field_key:field,from_value:row.fromValue?String(row.fromValue).slice(0,64):null,to_value:to,is_active:row.isActive===false?0:1,notes:reason,policy_reference:reference,effective_from:row.effectiveFrom,effective_through:row.effectiveThrough,created_by_user_id:actor,updated_by_user_id:actor};
  const db=await pool.getConnection();
  try {
    await db.beginTransaction();let before=null;
    if(id) {
      const [[old]]=await db.execute('SELECT * FROM billing_claim_overrides WHERE id = ? AND agency_id = ? FOR UPDATE',[id,agencyId]);
      if(!old)throw policyError(404,'Override not found');before=old;
      if(!old.is_active)throw policyError(409,'This override was already replaced. Reload the current version.');
      await db.execute('UPDATE billing_claim_overrides SET is_active = 0,updated_by_user_id = ? WHERE id = ? AND agency_id = ?',[actor,id,agencyId]);
    }
    // A replacement is a new immutable version; old values remain available for audit.
    const columns=Object.keys(payload);const [saved]=await db.execute(`INSERT INTO billing_claim_overrides (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,Object.values(payload));
    await db.execute('INSERT INTO billing_claim_override_audit (agency_id,override_id,actor_user_id,payload_encrypted) VALUES (?,?,?,?)',[agencyId,saved.insertId,actor,encryptFamilyBilling({before,after:payload,replaces:id},`billing-override:${agencyId}:${saved.insertId}`)]);
    await db.commit();return {id:saved.insertId,...payload};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export default {applyBillingClaimOverrides,listBillingClaimOverrides,upsertBillingClaimOverride};
