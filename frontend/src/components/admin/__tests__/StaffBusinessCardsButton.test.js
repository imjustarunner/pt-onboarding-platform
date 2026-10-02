import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import StaffBusinessCardsButton from '../StaffBusinessCardsButton.vue';
const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
beforeEach(() => vi.clearAllMocks());
describe('staff card entry points', () => {
 it('loads real memberships and scopes admin printing to the employee profile', async () => {
  api.get.mockResolvedValue({data:[{id:2,name:'ITSCO'},{id:6,name:'Next Level Up'}]});
  const wrapper=shallowMount(StaffBusinessCardsButton,{props:{userId:538,agencyId:6}});
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/users/538/business-card-agencies');
  expect(wrapper.getComponent({name:'BusinessCardsDialog'}).props()).toMatchObject({targetUserId:538,initialAgencyId:6,selfOnly:false});
 });
 it('uses self-only mode and falls back only to a returned membership', async () => {
  api.get.mockResolvedValue({data:[{id:2,name:'ITSCO'}]});
  const wrapper=shallowMount(StaffBusinessCardsButton,{props:{userId:501,agencyId:999,selfOnly:true}});
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(wrapper.getComponent({name:'BusinessCardsDialog'}).props()).toMatchObject({targetUserId:null,initialAgencyId:2,selfOnly:true});
 });
 it('does not fall back to global tenant access when membership loading fails', async () => {
  api.get.mockRejectedValue(new Error('Offline'));
  const wrapper=shallowMount(StaffBusinessCardsButton,{props:{userId:501,selfOnly:true}});
  await wrapper.get('button').trigger('click'); await flushPromises();
  expect(wrapper.findComponent({name:'BusinessCardsDialog'}).exists()).toBe(false);
  expect(wrapper.get('[role="alert"]').text()).toContain('Could not load');
 });
});
