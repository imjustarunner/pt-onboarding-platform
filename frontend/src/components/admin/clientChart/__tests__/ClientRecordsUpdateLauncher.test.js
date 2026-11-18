import {beforeEach,it,expect,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({post:vi.fn()}));vi.mock('../../../../services/api',()=>({default:m}));
import Launcher from '../ClientRecordsUpdateLauncher.vue';
beforeEach(()=>{vi.clearAllMocks();m.post.mockResolvedValue({data:{progress:{status:'pending',selectedSections:['contacts','insurance']}}});});
it('opens only the selected areas without importing or clearing other records',async()=>{
 const w=mount(Launcher,{props:{clientId:7,agencyId:2,accountAccess:true}});await w.get('button').trigger('click');expect(w.findAll('input[type=checkbox]').every(box=>!box.element.checked)).toBe(true);
 await w.get('input[value=contacts]').setValue(true);await w.get('input[value=insurance]').setValue(true);await w.findAll('button').find(b=>b.text()==='Update selected areas').trigger('click');await flushPromises();expect(m.post).toHaveBeenCalledExactlyOnceWith('/clients/7/chart-import/start',{sections:[],selectedSections:['contacts','insurance']},expect.anything());expect(w.emitted('started')[0][0]).toMatchObject({status:'pending'});w.unmount();
});
it('limits billing choices to account staff and retains selected areas after a failed start',async()=>{
 m.post.mockRejectedValue({response:{data:{error:{message:'Please retry'}}}});const w=mount(Launcher,{props:{clientId:7,agencyId:2,accountAccess:false}});await w.get('button').trigger('click');expect(w.find('input[value=insurance]').exists()).toBe(false);await w.get('input[value=contacts]').setValue(true);await w.findAll('button').find(b=>b.text()==='Update selected areas').trigger('click');await flushPromises();expect(w.get('[role=alert]').text()).toBe('Please retry');expect(w.get('input[value=contacts]').element.checked).toBe(true);w.unmount();
});
