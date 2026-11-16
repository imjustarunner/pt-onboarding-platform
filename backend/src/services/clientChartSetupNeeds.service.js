import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import {isIntakeAutoTreatmentPlan} from './treatmentPlanPrecedence.service.js';

// Batch the same evidence used by the chart's setup panel. Only a presence bit
// leaves the database for demographics; no decrypted patient records are read.
export async function clientChartSetupNeeds(ids,{db=pool,clinicalDb=clinicalPool}={}){
 const result=new Map();if(!ids.length)return result;
 const[rows]=await db.execute(`SELECT id,agency_id,source,client_type,
   ((demographics_phi_enc IS NOT NULL AND CAST(demographics_phi_enc AS CHAR) NOT IN ('','false','null'))
     OR (date_of_birth IS NOT NULL AND (COALESCE(contact_phone,'')<>'' OR COALESCE(email,'')<>'' OR COALESCE(address_street,'')<>''))) AS has_demographics,
   JSON_UNQUOTE(JSON_EXTRACT(onboarding_docs_json,'$.recordsImport.status')) AS records_import_status
   FROM clients WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);
 const candidates=[];
 for(const row of rows||[]){
  const pending=row.records_import_status==='pending';
  const clinicalSetup=row.source==='ADMIN_CREATED'&&row.client_type==='clinical';
  const hasDemographics=[true,1,'1'].includes(row.has_demographics);
  result.set(Number(row.id),pending||(clinicalSetup&&!hasDemographics));
  if(clinicalSetup&&hasDemographics&&!pending)candidates.push(row);
 }
 if(!candidates.length)return result;
 // Stay pending if clinical setup cannot be checked; never report an unknown
 // chart as up to date. These indexed lookups run only for eligible office rows.
 for(const row of candidates)result.set(Number(row.id),true);
 try{
  const candidateIds=candidates.map(row=>Number(row.id));
  const[intakes]=await db.execute(`SELECT DISTINCT client_id FROM client_intake_note_drafts WHERE status='final' AND client_id IN (${candidateIds.map(()=>'?').join(',')})`,candidateIds);
  const intakeIds=new Set(intakes.map(row=>Number(row.client_id))),withIntake=candidates.filter(row=>intakeIds.has(Number(row.id)));
  if(!withIntake.length)return result;
  const clientIds=withIntake.map(row=>Number(row.id)),agencyIds=[...new Set(withIntake.map(row=>Number(row.agency_id)))];
  const[plans]=await clinicalDb.execute(`SELECT client_id,agency_id,title FROM clinical_treatment_plans WHERE status='active' AND client_id IN (${clientIds.map(()=>'?').join(',')}) AND agency_id IN (${agencyIds.map(()=>'?').join(',')})`,[...clientIds,...agencyIds]);
  for(const row of withIntake)if(plans.some(plan=>Number(plan.client_id)===Number(row.id)&&Number(plan.agency_id)===Number(row.agency_id)&&!isIntakeAutoTreatmentPlan(plan)))result.set(Number(row.id),false);
 }catch{/* A missing or unavailable clinical record still needs review. */}
 return result;
}
