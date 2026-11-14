import pool from '../config/database.js';
import BookingPackage from '../models/BookingPackage.model.js';
import Payment from '../models/BookingPackagePayment.model.js';
import {assertQaSimulationScope,createQaPaymentIntent,QA_PAYMENT_PROCESSOR} from './qaPaymentSimulator.service.js';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export async function prepareQaPackageCheckout({agencyId,clientId,purchaserUserId,actorUserId,pkg,pricingSnapshot},dbPool=pool){
 const db=await dbPool.getConnection();let held=false;
 const lock=`qa-package:${crypto.createHash('sha256').update(`${agencyId}:${clientId}:${pkg.id}:${purchaserUserId}`).digest('hex').slice(0,40)}`;
 try{
  const [[claim]]=await db.execute('SELECT GET_LOCK(?,5) AS acquired',[lock]);held=!!Number(claim?.acquired);
  if(!held)throw Object.assign(new Error('Your QA checkout is already being prepared. Wait before trying again.'),{status:409});
  await db.beginTransaction();
  await assertQaSimulationScope({agencyId,userId:purchaserUserId,clientId},db);
  const [pending]=await db.execute(`SELECT e.id,e.stripe_payment_intent_id,e.pricing_snapshot_json FROM booking_package_entitlements e
    JOIN booking_package_payments p ON p.entitlement_id=e.id AND p.processor='QA_SIMULATOR' AND p.payment_status='PENDING'
    JOIN qa_payment_simulations q ON q.id=e.stripe_payment_intent_id AND q.status<>'canceled'
    WHERE e.agency_id=? AND e.client_id=? AND e.package_id=? AND e.purchaser_user_id=? AND e.payment_status='PENDING' ORDER BY e.id DESC`,[agencyId,clientId,pkg.id,purchaserUserId]);
  const same=pending.find(row=>isDeepStrictEqual(typeof row.pricing_snapshot_json==='string'?JSON.parse(row.pricing_snapshot_json):row.pricing_snapshot_json,pricingSnapshot));
  let entitlement=same?await BookingPackage.findEntitlementById(same.id,agencyId,db):null;
  if(!entitlement)entitlement=await BookingPackage.createPendingEntitlement({agencyId,clientId,packageId:pkg.id,purchaserUserId,createdByUserId:actorUserId,pricingSnapshot},db);
  const intent=await createQaPaymentIntent({agencyId,userId:purchaserUserId,clientId,sourceKind:'package',sourceId:entitlement.id,amountCents:pricingSnapshot.amountCents,idempotencyKey:`package:${entitlement.id}`,metadata:{packageId:pkg.id,entitlementId:entitlement.id,pricingSnapshot}},db);
  if(!same){
   await db.execute('UPDATE booking_package_entitlements SET stripe_payment_intent_id=? WHERE id=? AND agency_id=?',[intent.id,entitlement.id,agencyId]);
   await Payment.create({agencyId,clientId,entitlementId:entitlement.id,packageId:pkg.id,amountCents:pricingSnapshot.amountCents,paymentMode:'PAY_IN_FULL',paymentStatus:'PENDING',processor:QA_PAYMENT_PROCESSOR,processorIntentId:intent.id,createdByUserId:actorUserId,metadata:{simulated:true,noMoneyMoved:true,pricingSnapshot}},db);
  }
  await db.commit();
  return {ok:true,stripeEnabled:false,simulated:true,processor:QA_PAYMENT_PROCESSOR,amountCents:pricingSnapshot.amountCents,paymentIntentId:intent.id,entitlementId:entitlement.id,package:pkg};
 }catch(error){await db.rollback();throw error;}finally{try{if(held)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{db.release();}}
}

export function assertQaPackageResult(intent,{agencyId,clientId,purchaserUserId,entitlement,payment}){
 if(!intent?.qa_simulated||intent.status!=='succeeded'||Number(intent.amount_received)!==Number(payment.amountCents)||String(intent.currency).toLowerCase()!==String(payment.currency).toLowerCase()||Number(intent.payerUserId)!==Number(purchaserUserId)||Number(intent.clientId)!==Number(clientId)||intent.sourceKind!=='package'||String(intent.sourceId)!==String(entitlement.id)||Number(intent.metadata?.packageId)!==Number(payment.packageId)||Number(payment.agencyId)!==Number(agencyId))throw Object.assign(new Error('The QA simulator has not confirmed this exact package payment.'),{status:409});
}
