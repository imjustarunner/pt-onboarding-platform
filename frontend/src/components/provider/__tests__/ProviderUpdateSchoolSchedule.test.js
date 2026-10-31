import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import SchoolSchedule from '../ProviderUpdateSchoolSchedule.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
const school={schoolOrganizationId:451,schoolName:'Cedar Grove',days:[{assignmentId:731,dayOfWeek:'Monday',startTime:'09:00',endTime:'13:00',slotsTotal:4,clientCount:3}]};
let wrapper;
const render=async(props={})=>{wrapper=mount(SchoolSchedule,{props:{base:'/provider-update/me',agencyId:450,schoolId:451,initialAssignmentId:731,requestChange:true,hideComplete:true,...props}});await flushPromises();return wrapper;};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{schools:[school],pending:[]}});api.post.mockResolvedValue({data:{ok:true,request:{id:99}}});});
afterEach(()=>wrapper?.unmount());
it('keeps the school-block change request available independently of an annual update and preserves approved values',async()=>{
 const w=await render();
 expect(w.text()).toContain('at any time');expect(w.find('fieldset').exists()).toBe(true);
 await w.get('input[type=number]').setValue(5);await w.findAll('button').find(b=>b.text()==='Submit change for approval').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/provider-update/me/school-assignments/731/request',expect.objectContaining({agencyId:450,slotsTotal:5,startTime:'09:00',endTime:'13:00',moveToDay:'Monday'}));
 expect(w.text()).toContain('Your current school hours remain reserved until it is approved');expect(w.text()).toContain('4 client spots');
});
it('does not let an on-behalf read-only schedule submit a change',async()=>{
 const w=await render({readonly:true});
 expect(w.find('fieldset').exists()).toBe(false);expect(w.findAll('button')[0].attributes('disabled')).toBeDefined();expect(api.post).not.toHaveBeenCalled();
});
