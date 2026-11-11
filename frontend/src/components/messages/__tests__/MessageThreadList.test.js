import { describe,expect,it } from 'vitest';
import { mount } from '@vue/test-utils';
import MessageThreadList from '../MessageThreadList.vue';
describe('named direct message groups',()=>{
 it('uses the event name for group labels, search and selection instead of replacing it with participant names',async()=>{
  const eventGroup={thread_id:42,thread_type:'group',thread_label:'Our two-year anniversary',participants:[{first_name:'Alice',last_name:'Adams'},{first_name:'Beth',last_name:'Brooks'}],updated_at:'2026-11-11T10:00:00Z'};
  const wrapper=mount(MessageThreadList,{props:{threads:[eventGroup,{thread_id:43,thread_type:'direct',other_participant:{first_name:'Other',last_name:'Person'}}]},global:{stubs:{UserAvatar:true}}});
  expect(wrapper.findAll('.thread-name').map(p=>p.text())).toContain('Our two-year anniversary');expect(wrapper.text()).not.toContain('Alice Adams, Beth Brooks');
  await wrapper.find('input[type=search]').setValue('anniversary');expect(wrapper.findAll('li')).toHaveLength(1);expect(wrapper.find('.thread-badge').text()).toBe('Group');
  await wrapper.find('li').trigger('click');expect(wrapper.emitted('select')[0][0]).toEqual(eventGroup);wrapper.unmount();
 });
});
