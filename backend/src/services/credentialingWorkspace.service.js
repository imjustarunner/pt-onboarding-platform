import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { claimMdConnectionMeta } from './claimMdConnection.service.js';
import User from '../models/User.model.js';
import { expandCredentialingAgencyIds } from '../utils/capabilities.js';
import { hasSchedulingBillingAccess } from './schedulingBillingAccess.service.js';

const error=(status,message)=>Object.assign(new Error(message),{status});
export const CREDENTIAL_STATUSES=['not_started','collecting','submitted','in_review','action_required','active','denied','terminated'];
const deps={connectionMeta:claimMdConnectionMeta,main:pool,clinical:clinicalPool,grants:id=>User.listCredentialingAgencyIds(id),expand:expandCredentialingAgencyIds,billing:hasSchedulingBillingAccess};
export async function credentialingScope(user, requested, d=deps) {
  if(!user?.id || !['super_admin','admin','staff','support'].includes(user.role)) throw error(403,'Credentialing access required');
  const ids=user.role==='super_admin'?null:await d.expand(await d.grants(user.id));
  if(ids && !ids.length) throw error(403,'No agencies are assigned for credentialing');
  const [rows]=await d.main.execute(`SELECT id,name,slug,logo_url,color_palette FROM agencies WHERE is_active=1 AND COALESCE(organization_type,'agency')='agency'${ids?` AND id IN (${ids.map(()=>'?').join(',')})`:''} ORDER BY name`,ids || []);
  const id=requested==null || requested==='' || requested==='all' ? null : Number(requested);
  if(id!==null && (!Number.isSafeInteger(id)||!rows.some(a=>Number(a.id)===id)))throw error(403,'Credentialing access is not assigned for this agency');
  return {organizations:rows,ids:(id ? rows.filter(a=>Number(a.id)===id):rows).map(a=>Number(a.id))};
}

export function trackedStatus(row) {
  if(row.status)return row.status;
  // Historical dates are evidence to review, never manufacture an active status.
  if(row.returnedDate)return 'verification_needed';
  if(row.effectiveDate)return 'verification_needed';
  return row.submittedDate?'submitted':'not_started';
}
function validDate(value) {
  return value==null || value==='' || (typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value);
}
export function normalizeCredentialTracking(input) {
  if(!CREDENTIAL_STATUSES.includes(input.status))throw error(400,'Choose a valid credentialing status');
  if(!validDate(input.revalidationDue)||!validDate(input.followUpDate))throw error(400,'Use a valid YYYY-MM-DD date');
  const evidence=String(input.evidenceReference || '').trim(), action=String(input.nextAction || '').trim();
  if(evidence.length<5 || evidence.length>500 || action.length>1000)throw error(400,'Record a source reference (5–500 characters) and next action (up to 1,000 characters)');
  const group=input.billingGroupNpiId ? Number(input.billingGroupNpiId):null;
  if(group!==null && (!Number.isSafeInteger(group)||group<1))throw error(400,'Select a valid agency group NPI');
  return {status:input.status,billingGroupNpiId:group,revalidationDue:input.revalidationDue || null,followUpDate:input.followUpDate || null,nextAction:action || null,evidenceReference:evidence};
}

export async function credentialingWorkspace(user,query={},d=deps) {
  const scope=await credentialingScope(user,query.agencyId,d);
  const result={organizations:scope.organizations,records:[],payers:[],groups:[],enrollments:[],claimCounts:[],capabilities:{electronicEnrollment:true,claimLinkage:true}};
  if(!scope.ids.length)return result;
  const marks=scope.ids.map(()=>'?').join(',');
  // Select only operational fields. Credentials/passwords, provider DOB and claim PHI never enter this response.
  const [providers]=await d.main.execute(`SELECT 'provider' AS subjectType,c.id AS credentialId,p.agency_id AS agencyId,p.id AS payerDefinitionId,p.name AS payerName,
    c.user_id AS providerId,CONCAT_WS(' ',u.first_name,u.last_name) AS subjectName,(SELECT v.value FROM user_info_values v JOIN user_info_field_definitions f ON f.id=v.field_definition_id WHERE v.user_id=u.id AND (f.agency_id IS NULL OR f.agency_id=p.agency_id) AND f.field_key IN ('provider_identity_npi_number','npi_number','provider_npi_number','provider_npi','npi') ORDER BY FIELD(f.field_key,'provider_identity_npi_number','npi_number','provider_npi_number','provider_npi','npi'),v.updated_at DESC,v.id DESC LIMIT 1) AS providerNpi,
    c.effective_date AS effectiveDate,c.submitted_date AS submittedDate,c.returned_date AS returnedDate
    FROM user_insurance_credentialing c JOIN insurance_credentialing_definitions p ON p.id=c.insurance_credentialing_definition_id
    JOIN users u ON u.id=c.user_id WHERE p.agency_id IN (${marks})`,scope.ids);
  const [groups]=await d.main.execute(`SELECT g.id,g.agency_id AS agencyId,g.npi_number AS npi,g.label,g.office_location_id AS officeId,
    o.name AS officeName,o.street_address AS streetAddress,o.city,o.state FROM agency_group_npis g LEFT JOIN office_locations o ON o.id=g.office_location_id AND o.agency_id=g.agency_id WHERE g.agency_id IN (${marks}) AND g.is_active=1`,scope.ids);
  const [groupRecords]=await d.main.execute(`SELECT 'group' AS subjectType,c.id AS credentialId,g.agency_id AS agencyId,p.id AS payerDefinitionId,p.name AS payerName,
    g.id AS groupId,COALESCE(g.label,g.npi_number) AS subjectName,g.npi_number AS providerNpi,c.effective_date AS effectiveDate,c.submitted_date AS submittedDate,c.returned_date AS returnedDate
    FROM agency_group_npi_payer_credentialing c JOIN agency_group_npis g ON g.id=c.agency_group_npi_id
    JOIN insurance_credentialing_definitions p ON p.id=c.insurance_credentialing_definition_id AND p.agency_id=g.agency_id WHERE g.agency_id IN (${marks}) AND g.is_active=1`,scope.ids);
  const [tracking]=await d.main.execute(`SELECT agency_id AS agencyId,subject_type AS subjectType,credential_id AS credentialId,status,billing_group_npi_id AS billingGroupNpiId,
    revalidation_due AS revalidationDue,follow_up_date AS followUpDate,next_action AS nextAction,evidence_reference AS evidenceReference,version,updated_at AS updatedAt
    FROM credentialing_workflow_tracking WHERE agency_id IN (${marks})`,scope.ids);
  const [payers]=await d.main.execute(`SELECT p.id,p.agency_id AS agencyId,p.name,l.payer_id AS payerId,l.evidence_reference AS evidenceReference,COALESCE(l.version,0) AS version
    FROM insurance_credentialing_definitions p LEFT JOIN credentialing_payer_links l ON l.agency_id=p.agency_id AND l.insurance_definition_id=p.id WHERE p.agency_id IN (${marks}) ORDER BY p.name`,scope.ids);
  const byKey=new Map(tracking.map(t=>[`${t.agencyId}:${t.subjectType}:${t.credentialId}`,t]));
  result.records=[...providers,...groupRecords].map(r=>{const t=byKey.get(`${r.agencyId}:${r.subjectType}:${r.credentialId}`);return {...r,version:0,...t,status:trackedStatus({...r,...t})};});
  result.groups=groups;result.payers=payers;
  for(const org of result.organizations)org.canViewBilling=scope.ids.includes(Number(org.id)) && await d.billing(user,org.id);
  try {
    [result.enrollments]=await d.clinical.execute(`SELECT agency_id AS agencyId,connection_id AS connectionId,payer_id AS payerId,provider_npi AS groupNpi,billing_office_location_id AS officeId,enrollment_type AS type,status,last_event_at AS lastEventAt FROM claimmd_enrollments WHERE agency_id IN (${marks})`,scope.ids);
  }catch(e){if(!['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(e.code))throw e;result.capabilities.electronicEnrollment=false;}
  const currentConnections=new Map();
  for(const agencyId of scope.ids){
    try {const meta=await d.connectionMeta(agencyId);if(meta.configured)currentConnections.set(agencyId,meta.accountId?`account:${meta.accountId}`:`agency:${agencyId}`);}
    catch(e){if(!['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(e.code)&&e.status!==409)throw e;}
  }
  result.enrollments=result.enrollments.filter(e=>currentConnections.get(Number(e.agencyId))===e.connectionId).map(({connectionId,...row})=>row);
  try {
    [result.claimCounts]=await d.clinical.execute(`SELECT c.agency_id AS agencyId,c.destination_payer_id AS payerId,c.billing_npi AS groupNpi,s.provider_user_id AS providerId,c.claim_lifecycle AS status,COUNT(*) AS count
      FROM clinical_claims c JOIN clinical_sessions s ON s.id=c.clinical_session_id AND s.agency_id=c.agency_id
      WHERE c.agency_id IN (${marks}) AND c.is_deleted=0 AND c.destination_payer_id IS NOT NULL
      GROUP BY c.agency_id,c.destination_payer_id,c.billing_npi,s.provider_user_id,c.claim_lifecycle`,scope.ids);
  }catch(e){if(!['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(e.code))throw e;result.capabilities.claimLinkage=false;}
  return result;
}

export async function saveCredentialingWorkflow(user,agencyId,kind,id,input,d=deps) {
  await credentialingScope(user,agencyId,d);
  if(!['provider','group','payer'].includes(kind)||!Number.isSafeInteger(id)||id<1)throw error(400,'Invalid credentialing record');
  const version=Number(input.version);
  if(!Number.isInteger(version)||version<0)throw error(400,'Reload the current record before saving');
  const value=kind==='payer'?{payerId:String(input.payerId || '').trim(),evidenceReference:String(input.evidenceReference || '').trim()}:normalizeCredentialTracking(input);
  if(kind==='payer'&&(!/^[A-Za-z0-9_-]{2,32}$/.test(value.payerId)||value.evidenceReference.length<5||value.evidenceReference.length>500))throw error(400,'Enter the verified electronic payer ID and a source reference');
  const db=await d.main.getConnection();
  try {
    await db.beginTransaction();
    const sql=kind==='payer'?'SELECT id FROM insurance_credentialing_definitions WHERE id=? AND agency_id=? FOR UPDATE':kind==='provider'?
      'SELECT c.id,c.effective_date FROM user_insurance_credentialing c JOIN insurance_credentialing_definitions p ON p.id=c.insurance_credentialing_definition_id WHERE c.id=? AND p.agency_id=? FOR UPDATE':
      'SELECT c.id,c.effective_date FROM agency_group_npi_payer_credentialing c JOIN agency_group_npis g ON g.id=c.agency_group_npi_id JOIN insurance_credentialing_definitions p ON p.id=c.insurance_credentialing_definition_id AND p.agency_id=g.agency_id WHERE c.id=? AND g.agency_id=? FOR UPDATE';
    const [[record]]=await db.execute(sql,[id,agencyId]);if(!record)throw error(404,'Credentialing record not found in this agency');
    if(kind!=='payer'&&value.status==='active'){
      const effective=record.effective_date instanceof Date?record.effective_date.toISOString().slice(0,10):String(record.effective_date || '').slice(0,10);
      if(!effective || effective>new Date().toISOString().slice(0,10))throw error(409,'An active credential requires a recorded effective date that has already started');
    }
    if(value.billingGroupNpiId){const [[group]]=await db.execute('SELECT id FROM agency_group_npis WHERE id=? AND agency_id=? AND is_active=1',[value.billingGroupNpiId,agencyId]);if(!group)throw error(400,'Billing group NPI must belong to this agency');}
    const [[previous]]=await db.execute(kind==='payer'?'SELECT * FROM credentialing_payer_links WHERE agency_id=? AND insurance_definition_id=? FOR UPDATE':'SELECT * FROM credentialing_workflow_tracking WHERE agency_id=? AND credential_id=? AND subject_type=? FOR UPDATE',kind==='payer'?[agencyId,id]:[agencyId,id,kind]);
    if(Number(previous?.version || 0)!==version)throw error(409,'Another credentialer changed this record. Refresh before saving.');
    if(kind==='payer')await db.execute(`INSERT INTO credentialing_payer_links (agency_id,insurance_definition_id,payer_id,evidence_reference,updated_by_user_id) VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE payer_id=VALUES(payer_id),evidence_reference=VALUES(evidence_reference),updated_by_user_id=VALUES(updated_by_user_id),version=version+1`,[agencyId,id,value.payerId,value.evidenceReference,user.id]);
    else await db.execute(`INSERT INTO credentialing_workflow_tracking (agency_id,subject_type,credential_id,status,billing_group_npi_id,revalidation_due,follow_up_date,next_action,evidence_reference,updated_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE status=VALUES(status),billing_group_npi_id=VALUES(billing_group_npi_id),revalidation_due=VALUES(revalidation_due),follow_up_date=VALUES(follow_up_date),next_action=VALUES(next_action),evidence_reference=VALUES(evidence_reference),updated_by_user_id=VALUES(updated_by_user_id),version=version+1`,[agencyId,kind,id,value.status,value.billingGroupNpiId,value.revalidationDue,value.followUpDate,value.nextAction,value.evidenceReference,user.id]);
    await db.execute('INSERT INTO credentialing_workflow_events (agency_id,subject_type,record_id,actor_user_id,before_json,after_json) VALUES (?,?,?,?,?,?)',[agencyId,kind,id,user.id,previous?JSON.stringify(previous):null,JSON.stringify(value)]);
    await db.commit();return {saved:true,version:version+1};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}
