import pool from '../config/database.js';
import {requiresQaStripe,verifiedQaPaymentAgency} from '../utils/qaStripeConfiguration.js';

export async function assertQaStripeWebhookScope(event,db=pool){
 const fail=()=>{throw Object.assign(new Error('This webhook accepts only verified synthetic QA test events.'),{status:400});};
 if(event?.livemode!==false||event.data?.object?.livemode===true)fail();
 const account=event.account||(event.type==='account.updated'?event.data?.object?.id:null);
 const agencyId=Number(event.data?.object?.metadata?.agency_id)||null;
 let rows;
 if(account){
  [rows]=await db.execute(`SELECT a.id,a.slug,a.feature_flags FROM agency_billing_accounts b JOIN agencies a ON a.id=b.agency_id
    WHERE b.stripe_connect_account_id=? AND a.id IN (450,453,454)`,[account]);
 }else if(requiresQaStripe(agencyId)){
  [rows]=await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=?',[agencyId]);
 }else fail();
 if(rows.length!==1||!verifiedQaPaymentAgency(rows[0])||agencyId&&Number(rows[0].id)!==agencyId)fail();
 return {agencyId:Number(rows[0].id),connectedAccountId:account||null};
}
