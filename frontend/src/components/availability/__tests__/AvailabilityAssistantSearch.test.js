import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Search from '../AvailabilityAssistantSearch.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
beforeEach(()=>vi.resetAllMocks());
describe('staff availability matching',()=>{
 it('carries search constraints into a follow-up and clears them when the tenant changes',async()=>{
  api.post.mockResolvedValue({data:{assistantText:'Verified openings',availabilityQueries:['Who has availability Wednesday?']}});
  const w=mount(Search,{props:{agencyId:2}});await w.find('input').setValue('Who has availability Wednesday?');await w.find('form').trigger('submit');await flushPromises();
  await w.find('input').setValue('Who sees kids?');await w.find('form').trigger('submit');await flushPromises();
  expect(api.post.mock.calls[1][1].context).toMatchObject({agencyId:2,answerOnly:true,availabilityQueries:['Who has availability Wednesday?']});
  await w.setProps({agencyId:3});expect(w.find('.answer').exists()).toBe(false);w.unmount();
 });
 it('sends an explicitly selected client ID and does not schedule or assign a client',async()=>{
  api.get.mockResolvedValue({data:{items:[{id:123,initials:'AB'}]}});api.post.mockResolvedValue({data:{assistantText:'No verified matches'}});
  const w=mount(Search,{props:{agencyId:2}});await w.find('details input').setValue('AB');await w.find('details form').trigger('submit');await flushPromises();await w.findAll('button').find(b=>b.text()==='Find matching providers').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/agents/assist',expect.objectContaining({prompt:'Match client #123 preferences to provider availability',context:expect.objectContaining({answerOnly:true,agencyId:2})}),expect.anything());expect(api.post).toHaveBeenCalledTimes(1);w.unmount();
 });
});
