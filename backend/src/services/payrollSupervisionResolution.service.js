import pool from '../config/database.js';
export async function saveSupervisionResolution({periodId,agencyId,userId,serviceDate,resolution,note,actorUserId},getConnection=()=>pool.getConnection()) {
  const db=await getConnection();
  try{
    await db.beginTransaction();
    const [[period]]=await db.execute('SELECT * FROM payroll_periods WHERE id=? AND agency_id=? FOR UPDATE',[periodId,agencyId]);
    if(!period)throw Object.assign(new Error('Pay period not found'),{status:404});
    if(['posted','finalized'].includes(String(period.status).toLowerCase()) || period.posted_at || period.finalized_at)throw Object.assign(new Error('Posted payroll is locked. Restage it before changing supervision sources.'),{status:409});
    if(resolution==='clear')await db.execute('DELETE FROM payroll_supervision_conflict_resolutions WHERE payroll_period_id=? AND agency_id=? AND user_id=? AND service_date=?',[periodId,agencyId,userId,serviceDate]);
    else await db.execute(`INSERT INTO payroll_supervision_conflict_resolutions (payroll_period_id,agency_id,user_id,service_date,resolution,note,resolved_by_user_id,resolved_at)
      VALUES (?,?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE resolution=VALUES(resolution),note=VALUES(note),resolved_by_user_id=VALUES(resolved_by_user_id),resolved_at=NOW()`,[periodId,agencyId,userId,serviceDate,resolution,note,actorUserId]);
    // Source choices affect pay. A previously calculated run must be recalculated.
    await db.execute('DELETE FROM payroll_summaries WHERE payroll_period_id=? AND agency_id=?',[periodId,agencyId]);
    await db.execute("UPDATE payroll_periods SET status='staged',ran_at=NULL,ran_by_user_id=NULL WHERE id=? AND agency_id=?",[periodId,agencyId]);
    await db.commit();return {ok:true,payrollInvalidated:true};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
}
