import pool from '../config/database.js';

/** Rebuild persisted future schedules once; never send a notification here. */
export async function rebuildSessionReminderPolicies({schedule,agencyId=null,appointmentId=null,limit=10,db=pool}={}) {
  let rows;
  try { [rows]=await db.query(`SELECT q.appointment_id FROM session_reminder_policy_rebuilds q
    JOIN appointments a ON a.id=q.appointment_id JOIN agencies agency ON agency.id=a.agency_id
    WHERE q.status='pending' AND agency.is_active=1 AND COALESCE(agency.is_archived,0)=0
      AND (? IS NULL OR a.agency_id=?) AND (? IS NULL OR a.id=?) ORDER BY q.appointment_id LIMIT ?`,[agencyId,agencyId,appointmentId,appointmentId,Math.max(1,Math.min(50,Number(limit)||10))]); }
  catch(error){if(error.code==='ER_NO_SUCH_TABLE')return {rebuilt:0};throw error;}
  let rebuilt=0;
  for(const row of rows||[]) {
    const conn=await db.getConnection(),key=`session_policy_v2:${row.appointment_id}`;let acquired=false;
    try {
      const [[lock]]=await conn.execute('SELECT GET_LOCK(?,0) AS acquired',[key]);acquired=Number(lock?.acquired)===1;if(!acquired)continue;
      const [[current]]=await conn.execute('SELECT status FROM session_reminder_policy_rebuilds WHERE appointment_id=?',[row.appointment_id]);
      if(current?.status!=='pending')continue;
      const [oldRows]=await conn.execute("SELECT id FROM appointment_reminders WHERE appointment_id=? AND status='pending' AND COALESCE(rule_key,'')<>'manual_extra'",[row.appointment_id]);
      await schedule(row.appointment_id,{replace:true});
      if(oldRows?.length) await conn.execute(`UPDATE appointment_reminders SET skip_reason='reminder_policy_updated'
        WHERE status='canceled' AND skip_reason IS NULL AND id IN (${oldRows.map(()=>'?').join(',')})`,oldRows.map(item=>item.id));
      await conn.execute("UPDATE session_reminder_policy_rebuilds SET status='done',error_code=NULL WHERE appointment_id=?",[row.appointment_id]);rebuilt++;
    } catch(error){await conn.execute("UPDATE session_reminder_policy_rebuilds SET attempts=attempts+1,status=IF(attempts>=3,'review','pending'),error_code=? WHERE appointment_id=?",[String(error.code||'schedule_rebuild_failed').slice(0,64),row.appointment_id]);}
    finally{try{if(acquired)await conn.execute('SELECT RELEASE_LOCK(?)',[key]);}finally{conn.release();}}
  }
  return {rebuilt};
}
