import crypto from 'node:crypto';
import { depositVerificationTargets, matchesEraDeposit } from './bankDepositVerification.service.js';
import Stripe from 'stripe';
import pool from '../config/database.js';
import {billingError,auditBilling} from './familyBillingPolicy.service.js';
import {encryptFamilyBilling,decryptFamilyBilling,assertFamilyBillingEncryption} from './familyBillingEncryption.service.js';
import {isStripeConfigured,getStripePublishableKey} from './stripePayments.service.js';

function stripeClient(){if(!isStripeConfigured())throw billingError(503,'Stripe is not configured');return new Stripe(process.env.STRIPE_SECRET_KEY,{apiVersion:'2024-06-20',timeout:30000,maxNetworkRetries:1});}
const currentMode=()=>String(process.env.STRIPE_SECRET_KEY||'').includes('_live_');
function requireEnabled(){if(process.env.BANK_FEEDS_ENABLED!=='true')throw billingError(409,'Bank feeds await deployment activation and Stripe Financial Connections registration');assertFamilyBillingEncryption();}
const accountContext=(agencyId,id)=>`bank-account:${agencyId}:${id}`;
const transactionContext=(agencyId,accountId)=>`bank-transaction:${agencyId}:${accountId}`;
export function verifyBankAccount(account,customerId,livemode){
 if(!account?.id?.startsWith('fca_')||account.account_holder?.customer!==customerId||account.livemode!==!!livemode)throw billingError(409,'The bank account does not match this connection owner and mode');
 if(account.category!=='cash')throw billingError(409,'Select a cash bank account for payer deposits');
 if(account.status!=='active'||!account.permissions?.includes('transactions'))throw billingError(409,'The account needs active transaction-sharing consent');
}
export function bankTransactionEvidence(value,account){
 if(value.account!==account.external_id||value.livemode!==!!account.livemode||!value.id?.startsWith('fctxn_')||!Number.isSafeInteger(value.amount)||!Number.isSafeInteger(value.updated)||!Number.isSafeInteger(value.transacted_at)||!['pending','posted','void'].includes(value.status)||!/^[a-z]{3}$/.test(value.currency))throw billingError(502,'Bank transaction identity or format could not be verified');
 return {reference:value.id,amountCents:value.amount,currency:value.currency,status:value.status,transactedAt:value.transacted_at,postedAt:value.status_transitions?.posted_at||null,updated:value.updated};
}
export async function bankFeedOverview(agencyId,accountId=null,after=0){
 const [rows]=await pool.execute('SELECT * FROM bank_feed_accounts WHERE agency_id=? ORDER BY id',[agencyId]);
 const accounts=rows.map(r=>({id:r.id,status:r.status,syncEnabled:!!r.sync_enabled,sharedAccount:!!r.shared_account,livemode:!!r.livemode,lastSyncedAt:r.last_synced_at,lastError:r.last_error,...decryptFamilyBilling(r.details_encrypted,accountContext(agencyId,r.external_id))}));
 const selected=rows.find(r=>Number(r.id)===Number(accountId));
 if(accountId&&!selected)throw billingError(404,'Bank connection not found in this agency');
 const targets=selected?await depositVerificationTargets(pool,selected):[];
 return {enabled:process.env.BANK_FEEDS_ENABLED==='true',stripeConfigured:isStripeConfigured()&&!!getStripePublishableKey(),accounts,verifications:targets.map(t=>({id:t.id,...t.era,status:t.status,updatedAt:t.updated_at})),nextAfter:null};
}
export async function startBankConnection(input,deps={}){
 requireEnabled();if(input.ownerAuthorized!==true||typeof input.sharedAccount!=='boolean'||!/^[-a-f0-9]{36}$/i.test(input.requestKey||''))throw billingError(400,'Confirm authority to share this organization’s bank transactions');
 const stripe=deps.stripe||stripeClient(),db=deps.db||pool,livemode=deps.livemode??currentMode(),publishableKey=getStripePublishableKey();
 if(!publishableKey||publishableKey.startsWith('pk_live_')!==livemode)throw billingError(503,'Stripe publishable and secret keys must use the same mode');
 const [[agency]]=await db.execute('SELECT id,name FROM agencies WHERE id=?',[input.agencyId]);if(!agency)throw billingError(404,'Agency not found');
 let [[owner]]=await db.execute('SELECT stripe_customer_id FROM agency_bank_feed_customers WHERE agency_id=? AND livemode=?',[input.agencyId,livemode]);
 if(!owner){const customer=await stripe.customers.create({name:agency.name,metadata:{agency_id:String(input.agencyId),purpose:'bank_transaction_feed'}},{idempotencyKey:`bank-owner:${input.agencyId}:${livemode}`});await db.execute('INSERT INTO agency_bank_feed_customers (agency_id,livemode,stripe_customer_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE agency_id=VALUES(agency_id)',[input.agencyId,livemode,customer.id]);[[owner]]=await db.execute('SELECT stripe_customer_id FROM agency_bank_feed_customers WHERE agency_id=? AND livemode=?',[input.agencyId,livemode]);}
 await db.execute('INSERT INTO bank_feed_sessions (session_key,agency_id,actor_user_id,stripe_customer_id,livemode,shared_account) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE session_key=VALUES(session_key)',[input.requestKey,input.agencyId,input.actorUserId,owner.stripe_customer_id,livemode,input.sharedAccount]);
 const [[saved]]=await db.execute('SELECT * FROM bank_feed_sessions WHERE session_key=?',[input.requestKey]);
 if(saved.agency_id!==input.agencyId||saved.actor_user_id!==input.actorUserId||saved.stripe_customer_id!==owner.stripe_customer_id||!!saved.shared_account!==input.sharedAccount||saved.completed_at||Date.now()-new Date(saved.created_at).getTime()>3600000)throw billingError(409,'Start a new bank connection for this organization');
 const session=saved.stripe_session_id?await stripe.financialConnections.sessions.retrieve(saved.stripe_session_id):await stripe.financialConnections.sessions.create({account_holder:{type:'customer',customer:owner.stripe_customer_id},permissions:['transactions']},{idempotencyKey:`bank-session:${input.requestKey}`});
 await db.execute('UPDATE bank_feed_sessions SET stripe_session_id=? WHERE session_key=? AND agency_id=?',[session.id,input.requestKey,input.agencyId]);
 return {sessionKey:input.requestKey,clientSecret:session.client_secret,publishableKey};
}
export async function completeBankConnection({agencyId,actorUserId,sessionKey},deps={}){
 requireEnabled();const stripe=deps.stripe||stripeClient(),db=deps.db||pool;
 const [[saved]]=await db.execute('SELECT * FROM bank_feed_sessions WHERE session_key=? AND agency_id=? AND actor_user_id=?',[sessionKey,agencyId,actorUserId]);
 if(!saved?.stripe_session_id||saved.completed_at||Date.now()-new Date(saved.created_at).getTime()>3600000)throw billingError(409,'This connection session expired; start again');
 if(!!saved.livemode!==(deps.livemode??currentMode()))throw billingError(409,'Bank connection mode differs from the configured Stripe account');
 const session=await stripe.financialConnections.sessions.retrieve(saved.stripe_session_id);
 if(session.account_holder?.customer!==saved.stripe_customer_id||session.livemode!==!!saved.livemode)throw billingError(409,'Connection session ownership could not be verified');
 const accounts=session.accounts?.data||[];
 if(!accounts.length||session.accounts.has_more||accounts.length>10)throw billingError(409,'Connect between one and ten accounts in this session');
 // Consume once before activation; an interrupted setup requires fresh owner consent.
 const [consumed]=await db.execute('UPDATE bank_feed_sessions SET completed_at=UTC_TIMESTAMP() WHERE session_key=? AND agency_id=? AND completed_at IS NULL',[sessionKey,agencyId]);
 if(consumed.affectedRows!==1)throw billingError(409,'This connection session was already completed; refresh the accounts');
 const ids=[];
 for(const account of accounts){
  verifyBankAccount(account,saved.stripe_customer_id,saved.livemode);
  const connection=await db.getConnection();
  try{await connection.beginTransaction();
   const details=encryptFamilyBilling({institution:account.institution_name||'Bank',name:account.display_name||'Account',last4:account.last4||''},accountContext(agencyId,account.id));
   await connection.execute('INSERT INTO bank_feed_accounts (agency_id,external_id,stripe_customer_id,livemode,shared_account,details_encrypted,connected_by_user_id) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE external_id=VALUES(external_id)',[agencyId,account.id,saved.stripe_customer_id,saved.livemode,saved.shared_account,details,actorUserId]);
   const [[record]]=await connection.execute('SELECT * FROM bank_feed_accounts WHERE external_id=? FOR UPDATE',[account.id]);
   if(record.agency_id!==agencyId||record.stripe_customer_id!==saved.stripe_customer_id||['disconnecting','disconnected','inactive'].includes(record.status))throw billingError(409,'Bank account is already assigned to a different owner');
   await connection.execute("UPDATE bank_feed_accounts SET sync_enabled=1,status='pending',details_encrypted=?,shared_account=?,connected_by_user_id=?,next_sync_at=UTC_TIMESTAMP() WHERE id=?",[details,saved.shared_account,actorUserId,record.id]);
   await auditBilling({agencyId,userId:actorUserId,action:'bank_feed_consent_completed',objectId:record.id},connection);
   await connection.commit();ids.push(record.id);
  }catch(e){await connection.rollback();throw e;}finally{connection.release();}
  // Persist ownership before subscribing so a fast webhook can find its agency.
  try {await stripe.financialConnections.accounts.subscribe(account.id,{features:['transactions']});}
  catch(e){await db.execute("UPDATE bank_feed_accounts SET last_error='Daily updates could not be enabled; reconnect with owner consent',sync_enabled=0,status='subscription_failed' WHERE external_id=? AND agency_id=?",[account.id,agencyId]);throw e;}
 }
 await db.execute('UPDATE bank_feed_sessions SET completed_at=UTC_TIMESTAMP() WHERE session_key=? AND agency_id=?',[sessionKey,agencyId]);
 return {accountIds:ids};
}
export async function disconnectBankFeed({agencyId,accountId,actorUserId},deps={}){
 const db=deps.db||pool,stripe=deps.stripe||stripeClient();
 const [[row]]=await db.execute('SELECT external_id,livemode FROM bank_feed_accounts WHERE id=? AND agency_id=?',[accountId,agencyId]);if(!row)throw billingError(404,'Bank connection not found');
 await db.execute("UPDATE bank_feed_accounts SET sync_enabled=0,status='disconnecting' WHERE id=? AND agency_id=?",[accountId,agencyId]);
 if(!!row.livemode!==(deps.livemode??currentMode()))throw billingError(409,'Local import stopped; restore the matching Stripe mode to revoke bank access');
 await stripe.financialConnections.accounts.disconnect(row.external_id);
 await db.execute("UPDATE bank_feed_accounts SET status='disconnected',last_error=NULL WHERE id=? AND agency_id=?",[accountId,agencyId]);
 await auditBilling({agencyId,userId:actorUserId,action:'bank_feed_disconnected',objectId:accountId},db);return {disconnected:true};
}
export async function storeBankTransaction(db,account,value){
 const evidence=bankTransactionEvidence(value,account);
 const [[old]]=await db.execute('SELECT id,vendor_updated,evidence_hash FROM bank_feed_transactions WHERE account_id=? AND agency_id=? AND external_id=? FOR UPDATE',[account.id,account.agency_id,value.id]);
 const targets=await depositVerificationTargets(db,account);
 const matching=targets.filter(t=>matchesEraDeposit(value,t.era));
 const linked=old?targets.find(t=>Number(t.transaction_id)===Number(old.id)):null;
 // No general statement retention: unrelated, pending and ambiguous new items are discarded.
 if(!old&&matching.length!==1){
  for(const t of matching)await db.execute("UPDATE bank_deposit_verifications SET status='manual_review' WHERE id=? AND agency_id=?",[t.id,account.agency_id]);
  return false;
 }
 const target=linked||matching[0];
 if(!target)return false;
 if(target.transaction_id&&Number(target.transaction_id)!==Number(old?.id)){
  await db.execute("UPDATE bank_deposit_verifications SET status='manual_review' WHERE id=? AND agency_id=?",[target.id,account.agency_id]);return false;
 }
 if(old&&Number(old.vendor_updated)>value.updated)return false;
 // Retain only the exact matching reference and minimal settlement evidence, never description.
 evidence.eraId=target.era.eraId;evidence.trace=target.era.trace;
 const hash=crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
 let id=old?.id;
 if(!old||old.evidence_hash!==hash){
  const encrypted=encryptFamilyBilling(evidence,transactionContext(account.agency_id,account.id));
  if(id)await db.execute('UPDATE bank_feed_transactions SET vendor_updated=?,evidence_encrypted=?,evidence_hash=?,observed_at=UTC_TIMESTAMP() WHERE id=? AND agency_id=?',[value.updated,encrypted,hash,id,account.agency_id]);
  else{const [r]=await db.execute('INSERT INTO bank_feed_transactions (account_id,agency_id,external_id,vendor_updated,evidence_encrypted,evidence_hash) VALUES (?,?,?,?,?,?)',[account.id,account.agency_id,value.id,value.updated,encrypted,hash]);id=r.insertId;}
  await db.execute('INSERT INTO bank_feed_transaction_versions (transaction_id,agency_id,evidence_encrypted,evidence_hash) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE evidence_hash=VALUES(evidence_hash)',[id,account.agency_id,encrypted,hash]);
 }
 const status=target.status!=='manual_review'&&matching.length===1&&matching[0].id===target.id?'verified':'manual_review';
 await db.execute('UPDATE bank_deposit_verifications SET transaction_id=?,status=? WHERE id=? AND agency_id=?',[id,status,target.id,account.agency_id]);
 return true;
}
export async function syncBankFeed(agencyId,accountId,deps={}){
 requireEnabled();const stripe=deps.stripe||stripeClient(),db=await (deps.db||pool).getConnection();let locked=false;
 try{
  const [[lock]]=await db.execute('SELECT GET_LOCK(?,0) AS acquired',[`bank-feed:${accountId}`]);if(!lock.acquired)return {deferred:true};locked=true;
  const [[row]]=await db.execute('SELECT * FROM bank_feed_accounts WHERE id=? AND agency_id=? AND sync_enabled=1',[accountId,agencyId]);if(!row)throw billingError(404,'Active bank connection not found');
  if(!!row.livemode!==(deps.livemode??currentMode()))throw billingError(409,'Bank connection mode differs from the configured Stripe account');
  await db.execute('UPDATE bank_feed_accounts SET next_sync_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE id=?',[accountId]);
  const account=await stripe.financialConnections.accounts.retrieve(row.external_id);
  if(account.status!=='active'||!account.permissions?.includes('transactions')){await db.execute("UPDATE bank_feed_accounts SET status='inactive',sync_enabled=0,last_error='Transaction sharing is inactive; reconnect with owner consent' WHERE id=?",[accountId]);return {inactive:true};}
  verifyBankAccount(account,row.stripe_customer_id,row.livemode);
  const targets=await depositVerificationTargets(db,row);
  if(!targets.length){await db.execute("UPDATE bank_feed_accounts SET status='awaiting_remittance',last_error=NULL WHERE id=?",[accountId]);return {noTargets:true};}
  const refresh=account.transaction_refresh;
  if(refresh?.status!=='succeeded'){await db.execute('UPDATE bank_feed_accounts SET status=?,last_error=? WHERE id=?',[refresh?.status==='failed'?'refresh_failed':'awaiting_transactions',refresh?.status==='failed'?'The bank refresh failed; check the connection in Stripe':null,accountId]);return {pending:true};}
  if(typeof refresh.id!=='string'||!refresh.id.startsWith('fctxnref_'))throw billingError(502,'Bank refresh identity is missing');
  const target=row.sync_target_refresh||refresh.id;let cursor=row.page_cursor||null;
  if(!row.sync_target_refresh&&row.last_refresh===refresh.id){await db.execute("UPDATE bank_feed_accounts SET status='active',last_error=NULL,last_synced_at=UTC_TIMESTAMP() WHERE id=?",[accountId]);return {unchanged:true};}
  await db.execute("UPDATE bank_feed_accounts SET sync_target_refresh=?,status='syncing' WHERE id=?",[target,accountId]);
  let count=0;
  for(let pageNo=0;pageNo<10;pageNo++){
   const page=await stripe.financialConnections.transactions.list({account:row.external_id,limit:100,...(row.last_refresh?{transaction_refresh:{after:row.last_refresh}}:{}),...(cursor?{starting_after:cursor}:{})});
   if(!Array.isArray(page.data)||page.has_more&&!page.data.length)throw billingError(502,'Bank transaction page is incomplete');
   await db.beginTransaction();
   try{
    const [[current]]=await db.execute('SELECT sync_enabled FROM bank_feed_accounts WHERE id=? AND agency_id=? FOR UPDATE',[accountId,agencyId]);if(!current?.sync_enabled)throw billingError(409,'Bank synchronization was stopped');
    for(const txn of page.data)if(await storeBankTransaction(db,row,txn))count++;
    cursor=page.has_more?page.data.at(-1).id:null;
    if(cursor)await db.execute('UPDATE bank_feed_accounts SET page_cursor=?,last_error=NULL,next_sync_at=UTC_TIMESTAMP() WHERE id=?',[cursor,accountId]);
    else await db.execute("UPDATE bank_feed_accounts SET last_refresh=?,sync_target_refresh=NULL,page_cursor=NULL,status='active',last_error=NULL,last_synced_at=UTC_TIMESTAMP(),next_sync_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE id=?",[target,accountId]);
    await db.commit();
   }catch(e){await db.rollback();throw e;}
   if(!page.has_more)return {imported:count};
  }
  return {imported:count,more:true};
 }catch(e){await db.execute("UPDATE bank_feed_accounts SET last_error='Bank import needs review; existing evidence is preserved',next_sync_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE id=? AND agency_id=?",[accountId,agencyId]);throw e;}
 finally{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[`bank-feed:${accountId}`]);db.release();}
}
export async function bankFeedWebhook(event){
 if(process.env.BANK_FEEDS_ENABLED!=='true'||event.account||!event.type?.startsWith('financial_connections.account.')||!event.data?.object?.id?.startsWith('fca_'))return;
 await pool.execute('UPDATE bank_feed_accounts SET next_sync_at=UTC_TIMESTAMP() WHERE external_id=? AND livemode=? AND sync_enabled=1',[event.data.object.id,event.livemode===true]);
}
export async function runBankFeedSync(){
 if(process.env.BANK_FEEDS_ENABLED!=='true')return [];
 const [rows]=await pool.execute('SELECT id,agency_id FROM bank_feed_accounts WHERE sync_enabled=1 AND next_sync_at<=UTC_TIMESTAMP() ORDER BY next_sync_at,id LIMIT 10');const results=[];
 for(const row of rows)try{results.push(await syncBankFeed(row.agency_id,row.id));}catch{results.push({needsReview:true});}
 return results;
}
