import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Payment from '../PublicIntakeInsurancePaymentStep.vue';
const {get}=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get}}));
beforeEach(()=>{get.mockReset().mockResolvedValue({data:{stripeEnabled:false}});});
const render=(props={})=>mount(Payment,{props:{paymentOnly:true,stepConfig:{enrollmentService:'tutoring',paymentRequired:false},insuranceInfo:{authorizationAgreed:true,authorizationSignature:'QA Parent'},...props},global:{stubs:{PublicIntakePaymentStep:{template:'<div data-card-setup/>',props:['stepConfig']},PublicIntakeInsuranceStep:true}}});
it('persists office discussion and permits signed continuation with no card setup',async()=>{
 const w=render();await flushPromises();
 expect(w.emitted('update:paymentInfo')[0][0]).toMatchObject({arrangement:'discuss',paymentChoice:'later',skipAcknowledged:true,autoCharge:false});
 expect(w.vm.validateAuthorization()).toBe(true);expect(w.find('[data-card-setup]').exists()).toBe(false);expect(get).not.toHaveBeenCalled();
 expect(w.text()).toContain('No card is required to submit your tutoring request');w.unmount();
});
it('opens card setup only after the parent explicitly selects Add Card',async()=>{
 const w=render();await flushPromises();
 const add=w.findAll('button').find(b=>b.text().includes('Add Card')&&!b.text().includes('Later'));await add.trigger('click');await flushPromises();
 expect(w.find('[data-card-setup]').exists()).toBe(true);w.unmount();
});
it('restores the saved explicit choice without replacing it with the discussion default',async()=>{
 const w=render({paymentInfo:{paymentChoice:'add_card',arrangement:'all'}});await flushPromises();expect(w.vm.paymentChoice).toBe('add_card');expect(w.find('[data-card-setup]').exists()).toBe(true);w.unmount();
});
it('retains the required clinical authorization even when card collection is deferred',async()=>{
 const w=render({insuranceInfo:{},paymentInfo:{arrangement:'discuss'}});expect(w.vm.validateAuthorization()).toBe(false);w.unmount();
});
