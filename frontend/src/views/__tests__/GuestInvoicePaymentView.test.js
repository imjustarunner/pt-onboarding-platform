import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),loadStripe:vi.fn(),confirm:vi.fn(),destroy:vi.fn(),cardMount:vi.fn(),createCard:vi.fn()}));
vi.mock('../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('@stripe/stripe-js',()=>({loadStripe:m.loadStripe}));
import View from '../GuestInvoicePaymentView.vue';
const token='A'.repeat(43);
beforeEach(()=>{
 vi.clearAllMocks();window.history.replaceState({},'','/billing/guest#'+token);
 m.get.mockResolvedValue({data:{agencyName:'Synthetic practice',amountCents:7500,currency:'USD',locale:'es',paid:false}});
 m.post.mockImplementation(async path=>({data:path.endsWith('/intent')?{paid:false,clientSecret:'synthetic-secret',publishableKey:'pk_synthetic',connectedAccountId:'acct_synthetic'}:{paid:true}}));
 m.confirm.mockResolvedValue({paymentIntent:{status:'succeeded'}});
 m.createCard.mockReturnValue({on:(event,fn)=>{if(event==='ready')fn();},mount:m.cardMount,destroy:m.destroy});
 m.loadStripe.mockResolvedValue({elements:()=>({create:m.createCard}),confirmCardPayment:m.confirm});
});
it('presents a minimal Spanish payment request and waits for explicit consent before loading card entry',async()=>{
 const wrapper=mount(View);await flushPromises();
 expect(wrapper.text()).toContain('Pago seguro como invitado');expect(wrapper.text()).toContain('$75.00');
 expect(m.post).not.toHaveBeenCalled();expect(m.loadStripe).not.toHaveBeenCalled();
 expect(m.get).toHaveBeenCalledWith('/public/guest-invoices/context',expect.objectContaining({headers:{'X-Guest-Invoice-Token':token}}));
 await wrapper.get('input[type=checkbox]').setValue(true);await wrapper.findAll('button').find(button=>button.text().includes('Continuar')).trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/public/guest-invoices/intent',{expectedAmountCents:7500,consentAccepted:true},expect.anything());
 expect(m.loadStripe).toHaveBeenCalledWith('pk_synthetic',{stripeAccount:'acct_synthetic',locale:'es'});expect(m.createCard).toHaveBeenCalledWith('card');
 expect(document.querySelector('meta[data-guest-invoice]')?.content).toBe('no-referrer');wrapper.unmount();expect(m.destroy).toHaveBeenCalledOnce();expect(document.querySelector('meta[data-guest-invoice]')).toBeNull();
});
it('submits card data to Stripe only and confirms using the server’s saved payment reference',async()=>{
 const wrapper=mount(View);await flushPromises();await wrapper.get('input[type=checkbox]').setValue(true);await wrapper.findAll('button').find(button=>button.text().includes('Continuar')).trigger('click');await flushPromises();
 await wrapper.get('form').trigger('submit');await flushPromises();
 expect(m.confirm).toHaveBeenCalledWith('synthetic-secret',{payment_method:{card:expect.any(Object)}});
 expect(m.post).toHaveBeenLastCalledWith('/public/guest-invoices/confirm',{},expect.anything());expect(wrapper.text()).toContain('Pago confirmado');
 expect(m.post.mock.calls.every(([,body])=>!('card' in body)&&!('paymentIntentId' in body))).toBe(true);wrapper.unmount();
});
