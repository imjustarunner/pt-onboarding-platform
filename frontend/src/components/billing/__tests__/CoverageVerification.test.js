import {mount,flushPromises} from '@vue/test-utils';import {beforeEach,describe,it,expect,vi} from 'vitest';
import Coverage from '../ClientCoverageVerification.vue';import Summary from '../ClientCareCoverageSummary.vue';import Secondary from '../../admin/SecondaryClaimPanel.vue';import api from '../../../services/api.js';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(),post:vi.fn()}}));
beforeEach(()=>vi.resetAllMocks());
describe('coverage and care-team views',()=>{
 it('checks the selected policy with saved client scope and no editable patient payload',async()=>{
  api.get.mockImplementation(async url=>({data:url.endsWith('billing-offices')?{items:[{id:8,name:'Office',practice_npi:'1306688650'}]}:{checks:[],blockers:['Review coverage']}}));api.post.mockResolvedValue({data:{}});
  const w=mount(Coverage,{props:{agencyId:1,clientId:2}});await flushPromises();await w.find('select').setValue(8);await w.findAll('button').find(b=>b.text()==='Check secondary eligibility').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/clients/2/coverage/check',expect.objectContaining({agencyId:1,billingOfficeId:8,slot:'secondary',requestKey:expect.any(String)}),{skipGlobalLoading:true});expect(api.post.mock.calls[0][1]).not.toHaveProperty('eligibility');expect(w.text()).toContain('does not rule out other insurance');w.unmount();
 });
 it('keeps manual verification available when electronic eligibility is not enabled',async()=>{api.get.mockImplementation(async url=>{if(url.endsWith('billing-offices'))throw {response:{status:403}};return {data:{checks:[],blockers:['Manual verification required']}};});const w=mount(Coverage,{props:{agencyId:1,clientId:2}});await flushPromises();expect(w.text()).toContain('Manual verification required');expect(w.text()).toContain('Electronic verification is unavailable');expect(w.find('form button').attributes('disabled')).toBeUndefined();w.unmount();});
 it('shows insurer names while excluding balance details and claim identifiers from the provider summary',async()=>{
  api.get.mockResolvedValue({data:{policies:[{position:'primary',insurerName:'BCBS'},{position:'secondary',insurerName:'Medicaid'}],balance:{status:'overdue',ageBand:'31_60_days',amount:99999},claimId:'PRIVATE-CLAIM'}});
  const w=mount(Summary,{props:{clientId:2}});await flushPromises();expect(w.text()).toContain('Primary: BCBS');expect(w.text()).toContain('Secondary: Medicaid');expect(w.text()).not.toContain('31–60 days');expect(w.text()).not.toMatch(/99999|PRIVATE-CLAIM/);w.unmount();
 });
 it('does not display a previous client summary after navigation',async()=>{
  let first;api.get.mockImplementationOnce(()=>new Promise(r=>{first=r;})).mockResolvedValue({data:{policies:[],balance:{status:'billing_review'}}});const w=mount(Summary,{props:{clientId:2}});await w.setProps({clientId:3});await flushPromises();first({data:{policies:[{position:'primary',insurerName:'OLD-CLIENT'}],balance:{status:'overdue'}}});await flushPromises();expect(w.text()).not.toContain('OLD-CLIENT');w.unmount();
 });
 it('refuses to prepare a tertiary duplicate from an already secondary claim',async()=>{
  api.get.mockResolvedValue({data:{claim:{parent_claim_id:7},lines:[{procedure_code:'90834'}]}});const w=mount(Secondary,{props:{agencyId:1,claimId:11}});await w.find('button').trigger('click');await flushPromises();expect(api.get).toHaveBeenCalledWith('/medical-billing/claimmd/claims/11/draft',{params:{agencyId:1}});expect(w.text()).toContain('already secondary');expect(w.find('form').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();w.unmount();
 });
});

it('keeps verification on the claim service date, displays the saved review, and notifies the claim after saving',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('billing-offices')?{items:[{id:8,name:'QA office'}]}:{checks:[],blockers:[],review:{status:'verified',created_at:'2026-11-04T20:24:26.000Z',evidence:{reference:'Synthetic portal reference'}}}}));api.post.mockResolvedValue({data:{}});
 const w=mount(Coverage,{props:{agencyId:1,clientId:2,serviceDate:'2026-11-02',billingOfficeId:8}});await flushPromises();
 expect(w.find('input[type="date"]').element.value).toBe('2026-11-02');expect(w.find('input[type="date"]').attributes('disabled')).toBeDefined();
 expect(api.get).toHaveBeenCalledWith('/medical-billing/clients/2/coverage',{params:{agencyId:1,serviceDate:'2026-11-02'},skipGlobalLoading:true});expect(w.text()).toContain('Saved review: verified');expect(w.text()).toContain('11/02/2026');expect(w.text()).toContain('Synthetic portal reference');
 expect(w.findAll('input[type="checkbox"]').every(input=>!input.element.checked)).toBe(true);
 await w.find('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/medical-billing/clients/2/coverage/review',expect.objectContaining({serviceDate:'2026-11-02'}),{skipGlobalLoading:true});expect(w.emitted('saved')).toHaveLength(1);
 await w.setProps({serviceDate:'2026-11-01',clientId:3});await flushPromises();expect(w.find('input[type="date"]').element.value).toBe('2026-11-01');w.unmount();
});

it('uses an explicitly fictional review source only with the current server capability',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('billing-offices')?{items:[]}:{checks:[],blockers:[],syntheticQaReviewAvailable:true}}));api.post.mockResolvedValue({data:{syntheticOnly:true}});
 const w=mount(Coverage,{props:{agencyId:450,clientId:22,serviceDate:'2026-11-12'}});await flushPromises();expect(w.findAll('form select')[1].element.value).toBe('synthetic_qa');expect(w.text()).toContain('Fictional QA review—no payer contact');await w.get('textarea').setValue('Owner-authorized fictional-only coverage review.');await w.get('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/medical-billing/clients/22/coverage/review',expect.objectContaining({source:'synthetic_qa'}),{skipGlobalLoading:true});expect(w.text()).toContain('No real payer contact');w.unmount();
});
it('cannot forge a fictional review in a normal coverage form without the server capability',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('billing-offices')?{items:[]}:{checks:[],blockers:[]}}));const w=mount(Coverage,{props:{agencyId:450,clientId:22}});await flushPromises();expect(w.find('option[value=synthetic_qa]').exists()).toBe(false);w.vm.$.setupState.draft.source='synthetic_qa';await w.get('form').trigger('submit');await flushPromises();expect(api.post).not.toHaveBeenCalled();expect(w.text()).toContain('unavailable for this client');w.unmount();
});

it('waits for the current coverage sources before offering a review or accepting submission',async()=>{
 let resolveCoverage;
 api.get.mockImplementation(url=>url.endsWith('billing-offices')?Promise.resolve({data:{items:[]}}):new Promise(resolve=>{resolveCoverage=resolve;}));
 const w=mount(Coverage,{props:{agencyId:450,clientId:2452}});await flushPromises();
 expect(w.text()).toContain('Loading saved coverage and verification sources');
 expect(w.find('form').exists()).toBe(false);
 await w.vm.$.setupState.review();expect(api.post).not.toHaveBeenCalled();
 resolveCoverage({data:{checks:[],blockers:[],syntheticQaReviewAvailable:true}});await flushPromises();
 expect(w.find('form').exists()).toBe(true);
 expect(w.find('option[value="synthetic_qa"]').exists()).toBe(true);
 w.unmount();
});

it('makes a fictional review available without waiting for the electronic billing-office lookup',async()=>{
 let resolveOffices;
 api.get.mockImplementation(url=>url.endsWith('billing-offices')?new Promise(resolve=>{resolveOffices=resolve;}):Promise.resolve({data:{checks:[],blockers:[],syntheticQaReviewAvailable:true}}));
 const w=mount(Coverage,{props:{agencyId:450,clientId:2452}});await flushPromises();
 expect(w.find('option[value="synthetic_qa"]').exists()).toBe(true);
 expect(w.findAll('form select')[1].element.value).toBe('synthetic_qa');
 expect(w.find('form button').attributes('disabled')).toBeUndefined();
 expect(w.findAll('button').find(b=>b.text()==='Check primary eligibility').attributes('disabled')).toBeDefined();
 resolveOffices({data:{items:[]}});await flushPromises();w.unmount();
});

it('keeps the review closed after a coverage load failure and offers a normal retry',async()=>{
 let attempts=0;
 api.get.mockImplementation(async url=>{
  if(url.endsWith('billing-offices'))return {data:{items:[]}};
  if(++attempts===1)throw {response:{data:{error:{message:'Coverage history temporarily unavailable'}}}};
  return {data:{checks:[],blockers:[],syntheticQaReviewAvailable:true}};
 });
 const w=mount(Coverage,{props:{agencyId:450,clientId:2452}});await flushPromises();
 expect(w.text()).toContain('Coverage history temporarily unavailable');expect(w.find('form').exists()).toBe(false);
 await w.findAll('button').find(b=>b.text()==='Load verification history').trigger('click');await flushPromises();
 expect(w.find('option[value="synthetic_qa"]').exists()).toBe(true);expect(api.post).not.toHaveBeenCalled();w.unmount();
});

it('discards an old client capability when coverage resolves after switching clients',async()=>{
 let resolveOld;
 api.get.mockImplementation(url=>{
  if(url.endsWith('billing-offices'))return Promise.resolve({data:{items:[]}});
  if(url.includes('/2452/'))return new Promise(resolve=>{resolveOld=resolve;});
  return Promise.resolve({data:{checks:[],blockers:[],syntheticQaReviewAvailable:false}});
 });
 const w=mount(Coverage,{props:{agencyId:450,clientId:2452}});await flushPromises();
 await w.setProps({clientId:2436});await flushPromises();
 resolveOld({data:{checks:[],blockers:[],syntheticQaReviewAvailable:true}});await flushPromises();
 expect(w.find('option[value="synthetic_qa"]').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();w.unmount();
});

it('keeps one review in flight while the saved result refreshes independently of billing offices',async()=>{
 let resolveSave,resolveRefresh,resolveOffices;let coverageReads=0,officeReads=0;
 api.get.mockImplementation(url=>{
  if(url.endsWith('billing-offices'))return ++officeReads===1?Promise.resolve({data:{items:[]}}):new Promise(resolve=>{resolveOffices=resolve;});
  if(++coverageReads===1)return Promise.resolve({data:{checks:[],blockers:[],syntheticQaReviewAvailable:true}});
  return new Promise(resolve=>{resolveRefresh=resolve;});
 });
 api.post.mockImplementation(()=>new Promise(resolve=>{resolveSave=resolve;}));
 const w=mount(Coverage,{props:{agencyId:450,clientId:2452}});await flushPromises();
 await w.get('textarea').setValue('Fictional policies reviewed, without payer contact.');
 await w.get('form').trigger('submit');await w.vm.$.setupState.review();expect(api.post).toHaveBeenCalledTimes(1);
 resolveSave({data:{syntheticOnly:true,id:48}});await flushPromises();
 expect(w.find('form').exists()).toBe(true);expect(w.get('form fieldset').attributes('disabled')).toBeDefined();await w.vm.$.setupState.review();expect(api.post).toHaveBeenCalledTimes(1);
 resolveRefresh({data:{checks:[],blockers:[],syntheticQaReviewAvailable:true}});await flushPromises();
 expect(w.emitted('saved')).toHaveLength(1);expect(w.text()).toContain('Fictional QA review recorded');
 expect(officeReads).toBe(1);w.unmount();
});

it('keeps the manual form mounted and its entered evidence while a payer result refreshes',async()=>{
 let resolveRefresh,reads=0;api.get.mockImplementation(url=>{
  if(url.endsWith('billing-offices'))return Promise.resolve({data:{items:[{id:8,name:'Office',practice_npi:'1306688650'}]}});
  return ++reads===1?Promise.resolve({data:{checks:[],blockers:[]}}):new Promise(resolve=>resolveRefresh=resolve);
 });api.post.mockResolvedValue({data:{}});
 const w=mount(Coverage,{props:{agencyId:1,clientId:2}});await flushPromises();const form=w.get('form').element,textarea=w.get('textarea').element;
 await w.get('textarea').setValue('Keep this dated payer call reference');await w.findAll('button').find(b=>b.text()==='Check primary eligibility').trigger('click');await flushPromises();
 expect(w.get('form').element).toBe(form);expect(w.get('textarea').element).toBe(textarea);expect(textarea.value).toBe('Keep this dated payer call reference');
 resolveRefresh({data:{checks:[],blockers:[]}});await flushPromises();expect(w.get('textarea').element.value).toBe('Keep this dated payer call reference');
 expect(api.get.mock.calls.filter(([url])=>url.endsWith('billing-offices'))).toHaveLength(1);w.unmount();
});
it('shows a failed check reference and actual setup explanation without erasing manual evidence',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('billing-offices')?{items:[{id:8,name:'Office',practice_npi:'1306688650'}]}:{checks:[],blockers:[]}}));
 api.post.mockRejectedValue({response:{data:{error:{code:'CLAIM_MD_ACCOUNT_SETUP',message:'The account connection needs attention.',coverageCheckId:81,upstreamCodes:['100']}}}});
 const w=mount(Coverage,{props:{agencyId:1,clientId:2}});await flushPromises();await w.get('textarea').setValue('Manual reference preserved');await w.findAll('button').find(b=>b.text()==='Check primary eligibility').trigger('click');await flushPromises();
 expect(w.text()).toContain('account connection');expect(w.text()).toContain('Check #81');expect(w.text()).toContain('Claim.MD code: 100');expect(w.get('textarea').element.value).toBe('Manual reference preserved');w.unmount();
});
it('shows automatic queue status and prevents duplicate manual checks while it is running',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('billing-offices')?{items:[{id:8,name:'Office',practice_npi:'1306688650'}]}:{checks:[],blockers:[],automaticEligibility:{status:'pending',message:'Automatic Claim.MD verification is queued.'}}}));
 const w=mount(Coverage,{props:{agencyId:1,clientId:2}});await flushPromises();expect(w.text()).toContain('Automatic Claim.MD verification is queued');await w.vm.$.setupState.check('primary');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
