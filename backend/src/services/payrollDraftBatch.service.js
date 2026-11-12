import pool from '../config/database.js';
import { draftReviewAllowedForImport } from './payrollDraftReview.service.js';
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};

/** One transaction and one audit insert for the entire selected batch. */
export async function savePayrollDraftBatch({periodId,agencyId,importId,actorUserId,decisions,draftPayable,allowPostedDraftReview=false,annotateBaseline},getConnection=()=>pool.getConnection()) {
  if(typeof draftPayable!=='boolean' || !Array.isArray(decisions) || !decisions.length || decisions.length>2000)fail('Select 1 to 2000 drafts and a payment choice.',400);
  const ids=decisions.map(r=>Number(r.id));
  if(ids.some(id=>!Number.isSafeInteger(id)||id<=0) || new Set(ids).size!==ids.length || decisions.some(r=>![0,1].includes(r.expectedDraftPayable)))fail('Invalid or duplicate draft selection.',400);
  const db=await getConnection();
  try {
    await db.beginTransaction();
    const [[period]]=await db.execute('SELECT * FROM payroll_periods WHERE id=? AND agency_id=? FOR UPDATE',[periodId,agencyId]);
    if(!period)fail('Pay period not found.',404);
    const [imports]=await db.execute('SELECT * FROM payroll_imports WHERE payroll_period_id=? AND agency_id=? ORDER BY COALESCE(slot_number,1) ASC,created_at ASC,id ASC FOR UPDATE',[periodId,agencyId]);
    const index=imports.findIndex(i=>Number(i.id)===Number(importId)),imp=imports[index];
    if(!imp)fail('Imported snapshot not found.',404);
    const locked=['posted','finalized'].includes(String(period.status).toLowerCase()) || !!period.posted_at || !!period.finalized_at;
    if(locked && (!allowPostedDraftReview || !draftReviewAllowedForImport({period,payrollImport:imp}) || index<1))fail('Only new catch-up drafts uploaded after posting can be reviewed.');
    const [allRows]=await db.execute('SELECT * FROM payroll_import_rows WHERE payroll_import_id=? AND payroll_period_id=? AND agency_id=? FOR UPDATE',[importId,periodId,agencyId]);
    const byId=new Map(allRows.map(r=>[Number(r.id),r]));
    const selected=decisions.map(choice=>{
      const row=byId.get(Number(choice.id));
      if(!row || row.note_status!=='DRAFT' || Number(row.draft_payable || 0)!==choice.expectedDraftPayable)fail('A selected draft changed. Refresh before reviewing it again.');
      return row;
    });
    if(locked) {
      const [baseline]=await db.execute('SELECT * FROM payroll_import_rows WHERE payroll_import_id=? AND payroll_period_id=? AND agency_id=?',[imports[index-1].id,periodId,agencyId]);
      const protectedIds=new Set(annotateBaseline({baselineRows:baseline,compareRows:allRows}).filter(r=>Number(r.already_paid_in_baseline)===1).map(r=>Number(r.id)));
      if(ids.some(id=>protectedIds.has(id)))fail('Previously paid sessions stay locked. Refresh the catch-up audit.');
    }
    const value=draftPayable?1:0,changed=selected.some(r=>Number(r.draft_payable || 0)!==value);
    await db.execute(`UPDATE payroll_import_rows SET draft_payable=? WHERE id IN (${ids.map(()=>'?').join(',')}) AND payroll_import_id=? AND agency_id=?`,[value,...ids,importId,agencyId]);
    const [audit]=await db.execute(`INSERT INTO payroll_import_row_audit (payroll_import_row_id,payroll_import_id,payroll_period_id,agency_id,field_changed,from_value,to_value,changed_by_user_id) VALUES ${selected.map(()=>'(?,?,?,?,?,?,?,?)').join(',')}`,selected.flatMap(r=>[r.id,importId,periodId,agencyId,'draft_reviewed',String(Number(r.draft_payable || 0)),String(value),actorUserId]));
    const invalidated=changed && !locked;
    if(invalidated){await db.execute('DELETE FROM payroll_summaries WHERE payroll_period_id=? AND agency_id=?',[periodId,agencyId]);await db.execute("UPDATE payroll_periods SET status='staged',ran_at=NULL,ran_by_user_id=NULL WHERE id=? AND agency_id=?",[periodId,agencyId]);}
    const [[revision]]=await db.execute(`SELECT COUNT(*) row_count,MAX(id) row_revision,BIT_XOR(CRC32(CONCAT_WS('|',id,COALESCE(note_status,''),COALESCE(draft_payable,0),COALESCE(unit_count,0),COALESCE(service_code,''),COALESCE(processed_at,'')))) content_revision FROM payroll_import_rows WHERE payroll_period_id=? AND payroll_import_id=? AND agency_id=?`,[periodId,importId,agencyId]);
    await db.commit();
    return {ok:true,draftChoicesChanged:changed,rows:selected.map(r=>({id:Number(r.id),draft_payable:value,draft_reviewed:true})),period:{...period,...(invalidated?{status:'staged',ran_at:null,ran_by_user_id:null}:{})},payrollInvalidated:invalidated,import:{id:Number(importId),row_count:Number(revision.row_count),row_revision:`${revision.row_revision || 0}:${revision.content_revision || 0}`,mutationSequence:Number(audit.insertId)+selected.length-1}};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
}
