import pool from '../config/database.js';
import Stripe from './stripePayments.service.js';
import {transaction} from './familyLedger/policy.js';
import {billingError} from './familyBillingPolicy.service.js';
export async function preparePractitionerCheckout({packet,pkg,paymentMode,amountCents,connectedAccountId}){
 const attempt=await transaction(async db=>{
  const [packets]=await db.execute('SELECT selected_package_id FROM practitioner_client_packets WHERE id=? AND agency_id=? FOR UPDATE',[packet.id,packet.agency_id]);
  if(!packets.length||packets[0].selected_package_id)throw billingError(409,'A package has already been selected');
  const [rows]=await db.execute('SELECT * FROM practitioner_packet_checkout_attempts WHERE packet_id=? FOR UPDATE',[packet.id]);
  if(rows.length){const row=rows[0];if(Number(row.package_id)!==Number(pkg.id)||row.payment_mode!==paymentMode||row.connected_account_id!==connectedAccountId)throw billingError(409,'This packet already has a checkout in progress. Complete that purchase or contact the office before changing packages.');return row;}
  if(!Number.isSafeInteger(amountCents)||amountCents<1||!Number.isSafeInteger(Number(pkg.session_count))||Number(pkg.session_count)<1)throw billingError(400,'Package pricing or session count needs correction');
  const [result]=await db.execute('INSERT INTO practitioner_packet_checkout_attempts (packet_id,agency_id,package_id,payment_mode,amount_cents,sessions_purchased,connected_account_id) VALUES (?,?,?,?,?,?,?)',[packet.id,packet.agency_id,pkg.id,paymentMode,amountCents,pkg.session_count,connectedAccountId]);
  return {id:result.insertId,packet_id:packet.id,agency_id:packet.agency_id,package_id:pkg.id,payment_mode:paymentMode,amount_cents:amountCents,sessions_purchased:pkg.session_count,connected_account_id:connectedAccountId,created_at:new Date()};
 });
 if(!attempt.processor_intent_id&&Date.now()-new Date(attempt.created_at).getTime()>23*3600000)throw billingError(409,'This checkout needs processor reconciliation before another attempt');
 const intent=attempt.processor_intent_id?await Stripe.retrievePaymentIntent(attempt.processor_intent_id,attempt.connected_account_id):await Stripe.createPaymentIntent({amountCents:attempt.amount_cents,currency:'usd',metadata:{packet_id:String(packet.id),package_id:String(pkg.id),payment_mode:paymentMode,agency_id:String(packet.agency_id),client_id:String(packet.client_id),source:'practitioner_packet'},connectedAccountId:attempt.connected_account_id,idempotencyKey:`practitioner-packet:${packet.agency_id}:${attempt.id}`});
 await pool.execute('UPDATE practitioner_packet_checkout_attempts SET processor_intent_id=? WHERE id=?',[intent.id,attempt.id]);return {intent,amountCents:Number(attempt.amount_cents)};
}
export async function savedPractitionerCheckout(packet,paymentIntentId){
 const [rows]=await pool.execute('SELECT * FROM practitioner_packet_checkout_attempts WHERE packet_id=? AND agency_id=?',[packet.id,packet.agency_id]);
 if(!rows.length)return null; // Pre-migration intents still undergo complete server-side verification.
 if(rows[0].processor_intent_id!==paymentIntentId)throw billingError(409,'Payment does not match the saved checkout');return rows[0];
}
