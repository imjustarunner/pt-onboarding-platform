import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import {isIntakeAutoTreatmentPlan} from './treatmentPlanPrecedence.service.js';
import {intakeDraftContext} from './intakeDraftReview.service.js';

// Batch the same evidence used by the chart's setup panel. Only a presence bit
// leaves the database for demographics. Imported intake classification uses
// the bounded chart scope in memory; only the resulting flag leaves this service.
export async function clientChartSetupNeeds(ids,{db=pool,clinicalDb=clinicalPool}={}){
 const result=new Map();if(!ids.length)return result;
 const[rows]=await db.execute(`SELECT id,agency_id,source,client_type,
   ((demographics_phi_enc IS NOT NULL AND CAST(demographics_phi_enc AS CHAR) NOT IN ('','false','null'))
     OR (date_of_birth IS NOT NULL AND (COALESCE(contact_phone,'')<>'' OR COALESCE(email,'')<>'' OR COALESCE(address_street,'')<>''))) AS has_demographics,
   JSON_UNQUOTE(JSON_EXTRACT(onboarding_docs_json,'$.recordsImport.status')) AS records_import_status,
   JSON_EXTRACT(onboarding_docs_json,'$.recordsImport.keptBlankSections') AS kept_blank_sections
   FROM clients WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);
 const candidates=[];
 const keptBlank=(row,key)=>{if(row.records_import_status!=='complete')return false;try{const keys=typeof row.kept_blank_sections==='string'?JSON.parse(row.kept_blank_sections):row.kept_blank_sections;return Array.isArray(keys)&&keys.includes(key);}catch{return false;}};
 for(const row of rows||[]){
  const pending=row.records_import_status==='pending';
  const clinicalSetup=row.source==='ADMIN_CREATED'&&row.client_type==='clinical';
  const hasDemographics=[true,1,'1'].includes(row.has_demographics)||keptBlank(row,'demographics');
  result.set(Number(row.id),pending||(clinicalSetup&&!hasDemographics));
  if(clinicalSetup&&hasDemographics&&!pending)candidates.push(row);
 }
 if(!candidates.length)return result;
 // Stay pending if clinical setup cannot be checked; never report an unknown
 // chart as up to date. These indexed lookups run only for eligible office rows.
 for(const row of candidates)result.set(Number(row.id),true);
 try{
  const candidateIds=candidates.map(row=>Number(row.id));
  const[intakes]=await db.execute(`SELECT client_id,status,session_context_enc FROM client_intake_note_drafts WHERE status IN ('final','draft','ready','diagnosis_pending') AND client_id IN (${candidateIds.map(()=>'?').join(',')})`,candidateIds);
  const intakeIds=new Set(intakes.filter(row=>!row.status||row.status==='final'||intakeDraftContext(row).source==='client_records_import').map(row=>Number(row.client_id))),withIntake=candidates.filter(row=>intakeIds.has(Number(row.id))||keptBlank(row,'intake'));
  if(!withIntake.length)return result;
  const clientIds=withIntake.map(row=>Number(row.id)),agencyIds=[...new Set(withIntake.map(row=>Number(row.agency_id)))];
  const[plans]=await clinicalDb.execute(`SELECT client_id,agency_id,title,status,source_tool_id FROM clinical_treatment_plans WHERE (status='active' OR (status='draft' AND (source_tool_id LIKE 'client_records_import:%' OR source_tool_id='client_creation_record_import'))) AND client_id IN (${clientIds.map(()=>'?').join(',')}) AND agency_id IN (${agencyIds.map(()=>'?').join(',')})`,[...clientIds,...agencyIds]);
  for(const row of withIntake)if(keptBlank(row,'plan')||plans.some(plan=>Number(plan.client_id)===Number(row.id)&&Number(plan.agency_id)===Number(row.agency_id)&&!isIntakeAutoTreatmentPlan(plan)))result.set(Number(row.id),false);
 }catch{/* A missing or unavailable clinical record still needs review. */}
 return result;
}
