import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import FamilyBilling from '../GuardianPaymentInsuranceTab.vue';
import Ledger from '../GuardianBillingTab.vue';
import api from '../../../services/api';
import {loadStripe} from '@stripe/stripe-js';
vi.mock('@stripe/stripe-js',()=>({loadStripe:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),delete:vi.fn()}}));
const base=()=>({clients:[{clientId:10,clientName:'Child One',responsiblePayers:[{name:'Parent One'}],canAcceptResponsibility:false,canManageBilling:false}],cards:[],profiles:[],terms:'Test signed authorization',termsVersion:'test-v1',stripe:{enabled:false}});
const button=(w,text)=>w.findAll('button').find(b=>b.text().includes(text));
beforeEach(()=>{vi.clearAllMocks();});
describe('private family billing',()=>{
 it('shows only responsible payer names to a child or nonpayer',async()=>{
  api.get.mockResolvedValue({data:base()});const w=mount(FamilyBilling,{props:{agencyId:1,guardianUserId:2}});await flushPromises();expect(w.text()).toContain('Parent One');expect(w.text()).not.toContain('Your saved cards');expect(w.find('form').exists()).toBe(false);expect(api.get).toHaveBeenCalledTimes(1);w.unmount();
 });
 it('requires affirmative signature before accepting responsibility',async()=>{
  const value=base();value.clients[0].canAcceptResponsibility=true;api.get.mockResolvedValue({data:value});api.post.mockResolvedValue({data:{success:true}});
  const w=mount(FamilyBilling,{props:{agencyId:1,guardianUserId:2}});await flushPromises();await button(w,'Accept financial responsibility').trigger('click');expect(w.find('input[type=checkbox]').element.checked).toBe(false);expect(button(w,'Sign authorization').attributes('disabled')).toBeDefined();await w.find('input[autocomplete=name]').setValue('Parent Two');await w.find('input[type=checkbox]').setValue(true);await w.find('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/guardian-billing/clients/10/responsibility',expect.objectContaining({agencyId:1,consent:{accepted:true,version:'test-v1',signatureName:'Parent Two'}}));w.unmount();
 });
 it('applies the same owned card separately to two clients without enabling recurring billing',async()=>{
  const value=base();value.clients=[10,11].map(id=>({clientId:id,clientName:`Child ${id}`,responsiblePayers:[{name:'Parent One'}],canManageBilling:true}));value.cards=[{id:7,card_brand:'Visa',card_last4:'4242'}];api.get.mockResolvedValue({data:value});api.post.mockResolvedValue({data:{success:true}});
  const w=mount(FamilyBilling,{props:{agencyId:1,guardianUserId:2}});await flushPromises();await w.findAll('.client-grid select')[0].setValue(7);await w.findAll('.client-grid button').find(b=>b.text()==='Apply card to this client').trigger('click');await flushPromises();expect(api.post).toHaveBeenLastCalledWith('/guardian-billing/clients/10/payment-method',{agencyId:1,cardId:7,recurring:false});await w.findAll('.client-grid select')[1].setValue(7);await w.findAll('.client-grid button').filter(b=>b.text()==='Apply card to this client')[1].trigger('click');await flushPromises();expect(api.post).toHaveBeenLastCalledWith('/guardian-billing/clients/11/payment-method',{agencyId:1,cardId:7,recurring:false});w.unmount();
 });
 it('clears private details immediately when agency changes and ignores stale responses',async()=>{
  const first=base();first.clients[0].canManageBilling=true;first.cards=[{id:7,card_brand:'Visa',card_last4:'9876'}];api.get.mockResolvedValueOnce({data:first});let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const w=mount(FamilyBilling,{props:{agencyId:1,guardianUserId:2}});await flushPromises();expect(w.text()).toContain('9876');await w.setProps({agencyId:2});expect(w.text()).not.toContain('9876');resolve({data:base()});await flushPromises();expect(w.text()).not.toContain('9876');w.unmount();
 });
 it('does not request a ledger for a nonpayer',async()=>{
  api.get.mockResolvedValue({data:base()});const w=mount(Ledger,{props:{agencyId:1,clientId:10}});await flushPromises();expect(w.text()).toContain('Responsible payer: Parent One');expect(api.get).toHaveBeenCalledTimes(1);w.unmount();
 });
 it('only displays payment confirmation returned by the server, without posting success assertions',async()=>{
  const value=base();value.clients[0].canManageBilling=true;api.get.mockImplementation(async url=>({data:url.includes('overview')?value:{ledger:[{id:9,total_cents:2500,charge_status:'PENDING'}]}}));api.post.mockResolvedValue({data:{paid:true}});const w=mount(Ledger,{props:{agencyId:1,clientId:10}});await flushPromises();await button(w,'Pay $25.00').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenCalledWith('/learning-billing/payments/intent',{agencyId:1,chargeId:9,expectedAmountCents:2500});expect(w.text()).toContain('confirmed by Stripe');w.unmount();
 });
 it('completes bank authentication for an off-session failure before requesting server verification',async()=>{
  const value=base();value.clients[0].canManageBilling=true;api.get.mockImplementation(async url=>({data:url.includes('overview')?value:{ledger:[{id:9,total_cents:2500,charge_status:'PENDING'}]}}));
  const confirmCardPayment=vi.fn().mockResolvedValue({paymentIntent:{status:'succeeded'}});loadStripe.mockResolvedValue({confirmCardPayment});
  api.post.mockResolvedValueOnce({data:{requiresAction:true,clientSecret:'secret_fixture',paymentMethodId:'pm_owned_fixture',connectedAccountId:'acct_fixture',publishableKey:'pk_test_fixture'}}).mockResolvedValueOnce({data:{paid:true}});
  const w=mount(Ledger,{props:{agencyId:1,clientId:10}});await flushPromises();await button(w,'Pay $25.00').trigger('click');await flushPromises();
  expect(confirmCardPayment).toHaveBeenCalledWith('secret_fixture',{payment_method:'pm_owned_fixture'});expect(api.post).toHaveBeenCalledTimes(2);expect(w.text()).toContain('confirmed by Stripe');w.unmount();
 });

});
