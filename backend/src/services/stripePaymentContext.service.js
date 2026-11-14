import pool from '../config/database.js';
import {requiresQaStripe,verifiedQaPaymentAgency,stripeConfiguration} from '../utils/qaStripeConfiguration.js';

const error=(status,message)=>Object.assign(new Error(message),{status,statusCode:status,code:'QA_STRIPE_TEST_MODE_REQUIRED'});
export async function stripePaymentConfiguration({connectedAccountId=null,agencyId=null}={},db=pool){
 let agency=null;
 if(requiresQaStripe(agencyId)){
  const [[row]]=await db.execute(`SELECT a.id,a.slug,a.feature_flags,b.stripe_connect_account_id FROM agencies a
    LEFT JOIN agency_billing_accounts b ON b.agency_id=a.id WHERE a.id=?`,[Number(agencyId)]);
  agency=row;
  if(!verifiedQaPaymentAgency(agency))throw error(503,'The QA payment organization must be verified before using test payments.');
  if(connectedAccountId&&agency.stripe_connect_account_id!==connectedAccountId)throw error(409,'The payment account does not belong to this QA organization.');
 }else if(connectedAccountId){
  const [rows]=await db.execute(`SELECT a.id,a.slug,a.feature_flags FROM agency_billing_accounts b JOIN agencies a ON a.id=b.agency_id
    WHERE b.stripe_connect_account_id=? AND a.id IN (450,453,454)`,[connectedAccountId]);
  if(rows.length>1)throw error(409,'Review the shared QA payment account before continuing.');
  agency=rows[0]||null;
  if(agency&&(!verifiedQaPaymentAgency(agency)||agencyId&&Number(agencyId)!==Number(agency.id)))throw error(409,'The QA payment account and organization do not match.');
 }
 const config=stripeConfiguration(agency?.id);
 if(agency&&!config.allowed)throw error(503,'This QA organization requires its own verified Stripe test-mode configuration.');
 return config;
}
