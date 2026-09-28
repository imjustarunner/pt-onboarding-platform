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

it('shows a photo, readable Thursday opening, and direct preference action',async()=>{
 const result={filters:{dateFrom:'2030-01-03',dateTo:'2030-01-03',exactTime:'07:00',modality:'ALL'},timeZone:'America/Denver',providers:[{providerId:9,name:'Jacquelyne Fernandez',profilePhotoUrl:'/uploads/jacque.jpg',slots:[{startAt:'2030-01-03T14:00:00Z',endAt:'2030-01-03T15:00:00Z',frequency:'WEEKLY',format:'VIRTUAL'}],totalSlots:1}],failedProviderIds:[10],checkedAt:'2030-01-01T15:00:00Z'};
 api.post.mockResolvedValue({data:{assistantText:'raw fallback',toolResults:[{ok:true,tool:'findProviderAvailability',result}]}});
 const w=mount(Search,{props:{agencyId:2,providers:[{id:10,first_name:'Pending',last_name:'Provider'}]}});await w.find('input').setValue('Who has availability Thursdays at 7 AM?');await w.find('form').trigger('submit');await flushPromises();expect(w.text()).toContain('Thursday, Jan 3 at 7:00 AM');expect(w.find('.match-person img').attributes('src')).toBe('/uploads/jacque.jpg');expect(w.text()).not.toContain('raw fallback');expect(w.find('.verification summary').text()).toContain('1 providers need a calendar check');await w.find('.match-actions .text-button').trigger('click');expect(w.emitted('manage')[0][0]).toEqual({providerId:9,tab:'preferences'});
});
