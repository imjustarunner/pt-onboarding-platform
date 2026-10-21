import pool from '../../config/database.js';
import {billingError,auditBilling} from '../familyBillingPolicy.service.js';

// One worker owns the right to create an intent. A saved processor reference is
// always reconciled read-only; an ambiguous older dispatch is never re-created.
export async function claimProcessorDispatch({attempt,agencyId,userId,allocationId,automatic=false,planId=null}, {database=pool,checkDate=null}={}) {
  if(attempt.processor_intent_id)return {intentId:attempt.processor_intent_id};
  const [claimed]=await database.execute("UPDATE family_ledger_payments SET processor_dispatch_started_at=UTC_TIMESTAMP(6) WHERE id=? AND agency_id=? AND status='pending' AND processor_intent_id IS NULL AND processor_dispatch_started_at IS NULL",[attempt.id,agencyId]);
  if(!claimed.affectedRows){
    const [[current]]=await database.execute('SELECT processor_intent_id,status FROM family_ledger_payments WHERE id=? AND agency_id=?',[attempt.id,agencyId]);
    if(current?.processor_intent_id)return {intentId:current.processor_intent_id};
    throw billingError(409,'This payment is being processed or needs reconciliation. No second charge was started.');
  }
  if(automatic&&!planId){
    try {
      const check=checkDate||(await import('./copays.js')).assertAutomaticCopayDispatchDate;
      await check({agencyId,allocationId});
    }catch(error){
      // This worker won the dispatch claim and has not contacted Stripe. Other
      // workers cannot dispatch this attempt, so canceling it is truthful.
      await database.execute("UPDATE family_ledger_payments SET status='cancelled' WHERE id=? AND agency_id=? AND status='pending' AND processor_intent_id IS NULL",[attempt.id,agencyId]);
      await auditBilling({agencyId,userId,action:'automatic_copay_stopped_before_dispatch',objectId:attempt.id},database);
      throw error;
    }
  }
  return {intentId:null};
}
