import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),route:{params:{paymentId:'91',organizationSlug:'itsco'},query:{agencyId:'2',action:'refund'}}}));
vi.mock('vue-router',()=>({useRoute:()=>m.route}));
vi.mock('../../services/api',()=>({default:{get:m.get,post:m.post}}));
import PaymentReceiptView from '../PaymentReceiptView.vue';
const data=()=>({receipt:{agencyName:'Synthetic ITSCO',receiptNumber:'R-2-91',payerName:'DEMO QA Payer',responsibilityType:'Copay',amountCents:2500,netPaidCents:2500,currency:'USD',receivedAt:'2026-11-03',serviceDate:'2026-11-03'},credit:{isCredit:true,availableCents:2500},applications:[],refundRequests:[],canRequestRefund:true});
beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({data:data()});m.post.mockResolvedValue({data:{requestId:7}});});
it('opens the specific payment and requires an explicit form submission for a refund request',async()=>{
 const view=mount(PaymentReceiptView);await flushPromises();expect(m.get).toHaveBeenCalledWith('/family-billing/payments/91',{params:{agencyId:'2'}});expect(m.post).not.toHaveBeenCalled();expect(view.text()).toContain('$25.00');
 await view.get('textarea').setValue('The session did not occur.');await view.get('form').trigger('submit.prevent');await flushPromises();expect(m.post).toHaveBeenCalledWith('/family-billing/payments/91/refund-request',{agencyId:'2',amountCents:2500,reason:'The session did not occur.'});
});
it('shows a pending request and prevents another form submission',async()=>{const value=data();value.refundRequests=[{id:7,status:'requested',amountCents:2500,reason:'Canceled visit'}];value.credit.refundRequested=true;m.get.mockResolvedValue({data:value});const view=mount(PaymentReceiptView);await flushPromises();expect(view.find('form').exists()).toBe(false);expect(view.text()).toContain('related credit is on hold');});
it('shows access errors without exposing a payment or refund form',async()=>{m.get.mockRejectedValue({response:{status:403}});const view=mount(PaymentReceiptView);await flushPromises();expect(view.find('[role="alert"]').exists()).toBe(true);expect(view.find('form').exists()).toBe(false);expect(m.post).not.toHaveBeenCalled();});
