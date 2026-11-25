import {afterEach,beforeEach,it,expect,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));import api from '../../../services/api';import Review from '../ClaimFinancialReview.vue';
let wrapper;const data={revision:2,clientId:3,hasFinalPatientResponsibility:false,policy:{copayCents:2500,coinsuranceBasisPoints:2000},estimate:null,balances:[],flags:[{code:'paid_exact_billed',message:'Review the contracted rate.'}],history:[{id:8,same_client:1,paid_cents:10000,billed_cents:13500,adjustment_cents:3500,responsibility_cents:2500,date_of_service:'2026-11-20',flags:[]}]};
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data});api.post.mockResolvedValue({data:{message:'Estimate saved; no balance or card charge created.'}});});afterEach(()=>wrapper?.unmount());
it('shows copay, percentage, posted/estimated distinctions and matching prior reimbursements',async()=>{
 wrapper=mount(Review,{props:{agencyId:2,claimId:7}});await flushPromises();expect(wrapper.text()).toContain('$25.00');expect(wrapper.text()).toContain('20%');expect(wrapper.text()).toContain('Awaiting adjudication');expect(wrapper.text()).toContain('paid $100.00');
 await wrapper.findAll('button').find(b=>b.text()==='Edit defaults').trigger('click');expect(wrapper.emitted('edit-defaults')).toHaveLength(1);expect(api.post).not.toHaveBeenCalled();
});
it('saves a billing estimate with unknown amounts kept null and coinsurance expressed in basis points',async()=>{
 wrapper=mount(Review,{props:{agencyId:2,claimId:7}});await flushPromises();await wrapper.findAll('button').find(b=>b.text().includes('Edit patient')).trigger('click');const form=wrapper.get('form');
 await form.get('textarea').setValue('Reviewed current patient benefit estimate');await form.trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/medical-billing/claimmd/claims/7/patient-estimate',expect.objectContaining({amountCents:null,copayCents:2500,coinsuranceBasisPoints:2000,revision:2}),expect.anything());expect(wrapper.text()).toContain('no balance or card charge');
});
it('holds a final responsibility save without uploaded proof and explicit confirmation',async()=>{
 wrapper=mount(Review,{props:{agencyId:2,claimId:7}});await flushPromises();await wrapper.findAll('button').find(b=>b.text().includes('Edit patient')).trigger('click');
 api.get.mockResolvedValue({data:{items:[]}});await wrapper.get('form select').setValue('final');await wrapper.get('textarea').setValue('Reviewed the final EOB source document');await wrapper.get('form').trigger('submit');await flushPromises();expect(api.post).not.toHaveBeenCalled();expect(wrapper.get('[role=alert]').text()).toContain('proof');
});
it('uploads private final EOB proof and posts only the explicitly confirmed final amount',async()=>{
 wrapper=mount(Review,{props:{agencyId:2,claimId:7}});await flushPromises();await wrapper.findAll('button').find(b=>b.text().includes('Edit patient')).trigger('click');
 api.get.mockImplementation(async url=>({data:url.endsWith('responsibility-proof')?{items:[{id:'proof-1',kind:'final_eob',filename:'final.pdf',source:'Payer portal EOB 123'}]}:data}));
 await wrapper.get('form select').setValue('final');await wrapper.get('textarea').setValue('Reviewed final payer responsibility');await wrapper.get('fieldset input:not([type])').setValue('Payer portal EOB 123');
 const file=new File(['%PDF-1.4 Synthetic EOB'],'final.pdf',{type:'application/pdf'});const input=wrapper.get('input[type=file]');Object.defineProperty(input.element,'files',{value:[file]});await input.trigger('change');
 api.post.mockResolvedValueOnce({data:{item:{id:'proof-1'}}});await wrapper.findAll('button').find(b=>b.text()==='Upload proof').trigger('click');await flushPromises();
 expect(api.post.mock.calls[0][1]).toBeInstanceOf(FormData);expect(api.post.mock.calls[0][1].get('kind')).toBe('final_eob');
 await wrapper.get('form>label input[inputmode]').setValue('25.00');await wrapper.get('form>label input[type=checkbox]').setValue(true);await wrapper.get('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenLastCalledWith('/medical-billing/claimmd/claims/7/patient-responsibility',expect.objectContaining({amountCents:2500,evidenceIds:['proof-1'],attested:true,reference:'Payer portal EOB 123'}),expect.anything());
});
