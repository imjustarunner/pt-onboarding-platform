import pool from '../config/database.js';
export const complianceDeliveryStatus = result => (result?.pendingApproval || result?.queued) && result?.communicationId ? 'pending_approval'
  : result?.redirected ? 'redirected' : result?.skipped || result?.blocked ? 'blocked' : result?.id ? 'sent' : 'delivery_unknown';
const display=row=>({status:row.status,sentAt:row.sent_at || null,communicationId:row.communication_id || null});
export function createComplianceDelivery(db=pool) {
  async function list({agencyId,payrollPeriodId}) {
    const [rows]=await db.execute(`SELECT d.user_id,d.status,d.sent_at,d.communication_id,c.external_message_id,c.sent_at communication_sent_at,c.metadata
      FROM payroll_compliance_deliveries d LEFT JOIN user_communications c ON c.id=d.communication_id AND c.agency_id=d.agency_id
      WHERE d.agency_id=? AND d.payroll_period_id=?`,[agencyId,payrollPeriodId]);
    return new Map(rows.map(row=>{
      // Queued messages can be sent later by the shared approval queue.
      let metadata={};try{metadata=typeof row.metadata==='string'?JSON.parse(row.metadata):row.metadata || {};}catch{}
      if(['sending','pending_approval','delivery_unknown'].includes(row.status) && (row.external_message_id || row.communication_sent_at)) {
        row.status=metadata.testInboxRedirect || metadata.testInboxRedirected?'redirected':'sent';row.sent_at=row.communication_sent_at || row.sent_at;
      }
      return [Number(row.user_id),display(row)];
    }));
  }
  async function deliver({agencyId,payrollPeriodId,userId,actorUserId,send}) {
    const [claim]=await db.execute("INSERT IGNORE INTO payroll_compliance_deliveries (agency_id,payroll_period_id,user_id,requested_by_user_id,status) VALUES (?,?,?,?,'sending')",[agencyId,payrollPeriodId,userId,actorUserId || null]);
    if(!Number(claim.affectedRows))return {...(await list({agencyId,payrollPeriodId})).get(Number(userId)),reused:true};
    const id=Number(claim.insertId);
    try {
      const result=await send();
      const status=complianceDeliveryStatus(result);
      await db.execute("UPDATE payroll_compliance_deliveries SET status=?,communication_id=?,sent_at=CASE WHEN ?='sent' THEN CURRENT_TIMESTAMP(3) ELSE NULL END WHERE id=?",[status,result?.communicationId || null,status,id]);
      return {status,communicationId:result?.communicationId || null,sentAt:status==='sent'?new Date().toISOString():null};
    }catch(error){
      // A transport timeout may occur after acceptance. Keep the reservation so
      // refreshing or clicking again cannot send a duplicate reminder.
      await db.execute("UPDATE payroll_compliance_deliveries SET status='delivery_unknown',communication_id=? WHERE id=?",[error.communicationId || null,id]);
      throw error;
    }
  }
  return {list,deliver};
}
export default createComplianceDelivery();
