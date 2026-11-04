import pool from '../config/database.js';
import {closePrehire} from './hireJourney.service.js';
import {requiredSubmissionKeys,assertPortalStepCompletion} from './hirePortalWorkflow.service.js';

const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export function createPrehireCompletionService(overrides={}) {
  const d={database:pool,state:async id=>(await import('../controllers/prehirePortal.controller.js')).portalStateForUser(id),
    close:closePrehire,assertSteps:assertPortalStepCompletion,
    advance:async(...args)=>(await import('../controllers/prehirePortal.controller.js')).advanceCandidateStatus(...args),...overrides};
  return async function complete({userId,actorUserId=null,agencyId=null}) {
    let state=await d.state(userId);
    if(agencyId && Number(state.agency.id)!==Number(agencyId))throw fail('Select the candidate’s pre-hire agency.',403);
    if(state.candidate.status==='PREHIRE_REVIEW')return {ok:true,advancedTo:'PREHIRE_REVIEW',alreadyComplete:true};
    if(!['PENDING_SETUP','PREHIRE_OPEN'].includes(state.candidate.status))throw fail('Pre-hire is no longer open.');
    const db=await d.database.getConnection();
    try {
      await db.beginTransaction();
      const [[current]]=await db.execute('SELECT status,work_email FROM users WHERE id=? FOR UPDATE',[userId]);
      if(!['PENDING_SETUP','PREHIRE_OPEN'].includes(current?.status))throw fail('The candidate’s stage changed. Refresh before completing pre-hire.');
      state=await d.state(userId);
      if(!state.progress.allDone)throw fail('Complete every required pre-hire item, including the work username, before marking pre-hire complete.',400);
      if(!current.work_email)throw fail('Choose the work username in pre-hire before completing this phase.',400);
      await d.assertSteps(userId,'pre_hire',requiredSubmissionKeys(state.workflow.steps.pre_hire,!!current.work_email),db);
      await d.close(userId,{tasks:state.tasks,backgroundCheck:state.backgroundCheck,jdAcknowledged:state.jdAcknowledged,
        checklist:state.checklistItems,prehireDocs:state.prehireDocs,
        ...(actorUserId?{reviewedByStaffUserId:actorUserId}:{}),
        workflow:{steps:state.workflow.steps.pre_hire.map(({task,doc,...step})=>step)}},db);
      await db.commit();
    } catch(error){await db.rollback();throw error;} finally{db.release();}
    await d.advance(userId,actorUserId);
    return {ok:true,advancedTo:'PREHIRE_REVIEW',message:'Pre-hire requirements completed and ready for review.'};
  };
}
export const completePrehireForReview=createPrehireCompletionService();
