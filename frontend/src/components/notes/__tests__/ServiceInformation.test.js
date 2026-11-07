import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises,DOMWrapper} from '@vue/test-utils';
import ServiceInformation from '../ServiceInformation.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const info={code:'H2011',title:'Crisis intervention',status:'available',serviceDescription:'Immediate crisis stabilization',documentation:'Document response and plan',providerQualifications:'QBHA · Bach Level',ageGroups:'All ages',placesOfService:'11 Office',source:{title:'October 2026 SBHS Manual',edition:'October 2026',effectiveDate:'2026-10-01',pages:[80]},reviewNotice:'Verify agency and payer requirements',manualText:'Source service documentation',crisisReview:{message:'At248 minutes review S9485; no automatic substitution'}};
async function expand(wrapper){wrapper.element.open=true;await wrapper.trigger('toggle');await flushPromises();}
beforeEach(()=>vi.resetAllMocks());
describe('service information',()=>{
 it('places sourced provider qualifications and billing types before lengthy documentation',async()=>{
  const wrapper=mount(ServiceInformation,{props:{serviceInfo:{...info,providerTypesThatCanBill:'01, 02, 05, 77/389'}}});await expand(wrapper);
  const labels=wrapper.findAll('dt').map(node=>node.text());expect(labels.slice(0,2)).toEqual(['Listed provider qualifications','Provider types that can bill (manual)']);
  expect(wrapper.text()).toContain('QBHA · Bach Level');expect(wrapper.text()).toContain('01, 02, 05, 77/389');expect(wrapper.text()).toContain('Page 80');wrapper.unmount();
 });
 it('loads only when expanded and passes company scope',async()=>{
  api.get.mockResolvedValue({data:{serviceInfo:info}});const wrapper=mount(ServiceInformation,{props:{serviceCode:'H2011',agencyId:5,apiClient:api}});
  expect(api.get).not.toHaveBeenCalled();await expand(wrapper);
  expect(api.get).toHaveBeenCalledWith('/medical-billing/service-reference/H2011',{params:{agencyId:5}});
  expect(wrapper.text()).toContain('QBHA · Bach Level');expect(wrapper.text()).toContain('Page 80');
  wrapper.unmount();
 });
 it('uses provided mobile context without attempting full-workspace authentication',async()=>{
  const wrapper=mount(ServiceInformation,{props:{serviceCode:'H2011',serviceInfo:info}});await expand(wrapper);
  expect(api.get).not.toHaveBeenCalled();expect(wrapper.text()).toContain('Document response and plan');wrapper.unmount();
 });
 it('escapes manual text instead of rendering supplied markup',async()=>{
  const wrapper=mount(ServiceInformation,{props:{serviceInfo:{...info,manualText:'<script>bad()</script><img src=x onerror=bad()>'}}});await expand(wrapper);
  expect(wrapper.find('script').exists()).toBe(false);expect(wrapper.find('img').exists()).toBe(false);expect(wrapper.text()).toContain('<script>');wrapper.unmount();
 });
 it('preserves a clear unavailable state and permits retry',async()=>{
  api.get.mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce({data:{serviceInfo:info}});
  const wrapper=mount(ServiceInformation,{props:{serviceCode:'H2011',agencyId:5,apiClient:api}});await expand(wrapper);
  expect(wrapper.find('[role=alert]').text()).toContain('could not be verified');await wrapper.find('button').trigger('click');await flushPromises();
  expect(wrapper.text()).toContain('Crisis intervention');wrapper.unmount();
 });
 it('does not show stale manual details when the selected service changes mid-request',async()=>{
  let resolve;api.get.mockImplementationOnce(()=>new Promise(done=>{resolve=done})).mockResolvedValueOnce({data:{serviceInfo:{...info,code:'H0004',title:'Counseling'}}});
  const wrapper=mount(ServiceInformation,{props:{serviceCode:'H2011',agencyId:5,apiClient:api}});await expand(wrapper);await wrapper.setProps({serviceCode:'H0004'});await flushPromises();
  resolve({data:{serviceInfo:info}});await flushPromises();expect(wrapper.text()).toContain('Counseling');expect(wrapper.find('h4').text()).not.toContain('Crisis');wrapper.unmount();
 });
 it('opens a viewport-bounded source panel and restores focus on close without changing the selected service',async()=>{
  const wrapper=mount(ServiceInformation,{attachTo:document.body,props:{presentation:'button',serviceCode:'H2011',serviceInfo:info}});const trigger=wrapper.get('button[aria-expanded]');
  expect(trigger.attributes('aria-label')).toBe('Service information for H2011');expect(document.querySelector('[role=region]')).toBeNull();await trigger.trigger('click');await flushPromises();const region=new DOMWrapper(document.querySelector('[role=region]'));expect(trigger.attributes('aria-expanded')).toBe('true');expect(document.activeElement).toBe(region.element);expect(parseFloat(region.element.style.left)).toBeGreaterThanOrEqual(16);expect(region.text()).toContain('October 2026');expect(region.text()).toContain('Page 80');expect(region.text()).toContain('Document response and plan');window.dispatchEvent(new Event('resize'));await flushPromises();expect(region.element.style.left).toBe('16px');
  await region.trigger('keydown',{key:'Escape'});await flushPromises();expect(trigger.attributes('aria-expanded')).toBe('false');expect(document.activeElement).toBe(trigger.element);expect(api.get).not.toHaveBeenCalled();wrapper.unmount();
 });
 it('distinguishes agency supplemental policy from a PDF handbook entry and never invents its page',async()=>{
  const policy={...info,code:'99051',title:'After-hours service',status:'supplemental-policy',policyKind:'addon',manualText:null,source:{kind:'user_agency_policy',id:'agency-after-hours',version:'2026-11-06',hash:'policy-hash',title:'Approved agency after-hours policy',edition:'November 2026',effectiveDate:'2026-11-06',pages:[80]},requirements:[{id:'timing',text:'Check actual local session start.'}]};
  const wrapper=mount(ServiceInformation,{props:{serviceInfo:policy}});await expand(wrapper);expect(wrapper.text()).toContain('Agency supplemental policy · Add-on service');expect(wrapper.text()).toContain('Approved agency after-hours policy');expect(wrapper.text()).toContain('Policy version 2026-11-06');expect(wrapper.text()).toContain('Check actual local session start.');expect(wrapper.text()).not.toContain('Page 80');expect(wrapper.text()).not.toContain('Supplied service handbook');wrapper.unmount();
 });
 it('shows unverified sources as unavailable rather than presenting unsourced restrictions',async()=>{
  const wrapper=mount(ServiceInformation,{props:{serviceInfo:{...info,code:'97535',status:'not-in-supplied-manual',note:'An approved handbook entry is unavailable.'}}});await expand(wrapper);expect(wrapper.text()).toContain('Source unavailable');expect(wrapper.text()).not.toContain('Immediate crisis stabilization');expect(wrapper.text()).not.toContain('Page 80');wrapper.unmount();
 });
 it('marks services absent from the supplied handbook without inventing restrictions',async()=>{
  const wrapper=mount(ServiceInformation,{props:{serviceInfo:{...info,code:'99051',status:'not-in-supplied-manual',note:'Not in supplied SBHS manual',source:{...info.source,pages:[]}}}});await expand(wrapper);
  expect(wrapper.text()).toContain('Not in supplied SBHS manual');expect(wrapper.text()).not.toContain('Page 80');wrapper.unmount();
 });
});
