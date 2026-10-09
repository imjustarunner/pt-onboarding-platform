import {beforeEach,it,expect,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));import api from '../../../services/api';import CallBillingReview from '../CallBillingReview.vue';
const data={revision:0,status:'not_requested',canReview:false,details:null,claimId:null};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data});api.put.mockResolvedValue({data:{...data,revision:1,status:'review_requested'}});});
it('lets a provider document the service and request review without controls to mark billed',async()=>{
 const w=mount(CallBillingReview,{props:{callId:12}});await w.get('button').trigger('click');await flushPromises();
 expect(w.text()).not.toContain('Attach existing claim');expect(w.text()).toContain('does not charge the client');
 const fields=w.findAll('textarea');await fields[0].setValue('Clinical service described.');await fields[1].setValue('Please assess the billing criteria.');await w.get('input[type=number]').setValue('10');
 await w.get('form').trigger('submit.prevent');await flushPromises();expect(api.put).toHaveBeenCalledWith('/communications/calls/12/billing-review',expect.objectContaining({action:'request_review',revision:0,serviceMinutes:10}));expect(w.text()).toContain('Awaiting billing review');
});
it('shows linked claim status and prevents replacing a linked claim',async()=>{
 api.get.mockResolvedValue({data:{...data,status:'billed',claimId:44,claimStatus:'submitted',canReview:true}});const w=mount(CallBillingReview,{props:{callId:12}});await w.get('button').trigger('click');await flushPromises();expect(w.text()).toContain('Claim #44 (submitted)');expect(w.get('fieldset').element.disabled).toBe(true);expect(w.text()).not.toContain('Attach existing claim');
});
