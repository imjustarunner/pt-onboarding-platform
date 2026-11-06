import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import ServiceInformation from '../ServiceInformation.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const info={code:'H2011',title:'Crisis intervention',status:'available',serviceDescription:'Immediate crisis stabilization',documentation:'Document response and plan',providerQualifications:'QBHA · Bach Level',ageGroups:'All ages',placesOfService:'11 Office',source:{title:'October 2026 SBHS Manual',effectiveDate:'2026-10-01',pages:[80]},reviewNotice:'Verify agency and payer requirements',manualText:'Source service documentation',crisisReview:{message:'At248 minutes review S9485; no automatic substitution'}};
async function expand(wrapper){wrapper.element.open=true;await wrapper.trigger('toggle');await flushPromises();}
beforeEach(()=>vi.resetAllMocks());
describe('service information',()=>{
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
 it('marks services absent from the supplied handbook without inventing restrictions',async()=>{
  const wrapper=mount(ServiceInformation,{props:{serviceInfo:{...info,code:'99051',status:'not-in-supplied-manual',note:'Not in supplied SBHS manual',source:{...info.source,pages:[]}}}});await expand(wrapper);
  expect(wrapper.text()).toContain('Not in supplied SBHS manual');expect(wrapper.text()).not.toContain('Page 80');wrapper.unmount();
 });
});
