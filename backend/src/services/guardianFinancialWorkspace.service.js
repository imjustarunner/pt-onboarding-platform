import pool from '../config/database.js';
import {guardianWorkspace} from './guardianWorkspace.service.js';
import {requireClientAccountSupport} from './clientAccountSupportAccess.service.js';
import {readClientInsurance} from './clientInsurance.service.js';
import {decodeInsuranceProfile} from '../models/GuardianInsuranceProfile.model.js';
import {requireBillingStaff} from './familyLedger/policy.js';
import {clientBillingAccount} from './clientBillingAccount.service.js';
import {listBalances} from './familyLedger/views.js';
import GuardianPaymentCard from '../models/GuardianPaymentCard.model.js';

export function insuranceSummary(value, source='chart') {
 const policies=['primary','secondary'].flatMap(slot=>{
  const p=value?.[slot]||{insurerName:value?.[`${slot}_insurer_name`],memberId:value?.[`${slot}_member_id`],subscriberName:value?.[`${slot}_subscriber_name`]};if(!p || ![p.insurerName,p.memberId,p.subscriberName].some(Boolean))return [];
  return [{slot,insurerName:p.insurerName||null,memberLastFour:p.memberId?String(p.memberId).slice(-4):null,
   subscriberName:p.subscriberName||null,relationshipToSubscriber:p.relationshipToSubscriber||null}];
 });
 return {state:policies.length?'recorded':'missing',source,policies};
}
export async function guardianFinancialWorkspace({actor,guardianId},overrides={}) {
 const d={db:pool,workspace:guardianWorkspace,support:requireClientAccountSupport,insurance:readClientInsurance,
  decode:decodeInsuranceProfile,billing:requireBillingStaff,account:clientBillingAccount,balances:listBalances,cards:(guardianId,agencyId)=>GuardianPaymentCard.findActiveByGuardian(guardianId,agencyId),...overrides};
 const account=await d.workspace({actor,guardianId},{includeBalances:false});
 const clients=[];
 for(const client of account.clients){
  const cid=Number(client.client_id),aid=Number(client.agency_id);
  const row={clientId:cid,agencyId:aid,name:client.full_name||client.initials,agencyName:client.agency_name,
   insurance:{state:'unavailable',policies:[]},billing:{available:false}};
  try{
   await d.support(actor,cid,aid);
   row.insurance=insuranceSummary(await d.insurance(cid,aid));
   if(row.insurance.state==='missing'){
    const [submitted]=await d.db.execute(`SELECT p.* FROM guardian_insurance_profiles p
     LEFT JOIN guardian_insurance_clients gic ON gic.profile_id=p.id AND gic.agency_id=p.agency_id
     WHERE p.agency_id=? AND (p.client_id=? OR gic.client_id=?) ORDER BY p.collected_at DESC LIMIT 1`,[aid,cid,cid]);
    if(submitted[0])row.insurance=insuranceSummary(d.decode(submitted[0]),'submitted');
   }
   if(row.insurance.state==='missing'){
    const [[legacy]]=await d.db.execute('SELECT primary_insurer_name,insurance_member_id,insurance_subscriber_name FROM clients WHERE id=? AND agency_id=?',[cid,aid]);
    row.insurance=insuranceSummary({primary:{insurerName:legacy?.primary_insurer_name,memberId:legacy?.insurance_member_id,subscriberName:legacy?.insurance_subscriber_name}},'chart_legacy');
   }
  }catch(e){row.insurance={state:e.status===403?'restricted':'unavailable',policies:[],message:e.status===403?'Insurance requires client account support access.':'Insurance could not be loaded. Try again.'};}
  try{
   await d.billing(actor,aid);
   const settings=await d.account(aid,cid);
   const rows=(await d.balances({agencyId:aid,userId:actor.id,clientId:cid,staff:true})).filter(r=>Number(r.payerUserId)===Number(guardianId));
   const [[payer]]=await d.db.execute('SELECT status,payment_card_id FROM client_billing_payers WHERE agency_id=? AND client_id=? AND guardian_user_id=?',[aid,cid,guardianId]);
   let methods=[];let methodsAvailable=true;
   try {methods=(await d.cards(guardianId,aid)).map(card=>({brand:card.card_brand||'Card',lastFour:card.card_last4,expiryMonth:card.card_exp_month,expiryYear:card.card_exp_year,verificationRequired:card.legacyRequiresReview===true,assignedToClient:Number(card.id)===Number(payer?.payment_card_id)}));}catch{methodsAvailable=false;}
   row.billing={available:true,responsibleParty:settings.responsibleParty,
    isResponsibleParty:settings.responsibleParty?.kind==='account'&&Number(settings.responsibleParty.userId)===Number(guardianId),
    payerStatus:payer?.status||null,paymentMethods:methods,paymentMethodsAvailable:methodsAvailable,assignedBalances:rows.length,
    dueCents:rows.reduce((n,r)=>n+(r.paymentStatus?0:Math.max(0,Number(r.dueCents)||0)),0)};
  }catch(e){row.billing={available:false,message:e.status===403?'Billing access is required.':'Billing information could not be loaded. Try again.'};}
  clients.push(row);
 }
 return {guardianId:Number(guardianId),clients};
}
