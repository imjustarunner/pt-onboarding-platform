import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const state=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{post:state.post}}));
import Preview from '../InterviewInvitePreview.vue';
let wrapper;
beforeEach(()=>vi.clearAllMocks());afterEach(()=>wrapper?.unmount());
it('reports sender preview failure to the scheduling form and permits explicit rechecking',async()=>{
  state.post.mockRejectedValue({response:{data:{error:{message:'Sender unavailable'}}}});
  wrapper=mount(Preview,{props:{agencyId:463,candidateUserId:9}});await wrapper.get('button').trigger('click');await flushPromises();
  expect(wrapper.get('[role=alert]').text()).toBe('Sender unavailable');expect(wrapper.emitted('availability')).toEqual([[false]]);
  state.post.mockResolvedValue({data:{data:{from:'verified@example.test',subject:'QA',html:'<p>QA</p>'}}});
  await wrapper.get('button').trigger('click');await flushPromises();expect(wrapper.emitted('availability').at(-1)).toEqual([true]);
});
it('invalidates readiness when the recipient changes and ignores a stale preview',async()=>{
 let resolve;state.post.mockImplementationOnce(()=>new Promise(r=>resolve=r));
 wrapper=mount(Preview,{props:{agencyId:463,candidateUserId:9}});await wrapper.get('button').trigger('click');
 await wrapper.setProps({candidateUserId:10});
 resolve({data:{data:{from:'verified@example.test',html:'<p>Wrong candidate preview</p>'}}});await flushPromises();
 expect(wrapper.find('iframe').exists()).toBe(false);expect(wrapper.emitted('availability').at(-1)).toEqual([false]);
});
