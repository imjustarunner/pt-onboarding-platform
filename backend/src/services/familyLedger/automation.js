import pool from '../../config/database.js';
import {syncSessionBalances,fulfillPaidBalances} from './sources.js';
import {runDuePlans} from './plans.js';
import {runDueCopays} from './copays.js';
import {aging,draftNotice} from './collections.js';
import {seedBillingSenders} from './senders.js';
import {parseJson,today} from './policy.js';
/** No outbound emails: automation produces reviewable drafts. */
export async function runFamilyBillingAutomation(){
  const [agencies]=await pool.execute('SELECT id,feature_flags FROM agencies WHERE is_active=1');const results=[];
  for(const agency of agencies){const flags=parseJson(agency.feature_flags,{});if(flags.familyBillingAutomationEnabled!==true)continue;
    const [actors]=await pool.execute("SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=? AND (ua.has_billing_access=1 OR u.role IN ('admin','agency_admin')) AND u.role NOT IN ('provider','provider_plus') AND u.status NOT IN ('ARCHIVED','INACTIVE_EMPLOYEE') ORDER BY u.id LIMIT 1",[agency.id]);if(!actors.length)continue;
    const c={agencyId:agency.id,actorUserId:actors[0].id,userId:actors[0].id};
    try{
      await syncSessionBalances(c);const copays=await runDueCopays(c);const payments=await runDuePlans(c);const fulfillment=await fulfillPaidBalances(c);
      if(flags.workspaceEmailDomain)await seedBillingSenders(agency.id);
      const rows=await aging(c);let drafted=0;
      // At most one daily draft per payer. A human reviews and sends the letter.
      for(const payerUserId of new Set(rows.map(r=>r.payerUserId))){await draftNotice({...c,payerUserId,kind:'past_due',idempotencyKey:`daily-statement:${today()}:${payerUserId}`});drafted++;}
      results.push({agencyId:agency.id,payments,copays,fulfillment,drafted});
    }catch(e){results.push({agencyId:agency.id,error:e.status?e.message:'Billing automation needs review'});}
  }return results;
}
