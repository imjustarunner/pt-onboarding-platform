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
