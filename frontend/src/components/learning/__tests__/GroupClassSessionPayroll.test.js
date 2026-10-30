import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import GroupClassSessionRoom from '../GroupClassSessionRoom.vue';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
let wrapper;
beforeEach(()=>{
 vi.clearAllMocks();
 m.get.mockImplementation(async url=>({data:url.endsWith('/slides')?{slides:[]}:url.endsWith('/activity')?{activity:[]}:{session:{id:90,title:'Homework Help',status:'ended',session_subtype:'tutoring'},canModerate:true,actorRole:'presenter'}}));
 m.post.mockResolvedValue({data:{payrollWarning:'Confirm the assigned rate'}});
});
afterEach(()=>wrapper?.unmount());
it('allows reviewing ended-session payroll without offering to restart the visit and displays review issues',async()=>{
 wrapper=mount(GroupClassSessionRoom,{props:{sessionId:90}});await flushPromises();
 expect(wrapper.text()).not.toContain('Start live');
 const button=wrapper.findAll('button').find(b=>b.text()==='Review session payroll');
 expect(button).toBeDefined();await button.trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/learning-class-sessions/sessions/90/end',{},expect.any(Object));
 expect(wrapper.text()).toContain('Payroll needs review: Confirm the assigned rate');
});
it('keeps an unsuccessful retry visible for correction',async()=>{
 m.post.mockRejectedValueOnce(new Error('Payroll review unavailable'));
 wrapper=mount(GroupClassSessionRoom,{props:{sessionId:90}});await flushPromises();
 await wrapper.findAll('button').find(b=>b.text()==='Review session payroll').trigger('click');await flushPromises();
 expect(wrapper.text()).toContain('Payroll review unavailable');
 expect(wrapper.findAll('button').find(b=>b.text()==='Review session payroll').attributes('disabled')).toBeUndefined();
});
