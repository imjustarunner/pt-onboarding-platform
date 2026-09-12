import { describe,it,expect,beforeEach,vi } from 'vitest';
import { mount,flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import Setup from '../SecureCardSetup.vue';
import api from '../../../services/api';
import {loadStripe} from '@stripe/stripe-js';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('@stripe/stripe-js',()=>({loadStripe:vi.fn()}));
beforeEach(()=>vi.clearAllMocks());
describe('secure card collection',()=>{
 it('never renders raw PAN/CVV inputs or a legacy fallback when Stripe is unavailable',async()=>{
  api.get.mockResolvedValue({data:{stripeEnabled:false}});const w=mount(Setup,{props:{publicKey:'test',submissionId:1}});await flushPromises();expect(w.findAll('input')).toHaveLength(0);expect(w.text()).toContain('not available');expect(api.post).not.toHaveBeenCalled();expect(w.emitted('unavailable')).toHaveLength(1);w.unmount();
 });
 it('mounts Stripe after rendering and sends only SetupIntent plus signed consent with intake session',async()=>{
  api.get.mockResolvedValue({data:{publishableKey:'pk_test',connectedAccountId:'acct_ours'}});api.post.mockImplementation(async url=>({data:url.includes('setup-intent')?{clientSecret:'seti_secret',connectedAccountId:'acct_ours',terms:'Authorization',termsVersion:'v1'}:{success:true,cardId:7,brand:'visa',last4:'4242'}}));
  const card={mount:vi.fn(),on:vi.fn((type,fn)=>fn({complete:true})),destroy:vi.fn()};const confirmCardSetup=vi.fn(async()=>({setupIntent:{id:'seti_verified',payment_method:'pm_never_send'}}));loadStripe.mockResolvedValue({elements:()=>({create:()=>card}),confirmCardSetup});
  const w=mount(Setup,{props:{publicKey:'test',submissionId:1},global:{provide:{intakeSessionToken:ref('session-opaque')}}});await flushPromises();expect(card.mount.mock.calls[0][0]).toBeInstanceOf(HTMLElement);expect(w.find('input[type=checkbox]').element.checked).toBe(false);await w.find('input[autocomplete=cc-name]').setValue('Parent One');await w.find('input[type=checkbox]').setValue(true);await w.find('button').trigger('click');await flushPromises();const [url,payload,options]=api.post.mock.calls.at(-1);expect(url).toContain('/payment-card');expect(payload.setupIntentId).toBe('seti_verified');expect(payload.stripeCustomerId).toBeUndefined();expect(payload.card).toBeUndefined();expect(payload.consent.accepted).toBe(true);expect(options.headers['x-intake-session']).toBe('session-opaque');expect(w.emitted('saved')).toHaveLength(1);w.unmount();
 });
});
