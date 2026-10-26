import pool from '../config/database.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
const reviewerRoles=new Set(['admin','super_admin','support']);
const id=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw fail(400,'Invalid school or request.');return n;};
const emailMatch=`LOWER(CONVERT(sc.email USING utf8mb4)) COLLATE utf8mb4_unicode_ci IN (
 LOWER(CONVERT(u.email USING utf8mb4)) COLLATE utf8mb4_unicode_ci,
 LOWER(CONVERT(u.work_email USING utf8mb4)) COLLATE utf8mb4_unicode_ci,
 LOWER(CONVERT(u.username USING utf8mb4)) COLLATE utf8mb4_unicode_ci)`;

async function context(db,schoolId,actorUserId,{lock=false}={}){
 const [[school]]=await db.execute(`SELECT id,name FROM agencies WHERE id=? AND organization_type='school'${lock?' FOR UPDATE':''}`,[id(schoolId)]);
 if(!school)throw fail(404,'School not found.');
 const [[actor]]=await db.execute(`SELECT id,role,email,work_email,first_name,last_name FROM users
  WHERE id=? AND COALESCE(is_active,1)=1 AND COALESCE(is_archived,0)=0 AND status='ACTIVE_EMPLOYEE'`,[id(actorUserId)]);
 if(!actor)throw fail(403,'An active account is required.');
 const [memberships]=await db.execute('SELECT agency_id FROM user_agencies WHERE user_id=? AND COALESCE(is_active,1)=1',[actor.id]);
 const schoolMember=memberships.some(row=>Number(row.agency_id)===school.id);
 let canReview=actor.role==='super_admin';
 if(!canReview&&reviewerRoles.has(actor.role)){
  const [parents]=await db.execute(`SELECT agency_id FROM organization_affiliations WHERE organization_id=? AND is_active=1
    UNION SELECT agency_id FROM agency_schools WHERE school_organization_id=? AND COALESCE(is_active,1)=1`,[school.id,school.id]);
  canReview=schoolMember||parents.some(parent=>memberships.some(row=>Number(row.agency_id)===Number(parent.agency_id)));
 }
 const canParticipate=actor.role==='school_staff'&&schoolMember;
 if(!canParticipate&&!canReview)throw fail(403,'You do not have access to school administrator requests for this school.');
 return {school,actor,canReview,canParticipate};
}

async function hasSchoolAdmin(db,schoolId){
 const [rows]=await db.execute(`SELECT sc.id FROM school_contacts sc JOIN users u ON ${emailMatch}
  JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=sc.school_organization_id
  WHERE sc.school_organization_id=? AND (sc.is_school_admin=1 OR sc.is_primary=1)
  AND u.role='school_staff' AND u.status='ACTIVE_EMPLOYEE' AND COALESCE(u.is_active,1)=1
  AND COALESCE(u.is_archived,0)=0 AND COALESCE(ua.is_active,1)=1 LIMIT 1`,[schoolId]);
 return rows.length>0;
}

async function audit(db,actor,schoolId,action,metadata){
 await db.execute('INSERT INTO user_activity_log (action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)',
  [action,actor.id,schoolId,JSON.stringify({schoolOrganizationId:schoolId,...metadata})]);
}

export async function schoolAdminRequestStatus({schoolId,actorUserId}){
 const ctx=await context(pool,schoolId,actorUserId);
 const hasAdmin=await hasSchoolAdmin(pool,ctx.school.id);
 const [requests]=await pool.execute(`SELECT r.id,r.requester_user_id,r.status,r.requested_at,r.reviewed_at,r.review_note,
  CONCAT(u.first_name,' ',u.last_name) AS requester_name,u.email AS requester_email
  FROM school_admin_access_requests r JOIN users u ON u.id=r.requester_user_id
  WHERE r.school_organization_id=? ${ctx.canReview?"AND r.status='pending'":'AND r.requester_user_id=?'} ORDER BY r.id DESC`,
  ctx.canReview?[ctx.school.id]:[ctx.school.id,ctx.actor.id]);
 return {hasAdmin,canRequest:ctx.canParticipate&&!hasAdmin,canReview:ctx.canReview,requests};
}

export async function requestSchoolAdminAccess({schoolId,actorUserId}){
 const db=await pool.getConnection();
 try{
  await db.beginTransaction();const ctx=await context(db,schoolId,actorUserId,{lock:true});
  if(!ctx.canParticipate)throw fail(403,'Only a staff member assigned to this school can request access.');
  if(await hasSchoolAdmin(db,ctx.school.id))throw fail(409,'This school already has an active School Admin. Ask them to manage school access.');
  const [[pending]]=await db.execute("SELECT id FROM school_admin_access_requests WHERE school_organization_id=? AND requester_user_id=? AND status='pending'",[ctx.school.id,ctx.actor.id]);
  if(pending){await db.commit();return {id:pending.id,status:'pending',alreadyRequested:true};}
  const [result]=await db.execute('INSERT INTO school_admin_access_requests (school_organization_id,requester_user_id) VALUES (?,?)',[ctx.school.id,ctx.actor.id]);
  await audit(db,ctx.actor,ctx.school.id,'school_admin_access_requested',{requestId:result.insertId});
  await db.commit();return {id:result.insertId,status:'pending'};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}

export async function reviewSchoolAdminAccess({schoolId,requestId,actorUserId,decision,note=''}){
 if(!['approve','deny'].includes(decision))throw fail(400,'Choose approve or deny.');
 if(typeof note!=='string'||note.length>500)throw fail(400,'Keep the review note within 500 characters.');
 const db=await pool.getConnection();
 try{
  await db.beginTransaction();const ctx=await context(db,schoolId,actorUserId,{lock:true});
  if(!ctx.canReview)throw fail(403,'An agency admin, superadmin or support team member must review this request.');
  const [[request]]=await db.execute('SELECT id,requester_user_id,status FROM school_admin_access_requests WHERE id=? AND school_organization_id=? FOR UPDATE',[id(requestId),ctx.school.id]);
  if(!request)throw fail(404,'Request not found.');
  if(request.status!=='pending')throw fail(409,'This request has already been reviewed.');
  if(decision==='approve'){
   if(await hasSchoolAdmin(db,ctx.school.id))throw fail(409,'This school now has an active School Admin. Review its current staff permissions first.');
   const [[user]]=await db.execute(`SELECT u.id,u.email,u.work_email,u.first_name,u.last_name FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    WHERE u.id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND u.role='school_staff'
    AND u.status='ACTIVE_EMPLOYEE' AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 FOR UPDATE`,[request.requester_user_id,ctx.school.id]);
   if(!user)throw fail(409,'The requester no longer has active staff access to this school.');
   const email=String(user.email||user.work_email||'').trim().toLowerCase();if(!email)throw fail(409,'The requester needs a school contact email.');
   await db.execute(`INSERT INTO school_contacts (school_organization_id,full_name,email,is_primary,is_school_admin,is_scheduler)
    VALUES (?,?,?,0,1,0) ON DUPLICATE KEY UPDATE is_school_admin=1,updated_at=CURRENT_TIMESTAMP`,[ctx.school.id,`${user.first_name} ${user.last_name}`,email]);
   await db.execute("UPDATE school_admin_access_requests SET status='superseded',reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP,review_note='Another school administrator request was approved.' WHERE school_organization_id=? AND status='pending' AND id<>?",[ctx.actor.id,ctx.school.id,request.id]);
  }
  const status=decision==='approve'?'approved':'denied';
  await db.execute('UPDATE school_admin_access_requests SET status=?,reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=?',[status,ctx.actor.id,note.trim()||null,request.id]);
  await audit(db,ctx.actor,ctx.school.id,`school_admin_access_${status}`,{requestId:request.id,targetUserId:request.requester_user_id,decision,note:note.trim()||null});
  await db.commit();return {id:request.id,status,userId:request.requester_user_id};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
