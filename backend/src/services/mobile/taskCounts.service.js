import pool from '../../config/database.js';
import Task from '../../models/Task.model.js';
import User from '../../models/User.model.js';
import {listMobileAgencies} from './agencyScope.service.js';

/** Same assignment/visibility rules as the task hub; totals precede pagination.
 * Shared lists and projects count accessible containers, not duplicate tasks. */
export function createTaskSuiteCounts({db=pool,findUser=id=>User.findById(id,{raw:true}),agencies=listMobileAgencies,countTasks=(id,options)=>Task.findByUser(id,options)}={}) {
 return async request=>{
  const user=await findUser(request.quickView.userId);
  if(!user || [0,false,'0'].includes(user.is_active))throw Object.assign(new Error('Your account is no longer active.'),{status:403});
  const {agencies:memberships}=await agencies(user);
  const ids=[...new Set(memberships.map(a=>Number(a.id)).filter(id=>!request.quickView.qaAgencyIds || request.quickView.qaAgencyIds.map(Number).includes(id)))];
  const scope=alias=>`(${alias}.agency_id IS NULL${ids.length?` OR ${alias}.agency_id IN (${ids.map(()=>'?').join(',')})`:''})`;
  const collections=async(table,members,fk,alias)=>{
   const [[row]]=await db.execute(`SELECT COUNT(*) AS total FROM ${table} ${alias}
    WHERE (${alias}.created_by_user_id=? OR EXISTS(SELECT 1 FROM ${members} member WHERE member.${fk}=${alias}.id AND member.user_id=?))
    AND ${scope(alias)} ${table==='task_projects'?"AND COALESCE(tp.status,'active')<>'archived'":''}`,[user.id,user.id,...ids]);
   return Number(row.total)||0;
  };
  const results=await Promise.allSettled([
   countTasks(user.id,{view:'assigned',countOpen:true,authorizedAgencyIds:ids}),
   countTasks(user.id,{view:'mine',countOpen:true,authorizedAgencyIds:ids}),
   collections('task_lists','task_list_members','task_list_id','tl'),
   collections('task_projects','task_project_members','project_id','tp')
  ]);
  return Object.fromEntries(['assigned','mine','lists','projects'].map((key,index)=>[key,results[index].status==='fulfilled'?results[index].value:null]));
 };
}
export const getTaskSuiteCounts=createTaskSuiteCounts();
