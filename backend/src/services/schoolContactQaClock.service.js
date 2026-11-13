import pool from '../config/database.js';
import {normalizeQaContactScope,requireQaContactScope} from './schoolContactQaScope.service.js';
import {processSchoolContactAutomation} from './schoolContactAutomation.service.js';
import {logAuditEvent} from './auditEvent.service.js';

export async function advanceQaContactClock(req,{db=pool,process=processSchoolContactAutomation,audit=logAuditEvent}={}) {
  const {scope,elapsedHours}=normalizeQaContactScope(req.body||{},req.params.id);
  if((req.query?.agencyId!==undefined&&Number(req.query.agencyId)!==450)
    ||(req.headers?.['x-agency-id']!==undefined&&Number(req.headers['x-agency-id'])!==450))throw Object.assign(new Error('Select the QA450 workspace.'),{status:400});
  const before=await requireQaContactScope(req.user?.id,scope,db);
  if(elapsedHours===96&&!before.second_contact_at)throw Object.assign(new Error('Complete the48-hour QA stage before96 hours.'),{status:409});
  const actualTriggeredAt=new Date().toISOString();
  await audit(req,{actionType:'school_contact_qa_clock_requested',agencyId:450,targetType:'school_contact_workflow',targetId:scope.workflowId,
    metadata:{...scope,elapsedHours,acceleratedQa:true,actualTriggeredAt}});
  const result=await process({scope,qaElapsedHours:elapsedHours,qaActorId:Number(req.user.id)});
  const [steps]=await db.execute(`SELECT step_key,status,message_id,completed_at,channel,detail FROM school_contact_workflow_steps
    WHERE workflow_id=? AND step_key IN ('initial_email','second_contact','final_contact') ORDER BY id`,[scope.workflowId]);
  await audit(req,{actionType:'school_contact_qa_clock_completed',agencyId:450,targetType:'school_contact_workflow',targetId:scope.workflowId,
    metadata:{...scope,elapsedHours,acceleratedQa:true,actualTriggeredAt,processed:result.processed,stepStatus:steps.map(step=>({key:step.step_key,status:step.status,messageId:step.message_id}))}});
  return {qaAccelerated:true,...scope,elapsedHours,actualTriggeredAt,processed:result.processed,outcomes:result.outcomes||[],steps};
}
