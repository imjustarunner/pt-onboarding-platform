import pool from '../config/database.js';
import {validateLeaveItems} from '../utils/supplementalLeave.js';

const fail = message => { throw Object.assign(new Error(message), {status:409}); };
export async function schoolSupportAvailability({agencyId,userId,db=pool,lock=false}) {
  const [[account]]=await db.execute(`SELECT school_support_balance_hours FROM payroll_pto_accounts WHERE agency_id=? AND user_id=?${lock?' FOR UPDATE':''}`,[agencyId,userId]);
  // A locking read sees newly committed requests even if the caller already opened a repeatable-read snapshot.
  const [pending]=await db.execute(`SELECT total_hours FROM payroll_pto_requests WHERE agency_id=? AND user_id=? AND request_type='school_support' AND status IN ('submitted','deferred')${lock?' FOR UPDATE':''}`,[agencyId,userId]);
  const balanceHours=Number(account?.school_support_balance_hours||0),pendingHours=pending.reduce((sum,row)=>sum+Number(row.total_hours),0);
  return {balanceHours,pendingHours,availableHours:Math.max(0,balanceHours-pendingHours)};
}

/** Shared by My Payroll and cancellation signing, so concurrent requests cannot spend the same available hour. */
export async function createSchoolSupportRequest({agencyId,userId,actorId,items,notes=null,sourceAppointmentId=null,db=null}) {
  const normalized=validateLeaveItems(items),total=normalized.reduce((sum,item)=>sum+item.hours,0);
  const conn=db||await pool.getConnection();
  try {
    if(!db)await conn.beginTransaction();
    // All school-support submissions take this account lock before reading pending requests.
    const availability=await schoolSupportAvailability({agencyId,userId,db:conn,lock:true});
    if(sourceAppointmentId){
      const [[existing]]=await conn.execute('SELECT id,user_id,agency_id FROM payroll_pto_requests WHERE source_appointment_id=? FOR UPDATE',[sourceAppointmentId]);
      if(existing){
        if(Number(existing.user_id)!==Number(userId)||Number(existing.agency_id)!==Number(agencyId))fail('This appointment already has a support-hours request for another account');
        if(!db)await conn.commit();
        return {requestId:existing.id,alreadyRequested:true};
      }
    }
    if(total>availability.availableHours+1e-8)fail(`Insufficient School Support Hours. ${availability.availableHours.toFixed(2)} hours are available after pending requests.`);
    const [created]=await conn.execute(`INSERT INTO payroll_pto_requests
      (agency_id,user_id,submitted_by_user_id,status,request_type,notes,total_hours,source_appointment_id)
      VALUES (?,?,?,'submitted','school_support',?,?,?)`,[agencyId,userId,actorId,notes,total,sourceAppointmentId]);
    for(const item of normalized)await conn.execute('INSERT INTO payroll_pto_request_items (request_id,agency_id,request_date,hours) VALUES (?,?,?,?)',[created.insertId,agencyId,item.date,item.hours]);
    if(!db)await conn.commit();
    return {requestId:created.insertId,alreadyRequested:false};
  } catch(error){if(!db)await conn.rollback();throw error;}finally{if(!db)conn.release();}
}
