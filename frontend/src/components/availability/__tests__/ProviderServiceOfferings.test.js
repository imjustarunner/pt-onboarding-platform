import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Services from '../ProviderServiceOfferings.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
const data={agencyId:2,agencyName:'Next Level Up',services:[{serviceType:'counseling',displayName:'Counseling',offered:true},{serviceType:'tutoring',displayName:'Tutoring',offered:false}]};
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data});});
describe('agency service selections',()=>{
 it('saves counseling and tutoring together without changing booking settings',async()=>{
  const w=mount(Services,{props:{providerId:9,agencyId:2}});await flushPromises();
  expect(w.text()).toContain('Next Level Up');await w.findAll('input')[1].setValue(true);
  api.put.mockResolvedValue({data:{...data,services:data.services.map(s=>({...s,offered:true}))}});
  await w.find('button').trigger('click');await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/availability/providers/9/services',{agencyId:2,services:['counseling','tutoring']},expect.any(Object));
  expect(w.findAll('input').every(i=>i.element.checked)).toBe(true);expect(w.emitted('updated')).toHaveLength(1);w.unmount();
 });
 it('does not replace the new agency with a stale response',async()=>{
  let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const w=mount(Services,{props:{providerId:9,agencyId:2}});
  api.get.mockResolvedValue({data:{agencyId:3,agencyName:'Other agency',services:[]}});
  await w.setProps({agencyId:3});await flushPromises();resolve({data});await flushPromises();
  expect(w.text()).toContain('Other agency');expect(w.text()).not.toContain('Next Level Up');w.unmount();
 });
 it('allows all services to be removed and retains edits on failure',async()=>{
  const w=mount(Services,{props:{providerId:9,agencyId:2}});await flushPromises();await w.findAll('input')[0].setValue(false);
  api.put.mockRejectedValue({response:{data:{error:{message:'Not permitted'}}}});await w.find('button').trigger('click');await flushPromises();
  expect(api.put.mock.calls[0][1].services).toEqual([]);expect(w.find('[role=alert]').text()).toBe('Not permitted');expect(w.emitted('updated')).toBeUndefined();w.unmount();
 });
});
