import crypto from 'node:crypto';
import pool from '../config/database.js';
import {requiresQaStripe,verifiedQaPaymentAgency} from '../utils/qaStripeConfiguration.js';
import {requireBillingLink,billingError,recordBillingConsent,auditBilling} from './familyBillingPolicy.service.js';
import {decryptFamilyBilling,encryptFamilyBilling} from './familyBillingEncryption.service.js';

export const QA_PAYMENT_PROCESSOR='QA_SIMULATOR';
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}};
export const qaSimulationAccount=id=>`qa_simulator_${Number(id)}`;
export const isQaSimulationAccount=value=>/^qa_simulator_(450|453|454)$/.test(String(value||''));
export function validateQaCardInput(value){
 if(String(value||'').replace(/\s/g,'')!=='0000000000000000')throw billingError(400,'For this QA simulation, enter sixteen zeros. Do not enter a real card.');
}
export async function qaPaymentSimulationConfig(agencyId,db=pool){
 if(!requiresQaStripe(agencyId))return {enabled:false};
 const [[agency]]=await db.execute('SELECT id,slug,feature_flags,is_active,is_archived FROM agencies WHERE id=?',[Number(agencyId)]);
 const flags=parse(agency?.feature_flags);
 const enabled=verifiedQaPaymentAgency(agency)&&Number(agency.is_active)===1&&!Number(agency.is_archived)&&flags.qaSandbox?.simulatedPaymentsEnabled===true;
 return {enabled,processor:QA_PAYMENT_PROCESSOR,label:'Simulated QA payments — no money moves',...(enabled?{accountId:qaSimulationAccount(agencyId)}:{})};
}
export async function assertQaSimulationScope({agencyId,userId,clientId=null},db=pool){
 const config=await qaPaymentSimulationConfig(agencyId,db);
 if(!config.enabled)throw billingError(403,'Payment simulation is not enabled for this exact QA organization.');
 const [[user]]=await db.execute('SELECT id,role,is_demo,is_active,is_archived,status FROM users WHERE id=?',[Number(userId)]);
 if(!user||Number(user.is_demo)!==1||Number(user.is_active)!==1||Number(user.is_archived)||!['client_guardian','client'].includes(user.role)||['INACTIVE','ARCHIVED','TERMINATED'].includes(String(user.status).toUpperCase()))throw billingError(403,'Only an active synthetic family account can use QA payment simulation.');
 if(clientId){
  const [[client]]=await db.execute('SELECT id,is_demo FROM clients WHERE id=?',[Number(clientId)]);
  if(!client||Number(client.is_demo)!==1)throw billingError(403,'QA payment simulation requires a synthetic student or client.');
  await requireBillingLink(userId,clientId,agencyId,db);
 }
 return config;
}
export async function qaCardMerchant(card,{agencyId,userId,clientId},db=pool){
 if(card?.payment_provider!==QA_PAYMENT_PROCESSOR){
  if(isQaSimulationAccount(card?.connected_account_id))throw billingError(409,'A simulated payment account requires an explicitly simulated card.');
  return null;
 }
 await assertQaSimulationScope({agencyId,userId,clientId},db);
 if(card.connected_account_id!==qaSimulationAccount(agencyId))throw billingError(409,'The simulated card belongs to another organization.');
 return QA_PAYMENT_PROCESSOR;
}
function asIntent(row){
 const meta=parse(row.metadata_json);
 return {id:row.id,status:row.status,amount:Number(row.amount_cents),amount_received:row.status==='succeeded'?Number(row.amount_cents):0,currency:row.currency,customer:meta.customerId||null,metadata:meta,qa_simulated:true,processor:QA_PAYMENT_PROCESSOR,livemode:false};
}
export async function createQaPaymentIntent({agencyId,userId,clientId=null,sourceKind,sourceId,amountCents,currency='usd',idempotencyKey,metadata={},scenario='success'},db=pool){
 await assertQaSimulationScope({agencyId,userId,clientId},db);
 if(!Number.isSafeInteger(Number(amountCents))||Number(amountCents)<0||Number(amountCents)>1000000000||!['package','card_setup','family_charge','family_ledger','refund'].includes(sourceKind)||!sourceId||String(sourceId).length>128||String(currency).toLowerCase()!=='usd'||!['success','decline','processing'].includes(scenario)||!idempotencyKey||String(idempotencyKey).length>191)throw billingError(400,'Review the simulated payment amount and request.');
 const id=`qa_pi_${crypto.randomUUID().replaceAll('-','')}`;
 await db.execute(`INSERT IGNORE INTO qa_payment_simulations(id,agency_id,payer_user_id,client_id,source_kind,source_id,amount_cents,currency,idempotency_key,metadata_json,scenario)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[id,Number(agencyId),Number(userId),clientId?Number(clientId):null,sourceKind,String(sourceId),Number(amountCents),String(currency).toLowerCase(),idempotencyKey,JSON.stringify(metadata),scenario]);
 const [[row]]=await db.execute('SELECT * FROM qa_payment_simulations WHERE agency_id=? AND idempotency_key=?',[Number(agencyId),idempotencyKey]);
 if(!row||Number(row.payer_user_id)!==Number(userId)||Number(row.client_id||0)!==Number(clientId||0)||Number(row.amount_cents)!==Number(amountCents)||row.currency!==String(currency).toLowerCase()||row.source_kind!==sourceKind||String(row.source_id)!==String(sourceId))throw billingError(409,'This simulation request belongs to a different saved payment.');
 return asIntent(row);
}
export async function getQaPaymentIntent(id,agencyId,db=pool){
 const [[row]]=await db.execute('SELECT * FROM qa_payment_simulations WHERE id=? AND agency_id=?',[id,Number(agencyId)]);
 if(!row)throw billingError(404,'Payment simulation not found.');
 await assertQaSimulationScope({agencyId,userId:row.payer_user_id,clientId:row.client_id},db);
 return {...asIntent(row),payerUserId:Number(row.payer_user_id),clientId:Number(row.client_id)||null,sourceKind:row.source_kind,sourceId:String(row.source_id)};
}
export async function confirmQaPaymentIntent({id,agencyId,userId,testCard,scenario='success'},dbPool=pool){
 validateQaCardInput(testCard);
 if(!['success','decline','processing'].includes(scenario))throw billingError(400,'Choose a supported QA outcome.');
 const db=await dbPool.getConnection();
 try{
  await db.beginTransaction();
  const [[row]]=await db.execute('SELECT * FROM qa_payment_simulations WHERE id=? AND agency_id=? AND payer_user_id=? FOR UPDATE',[id,Number(agencyId),Number(userId)]);
  if(!row)throw billingError(404,'Payment simulation not found for your account.');
  await assertQaSimulationScope({agencyId,userId,clientId:row.client_id},db);
  if(!['package','family_charge','family_ledger'].includes(row.source_kind))throw billingError(403,'This simulation cannot be confirmed from the family payment form.');
  if(row.status==='canceled')throw billingError(409,'This simulated payment was canceled. Start a new checkout.');
  if(row.status!=='succeeded'){
   const status={success:'succeeded',decline:'requires_payment_method',processing:'processing'}[scenario];
   if(row.status!==status){
    await db.execute('UPDATE qa_payment_simulations SET status=?,scenario=? WHERE id=?',[status,scenario,id]);
    await db.execute('INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)',['qa_payment_simulated',userId,agencyId,JSON.stringify({simulationId:id,status,processor:QA_PAYMENT_PROCESSOR,sourceKind:row.source_kind,sourceId:row.source_id,amountCents:Number(row.amount_cents),noMoneyMoved:true})]);
   }
   row.status=status;
  }
  await db.commit();return asIntent(row);
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}

export async function createQaTestCard({agencyId,userId,testCard,scenario='success',requestKey,name,consent,ip,userAgent},dbPool=pool){
 validateQaCardInput(testCard);
 if(!/^[A-Za-z0-9:_-]{8,128}$/.test(String(requestKey||''))||!String(name||'').trim()||!['success','decline','processing'].includes(scenario))throw billingError(400,'Review the QA card name, outcome and request.');
 const db=await dbPool.getConnection();
 try{
  await db.beginTransaction();
  await assertQaSimulationScope({agencyId,userId},db);
  const setup=await createQaPaymentIntent({agencyId,userId,sourceKind:'card_setup',sourceId:requestKey,amountCents:0,idempotencyKey:`card:${userId}:${requestKey}`},db);
  const [[saved]]=await db.execute('SELECT id,is_active FROM guardian_payment_cards WHERE agency_id=? AND guardian_user_id=? AND stripe_setup_intent_id=? FOR UPDATE',[agencyId,userId,setup.id]);
  if(saved){if(!Number(saved.is_active))throw billingError(409,'That simulated card was removed. Open a new card form.');await db.commit();return {cardId:Number(saved.id),simulated:true,alreadySaved:true};}
  const methodId=`qa_pm_${crypto.randomUUID().replaceAll('-','')}`;
  const value={stripe_customer_id:`qa_customer_${agencyId}_${userId}`,stripe_payment_method_id:methodId,connected_account_id:qaSimulationAccount(agencyId),card_brand:'QA SIMULATION',card_last4:'0000',cardholder_name:String(name).trim().slice(0,255),qaScenario:scenario,qaSimulation:true};
  const fingerprint=crypto.createHash('sha256').update(`QA_SIMULATOR:${agencyId}:${userId}:${setup.id}`).digest('hex');
  const [card]=await db.execute(`INSERT INTO guardian_payment_cards(guardian_user_id,agency_id,payment_provider,private_payload,method_fingerprint,stripe_setup_intent_id,auto_charge,is_default)
    VALUES (?,?,'QA_SIMULATOR',?,?,?,0,0)`,[userId,agencyId,encryptFamilyBilling(value,`card:${agencyId}:${userId}`),fingerprint,setup.id]);
  await recordBillingConsent({agencyId,userId,cardId:card.insertId,purpose:'store_card',consent,ip,userAgent},db);
  await db.execute("UPDATE qa_payment_simulations SET status='succeeded' WHERE id=?",[setup.id]);
  await auditBilling({agencyId,userId,action:'qa_simulated_card_saved',objectId:card.insertId},db);
  await db.commit();return {cardId:Number(card.insertId),simulated:true};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}

// This adapter is reachable only through an explicitly marked QA card/account.
// The caller's existing payer, coverage, amount and recurring-consent checks run
// before it. It never instantiates Stripe or sends an external request.
export async function qaSimulationGateway(accountId,db=pool){
 if(!isQaSimulationAccount(accountId))throw billingError(403,'Invalid QA payment account.');
 const agencyId=Number(accountId.slice('qa_simulator_'.length));
 if(!(await qaPaymentSimulationConfig(agencyId,db)).enabled)throw billingError(403,'QA payment simulation is disabled.');
 return {qa_simulated:true,paymentIntents:{
  async create(input,options={}){
   const match=String(input.customer||'').match(/^qa_customer_(450|453|454)_(\d+)$/);
   if(!match||Number(match[1])!==agencyId||Number(input.metadata?.agency_id)!==agencyId)throw billingError(403,'The simulated card belongs to another organization.');
   const userId=Number(match[2]);
   const [cards]=await db.execute("SELECT * FROM guardian_payment_cards WHERE agency_id=? AND guardian_user_id=? AND payment_provider='QA_SIMULATOR' AND is_active=1",[agencyId,userId]);
   const card=cards.map(row=>decryptFamilyBilling(row.private_payload,`card:${agencyId}:${userId}`)).find(row=>row?.stripe_payment_method_id===input.payment_method&&row?.connected_account_id===accountId);
   if(!card)throw billingError(403,'This simulated card is no longer available.');
   let sourceKind,sourceId,clientId;
   if(input.metadata.family_charge_id){sourceKind='family_charge';sourceId=input.metadata.family_charge_id;const [[r]]=await db.execute('SELECT client_id FROM learning_session_charges WHERE id=? AND agency_id=?',[sourceId,agencyId]);clientId=r?.client_id;}
   else if(input.metadata.family_ledger_payment_id){sourceKind='family_ledger';sourceId=input.metadata.family_ledger_payment_id;const [[r]]=await db.execute('SELECT r.client_id FROM family_ledger_payments p JOIN family_receivable_allocations a ON a.id=p.allocation_id JOIN family_receivables r ON r.id=a.receivable_id WHERE p.id=? AND p.agency_id=? AND p.payer_user_id=?',[sourceId,agencyId,userId]);clientId=r?.client_id;}
   if(!clientId)throw billingError(409,'The simulated payment needs its exact saved bill.');
   const intent=await createQaPaymentIntent({agencyId,userId,clientId,sourceKind,sourceId,amountCents:Number(input.amount),currency:input.currency,idempotencyKey:options.idempotencyKey,metadata:{...input.metadata,customerId:input.customer},scenario:card.qaScenario||'success'},db);
   if(['succeeded','canceled'].includes(intent.status))return intent;
   const status={success:'succeeded',decline:'requires_payment_method',processing:'processing'}[card.qaScenario||'success'];
   await db.execute('UPDATE qa_payment_simulations SET status=? WHERE id=? AND status<>?', [status,intent.id,'succeeded']);
   return getQaPaymentIntent(intent.id,agencyId,db);
  },
  retrieve:id=>getQaPaymentIntent(id,agencyId,db),
  async cancel(id){const intent=await getQaPaymentIntent(id,agencyId,db);if(intent.status==='succeeded')throw billingError(409,'A completed simulation cannot be canceled.');const [changed]=await db.execute("UPDATE qa_payment_simulations SET status='canceled' WHERE id=? AND agency_id=? AND status<>'succeeded'",[id,agencyId]);if(!changed.affectedRows)throw billingError(409,'The simulated payment completed before cancellation. Refresh its status.');return {...intent,status:'canceled'};}
 },refunds:{
  create:(input,options)=>createQaRefund({agencyId,paymentIntentId:input.payment_intent,amountCents:input.amount,idempotencyKey:options?.idempotencyKey,metadata:input.metadata},db),
  retrieve:async id=>asRefund(await getQaPaymentIntent(id,agencyId,db))
 }};
}

function asRefund(intent){
 if(intent.sourceKind!=='refund')throw billingError(409,'This simulation is not a refund.');
 return {...intent,payment_intent:intent.metadata.originalPaymentIntentId};
}

// Called only after the normal staff refund workflow has reserved its amount.
// Locking the original simulation also bounds concurrent refund requests.
export async function createQaRefund({agencyId,paymentIntentId,amountCents,idempotencyKey,metadata},dbPool=pool){
 const db=await dbPool.getConnection();
 try{
  await db.beginTransaction();
  await db.execute('SELECT id FROM qa_payment_simulations WHERE id=? AND agency_id=? FOR UPDATE',[paymentIntentId,agencyId]);
  const original=await getQaPaymentIntent(paymentIntentId,agencyId,db);
  if(original.status!=='succeeded'||original.sourceKind==='refund'||!Number.isSafeInteger(Number(amountCents))||Number(amountCents)<=0)throw billingError(409,'Only a successful simulated payment can be refunded.');
  const [[prior]]=await db.execute('SELECT * FROM qa_payment_simulations WHERE agency_id=? AND idempotency_key=?',[agencyId,idempotencyKey]);
  if(!prior){
   const [[used]]=await db.execute("SELECT COALESCE(SUM(amount_cents),0) AS amount FROM qa_payment_simulations WHERE agency_id=? AND source_kind='refund' AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.originalPaymentIntentId'))=? AND status='succeeded'",[agencyId,paymentIntentId]);
   if(Number(used.amount)+Number(amountCents)>original.amount)throw billingError(409,'The simulated refund exceeds the original payment.');
  }
  const intent=await createQaPaymentIntent({agencyId,userId:original.payerUserId,clientId:original.clientId,sourceKind:'refund',sourceId:metadata?.family_ledger_refund_id,amountCents:Number(amountCents),currency:original.currency,idempotencyKey,metadata:{...metadata,originalPaymentIntentId:paymentIntentId}},db);
  if(intent.metadata.originalPaymentIntentId!==paymentIntentId)throw billingError(409,'The simulated refund belongs to another payment.');
  await db.execute("UPDATE qa_payment_simulations SET status='succeeded' WHERE id=?",[intent.id]);
  await db.commit();
  return asRefund({...intent,status:'succeeded',sourceKind:'refund'});
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}

export async function listOwnQaPayments({agencyId,userId},db=pool){
 await assertQaSimulationScope({agencyId,userId},db);
 const [rows]=await db.execute("SELECT * FROM qa_payment_simulations WHERE agency_id=? AND payer_user_id=? AND source_kind IN ('family_charge','family_ledger') AND status IN ('processing','requires_payment_method','requires_confirmation') ORDER BY created_at DESC LIMIT 50",[agencyId,userId]);
 const visible=[];
 for(const row of rows){
  try{await assertQaSimulationScope({agencyId,userId,clientId:row.client_id},db);visible.push(asIntent(row));}
  catch(error){if(error.status!==403)throw error;}
 }
 return visible;
}
