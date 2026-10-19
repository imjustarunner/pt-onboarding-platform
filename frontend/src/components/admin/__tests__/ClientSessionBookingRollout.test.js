import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClientSessionBookingRollout from '../ClientSessionBookingRollout.vue';
const api=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
const data={policy:{revision:2,entries:[{providerUserId:2,enabled:true}]},providers:[{id:1,name:'Ryn Test'},{id:2,name:'Other Provider'}]};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data});api.put.mockResolvedValue({data:{policy:{revision:3,entries:[...data.policy.entries,{providerUserId:1,enabled:true}]}}});});
describe('provider booking rollout',()=>{
 it('loads the chosen agency with everyone else coming soon',async()=>{
  const w=mount(ClientSessionBookingRollout,{props:{agencyId:2}});await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/appointments/booking-rollout',{params:{agencyId:2}});
  expect(w.text()).toContain('1 enabled · 1 coming soon');expect(w.find('form button').attributes('disabled')).toBeDefined();w.unmount();
 });
 it('requires a reviewed selection and note then sends only selected IDs',async()=>{
  const w=mount(ClientSessionBookingRollout,{props:{agencyId:2}});await flushPromises();
  await w.find('.rollout-provider input').setValue(true);await w.find('textarea').setValue('October cohort ready');
  expect(w.find('form button').attributes('disabled')).toBeDefined();
  await w.find('.rollout-confirm input').setValue(true);await w.find('form').trigger('submit');await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/appointments/booking-rollout',expect.objectContaining({agencyId:2,providerUserIds:[1],enabled:true,transitionReviewed:true,revision:2}));expect(w.text()).toContain('Session booking enabled');w.unmount();
 });
 it('searches names and clears the cohort when changing agencies',async()=>{
  const w=mount(ClientSessionBookingRollout,{props:{agencyId:2}});await flushPromises();
  await w.find('input[type=search]').setValue('Ryn');expect(w.findAll('.rollout-provider')).toHaveLength(1);
  await w.find('.rollout-provider input').setValue(true);await w.setProps({agencyId:3});await flushPromises();
  expect(w.text()).toContain('0/10 selected');expect(api.get).toHaveBeenLastCalledWith('/appointments/booking-rollout',{params:{agencyId:3}});w.unmount();
 });
});
