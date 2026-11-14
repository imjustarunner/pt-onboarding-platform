import {beforeEach,expect,it,vi} from 'vitest';
import {ref} from 'vue';
import {mount,flushPromises} from '@vue/test-utils';
import Dashboard from '../GuardianTutoringDashboard.vue';
import api from '../../../services/api.js';
import * as packages from '../../../services/unifiedPackages';
import {loadStripe} from '@stripe/stripe-js/pure';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../services/unifiedPackages',()=>({listGuardianEntitlements:vi.fn(),listGuardianPackages:vi.fn(),checkoutGuardianPackage:vi.fn(),confirmGuardianPackage:vi.fn(),formatMoney:cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents)/100)}));
vi.mock('../../../services/tutoringLearningOs',()=>({fetchGuardianTutoringDashboard:vi.fn(async()=>({})),completePracticeAssignment:vi.fn()}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1759,email:'qa.nlu.parent@example.com'}})}));
vi.mock('vue-router',()=>({useRouter:()=>({push:vi.fn()})}));
vi.mock('@stripe/stripe-js/pure',()=>({loadStripe:vi.fn()}));
const button=(w,text)=>w.findAll('button').find(b=>b.text().includes(text));
let care;
beforeEach(()=>{
 vi.clearAllMocks();care=ref({agencyId:453,serviceId:1038});
 packages.listGuardianEntitlements.mockResolvedValue({entitlements:[]});packages.listGuardianPackages.mockResolvedValue({packages:[{id:76,agencyId:453,name:'QA four visits',sessionCount:4,priceCents:18000}]});
 packages.checkoutGuardianPackage.mockResolvedValue({simulated:true,processor:'QA_SIMULATOR',stripeEnabled:false,amountCents:18000,paymentIntentId:'qa_pi_saved'});
 packages.confirmGuardianPackage.mockResolvedValue({ok:true});api.post.mockResolvedValue({data:{paymentIntent:{id:'qa_pi_saved',status:'succeeded'}}});
});
async function checkout(){
 const w=mount(Dashboard,{props:{clientId:2545,organizationSlug:'nlu-qa-demo'},global:{provide:{portalCareContext:care},stubs:{GuardianClinicalBooking:true,TutorOfficeStatus:true,PackagePriceChoice:true}}});
 await flushPromises();await button(w,'Buy a package').trigger('click');await flushPromises();
 await w.get('.qa-payment input').setValue('0000 0000 0000 0000');return w;
}
it('uses the normal package confirmation after a successful zero-card simulation and never loads Stripe',async()=>{
 const w=await checkout();expect(w.text()).toContain('Simulate $180.00 purchase');await button(w,'Simulate $180.00 purchase').trigger('click');await flushPromises();
 expect(packages.confirmGuardianPackage).toHaveBeenCalledExactlyOnceWith(2545,76,{agencyId:453,serviceId:1038,paymentIntentId:'qa_pi_saved'});expect(loadStripe).not.toHaveBeenCalled();w.unmount();
});
it.each(['requires_payment_method','processing'])('keeps a %s scenario pending and retries the same checkout',async status=>{
 api.post.mockResolvedValueOnce({data:{paymentIntent:{id:'qa_pi_saved',status}}}).mockResolvedValueOnce({data:{paymentIntent:{id:'qa_pi_saved',status:'succeeded'}}});
 const w=await checkout();await button(w,'Simulate $180.00 purchase').trigger('click');await flushPromises();expect(packages.confirmGuardianPackage).not.toHaveBeenCalled();expect(w.text()).toContain(status==='processing'?'pending':'declined');
 await button(w,'Simulate $180.00 purchase').trigger('click');await flushPromises();expect(packages.checkoutGuardianPackage).toHaveBeenCalledOnce();expect(packages.confirmGuardianPackage).toHaveBeenCalledOnce();expect(api.post.mock.calls[0][0]).toBe(api.post.mock.calls[1][0]);w.unmount();
});
it('does not confirm an old payment against a newly selected organization',async()=>{
 let resolve;api.post.mockImplementation(()=>new Promise(done=>resolve=done));const w=await checkout();await button(w,'Simulate $180.00 purchase').trigger('click');care.value={agencyId:454,serviceId:2000};await flushPromises();resolve({data:{paymentIntent:{id:'qa_pi_saved',status:'succeeded'}}});await flushPromises();expect(packages.confirmGuardianPackage).not.toHaveBeenCalled();expect(w.find('.qa-payment').exists()).toBe(false);w.unmount();
});

it('keeps an open checkout when a same-service portal-context refresh replaces its object',async()=>{
 const w=await checkout();care.value={agencyId:453,serviceId:1038,refreshed:true};await flushPromises();
 expect(w.find('.gtd-drawer').exists()).toBe(true);expect(w.find('.qa-payment').exists()).toBe(true);
 expect(packages.checkoutGuardianPackage).toHaveBeenCalledOnce();w.unmount();
});
