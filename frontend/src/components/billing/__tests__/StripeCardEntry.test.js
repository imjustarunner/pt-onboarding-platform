import {afterEach,beforeEach,expect,it,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
import Entry from '../StripeCardEntry.vue';import {loadStripe} from '@stripe/stripe-js/pure';
vi.mock('@stripe/stripe-js/pure',()=>({loadStripe:vi.fn()}));
let wrappers=[],cards=[],create,confirmSetup,confirmPayment,createMethod;
const props={publishableKey:'pk_test_fixture',connectedAccountId:'acct_fixture',clientSecret:'seti_fixture_secret',email:'testing+owner@itsco.health',name:'Synthetic Owner',contextKey:'owner-1'};
beforeEach(()=>{vi.clearAllMocks();cards=[];confirmSetup=vi.fn(async()=>({setupIntent:{id:'seti_fixture'}}));confirmPayment=vi.fn(async()=>({paymentIntent:{id:'pi_fixture'}}));createMethod=vi.fn(async()=>({paymentMethod:{id:'pm_fixture'}}));create=vi.fn(()=>{const card={mount:vi.fn(),destroy:vi.fn(),on:vi.fn((type,handler)=>{if(type==='change')handler({complete:true})})};cards.push(card);return card;});loadStripe.mockResolvedValue({elements:vi.fn(()=>({create})),confirmCardSetup:confirmSetup,confirmCardPayment:confirmPayment,createPaymentMethod:createMethod});});
afterEach(()=>{wrappers.forEach(w=>w.unmount());wrappers=[]});
async function render(overrides={}){const w=mount(Entry,{props:{...props,...overrides}});wrappers.push(w);await flushPromises();return w;}
it('starts with Link disabled, exposes it only after opt-in, and returns to plain card entry',async()=>{
 const w=await render();expect(create).toHaveBeenLastCalledWith('card',{hidePostalCode:false,disableLink:true});expect(confirmSetup).not.toHaveBeenCalled();expect(createMethod).not.toHaveBeenCalled();
 await w.findAll('button').find(b=>b.text()==='Use Link (optional)').trigger('click');await flushPromises();expect(cards[0].destroy).toHaveBeenCalledOnce();expect(create).toHaveBeenLastCalledWith('card',{hidePostalCode:false,disableLink:false});
 expect(w.text()).toContain('Stripe may ask you to enter or verify your email');expect(confirmSetup).not.toHaveBeenCalled();
 await w.findAll('button').find(b=>b.text()==='Enter a card').trigger('click');await flushPromises();expect(create).toHaveBeenLastCalledWith('card',{hidePostalCode:false,disableLink:true});
});
it.each([{enabled:false},{publishableKey:''}])('does not load Stripe without an eligible configured form %o',async change=>{await render(change);expect(loadStripe).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();});
it('forwards only the chosen card element and current payer identity using the existing card-only SDK methods',async()=>{
 const w=await render();await w.vm.confirmSetup();await w.vm.confirmPayment();await w.vm.createPaymentMethod();
 expect(confirmSetup).toHaveBeenCalledWith(props.clientSecret,{payment_method:{card:cards[0],billing_details:{name:props.name,email:props.email}}});
 expect(confirmPayment).toHaveBeenCalledWith(props.clientSecret,expect.anything());expect(createMethod).toHaveBeenCalledWith({type:'card',card:cards[0],billing_details:{name:props.name,email:props.email}});
});
it('clears Link choice and old elements when the family, email or Stripe source changes',async()=>{
 const w=await render();await w.findAll('button').find(b=>b.text()==='Use Link (optional)').trigger('click');await flushPromises();
 const prior=cards.at(-1);await w.setProps({email:'testing+other@itsco.health',contextKey:'owner-2',connectedAccountId:'acct_other',clientSecret:'seti_other_secret'});await flushPromises();expect(prior.destroy).toHaveBeenCalledOnce();expect(create).toHaveBeenLastCalledWith('card',{hidePostalCode:false,disableLink:true});expect(w.text()).not.toContain(props.email);
});
it('ignores a late loader after the form becomes protected or is unmounted',async()=>{
 let finish;loadStripe.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));const w=mount(Entry,{props});wrappers.push(w);await w.setProps({enabled:false});finish({elements:()=>({create})});await flushPromises();expect(create).not.toHaveBeenCalled();
});
it('rejects an old confirmation result after switching to another owner',async()=>{
 let finish;confirmSetup.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));const w=await render();const pending=w.vm.confirmSetup();await flushPromises();await w.setProps({contextKey:'owner-2',email:'testing+other@itsco.health'});await flushPromises();finish({setupIntent:{id:'seti_old'}});await expect(pending).rejects.toThrow('Payment details changed');
});
