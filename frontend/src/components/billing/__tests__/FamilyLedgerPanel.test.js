import {beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import FamilyLedgerPanel from '../FamilyLedgerPanel.vue';
import ClientBillingReadiness from '../ClientBillingReadiness.vue';
import api from '../../../services/api';
import {loadStripe} from '@stripe/stripe-js';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('@stripe/stripe-js',()=>({loadStripe:vi.fn()}));
const button=(w,text)=>w.findAll('button').find(b=>b.text().includes(text));
let balances;
beforeEach(()=>{
  vi.clearAllMocks();balances=[];
  api.get.mockImplementation(async path=>({data:path.endsWith('/balances')?{balances,planTermsVersion:'v1'}:path.endsWith('/tasks')?{tasks:[]}:path.endsWith('/receipts')?{receipts:[]}:path.endsWith('/splits')?{requests:[]}:path.endsWith('/readiness')?{profiles:[]}:{payers:{}}}));
});
describe('client billing portal',()=>{
  it('labels a final zero as closed without offering a payment',async()=>{
    balances=[{receivableId:9,allocationId:90,status:'paid',billingState:'closed',balanceCents:0,dueCents:0,canPay:false,explanation:'Your final patient responsibility is $0. This balance is closed; nothing is due.'}];
    const w=mount(FamilyLedgerPanel,{props:{agencyId:1},global:{stubs:{RouterLink:true}}});await flushPromises();expect(w.text()).toContain('Closed — no patient responsibility');expect(button(w,'Make a payment')).toBeUndefined();w.unmount();
  });
  it('held full fees and already paid copays never appear in verified amount due',async()=>{
    balances=[{receivableId:1,allocationId:1,status:'review',billingState:'review',balanceCents:20000,dueCents:0,holdReason:'insurance_review',canPay:false,explanation:'Under review. Nothing is due.'},{receivableId:2,allocationId:2,status:'paid',billingState:'paid',balanceCents:0,dueCents:0,paidCents:2500,canPay:false,explanation:'Payment recorded. Nothing remains due for this share.'}];
    const w=mount(FamilyLedgerPanel,{props:{agencyId:1},global:{stubs:{RouterLink:true}}});await flushPromises();
    expect(w.find('.ledger-summary').text()).toContain('$0.00');expect(w.text()).not.toContain('$200.00');expect(w.text()).toContain('Under review — nothing due');expect(button(w,'Make a payment')).toBeUndefined();w.unmount();
  });
  it('presents a service date and responsibility explanation and reuses the same request after bank authentication',async()=>{
    balances=[{receivableId:3,allocationId:30,clientId:10,status:'open',billingState:'due',balanceCents:2500,dueCents:2500,canPay:true,description:'Visit · Copay',serviceDate:'2026-09-20',explanation:'Verified visit copay.'}];
    const confirmCardPayment=vi.fn().mockResolvedValue({paymentIntent:{status:'succeeded'}});loadStripe.mockResolvedValue({confirmCardPayment});
    api.post.mockResolvedValueOnce({data:{requiresAction:true,clientSecret:'synthetic-secret',paymentMethodId:'pm_synthetic',connectedAccountId:'acct_synthetic',publishableKey:'pk_test_synthetic'}}).mockImplementationOnce(async()=>{balances=[{...balances[0],status:'paid',billingState:'paid',balanceCents:0,dueCents:0,canPay:false}];return {data:{paid:true}};});
    const w=mount(FamilyLedgerPanel,{props:{agencyId:1},global:{stubs:{RouterLink:true}}});await flushPromises();expect(w.text()).toContain('Visit · Copay');expect(w.text()).toContain('Service date');
    await button(w,'Make a payment').trigger('click');await w.find('form').trigger('submit');await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(2);expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);expect(confirmCardPayment).toHaveBeenCalledOnce();expect(w.find('.ledger-summary').text()).toContain('$0.00');expect(w.text()).toContain('Payment confirmed');w.unmount();
  });
  it('clears financial details when changing the selected organization',async()=>{
    balances=[{receivableId:3,allocationId:30,status:'open',billingState:'due',balanceCents:2500,dueCents:2500,canPay:true}];
    const w=mount(FamilyLedgerPanel,{props:{agencyId:1},global:{stubs:{RouterLink:true}}});await flushPromises();expect(w.text()).toContain('$25.00');balances=[];await w.setProps({agencyId:2});await flushPromises();expect(w.text()).not.toContain('$25.00');w.unmount();
  });
  it('billing setup starts incomplete and saving readiness never invokes a charge endpoint',async()=>{
    api.post.mockResolvedValue({data:{setupStatus:'ready'}});
    const w=mount(ClientBillingReadiness,{props:{agencyId:1,clients:[{id:10,name:'Synthetic client'}]}});await flushPromises();await w.find('select').setValue('10');
    expect(w.findAll('select').map(s=>s.element.value)).toEqual(['10','unknown','incomplete','manual']);
    await w.findAll('select')[1].setValue('insured');await w.findAll('select')[2].setValue('ready');await w.findAll('select')[3].setValue('verified_copay');await w.find('textarea').setValue('Verified coverage and agreed payment schedule');await w.find('form').trigger('submit');await flushPromises();
    expect(api.post).toHaveBeenCalledOnce();expect(api.post).toHaveBeenCalledWith('/family-billing/staff/clients/10/readiness',expect.objectContaining({agencyId:1,coverageMode:'insured',setupStatus:'ready',collectionPolicy:'verified_copay'}));expect(w.text()).toContain('No card was charged');w.unmount();
  });
});

it('shows only this guardian’s share as due while retaining authorized shared statements',async()=>{
 balances=[{receivableId:3,allocationId:30,payerName:'First Synthetic',isOwnShare:true,shareBasisPoints:6000,shareBasis:'total',billingState:'due',dueCents:6001,canPay:true,balanceCents:6001},{receivableId:3,allocationId:31,payerName:'Second Synthetic',isOwnShare:false,shareBasisPoints:4000,shareBasis:'total',billingState:'due',dueCents:4000,canPay:false,balanceCents:4000}];
 const w=mount(FamilyLedgerPanel,{props:{agencyId:1},global:{stubs:{RouterLink:true}}});await flushPromises();expect(w.find('.ledger-summary').text()).toContain('$60.01');expect(w.find('.ledger-summary').text()).not.toContain('$100.01');expect(w.text()).toContain('Your share: 60%');expect(w.text()).toContain('Shared statement · assigned to another payer: 40%');expect(w.findAll('button').filter(b=>b.text()==='Make a payment')).toHaveLength(1);w.unmount();
});
it('clears previous financial rows when a refresh fails',async()=>{
 balances=[{receivableId:3,allocationId:30,isOwnShare:true,billingState:'due',dueCents:4500,balanceCents:4500}];const w=mount(FamilyLedgerPanel,{props:{agencyId:1},global:{stubs:{RouterLink:true}}});await flushPromises();expect(w.text()).toContain('$45.00');api.get.mockRejectedValue(new Error('revoked'));await button(w,'Refresh').trigger('click');await flushPromises();expect(w.text()).not.toContain('$45.00');expect(w.find('[role="alert"]').exists()).toBe(true);w.unmount();
});

it('shows a synthetic fee amount without offering payment or counting it as debt',async()=>{
 balances=[{receivableId:13,allocationId:13,isOwnShare:true,billingState:'review',status:'review',demoAmountCents:8000,dueCents:0,balanceCents:0,canPay:false,description:'Late cancellation',explanation:'Test balance only. Nothing is due and payments are disabled.'}];
 const w=mount(FamilyLedgerPanel,{props:{agencyId:450},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.text()).toContain('$80.00 · Test balance');expect(w.text()).toContain('Late cancellation');expect(w.find('.ledger-summary').text()).toContain('$0.00');expect(button(w,'Make a payment')).toBeUndefined();w.unmount();
});

it('shows the price before coverage review separately from zero due and pending responsibility',async()=>{
 balances=[{receivableId:18,allocationId:18,isOwnShare:true,billingState:'review',status:'review',referencePrice:{amountCents:12000,label:'Service price before coverage review'},dueCents:0,balanceCents:0,canPay:false,explanation:'No payment is due yet.'}];
 const w=mount(FamilyLedgerPanel,{props:{agencyId:1},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.find('.coverage-review').text()).toContain('Service price before coverage review$120.00');expect(w.find('.coverage-review').text()).toContain('Your share after reviewPending');expect(w.find('.coverage-review').text()).toContain('Amount due now$0.00');expect(w.find('.ledger-summary').text()).toContain('$0.00');expect(button(w,'Make a payment')).toBeUndefined();w.unmount();
});
it('offers payment for confirmed self-pay instead of showing pending coverage',async()=>{
 balances=[{receivableId:19,allocationId:19,isOwnShare:true,billingState:'due',status:'open',dueCents:12000,balanceCents:12000,canPay:true,description:'Visit · Self-pay'}];
 const w=mount(FamilyLedgerPanel,{props:{agencyId:1},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.find('.ledger-summary').text()).toContain('$120.00');expect(w.find('.coverage-review').exists()).toBe(false);expect(button(w,'Make a payment')).toBeDefined();expect(w.text()).toContain('Visit · Self-pay');w.unmount();
});

it('allows the demo payer to arrange a split and accept a manual plan while payment stays disabled',async()=>{
 balances=[{receivableId:13,allocationId:13,clientId:2271,isOwnShare:true,billingState:'review',status:'review',demoAmountCents:8000,dueCents:0,balanceCents:0,canPay:false,canArrangePayments:true,autoPayAvailable:false}];
 const w=mount(FamilyLedgerPanel,{props:{agencyId:450},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.text()).toContain('Request to share this balance');expect(button(w,'Make a payment')).toBeUndefined();
 balances=[{...balances[0],plan:{id:4,status:'proposed',autoPay:false,installments:[{id:1,dueDate:'2099-11-01',balanceCents:4000},{id:2,dueDate:'2099-12-01',balanceCents:4000}]}}];
 await button(w,'Refresh').trigger('click');await flushPromises();
 expect(w.text()).toContain('Payment plan');expect(w.text()).not.toContain('Automatically pay installments');
 await w.find('details input').setValue('Synthetic Parent');api.post.mockResolvedValue({data:{success:true}});await button(w,'Accept payment plan').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/family-billing/plans/4/accept',expect.objectContaining({agencyId:450,autoPay:false,consent:expect.objectContaining({signatureName:'Synthetic Parent'})}));expect(button(w,'Make a payment')).toBeUndefined();w.unmount();
});
it('lets the owning payer cancel an automatic plan even when its balance is held',async()=>{
 balances=[{receivableId:13,allocationId:13,isOwnShare:true,billingState:'review',canPay:false,canArrangePayments:false,dueCents:0,plan:{id:4,status:'active',autoPay:true,installments:[]}}];api.post.mockResolvedValue({data:{success:true}});
 const w=mount(FamilyLedgerPanel,{props:{agencyId:1},global:{stubs:{RouterLink:true}}});await flushPromises();await button(w,'Cancel plan').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/family-billing/plans/4/cancel',{agencyId:1});w.unmount();
});
