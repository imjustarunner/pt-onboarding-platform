import pool from '../config/database.js';
const codes=new Set(['H0031','H0032','H2014','H2032','90853']);
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};

/** Save processing evidence without recalculating an entire payroll on each keystroke. */
export async function savePayrollImportProcessing({rowId,periodId,agencyId,actorUserId,unitCount,processed,allowPostedProcessing=false},getConnection=()=>pool.getConnection()) {
  const wantsUnits=unitCount!==undefined && unitCount!==null,wantsProcessed=processed!==undefined && processed!==null;
  if(wantsUnits && (!Number.isFinite(Number(unitCount)) || Number(unitCount)<=0))fail('unitCount must be a positive number (minutes)',400);
  if(wantsProcessed && typeof processed!=='boolean')fail('processed must be true or false',400);
  const db=await getConnection();
  try {
    await db.beginTransaction();
    const [[period]]=await db.execute('SELECT * FROM payroll_periods WHERE id=? AND agency_id=? FOR UPDATE',[Number(periodId),Number(agencyId)]);
    if(!period)fail('Pay period not found',404);
    const locked=['posted','finalized'].includes(String(period.status).toLowerCase()) || !!period.posted_at || !!period.finalized_at;
    if(locked && !allowPostedProcessing)fail('Pay period is posted/finalized');
    const [[row]]=await db.execute('SELECT * FROM payroll_import_rows WHERE id=? AND payroll_period_id=? AND agency_id=? FOR UPDATE',[Number(rowId),Number(periodId),Number(agencyId)]);
    if(!row)fail('Import row not found',404);
    if(Number(row.requires_processing)!==1 || !codes.has(String(row.service_code || '').trim().toUpperCase()))fail('This row does not require supported code processing');
    const units=wantsUnits?Number(unitCount):Number(row.unit_count);
    const processedAt=wantsProcessed?(processed?row.processed_at || new Date():null):row.processed_at;
    const processedBy=wantsProcessed?(processed?(row.processed_at?row.processed_by_user_id:Number(actorUserId)):null):row.processed_by_user_id;
    const changes=[];
    if(wantsUnits && Math.abs(units-Number(row.unit_count))>1e-9)changes.push(['unit_count',row.unit_count,units]);
    if(wantsProcessed && !!row.processed_at!==!!processedAt)changes.push(['processed',row.processed_at?1:0,processedAt?1:0]);
    let mutationSequence=0;
    if(changes.length) {
      await db.execute('UPDATE payroll_import_rows SET unit_count=?,processed_at=?,processed_by_user_id=? WHERE id=? AND payroll_period_id=? AND agency_id=?',[units,processedAt || null,processedBy || null,Number(rowId),Number(periodId),Number(agencyId)]);
      for(const[field,from,to]of changes){const[result]=await db.execute('INSERT INTO payroll_import_row_audit (payroll_import_row_id,payroll_import_id,payroll_period_id,agency_id,field_changed,from_value,to_value,changed_by_user_id) VALUES (?,?,?,?,?,?,?,?)',[row.id,row.payroll_import_id,row.payroll_period_id,row.agency_id,field,String(from),String(to),Number(actorUserId)]);mutationSequence=Math.max(mutationSequence,Number(result.insertId));}
      if(!locked){await db.execute('DELETE FROM payroll_summaries WHERE payroll_period_id=? AND agency_id=?',[Number(periodId),Number(agencyId)]);await db.execute("UPDATE payroll_periods SET status='staged',ran_at=NULL,ran_by_user_id=NULL WHERE id=? AND agency_id=?",[Number(periodId),Number(agencyId)]);}
    }
    const [[revision]]=await db.execute(`SELECT COUNT(*) AS row_count,MAX(id) AS row_revision,BIT_XOR(CRC32(CONCAT_WS('|', id, COALESCE(note_status,''), COALESCE(draft_payable,0), COALESCE(unit_count,0), COALESCE(service_code,''), COALESCE(processed_at,'')))) AS content_revision FROM payroll_import_rows WHERE payroll_period_id=? AND payroll_import_id=? AND agency_id=?`,[Number(periodId),Number(row.payroll_import_id),Number(agencyId)]);
    await db.commit();
    const invalidated=changes.length>0 && !locked;
    return {ok:true,row:{id:Number(rowId),unit_count:units,processed_at:processedAt || null,processed_by_user_id:processedBy || null},period:{...period,...(invalidated?{status:'staged',ran_at:null,ran_by_user_id:null}:{})},payrollInvalidated:invalidated,import:{id:Number(row.payroll_import_id),row_count:Number(revision.row_count),row_revision:`${Number(revision.row_revision || 0)}:${String(revision.content_revision || 0)}`,mutationSequence}};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
}
