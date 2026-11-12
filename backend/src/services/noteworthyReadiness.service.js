import pool from '../config/database.js';
import { encryptBillingSecret,decryptBillingSecret,isBillingEncryptionConfigured } from './billingEncryption.service.js';
import { decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { isProBonoServiceCode } from '../utils/clinicalFundingPolicy.js';

const fail=(status,code,message,extra={})=>Object.assign(new Error(message),{status,code,...extra});
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const clean=(value,label,max=1000)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw fail(400,'ACTIVATION_EVIDENCE_REQUIRED',`Enter ${label}.`);return value.trim();};
export function createNoteworthyReadiness({db=pool,encrypt=encryptBillingSecret,decrypt=decryptBillingSecret,openAgreement=decryptFamilyBilling,now=()=>new Date()}={}) {
  async function activation(agencyId) {
    let practice;
    try {[[practice]]=await db.execute('SELECT agency_id,activated_at,activated_by_user_id,activation_enc,activation_requested_at,activation_request_enc FROM noteworthy_practices WHERE agency_id=?',[agencyId]);}
    catch(e){if(e.code==='ER_NO_SUCH_TABLE')return null;throw e;}
    if(!practice)return null;
    let evidence=null;
    if(practice.activation_enc) {
      try {evidence=parse(decrypt(parse(practice.activation_enc)));}
      catch{throw fail(503,'ACTIVATION_RECORD_UNAVAILABLE','Payroll data access needs operator review.');}
    }
    const active=!!practice.activated_at && evidence?.verified===true;
    let request=null;
    if(practice.activation_request_enc)try{request=parse(decrypt(parse(practice.activation_request_enc)));}catch{throw fail(503,'ACTIVATION_RECORD_UNAVAILABLE','The saved legal-identity request needs operator review.');}
    return {canImport:active && isBillingEncryptionConfigured(),activatedAt:practice.activated_at || null,requestedAt:practice.activation_requested_at || null,legalIdentity:request?{legalName:request.legalName,legalAddress:request.legalAddress}:null,
      requirements:active?[]:[{id:'agreements',label:'Executed payroll service agreement, order and BAA reviewed by FundThred'},{id:'identity',label:'Practice legal identity and authorized contact'},{id:'infrastructure',label:'Auricwell infrastructure and vendor readiness review'}]};
  }
  async function assertImport(agencyId) {
    const state=await activation(agencyId);
    if(state && !state.canImport)throw fail(409,'NOTEWORTHY_ACTIVATION_REQUIRED','Complete your payroll data-access activation with FundThred before uploading billing reports.',{activation:state});
    return state;
  }
  async function requestActivation(agencyId,input={}) {
    const legalName=clean(input.legalName,'your practice legal name'),legalAddress=clean(input.legalAddress,'your practice legal address');
    const [[existing]]=await db.execute('SELECT activated_at,activation_enc FROM noteworthy_practices WHERE agency_id=?',[agencyId]);
    if(existing?.activated_at){const active=parse(decrypt(parse(existing.activation_enc)));if(active.legalName!==legalName || active.legalAddress!==legalAddress)throw fail(409,'LEGAL_IDENTITY_CHANGE_REQUIRES_REVIEW','Contact FundThred to review a change to an activated practice’s contracting legal identity.');}
    const request=JSON.stringify(encrypt(JSON.stringify({legalName,legalAddress,requestedAt:now().toISOString()})));
    await db.execute('UPDATE noteworthy_practices SET activation_requested_at=COALESCE(activation_requested_at,UTC_TIMESTAMP()),activation_request_enc=? WHERE agency_id=?',[request,agencyId]);
    return activation(agencyId);
  }
  async function activate(actorId,agencyId,input) {
    const [[actor]]=await db.execute("SELECT id FROM users WHERE id=? AND role='super_admin' AND is_active=1 AND COALESCE(is_archived,0)=0",[actorId]);
    if(!actor)throw fail(403,'OPERATOR_ACCESS_REQUIRED','A FundThred operator must verify payroll data-access readiness.');
    if(input.verified!==true)throw fail(400,'ACTIVATION_EVIDENCE_REQUIRED','Confirm the review of these exact agreements and infrastructure evidence.');
    const evidence={verified:true,legalName:clean(input.legalName,'the practice legal name'),legalAddress:clean(input.legalAddress,'the practice legal address'),serviceAgreementReference:clean(input.serviceAgreementReference,'the executed payroll service agreement reference'),orderReference:clean(input.orderReference,'the executed payroll order reference'),infrastructureEvidence:clean(input.infrastructureEvidence,'infrastructure and vendor agreement evidence',4000),baaId:clean(input.baaId,'the executed BAA archive ID',36),verifiedBy:actorId,verifiedAt:now().toISOString()};
    const conn=await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[practice]]=await conn.execute('SELECT agency_id FROM noteworthy_practices WHERE agency_id=? FOR UPDATE',[agencyId]);
      if(!practice)throw fail(404,'PRACTICE_NOT_FOUND','Payroll practice not found.');
      const [[record]]=await conn.execute("SELECT id,kind,payload FROM organization_agreement_records WHERE agency_id=? AND id=? AND kind IN ('agreement','agreement_upload') FOR UPDATE",[agencyId,evidence.baaId]);
      if(!record)throw fail(409,'EXECUTED_BAA_REQUIRED','Select this practice’s retained executed BAA in the organization agreement archive.');
      const baa=openAgreement(record.payload,`organization-agreement:${agencyId}:${record.kind}:${record.id}`);
      if(baa.type!=='baa'||!['completed','verified_external'].includes(baa.status))throw fail(409,'EXECUTED_BAA_REQUIRED','The BAA must be completed or externally verified in the archive.');
      const partyName=String(baa.parties?.practice?.legalName || '').trim();
      if(!partyName || partyName.toLowerCase()!==evidence.legalName.toLowerCase())throw fail(409,'LEGAL_IDENTITY_MISMATCH','The practice legal name must match the retained executed BAA.');
      evidence.baaRevision=record.revision || null;
      const payload=JSON.stringify(encrypt(JSON.stringify(evidence)));
      await conn.execute('UPDATE noteworthy_practices SET activation_enc=?,activated_at=UTC_TIMESTAMP(),activated_by_user_id=? WHERE agency_id=?',[payload,actorId,agencyId]);
      await conn.commit();
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
    return activation(agencyId);
  }
  async function payrollReadiness(agencyId,periodId) {
    const state=await activation(agencyId);
    if(!state)return null;
    const [[period]]=await db.execute('SELECT id FROM payroll_periods WHERE id=? AND agency_id=?',[periodId,agencyId]);
    if(!period)throw fail(404,'PAYROLL_PERIOD_NOT_FOUND','Pay period not found in this practice.');
    const [unmatched]=await db.execute(`SELECT DISTINCT provider_name providerName FROM payroll_import_rows i
      WHERE agency_id=? AND payroll_period_id=? AND user_id IS NULL
      AND i.payroll_import_id=(SELECT MAX(p.id) FROM payroll_imports p WHERE p.payroll_period_id=i.payroll_period_id) LIMIT 50`,[agencyId,periodId]);
    // Any relevant snapshot/carryover without an explicit dated rate needs setup.
    // Zero is a valid deliberate rate. No credentials or rates are inferred.
    const [missing]=await db.execute(`SELECT DISTINCT i.user_id userId,u.first_name firstName,u.last_name lastName,i.service_code serviceCode,i.service_date serviceDate
      FROM payroll_import_rows i JOIN users u ON u.id=i.user_id
      WHERE i.agency_id=? AND i.payroll_period_id=? AND i.unit_count>0
      AND (i.note_status='FINALIZED' OR (i.note_status='DRAFT' AND i.draft_payable=1))
      AND i.payroll_import_id=(SELECT MAX(p.id) FROM payroll_imports p WHERE p.payroll_period_id=i.payroll_period_id)
      AND NOT EXISTS(SELECT 1 FROM payroll_rates r WHERE r.agency_id=i.agency_id AND r.user_id=i.user_id AND UPPER(r.service_code)=UPPER(i.service_code)
        AND (r.effective_start IS NULL OR r.effective_start<=i.service_date) AND (r.effective_end IS NULL OR r.effective_end>=i.service_date)) LIMIT 500`,[agencyId,periodId]);
    const [carryovers]=await db.execute(`SELECT c.user_id userId,u.first_name firstName,u.last_name lastName,c.service_code serviceCode,c.carryover_meta_json meta
      FROM payroll_stage_carryovers c JOIN users u ON u.id=c.user_id WHERE c.agency_id=? AND c.payroll_period_id=? AND c.carryover_finalized_units>0`,[agencyId,periodId]);
    const missingEmployeeRates=missing.filter(r=>!isProBonoServiceCode(r.serviceCode));
    for(const carry of carryovers) {
      if(isProBonoServiceCode(carry.serviceCode))continue;
      const meta=parse(carry.meta) || {},dates=[...new Set((meta.rawAuditRows || []).map(r=>String(r.serviceDate || '').slice(0,10)).filter(Boolean))];
      if(!dates.length){missingEmployeeRates.push({...carry,meta:undefined,reason:'Carryover service dates need review.'});continue;}
      for(const date of dates){const [[rate]]=await db.execute(`SELECT id FROM payroll_rates WHERE agency_id=? AND user_id=? AND UPPER(service_code)=UPPER(?)
        AND (effective_start IS NULL OR effective_start<=?) AND (effective_end IS NULL OR effective_end>=?) LIMIT 1`,[agencyId,carry.userId,carry.serviceCode,date,date]);if(!rate)missingEmployeeRates.push({...carry,meta:undefined,serviceDate:date});}
    }
    return {activation:state,ready:state.canImport && !unmatched.length && !missingEmployeeRates.length,unmatchedProviders:unmatched,missingEmployeeRates};
  }
  async function assertPayrollReady(agencyId,periodId) {
    const readiness=await payrollReadiness(agencyId,periodId);
    if(readiness && !readiness.ready)throw fail(409,'NOTEWORTHY_PAYROLL_SETUP_REQUIRED',!readiness.activation.canImport?'Activate this practice’s payroll data access before running payroll.':`Configure explicit dated pay rates for ${readiness.missingEmployeeRates.length} employee/service combinations and resolve unmatched providers before running payroll.`,{readiness});
    return readiness;
  }
  return {activation,assertImport,requestActivation,activate,payrollReadiness,assertPayrollReady};
}
export default createNoteworthyReadiness();
