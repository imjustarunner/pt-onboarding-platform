import {beforeEach,describe,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import Panel from '../CompensationDraftsPanel.vue';
const policy={childcare:{category1:[17,18,19,20,20],category2AndAbove:[22,23,24,24,24],additionalChildAmounts:[0,4,6,8]},tutoring:{category1:[17,18,19,20,20],category2Virtual:[18,20,21,25,30],category2InPerson:[19,21,23,27,33]}};
let detail;
beforeEach(()=>{vi.clearAllMocks();detail={id:10,issues:[],html:'<p>Saved NLU terms</p>',data:{employee:{userId:1496,name:'QA employee',originalAgreementDate:'2026-10-01'},effectiveDate:'2026-11-21',schedule:{nluCompensationPolicyVersion:'nlu-four-category-2026-11-21',category:2,level:3,childcareLevel:3,childcareRatesByBand:{2:30},tutoringLevel:4},additionalTerms:'',commonClausesHtml:''}};api.get.mockImplementation(async url=>({data:url==='/provider-update/compensation-drafts'?{drafts:[{id:10,name:'QA employee',category:2,level:3,issues:[]}]}:url==='/contract-generator/library'?{serviceCompensation:policy,compensationCategories:{1:{label:'Foundational'},2:{label:'Bachelor'},3:{label:'Master'},4:{label:'Advanced licensed'}}}:structuredClone(detail)}));api.put.mockImplementation(async(_url,body)=>({data:{...detail,data:{...detail.data,schedule:body.schedule,effectiveDate:body.effectiveDate||detail.data.effectiveDate}}}));});
const render=()=>mount(Panel,{props:{agencyId:453},global:{stubs:{DraftHtmlEditor:true}}});
it('opens a saved amendment reference without replacing its iframe or unsaved individual rates',async()=>{
 const original=api.get.getMockImplementation();
 const reference={agency:{id:453,name:'NLU QA'},document:{title:'NLU Workplace Handbook'},version:{id:18,number:2},section:{slug:'direct-care-automatic-indirect-correction',title:'Automatic indirect pay',bodyHtml:'<p>Published allowance.</p>'},location:[{title:'Compensation'},{title:'Automatic indirect pay'}],metadata:{presentation:{agencyBrand:{agencyId:453,primary:'#6FCFBE',secondary:'#1F2A44',accent:'#9FB7A5'}}}};
 api.get.mockImplementation(async(url,...args)=>url==='/provider-update/handbook/reference'?{data:{reference}}:original(url,...args));
 const wrapper=mount(Panel,{props:{agencyId:453},attachTo:document.body,global:{stubs:{DraftHtmlEditor:true,Teleport:true}}});
 await flushPromises();await wrapper.get('aside button').trigger('click');await flushPromises();
 await wrapper.get('[aria-label="2-child hourly-rate override"]').setValue('44.50');
 const iframe=wrapper.get('iframe').element;
 window.dispatchEvent(new MessageEvent('message',{origin:'null',source:iframe.contentWindow,data:{type:'contract-handbook-reference',agencyId:453,sectionSlug:'direct-care-automatic-indirect-correction',expectedVersionId:18,sectionTitle:'Automatic indirect pay'}}));await flushPromises();
 expect(wrapper.get('[role=dialog]').text()).toContain('Published allowance.');
 expect(wrapper.get('[role=dialog]').text()).toContain('Version 2');
 await wrapper.get('[aria-label="Close handbook reference"]').trigger('click');await flushPromises();
 expect(wrapper.find('[role=dialog]').exists()).toBe(false);expect(wrapper.get('iframe').element).toBe(iframe);
 expect(wrapper.get('[aria-label="2-child hourly-rate override"]').element.value).toBe('44.50');
 expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();wrapper.unmount();wrapper.element.remove();
});
it('edits NLU four-category childcare overrides and prospective date through the existing draft save',async()=>{const wrapper=render();await flushPromises();await wrapper.get('aside button').trigger('click');await flushPromises();expect(wrapper.get('.fields select').findAll('option')).toHaveLength(5);expect(wrapper.text()).not.toContain('October 10, 2026');expect(wrapper.text()).toContain('Virtual tutoring: $25.00');expect(api.get).toHaveBeenCalledWith('/contract-generator/library',{params:{agencyId:453}});await wrapper.get('.fields select').setValue('4');await wrapper.get('[aria-label="2-child hourly-rate override"]').setValue('44.50');await wrapper.get('input[type=date]').setValue('2026-11-25');expect(wrapper.get('[data-testid=childcare-resolved-2]').text()).toBe('$44.50');await wrapper.get('.actions button').trigger('click');await flushPromises();expect(api.put).toHaveBeenCalledWith('/provider-update/compensation-drafts/10',expect.objectContaining({agencyId:453,effectiveDate:'2026-11-25',schedule:expect.objectContaining({category:4,childcareLevel:3,childcareRatesByBand:{2:'44.50'}})}));expect(api.post).not.toHaveBeenCalled();wrapper.unmount();});
it('retains the legacy three-category editor and does not reinterpret an unversioned schedule',async()=>{delete detail.data.schedule.nluCompensationPolicyVersion;const wrapper=render();await flushPromises();await wrapper.get('aside button').trigger('click');await flushPromises();expect(wrapper.get('.fields select').findAll('option')).toHaveLength(4);expect(wrapper.text()).toContain('October 10, 2026');expect(wrapper.find('.nlu-service-placements').exists()).toBe(false);expect(api.get.mock.calls.some(([url])=>url==='/contract-generator/library')).toBe(false);await wrapper.get('.actions button').trigger('click');await flushPromises();expect(api.put.mock.calls[0][1]).not.toHaveProperty('effectiveDate');wrapper.unmount();});
it('preserves individual overrides and gives an actionable default-policy error',async()=>{const initial=api.get.getMockImplementation();api.get.mockImplementation(async(url,...args)=>{if(url==='/contract-generator/library')throw new Error('Unavailable');return initial(url,...args);});const wrapper=render();await flushPromises();await wrapper.get('aside button').trigger('click');await flushPromises();expect(wrapper.get('[aria-label="2-child hourly-rate override"]').element.value).toBe('30');expect(wrapper.get('[data-testid=childcare-resolved-2]').text()).toBe('$30.00');expect(wrapper.text()).toContain('Approved default service rates could not be loaded');wrapper.unmount();});

describe('preparing an individual employee draft',()=>{
 let options,created;
 const start=async wrapper=>{await flushPromises();await wrapper.get('.create-draft > button').trigger('click');};
 const field=(wrapper,label,type='select')=>wrapper.findAll('.create-draft label').find(node=>node.element.firstChild.textContent.trim()===label).get(type);
 const choose=async(wrapper,{agreementType='initial',reference=''}={})=>{
  await field(wrapper,'Employee').setValue('1496');
  await field(wrapper,'Employee update').setValue('20');
  await field(wrapper,'Authorized agency signer').setValue('1435');
  await field(wrapper,'Prospective effective date','input').setValue('2026-11-25');
  await field(wrapper,'Agreement type').setValue(agreementType);
  if(reference)await field(wrapper,'Prior agreement reference','input').setValue(reference);
 };
 beforeEach(()=>{
  options={enabled:true,minimumEffectiveDate:'2026-11-21',employees:[{id:1496,name:'Finley QA',role:'provider',hasSignedAgreement:false}],countersigners:[{id:1435,name:'Authorized QA signer',role:'admin'},{id:1496,name:'Finley QA',role:'provider'}],pushes:[{id:20,title:'NLU employee update'}],serviceCompensation:policy,categories:{1:{label:'Foundational'},2:{label:'Bachelor'},3:{label:'Master'},4:{label:'Advanced licensed'}}};
  created={...structuredClone(detail),issues:['Confirm the approved childcare rate schedule.'],data:{...structuredClone(detail.data),initialAgreement:true,pushId:20,employee:{userId:1496,name:'Finley QA',originalAgreementDate:''},schedule:{...detail.data.schedule,clinicalEligible:false,serviceRoles:['tutoring','childcare'],tutoringRates:{virtual:31,in_person:34},childcareRatesByBand:{1:27,2:31,3:33,4:35}}}};
  const original=api.get.getMockImplementation();
  api.get.mockImplementation(async(url,...args)=>url==='/provider-update/compensation-drafts/options'?{data:structuredClone(options)}:original(url,...args));
  api.post.mockImplementation(async()=>({data:structuredClone(created)}));
 });
 it('requires explicit employee, update, signer and agreement choices before a draft can be prepared',async()=>{
  const wrapper=render();await start(wrapper);
  expect(api.get).toHaveBeenCalledWith('/provider-update/compensation-drafts/options',{params:{agencyId:453}});
  const submit=wrapper.get('.create-draft button[type=submit]');expect(submit.attributes('disabled')).toBeDefined();
  await field(wrapper,'Employee').setValue('1496');
  expect(field(wrapper,'Authorized agency signer').findAll('option').map(option=>option.element.value)).not.toContain('1496');
  await submit.trigger('click');expect(api.post).not.toHaveBeenCalled();wrapper.unmount();
 });
 it('creates only a scoped draft then opens the existing editor without release, signatures or payroll activation',async()=>{
  const wrapper=render();await start(wrapper);await choose(wrapper);
  await wrapper.get('.create-draft form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/provider-update/compensation-drafts',{agencyId:453,userId:1496,pushId:20,countersignerUserId:1435,effectiveDate:'2026-11-25',initialAgreement:true});
  expect(wrapper.get('article h3').text()).toBe('Finley QA');
  expect(wrapper.text()).toContain('Initial compensation schedule.');
  expect(wrapper.text()).toContain('Proposed service roles: tutoring, childcare');
  expect(wrapper.text()).toContain('Virtual tutoring: $31.00 / hour · In person: $34.00 / hour.');
  expect(wrapper.get('[data-testid=childcare-resolved-4]').text()).toBe('$35.00');
  expect(wrapper.findAll('label').some(label=>label.text().startsWith('Prior agreement date or reference'))).toBe(false);
  expect(wrapper.findAll('.fields label').some(label=>label.text().startsWith('Clinical Session Rate'))).toBe(false);
  expect(wrapper.get('.release button').attributes('disabled')).toBeDefined();
  expect(api.put).not.toHaveBeenCalled();wrapper.unmount();
 });
 it('saves childcare changes with the expected preview while preserving unrelated tutoring terms',async()=>{
  const wrapper=render();await start(wrapper);await choose(wrapper);
  await wrapper.get('.create-draft form').trigger('submit');await flushPromises();
  await wrapper.get('[aria-label="3-child hourly-rate override"]').setValue('39.50');
  await wrapper.get('article .actions button').trigger('click');await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/provider-update/compensation-drafts/10',expect.objectContaining({agencyId:453,expectedHtml:'<p>Saved NLU terms</p>',schedule:expect.objectContaining({serviceRoles:['tutoring','childcare'],tutoringRates:{virtual:31,in_person:34},childcareRatesByBand:{1:27,2:31,3:'39.50',4:35}})}));
  expect(api.post).toHaveBeenCalledTimes(1);wrapper.unmount();
 });
 it('requires a real reference for an amendment when no saved agreement exists',async()=>{
  const wrapper=render();await start(wrapper);await choose(wrapper,{agreementType:'amendment'});
  expect(wrapper.get('.create-draft button[type=submit]').attributes('disabled')).toBeDefined();
  await field(wrapper,'Prior agreement reference','input').setValue('Existing paper agreement — verified by staff');
  await wrapper.get('.create-draft form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/provider-update/compensation-drafts',expect.objectContaining({initialAgreement:false,priorAgreementReference:'Existing paper agreement — verified by staff'}));wrapper.unmount();
 });
 it('opens a reused amendment and its prior source without resetting saved terms',async()=>{
  options.employees[0].hasSignedAgreement=true;created.reused=true;created.data.initialAgreement=false;created.data.source={priorAgreement:{id:80,agreementDate:'2026-10-01',effectiveOn:'2026-10-10'}};
  const wrapper=render();await start(wrapper);await choose(wrapper,{agreementType:'amendment'});
  expect(field(wrapper,'Agreement type').get('option[value=initial]').attributes('disabled')).toBeDefined();
  await wrapper.get('.create-draft form').trigger('submit');await flushPromises();
  expect(wrapper.text()).toContain('Preserved prior agreement 80');expect(wrapper.text()).toContain('2026-10-01');expect(wrapper.text()).toContain('Existing draft opened without replacing its terms.');
  expect(wrapper.get('[aria-label="2-child hourly-rate override"]').element.value).toBe('31');expect(api.put).not.toHaveBeenCalled();wrapper.unmount();
 });
 it('preserves form choices after a rejected creation and never falls back to another agency',async()=>{
  api.post.mockRejectedValue({response:{status:403,data:{error:{message:'Signer is not authorized for this agency.'}}}});
  const wrapper=render();await start(wrapper);await choose(wrapper);
  await wrapper.get('.create-draft form').trigger('submit');await flushPromises();
  expect(wrapper.text()).toContain('Signer is not authorized for this agency.');expect(field(wrapper,'Employee').element.value).toBe('1496');expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][1].agencyId).toBe(453);wrapper.unmount();
 });
 it('does not open a completed creation response in a different agency after context changes',async()=>{
  let resolve;api.post.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  const wrapper=render();await start(wrapper);await choose(wrapper);
  await wrapper.get('.create-draft form').trigger('submit');await wrapper.setProps({agencyId:454});
  resolve({data:created});await flushPromises();
  expect(wrapper.find('article').exists()).toBe(false);expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][1].agencyId).toBe(453);wrapper.unmount();
 });
 it('keeps existing draft review available when creation options cannot be loaded',async()=>{
  const original=api.get.getMockImplementation();api.get.mockImplementation(async(url,...args)=>{if(url.endsWith('/options'))throw new Error('Unavailable');return original(url,...args);});
  const wrapper=render();await flushPromises();expect(wrapper.text()).toContain('Individual draft setup is unavailable.');
  await wrapper.get('aside button').trigger('click');await flushPromises();expect(wrapper.get('article h3').text()).toBe('QA employee');expect(wrapper.find('.create-draft').exists()).toBe(false);wrapper.unmount();
 });
 it('prefers preserved individual format fields at a nonclinical advanced category',async()=>{
  created.data.schedule={...created.data.schedule,category:4,clinicalEligible:false,tutoringRates:undefined,tutoringVirtualRate:42,tutoringInPersonRate:46,tutoringHourlyRate:40};
  const wrapper=render();await start(wrapper);await choose(wrapper);await wrapper.get('.create-draft form').trigger('submit');await flushPromises();
  expect(wrapper.text()).toContain('Virtual tutoring: $42.00 / hour · In person: $46.00 / hour.');expect(wrapper.findAll('.fields label').some(label=>label.text().startsWith('Clinical Session Rate'))).toBe(false);wrapper.unmount();
 });
 it('uses the separately approved tutoring category without reclassifying the employee’s other service terms',async()=>{
  created.data.schedule={...created.data.schedule,category:4,tutoringCategory:1,tutoringLevel:3,tutoringRates:undefined,clinicalEligible:false};
  const wrapper=render();await start(wrapper);await choose(wrapper);await wrapper.get('.create-draft form').trigger('submit');await flushPromises();
  expect(wrapper.text()).toContain('Virtual tutoring: $19.00 / hour · In person: $19.00 / hour.');
  await wrapper.get('[aria-label="1-child hourly-rate override"]').setValue('28');await wrapper.get('article .actions button').trigger('click');await flushPromises();
  expect(api.put.mock.calls[0][1].schedule).toMatchObject({category:4,tutoringCategory:1,tutoringLevel:3});wrapper.unmount();
 });
 it('prevents a second create while the original response is pending',async()=>{
  let resolve;api.post.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  const wrapper=render();await start(wrapper);await choose(wrapper);
  await wrapper.get('.create-draft form').trigger('submit');await wrapper.get('.create-draft form').trigger('submit');
  expect(api.post).toHaveBeenCalledTimes(1);resolve({data:created});await flushPromises();wrapper.unmount();
 });
 it('requires saving current edits before preparing another employee’s draft',async()=>{
  const wrapper=render();await flushPromises();await wrapper.get('aside button').trigger('click');await flushPromises();
  await wrapper.get('[aria-label="2-child hourly-rate override"]').setValue('44');
  expect(wrapper.get('.create-draft > button').attributes('disabled')).toBeDefined();expect(wrapper.text()).toContain('Save the current draft before preparing another employee');expect(api.post).not.toHaveBeenCalled();wrapper.unmount();
 });
});
