import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({db:{beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn()},insurance:vi.fn(),payer:vi.fn(),cards:vi.fn(),charge:vi.fn(),classify:vi.fn(),live:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>m.db}}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:m.insurance}));
vi.mock('../../models/GuardianPaymentCard.model.js',()=>({default:{findActiveByGuardian:m.cards}}));
vi.mock('../stripePayments.service.js',()=>({default:{chargePaymentMethod:m.charge},getStripePublishableKey:()=>''}));
vi.mock('../familyBillingEncryption.service.js',()=>({encryptFamilyBilling:v=>v,decryptFamilyBilling:v=>v}));
vi.mock('../familyBillingPolicy.service.js',()=>({billingError:(status,message)=>Object.assign(new Error(message),{status}),requireResponsiblePayer:m.payer,auditBilling:vi.fn()}));
vi.mock('../guardianTestAccess.service.js',()=>({requireLiveGuardianBilling:m.live}));
vi.mock('../learningChargeClassification.service.js',()=>({resolveLearningChargeDomain:m.classify}));
import { payFamilyCharge } from '../familyBillingPayment.service.js';
let consent,charge,merchant,previous;
beforeEach(()=>{
 vi.clearAllMocks();consent=true;merchant='acct_test';previous=[];
 charge={id:100,agency_id:6,client_id:40,learning_class_session_id:90,total_cents:4500,currency:'USD',charge_type:'SESSION_FEE',charge_status:'PENDING'};
 m.insurance.mockResolvedValue({});m.payer.mockResolvedValue({payment_card_id:4,consent_id:5,recurring_limit_cents:5000});
 m.cards.mockResolvedValue([{id:4,stripe_payment_method_id:'pm_test',connected_account_id:'acct_test',stripe_customer_id:'cus_test'}]);
 m.classify.mockResolvedValue('tutoring');m.live.mockResolvedValue(undefined);
 m.db.execute.mockImplementation(async sql=>{
  if(sql.startsWith('SELECT * FROM learning_session_charges'))return [[charge]];
  if(sql.includes('FROM family_receivables'))return [[]];
  if(sql.includes('FROM agency_billing_accounts'))return [[{stripe_connect_account_id:merchant}]];
  if(sql.includes('FROM guardian_billing_consents'))return [consent?[{id:5}]:[]];
  if(sql.startsWith('SELECT * FROM learning_payments'))return [previous];
  return [{affectedRows:1}];
 });
 m.charge.mockResolvedValue({id:'pi_test',status:'succeeded',amount:4500,amount_received:4500,currency:'usd',customer:'cus_test'});
});
const pay=()=>payFamilyCharge({agencyId:6,userId:50,chargeId:100,automatic:true});
it('passes a verified tutoring charge through existing customer/card/consent guards to a mocked gateway',async()=>{
 expect(await pay()).toEqual({paid:true});expect(m.classify).toHaveBeenCalledWith(charge,6,m.db);
 expect(m.charge).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({amountCents:4500,customerId:'cus_test',connectedAccountId:'acct_test',idempotencyKey:'family_charge:6:100'}));
 expect(m.db.execute.mock.calls.find(([q])=>q.includes('FROM guardian_billing_consents'))[1]).toEqual([5,6,50,40,4]);
});
it('still blocks Medicaid coverage before classification or any new payment attempt',async()=>{
 m.insurance.mockResolvedValue({secondary:{insurerName:'Health First Colorado',isMedicaid:true}});
 await expect(pay()).rejects.toThrow(/Medicaid/);expect(m.classify).not.toHaveBeenCalled();expect(m.charge).not.toHaveBeenCalled();
});
it.each(['consent','limit','merchant','insurance','classification','payer'])('keeps the existing %s guard and never calls the gateway when it fails',async reason=>{
 if(reason==='consent')consent=false;
 if(reason==='limit')m.payer.mockResolvedValue({payment_card_id:4,consent_id:5,recurring_limit_cents:100});
 if(reason==='merchant')merchant='acct_other';
 if(reason==='insurance')m.insurance.mockResolvedValue({primary:{memberId:'test'}});
 if(reason==='classification')m.classify.mockRejectedValue(Object.assign(new Error('Review source'),{status:409}));
 if(reason==='payer')m.payer.mockRejectedValue(Object.assign(new Error('Not authorized'),{status:403}));
 await expect(pay()).rejects.toThrow();expect(m.charge).not.toHaveBeenCalled();
 expect(m.db.execute.mock.calls.some(([q])=>q.startsWith('INSERT INTO learning_payments'))).toBe(false);
});
it.each([{paymentMethodId:'pm_old'},{customerId:'cus_old'},{accountId:'acct_old'}])('stops an unresolved automatic retry when its stored card authorization changed: %j',async change=>{
 previous=[{id:1,created_by_user_id:50,created_at:new Date(),idempotency_key:'family_charge:6:100',metadata_json:{customerId:'cus_test',paymentMethodId:'pm_test',accountId:'acct_test',amountCents:4500,currency:'usd',...change}}];
 await expect(pay()).rejects.toThrow(/authorized card changed/);expect(m.charge).not.toHaveBeenCalled();
 expect(m.db.execute.mock.calls.some(([q])=>q.startsWith('INSERT INTO learning_payments'))).toBe(false);
});
it('retains the original idempotency key when the same authorized card retries an unresolved payment',async()=>{
 previous=[{id:1,created_by_user_id:50,created_at:new Date(),idempotency_key:'family_charge:6:100',metadata_json:{customerId:'cus_test',paymentMethodId:'pm_test',accountId:'acct_test',amountCents:4500,currency:'usd'}}];
 expect(await pay()).toEqual({paid:true});
 expect(m.charge).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({paymentMethodId:'pm_test',idempotencyKey:'family_charge:6:100'}));
 expect(m.db.execute.mock.calls.some(([q])=>q.startsWith('INSERT INTO learning_payments'))).toBe(false);
});
