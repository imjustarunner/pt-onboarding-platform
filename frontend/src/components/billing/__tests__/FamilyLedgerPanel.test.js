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
