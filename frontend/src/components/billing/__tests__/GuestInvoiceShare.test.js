import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../../../composables/usePortalCareApi',()=>({usePortalCareApi:()=>({post:m.post})}));
vi.mock('../../../composables/useFamilyLocale',async()=>{const{ref}=await import('vue');return{useFamilyLocale:()=>({locale:ref('es')})};});
import Share from '../GuestInvoiceShare.vue';
beforeEach(()=>{vi.clearAllMocks();m.post.mockImplementation(async path=>({data:path.endsWith('/send')?{status:'sent'}:{id:8,token:'synthetic-token',url:'https://portal.example.test/billing/guest#synthetic-token',amountCents:7500,currency:'USD'}}));});
it('creates a payment link without sending email and requires recipient confirmation before explicit send',async()=>{
 const wrapper=mount(Share,{props:{agencyId:2,allocationId:4,amountCents:7500}});await flushPromises();
 await wrapper.findAll('button').find(button=>button.text().includes('Crear enlace')).trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledOnce();expect(m.post).toHaveBeenCalledWith('/family-billing/allocations/4/guest-invoices',{agencyId:2,amountCents:7500,locale:'es'});
 const sendButton=wrapper.findAll('button').find(button=>button.text().includes('Enviar correo'));expect(sendButton.attributes('disabled')).toBeDefined();
 await wrapper.get('input[type=email]').setValue('grandparent@example.test');await wrapper.get('input[type=checkbox]').setValue(true);await wrapper.get('form').trigger('submit');await flushPromises();
 expect(m.post).toHaveBeenLastCalledWith('/family-billing/allocations/4/guest-invoices/send',{agencyId:2,token:'synthetic-token',recipientEmail:'grandparent@example.test',confirmed:true});expect(wrapper.text()).toContain('Solicitud de pago enviada');wrapper.unmount();
});
