import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Setup from '../ServiceBillingSetup.vue';
import PaymentTask from '../PaymentTask.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
const rates=[{serviceCode:'90834',amountCents:7500,priceBasis:'unit',revision:1},{serviceCode:'90837',amountCents:11000,priceBasis:'visit',revision:1}];
const props={agencyId:1,clients:[{id:102,name:'Synthetic client'}],links:[{clientId:102,guardianUserId:10,first_name:'Synthetic',last_name:'Payer'}]};
const label=(w,text)=>w.findAll('label').find(l=>l.text().startsWith(text));
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{rates}});api.post.mockResolvedValue({data:{taskId:1}});});
describe('service setup',()=>{
 it('quotes per-unit prices, binds terms to the payer, and never charges during invitation',async()=>{
  const w=mount(Setup,{props});await flushPromises();const form=w.findAll('form')[1];
  await label(form,'Client').find('select').setValue('102');await label(form,'Responsible').find('select').setValue('10');
  await label(form,'Service code').find('input').setValue('90834');await label(form,'Units').find('input').setValue(2);
  expect(w.text()).toContain('$150.00 total');
  await label(form,'Effective from').find('input').setValue('2026-01-01');await label(form,'Effective through').find('input').setValue('2026-12-31');
  await label(form,'Verification evidence').find('textarea').setValue('Agreed rate');await form.trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenCalledWith('/family-billing/staff/tasks',expect.objectContaining({agencyId:1,guardianUserId:10,clientIds:[102],serviceTerms:[expect.objectContaining({serviceCode:'90834',units:2,rateRevision:1})]}));
  await label(form,'Service code').find('input').setValue('90791');expect(form.find('button').attributes('disabled')).toBeDefined();w.unmount();
 });
 it('clears selected terms and old prices immediately when changing organizations',async()=>{
  const w=mount(Setup,{props});await flushPromises();expect(w.text()).toContain('$110.00');api.get.mockImplementation(()=>new Promise(()=>{}));await w.setProps({agencyId:2});expect(w.text()).not.toContain('$110.00');w.unmount();
 });
 it('shows the signed service total and dates without enabling automatic payments',async()=>{
  api.get.mockImplementation(async url=>({data:url.includes('overview')?{clients:[{clientId:102,clientName:'Synthetic client'}],cards:[]}:{id:1,agencyId:1,agency:{name:'Synthetic clinic',slug:'fixture'},status:'pending',clientIds:[102],requireCard:false,waiver:{terms:'Terms',version:'test',serviceTerms:[{clientId:102,serviceCode:'90834',paymentBasis:'self_pay',priceBasis:'unit',amountCents:7500,units:2,totalCents:15000,effectiveFrom:'2026-01-01',effectiveThrough:'2026-12-31'}]}}}));
  const w=mount(PaymentTask,{props:{taskId:1,agencyId:1},global:{stubs:{RouterLink:true,SecureCardSetup:true}}});await flushPromises();expect(w.text()).toContain('$150.00 per matching visit');expect(w.text()).toContain('2026-12-31');expect(w.text()).toContain('No payment is taken');expect(api.post).not.toHaveBeenCalled();w.unmount();
 });
});
