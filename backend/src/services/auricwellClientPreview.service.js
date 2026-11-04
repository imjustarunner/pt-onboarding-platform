import pool from '../config/database.js';
import {pickAuthoritativeTreatmentPlan} from './treatmentPlanPrecedence.service.js';
import {previewError} from './auricwellPreviewPolicy.js';

// Caller must resolve the active assignment and pass requireClinicalChart first.
// Share chart-model precedence and return only the small preview, not note bodies.
export async function readAssignedClientCare(client,{database=pool,plans=null}={}) {
  const model=plans||(await import('../models/clinical/ClinicalTreatmentPlan.model.js')).default;
  const scope={agencyId:Number(client.agency_id),clientId:Number(client.id)};
  const meta=pickAuthoritativeTreatmentPlan(await model.listByClient(scope));
  const plan=meta?await model.findById(meta.id):null;
  if(plan&&(Number(plan.agency_id)!==scope.agencyId||Number(plan.client_id)!==scope.clientId))throw previewError(404,'Treatment plan unavailable.');
  const [guardians]=await database.execute(`SELECT u.id,TRIM(CONCAT_WS(' ',u.first_name,u.last_name)) AS name
    FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
    WHERE cg.client_id=? AND u.role='client_guardian' AND COALESCE(cg.relationship_type,'')<>'self'
    ORDER BY u.last_name,u.first_name,u.id`,[scope.clientId]);
  return {guardians,plan:plan?{title:plan.title,status:plan.status,frequency:plan.prescribedFrequency||plan.prescribed_frequency||null,
    goals:(plan.goals||[]).map(g=>({id:g.id,text:g.goal_text,objectives:(g.objectives||[]).map(o=>({id:o.id,text:o.objective_text,current:o.scale_current,target:o.scale_target}))}))}:null};
}
