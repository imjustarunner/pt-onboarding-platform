import pool from '../config/database.js';
import {readAgencyAccess} from './agencyAccessProfiles.service.js';
import {isNluChildcareAgency} from './compensationCategories.service.js';
import {isNluTutoringQaAgency} from '../utils/nluTutoringQaPolicy.js';
import {isStaffAccount} from '../utils/staffEligibility.js';

const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}};
const deny=message=>Object.assign(new Error(message),{status:403});

/** Recheck current employment at the actual signing boundary, not just at issue.
 * Look up the issued generation by its task, so caller-editable task metadata
 * cannot opt a new employee agreement out of this check. Existing flows retain
 * their existing signing rules.
 */
export async function requireEmployeeCompensationSignatureAccess(task,user,{countersign=false,db=pool}={}) {
 const [[generation]]=await db.execute(`SELECT id,agency_id,candidate_user_id,token_values_json,user_specific_document_id,rendered_html
  FROM contract_generations WHERE task_id=?
  AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.createdVia'))='employee_compensation_ui' LIMIT 1`,[task.id]);
 if(!generation)return false;
 if(['overridden','archived','deleted','cancelled','canceled'].includes(String(task.status).toLowerCase())) {
  throw Object.assign(new Error('This compensation agreement was withdrawn. Open your current agreement instead.'),{status:409});
 }
 const data=parse(generation.token_values_json),agencyId=Number(generation.agency_id),employeeId=Number(generation.candidate_user_id);
 if(data.draftKind!=='provider_update_compensation'||!generation.user_specific_document_id||!data.releasedAt
   ||Number(task.reference_id)!==Number(generation.user_specific_document_id)
   ||Number(task.assigned_to_agency_id)!==agencyId||Number(task.assigned_to_user_id)!==employeeId
   ||Number(data.employee?.userId)!==employeeId)throw deny('This compensation agreement no longer matches its original employee and organization. Ask an administrator to review it.');
 const [[document]]=await db.execute('SELECT id,user_id,task_id,template_type,document_action_type,html_content FROM user_specific_documents WHERE id=? LIMIT 1',[generation.user_specific_document_id]);
 if(!document||Number(document.user_id)!==employeeId||Number(document.task_id)!==Number(task.id)
   ||document.template_type!=='html'||document.document_action_type!=='signature'
   ||!generation.rendered_html||document.html_content!==generation.rendered_html)throw Object.assign(new Error('This compensation document changed after its saved review. Keep the issued record and ask an administrator to review a replacement before signing.'),{status:409});
 const actorId=Number(user?.id),counterId=Number(data.countersignerUserId);
 if(countersign?actorId!==counterId||actorId===employeeId:actorId!==employeeId)throw deny(countersign?'Only the designated employer countersigner may sign this compensation agreement.':'Only this employee may sign their compensation agreement.');
 const [[actor]]=await db.execute(`SELECT u.*,a.id AS signing_agency_id,a.slug AS signing_agency_slug,
  a.is_active AS signing_agency_active,a.is_archived AS signing_agency_archived,a.feature_flags AS signing_agency_flags
  FROM users u JOIN user_agencies ua ON ua.user_id=u.id JOIN agencies a ON a.id=ua.agency_id
  WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1 LIMIT 1`,[actorId,agencyId]);
 const agency=actor?{id:actor.signing_agency_id,slug:actor.signing_agency_slug,is_active:actor.signing_agency_active,
  is_archived:actor.signing_agency_archived,feature_flags:actor.signing_agency_flags}:null;
 const qa=[453,454].includes(agencyId),flags=parse(agency?.feature_flags);
 const activeAgency=agency&&Number(agency.is_active)===1&&!Number(agency.is_archived)&&isNluChildcareAgency(agency)
  &&(!qa||(isNluTutoringQaAgency(agency)&&Number(flags.qaSandbox?.sourceAgencyId)===6));
 const activeEmployee=actor&&isStaffAccount(actor)&&Number(actor.is_active)===1&&!Number(actor.is_archived)
  &&!actor.terminated_at&&String(actor.status).toUpperCase()==='ACTIVE_EMPLOYEE'
  &&(!Number(actor.is_demo)||qa);
 if(!activeAgency||!activeEmployee)throw deny(countersign?'The designated employer countersigner must still be an active administrator in this exact organization.':'This compensation agreement requires the employee’s active membership in its original organization.');
 if(countersign){
  const access=await readAgencyAccess(actorId,agencyId,db);
  if(!access?.membership||!['admin','super_admin'].includes(access.role))throw deny('The designated employer countersigner must still be an active administrator in this exact organization.');
 }
 return true;
}
