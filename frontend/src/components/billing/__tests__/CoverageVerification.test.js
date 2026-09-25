import {mount,flushPromises} from '@vue/test-utils';import {beforeEach,describe,it,expect,vi} from 'vitest';
import Coverage from '../ClientCoverageVerification.vue';import Summary from '../ClientCareCoverageSummary.vue';import Secondary from '../../admin/SecondaryClaimPanel.vue';import api from '../../../services/api.js';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(),post:vi.fn()}}));
beforeEach(()=>vi.resetAllMocks());
describe('coverage and care-team views',()=>{
 it('checks the selected policy with saved client scope and no editable patient payload',async()=>{
  api.get.mockImplementation(async url=>({data:url.endsWith('billing-offices')?{items:[{id:8,name:'Office',practice_npi:'1306688650'}]}:{checks:[],blockers:['Review coverage']}}));api.post.mockResolvedValue({data:{}});
  const w=mount(Coverage,{props:{agencyId:1,clientId:2}});await flushPromises();await w.find('select').setValue(8);await w.findAll('button').find(b=>b.text()==='Check secondary eligibility').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/clients/2/coverage/check',expect.objectContaining({agencyId:1,billingOfficeId:8,slot:'secondary',requestKey:expect.any(String)}));expect(api.post.mock.calls[0][1]).not.toHaveProperty('eligibility');expect(w.text()).toContain('does not rule out other insurance');w.unmount();
 });
 it('keeps manual verification available when electronic eligibility is not enabled',async()=>{api.get.mockImplementation(async url=>{if(url.endsWith('billing-offices'))throw {response:{status:403}};return {data:{checks:[],blockers:['Manual verification required']}};});const w=mount(Coverage,{props:{agencyId:1,clientId:2}});await flushPromises();expect(w.text()).toContain('Manual verification required');expect(w.text()).toContain('Electronic verification is unavailable');expect(w.find('form button').attributes('disabled')).toBeUndefined();w.unmount();});
 it('shows both insurer names and overdue age without rendering amounts or claims',async()=>{
  api.get.mockResolvedValue({data:{policies:[{position:'primary',insurerName:'BCBS'},{position:'secondary',insurerName:'Medicaid'}],balance:{status:'overdue',ageBand:'31_60_days',amount:99999},claimId:'PRIVATE-CLAIM'}});
  const w=mount(Summary,{props:{clientId:2}});await flushPromises();expect(w.text()).toContain('Primary: BCBS');expect(w.text()).toContain('Secondary: Medicaid');expect(w.text()).toContain('31–60 days');expect(w.text()).not.toMatch(/99999|PRIVATE-CLAIM/);w.unmount();
 });
 it('does not display a previous client summary after navigation',async()=>{
  let first;api.get.mockImplementationOnce(()=>new Promise(r=>{first=r;})).mockResolvedValue({data:{policies:[],balance:{status:'billing_review'}}});const w=mount(Summary,{props:{clientId:2}});await w.setProps({clientId:3});await flushPromises();first({data:{policies:[{position:'primary',insurerName:'OLD-CLIENT'}],balance:{status:'overdue'}}});await flushPromises();expect(w.text()).not.toContain('OLD-CLIENT');w.unmount();
 });
 it('refuses to prepare a tertiary duplicate from an already secondary claim',async()=>{
  api.get.mockResolvedValue({data:{claim:{parent_claim_id:7},lines:[{procedure_code:'90834'}]}});const w=mount(Secondary,{props:{agencyId:1,claimId:11}});await w.find('button').trigger('click');await flushPromises();expect(api.get).toHaveBeenCalledWith('/medical-billing/claimmd/claims/11/draft',{params:{agencyId:1}});expect(w.text()).toContain('already secondary');expect(w.find('form').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();w.unmount();
 });
});
