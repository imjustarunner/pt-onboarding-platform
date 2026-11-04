/** Aggregate-only, read-only research for the Payroll Assistant pilot. Never grants access or approves a submission. */
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import mysql from 'mysql2/promise';

export async function auditPayrollApprovalHistory(db) {
  await db.query('SET SESSION TRANSACTION READ ONLY');
  await db.beginTransaction();
  try {
    const [[database]] = await db.query('SELECT DATABASE() name,@@transaction_read_only readOnly');
    const [time] = await db.execute(`SELECT c.agency_id,
      CASE WHEN c.claim_type IN ('meeting_training','skill_builder_event','indirect_time','excess_holiday','holiday_pay','service_correction','overtime_evaluation','tutoring_session') THEN c.claim_type ELSE 'other' END category,
      CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(c.payload_json,'$.source')) IN ('meeting_compensation_auto','supervision_session_finalize','supervision_payroll_correction','event_travel_report','company_event_travel','provider_update','direct_care_auto_indirect_carryover') THEN JSON_UNQUOTE(JSON_EXTRACT(c.payload_json,'$.source')) ELSE 'manual_or_other' END source,
      COUNT(*) total,SUM(c.status IN ('approved','paid')) approved_or_paid,SUM(c.status='rejected') rejected,SUM(c.status IN ('needs_changes','returned')) returned_count,SUM(c.status='deferred') deferred,SUM(c.status='submitted') pending,SUM(COALESCE(u.is_demo,0)=1) demo_staff,
      SUM(c.status IN ('approved','paid') AND (c.applied_amount IS NULL OR c.applied_amount<=0)) nonpositive_or_missing_amount,
      MIN(DATE(c.created_at)) first_submission,MAX(DATE(c.created_at)) last_submission
      FROM payroll_time_claims c JOIN users u ON u.id=c.user_id WHERE c.agency_id IN (2,6,377) GROUP BY 1,2,3 ORDER BY 1,total DESC`);
    const categories = {};
    for (const [name, table, type] of [
      ['mileage','payroll_mileage_claims',"CASE WHEN claim_type IN ('school_travel','office_travel','standard','other','event_travel') THEN claim_type ELSE 'other' END"],
      ['reimbursement','payroll_reimbursement_claims',"'reimbursement'"]
    ]) {
      const [rows] = await db.execute(`SELECT agency_id,${type} category,COUNT(*) total,SUM(status IN ('approved','paid')) approved_or_paid,SUM(status='rejected') rejected,SUM(status IN ('needs_changes','returned')) returned_count,SUM(status='deferred') deferred,SUM(status='submitted') pending FROM ${table} WHERE agency_id IN (2,6,377) GROUP BY 1,2 ORDER BY 1,total DESC`);
      categories[name] = rows;
    }
    const [supervision] = await db.execute(`SELECT c.agency_id,
      CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(c.payload_json,'$.participantRole'))='supervisee' THEN 'supervisee' ELSE 'supervisor_or_unspecified' END participant_role,
      CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(c.payload_json,'$.sessionType'))='group' THEN 'group' ELSE 'individual_or_unknown' END session_kind,
      CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(c.payload_json,'$.hourlySupervision')) IN ('true','1') THEN 1 ELSE 0 END hourly,
      COUNT(*) total,SUM(c.status IN ('approved','paid')) approved,SUM(c.status='rejected') rejected,SUM(c.status='deferred') deferred,SUM(c.status='submitted') pending,
      SUM(COALESCE(u.is_demo,0)=1) demo_staff,SUM(COALESCE(u.is_active,0)=1 AND COALESCE(u.is_archived,0)=0) active_staff,
      SUM(s.status='FINALIZED') source_finalized,SUM(s.status='FINALIZED' AND s.agency_id=c.agency_id AND c.user_id IN (s.supervisor_user_id,s.supervisee_user_id)) source_person_match,
      SUM(c.status IN ('approved','paid') AND ABS(c.credits_hours-CAST(JSON_UNQUOTE(JSON_EXTRACT(c.payload_json,'$.totalMinutes')) AS DECIMAL(10,4))/60)<0.006) approved_hours_match
      FROM payroll_time_claims c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN supervision_sessions s ON s.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(c.payload_json,'$.supervisionSessionId')) AS UNSIGNED)
      WHERE c.agency_id IN (2,6,377) AND JSON_UNQUOTE(JSON_EXTRACT(c.payload_json,'$.source'))='supervision_session_finalize' GROUP BY 1,2,3,4`);
    const [providerUpdate] = await db.execute(`SELECT c.agency_id,CASE WHEN c.status IN ('approved','paid','deferred','submitted','rejected') THEN c.status ELSE 'other' END outcome,COUNT(*) total,
      SUM(COALESCE(u.is_demo,0)=1) demo_staff,SUM(r.id IS NOT NULL AND r.agency_id=c.agency_id AND r.provider_user_id=c.user_id AND r.payroll_time_claim_id=c.id) linked_source,
      SUM(r.finalized_at IS NOT NULL) finalized_source,SUM(ABS(r.active_seconds-CAST(JSON_UNQUOTE(JSON_EXTRACT(c.payload_json,'$.activeSeconds')) AS DECIMAL(12,4)))<0.01) seconds_match,
      SUM(c.status IN ('approved','paid') AND ABS(c.credits_hours-r.active_seconds/3600)<0.006) approved_hours_match
      FROM payroll_time_claims c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN provider_update_recipients r ON r.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(c.payload_json,'$.recipientId')) AS UNSIGNED)
      WHERE c.agency_id IN (2,6,377) AND JSON_UNQUOTE(JSON_EXTRACT(c.payload_json,'$.source'))='provider_update' GROUP BY 1,2`);
    const [reimbursementEvidence] = await db.execute(`SELECT agency_id,CASE WHEN status IN ('approved','paid','submitted','deferred','rejected') THEN status ELSE 'other' END outcome,COUNT(*) total,
      SUM(purchase_preapproved=1) claimed_preapproved,SUM(attestation=1) attested,SUM(receipt_file_path IS NOT NULL AND receipt_file_path<>'') receipt_exists,
      SUM(status IN ('approved','paid') AND ABS(applied_amount-amount)>0.005) changed_amount FROM payroll_reimbursement_claims WHERE agency_id IN (2,6,377) GROUP BY 1,2`);
    return {checkedAt:new Date().toISOString(),database,scope:'Read-only coded aggregates for agencies 2, 6 and 377. No identities, individual record IDs, notes, addresses, client data or attachments are returned.',
      limitation:'Current dispositions are not a complete review-event history. Existing approval clears rejection fields, so absence of a current rejection does not establish first-pass acceptance or future eligibility.',
      time,...categories,supervision,providerUpdate,reimbursementEvidence};
  } finally { await db.rollback(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let db;
  try {
    if (!process.env.DB_NAME || !process.env.DB_USER) throw Error('AUDIT_DATABASE_CONFIGURATION_REQUIRED');
    const host=process.env.DB_HOST||'localhost';
    db=await mysql.createConnection({user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectTimeout:10000,timezone:'Z',...(host.startsWith('/')?{socketPath:host}:{host,port:Number(process.env.DB_PORT||3307)})});
    const report=await auditPayrollApprovalHistory(db);const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9);
    if(output){fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({saved:true,timeCohorts:report.time.length,supervision:report.supervision,providerUpdate:report.providerUpdate,reimbursementEvidence:report.reimbursementEvidence}));}
    else console.log(JSON.stringify(report,null,2));
  } catch (error) { console.error(JSON.stringify({outcome:'BLOCKED',reasonCode:error.code||'APPROVAL_HISTORY_UNAVAILABLE'}));process.exitCode=1; }
  finally { await db?.end(); }
}
