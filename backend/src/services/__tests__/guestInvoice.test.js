import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../stripePayments.service.js',()=>({default:{},getStripePublishableKey:()=> 'pk_synthetic'}));
vi.mock('../familyBillingEncryption.service.js',()=>({encryptFamilyBilling:(value,context)=>JSON.stringify({value,context}),decryptFamilyBilling:(value,context)=>{const saved=JSON.parse(value);if(saved.context!==context)throw Error('Wrong encryption context');return saved.value;}}));
vi.mock('../familyLedger/collections.js',()=>({portalUrl:path=>`https://portal.example.test${path}`}));
vi.mock('../clientPortalEmail.service.js',()=>({sendClientPortalEmail:vi.fn()}));
vi.mock('../familyLedger/payments.js',()=>({lockAllocation:vi.fn(),finalizePayment:vi.fn()}));
vi.mock('../familyLedger/paymentDispatch.js',()=>({claimProcessorDispatch:vi.fn()}));
vi.mock('../guardianTestAccess.service.js',()=>({requireLiveGuardianBilling:vi.fn()}));
import {createGuestInvoiceService,guestInvoiceEmail} from '../guestInvoice.service.js';

const token='A'.repeat(43);
function fixture(){
 const allocation={id:4,payer_user_id:7,amount_cents:7500,paid_cents:0};
 const receivable={id:5,agency_id:2,client_id:10,currency:'USD',status:'open'};
 const share={id:8,agency_id:2,allocation_id:4,issued_by_user_id:7,payer_user_id:7,allocation_payer_user_id:7,issuer_kind:'payer',amount_cents:7500,allocation_amount_cents:7500,paid_cents:0,currency:'USD',receivable_currency:'USD',agency_name:'Example practice',client_id:10,locale:'es',expires_at:'2026-11-23T17:00:00Z',revoked_at:null,payment_id:null,delivery_status:'draft'};
 const state={payment:null,pending:[],shareExists:true};
 const execute=vi.fn(async(sql,args=[])=>{
  if(sql.startsWith('SELECT g.*'))return [state.shareExists?[share]:[]];
  if(sql.startsWith('INSERT INTO family_guest_invoices'))return [{insertId:share.id}];
  if(sql.startsWith('SELECT receivable_id FROM family_receivable_allocations'))return [[{receivable_id:5}]];
  if(sql.startsWith('SELECT stripe_connect_account_id'))return [[{stripe_connect_account_id:'acct_synthetic'}]];
  if(sql.startsWith('SELECT id,role FROM users'))return [[{id:4,role:'support'}]];
  if(sql.startsWith('SELECT name FROM agencies'))return [[{name:'Example practice'}]];
  if(sql.startsWith('SELECT id FROM family_ledger_payments WHERE allocation_id'))return [state.pending];
  if(sql.startsWith('SELECT * FROM family_ledger_payments')||sql.startsWith('SELECT status FROM family_ledger_payments'))return [state.payment?[state.payment]:[]];
  if(sql.startsWith('INSERT INTO family_ledger_payments')){
   state.payment={id:12,agency_id:args[0],allocation_id:args[1],payer_user_id:args[2],amount_cents:args[3],currency:args[4],idempotency_key:args[5],snapshot_encrypted:args[6],created_by_user_id:null,status:'pending'};
   return [{insertId:12}];
  }
  if(sql.startsWith('UPDATE family_guest_invoices SET payment_id')){share.payment_id=args[0];return[{affectedRows:1}];}
  if(sql.startsWith('UPDATE family_ledger_payments SET processor_intent_id')){state.payment.processor_intent_id=args[0];return[{affectedRows:1}];}
  if(sql.startsWith("UPDATE family_ledger_payments SET status='unknown'")){state.payment.status='unknown';return[{affectedRows:1}];}
  if(sql.startsWith("UPDATE family_ledger_payments SET status='cancelled'")){state.payment.status='cancelled';return[{affectedRows:1}];}
  if(sql.startsWith("UPDATE family_guest_invoices SET delivery_status='sending'")){if(share.delivery_status!=='draft')return[{affectedRows:0}];share.delivery_status='sending';return[{affectedRows:1}];}
  if(sql.startsWith('UPDATE family_guest_invoices SET delivery_status=?')){share.delivery_status=args[0];return[{affectedRows:1}];}
  if(sql.startsWith("UPDATE family_guest_invoices SET delivery_status='unknown'")){share.delivery_status='unknown';return[{affectedRows:1}];}
  if(sql.startsWith('UPDATE family_guest_invoices SET revoked_at')){share.revoked_at='2026-11-16T17:00:00Z';return[{affectedRows:1}];}
  throw new Error(`Unexpected fixture query: ${sql}`);
 });
 const stripe={createPaymentIntent:vi.fn(async options=>({id:'pi_synthetic',amount:options.amountCents,currency:options.currency,metadata:options.metadata,status:'requires_payment_method',client_secret:'synthetic-secret'})),retrievePaymentIntent:vi.fn(),cancelPaymentIntent:vi.fn(async()=>({status:'canceled'}))};
 const deps={database:{execute},transaction:async work=>work({execute}),now:()=>new Date('2026-11-16T17:00:00Z'),randomToken:()=>token,
  responsible:vi.fn(async()=>({})),staffAccess:vi.fn(async actor=>{if(!['admin','support','staff'].includes(actor.role))throw Object.assign(new Error('Staff access required'),{status:403});}),party:vi.fn(async()=>({kind:'other',revision:3,contact:{fullName:'External Responsible',email:'responsible@example.test'}})),live:vi.fn(),collectible:vi.fn(),lock:vi.fn(async()=>({receivable,allocation})),findReceivable:vi.fn(async()=>receivable),audit:vi.fn(),stripe,
  dispatch:vi.fn(async({attempt})=>({intentId:attempt.processor_intent_id||null})),finalize:vi.fn(async()=>{state.payment.status='succeeded';}),send:vi.fn(async()=>({id:'synthetic-message',communicationId:19})),publishableKey:()=> 'pk_synthetic',url:path=>`https://portal.example.test${path}`};
 return {service:createGuestInvoiceService(deps),deps,allocation,receivable,share,state,execute,stripe};
}

describe('guest invoice capability and payment boundaries',()=>{
 it('creates only a hashed, seven-day capability for the payer’s own allocation',async()=>{
  const f=fixture(),result=await f.service.create({agencyId:2,userId:7,allocationId:4});
  const saved=f.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO family_guest_invoices'))[1];
  expect(saved[6]).toMatch(/^[a-f0-9]{64}$/);expect(saved).not.toContain(token);expect(result.url).toBe(`https://portal.example.test/billing/guest#${token}`);expect(result.expiresAt).toBe('2026-11-23T17:00:00.000Z');
  expect(f.deps.audit).toHaveBeenCalledWith(expect.objectContaining({userId:7,action:'guest_invoice_created'}),expect.anything());
  await expect(f.service.create({agencyId:2,userId:9,allocationId:4})).rejects.toMatchObject({status:403});
 });
 it('returns only agency branding, current capped amount, currency, language and payment status',async()=>{
  const f=fixture();f.share.paid_cents=2500;
  expect(await f.service.context(token)).toEqual({agencyName:'Example practice',amountCents:5000,currency:'USD',locale:'es',paid:false});
  expect(f.deps.responsible).toHaveBeenCalledWith(7,10,2,expect.anything());
 });
 it.each(['expired','revoked','reassigned','revoked issuer'])('rejects %s access before starting a charge',async kind=>{
  const f=fixture();if(kind==='expired')f.share.expires_at='2026-11-15T17:00:00Z';if(kind==='revoked')f.share.revoked_at='2026-11-16';if(kind==='reassigned')f.share.allocation_payer_user_id=9;if(kind==='revoked issuer')f.deps.responsible.mockRejectedValue(Object.assign(new Error('Access revoked'),{status:403}));
  await expect(f.service.intent(token,{expectedAmountCents:7500,consentAccepted:true})).rejects.toThrow();expect(f.stripe.createPaymentIntent).not.toHaveBeenCalled();
 });
 it('prepares the ordinary Stripe ledger attempt with an anonymous guest audit actor and fixed scoped amount',async()=>{
  const f=fixture();expect(await f.service.intent(token,{expectedAmountCents:7500,consentAccepted:true,ip:'synthetic-ip'})).toMatchObject({clientSecret:'synthetic-secret',paid:false});
  expect(f.state.payment.created_by_user_id).toBeNull();expect(f.state.payment.payer_user_id).toBe(7);
  expect(f.stripe.createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({amountCents:7500,connectedAccountId:'acct_synthetic',metadata:{agency_id:'2',family_ledger_payment_id:'12',family_guest_invoice_id:'8'}}));
  expect(f.deps.audit).toHaveBeenCalledWith(expect.objectContaining({userId:null,action:'guest_payment_prepared',objectId:8}),expect.anything());
  expect(f.stripe.createPaymentIntent.mock.calls[0][0]).not.toHaveProperty('paymentMethodId');
 });
 it('reuses the saved processor reference and refuses stale pending amounts or newly uncollectible balances',async()=>{
  const f=fixture();await f.service.intent(token,{expectedAmountCents:7500,consentAccepted:true});
  f.stripe.retrievePaymentIntent.mockResolvedValue({id:'pi_synthetic',amount:7500,currency:'usd',metadata:{family_ledger_payment_id:'12',family_guest_invoice_id:'8'},status:'requires_payment_method',client_secret:'synthetic-secret'});
  await f.service.intent(token,{expectedAmountCents:7500,consentAccepted:true});expect(f.stripe.createPaymentIntent).toHaveBeenCalledOnce();
  f.share.paid_cents=2500;await expect(f.service.intent(token,{expectedAmountCents:7500,consentAccepted:true})).rejects.toMatchObject({status:409});
  f.share.paid_cents=0;f.deps.collectible.mockRejectedValue(Object.assign(new Error('Coverage changed'),{status:409}));
  await expect(f.service.intent(token,{expectedAmountCents:7500,consentAccepted:true})).rejects.toThrow('Coverage changed');expect(f.stripe.retrievePaymentIntent).toHaveBeenCalledOnce();
 });
 it('blocks concurrent, changed and unconsented charges before processor dispatch',async()=>{
  const f=fixture();await expect(f.service.intent(token,{expectedAmountCents:7500})).rejects.toMatchObject({status:400});
  await expect(f.service.intent(token,{expectedAmountCents:9999,consentAccepted:true})).rejects.toMatchObject({status:409});
  f.state.pending=[{id:99}];await expect(f.service.intent(token,{expectedAmountCents:7500,consentAccepted:true})).rejects.toMatchObject({status:409});expect(f.deps.dispatch).not.toHaveBeenCalled();
 });
 it('uses only the saved Stripe reference for confirmation and delegates to existing reconciliation',async()=>{
  const f=fixture();await f.service.intent(token,{expectedAmountCents:7500,consentAccepted:true});
  f.stripe.retrievePaymentIntent.mockResolvedValue({id:'pi_synthetic',status:'succeeded'});expect(await f.service.confirm(token)).toEqual({paid:true});
  expect(f.stripe.retrievePaymentIntent).toHaveBeenCalledWith('pi_synthetic','acct_synthetic');expect(f.deps.finalize).toHaveBeenCalledWith(12,2,expect.objectContaining({id:'pi_synthetic'}),'acct_synthetic');
 });
 it('emails only after an explicit issuer action and never includes client or service details',async()=>{
  const f=fixture();await expect(f.service.send({token,userId:7,agencyId:2,allocationId:4,recipientEmail:'guest@example.test'})).rejects.toMatchObject({status:400});expect(f.deps.send).not.toHaveBeenCalled();
  await f.service.send({token,userId:7,agencyId:2,allocationId:4,recipientEmail:'guest@example.test',confirmed:true});
  expect(f.deps.send).toHaveBeenCalledWith(expect.objectContaining({to:'guest@example.test',clientId:null,userId:null,generatedByUserId:7}));
  await expect(f.service.send({token,userId:7,agencyId:2,allocationId:4,recipientEmail:'second@example.test',confirmed:true})).rejects.toMatchObject({status:409});expect(f.deps.send).toHaveBeenCalledOnce();
  expect(f.deps.send.mock.calls[0][0].text).toContain('No necesita una cuenta');expect(f.deps.send.mock.calls[0][0].text).not.toContain('client_id');
 });
 it('keeps uncertain processor dispatches and email delivery unavailable for blind retries',async()=>{
  const f=fixture();f.stripe.createPaymentIntent.mockRejectedValue(new Error('synthetic transport failure'));
  await expect(f.service.intent(token,{expectedAmountCents:7500,consentAccepted:true})).rejects.toMatchObject({status:409});expect(f.state.payment.status).toBe('unknown');
  f.deps.send.mockRejectedValue(new Error('synthetic mail timeout'));await expect(f.service.send({token,userId:7,agencyId:2,allocationId:4,recipientEmail:'guest@example.test',confirmed:true})).rejects.toMatchObject({status:409});expect(f.share.delivery_status).toBe('unknown');
 });
 it('cancels a prepared processor intent before revoking its payment capability',async()=>{
  const f=fixture();await f.service.intent(token,{expectedAmountCents:7500,consentAccepted:true});f.stripe.retrievePaymentIntent.mockResolvedValue({id:'pi_synthetic',status:'requires_payment_method'});
  expect(await f.service.revoke({token,userId:7,agencyId:2,allocationId:4})).toEqual({revoked:true});expect(f.stripe.cancelPaymentIntent).toHaveBeenCalledWith('pi_synthetic','acct_synthetic');expect(f.state.payment.status).toBe('cancelled');await expect(f.service.context(token)).rejects.toMatchObject({status:410});
 });
 it('previews staff invoices to the saved external responsible contact and preserves actual staff issuer attribution',async()=>{
  const f=fixture();const preview=await f.service.externalPreview({agencyId:2,userId:4,actorRole:'support',allocationId:4,locale:'es'});
  expect(preview).toMatchObject({recipientEmail:'responsible@example.test',recipientName:'External Responsible',amountCents:7500});expect(f.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);expect(f.deps.send).not.toHaveBeenCalled();
  const created=await f.service.create({agencyId:2,userId:4,actorRole:'support',allocationId:4,externalResponsible:true});
  expect(created.recipientEmail).toBe('responsible@example.test');const saved=f.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO family_guest_invoices'))[1];
  expect(saved.slice(2,6)).toEqual([4,7,'staff',3]);expect(f.deps.audit).toHaveBeenCalledWith(expect.objectContaining({userId:4,action:'guest_invoice_created'}),expect.anything());
  f.share.issued_by_user_id=4;f.share.issuer_kind='staff';f.share.responsible_party_revision=3;
  await f.service.context(token);expect(f.deps.staffAccess).toHaveBeenCalledWith({id:4,role:'support'},2,10,expect.anything());
  f.deps.party.mockResolvedValue({kind:'other',revision:4,contact:{email:'changed@example.test'}});await expect(f.service.context(token)).rejects.toMatchObject({status:409});
 });
});
