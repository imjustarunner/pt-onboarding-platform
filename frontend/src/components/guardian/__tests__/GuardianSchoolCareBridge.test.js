import {describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import api from '../../../services/api';
import Bridge from '../GuardianSchoolCareBridge.vue';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const schools=[{organization_id:20,name:'Current School',status:'current',providers:[{name:'Taylor Provider',service_day:'Wednesday',status:'current'}],staff:[{name:'Robin Staff',status:'current',access_level:'roi'}],roi:{status:'issued'}},{organization_id:19,name:'Previous School',status:'former',providers:[{name:'Old Provider',service_day:'Monday',status:'former'}],staff:[{name:'Old Staff',status:'former'}],roi:{status:'completed',signed_at:'2025-09-10',document_id:42}}];
describe('SchoolCareBridge family view',()=>{
 it('shows the school service day, provider, ROI and included staff',()=>{
  const w=mount(Bridge,{props:{schools,clientId:8}});expect(w.text()).toContain('Wednesday');expect(w.text()).toContain('Taylor Provider');expect(w.text()).toContain('Robin Staff');expect(w.text()).toContain('Awaiting signature');expect(w.text()).not.toContain('Old Provider');
 });
 it('labels former schools and providers while retaining their signed ROI access',()=>{
  const w=mount(Bridge,{props:{schools,schoolId:19,clientId:8}});expect(w.text()).toContain('Former school');expect(w.text()).toContain('Previous assignment');expect(w.text()).toContain('Old Staff');expect(w.text()).toContain('Open my signed ROI');expect(w.text()).not.toContain('Taylor Provider');
 });
 it('opens the signed ROI through the authorized client document endpoint',async()=>{
  api.get.mockResolvedValueOnce({data:{url:'https://storage.googleapis.com/test/roi.pdf'}});
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  const w=mount(Bridge,{props:{schools,schoolId:19,clientId:8}});
  await w.findAll('button').find(b=>b.text()==='Open my signed ROI').trigger('click');await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/guardian-portal/clients/8/intake-documents/42/download-url');expect(click).toHaveBeenCalled();click.mockRestore();w.unmount();
 });
 it('switches school context and returns to the client care dashboard',async()=>{
  const w=mount(Bridge,{props:{schools,clientId:8}});await w.get('select').setValue('19');expect(w.emitted('update:schoolId')[0]).toEqual([19]);await w.get('.return-care').trigger('click');expect(w.emitted('navigate')[0]).toEqual(['overview']);
 });
});
