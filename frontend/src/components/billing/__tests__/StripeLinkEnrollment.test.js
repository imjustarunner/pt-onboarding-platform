import {afterEach,beforeEach,expect,it,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';import {ref} from 'vue';import {createPinia} from 'pinia';
import Setup from '../SecureCardSetup.vue';import api from '../../../services/api';import {loadStripe} from '@stripe/stripe-js/pure';
import {assertIntakeCardCollectionAllowed} from '../../../../../backend/src/utils/intakeCardCollectionPolicy.js';
import {useAuthStore} from '../../../store/auth';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));vi.mock('@stripe/stripe-js/pure',()=>({loadStripe:vi.fn()}));
let wrappers=[],confirm,card;
const info={isSelfPay:true};
const baseProps={publicKey:'qa',submissionId:1,insuranceInfo:info,email:'testing+owner@itsco.health'};
beforeEach(()=>{vi.clearAllMocks();card={mount:vi.fn(),destroy:vi.fn(),on:vi.fn((type,handler)=>{if(type==='change')handler({complete:true})})};confirm=vi.fn(async()=>({setupIntent:{id:'seti_owner'}}));loadStripe.mockResolvedValue({elements:()=>({create:()=>card}),confirmCardSetup:confirm});api.get.mockResolvedValue({data:{publishableKey:'pk_test_fixture',connectedAccountId:'acct_fixture'}});api.post.mockImplementation(async path=>({data:path.includes('setup-intent')?{clientSecret:'seti_fixture_secret',connectedAccountId:'acct_fixture',terms:'Unchanged terms',termsVersion:'same',billingEmail:baseProps.email}:{cardId:8,brand:'visa',last4:'4242'}}));});
afterEach(()=>{wrappers.forEach(w=>w.unmount());wrappers=[]});
async function render(props={},provide={},plugins=[]){const w=mount(Setup,{props:{...baseProps,...props},global:{plugins,provide:{intakeSessionToken:ref('synthetic-session'),...provide}}});wrappers.push(w);await flushPromises();return w;}
async function accept(w){await w.get('input[autocomplete=cc-name]').setValue('Synthetic Owner');await w.get('input[type=checkbox]').setValue(true);}
const save=w=>w.findAll('button').find(b=>b.text()==='Save card securely');
it.each([{primary:{isMedicaid:true}},{primary:{insurerName:'Commercial'},secondary:{insurerName:'Medicaid'}},{useInsuranceOnFile:true,primaryIsMedicaid:true}])('never loads SDK or creates a payer/setup for protected coverage %j',async insuranceInfo=>{await render({insuranceInfo});expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(loadStripe).not.toHaveBeenCalled();});
it.each([{collectionAllowed:false},{insuranceInfo:null}])('fails closed before coverage review or without insurance context %j',async props=>{await render(props);expect(api.get).not.toHaveBeenCalled();expect(loadStripe).not.toHaveBeenCalled();});
it('waits for the latest authorized draft save before applying the real server coverage guard',async()=>{
 let finish;let stored={primary:{insurerName:'Old commercial',memberId:'SYN-OLD'}};const current={primary:{insurerName:'New commercial',memberId:'SYN-NEW'}};
 const flush=vi.fn(()=>new Promise(resolve=>{finish=()=>{stored=current;resolve()}}));
 api.post.mockImplementation(async(path,payload)=>{assertIntakeCardCollectionAllowed({link:{},submission:{intake_data:{responses:{submission:{insuranceInfo:stored}}}},reviewed:payload.coverageReviewed,fingerprint:payload.coverageFingerprint});return {data:{clientSecret:'seti_fixture_secret',connectedAccountId:'acct_fixture',terms:'Unchanged terms',termsVersion:'same'}}});
 const w=await render({insuranceInfo:current},{prepareIntakePayment:flush});expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(loadStripe).not.toHaveBeenCalled();
 finish();await flushPromises();expect(flush).toHaveBeenCalledOnce();expect(api.post).toHaveBeenCalledOnce();expect(loadStripe).toHaveBeenCalledOnce();expect(w.find('[role=alert]').exists()).toBe(false);
});
it('leaves a failed draft save recoverable without opening Stripe',async()=>{
 const w=await render({}, {prepareIntakePayment:vi.fn(async()=>{throw new Error('Draft save failed')})});expect(w.text()).toContain('Draft save failed');expect(api.post).not.toHaveBeenCalled();expect(loadStripe).not.toHaveBeenCalled();
});
it('discards a late setup after coverage changes to Medicaid',async()=>{
 let finish;api.post.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));const w=await render();await w.setProps({insuranceInfo:{primary:{isMedicaid:true}}});finish({data:{clientSecret:'seti_old_secret',connectedAccountId:'acct_fixture'}});await flushPromises();expect(loadStripe).not.toHaveBeenCalled();expect(w.text()).toBe('');
});
it('clears the prior name/acceptance and ignores an old confirmation after another guardian signs in',async()=>{
 const pinia=createPinia(),auth=useAuthStore(pinia);auth.user={id:10,email:baseProps.email};const w=await render({}, {},[pinia]);await accept(w);
 let finish;confirm.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));await save(w).trigger('click');await flushPromises();auth.user={id:20,email:'testing+other@itsco.health'};await flushPromises();finish({setupIntent:{id:'seti_old'}});await flushPromises();
 expect(api.post.mock.calls.filter(([path])=>path.endsWith('/payment-card'))).toHaveLength(0);expect(w.get('input[autocomplete=cc-name]').element.value).toBe('');expect(w.get('input[type=checkbox]').element.checked).toBe(false);expect(w.emitted('saved')).toBeUndefined();
});
it('flushes current owned progress before both setup and final card save, without enabling recurring charges',async()=>{
 const flush=vi.fn(async()=>{}),w=await render({}, {prepareIntakePayment:flush});await accept(w);await save(w).trigger('click');await flushPromises();expect(flush).toHaveBeenCalledTimes(3);const payload=api.post.mock.calls.at(-1)[1];expect(payload.setupIntentId).toBe('seti_owner');expect(payload).not.toHaveProperty('recurring');expect(payload).not.toHaveProperty('autoCharge');expect(w.emitted('saved')).toHaveLength(1);
});

it('does not load Stripe or create a setup when QA reports the live platform is unavailable for synthetic tests',async()=>{api.get.mockResolvedValue({data:{stripeEnabled:false,publishableKey:null,connectedAccountId:null,testModeRequired:true,mode:'live'}});const w=await render();expect(w.text()).toContain('isolated test-mode payment configuration');expect(api.post).not.toHaveBeenCalled();expect(loadStripe).not.toHaveBeenCalled();});
it('keeps Spanish Link controls and verification instructions translated',async()=>{const w=await render({}, {intakeLocale:ref('es')});expect(w.text()).toContain('Usar Link (opcional)');await w.findAll('button').find(b=>b.text()==='Usar Link (opcional)').trigger('click');await flushPromises();expect(w.text()).toContain('Stripe puede pedirle que ingrese o verifique su correo');expect(w.text()).not.toContain('Choosing it does not connect');});
