import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import { loadReviewDocument } from './clinicalReviewDocument.service.js';
import { parseObject, policyError } from './supervisedBillingPolicy.service.js';
import { stripSchedulingFinancials } from './schedulingBillingAccess.service.js';
import { sharedNotePredicate } from './sharedClinicalChart.service.js';
export { sharedNotePredicate } from './sharedClinicalChart.service.js';

// Only shared clinical chart records are eligible. Separately maintained private
// process notes and restricted records require their own disclosure workflow.
export function clinicalReviewContent(content) {
  const clean=value=>{
    if(typeof value==='string') { try {return clean(JSON.parse(value));} catch {return value;} }
    if(Array.isArray(value)) return value.map(clean);
    if(!value || typeof value!=='object') return value;
    return stripSchedulingFinancials(Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)])));
  };
  return JSON.stringify(clean(content),null,2);
}
export function caseNoteExcerpt(content) {
  const parsed=parseObject(clinicalReviewContent(content)), note=parsed.note;
  const sections=note && typeof note==='object' ? note.sections || note : null;
  const clinicalKeys=['assessment','Assessment','A','plan','Plan','P','progress','Progress','response','Response','data','Data','D','subjective','Subjective','S'];
  const selected=sections ? clinicalKeys.filter(k=>typeof sections[k]==='string').map(k=>`${k}: ${sections[k]}`).join('\n\n') : typeof note==='string' ? note : '';
  return { text:selected.slice(0,1600), truncated:selected.length>1600, hasAddenda:(parsed.addenda || []).length>0 };
}
export async function listSupervisionCases(scope, afterClientId=0, db=clinicalPool) {
  const [rows]=await db.execute(`SELECT client_id, MAX(updated_at) AS last_document_at FROM (
    SELECT n.client_id,n.updated_at FROM clinical_notes n WHERE n.agency_id=? AND n.created_by_user_id=? AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL AND ${sharedNotePredicate('n')}
    UNION ALL SELECT client_id,created_at AS updated_at FROM clinical_treatment_plans WHERE agency_id=? AND created_by_user_id=? AND status IN ('active','final')
    ) d WHERE client_id>? GROUP BY client_id ORDER BY client_id LIMIT 51`,[scope.agencyId,scope.providerUserId,scope.agencyId,scope.providerUserId,afterClientId]);
  return {cases:rows.slice(0,50).map(r=>({clientId:r.client_id,lastDocumentAt:r.last_document_at})),nextCursor:rows.length>50?Number(rows[49].client_id):null};
}
export async function buildSupervisionCaseOverview(scope, clientId, {db=clinicalPool,load=loadReviewDocument}={}) {
  const [notes]=await db.execute(`SELECT n.id,n.title,n.note_type,n.provider_signed_at FROM clinical_notes n
    WHERE n.agency_id=? AND n.created_by_user_id=? AND n.client_id=? AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL AND ${sharedNotePredicate('n')}
    ORDER BY n.updated_at DESC,n.id DESC LIMIT 10`,[scope.agencyId,scope.providerUserId,clientId]);
  const [plans]=await db.execute(`SELECT p.id,p.title,p.status FROM clinical_treatment_plans p WHERE p.agency_id=? AND p.client_id=? AND p.status IN ('active','final')
    AND (p.created_by_user_id=? OR EXISTS (SELECT 1 FROM clinical_notes n WHERE n.agency_id=p.agency_id AND n.client_id=p.client_id AND n.created_by_user_id=? AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL AND ${sharedNotePredicate('n')}))
    ORDER BY p.id DESC LIMIT 3`,[scope.agencyId,clientId,scope.providerUserId,scope.providerUserId]);
  if(!notes.length&&!plans.length) throw policyError(404,'No shared case documents are available for this supervisee');
  const sourceVersions=[], recentNotes=[], treatmentPlans=[];
  for(const n of notes) {
    const d=await load(scope,'note',n.id,db);
    sourceVersions.push({type:'note',id:n.id,hash:d.hash});
    recentNotes.push({id:n.id,title:n.title,noteType:n.note_type,signedAt:n.provider_signed_at,...caseNoteExcerpt(d.content)});
  }
  for(const p of plans) {
    const d=await load(scope,'treatment_plan',p.id,db), plan=parseObject(clinicalReviewContent(d.content));
    sourceVersions.push({type:'treatment_plan',id:p.id,hash:d.hash});
    treatmentPlans.push({id:p.id,title:p.title,status:p.status,presentingProblem:plan.presentingProblem || '',prescribedFrequency:plan.prescribedFrequency || '',dischargePlan:plan.dischargePlan || '',
      goals:(plan.goals || []).map(g=>({text:g.goal_text,status:g.status,objectives:(g.objectives || []).map(o=>({text:o.objective_text,status:o.status}))}))});
  }
  const contentHash=crypto.createHash('sha256').update(JSON.stringify({agencyId:scope.agencyId,providerId:scope.providerUserId,clientId,sourceVersions})).digest('hex');
  return {clientId,contentHash,generatedAt:new Date().toISOString(),recentNotes,treatmentPlans,
    description:'Source excerpts from up to 10 recently updated signed notes by this supervisee and 3 active/final treatment plans for the case. This is not a complete chart or an AI clinical interpretation. Open the source documents, including addenda, for full context.'};
}
