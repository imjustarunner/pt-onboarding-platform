import crypto from 'node:crypto';
import pool from '../config/database.js';
import {materialSession} from './tutoringMaterials.service.js';
import StudentLearningPlan from '../models/StudentLearningPlan.model.js';
import {resolveTutoringTrack} from './tutoringBookingContext.service.js';
import {evaluateGoalMastery} from './tutoringLearningOs.service.js';
import {maybeEncryptNotePayload as encrypt,maybeDecryptNotePayload as decrypt} from './clinicalNoteCrypto.service.js';
import {clinicalAudit} from './clinicalSessionAudit.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function progressSuggestions(ctx){
 const session=await materialSession(ctx,{hostOnly:true});
 const subject=await resolveTutoringTrack(ctx.appointment,ctx.clientId,session.student_subject_id);
 if(!subject)return {suggestions:[]};
 const plan=await StudentLearningPlan.findActiveBySubject(subject.id);
 if(!plan?.approved_at)return {suggestions:[]};
 for(const goal of await StudentLearningPlan.listGoals(plan.id)){
  const proposal=await evaluateGoalMastery(goal.id,{reviewedOnly:true,grade:subject.school_grade});
  if(!proposal.recommendedStatus||proposal.recommendedStatus===goal.status)continue;
  const digest=crypto.createHash('sha256').update(JSON.stringify([plan.id,goal.id,proposal.evidenceIds,proposal.recommendedStatus])).digest('hex');
  await pool.execute("INSERT IGNORE INTO tutoring_progress_reviews(agency_id,client_id,student_subject_id,plan_id,goal_id,evidence_hash,recommendation_envelope) VALUES(?,?,?,?,?,?,?)",[ctx.appointment.agencyId,ctx.clientId,subject.id,plan.id,goal.id,digest,encrypt(JSON.stringify({...proposal,title:goal.title,previousStatus:goal.status}))]);
 }
 const [rows]=await pool.execute("SELECT * FROM tutoring_progress_reviews WHERE agency_id=? AND client_id=? AND student_subject_id=? AND plan_id=? AND status='suggested' ORDER BY id DESC",[ctx.appointment.agencyId,ctx.clientId,subject.id,plan.id]);
 return {suggestions:rows.map(r=>({id:r.id,...JSON.parse(decrypt(r.recommendation_envelope))}))};
}
export async function decideProgress(ctx,id,input){
 if(!['approve','dismiss'].includes(input.decision))throw fail(400,'Choose Approve or Dismiss.');
 const db=await pool.getConnection();
 try{await db.beginTransaction();
  const session=await materialSession(ctx,{hostOnly:true,lock:true},db);
  const [[row]]=await db.execute('SELECT * FROM tutoring_progress_reviews WHERE id=? AND agency_id=? AND client_id=? FOR UPDATE',[Number(id),ctx.appointment.agencyId,ctx.clientId]);
  if(!row)throw fail(404,'Progress review not found.');
  const subject=await resolveTutoringTrack(ctx.appointment,ctx.clientId,session.student_subject_id);
  if(Number(subject?.id)!==Number(row.student_subject_id))throw fail(403,'This progress review belongs to another subject.');
  if(row.status!=='suggested'){await db.commit();return {ok:true,alreadyDecided:true};}
  const proposal=JSON.parse(decrypt(row.recommendation_envelope));
  const [[goal]]=await db.execute("SELECT g.status,p.status AS plan_status FROM student_learning_plan_goals g JOIN student_learning_plans p ON p.id=g.learning_plan_id WHERE g.id=? AND p.id=? AND p.client_id=? AND p.agency_id=? FOR UPDATE",[row.goal_id,row.plan_id,ctx.clientId,ctx.appointment.agencyId]);
  if(!goal||goal.plan_status!=='active'||goal.status!==proposal.previousStatus)throw fail(409,'The learning plan changed. Refresh the recommendation before deciding.');
  const latest=await evaluateGoalMastery(row.goal_id,{reviewedOnly:true,grade:subject.school_grade});
  if(JSON.stringify(latest.evidenceIds)!==JSON.stringify(proposal.evidenceIds)||latest.recommendedStatus!==proposal.recommendedStatus)throw fail(409,'New evidence is available. Refresh before approving a level change.');
  if(input.decision==='approve')await db.execute('UPDATE student_learning_plan_goals SET status=? WHERE id=?',[proposal.recommendedStatus,row.goal_id]);
  await db.execute('UPDATE tutoring_progress_reviews SET status=?,decided_by_user_id=?,decided_at=UTC_TIMESTAMP() WHERE id=?',[input.decision==='approve'?'approved':'dismissed',ctx.req.user.id,row.id]);
  await clinicalAudit({kind:'tutoring',sessionId:session.id,agencyId:ctx.appointment.agencyId,role:'provider',actor:ctx.actor,req:ctx.req},'tutoring_progress_'+input.decision,{reviewId:row.id,goalId:row.goal_id,previousStatus:proposal.previousStatus,recommendedStatus:proposal.recommendedStatus},db);
  await db.commit();return {ok:true};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
