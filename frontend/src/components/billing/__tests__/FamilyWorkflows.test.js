import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import PaymentTask from '../PaymentTask.vue';
import Ledger from '../FamilyLedgerPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('@stripe/stripe-js',()=>({loadStripe:vi.fn()}));
const button=(w,t)=>w.findAll('button').find(b=>b.text().includes(t));
const task=()=>({id:1,agencyId:1,agency:{name:'Synthetic agency',slug:'fixture'},title:'Verify payment and authorization',status:'pending',clientIds:[101],requireCard:true,expiresAt:'2027-01-01',waiver:{terms:'Standard billing terms',additionalTerms:'Agency migration terms',version:'fixture-v1'}});
const overview={clients:[{clientId:101,clientName:'Client One'}],cards:[{id:11,card_brand:'Visa',card_last4:'4242'}]};
describe('migration payment tasks',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('requires signed terms and an owned card before completing the bound task',async()=>{
  api.get.mockImplementation(async url=>({data:url.includes('overview')?overview:task()}));api.post.mockResolvedValue({data:{completed:true}});
  const w=mount(PaymentTask,{props:{token:'a'.repeat(64)},global:{stubs:{RouterLink:true,SecureCardSetup:true}}});await flushPromises();expect(w.text()).toContain('Agency migration terms');expect(button(w,'Accept and continue').attributes('disabled')).toBeDefined();
  await w.find('input[type=checkbox]').setValue(true);await w.find('input[autocomplete=name]').setValue('Parent One');await button(w,'Accept and continue').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith(`/family-billing/task-link/${'a'.repeat(64)}/authorize`,expect.objectContaining({consent:{accepted:true,waiverAccepted:true,version:'fixture-v1',signatureName:'Parent One'}}));
  expect(button(w,'Sign and complete').attributes('disabled')).toBeDefined();await w.find('select').setValue(11);await button(w,'Sign and complete').trigger('click');await flushPromises();expect(api.post).toHaveBeenLastCalledWith(`/family-billing/task-link/${'a'.repeat(64)}/complete`,expect.objectContaining({cardId:11}));expect(w.text()).toContain('Payment setup complete');w.unmount();
 });
 it('never renders a card form for authorization-only tasks',async()=>{api.get.mockImplementation(async url=>({data:url.includes('overview')?overview:{...task(),requireCard:false}}));api.post.mockResolvedValue({data:{authorized:true}});const w=mount(PaymentTask,{props:{taskId:1,agencyId:1},global:{stubs:{RouterLink:true,SecureCardSetup:true}}});await flushPromises();await w.find('input[type=checkbox]').setValue(true);await w.find('input[autocomplete=name]').setValue('Parent One');await button(w,'Accept and continue').trigger('click');await flushPromises();expect(w.find('select').exists()).toBe(false);expect(w.find('secure-card-setup-stub').exists()).toBe(false);expect(button(w,'Sign and complete').attributes('disabled')).toBeUndefined();w.unmount();});
 it('shows an ownership error without loading another family’s saved cards',async()=>{api.get.mockRejectedValue({response:{data:{error:{message:'Payment task not found for this account'}}}});const w=mount(PaymentTask,{props:{token:'b'.repeat(64)}});await flushPromises();expect(w.text()).toContain('not found for this account');expect(api.get).toHaveBeenCalledTimes(1);expect(w.find('input').exists()).toBe(false);w.unmount();});
});
describe('assigned payer balances',()=>{
 beforeEach(()=>vi.clearAllMocks());
 const mock=(rows)=>api.get.mockImplementation(async url=>({data:url.endsWith('/balances')?{balances:rows,planTermsVersion:'p1'}:url.endsWith('/tasks')?{tasks:[]}:url.endsWith('/receipts')?{receipts:[]}:url.endsWith('/splits')?{requests:[]}:{payers:{}}}));
 it('offers no payment control for a shared statement owned by another payer',async()=>{mock([{receivableId:1,allocationId:1,payerUserId:20,payerName:'Other payer',balanceCents:5000,serviceDomain:'Services',status:'open',canPay:false}]);const w=mount(Ledger,{props:{agencyId:1,clientId:101}});await flushPromises();expect(w.text()).toContain('Other payer');expect(button(w,'Make a payment')).toBeUndefined();expect(api.post).not.toHaveBeenCalled();w.unmount();});
 it('keeps an uncertain payment reference stable across retries and does not show a false receipt',async()=>{mock([{receivableId:1,allocationId:1,payerUserId:10,payerName:'Parent One',balanceCents:5000,serviceDomain:'Services',status:'open',canPay:true}]);api.post.mockRejectedValue({response:{data:{error:{message:'Payment confirmation is pending'}}}});const w=mount(Ledger,{props:{agencyId:1,clientId:101}});await flushPromises();await button(w,'Make a payment').trigger('click');await w.find('form').trigger('submit');await flushPromises();await w.find('form').trigger('submit');await flushPromises();expect(api.post.mock.calls[0][1].idempotencyKey).toBe(api.post.mock.calls[1][1].idempotencyKey);expect(w.text()).toContain('confirmation is pending');expect(w.text()).not.toContain('Payment confirmed.');w.unmount();});
 it('clears private balances immediately on tenant change',async()=>{mock([{allocationId:1,payerName:'Sensitive payer',balanceCents:5000,canPay:false}]);const w=mount(Ledger,{props:{agencyId:1}});await flushPromises();expect(w.text()).toContain('Sensitive payer');api.get.mockImplementation(()=>new Promise(()=>{}));await w.setProps({agencyId:2});expect(w.text()).not.toContain('Sensitive payer');w.unmount();});
});
